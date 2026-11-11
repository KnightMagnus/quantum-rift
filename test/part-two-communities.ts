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
// Every faction with its own portrait art keeps its NPC faces inside that pool,
// including the region and non-answering factions that used to borrow player faces.
const poolFactions = [
  ...new Set(PORTRAITS.filter((entry) => entry.poolEligible).map((entry) => entry.faction)),
];
for (const faction of ['swarm', 'frontier', 'deep', 'eclipse'])
  assert.ok(poolFactions.includes(faction), `${faction} has a portrait pool`);
for (const faction of poolFactions) {
  const pool = new Set(
    PORTRAITS.filter((entry) => entry.poolEligible && entry.faction === faction).map(
      (entry) => entry.id,
    ),
  );
  for (let index = 0; index < 300; index++) {
    const face = npcPortrait({ faction, name: `Captain ${index}`, hull: 1 }, 'wild-landing');
    assert.ok(pool.has(face), `${faction} captain ${index} drew ${face} from another faction`);
    const unnamed = npcPortrait({ faction, name: null, hull: index }, 'wild-landing');
    assert.ok(pool.has(unnamed), `${faction} unnamed traffic drew ${unnamed}`);
  }
}
assert.equal(
  npcPortrait({ faction: 'swarm', name: 'Mite Drone', hull: 718 }, 'wild-landing'),
  'generic-swarm-01',
  'a Feral Swarm drone shows Swarm art, not a human settler',
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
  'Regional communities: human-only NPC variations, per-faction portrait pools, retained Rift identities and exact regional traffic proportions passed.',
);
