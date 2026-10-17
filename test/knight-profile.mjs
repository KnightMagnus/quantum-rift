// Shipped test profile: actual startup, login, ship storage and non-destructive restarts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SPEC } from '../shared/specialty.js';
import { RESEARCH } from '../shared/galaxy.js';
import { SITES } from '../shared/galaxy.js';
import { tempDataDir } from './helpers/temp-data.js';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.mjs';

// Intentionally override the runner's /nonexistent seed file: exercise the shipped default.
delete process.env.SEEDS_FILE;
const assets = () => JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
const boot = (dir) => new Game(assets(), new DB(dir));
const dir = tempDataDir('rift-knight-');
const g = boot(dir);
const p = g.db.get('knight');
const hulls = Object.values(SPEC)
  .map((s) => s.id)
  .sort((a, b) => a - b);
assert.ok(p, 'default startup creates the KNIGHT test login');
assert.equal(g.db.check(p, '1234'), true);
assert.equal(g.db.check(p, 'not-the-password'), false);
assert.equal(p.credits, 30_000_000, 'legacy starting money is preserved');
assert.equal(p.ship.hull, 736);
assert.equal(p.ship.name, 'Excalibur');
assert.equal(p.station.ops, 5);
assert.equal(p.station.claimed, true);
assert.deepEqual(
  p.station.done,
  RESEARCH.map((r) => r.id),
);
assert.equal(p.station.active, null);
assert.deepEqual(p.station.queue, []);
assert.equal(p.station.site, 'site-qgate');
assert.equal(g.siteOwner(p.station.site), p);
assert.equal(p.stellar, p.station.site, 'ready to access the completed station');
assert.deepEqual(
  p.dock.map((x) => x.ship.hull).sort((a, b) => a - b),
  hulls,
);
assert.ok(hulls.includes(815), 'Star Dredge is included, not just the old ten specialists');
assert.ok(p.dock.length <= g.features.hangar.dockSlots(p));
assert.equal(new Set([p.ship.uid, ...p.dock.map((x) => x.ship.uid)]).size, hulls.length + 1);
for (const { ship } of p.dock) {
  assert.ok(Object.keys(ship.outfits).length + ship.fixed.length, 'built ships have stock weapons');
  assert.deepEqual(p.specState[ship.hull], { tier: 1, comp: {} });
}

function client(game, name, pass) {
  const sock = new EventEmitter();
  Object.assign(sock, { open: true, backlog: 0, send() {}, close() {} });
  game.connect(sock, 'fixture-knight');
  const s = [...game.sessions.values()].at(-1);
  game.onMessage(s, { t: 'hello', name, pass });
  return s;
}
const s = client(g, 'Knight', '1234');
assert.equal(s.data, p, 'case-insensitive online login reaches the prebuilt profile');
// Every stored specialist can really be selected as Dock A's lead, without building it.
for (const id of hulls) {
  const stored = p.dock.find((x) => x.ship.hull === id);
  g.onMessage(s, { t: 'docks', op: 'assign', k: 0, slot: 'lead', uid: stored.ship.uid });
  assert.equal(p.ship.hull, id, 'stored specialist is usable through real dock action');
}
assert.equal(p.credits, 30_000_000, 'switching prebuilt ships spends no money');
// A captain can spend credits, move/sell ships and change station state; restart is not a reset.
p.credits = 12345;
p.dock.pop();
p.station.done = [];
p.station.ops = 3;
p.cargo = { food: 2 };
const ordinary = g.db.create('Ordinary Captain', 'private-pass', g.fresh());
ordinary.credits = 9876;
g.db.touch();
g.db.flush();
const before = JSON.parse(fs.readFileSync(g.db.file));
const restarted = boot(dir);
assert.deepEqual(
  restarted.db.get('KNIGHT'),
  before.knight,
  'existing KNIGHT progress is untouched',
);
assert.deepEqual(restarted.db.get('Ordinary Captain'), before['ordinary captain']);
assert.equal(restarted.db.check(restarted.db.get('Ordinary Captain'), 'private-pass'), true);
assert.equal(
  restarted.db.get('KNIGHT').dock.length,
  p.dock.length,
  'no duplicate or respawned ships',
);

