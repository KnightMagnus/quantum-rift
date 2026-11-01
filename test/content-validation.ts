import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { augmentAssets, type GameAssets } from '../shared/rules.ts';
import { STELLARS, SYS } from '../shared/galaxy.ts';
import { SCIENTIST_STORY } from '../shared/radio-stations.ts';
import {
  authoredNarrativeContent,
  validateNarrativeContent,
  type NarrativeContent,
} from '../tools/narrative-content-validation.ts';
import {
  hullSources,
  refitHullReferences,
  validateContentReferences,
  validateShipContent,
} from '../tools/content-validation.ts';

const assets: GameAssets = augmentAssets(
  JSON.parse(readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const before = structuredClone(assets);
assert.deepEqual(
  validateShipContent(assets, (relativePath) =>
    statSync(new URL(`../client/assets/${relativePath}`, import.meta.url)).isFile(),
  ),
  [],
  'all composed hulls, stock weapons and shipped artwork validate',
);
assert.deepEqual(assets, before, 'validation does not mutate the live catalog');

const fixture = (): GameAssets => ({
  ships: { 703: structuredClone(assets.ships[703]) },
  outfits: structuredClone(assets.outfits),
  weapons: structuredClone(assets.weapons),
});
const invalid = fixture();
Object.assign(invalid.ships[703], {
  id: 704,
  cost: Infinity,
  guns: 0.5,
  turrets: -1,
  img: '../outside.png',
  weapons: [[999999, 0, -1]],
});
assert.deepEqual(
  validateShipContent(invalid, () => true).map((diagnostic) => diagnostic.path),
  [
    'ships[703].id',
    'ships[703].cost',
    'ships[703].turrets',
    'ships[703].guns',
    'ships[703].weapons[0][0]',
    'ships[703].weapons[0][1]',
    'ships[703].weapons[0][2]',
    'ships[703].img',
  ],
  'independent authoring errors retain exact catalog locations',
);
for (const field of [
  'shield',
  'armor',
  'accel',
  'speed',
  'turn',
  'shieldRe',
  'armorRe',
  'fuelRe',
  'strength',
] as const) {
  for (const value of [NaN, Infinity, -1]) {
    const catalog = fixture();
    catalog.ships[703][field] = value;
    assert.deepEqual(
      validateShipContent(catalog, () => true).map((diagnostic) => diagnostic.path),
      [`ships[703].${field}`],
      `${field} rejects ${value} before it reaches physics or combat`,
    );
  }
  const zero = fixture();
  zero.ships[703][field] = 0;
  assert.deepEqual(
    validateShipContent(zero, () => true),
    [],
    `${field} permits zero`,
  );
}
for (const path of ['/ships/703.png', 'https://example.com/ship.png', 'ships/../703.png']) {
  const catalog = fixture();
  catalog.ships[703].img = path;
  assert.ok(
    validateShipContent(catalog, () => true).some((entry) => entry.path === 'ships[703].img'),
  );
}
const missing = validateShipContent(fixture(), () => false);
assert.deepEqual(
  missing.map((diagnostic) => diagnostic.path),
  ['ships[703].img', 'ships[703].flightArtwork', 'ships[703].glowArtwork'],
  'yard, flight and glow failures are reported separately',
);
assert.match(missing[0]!.message, /missing client\/assets\/ships\/703_yard.png/);
const legacy = fixture();
delete legacy.ships[703].spr;
const legacyPaths: string[] = [];
assert.deepEqual(
  validateShipContent(legacy, (path) => {
    legacyPaths.push(path);
    return true;
  }),
  [],
);
assert.deepEqual(legacyPaths, ['ships/703_yard.png', 'ships/703.png', 'ships/703_glow.png']);
legacy.ships[703].glow = false;
assert.deepEqual(
  validateShipContent(legacy, () => false).map((diagnostic) => diagnostic.path),
  ['ships[703].img', 'ships[703].flightArtwork'],
  'hulls without active glow do not require a glow file',
);

const mounts = fixture();
mounts.ships[703].guns = 0;
assert.match(validateShipContent(mounts, () => true)[0]!.message, /stock guns 1 exceed mounts 0/);
mounts.ships[703].npcOnly = true;
assert.deepEqual(
  validateShipContent(mounts, () => true),
  [],
  'NPC stock mount exception is explicit',
);
mounts.ships[703].weapons = [[999999, 1]];
assert.match(validateShipContent(mounts, () => true)[0]!.message, /unknown weapon/);

const turret = fixture();
turret.ships[704] = structuredClone(assets.ships[704]);
turret.ships[704].turrets = 0;
assert.ok(
  validateShipContent(turret, () => true).some(
    (entry) => entry.path === 'ships[704].weapons' && /stock turrets/.test(entry.message),
  ),
  'turret limits are separate from fixed gun limits',
);
const optionalAmmo = fixture();
optionalAmmo.ships[703].weapons = [[128, 1]];
assert.deepEqual(
  validateShipContent(optionalAmmo, () => true),
  [],
  'legacy omitted ammo remains valid',
);

// Diagnostics name the authoring file as well as the catalog key.
const rawShipIds = Object.keys(
  JSON.parse(readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')).ships,
);
const sources = hullSources(rawShipIds);
assert.equal(sources.get('703'), 'shared/assets.json');
assert.equal(sources.get('940'), 'shared/station-defense.ts');
const authoredHull = [...sources].find(([, source]) => source === 'shared/ships23.ts')?.[0];
assert.ok(authoredHull && assets.ships[authoredHull], 'composed catalog includes ships23 hulls');
assert.equal(sources.size, Object.keys(assets.ships).length, 'every composed hull has a source');
const sourced = fixture();
sourced.ships[authoredHull] = structuredClone(assets.ships[authoredHull]);
sourced.ships[authoredHull].cost = -5;
sourced.ships[703].weapons = [[999999, 1]];
assert.deepEqual(
  validateShipContent(sourced, () => true, sources).map((entry) => [entry.source, entry.path]),
  [
    ['shared/assets.json', 'ships[703].weapons[0][0]'],
    ['shared/ships23.ts', `ships[${authoredHull}].cost`],
  ],
  'hull diagnostics carry the file that authors each hull',
);

// Refit/Armada tables and weapon outfits must name real hulls and weapons.
const references = refitHullReferences();
assert.ok(references.some((entry) => entry.path.startsWith('MK2_OF[')));
assert.ok(references.some((entry) => entry.path.startsWith('ARMADA_HULLS[')));
assert.deepEqual(validateContentReferences(assets, references), [], 'shipped references resolve');
const unreferenced = structuredClone(assets);
const removedHull = references[0]!.hull;
delete unreferenced.ships[removedHull];
const weaponOutfit = Object.entries(unreferenced.outfits).find(
  ([, outfit]) => outfit.eff?.weapon !== undefined,
)!;
weaponOutfit[1].eff!.weapon = 999998;
assert.deepEqual(
  validateContentReferences(unreferenced, references),
  [
    ...references
      .filter((entry) => entry.hull === removedHull)
      .map((entry) => ({
        source: 'shared/galaxy.ts',
        path: entry.path,
        message: `unknown hull id ${removedHull}`,
      })),
    {
      source: 'shared/assets.json',
      path: `outfits[${weaponOutfit[0]}].eff.weapon`,
      message: 'unknown weapon id 999998',
    },
  ],
  'missing refit hulls and outfit weapons are reported at their table entries',
);

// Validate actual composed narrative content, not a parallel test-only catalog.
const authoredNarrative = authoredNarrativeContent();
const narrativeBefore = structuredClone(authoredNarrative);
assert.deepEqual(validateNarrativeContent(assets), [], 'all authored narrative references resolve');
assert.deepEqual(authoredNarrative, narrativeBefore, 'narrative validation never changes content');
const home = Object.values(STELLARS)[0]!;
const narrativeFixture = (): NarrativeContent => ({
  story: [
    {
      id: 'main-fixture',
      type: 'carry',
      title: 'Fixture',
      at: home.id,
      dest: home.id,
      pay: 0,
      rep: 0,
      text: 'Offer',
      brief: 'Deliver',
      acc: 'Accept',
      ref: 'Later',
      done: 'Done',
    },
  ],
  sides: [
    {
      id: SCIENTIST_STORY,
      name: 'Fixture',
      at: home.id,
      giver: 'Contact',
      intro: 'Offer',
      end: 'Done',
      steps: [
        {
          type: 'cargo',
          sys: home.system,
          dest: home.id,
          title: 'Cargo',
          brief: 'Deliver',
          qty: 1,
        },
      ],
      reward: { credits: 0 },
    },
  ],
  chains: [
    {
      id: 'chain-fixture',
      name: 'Fixture',
      kind: 'any',
      intro: 'Offer',
      end: 'Done',
      steps: [{ type: 'survey', where: 'A', title: 'Survey', brief: 'Survey' }],
    },
  ],
});
assert.deepEqual(validateNarrativeContent(assets, narrativeFixture()), []);
const rejectNarrative = (
  change: (content: NarrativeContent) => void,
  path: string,
  message: string,
  source: string = 'shared/quests.ts',
) => {
  const content = narrativeFixture();
  change(content);
  assert.deepEqual(validateNarrativeContent(assets, content), [{ source, path, message }], path);
};
for (const field of ['at', 'dest', 'back'] as const)
  rejectNarrative(
    (content) => {
      content.story[0]![field] = 'absent';
    },
    `story[0].${field}`,
    'unknown stellar reference absent',
    'shared/story.ts',
  );
rejectNarrative(
  (content) => {
    content.story[0]!.sys = 'absent';
  },
  'story[0].sys',
  'unknown system reference absent',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    content.story[0]!.hull = 999999;
  },
  'story[0].hull',
  'unknown hull reference 999999',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    content.story[0]!.allies = [999999];
  },
  'story[0].allies[0]',
  'unknown hull reference 999999',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    content.story[0]!.faction = 'absent';
  },
  'story[0].faction',
  'unknown faction reference absent',
  'shared/story.ts',
);
for (const field of ['pay', 'rep', 'minRep', 'count'] as const)
  rejectNarrative(
    (content) => {
      content.story[0]![field] = NaN;
    },
    `story[0].${field}`,
    `expected a finite ${field === 'count' ? 'positive' : 'nonnegative'} number`,
    'shared/story.ts',
  );
