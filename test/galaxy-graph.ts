import { legacyStorySystems } from './helpers/legacy-story-systems.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import filesystem from 'node:fs';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { SYS as systemsById, STELLARS, COMMODITIES } from '../shared/galaxy.ts';
import { freightOffers } from '../server/freight-offers.ts';
import { Game, type Mission } from '../server/game.ts';

const topology = {
  home: { links: ['west', 'east', 'west'], gate: 'remote' },
  west: { links: ['home', 'shared'] },
  east: { links: ['shared', 'end'] },
  shared: { links: ['end'] },
  end: { links: [] },
  remote: { links: [] },
};
const graph = new GalaxyGraph(topology);
assert.deepEqual(
  [...graph.walk('home')],
  [
    ['home', 0],
    ['west', 1],
    ['east', 1],
    ['shared', 2],
    ['end', 2],
  ],
);
assert.deepEqual(graph.distances('home'), { home: 0, west: 1, east: 1, shared: 2, end: 2 });
assert.deepEqual([...graph.walk('home', { maxDepth: 0 })], [['home', 0]]);
assert.deepEqual(
  [...graph.walk('home', { maxDepth: 1 })],
  [
    ['home', 0],
    ['west', 1],
    ['east', 1],
  ],
);
assert.deepEqual(
  [...graph.walk('home', { allowed: new Set(['east', 'end']) })],
  [
    ['home', 0],
    ['east', 1],
    ['end', 2],
  ],
);
assert.deepEqual(
  [...graph.walk('home', { maxDepth: 1, neighborOrder: 'sorted' })],
  [
    ['home', 0],
    ['east', 1],
    ['west', 1],
  ],
);
assert.deepEqual(
  [
    ...graph.walk('home', {
      canEnter: (identifier) => identifier !== 'east' && identifier !== 'shared',
    }),
  ],
  [
    ['home', 0],
    ['west', 1],
  ],
);
assert.deepEqual(graph.distances('remote'), { remote: 0 });
assert.deepEqual(graph.distances('home', { allowed: new Set() }), { home: 0 });
const first = graph.distances('home');
first.west = 99;
assert.equal(graph.distances('home').west, 1, 'Distance records never leak shared mutable cache');
// Construction does not snapshot dependencies, and a stopped traversal does not
// expand later nodes. This supports live topology and early-exit buyer lookup.
const lateTopology: Record<string, { links: string[] }> = { origin: { links: ['later'] } };
const lateGraph = new GalaxyGraph(lateTopology);
const stopped = lateGraph.walk('origin');
assert.deepEqual(stopped.next().value, ['origin', 0]);
stopped.return(undefined);
lateTopology.later = { links: [] };
assert.deepEqual(lateGraph.distances('origin'), { origin: 0, later: 1 });
lateTopology.origin.links = [];
assert.deepEqual(lateGraph.distances('origin'), { origin: 0 });

// Captured independently from untouched PR64 0eaf491 before the refactor. Each
// digest includes ordered original output, rather than replacement-derived data.
const baseline = JSON.parse(
  filesystem.readFileSync(new URL('./fixtures/galaxy-graph-v331.json', import.meta.url), 'utf8'),
);
const sha256 = (
  value:
    | Record<string, number>
    | (string | { id: string; j: number } | null)[][]
    | (string | Mission[])[][],
) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Personal story destinations are reviewed additions, not generated topology.
// Keep the untouched golden against exactly the original systems/links.
const legacySystems = Object.fromEntries(
  legacyStorySystems(Object.values(systemsById)).map((system) => [system.id, system]),
);
const galaxy = new GalaxyGraph(legacySystems);
const originalClock = Date.now;
Date.now = () => baseline.time;
try {
  assert.deepEqual(Object.keys(baseline.distances), Object.keys(legacySystems));
  for (const origin of Object.keys(legacySystems)) {
    assert.equal(
      sha256(galaxy.distances(origin)),
      baseline.distances[origin],
      `Distances ${origin}`,
    );
    const addedSalvage = new Set([
      'nhal_bone',
      'nhal_ichor',
      'nhal_eye',
      'index_core',
      'index_parts',
    ]);
    assert.equal(COMMODITIES.filter(({ id }) => addedSalvage.has(id)).length, 5);
    const buyers = COMMODITIES.filter(({ id }) => !addedSalvage.has(id)).map(
      ({ id: identifier }) => {
        const buyer = Game.prototype.nearestBuyer.call({}, origin, identifier);
        return [identifier, buyer && { id: buyer.p.id, j: buyer.j }];
      },
    );
    assert.equal(sha256(buyers), baseline.buyers[origin], `Nearest buyer ${origin}`);
  }
  // Keep the original ordered-port golden. Moving the service-free Gateway
  // changes only its outer array position; all actual offers use current ports.
  const legacyPortIds = legacyStorySystems(Object.values(systemsById)).flatMap((system) =>
    system.stellars.map((stellar) => stellar.id),
  );
  for (const [window, expected] of Object.entries(baseline.freight)) {
    assert.deepEqual(freightOffers(STELLARS['sol-gateway'], +window), []);
    const offers = legacyPortIds.map((id) => [id, freightOffers(STELLARS[id], +window)]);
    assert.equal(sha256(offers), expected, `Freight offers window ${window}`);
  }
} finally {
  Date.now = originalClock;
}
console.log(
  'Galaxy graph: traversal policies, 217 distance maps, buyer choices and freight parity passed.',
);
