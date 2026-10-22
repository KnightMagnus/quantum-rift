import { requiredFixtureValue } from './required.ts';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../../server/db.ts';
import { Game } from '../../server/game.ts';
import { augmentAssets, makeLoadout, shipStats } from '../../shared/rules.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { tempDataDir } from './temp-data.ts';
import { root, availablePort, evidenceDir, ready, cleanup, delay } from './browser-fixture.ts';
import { type Browser } from 'playwright';
export async function until<Value>(
  callback: () => Value | Promise<Value>,
  label: string,
  milliseconds = 15000,
) {
  const deadlineTimestamp = Date.now() + milliseconds;
  while (Date.now() < deadlineTimestamp) {
    const value = await callback();
    if (value) return value;
    await delay(40);
  }
  throw Error(label);
}
export async function miningFixture(name: string) {
  const directory = tempDataDir('rift-mining-play-'),
    output = evidenceDir(name),
    data = path.join(directory, 'data'),
    assets = augmentAssets(
      JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
    );
  const database = new Database(data);
  const portDef = Object.values(STELLARS).find(
    (player) => player.system === 'meridian' && !player.site && player.svc?.includes('L'),
  );
  const weaponAsset = Object.values(assets.weapons).find(
    (weapon) => weapon.launch && assets.ships[weapon.launch],
  );
  for (const name of ['Mining Alpha', 'Mining Bravo']) {
    const playerData = {
      ...Game.prototype.fresh.call({ A: assets }),
      story: { done: ['start'], active: null, step: 0 },
    };
    playerData.tut = 999;
    playerData.story = { done: ['start'], active: null, step: 0 };
    playerData.sys = 'meridian';
    playerData.stellar = requiredFixtureValue(portDef).id;
    playerData.ship = makeLoadout(assets, 704, name);
    playerData.ship.outfits = {};
    playerData.ship.fixed = [
      [9102, 1, 0],
      [requiredFixtureValue(weaponAsset).id, 1, 8],
    ];
    playerData.ship.ammo[requiredFixtureValue(weaponAsset).id] = 8;
    if (name === 'Mining Alpha' && output.endsWith('mining-ui'))
      playerData.cargo.food = requiredFixtureValue(shipStats(assets, playerData.ship)).cargo - 1;
    database.create(name, 'fixture', playerData);
  }
  database.flush();
  const telemetry = path.join(output, 'telemetry.json'),
    fixture = path.join(root, 'test/fixtures/mining-preload.ts');

  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.ts', '--import', fixture, 'server/main.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          QUANTUM_FIXTURE_TELEMETRY: telemetry,
          SOLO: '',
          PORT: String(port),
          DATA_DIR: data,
          SEEDS_FILE: '/nonexistent',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  await ready(server, origin);
  return {
    dir: directory,
    out: output,
    origin,
    server,
    telemetry,
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