rejectNarrative(
  (content) => {
    content.story[0]!.text = ' ';
  },
  'story[0].text',
  'expected nonempty text',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    delete content.story[0]!.dest;
  },
  'story[0].dest',
  'carry requires a destination',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    content.story[0]!.type = 'absent';
  },
  'story[0].type',
  'unsupported main-story mission type',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    content.story[0]!.type = 'decision';
  },
  'story[0].choices',
  'decision requires a flag and at least one choice',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    Object.assign(content.story[0]!, {
      type: 'decision',
      decision: 'd1',
      choices: [
        { value: 'same', label: 'First' },
        { value: 'same', label: 'Second' },
      ],
    });
  },
  'story[0].choices[1].value',
  'duplicate decision choice',
  'shared/story.ts',
);
for (const field of ['afterSides', 'afterStory'] as const)
  rejectNarrative(
    (content) => {
      content.sides[0]![field] = ['absent'];
    },
    `sides[0].${field}[0]`,
    'unknown prerequisite reference absent',
  );
rejectNarrative(
  (content) => {
    content.sides[0]!.afterSides = [SCIENTIST_STORY];
  },
  'sides[0].afterSides[0]',
  'cyclic side-story prerequisite',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.at = 'absent';
  },
  'sides[0].at',
  'unknown stellar reference absent',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.flag = { key: 'd2', value: 'absent' };
  },
  'sides[0].flag',
  'flag must name an authored decision and legal choice',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.fragments = -1;
  },
  'sides[0].fragments',
  'expected a finite positive number',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.credits = -1;
  },
  'sides[0].reward.credits',
  'expected a finite nonnegative number',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.bp = Infinity;
  },
  'sides[0].reward.bp',
  'expected a finite nonnegative number',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.crate = ['absent', 0];
  },
  'sides[0].reward.crate[0]',
  'unknown material reference',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.crate = ['alloy', 5];
  },
  'sides[0].reward.crate[1]',
  'expected a material grade index from 0 to 4',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.radio = 'absent';
  },
  'sides[0].reward.radio',
  'unknown radio reference absent',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.reward.officer = 'absent';
  },
  'sides[0].reward.officer',
  'unknown officer race reference absent',
);
rejectNarrative(
  (content) => {
    content.chains[0]!.kind = 'absent';
  },
  'chains[0].kind',
  'unknown contact kind reference absent',
);
rejectNarrative(
  (content) => {
    content.chains[0]!.steps[0]!.where = 'absent';
  },
  'chains[0].steps[0].where',
  'expected relative locator W, A or B',
);
rejectNarrative(
  (content) => {
    content.chains[0]!.steps = [];
  },
  'chains[0].steps',
  'expected at least one quest step',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.type = 'absent';
  },
  'sides[0].steps[0].type',
  'unsupported quest step type',
);
rejectNarrative(
  (content) => {
    delete content.sides[0]!.steps[0]!.sys;
  },
  'sides[0].steps[0].sys',
  'authored step requires a system',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.cid = 'absent';
  },
  'sides[0].steps[0].cid',
  'unknown commodity reference absent',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.point = [NaN, 0];
  },
  'sides[0].steps[0].point',
  'expected two finite coordinates',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.points = [[0, Infinity]];
  },
  'sides[0].steps[0].points[0]',
  'expected two finite coordinates',
);
for (const field of ['qty', 'pax', 'need', 'rush'] as const)
  rejectNarrative(
    (content) => {
      content.sides[0]!.steps[0]![field] = -1;
    },
    `sides[0].steps[0].${field}`,
    'expected a finite positive number',
  );
