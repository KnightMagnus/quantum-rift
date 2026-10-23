import { requiredFixtureValue } from './required.ts';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../../server/db.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import {
  refineryGame,
  refineryPilot,
  seed,
  quote,
  command,
  lots,
  refineryWorld as refineryWorld2,
} from './refinery-fixture.ts';
import { tempDataDir } from './temp-data.ts';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.ts';
import { type Browser } from 'playwright';
export { until } from './mining-fixture.ts';
interface RefineryFixtureOptions {
  /** Start server time midway through a job window while real elapsed time and timers continue. */
  stableJobWindow?: boolean;
}
export async function refineryFixture(name: string, options: RefineryFixtureOptions = {}) {
  const directory = tempDataDir('rift-refinery-play-'),
    output = evidenceDir(name),
    data = path.join(directory, 'data'),
    game = refineryGame(new Database(data)),
    port = Object.values(STELLARS).find(
      (player) =>
        player.system === 'meridian' &&
        player.svc?.includes('O') &&
        player.svc.includes('T') &&
        !player.site,
    );
  for (const name of ['Refinery Alpha', 'Refinery Bravo']) {
    const session = refineryPilot(game, name);
    requiredFixtureValue(session).data.sys = requiredFixtureValue(port).system;
    requiredFixtureValue(session).data.stellar = requiredFixtureValue(port).id;
    requiredFixtureValue(session).data.tut = 999;
    requiredFixtureValue(session).data.story = { done: ['start'], active: null, step: 0 };
    requiredFixtureValue(session).data.fuel = 0;
    const weaponAsset = Object.values(game.A.weapons).find(
      (weapon) => weapon.launch && game.A.ships[weapon.launch],
    );
    requiredFixtureValue(session).data.ship.outfits = {};
    requiredFixtureValue(session).data.ship.fixed = [
      [9101, 1, 0],
      [requiredFixtureValue(weaponAsset).id, 1, 8],
    ];
    requiredFixtureValue(session).data.ship.ammo[requiredFixtureValue(weaponAsset).id] = 8;
    seed(requiredFixtureValue(session).data, {
      ore: lots(18, 3, 3),
      gas: lots(3),
      shards: lots(0, 0, 3),
      fuel_cells: lots(2),
    });
    if (name === 'Refinery Alpha') {
      command(game, session, { op: 'submit', id: quote(game, session, 'alloy', 6).id });
      command(game, session, {
        op: 'submit',
        id: quote(game, session, 'alloy', 3, 'common', 'stored').id,
      });
      const secondCaptain = requiredFixtureValue(
        requiredFixtureValue(refineryWorld2(game)).batches.at(-1),
      );
      secondCaptain.readyAt = Date.now() - 1000;
      secondCaptain.startAt = secondCaptain.readyAt - secondCaptain.quote.duration;
      secondCaptain.submittedAt = secondCaptain.startAt - 30000;
      requiredFixtureValue(session).data.cargo.food =
        requiredFixtureValue(game.features.shipStats.stats(session.data)).cargo -
        game.holdUsed(requiredFixtureValue(session).data) -
        1;
      requiredFixtureValue(game.db.world.miningPressure).captains.push({
        owner: game.db.key(name),
        sys: 'meridian',
        noise: 90,
        updated: 0,
        lastEncounter: -300,
        warned: true,
      });
    }
  }
  game.db.touch();
  game.db.flush();
  const telemetry = path.join(output, 'telemetry.json'),
    preload = path.join(root, 'test/fixtures/refinery-preload.ts');

  // Keep this UI scenario within one offer window without freezing elapsed time or timers.
  // The normal board regenerates IDs every ten minutes, including during acceptance.
  const serverImports: string[] = [];
  if (options.stableJobWindow) {
    const clockPreload = path.join(directory, 'job-window-clock.mjs');
    fileSystem.writeFileSync(
      clockPreload,
      `
      const nativeNow = Date.now;
      const started = nativeNow();
      const midpoint = Math.floor(started / 600000) * 600000 + 300000;
      Date.now = () => midpoint + nativeNow() - started;
    `,
    );
    serverImports.push('--import', clockPreload);
  }
  const portNumber = await availablePort(),
    origin = `http://127.0.0.1:${portNumber}`,
    server = spawn(
      process.execPath,
      [
        ...serverImports,
        '--import',
        './test/seed-random.ts',
        '--import',
        preload,
        'server/local-main.ts',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          QUANTUM_FIXTURE_TELEMETRY: telemetry,
          SOLO: '',
          PORT: String(portNumber),
          DATA_DIR: data,
          SEEDS_FILE: '/nonexistent',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
    serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  await ready(server, origin);
  return {
    dir: directory,
    out: output,
    origin,
    server,
    port: requiredFixtureValue(port).id,
    read() {
      try {
        return JSON.parse(fileSystem.readFileSync(telemetry, 'utf8'));
      } catch {
        return null;
      }
    },
    async close(browser: Browser | undefined) {
      await cleanup(server, browser, serverLog, directory);
    },
  };
}
