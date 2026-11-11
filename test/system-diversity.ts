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
import { GENERATED_SPREAD } from '../shared/gen.ts';

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
  const spread = system.gen ? GENERATED_SPREAD : 1;
  assert.deepEqual(
    decor.derelict,
    scene.near.map((sprite) => ({ ...sprite, x: sprite.x * spread, y: sprite.y * spread })),
    systemId + ': set pieces spread with generated bodies',
  );
  assert.deepEqual(decor.pods, []);
  assert.ok(scene.near.length <= 8, systemId + ': bounded clutter');
  for (const sprite of decor.derelict) {
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
// The Deep uses its own horror sky and organic set pieces, with no human traffic props.
const deepNebulae = new Set(
  ['66', '67', '68', '69', '70', '71', '72', '73'].map((n) => `nebula_${n}`),
);
const deepFarHorrors = new Set([
  'far_eye',
  'far_maw',
  'far_black_sun',
  'far_heart',
  'far_tendril_star',
]);
const deepSetPieceUse = new Map<string, number>();
const deepSystems = Object.values(SYS).filter((system) => system.faction === 'deep');
assert.equal(deepSystems.length, 14);
for (const system of deepSystems) {
  const scene = scenes[system.id as keyof typeof scenes];
  assert.ok(scene, system.id + ': Deep system has an authored scene');
  assert.ok(scene.sky.nebulae.length > 0, system.id + ': Deep sky has gas');
  for (const nebula of scene.sky.nebulae)
    assert.ok(deepNebulae.has(nebula.img), `${system.id}: ${nebula.img} is a Deep nebula`);
  assert.ok(scene.sky.galaxies.length <= 1, system.id + ': at most one galaxy');
  assert.equal(scene.sky.far.length, 1, system.id + ': one far horror');
  assert.ok(deepFarHorrors.has(scene.sky.far[0].img), system.id + ': far layer is a Deep horror');
  assert.deepEqual(scene.orbit, [], system.id + ': no satellites in the Deep');
  const setPieces = scene.near.filter((sprite) => sprite.img.startsWith('deep_'));
  assert.ok(setPieces.length >= 1 && setPieces.length <= 2, system.id + ': one or two set pieces');
  for (const sprite of scene.near)
    assert.ok(
      !/^(pod|beacon|satellite)_/.test(sprite.img),
      `${system.id}: ${sprite.img} is not a human traffic prop`,
    );
  for (const sprite of setPieces)
    deepSetPieceUse.set(sprite.img, (deepSetPieceUse.get(sprite.img) || 0) + 1);
  // Large silhouettes stay apart: centres at least half their combined sprite sizes apart.
  // Small wrecks may still drift beside a large set piece.
  const spread = system.gen ? GENERATED_SPREAD : 1;
  const largeSprites = scene.near.filter((sprite) => sprite.size >= 300);
  for (const [index, first] of largeSprites.entries())
    for (const second of largeSprites.slice(index + 1)) {
      const distance = Math.hypot(first.x - second.x, first.y - second.y) * spread;
      assert.ok(
        distance >= (first.size + second.size) / 2,
        `${system.id}: ${first.img} and ${second.img} do not overlap (${Math.round(distance)} apart)`,
      );
    }
}
for (const [image, count] of deepSetPieceUse)
  assert.ok(count <= 2, `${image} appears in at most two Deep systems`);
assert.ok(
  Object.values(scenes).every(
    (scene) =>
      SYS[scene.id]?.faction === 'deep' ||
      scene.near.every((sprite) => !sprite.img.startsWith('deep_')),
  ),
  'Deep set pieces stay in the Deep',
);

const unknown = { ...SYS.meridian, id: 'unknown-player-system' };
const untouched = {} as DecorModel;
applySystemScene(unknown, untouched);
assert.deepEqual(untouched, {}, 'Unknown systems retain generated scenery');

// Frontier exotic scenery: every sprite in the set is placed, reuse stays rare and
// void jellies drift in orbit instead of sitting still.
const frontierExotics = [
  'far_einstein_ring',
  'far_magnetar',
  'far_wolf_rayet',
  'far_globular',
  'far_tidal_stream',
  'far_hypergiant',
  'far_eclipsing_binary',
  'far_light_echo',
  ...Array.from({ length: 10 }, (_, offset) => `nebula_${56 + offset}`),
  'geyser_0',
  'comet_nucleus_0',
  'filament_0',
  'mega_arc_0',
  'mega_panels_0',
  'monolith_0',
  'wormlet_0',
  'voidjelly_0',
  'voidjelly_1',
  'genship_0',
  'spores_0',
];
const exoticSystems = new Map(frontierExotics.map((image) => [image, new Set<string>()]));
for (const [systemId, scene] of Object.entries(scenes)) {
  const layers = [...scene.sky.nebulae, ...scene.sky.far, ...scene.near, ...scene.orbit];
  for (const layer of layers) exoticSystems.get(layer.img)?.add(systemId);
  for (const sprite of scene.near)
    assert.ok(!sprite.img.startsWith('voidjelly_'), `${systemId}: void jellies orbit a body`);
}
for (const [image, systemIds] of exoticSystems) {
  assert.ok(systemIds.size >= 1, `${image} appears in a scene`);
  assert.ok(systemIds.size <= (image === 'genship_0' ? 3 : 4), `${image} stays rare`);
  for (const systemId of systemIds)
    assert.equal(SYS[systemId].faction, 'frontier', `${image} stays in the Frontier`);
}
const frontierScenes = Object.values(SYS).filter((system) => system.faction === 'frontier');
assert.equal(frontierScenes.length, 48);
assert.ok(
  frontierScenes.every((system) => scenes[system.id as keyof typeof scenes]),
  'Every Frontier system has an authored scene',
);
console.log(`Frontier exotics: ${frontierExotics.length} sprites placed within reuse caps.`);
