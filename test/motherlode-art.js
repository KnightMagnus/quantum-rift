import assert from 'node:assert/strict';
import { SYS } from '../shared/galaxy.js';
import { motherlodeArt, MOTHERLODE_ART, UNKNOWN_MOTHERLODE_ART } from '../shared/towing-rules.js';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
// Exercise authoritative generated payload, not a duplicated commodity inventory.
const g = refineryGame(),
  s = refineryPilot(g, 'Art Survey');
s.data.sys = 'meridian';
for (const sys of Object.keys(SYS)) g.features.towing.ensure(sys);
const types = new Set();
for (const slot of g.db.world.towing.slots) {
  const o = slot.object;
  types.add(o.ore);
  for (const status of ['available', 'attached', 'detached']) {
    assert.equal(motherlodeArt({ ...o, status, revealed: true }), MOTHERLODE_ART[o.ore]);
    assert.equal(motherlodeArt({ ...o, status, revealed: false }), UNKNOWN_MOTHERLODE_ART);
  }
}
assert.deepEqual([...types].sort(), ['gas', 'ore', 'shards']);
// Actual viewer payload transitions: survey expires back to neutral; ownership reveals.
const slot = g.db.world.towing.slots.find((x) => x.sys === 'meridian');
const object = slot.object;
const payload = () => g.features.towing.payload(s).objects.find((x) => x.id === object.id);
assert.equal(payload().revealed, false);
assert.equal(motherlodeArt(payload()), UNKNOWN_MOTHERLODE_ART);
s.data.miningSurvey = { sys: s.data.sys, x: object.x, y: object.y, revealUntil: 1e9 };
assert.equal(payload().revealed, true);
assert.equal(motherlodeArt(payload()), MOTHERLODE_ART[object.ore]);
s.data.miningSurvey.revealUntil = -1;
assert.equal(motherlodeArt(payload()), UNKNOWN_MOTHERLODE_ART);
object.owner = g.db.key(s.data.name);
assert.equal(payload().revealed, true);
assert.equal(motherlodeArt(payload()), MOTHERLODE_ART[object.ore]);
for (const ore of [undefined, '', 'future-resource', '__proto__', 'constructor']) {
  assert.equal(motherlodeArt({ ore, revealed: true }), UNKNOWN_MOTHERLODE_ART);
}
assert.equal(motherlodeArt({ ore: 'gas' }), UNKNOWN_MOTHERLODE_ART);
assert.equal(new Set(Object.values(MOTHERLODE_ART).map((a) => a.base)).size, 3);
console.log(
  'Authoritative ore/gas/shards mapping, free/attached/detached visibility and unknown fallback.',
);
