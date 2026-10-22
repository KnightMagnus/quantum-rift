import { requiredFixtureValue } from './required.ts';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../../server/db.ts';
import { makeLoadout } from '../../shared/rules.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.ts';
import { tempDataDir } from './temp-data.ts';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.ts';
import { type Browser } from 'playwright';
export { until } from './mining-fixture.ts';
export async function towingFixture(name: string) {
  const directory = tempDataDir('rift-towing-play-'),
    output = evidenceDir(name),
    data = path.join(directory, 'data'),
    game = refineryGame(new Database(data));
  const player = Object.values(STELLARS).find(
    (horizontalPosition) =>
      horizontalPosition.system === 'meridian' &&
      horizontalPosition.svc.includes('L') &&
      !horizontalPosition.site &&
      !horizontalPosition.outlaw,
  );
  for (const [name, hull] of [
    ['Tow Alpha', 815],
    ['Tow Bravo', 704],
  ] as const) {
    const session = refineryPilot(game, name);
    requiredFixtureValue(session).data.ship = makeLoadout(game.A, hull);
    if (hull !== 815) requiredFixtureValue(session).data.ship.outfits[9920] = 1;
    const weaponAsset = Object.values(game.A.weapons).find(
      (weapon) => weapon.launch && game.A.ships[weapon.launch],
    );
    requiredFixtureValue(session).data.ship.fixed.push([
      requiredFixtureValue(weaponAsset).id,
      1,
      8,
    ]);
    requiredFixtureValue(session).data.ship.ammo[requiredFixtureValue(weaponAsset).id] = 8;
    requiredFixtureValue(session).data.sys = 'meridian';
    requiredFixtureValue(session).data.stellar = requiredFixtureValue(player).id;
    requiredFixtureValue(session).data.story = { done: ['start'], active: null, step: 0 };
    requiredFixtureValue(session).data.tut = 999;
    requiredFixtureValue(session).data.fuel = 0;
    seed(requiredFixtureValue(session).data, {
      food: lots(requiredFixtureValue(game.features.shipStats.stats(session.data)).cargo - 10),
    });
  }
  game.db.touch();
  game.db.flush();
  const preload = path.join(root, 'test/fixtures/towing-preload.ts'),
    telemetry = path.join(output, 'telemetry.json');

  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.ts', '--import', preload, 'server/main.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          QUANTUM_FIXTURE_TELEMETRY: telemetry,
          PORT: String(port),
          SOLO: '',
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