for (const [field, kind] of [
  ['sys', 'system'],
  ['dest', 'stellar'],
  ['faction', 'faction'],
] as const)
  rejectNarrative(
    (content) => {
      content.sides[0]!.steps[0]![field] = 'absent';
      if (field === 'sys') delete content.sides[0]!.steps[0]!.dest;
    },
    `sides[0].steps[0].${field}`,
    `unknown ${kind} reference absent`,
  );
rejectNarrative(
  (content) => {
    content.chains[0]!.steps[0]!.hostile = 'absent';
  },
  'chains[0].steps[0].hostile',
  'unknown faction reference absent',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.hull = 999999;
  },
  'sides[0].steps[0].hull',
  'unknown hull reference 999999',
);
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.qty = 0;
  },
  'sides[0].steps[0].qty',
  'expected a finite positive number',
);
const fractionalCargo = narrativeFixture();
fractionalCargo.sides[0]!.steps[0]!.qty = 0.5;
assert.deepEqual(
  validateNarrativeContent(assets, fractionalCargo),
  [],
  'positive cargo need not be a whole tonne',
);
rejectNarrative(
  (content) => {
    Object.assign(content.story[0]!, { decision: 'd1', choices: [{ value: 'legal', label: '' }] });
  },
  'story[0].choices[0].label',
  'expected nonempty text',
  'shared/story.ts',
);
rejectNarrative(
  (content) => {
    Object.assign(content.story[0]!, {
      decision: 'd1',
      choices: [{ value: 'legal', label: 'Legal' }],
    });
    content.story.push({ ...structuredClone(content.story[0]!), id: 'different' });
  },
  'story[1].decision',
  'duplicate decision flag',
  'shared/story.ts',
);
const otherSystem = Object.keys(SYS).find((id) => id !== home.system)!;
rejectNarrative(
  (content) => {
    content.sides[0]!.steps[0]!.sys = otherSystem;
  },
  'sides[0].steps[0].dest',
  'destination does not belong to the step system',
);
for (const catalog of ['story', 'sides', 'chains'] as const) {
  const content = narrativeFixture();
  if (catalog === 'story') content.story.push(structuredClone(content.story[0]!));
  else if (catalog === 'sides') content.sides.push(structuredClone(content.sides[0]!));
  else content.chains.push(structuredClone(content.chains[0]!));
  const errors = validateNarrativeContent(assets, content);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.path, `${catalog}[1].id`);
  assert.match(errors[0]!.message, /duplicate id/);
}
const graph = narrativeFixture();
for (const id of ['left', 'right', 'root'])
  graph.sides.push({ ...structuredClone(graph.sides[0]!), id });
