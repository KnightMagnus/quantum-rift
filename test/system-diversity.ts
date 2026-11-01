import scenes from '../shared/system-scenes.json' with { type: 'json' };
import { applySystemScene } from '../client/system-scenes.ts';
import type { DecorModel } from '../client/render.ts';
import { price } from '../shared/rules.ts';
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
      exists(`${body.art.startsWith('irr_') ? 'decor' : 'moons'}/${body.art}.webp`);
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
  for (const field of SYS[addition.system].fields || [])
    assert.ok(
      Math.hypot(field.x - body.x, field.y - body.y) >= field.r + body.r + 150,
      'Authored additions leave existing mining fields clear',
    );
  assert.equal(body.svc, addition.body.svc, 'Authored services are preserved');
  if (body.svc.includes('T')) {
    assert.ok(body.prices && Object.keys(body.prices).length >= 5);
    assert.ok(price(body, 'food', 0)! > 0, 'Trading ports have usable prices');
    assert.ok(Object.values(body.prices).every((level) => [-1, 0, 1].includes(level)));
  }
  if (!body.svc.includes('B')) assert.deepEqual(freightOffers(body, 0), []);
  if (body.svc.includes('L') && body.kind !== 'station') exists(`land/${landscapeScene(body)}.jpg`);
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
  `Authored diversity: ${Object.keys(allocation).length} systems, ${irregular} irregular moons, ${additions.length} authored additions; all references resolve.`,
);

const originalSystems = JSON.stringify(SYS);
assert.equal(Object.keys(scenes).length, 217);
for (const [systemId, scene] of Object.entries(scenes)) {
  const system = SYS[systemId];
  assert.ok(system);
  const decor = {
    sun: { x: 0, y: 0, size: 1 },
    hole: { x: 1 },
    pulsar: { x: 2 },
    arc: { x: 3 },
  } as DecorModel;
  applySystemScene(system, decor);
  assert.deepEqual(decor.sats, scene.orbit);
  assert.deepEqual(decor.derelict, scene.near);
  assert.deepEqual(decor.pods, []);
  assert.ok(scene.near.length <= 8, systemId + ': bounded clutter');
  for (const sprite of scene.near) {
    if (sprite.img.startsWith('mirror_ring')) continue;
    for (const body of system.stellars)
      assert.ok(
        Math.hypot(sprite.x - body.x, sprite.y - body.y) >= body.r + sprite.size * 0.35,
        `${systemId}: set pieces leave body approaches clear`,
      );
  }
  for (const satellite of decor.sats) {
    assert.ok(satellite.R > 0 && satellite.sp !== 0, systemId + ': moving orbiter');
    exists(
      satellite.img.startsWith('deco_')
        ? `stations/s_${satellite.img.slice(5)}.webp`
        : `decor/${satellite.img}.webp`,
    );
  }
  for (const sprite of [...decor.derelict, ...decor.neb, ...decor.gal])
    exists(
      sprite.img.startsWith('deco_')
        ? `stations/s_${sprite.img.slice(5)}.webp`
        : `decor/${sprite.img}.webp`,
    );
  if (system.scene) {
    assert.deepEqual(decor.hole, { x: 1 });
    assert.deepEqual(decor.pulsar, { x: 2 });
    assert.deepEqual(decor.arc, { x: 3 });
  } else assert.equal(decor.hole, null);
  const repeated = structuredClone(decor);
  applySystemScene(system, repeated);
  assert.deepEqual(repeated, decor, 'Scene application is stable');
}
assert.equal(
  JSON.stringify(SYS),
  originalSystems,
  'Rendering never changes gameplay radii or worlds/fields',
);
const unknown = { ...SYS.meridian, id: 'unknown-player-system' };
const untouched = {} as DecorModel;
applySystemScene(unknown, untouched);
assert.deepEqual(untouched, {}, 'Unknown systems retain generated scenery');
