import assert from 'node:assert/strict';
import { SYSTEMS, PERSONAL_SYSTEMS, SYS, STELLARS, SITES } from '../shared/galaxy.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import {
  SOL_ARRIVAL_PORT,
  SOL_IRREGULAR_MOONS,
  defaultNavStellar,
  solRiftArrival,
} from '../shared/milky-way.ts';
import { bodyArtwork } from '../shared/body-artwork.ts';

const local = SYSTEMS.filter((system) => system.region === 'milky-way');
assert.equal(local.length, 32);
assert.equal(SYS.sol.region, undefined, 'Existing Sol Minor remains in the Rift');
assert.equal(SYS['beyond-rift'], undefined, 'Placeholder arrival is retired');
assert.equal(STELLARS['quantum-rift-mouth'].wormhole, 'mw-sol');
assert.equal(STELLARS['quantum-rift-mouth'].exit, 'mw-sol-rift-mouth');
assert.equal(STELLARS['mw-sol-rift-mouth'].wormhole, 'quantum-rift');
assert.equal(STELLARS['mw-sol-rift-mouth'].exit, 'quantum-rift-mouth');
{
  // The Sol mouth sits just outside Uranus's orbit; arrivals rest between the two, facing Vigil's Rest.
  const mouth = STELLARS['mw-sol-rift-mouth'];
  const uranus = STELLARS['mw-uranus'];
  const port = STELLARS[SOL_ARRIVAL_PORT];
  const mouthToUranus = Math.hypot(mouth.x - uranus.x, mouth.y - uranus.y);
  assert.ok(mouthToUranus > 1800 && mouthToUranus < 3500, 'return passage opens near Uranus');
  const arrival = solRiftArrival(SYS['mw-sol'].stellars);
  assert.ok(
    Math.hypot(arrival.x - mouth.x, arrival.y - mouth.y) > mouth.r,
    'arrivals rest outside the passage aperture',
  );
  assert.ok(
    Math.hypot(arrival.x - uranus.x, arrival.y - uranus.y) < mouthToUranus,
    'arrivals rest on the Uranus side of the passage',
  );
  const facing = { x: Math.sin(arrival.heading), y: -Math.cos(arrival.heading) };
  const toPort = Math.atan2(port.x - arrival.x, -(port.y - arrival.y));
  assert.ok(
    Math.abs(Math.atan2(Math.sin(arrival.heading - toPort), Math.cos(arrival.heading - toPort))) <
      1e-9,
  );
  assert.ok(
    facing.x * (port.x - arrival.x) + facing.y * (port.y - arrival.y) > 0,
    'arrival faces Luna Prime',
  );
  assert.equal(defaultNavStellar(SYS['mw-sol']), 'vigils-rest', 'Sol nav point is Luna Prime');
  assert.equal(
    defaultNavStellar(SYS['mw-cinder-anchorage']),
    SYS['mw-cinder-anchorage'].stellars.find((body) => body.svc?.includes('L'))!.id,
    'other systems keep their first port as nav point',
  );
}
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
assert.ok(orbitalDistance('mw-sol-rift-mouth') > orbitalDistance('mw-uranus'));
assert.ok(orbitalDistance('mw-sol-rift-mouth') < orbitalDistance('mw-neptune'));

// Luna Prime stays the smallest of the inner worlds; sizes keep their real order.
const radius = (id: string) => STELLARS[id].r;
assert.ok(radius('vigils-rest') < radius('mw-mercury'), 'Mercury is larger than the Moon');
assert.ok(radius('mw-mercury') < radius('mw-mars'), 'Mars is larger than Mercury');
assert.ok(radius('mw-mars') < radius('mw-venus'), 'Venus is larger than Mars');
assert.ok(radius('mw-venus') < radius('mw-uranus'), 'the ice giants are larger than Venus');
assert.ok(radius('mw-mimas') < radius('mw-rhea') && radius('mw-rhea') < radius('mw-titan'));
assert.ok(radius('mw-miranda') < radius('mw-titania'));

// Small and captured moons are irregular; Phobos and Deimos keep their ports.
for (const [id, art] of Object.entries(SOL_IRREGULAR_MOONS)) {
  assert.ok(STELLARS[id], `${id} exists`);
  assert.deepEqual(bodyArtwork(id), { art, shape: 'irregular' });
}
for (const id of ['mw-phobos', 'mw-deimos']) assert.ok(STELLARS[id].svc?.includes('L'));
for (const id of ['mw-prometheus', 'mw-hyperion', 'mw-phoebe', 'mw-puck'])
  assert.equal(STELLARS[id].svc, '', `${id} is scenery, not a port`);
assert.equal(bodyArtwork('mw-titan'), undefined, 'large moons stay round');
// Moons of ringed giants orbit outside the drawn rings.
for (const [planet, extent, moons] of [
  ['mw-saturn', 2.22, ['mw-mimas', 'mw-enceladus', 'mw-tethys']],
  ['mw-uranus', 1.8, ['mw-miranda', 'mw-ariel']],
] as const)
  for (const moon of moons)
    assert.ok(
      Math.hypot(STELLARS[moon].x - STELLARS[planet].x, STELLARS[moon].y - STELLARS[planet].y) -
        STELLARS[moon].r >
        STELLARS[planet].r * extent,
      `${moon} clears ${planet}'s rings`,
    );
console.log('Milky Way world: Sol sizes, irregular moons and Rift arrival point passed');