graph.sides[0]!.afterSides = ['left', 'right'];
graph.sides[1]!.afterSides = ['root'];
graph.sides[2]!.afterSides = ['root'];
graph.sides[0]!.afterStory = ['main-fixture'];
Object.assign(graph.story[0]!, { decision: 'd2', choices: [{ value: 'legal', label: 'Legal' }] });
graph.sides[0]!.flag = { key: 'd2', value: 'legal' };
assert.deepEqual(
  validateNarrativeContent(assets, graph),
  [],
  'shared prerequisite diamond is not a cycle',
);
graph.sides[3]!.afterSides = [SCIENTIST_STORY];
assert.deepEqual(
  validateNarrativeContent(assets, graph),
  [
    {
      source: 'shared/quests.ts',
      path: 'sides[3].afterSides[0]',
      message: 'cyclic side-story prerequisite',
    },
  ],
  'multi-node cycle fails',
);

const command = fileURLToPath(new URL('../tools/validate-content.ts', import.meta.url));
const run = (args: string[]) =>
  spawnSync(process.execPath, [command, ...args], { encoding: 'utf8', timeout: 10000 });
const success = run([]);
assert.equal(success.status, 0, success.stderr);
assert.match(success.stdout, /Content validation passed: \d+ ships/);
assert.match(success.stdout, /composed narrative catalogs/);
const failure = run([
  '--asset-root',
  fileURLToPath(new URL('./content-validation.ts/not-a-directory', import.meta.url)),
]);
assert.equal(failure.status, 1, failure.stderr);
assert.match(
  failure.stderr,
  /shared\/assets\.json ships\[703\]\.img: missing client\/assets\/ships\/703_yard.png/,
);
assert.match(failure.stderr, /Content validation failed/);
const usage = run(['--asset-root']);
assert.equal(usage.status, 2);
assert.match(usage.stderr, /Usage:/);
console.log(
  'Composed ship and narrative content, malformed references, prerequisite cycles, fitting and CLI diagnostics pass.',
);
