import { freightOffers } from '../server/freight-offers.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import allocation from '../shared/scenery-allocation.json' with { type: 'json' };
import manifest from '../client/assets/planets/planets.json' with { type: 'json' };
import additions from '../shared/diversity-worlds.json' with { type: 'json' };
import { bodyArtwork } from '../shared/body-artwork.ts';
import { landscapeScene } from '../shared/landscapes.ts';
import { SYS, STELLARS } from '../shared/galaxy.ts';

const exists = (file: string) =>
  assert.ok(fs.existsSync(new URL('../client/assets/' + file, import.meta.url)), file);
let irregular = 0;
for (const [systemId, entry] of Object.entries(allocation)) {
  assert.ok(SYS[systemId], systemId);
  for (const [id, body] of Object.entries(entry.bodies)) {
    assert.ok(STELLARS[id], id);
    assert.deepEqual(bodyArtwork(id), body);
    if ('shape' in body && body.shape === 'irregular') {
      irregular++;
      exists(`moons/${body.art}.webp`);
    } else {
      assert.ok(body.art in manifest, body.art);
      exists(`planets/${body.art}.webp`);
    }
    if ('landing' in body && typeof body.landing === 'string') exists(`land/${body.landing}.jpg`);
  }
  for (const station of Object.values(entry.stations)) {
    exists(`stations/s_${station.design}.webp`);
    exists(`stations/${station.landing}.webp`);
  }
  for (const background of entry.background) assert.ok(background.art in manifest, background.art);
  const clutter = entry.clutter;
  for (const image of [
    ...entry.sky.nebulae,
    ...entry.sky.galaxies,
    ...('far' in entry.sky ? [entry.sky.far] : []),
    ...clutter.small_wrecks,
    ...clutter.props,
    ...('massive_wreck' in clutter ? [clutter.massive_wreck] : []),
  ])
    exists(`decor/${image}.webp`);
  for (const image of [...clutter.rocks, ...clutter.shards]) exists(`objects/${image}.webp`);
}
assert.ok(irregular >= 13);
assert.equal(bodyArtwork('unknown-player-world'), undefined);
for (const addition of additions) {
  const body = STELLARS[addition.body.id];
  assert.equal(body.system, addition.system);
  assert.deepEqual(freightOffers(body, 0), [], 'Quiet worlds do not gain cargo boards');
  assert.ok(!body.site && !body.svc.includes('T') && !body.svc.includes('Y'));
  if (body.svc.includes('L')) exists(`land/${landscapeScene(body)}.jpg`);
}
for (const system of Object.values(SYS).filter(
  (system) => system.faction === 'deep' && system.gen && system.id !== 'the-unlight',
)) {
  assert.ok(
    !system.stellars.some((body) => body.svc?.includes('T')),
    'Deep scenery must not invent populated markets',
  );
}
console.log(
  `Authored diversity: ${Object.keys(allocation).length} systems, ${irregular} irregular moons, ${additions.length} quiet worlds; all references resolve.`,
);