// An independently-created same-name account keeps its credentials and ordinary progression.
process.env.SEEDS_FILE = '/nonexistent';
const collisionDir = tempDataDir('rift-knight-collision-');
const base = boot(collisionDir);
const collision = base.db.create('Knight', 'owner-password', base.fresh());
collision.credits = 555;
base.db.touch();
base.db.flush();
const collisionBefore = structuredClone(collision);
delete process.env.SEEDS_FILE;
const collisionBoot = boot(collisionDir);
assert.deepEqual(collisionBoot.db.get('Knight'), collisionBefore);
assert.equal(collisionBoot.db.check(collisionBoot.db.get('Knight'), '1234'), false);

// Existing station ownership is never stolen: use a different unclaimed hull.
process.env.SEEDS_FILE = '/nonexistent';
const occupiedDir = tempDataDir('rift-knight-occupied-');
const occupied = boot(occupiedDir);
const owner = occupied.db.create('Station Owner', 'owner-pass', occupied.fresh());
owner.station = { ...owner.station, claimed: true, ops: 4, site: 'site-qgate' };
occupied.db.world.sites['site-qgate'] = 'station owner';
occupied.db.touch();
occupied.db.flush();
delete process.env.SEEDS_FILE;
const fallback = boot(occupiedDir);
const alternate = fallback.db.get('KNIGHT');
assert.equal(fallback.siteOwner('site-qgate').name, 'Station Owner');
assert.notEqual(alternate.station.site, 'site-qgate');
assert.equal(fallback.siteOwner(alternate.station.site), alternate);
assert.equal(alternate.stellar, alternate.station.site);
assert.equal(alternate.sys, SITES.find((x) => x.id === alternate.station.site).system);
assert.equal(alternate.dock.length, hulls.length);
assert.equal(alternate.station.ops, 5);
// No free site means no half-created/broken test profile, and no owner is displaced.
process.env.SEEDS_FILE = '/nonexistent';
const fullDir = tempDataDir('rift-knight-full-');
const full = boot(fullDir);
const landlord = full.db.create('All Sites Owner', 'owner-pass', full.fresh());
for (const site of SITES) full.db.world.sites[site.id] = full.db.key(landlord.name);
full.db.touch();
full.db.flush();
delete process.env.SEEDS_FILE;
const noRoom = boot(fullDir);
assert.equal(noRoom.db.get('KNIGHT'), null);
assert.deepEqual(noRoom.db.world.sites, full.db.world.sites);
// Operators can opt out using the existing SEEDS_FILE override.
process.env.SEEDS_FILE = '/nonexistent';
assert.equal(boot(tempDataDir('rift-knight-optout-')).db.get('KNIGHT'), null);
delete process.env.SEEDS_FILE;

// Real server entrypoint, not just Game calls: both shipped launch modes use the profile.
for (const solo of [false, true]) {
  const scratch = tempDataDir('rift-knight-network-');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const out = evidenceDir(solo ? 'knight-solo' : 'knight-online');
  const env = { ...process.env, PORT: String(port), SOLO: solo ? '1' : '', DATA_DIR: scratch };
  delete env.SEEDS_FILE;
  const server = spawn(process.execPath, ['server/main.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let ws;
  try {
    await ready(server, origin);
    const status = await (await fetch(origin + '/api/status')).json();
    assert.equal(status.solo, solo);
    if (solo) assert.ok(status.slots.some((slot) => slot.name === 'KNIGHT' && slot.ops === 5));
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = await new Promise((resolve, reject) => {
      const seen = [];
      const timer = setTimeout(() => reject(Error('KNIGHT login timed out')), 5000);
      ws.addEventListener('open', () =>
        ws.send(
          JSON.stringify({
            t: 'hello',
            name: 'KNIGHT',
            pass: solo ? '' : '1234',
          }),
        ),
      );
      ws.addEventListener('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        seen.push(m);
        if (m.t === 'error') {
          clearTimeout(timer);
          reject(Error(m.msg));
        }
        if (m.t === 'landed') {
          clearTimeout(timer);
          resolve(seen);
        }
      });
    });
    assert.ok(messages.some((m) => m.t === 'welcome' && m.name === 'KNIGHT'));
    const you = messages.find((m) => m.t === 'you').d;
    assert.equal(you.credits, 30_000_000);
    assert.deepEqual(
      you.docks.stored.map((ship) => ship.hull).sort((a, b) => a - b),
      hulls,
    );
    assert.equal(you.station.ops, 5);
  } finally {
    ws?.close();
    await cleanup(server, null, log, scratch);
  }
}
console.log('KNIGHT profile startup/login/storage/preservation regressions passed.');
process.exit(0);
