// Real checkpoint interruption, not a mocked persistence callback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DB } from '../server/db.ts';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  w,
} from './helpers/refinery-fixture.js';
const originalNow = Date.now;
let time = 1800000000000;
Date.now = () => time;
try {
  for (const point of [
    'before-journal',
    'after-journal',
    'between-snapshots',
    'after-both',
    'final-sync',
  ]) {
    const g = refineryGame(),
      s = refineryPilot(
        g,
        `Crash${['before-journal', 'after-journal', 'between-snapshots', 'after-both', 'final-sync'].indexOf(point)}`,
      );
    seed(s.data, { ore: lots(6) });
    g.db.touch();
    g.db.flush();
    const q = quote(g, s, 'alloy', 3, 'common', 'stored'),
      oldCredits = s.data.credits;
    const rename = fs.renameSync,
      unlink = fs.unlinkSync,
      write = g.db.writeDurable,
      sync = g.db.syncDirectory;
    let syncs = 0;
    let injected = false;
    try {
      g.db.syncDirectory = function () {
        if (point === 'final-sync' && ++syncs === 3) {
          injected = true;
          throw Error('fault after journal unlink');
        }
        return sync.call(this);
      };
      if (point === 'before-journal')
        g.db.writeDurable = function (file, text) {
          if (file === this.journal + '.tmp') {
            injected = true;
            throw Error('fault before commit');
          }
          return write.call(this, file, text);
        };
      fs.renameSync = (from, to) => {
        if (point === 'between-snapshots' && to === g.db.wfile) {
          injected = true;
          throw Error('fault between snapshots');
        }
        const r = rename(from, to);
        if (point === 'after-journal' && to === g.db.journal) {
          injected = true;
          throw Error('fault after commit');
        }
        return r;
      };
      fs.unlinkSync = (file) => {
        if (point === 'after-both' && file === g.db.journal) {
          injected = true;
          throw Error('fault after both snapshots');
        }
        return unlink(file);
      };
      command(g, s, { op: 'submit', id: q.id });
    } finally {
      fs.renameSync = rename;
      fs.unlinkSync = unlink;
      g.db.writeDurable = write;
      g.db.syncDirectory = sync;
    }
    assert.ok(injected);
    assert.equal(g.db.economicFrozen, point !== 'before-journal', point);
    assert.equal(
      s.data.cargo.ore,
      point === 'before-journal' ? 6 : 3,
      'memory matches committed outcome',
    );
    if (point !== 'before-journal') {
      const beforeRetry = JSON.stringify(s.data);
      command(g, s, { op: 'submit', id: q.id });
      assert.equal(JSON.stringify(s.data), beforeRetry, 'frozen retry cannot mutate');
      if (point === 'final-sync') assert.throws(() => g.db.flush(), /recover/i);
    }
    const reopened = refineryGame(new DB(g.db.dir)),
      p = refineryPilot(reopened, s.data.name),
      debit = point === 'before-journal' ? 0 : 3;
    assert.equal(p.data.cargo.ore, 6 - debit);
    assert.equal(p.data.credits, oldCredits - (debit ? q.fee : 0));
    assert.equal(w(reopened).batches.length, debit ? 1 : 0);
    command(reopened, p, { op: 'submit', id: q.id });
    assert.equal(p.data.cargo.ore, 3);
    assert.equal(w(reopened).batches.length, 1);
    assert.equal(w(reopened).operations.filter((x) => x.kind === 'submit').length, 1);
    // Offline maturity and partial claims survive clean restart; repeated receipts cannot debit again.
    const batch = w(reopened).batches[0];
    time = batch.readyAt + 1;
    reopened.features.refinery.payload(p);
    assert.equal(w(reopened).ready[0].units, 255);
    reopened.db.touch();
    reopened.db.flush();
    const final = refineryGame(new DB(reopened.db.dir)),
      f = refineryPilot(final, p.data.name);
    final.features.refinery.payload(f);
    assert.equal(w(final).ready[0].units, 255);
    command(final, f, { op: 'submit', id: q.id });
    assert.equal(f.data.cargo.ore, 3);
  }
  // A committed maturity checkpoint interrupted between snapshots credits the pool once.
  {
    const g = refineryGame(),
      s = refineryPilot(g, 'Maturity Crash');
    seed(s.data, { ore: lots(6) });
    command(g, s, { op: 'submit', id: quote(g, s, 'alloy', 6, 'common', 'stored').id });
    time = w(g).batches[0].readyAt + 1;
    const rename = fs.renameSync;
    try {
      fs.renameSync = (from, to) => {
        if (to === g.db.wfile) throw Error('maturity checkpoint fault');
        return rename(from, to);
      };
      assert.throws(() => g.features.refinery.payload(s), /maturity checkpoint/);
    } finally {
      fs.renameSync = rename;
    }
    const next = refineryGame(new DB(g.db.dir)),
      p = refineryPilot(next, s.data.name);
    assert.equal(w(next).ready[0].units, 510);
    command(next, p, { op: 'claim', recipe: 'alloy' });
    assert.equal(p.data.cargo.alloy_ingots, 1);
    assert.equal(w(next).ready[0].units, 210);
    command(next, p, { op: 'claim', recipe: 'alloy' });
    assert.equal(p.data.cargo.alloy_ingots, 1);
  }
  // Every settlement family uses the real checkpoint, including partial claims/returns.
  for (const op of ['cancel', 'returns', 'claim', 'deliver']) {
    for (const boundary of ['before-journal', 'between-snapshots', 'final-sync']) {
      const g = refineryGame(),
        s = refineryPilot(g, `Set ${op} ${boundary.slice(0, 3)}`);
      seed(s.data, { ore: lots(6) });
      let request;
      if (op === 'deliver') {
        const offer = g.features.refinery.payload(s).offers.find((o) => o.grade === 'common');
        command(g, s, { op: 'accept', id: offer.id, port: offer.port }, true);
        seed(s.data, { [offer.cid]: lots(offer.qty) });
        request = { op, id: offer.id, port: offer.port };
      } else {
        const q = quote(g, s, 'alloy', 6, 'common', 'stored');
        command(g, s, { op: 'submit', id: q.id });
        const batch = w(g).batches.at(-1);
        if (op === 'returns') command(g, s, { op: 'cancel', id: batch.id });
        if (op === 'claim') {
          time = batch.readyAt + 1;
          g.features.refinery.payload(s);
        }
        request =
          op === 'claim'
            ? { op, recipe: 'alloy' }
            : { op, id: batch.id, ...(op === 'returns' ? { port: batch.port } : {}) };
      }
      g.db.touch();
      g.db.flush();
      const oldCredits = s.data.credits;
      const rename = fs.renameSync,
        write = g.db.writeDurable,
        sync = g.db.syncDirectory;
      let injected = false,
        syncs = 0;
      try {
        g.db.writeDurable = function (file, text) {
          if (boundary === 'before-journal' && file === this.journal + '.tmp') {
            injected = true;
            throw Error('settlement before journal');
          }
          return write.call(this, file, text);
        };
        fs.renameSync = (from, to) => {
          if (boundary === 'between-snapshots' && to === g.db.wfile) {
            injected = true;
            throw Error('settlement between snapshots');
          }
          return rename(from, to);
        };
        g.db.syncDirectory = function () {
          if (boundary === 'final-sync' && ++syncs === 3) {
            injected = true;
            throw Error('settlement final sync');
          }
          return sync.call(this);
        };
        command(g, s, request, op === 'deliver');
      } finally {
        fs.renameSync = rename;
        g.db.writeDurable = write;
        g.db.syncDirectory = sync;
      }
      assert.ok(injected, `${op}/${boundary} reached persistence`);
      assert.equal(g.db.economicFrozen, boundary !== 'before-journal');
      const next = refineryGame(new DB(g.db.dir)),
        p = refineryPilot(next, s.data.name);
      command(next, p, request, op === 'deliver');
      const settled = JSON.stringify({
        cargo: p.data.cargo,
        credits: p.data.credits,
        world: w(next),
      });
      command(next, p, request, op === 'deliver');
      assert.equal(
        JSON.stringify({ cargo: p.data.cargo, credits: p.data.credits, world: w(next) }),
        settled,
        `${op} retry settles once`,
      );
      if (op === 'claim') {
        assert.equal(p.data.cargo.alloy_ingots, 1);
        assert.equal(w(next).ready[0].units, 210, 'partial final entitlement persists');
      } else if (op === 'returns') assert.equal(p.data.cargo.ore, 6);
      else if (op === 'cancel') {
        const batch = w(next).batches[0];
        assert.equal(batch.status, 'cancelled');
        assert.equal(p.data.credits, oldCredits + batch.quote.fee - batch.quote.cancelFee);
        assert.equal(batch.returns[0].lots.common, 6);
      } else {
        assert.equal(p.data.cargo.ore, 0);
        assert.equal(w(next).orders[0].status, 'delivered');
        assert.equal(p.data.credits, oldCredits + w(next).orders[0].reward);
      }
    }
  }
  console.log('ALL REFINERY CHECKPOINT / OFFLINE / IDEMPOTENT RETRY TESTS PASSED');
} finally {
  Date.now = originalNow;
}
