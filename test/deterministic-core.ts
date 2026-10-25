import { legacyStorySystems } from './helpers/legacy-story-systems.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fileSystem from 'node:fs';
import {
  RandomStream,
  signedXorshift32,
  xorshift32,
  mulberry32,
  linearRandom32,
  fnv1a,
} from '../shared/deterministic-random.ts';
import { type StarSystem, SYS as systemsById } from '../shared/galaxy.ts';
import { ARCS, type FactionArc } from '../shared/arcs.ts';
import { seedOf, randomOf } from '../shared/mining-rules.ts';
import { tourRoute } from '../server/radio-discovery.ts';

// Captured from the original private functions at PR64 0eaf491, independently
// before migrations. Signed shifts, zero defaults and string iteration matter.
const baseline: {
  streams: Record<string, [number | string, number[]][]>;
  hashes: Record<string, [string, number][]>;
  galaxy: string;
  arcs: string;
  tours: Record<string, string>;
} = JSON.parse(
  fileSystem.readFileSync(
    new URL('./fixtures/deterministic-core-v331.json', import.meta.url),
    'utf8',
  ),
);
const factories = {
  'shared/gen.ts': signedXorshift32,
  'shared/fronts.ts': signedXorshift32,
  'server/fronts.ts': signedXorshift32,
  'server/hangar.ts': signedXorshift32,
  'server/jobs.ts': signedXorshift32,
  'server/quests.ts': mulberry32,
  'shared/mining-rules.ts': randomOf,
  'shared/rivals.ts': (seed: number) => linearRandom32(seed >>> 0 || 1),
  'server/freight-offers.ts': (seed: string) => xorshift32(fnv1a(seed)),
};
for (const [file, cases] of Object.entries(baseline.streams)) {
  for (const [seed, expected] of cases) {
    assert.deepEqual(
      Array.from(
        { length: expected.length },
        file === 'server/freight-offers.js'
          ? factories['server/freight-offers.ts'](seed as string)
          : factories[
              file.replace(/\.js$/, '.ts') as Exclude<
                keyof typeof factories,
                'server/freight-offers.ts'
              >
            ](seed as number),
      ),
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
for (const algorithm of ['signed-xorshift32', 'xorshift32', 'mulberry32', 'lcg32'] as const) {
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

const sha256 = (
  value: Record<string, StarSystem> | Record<string, FactionArc> | (string | string[] | null)[][],
) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(
  sha256(
    Object.fromEntries(
      legacyStorySystems(Object.values(systemsById)).map((system) => [system.id, system]),
    ),
  ),
  baseline.galaxy,
  'Generated topology, prices, bodies and fields match after reviewed story-only reversals',
);
// Reverse only the eight reviewed story tie-ins. The old golden still checks
// every original objective, reward, ordering and narrative byte underneath them.
const legacyArcs = structuredClone(ARCS);
const storyTieIns = [
  [
    'Cleaning House',
    'done',
    ' One code opens the sealed lower decks of Quantum Station, where the Core sits. The Ledger Thief wanted to know what was down there.',
  ],
  ['Spare Parts', 'done', ' Their old drive coil burned out when the lane moved under them.'],
  ['Gallows Jack', 'progress', ' His route log lists a system on no chart. Nobody comments on it.'],
  [
    'The Brood-Mother',
    'text',
    ' Her drones heard a song from the Deep, and passed it back to her.',
  ],
  [
    'The Deep Core',
    'done',
    ' The sample is worked material, like scaffolding, not rock. Basalt Harrowmere keeps a piece.',
  ],
  [
    'The Veil-Drinker',
    'progress',
    ' Its last transmission says: "You don’t know what we’re hiding you from."',
  ],
  [
    'The Defaulter',
    'progress',
    ' His books list debts paid in events that never happened, in a hand that is not his. The broker files them without comment.',
  ],
  [
    'Becalmed Singers',
    'done',
    ' Before the Wrecker found them, something sang back on their channel. Maren Deepcurrent keeps the recording.',
  ],
] as const;
for (const [title, field, addition] of storyTieIns) {
  const step = Object.values(legacyArcs)
    .flatMap((arc) => arc.steps)
    .find((step) => step.title === title)!;
  assert.ok(step, `Reviewed tie-in ${title} exists`);
  assert.equal(step[field]!.split(addition).length, 2, `Exact reviewed tie-in in ${title}`);
  step[field] = step[field]!.replace(addition, '');
}
assert.equal(
  sha256(legacyArcs),
  baseline.arcs,
  'Original arc objectives, ordering and prose preserve parity beneath reviewed tie-ins',
);
for (const [standing, expected] of Object.entries(baseline.tours)) {
  const reputationFixture = {
    rep: Object.fromEntries(
      [...new Set(Object.values(systemsById).map((session) => session.faction))].map((faction) => [
        faction,
        +standing,
      ]),
    ),
  };
  const tours = legacyStorySystems(Object.values(systemsById)).map(({ id: origin }) => [
    origin,
    tourRoute(origin, mockPlayerData(reputationFixture)),
  ]);
  assert.equal(sha256(tours), expected, `Sorted, safe radio tours at standing ${standing}`);
}
assert.equal(tourRoute('missing-system', mockPlayerData({})), null);
console.log(
  'Deterministic core: 9 original streams, 7 hash implementations, galaxy, arcs and 651 tour starts preserve parity.',
);
