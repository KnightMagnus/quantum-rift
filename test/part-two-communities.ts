import assert from 'node:assert/strict';
import { PORTRAITS, genericPortrait, npcPortrait } from '../shared/portraits.ts';
import { milkyWayTraffic } from '../shared/part-two-ships.ts';
const humanIds = new Set(
  PORTRAITS.filter((entry) => entry.poolEligible && entry.faction === 'spacer').map(
    (entry) => entry.id,
  ),
);
for (const faction of ['confederation', 'freefolk', 'unsworn']) {
  const seen = new Set<string>();
  for (let index = 0; index < 100; index++) {
    const face = genericPortrait(`captain-${index}`, faction);
    assert.ok(humanIds.has(face), `${faction} portrait must be human`);
    seen.add(face);
    const entity = { faction, name: `Crew ${index}`, hull: 1040, rival: 'r3' };
    assert.ok(
      humanIds.has(npcPortrait(entity, 'mw-sol')),
      'regional rule overrides named alien rival',
    );
  }
  assert.equal(seen.size, 3, 'human captains retain variation');
}
assert.equal(
  npcPortrait({ faction: 'sarn', rival: 'r3', hull: 711 }, 'shoalight'),
  'npc-r3',
  'Rift identity unchanged',
);
const frequencies = (faction: string) => {
  const counts: Record<string, number> = {};
  for (let step = 0; step < 1000; step++) {
    const traffic = milkyWayTraffic(faction, step / 1000);
    counts[traffic.faction] = (counts[traffic.faction] || 0) + 1;
  }
  return counts;
};
assert.equal(frequencies('confederation').freefolk, 20);
assert.equal(frequencies('confederation').unsworn, 20);
assert.equal(frequencies('index').freefolk, 320);
assert.equal(frequencies('index').unsworn, 180);

console.log(
  'Regional communities: human-only NPC variations, retained Rift identities and exact regional traffic proportions passed.',
);
