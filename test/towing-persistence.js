import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DB } from '../server/db.ts';
import { tug, attach, command, atPort, refineryGame } from './helpers/towing-fixture.js';
import { refineryPilot } from './helpers/refinery-fixture.js';
for (const point of ['before-journal', 'after-journal', 'between-snapshots', 'final-sync']) {
  const f = tug(),
    { g, s } = f;
  attach(f);
  const p = atPort(f),
    id = f.o.id;
  g.db.touch();
  g.db.flush();
  const rename = fs.renameSync,
    write = g.db.writeDurable,
    sync = g.db.syncDirectory;
  let injected = false,
    n = 0;
  try {
    g.db.writeDurable = function (file, text) {
      if (point === 'before-journal' && file === this.journal + '.tmp') {
        injected = true;
        throw Error('before commit');
      }
      return write.call(this, file, text);
    };
    g.db.syncDirectory = function () {
      if (point === 'final-sync' && ++n === 3) {
        injected = true;
        throw Error('after unlink');
      }
      return sync.call(this);
    };
    fs.renameSync = (a, b) => {
      if (point === 'between-snapshots' && b === g.db.wfile) {
        injected = true;
        throw Error('between');
      }
      const result = rename(a, b);
      if (point === 'after-journal' && b === g.db.journal) {
        injected = true;
        throw Error('committed');
      }
      return result;
    };
    assert.equal(command(f, 'deliver', { port: p.id }), false);
  } finally {
    fs.renameSync = rename;
    g.db.writeDurable = write;
    g.db.syncDirectory = sync;
  }
  assert.ok(injected, point);
  const committed = point !== 'before-journal';
  assert.equal(g.db.economicFrozen, committed);
  assert.equal(s.data.cargo.ore || 0, committed ? 24 : 0, 'memory follows commit outcome');
  const old = JSON.stringify(g.db.world.towing);
  if (committed) {
    assert.equal(command(f, 'detach'), false);
    assert.equal(JSON.stringify(g.db.world.towing), old);
  }
  const reopen = refineryGame(new DB(g.db.dir)),
    r = refineryPilot(reopen, s.data.name),
    o = reopen.db.world.towing.slots.find((x) => x.object?.id === id).object;
  assert.equal(r.data.cargo.ore || 0, committed ? 24 : 0);
  assert.equal(o.status, committed ? 'delivered' : 'detached');
  if (committed) {
    assert.equal(
      reopen.features.towing.command(r, { op: 'deliver', id, revision: 1, port: p.id }),
      true,
    );
    assert.equal(r.data.cargo.ore, 24);
    assert.equal(reopen.db.world.towing.receipts.filter((x) => x.id === id).length, 1);
  }
}
// Disconnect records the original world coordinates before captain relocation; restart is not a grace refresh.
{
  const f = tug();
  attach(f);
  const { g, s, o } = f,
    xy = [o.x, o.y],
    clock = g.db.world.mining.clock;
  g.disconnect(s);
  assert.equal(o.status, 'detached');
  assert.deepEqual([o.x, o.y], xy);
  assert.equal(o.graceUntil, clock + 300);
  g.db.touch();
  g.db.flush();
  const next = refineryGame(new DB(g.db.dir)),
    load = next.db.world.towing.slots.find((x) => x.object?.id === o.id).object;
  assert.deepEqual([load.x, load.y], xy);
  assert.equal(load.graceUntil, o.graceUntil);
}
// Fail closed on persisted authority and impossible mass/receipt/schema variants.
for (const corrupt of [
  (w) => (w.version = 2),
  (w) => (w.nextId = 1),
  (w) => (w.slots[0].object.mass = 999),
  (w) => (w.slots[0].object.lots.pure = 999),
  (w) => (w.slots[0].object.owner = 'MIXED'),
  (w) => w.slots[0].issued++,
  (w) => (w.slots[0].object.x = Infinity),
  (w) => w.slots.push(structuredClone(w.slots[0])),
]) {
  const f = tug();
  corrupt(f.g.db.world.towing);
  assert.throws(() => f.g.features.towing.init());
}
console.log(
  'Tow real journal pre/post commit and final-unlink recovery, freeze/replay once, disconnect location/grace persistence, malformed version/authority/conservation rejection.',
);
