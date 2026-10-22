import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  RandomStream,
  signedXorshift32,
  xorshift32,
  mulberry32,
  linearRandom32,
  fnv1a,
} from '../shared/deterministic-random.ts';
import { SYS } from '../shared/galaxy.js';
import { ARCS } from '../shared/arcs.js';
import { seedOf, randomOf } from '../shared/mining-rules.js';
import { tourRoute } from '../server/radio-discovery.js';

// Captured from the original private functions at PR64 0eaf491, independently
// before migrations. Signed shifts, zero defaults and string iteration matter.
const baseline = JSON.parse(
  fs.readFileSync(new URL('./fixtures/deterministic-core-v331.json', import.meta.url)),
);
const factories = {
  'shared/gen.js': signedXorshift32,
  'shared/fronts.js': signedXorshift32,
  'server/fronts.js': signedXorshift32,
  'server/hangar.js': signedXorshift32,
  'server/jobs.js': signedXorshift32,
  'server/quests.js': mulberry32,
  'shared/mining-rules.js': randomOf,
  'shared/rivals.js': (seed) => linearRandom32(seed >>> 0 || 1),
  'server/freight-offers.js': (seed) => xorshift32(fnv1a(seed)),
};
for (const [file, cases] of Object.entries(baseline.streams)) {
  for (const [seed, expected] of cases) {
    assert.deepEqual(
      Array.from({ length: expected.length }, factories[file](seed)),
      expected,
      `${file} seed ${seed}`,
    );
  }
}
for (const [file, cases] of Object.entries(baseline.hashes)) {
  for (const [input, expected] of cases) {
    assert.equal(fnv1a(input), expected, `${file} hash ${JSON.stringify(input)}`);
    assert.equal(seedOf(input), expected, 'Mining seed adapter preserves the original contract');
  }
}
for (const algorithm of ['signed-xorshift32', 'xorshift32', 'mulberry32', 'lcg32']) {
  const first = new RandomStream(1, algorithm);
  const other = new RandomStream(1, algorithm);
  const expected = other.next();
  assert.equal(first.next(), expected);
  first.next();
  first.next();
  const untouched = new RandomStream(1, algorithm);
  untouched.next();
  assert.equal(other.next(), untouched.next(), `${algorithm} streams do not share state`);
  for (let index = 0; index < 100; index++) {
    const value = first.next();
    assert.ok(value >= 0 && value < 1);
  }
}
assert.notEqual(signedXorshift32(0)(), 0, 'Legacy signed stream replaces zero with one');
assert.equal(xorshift32(0)(), 0, 'Unsigned freight stream retains zero');
assert.equal(linearRandom32(0)(), 1013904223 / 4294967296);

const sha = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(
  sha(SYS),
  baseline.galaxy,
  'Generated topology, prices, bodies and field identities are unchanged',
);
assert.equal(
  sha(ARCS),
  baseline.arcs,
  'Arc discovery order and generated objectives are unchanged',
);
for (const [standing, expected] of Object.entries(baseline.tours)) {
  const captain = {
    rep: Object.fromEntries(
      [...new Set(Object.values(SYS).map((s) => s.faction))].map((faction) => [faction, +standing]),
    ),
  };
  const tours = Object.keys(SYS).map((origin) => [origin, tourRoute(origin, captain)]);
  assert.equal(sha(tours), expected, `Sorted, safe radio tours at standing ${standing}`);
}
assert.equal(tourRoute('missing-system', {}), null);
console.log(
  'Deterministic core: 9 original streams, 7 hash implementations, galaxy, arcs and 651 tour starts preserve parity.',
);
