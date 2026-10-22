import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { SYS, STELLARS, COMMODITIES } from '../shared/galaxy.js';
import { freightOffers } from '../server/freight-offers.js';
import { Game } from '../server/game.js';

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
  [...graph.walk('home', { canEnter: (id) => id !== 'east' && id !== 'shared' })],
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
const lateTopology = { origin: { links: ['later'] } };
const lateGraph = new GalaxyGraph(lateTopology);
const stopped = lateGraph.walk('origin');
assert.deepEqual(stopped.next().value, ['origin', 0]);
stopped.return();
lateTopology.later = { links: [] };
assert.deepEqual(lateGraph.distances('origin'), { origin: 0, later: 1 });
lateTopology.origin.links = [];
assert.deepEqual(lateGraph.distances('origin'), { origin: 0 });

// Captured independently from untouched PR64 0eaf491 before the refactor. Each
// digest includes ordered original output, rather than replacement-derived data.
const baseline = JSON.parse(
  fs.readFileSync(new URL('./fixtures/galaxy-graph-v331.json', import.meta.url)),
);
const sha = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const galaxy = new GalaxyGraph(SYS);
const originalClock = Date.now;
Date.now = () => baseline.time;
try {
  assert.deepEqual(Object.keys(baseline.distances), Object.keys(SYS));
  for (const origin of Object.keys(SYS)) {
    assert.equal(sha(galaxy.distances(origin)), baseline.distances[origin], `Distances ${origin}`);
    const buyers = COMMODITIES.map(({ id }) => {
      const buyer = Game.prototype.nearestBuyer.call({}, origin, id);
      return [id, buyer && { id: buyer.p.id, j: buyer.j }];
    });
    assert.equal(sha(buyers), baseline.buyers[origin], `Nearest buyer ${origin}`);
  }
  for (const [window, expected] of Object.entries(baseline.freight)) {
    const offers = Object.values(STELLARS).map((port) => [port.id, freightOffers(port, +window)]);
    assert.equal(sha(offers), expected, `Freight offers window ${window}`);
  }
} finally {
  Date.now = originalClock;
}
console.log(
  'Galaxy graph: traversal policies, 217 distance maps, buyer choices and freight parity passed.',
);
