import scenes from '../shared/system-scenes.json' with { type: 'json' };
import type { DecorModel, GalaxySystem } from './render.ts';

/** Authored placement data; gameplay bodies are registered separately by the galaxy catalog. */
export interface SystemScene {
  /** Stable galaxy system identity. */
  id: string;
  /** Artistic intent, not player-facing lore. */
  concept: string;
  /** Primary star; null leaves special multi-star and sunless skies intact. */
  sun: { type: string; x: number; y: number; size: number } | null;
  /** Station silhouettes keyed by existing stellar identity. */
  stations: Record<string, { design: string }>;
  /** Parallax layers positioned in the authored camera frame. */
  sky: {
    nebulae: DecorModel['neb'];
    galaxies: DecorModel['gal'];
    far: DecorModel['gal'];
    background: {
      art: string;
      x: number;
      y: number;
      size: number;
      depth: number;
      large: boolean;
    }[];
  };
  /** In-system, non-interactive set pieces. */
  near: DecorModel['derelict'];
  /** Moving orbiters replace random satellites, never gameplay radii. */
  orbit: DecorModel['sats'];
  /** Deterministic distant asteroid arc. */
  belt: { count: number; angle: number; arc: number; radius: number } | null;
  /** Decorative fragments, not salvage or mining fields. */
  debris: { x: number; y: number; count: number }[];
  /** Decorative ion cloud. */
  storm: { x: number; y: number; R: number; img: string } | null;
  /** Whether the generated comet is allowed. */
  comet: boolean;
}
const catalog: Record<string, SystemScene> = scenes;
const starColors: Record<string, [string, string]> = {
  yellow: ['255,244,220', '255,200,120'],
  orange: ['255,225,180', '255,150,70'],
  'red dwarf': ['255,170,140', '255,80,50'],
  white: ['255,255,255', '210,225,255'],
  'blue-white giant': ['225,240,255', '120,170,255'],
  'white dwarf': ['245,250,255', '190,215,255'],
  'red giant': ['255,190,150', '255,90,50'],
};

/** Unknown/player-created systems retain their procedural scenery. */
export function sceneFor(systemId: string): SystemScene | undefined {
  return catalog[systemId];
}

/** Replace incidental scenery without changing seeded generation or special system skies. */
export function applySystemScene(system: GalaxySystem, decor: DecorModel): void {
  const scene = sceneFor(system.id);
  if (!scene) return;
  if (scene.sun && decor.sun && !system.scene) {
    const colors = starColors[scene.sun.type] || starColors.yellow;
    Object.assign(decor.sun, scene.sun, { core: colors[0], halo: colors[1] });
  }
  decor.neb = scene.sky.nebulae.map((layer) => ({ ...layer }));
  decor.gal = [...scene.sky.galaxies, ...scene.sky.far].map((layer) => ({ ...layer }));
  if (!system.scene) {
    decor.hole = null;
    decor.pulsar = null;
    decor.arc = null;
  }
  decor.bgp = scene.sky.background.map((world, index) => ({
    p: {
      id: `bg:${system.id}:${index}`,
      art: world.art,
      kind: 'planet',
      r: world.large ? 140 : 70,
    },
    x: world.x,
    y: world.y,
    size: world.size,
    depth: world.depth,
    a: 0.92,
  }));
  decor.wreck = [];
  decor.ruin = [];
  decor.crystal = [];
  decor.pods = [];
  decor.derelict = scene.near.map((sprite) => ({ ...sprite }));
  decor.sats = scene.orbit.map((satellite) => ({ ...satellite }));
  const random = (key: string): number => {
    let hash = 0;
    for (const character of system.id + key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return (hash % 10000) / 10000;
  };
  const belt = scene.belt;
  decor.belt = belt
    ? {
        depth: 0.75,
        rocks: Array.from({ length: belt.count }, (_, index) => {
          const angle = belt.angle + (random('ba' + index) - 0.5) * belt.arc;
          const radius = belt.radius + (random('br' + index) - 0.5) * 500;
          return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            s: 8 + random('bs' + index) * 34,
            k: Math.floor(random('bk' + index) * 6),
            rot: random('bo' + index) * 6,
            sp: (random('bp' + index) - 0.5) * 0.4,
          };
        }),
      }
    : null;
  decor.debris = scene.debris.map((cloud, cloudIndex) => ({
    x: cloud.x,
    y: cloud.y,
    spin: 0.004,
    bits: Array.from({ length: cloud.count }, (_, index) => ({
      a: random('da' + cloudIndex + index) * 6.283,
      d: random('dd' + cloudIndex + index) * 420,
      s: 3 + random('ds' + cloudIndex + index) * 14,
      rot: random('dr' + index) * 6,
      sp: (random('dp' + index) - 0.5) * 0.6,
      hot: random('dh' + index) < 0.12,
    })),
  }));
  decor.storm = scene.storm ? { ...scene.storm, depth: 0.9 } : null;
  if (!scene.comet) decor.comet = null;
}
