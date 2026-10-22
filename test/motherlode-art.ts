import { mockSavedSurvey } from './helpers/mocks.ts';
const artFor = (oreType: string) => {
  const entry = Object.entries(MOTHERLODE_ART).find(([resource]) => resource === oreType);
  assert.ok(entry);
  return entry[1];
};
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { motherlodeArt, MOTHERLODE_ART, UNKNOWN_MOTHERLODE_ART } from '../shared/towing-rules.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
// Exercise authoritative generated payload, not a duplicated commodity inventory.
const game = refineryGame(),
  session = refineryPilot(game, 'Art Survey');
requiredFixtureValue(session).data.sys = 'meridian';
for (const systemId of Object.keys(systemsById)) game.features.towing.ensure(systemId);
const types = new Set();
for (const slot of requiredFixtureValue(game.db.world.towing).slots) {
  const options = slot.object;
  types.add(requiredFixtureValue(options).ore);
  for (const status of ['available', 'attached', 'detached']) {
    assert.equal(
      motherlodeArt(Object.assign({}, options, { status, revealed: true })),
      artFor(requiredFixtureValue(options).ore),
    );
    assert.equal(
      motherlodeArt(Object.assign({}, options, { status, revealed: false })),
      UNKNOWN_MOTHERLODE_ART,
    );
  }
}
assert.deepEqual(
  [...types].sort((left, right) => String(left).localeCompare(String(right))),
  ['gas', 'ore', 'shards'],
);
// Actual viewer payload transitions: survey expires back to neutral; ownership reveals.
const slot = requiredFixtureValue(game.db.world.towing).slots.find(
  (entry) => entry.sys === 'meridian',
);
const object = requiredFixtureValue(slot).object;
const payload = () =>
  requiredFixtureValue(game.features.towing.payload(session)).objects.find(
    (entry) => entry.id === requiredFixtureValue(object).id,
  );
assert.equal(requiredFixtureValue(payload()).revealed, false);
assert.equal(motherlodeArt(requiredFixtureValue(payload())), UNKNOWN_MOTHERLODE_ART);
requiredFixtureValue(session).data.miningSurvey = mockSavedSurvey({
  sys: requiredFixtureValue(session).data.sys,
  x: requiredFixtureValue(object).x,
  y: requiredFixtureValue(object).y,
  revealUntil: 1e9,
});
assert.equal(requiredFixtureValue(payload()).revealed, true);
assert.equal(
  motherlodeArt(requiredFixtureValue(payload())),
  artFor(requiredFixtureValue(object).ore),
);
requiredFixtureValue(requiredFixtureValue(session).data.miningSurvey).revealUntil = -1;
assert.equal(motherlodeArt(requiredFixtureValue(payload())), UNKNOWN_MOTHERLODE_ART);
requiredFixtureValue(object).owner = game.db.key(requiredFixtureValue(session).data.name);
assert.equal(requiredFixtureValue(payload()).revealed, true);
assert.equal(
  motherlodeArt(requiredFixtureValue(payload())),
  artFor(requiredFixtureValue(object).ore),
);
for (const oreType of [undefined, '', 'future-resource', '__proto__', 'constructor']) {
  assert.equal(motherlodeArt({ ore: oreType, revealed: true }), UNKNOWN_MOTHERLODE_ART);
}
assert.equal(motherlodeArt({ ore: 'gas' }), UNKNOWN_MOTHERLODE_ART);
assert.equal(new Set(Object.values(MOTHERLODE_ART).map((firstEntry) => firstEntry.base)).size, 3);
console.log(
  'Authoritative ore/gas/shards mapping, free/attached/detached visibility and unknown fallback.',
);
