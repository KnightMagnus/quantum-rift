import { requiredFixtureValue } from './required.ts';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../../server/db.ts';
import { Game } from '../../server/game.ts';
import { augmentAssets } from '../../shared/rules.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { BUILD } from '../../shared/specialty.ts';
import { tempDataDir } from './temp-data.ts';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.ts';
import { type Browser } from 'playwright';
export { until } from './mining-fixture.ts';
export async function dredgeFixture(name: string) {
  const directory = tempDataDir('rift-dredge-play-'),
    output = evidenceDir(name),
    data = path.join(directory, 'data'),
    database = new Database(data),
    assets = augmentAssets(
      JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
    );
  const weaponAsset = Object.values(assets.weapons).find(
    (weapon) => weapon.launch && assets.ships[weapon.launch],
  );
  const home = Object.values(STELLARS).find(
    (player) => player.site && player.system === 'meridian',
  );
  for (const name of ['Dredge Alpha', 'Dredge Bravo']) {
    const playerData = {
      ...Game.prototype.fresh.call({ A: assets }),
      story: { done: ['start'], active: null, step: 0 },
      bp: {} as Record<number, number>,
    };
    playerData.tut = 999;
    playerData.story = { done: ['start'], active: null, step: 0 };
    playerData.sys = 'meridian';
    playerData.credits = 1e8;
    if (name === 'Dredge Alpha') {
      playerData.stellar = requiredFixtureValue(home).id;
      playerData.station.site = requiredFixtureValue(home).id;
      playerData.station.ops = BUILD.ops;
      database.world.sites[requiredFixtureValue(home).id] = name;
      playerData.bp = { 815: 40 };
      for (const [captainId, game, quantity] of BUILD.mats) {
        playerData.mats[captainId] ??= [0, 0, 0, 0, 0];
        playerData.mats[captainId][game] = quantity;
      }
    } else
      playerData.stellar = requiredFixtureValue(
        Object.values(STELLARS).find(
          (player2) => player2.system === 'meridian' && !player2.site && player2.svc.includes('L'),
        ),
      ).id;
    database.create(name, 'fixture', playerData);
  }
  database.flush();
  const preload = path.join(root, 'test/fixtures/dredge-preload.ts'),
    telemetry = path.join(output, 'telemetry.json');

  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.ts', '--import', preload, 'server/local-main.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          QUANTUM_FIXTURE_TELEMETRY: telemetry,
          QUANTUM_FIXTURE_BAY_ID: String(requiredFixtureValue(weaponAsset).id),
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
