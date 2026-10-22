import type { TowWorld } from '../server/towing-contracts.ts';
type OccupiedTowWorld = Omit<TowWorld, 'slots'> & {
  slots: (Omit<TowWorld['slots'][number], 'object'> & {
    object: NonNullable<TowWorld['slots'][number]['object']>;
  })[];
};
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import {
  tug as createTugFixture,
  attach,
  command,
  atPort,
  refineryGame,
} from './helpers/towing-fixture.ts';
import { refineryPilot } from './helpers/refinery-fixture.ts';
for (const point of ['before-journal', 'after-journal', 'between-snapshots', 'final-sync']) {
  const feature = createTugFixture(),
    { g: game, s: session } = feature;
  attach(feature);
  const player = atPort(feature),
    identifier = requiredFixtureValue(feature.o).id;
  game.db.touch();
  game.db.flush();
  const rename = filesystem.renameSync,
    // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
    write = game.db.writeDurable,
    // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
    sync = game.db.syncDirectory;
  let injected = false,
    quantity = 0;
  try {
    game.db.writeDurable = function (file, text) {
      if (point === 'before-journal' && file === this.journal + '.tmp') {
        injected = true;
        throw Error('before commit');
      }
      return write.call(this, file, text);
    };
    game.db.syncDirectory = function () {
      if (point === 'final-sync' && ++quantity === 3) {
        injected = true;
        throw Error('after unlink');
      }
      return sync.call(this);
    };
    filesystem.renameSync = (firstEntry, secondEntry) => {
      if (point === 'between-snapshots' && secondEntry === game.db.wfile) {
        injected = true;
        throw Error('between');
      }
      const result = rename(firstEntry, secondEntry);
      if (point === 'after-journal' && secondEntry === game.db.journal) {
        injected = true;
        throw Error('committed');
      }
      return result;
    };
    assert.equal(command(feature, 'deliver', { port: player.id }), false);
  } finally {
    filesystem.renameSync = rename;
    game.db.writeDurable = write;
    game.db.syncDirectory = sync;
  }
  assert.ok(injected, point);
  const committed = point !== 'before-journal';
  assert.equal(game.db.economicFrozen, committed);
  assert.equal(
    requiredFixtureValue(session).data.cargo.ore || 0,
    committed ? 24 : 0,
    'memory follows commit outcome',
  );
  const previousState = JSON.stringify(game.db.world.towing);
  if (committed) {
    assert.equal(command(feature, 'detach'), false);
    assert.equal(JSON.stringify(game.db.world.towing), previousState);
  }
  const reopen = refineryGame(new Database(game.db.dir)),
    session2 = refineryPilot(reopen, requiredFixtureValue(session).data.name),
    options = requiredFixtureValue(reopen.db.world.towing).slots.find(
      (entry) => entry.object?.id === identifier,
    )!.object;
  assert.equal(requiredFixtureValue(session2).data.cargo.ore || 0, committed ? 24 : 0);
  assert.equal(requiredFixtureValue(options).status, committed ? 'delivered' : 'detached');
  if (committed) {
    assert.equal(
      reopen.features.towing.command(session2, {
        op: 'deliver',
        id: identifier,
        revision: 1,
        port: player.id,
      }),
      true,
    );
    assert.equal(requiredFixtureValue(session2).data.cargo.ore, 24);
    assert.equal(
      requiredFixtureValue(reopen.db.world.towing).receipts.filter(
        (entry) => entry.id === identifier,
      ).length,
      1,
    );
  }
}
// Disconnect records the original world coordinates before captain relocation; restart is not a grace refresh.
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const { g: game, s: session, o: options } = pilotFixture,
    position = [requiredFixtureValue(options).x, requiredFixtureValue(options).y],
    clock = requiredFixtureValue(game.db.world.mining).clock;
  game.disconnect(session);
  assert.equal(requiredFixtureValue(options).status, 'detached');
  assert.deepEqual([requiredFixtureValue(options).x, requiredFixtureValue(options).y], position);
  assert.equal(requiredFixtureValue(options).graceUntil, clock + 300);
  game.db.touch();
  game.db.flush();
  const next = refineryGame(new Database(game.db.dir)),
    load = requiredFixtureValue(next.db.world.towing).slots.find(
      (entry) => entry.object?.id === requiredFixtureValue(options).id,
    )!.object;
  assert.deepEqual([requiredFixtureValue(load).x, requiredFixtureValue(load).y], position);
  assert.equal(requiredFixtureValue(load).graceUntil, requiredFixtureValue(options).graceUntil);
}
// Fail closed on persisted authority and impossible mass/receipt/schema variants.
for (const corrupt of [
  (weapon: { version: number }) => (weapon.version = 2),
  (weapon: { nextId: number }) => (weapon.nextId = 1),
  (weapon: { slots: { object: { mass: number } }[] }) => (weapon.slots[0].object.mass = 999),
  (weapon: { slots: { object: { lots: { pure: number } } }[] }) =>
    (weapon.slots[0].object.lots.pure = 999),
  (weapon: { slots: { object: { owner: string | null } }[] }) =>
    (weapon.slots[0].object.owner = 'MIXED'),
  (weapon: { slots: { issued: number }[] }) => weapon.slots[0].issued++,
  (weapon: { slots: { object: { x: number } }[] }) => (weapon.slots[0].object.x = Infinity),
  (weapon: { slots: unknown[] }) => weapon.slots.push(structuredClone(weapon.slots[0])),
]) {
  const pilotFixture = createTugFixture();
  corrupt(requiredFixtureValue(pilotFixture.g.db.world.towing) as OccupiedTowWorld);
  assert.throws(() => pilotFixture.g.features.towing.init());
}
console.log(
  'Tow real journal pre/post commit and final-unlink recovery, freeze/replay once, disconnect location/grace persistence, malformed version/authority/conservation rejection.',
);
