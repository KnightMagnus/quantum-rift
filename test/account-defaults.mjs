import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.mjs';
import { radioState } from '../server/radio-discovery.js';
// Exercise the shipped defaults, not the runner's empty SEEDS_FILE override.
delete process.env.SEEDS_FILE;
const dir = tempDataDir('rift-default-accounts-');
const game = refineryGame(new DB(dir));
assert.deepEqual(game.db.players, Object.create(null), 'fresh startup has no preset accounts');
assert.deepEqual(game.db.world.sites, {}, 'no station hull reserved by a default account');
assert.equal(game.db.get('Knight'), null);
assert.deepEqual(radioState({ name: 'Knight', radioStations: [] }), ['wave-function-collapse']);
// Existing same-name accounts and credentials remain the player's data, not a reset target.
const session = refineryPilot(game, 'Knight');
session.data.credits = 12345;
session.data.station = { ...session.data.station, claimed: true, ops: 3, site: 'site-qgate' };
game.db.world.sites['site-qgate'] = 'knight';
game.db.touch();
game.db.flush();
const before = fs.readFileSync(game.db.file, 'utf8');
const restarted = refineryGame(new DB(dir));
assert.equal(fs.readFileSync(game.db.file, 'utf8'), before);
assert.equal(restarted.db.check(restarted.db.get('Knight'), 'fixture'), true);
assert.equal(restarted.db.check(restarted.db.get('Knight'), '1234'), false);
assert.equal(restarted.siteOwner('site-qgate').name, 'Knight');
// Explicit operator fixtures still work without shipping one to every player.
const seedFile = path.join(tempDataDir('rift-explicit-seeds-'), 'seeds.json');
fs.writeFileSync(
  seedFile,
  JSON.stringify([{ name: 'Fixture Captain', pass: 'fixture', credits: 45678 }]),
);
process.env.SEEDS_FILE = seedFile;
const explicit = refineryGame();
assert.equal(explicit.db.get('Fixture Captain').credits, 45678);
delete process.env.SEEDS_FILE;
for (const solo of [false, true]) {
  const data = tempDataDir('rift-default-server-');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, SOLO: solo ? '1' : '', PORT: String(port), DATA_DIR: data };
  delete env.SEEDS_FILE;
  const server = spawn(process.execPath, ['server/main.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = evidenceDir(solo ? 'default-solo' : 'default-online');
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
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
      fs.existsSync(playersFile) ? JSON.parse(fs.readFileSync(playersFile)) : {},
      {},
    );
  } finally {
    await cleanup(server, null, log, data);
  }
}
console.log(
  'PASS no built-in accounts online/Solo, no name privileges, existing saves preserved, explicit fixtures supported and online imports denied',
);
process.exit(0);
