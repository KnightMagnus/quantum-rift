import assert from 'node:assert/strict';
import { SYSTEMS, PERSONAL_SYSTEMS, SYS, STELLARS, SITES } from '../shared/galaxy.ts';
import { storySystemVisible } from '../shared/story-world.ts';

const local = SYSTEMS.filter((system) => system.region === 'milky-way');
assert.equal(local.length, 32);
assert.equal(SYS.sol.region, undefined, 'Existing Sol Minor remains in the Rift');
assert.equal(SYS['beyond-rift'], undefined, 'Placeholder arrival is retired');
assert.equal(STELLARS['quantum-rift-mouth'].wormhole, 'mw-sol');
assert.equal(STELLARS['quantum-rift-mouth'].exit, 'mw-sol-rift-mouth');
assert.equal(STELLARS['mw-sol-rift-mouth'].wormhole, 'quantum-rift');
assert.equal(STELLARS['mw-sol-rift-mouth'].exit, 'quantum-rift-mouth');
assert.equal(STELLARS['mw-sol-rift-mouth'].x, 49000);
const reached = new Set(['mw-sol']);
for (let pass = 0; pass < local.length; pass++)
  for (const id of reached) for (const next of SYS[id].links) reached.add(next);
assert.equal(
  local.filter((system) => reached.has(system.id)).length,
  32,
  'Every charted local star is reachable',
);
for (const system of local)
  for (const next of system.links) {
    assert.equal(SYS[next].region, 'milky-way', 'Ordinary lanes cannot bypass the Rift crossing');
    assert.ok(SYS[next].links.includes(system.id));
  }
const ids = [...SYSTEMS, ...PERSONAL_SYSTEMS].flatMap((system) =>
  system.stellars.map((body) => body.id),
);
assert.equal(new Set(ids).size, ids.length, 'Stellar IDs must remain globally unique');
assert.equal(SYS['mw-sol'].stellars.filter((body) => body.art?.startsWith('sol_')).length, 30);
assert.equal(
  SYS['mw-sol'].stellars.some((body) => /earth/i.test(body.name)),
  false,
);
assert.equal(STELLARS['vigils-rest'].art, 'sol_luna_prime');
assert.ok(SITES.filter((site) => site.system.startsWith('mw-')).length >= 4);
for (const site of SITES.filter((site) => site.system.startsWith('mw-'))) {
  assert.equal(
    storySystemVisible(undefined, site.system),
    false,
    'Uncrossed captains cannot warp stations across the story gate',
  );
  assert.equal(
    storySystemVisible({ main_ending: 'table', crossed_quantum_rift: true }, site.system),
    true,
  );
}
console.log('Milky Way world: topology, authored Sol, return route, and station gates passed');

const orbitalDistance = (id: string) => Math.hypot(STELLARS[id].x, STELLARS[id].y);
const saturnDistance = orbitalDistance('mw-saturn');
for (const [id, ratio] of [
  ['mw-uranus', 19.2 / 9.58],
  ['mw-neptune', 30.05 / 9.58],
  ['mw-pluto', 39.48 / 9.58],
] as const)
  assert.ok(
    Math.abs(orbitalDistance(id) / saturnDistance - ratio) < 0.03,
    `${id} retains outer-orbit distance ratios`,
  );
assert.equal(STELLARS['vigils-rest'].r, 180);
assert.ok(orbitalDistance('mw-sol-rift-mouth') > orbitalDistance('mw-pluto'));
