import { requiredFixtureValue } from './helpers/required.ts';
// Real checkpoint interruption, not a mocked persistence callback.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  refineryWorld,
} from './helpers/refinery-fixture.ts';
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
    const game = refineryGame(),
      session = refineryPilot(
        game,
        `Crash${['before-journal', 'after-journal', 'between-snapshots', 'after-both', 'final-sync'].indexOf(point)}`,
      );
    seed(requiredFixtureValue(session).data, { ore: lots(6) });
    game.db.touch();
    game.db.flush();
    const refineryQuote = quote(game, session, 'alloy', 3, 'common', 'stored'),
      oldCredits = requiredFixtureValue(session).data.credits;
    const rename = filesystem.renameSync,
      unlink = filesystem.unlinkSync,
      // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
      write = game.db.writeDurable,
      // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
      sync = game.db.syncDirectory;
    let syncs = 0;
    let injected = false;
    try {
      game.db.syncDirectory = function () {
        if (point === 'final-sync' && ++syncs === 3) {
          injected = true;
          throw Error('fault after journal unlink');
        }
        return sync.call(this);
      };
      if (point === 'before-journal')
        game.db.writeDurable = function (file, text) {
          if (file === this.journal + '.tmp') {
            injected = true;
            throw Error('fault before commit');
          }
          return write.call(this, file, text);
        };
      filesystem.renameSync = (from, destination) => {
        if (point === 'between-snapshots' && destination === game.db.wfile) {
          injected = true;
          throw Error('fault between snapshots');
        }
        const result = rename(from, destination);
        if (point === 'after-journal' && destination === game.db.journal) {
          injected = true;
          throw Error('fault after commit');
        }
        return result;
      };
      filesystem.unlinkSync = (file) => {
        if (point === 'after-both' && file === game.db.journal) {
          injected = true;
          throw Error('fault after both snapshots');
        }
        return unlink(file);
      };
      command(game, session, { op: 'submit', id: refineryQuote.id });
    } finally {
      filesystem.renameSync = rename;
      filesystem.unlinkSync = unlink;
      game.db.writeDurable = write;
      game.db.syncDirectory = sync;
    }
    assert.ok(injected);
    assert.equal(game.db.economicFrozen, point !== 'before-journal', point);
    assert.equal(
      requiredFixtureValue(session).data.cargo.ore,
      point === 'before-journal' ? 6 : 3,
      'memory matches committed outcome',
    );
    if (point !== 'before-journal') {
      const beforeRetry = JSON.stringify(requiredFixtureValue(session).data);
      command(game, session, { op: 'submit', id: refineryQuote.id });
      assert.equal(
        JSON.stringify(requiredFixtureValue(session).data),
        beforeRetry,
        'frozen retry cannot mutate',
      );
      if (point === 'final-sync') assert.throws(() => game.db.flush(), /recover/i);
    }
    const reopened = refineryGame(new Database(game.db.dir)),
      player = refineryPilot(reopened, requiredFixtureValue(session).data.name),
      debit = point === 'before-journal' ? 0 : 3;
    assert.equal(requiredFixtureValue(player).data.cargo.ore, 6 - debit);
    assert.equal(
      requiredFixtureValue(player).data.credits,
      oldCredits - (debit ? refineryQuote.fee : 0),
    );
    assert.equal(refineryWorld(reopened).batches.length, debit ? 1 : 0);
    command(reopened, player, { op: 'submit', id: refineryQuote.id });
    assert.equal(requiredFixtureValue(player).data.cargo.ore, 3);
    assert.equal(refineryWorld(reopened).batches.length, 1);
    assert.equal(
      refineryWorld(reopened).operations.filter(
        (entry: { kind: string }) => entry.kind === 'submit',
      ).length,
      1,
    );
    // Offline maturity and partial claims survive clean restart; repeated receipts cannot debit again.
    const batch = refineryWorld(reopened).batches[0];
    time = batch.readyAt + 1;
    reopened.features.refinery.payload(player);
    assert.equal(refineryWorld(reopened).ready[0].units, 255);
    reopened.db.touch();
    reopened.db.flush();
    const final = refineryGame(new Database(reopened.db.dir)),
      feature = refineryPilot(final, requiredFixtureValue(player).data.name);
    final.features.refinery.payload(feature);
    assert.equal(refineryWorld(final).ready[0].units, 255);
    command(final, feature, { op: 'submit', id: refineryQuote.id });
    assert.equal(requiredFixtureValue(feature).data.cargo.ore, 3);
  }
  // A committed maturity checkpoint interrupted between snapshots credits the pool once.
  {
    const game = refineryGame(),
      session = refineryPilot(game, 'Maturity Crash');
    seed(requiredFixtureValue(session).data, { ore: lots(6) });
    command(game, session, {
      op: 'submit',
      id: quote(game, session, 'alloy', 6, 'common', 'stored').id,
    });
    time = refineryWorld(game).batches[0].readyAt + 1;
    const rename = filesystem.renameSync;
    try {
      filesystem.renameSync = (from, destination) => {
        if (destination === game.db.wfile) throw Error('maturity checkpoint fault');
        return rename(from, destination);
      };
      assert.throws(() => game.features.refinery.payload(session), /maturity checkpoint/);
    } finally {
      filesystem.renameSync = rename;
    }
    const next = refineryGame(new Database(game.db.dir)),
      session3 = refineryPilot(next, requiredFixtureValue(session).data.name);
    assert.equal(refineryWorld(next).ready[0].units, 510);
    command(next, session3, { op: 'claim', recipe: 'alloy' });
    assert.equal(requiredFixtureValue(session3).data.cargo.alloy_ingots, 1);
    assert.equal(refineryWorld(next).ready[0].units, 210);
    command(next, session3, { op: 'claim', recipe: 'alloy' });
    assert.equal(requiredFixtureValue(session3).data.cargo.alloy_ingots, 1);
  }
  // Every settlement family uses the real checkpoint, including partial claims/returns.
  for (const operation of ['cancel', 'returns', 'claim', 'deliver']) {
    for (const boundary of ['before-journal', 'between-snapshots', 'final-sync']) {
      const game = refineryGame(),
        session = refineryPilot(game, `Set ${operation} ${boundary.slice(0, 3)}`);
      seed(requiredFixtureValue(session).data, { ore: lots(6) });
      let request;
      if (operation === 'deliver') {
        const offer = game.features.refinery
          .payload(session)
          .offers.find((options) => options.grade === 'common');
        command(
          game,
          session,
          {
            op: 'accept',
            id: requiredFixtureValue(offer).id,
            port: requiredFixtureValue(offer).port,
          },
          true,
        );
        seed(requiredFixtureValue(session).data, {
          [requiredFixtureValue(offer).cid]: lots(requiredFixtureValue(offer).qty),
        });
        request = {
          op: operation,
          id: requiredFixtureValue(offer).id,
          port: requiredFixtureValue(offer).port,
        };
      } else {
        const refineryQuote = quote(game, session, 'alloy', 6, 'common', 'stored');
        command(game, session, { op: 'submit', id: refineryQuote.id });
        const batch = refineryWorld(game).batches.at(-1);
        if (operation === 'returns')
          command(game, session, { op: 'cancel', id: requiredFixtureValue(batch).id });
        if (operation === 'claim') {
          time = requiredFixtureValue(batch).readyAt + 1;
          game.features.refinery.payload(session);
        }
        request =
          operation === 'claim'
            ? { op: operation, recipe: 'alloy' }
            : {
                op: operation,
                id: requiredFixtureValue(batch).id,
                ...(operation === 'returns' ? { port: requiredFixtureValue(batch).port } : {}),
              };
      }
      game.db.touch();
      game.db.flush();
      const oldCredits = requiredFixtureValue(session).data.credits;
      const rename = filesystem.renameSync,
        // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
        write = game.db.writeDurable,
        // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
        sync = game.db.syncDirectory;
      let injected = false,
        syncs = 0;
      try {
        game.db.writeDurable = function (file, text) {
          if (boundary === 'before-journal' && file === this.journal + '.tmp') {
            injected = true;
            throw Error('settlement before journal');
          }
          return write.call(this, file, text);
        };
        filesystem.renameSync = (from, destination) => {
          if (boundary === 'between-snapshots' && destination === game.db.wfile) {
            injected = true;
            throw Error('settlement between snapshots');
          }
          return rename(from, destination);
        };
        game.db.syncDirectory = function () {
          if (boundary === 'final-sync' && ++syncs === 3) {
            injected = true;
            throw Error('settlement final sync');
          }
          return sync.call(this);
        };
        command(game, session, request, operation === 'deliver');
      } finally {
        filesystem.renameSync = rename;
        game.db.writeDurable = write;
        game.db.syncDirectory = sync;
      }
      assert.ok(injected, `${operation}/${boundary} reached persistence`);
      assert.equal(game.db.economicFrozen, boundary !== 'before-journal');
      const next = refineryGame(new Database(game.db.dir)),
        session2 = refineryPilot(next, requiredFixtureValue(session).data.name);
      command(next, session2, request, operation === 'deliver');
      const settled = JSON.stringify({
        cargo: requiredFixtureValue(session2).data.cargo,
        credits: requiredFixtureValue(session2).data.credits,
        world: refineryWorld(next),
      });
      command(next, session2, request, operation === 'deliver');
      assert.equal(
        JSON.stringify({
          cargo: requiredFixtureValue(session2).data.cargo,
          credits: requiredFixtureValue(session2).data.credits,
          world: refineryWorld(next),
        }),
        settled,
        `${operation} retry settles once`,
      );
      if (operation === 'claim') {
        assert.equal(requiredFixtureValue(session2).data.cargo.alloy_ingots, 1);
        assert.equal(refineryWorld(next).ready[0].units, 210, 'partial final entitlement persists');
      } else if (operation === 'returns')
        assert.equal(requiredFixtureValue(session2).data.cargo.ore, 6);
      else if (operation === 'cancel') {
        const batch = refineryWorld(next).batches[0];
        assert.equal(batch.status, 'cancelled');
        assert.equal(
          requiredFixtureValue(session2).data.credits,
          oldCredits + batch.quote.fee - batch.quote.cancelFee,
        );
        assert.equal(batch.returns[0].lots.common, 6);
      } else {
        assert.equal(requiredFixtureValue(session2).data.cargo.ore, 0);
        assert.equal(refineryWorld(next).orders[0].status, 'delivered');
        assert.equal(
          requiredFixtureValue(session2).data.credits,
          oldCredits + refineryWorld(next).orders[0].reward,
        );
      }
    }
  }
  console.log('ALL REFINERY CHECKPOINT / OFFLINE / IDEMPOTENT RETRY TESTS PASSED');
} finally {
  Date.now = originalNow;
}
