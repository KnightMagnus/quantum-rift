import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { HailService } from '../server/hail-service.ts';

const game = refineryGame();
const captain = refineryPilot(game, 'Support captain');
captain.data.station.site = undefined;
captain.data.stellar = null;
game.spawnPlayer(captain, 0, 0, 0, 0);
const space = game.spaces[captain.data.sys];
let now = 1000;
const service = new HailService(
  game,
  () => now,
  () => 0.5,
);
game.hails = service;
const patrol = () => space.makeShip({ hull: 704, faction: 'spacer', x: 100, y: 0, ai: 'patrol' });
const escort = patrol();
captain.data.credits = 5000;
assert.ok(service.canHire(captain, escort, space), 'no station needed');
game.features.hail.hailOpt(captain, { t: 'hailopt', id: escort.id, k: 'mercenary' });
assert.equal(captain.data.credits, 3500);
assert.equal(escort.owner, captain.ent!.id);
assert.equal(escort.ai, 'escort');
const second = patrol();
service.hire(captain, second, space);
assert.equal(captain.data.credits, 3500, 'one active contract; no duplicate charge');
now += 299999;
service.tick();
assert.equal(escort.owner, captain.ent!.id);
service.resume(1000);
now += 1000;
service.tick();
assert.equal(escort.owner, captain.ent!.id, 'Solo pause extends the contract');
now++;
service.tick();
assert.equal(escort.owner, null);
assert.equal(escort.ai, 'patrol');
assert.equal(captain.data.credits, 3500, 'expiry gives no refund');
for (const credits of [1499, -1, NaN, Infinity]) {
  captain.data.credits = credits;
  service.hire(captain, second, space);
  assert.ok(Object.is(captain.data.credits, credits));
  assert.ok(!second.owner, 'invalid or insufficient wallet cannot hire');
}
captain.data.credits = 5000;
second.owner = 999;
service.hire(captain, second, space);
assert.equal(captain.data.credits, 5000, 'another captain owns the ship');
second.owner = null;
second.boss = 'fixture';
assert.equal(service.canHire(captain, second, space), false, 'story bosses cannot be hired');
second.boss = undefined;
second.story = captain.id;
assert.equal(service.canHire(captain, second, space), false, 'story-owned ships cannot be hired');
second.story = undefined;
second.name = 'Named patrol';
assert.equal(service.canHire(captain, second, space), false, 'named patrol retains its role');
second.name = null;
second.disabled = true;
assert.equal(service.canHire(captain, second, space), false);
second.disabled = false;
second.x = 4000;
assert.equal(service.canHire(captain, second, space), false);
second.x = 100;
service.hire(captain, second, space);
captain.ent = null;
service.tick();
assert.equal(second.owner, null, 'ending flight ends temporary ownership');
assert.equal(captain.data.credits, 3500, 'ending flight gives no refund');

for (const balance of [0, 9, 1000, 1000000]) {
  const recovery = refineryPilot(game, `Retry ${balance}`);
  recovery.data.credits = balance;
  recovery.data.stellar = null;
  game.spawnPlayer(recovery, 0, 0, 0, 0);
  const origin = game.spaces[recovery.data.sys];
  origin.remove(recovery.ent!);
  game.onPlayerDeath(game.pref(recovery), origin);
  const expected = Math.min(
    Math.floor(balance * 0.1),
    Math.round(game.A.ships[recovery.data.ship.hull].cost * 0.05),
  );
  assert.equal(
    recovery.data.credits,
    balance - expected,
    'insurance preserves at least 90% of wallet',
  );
}
const loss = patrol();
captain.data.stellar = null;
game.spawnPlayer(captain, 0, 0, 0, 0);
captain.data.credits = 5000;
service.hire(captain, loss, space);
const hiredCount = space.ships.size;
space.remove(loss);
service.tick();
assert.equal(captain.data.credits, 3500, 'lost support is not refunded');
assert.equal(space.ships.size, hiredCount - 1, 'lost support is not respawned');
assert.ok(!service.states.get(captain.id)?.mercenary, 'loss frees the contract slot');
console.log('Temporary mercenary ownership, expiry, pause, denial and insurance relief passed.');
