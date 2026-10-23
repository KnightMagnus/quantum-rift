import { mockPlayerData } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';
import { radioState } from '../server/radio-discovery.ts';
// Exercise the shipped defaults, not the runner's empty SEEDS_FILE override.
delete process.env.SEEDS_FILE;
const directory = tempDataDir('rift-default-accounts-');
const game = refineryGame(new Database(directory));
assert.deepEqual(game.db.players, Object.create(null), 'fresh startup has no preset accounts');
assert.deepEqual(game.db.world.sites, {}, 'no station hull reserved by a default account');
assert.equal(game.db.get('Knight'), null);
assert.deepEqual(radioState(mockPlayerData({ name: 'Knight', radioStations: [] })), [
  'wave-function-collapse',
]);
// Existing same-name accounts and credentials remain the player's data, not a reset target.
const session = refineryPilot(game, 'Knight');
requiredFixtureValue(session).data.credits = 12345;
requiredFixtureValue(session).data.station = {
  ...requiredFixtureValue(session).data.station,
  claimed: true,
  ops: 3,
  site: 'site-qgate',
};
game.db.world.sites['site-qgate'] = 'knight';
game.db.touch();
game.db.flush();
const before = filesystem.readFileSync(game.db.file, 'utf8');
const restarted = refineryGame(new Database(directory));
assert.equal(filesystem.readFileSync(game.db.file, 'utf8'), before);
assert.equal(restarted.db.check(requiredFixtureValue(restarted.db.get('Knight')), 'fixture'), true);
assert.equal(restarted.db.check(requiredFixtureValue(restarted.db.get('Knight')), '1234'), false);
assert.equal(requiredFixtureValue(restarted.siteOwner('site-qgate')).name, 'Knight');
// Explicit operator fixtures still work without shipping one to every player.
const seedFile = path.join(tempDataDir('rift-explicit-seeds-'), 'seeds.json');
filesystem.writeFileSync(
  seedFile,
  JSON.stringify([{ name: 'Fixture Captain', pass: 'fixture', credits: 45678 }]),
);
process.env.SEEDS_FILE = seedFile;
const explicit = refineryGame();
assert.equal(requiredFixtureValue(explicit.db.get('Fixture Captain')).credits, 45678);
delete process.env.SEEDS_FILE;
for (const solo of [false, true]) {
  const data = tempDataDir('rift-default-server-');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    SOLO: solo ? '1' : '',
    PORT: String(port),
    DATA_DIR: data,
  };
  delete environment.SEEDS_FILE;
  const server = spawn(process.execPath, ['server/main.ts'], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = evidenceDir(solo ? 'default-solo' : 'default-online');
  const logStream = filesystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
  try {
    await ready(server, origin);
    const status = await (await fetch(origin + '/api/status')).json();
    if (solo) assert.deepEqual(status.slots, []);
    else {
      assert.equal(
        (await fetch(origin + '/api/import', { method: 'POST', body: '{}' })).status,
        404,
      );
      assert.equal((await fetch(origin + '/api/export?name=Knight')).status, 404);
    }
    const playersFile = path.join(data, 'players.json');
    assert.deepEqual(
      filesystem.existsSync(playersFile)
        ? JSON.parse(filesystem.readFileSync(playersFile, 'utf8'))
        : {},
      {},
    );
  } finally {
    await cleanup(server, null, logStream, data);
  }
}
console.log(
  'PASS no built-in accounts online/Solo, no name privileges, existing saves preserved, explicit fixtures supported and online imports denied',
);
process.exit(0);
