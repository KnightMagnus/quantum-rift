import legacyWorlds from '../tools/landscape-legacy-worlds.json' with { type: 'json' };
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import worlds from '../shared/landscape-worlds.json' with { type: 'json' };
import inventory from '../tools/landscape-inventory.json' with { type: 'json' };
import portraits from '../tools/portrait-inventory.json' with { type: 'json' };
import { landscapeScene, colonyStage } from '../shared/landscapes.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { RIVALS } from '../shared/rivals.ts';
import { storyCharacter } from '../client/story-portraits.ts';
import {
  PORTRAITS,
  PLAYER_PORTRAITS,
  npcPortrait,
  genericPortrait,
  playerPortrait,
  portraitAsset,
  isPlayerPortrait,
} from '../shared/portraits.ts';

assert.equal(Object.keys(worlds).length, 179);
const explicitMigrations: Record<string, string> = {
  'gloam-remnant': 'gloam_remnant',
  inalumen: 'inalumen',
  slag: 'slag',
  'nightjar-refuge': 'nightjar_refuge',
};
for (const legacy of legacyWorlds) {
  const actualBase = landscapeScene(STELLARS[legacy.id]).split('__')[0];
  assert.equal(
    actualBase,
    'l_' + (explicitMigrations[legacy.id] || legacy.scene),
    `independent legacy identity ${legacy.id}`,
  );
}
const assets = new Set(inventory.map((item) => item.file));
assert.equal(inventory.length, 908);
assert.ok(inventory.every((item) => !item.file.startsWith('l_st_')));
for (const item of inventory.filter((item) => item.stage === 0)) {
  for (const stage of [1, 2, 3])
    assert.ok(assets.has(item.file.replace('.jpg', `_col${stage}.jpg`)), item.file);
}
for (const biome of [
  'terran',
  'city',
  'jungle',
  'ocean',
  'desert',
  'ice',
  'lava',
  'barren',
  'gas',
  'toxic',
  'crystal',
]) {
  const families = inventory.filter(
    (item) => item.kind === 'family' && item.stage === 0 && item.biome === biome,
  );
  assert.ok(families.length >= 4, biome);
  assert.equal(new Set(families.map((item) => item.sha256)).size, families.length, biome);
}
for (const [id, key] of Object.entries(worlds)) {
  const body = STELLARS[id];
  assert.ok(body && body.kind !== 'station', id);
  assert.equal(landscapeScene(body), key, id);
  for (const level of [0, 1, 2, 3, 4, 5, -1, NaN, 6, '2', null]) {
    const expected =
      typeof level === 'number' && level >= 1 && level <= 5 ? [0, 1, 2, 2, 3, 3][level] : 0;
    assert.equal(colonyStage(level), expected);
    assert.equal(landscapeScene(body, level), key + (expected ? `_col${expected}` : ''));
    assert.ok(assets.has(landscapeScene(body, level) + '.jpg'));
  }
}
for (const body of Object.values(STELLARS).filter((body) => body.kind === 'station'))
  assert.equal(landscapeScene(body, 5), '');
const future = { ...STELLARS.earth, id: 'future-ridge' };
assert.equal(landscapeScene(future), landscapeScene(structuredClone(future)));
assert.ok(assets.has(landscapeScene(future) + '.jpg'));
const futureCity = { ...future, desc: 'Garden city capital', id: 'future-city' };
const futureJungle = { ...future, desc: 'Jungle forest garden', id: 'future-jungle' };
assert.ok(
  ['l_city1', 'l_city2', 'l_city_harbor', 'l_city_terraces'].includes(landscapeScene(futureCity)),
);
assert.ok(
  ['l_jungle1', 'l_jungle2', 'l_jungle_delta', 'l_jungle_highlands'].includes(
    landscapeScene(futureJungle),
  ),
);
for (const item of inventory) {
  const bytes = fs.readFileSync(new URL('../client/assets/land/' + item.file, import.meta.url));
  assert.equal(bytes.length, item.bytes, item.file);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file);
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
}
assert.equal(PORTRAITS.length, 75);
for (const id of [
  'story-selani',
  'story-elders',
  'story-sailwright',
  'story-clerk',
  'story-prisoner',
]) {
  assert.ok(PORTRAITS.some((entry) => entry.id === id));
  assert.equal(isPlayerPortrait(id), false, 'story identities cannot be selected by players');
  assert.equal(PORTRAITS.find((entry) => entry.id === id)!.poolEligible, false);
}
assert.equal(storyCharacter({ id: 'qv2' })?.portrait, 'story-selani');
assert.equal(storyCharacter({ id: 'qv2', done: true })?.portrait, 'story-sailwright');
assert.equal(storyCharacter({ id: 'qv4', done: true })?.portrait, 'story-elders');
assert.equal(storyCharacter({ id: 'guests', done: true }), null, 'the Archive is not the clerk');
assert.equal(storyCharacter({ id: 'qv1', arc: 'concord' }), null);
assert.equal(storyCharacter({ id: '../bad' }), null);
const named = PORTRAITS.filter((entry) => entry.npcId);
assert.equal(named.length, 30);
assert.equal(new Set(named.map((entry) => entry.id)).size, 30);
assert.deepEqual(
  named
    .map((entry) => entry.npcId)
    .sort((left, right) => String(left).localeCompare(String(right))),
  RIVALS.map((rival) => rival.id).sort(),
);
for (const rival of RIVALS)
  assert.equal(
    npcPortrait({ rival: rival.id, faction: rival.fac, hull: 1 }, 'sol'),
    'npc-' + rival.id,
  );
for (const item of portraits.entries) {
  const bytes = fs.readFileSync(
    new URL('../client/assets/portraits/' + item.id + '.png', import.meta.url),
  );
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, item.id);
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
}
for (const invalid of [
  undefined,
  null,
  '',
  5,
  {},
  'npc-r0',
  'https://evil/a',
  '../a',
  '<script>',
]) {
  assert.equal(isPlayerPortrait(invalid), false);
  assert.equal(playerPortrait(invalid), PLAYER_PORTRAITS[0].id);
  assert.equal(portraitAsset(invalid).startsWith('portraits/'), true);
  assert.equal(portraitAsset(invalid).includes('..'), false);
}
for (const entry of PLAYER_PORTRAITS) assert.equal(isPlayerPortrait(entry.id), true);
assert.equal(
  genericPortrait('stable captain', 'spacer'),
  genericPortrait('stable captain', 'spacer'),
);
assert.ok(!genericPortrait('stable captain', 'unknown').startsWith('npc-'));
console.log(
  'Planet scene identities, colony stages, trusted portrait catalog and exact artwork payloads passed.',
);

const wanderingCaptain = { name: 'Stable generic captain', faction: 'spacer', hull: 1 };
const originalFace = npcPortrait(wanderingCaptain, 'qgate');
wanderingCaptain.hull = 2;
assert.equal(npcPortrait(wanderingCaptain, 'farreach'), originalFace);
assert.equal(
  npcPortrait({ ...wanderingCaptain }, 'sol'),
  originalFace,
  'named generic identity survives a reconstructed entity, travel and hull change',
);
const unnamedTraffic = { name: null, faction: 'spacer', hull: 1 };
const trafficFace = npcPortrait(unnamedTraffic, 'qgate');
assert.equal(
  npcPortrait(unnamedTraffic, 'farreach'),
  trafficFace,
  'active unnamed traffic retains its captured face across travel',
);
