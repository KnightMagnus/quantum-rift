import { assetImage } from './asset-resources.ts';
import { ByteBudgetCache } from './render-cache-budget.ts';
import { storyShipOpacity, storyScenery, reducedStoryEffects } from './story-reality.ts';
import type { RealityEnding, RealityFlags } from './story-reality.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import { FARSIDE } from '../shared/gen.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { EXPEDITION_HULK } from '../shared/expeditions.ts';
import type { GameAssets, WeaponAsset } from '../shared/rules.ts';
export type RenderShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  W?: WeaponAsset;
  col?: string;
  look?: string;
};
export type RenderRock = { id: number; x: number; y: number; r: number; ore: string; n?: number };
type Point = { x: number; y: number };
type StarBackdrop = {
  layers: { L: [number, number, number, number][]; depth: number; size: number }[];
  neb: [number, number, number, number][];
};
type DebrisBit = { a: number; d: number; s: number; sp: number; rot: number; hot?: boolean };
type DecorSprite = Point & { img: string; size: number; rot: number; spin: number };
type DecorLayer = Point & { img: string; size: number; rot: number; depth: number };
type DecorModel = {
  sun: (Point & { size: number; core: string; halo: string; depth: number }) | null;
  gal: (DecorLayer & { squash: number; a: number })[];
  hole: (Point & { size: number; rot: number; depth: number }) | null;
  pulsar: (Point & { spin: number; len: number; depth: number }) | null;
  giant: null;
  arc: DecorLayer | null;
  neb: (DecorLayer & { a: number })[];
  belt: {
    depth: number;
    rocks: (Point & { s: number; k: number; rot: number; sp: number })[];
  } | null;
  storm: (Point & { R: number; img: string; depth: number }) | null;
  derelict: DecorSprite[];
  wreck: (DecorSprite & { bits: DebrisBit[] })[];
  ruin: DecorSprite[];
  crystal: (DecorSprite & { ph: number })[];
  debris: (Point & { spin: number; bits: DebrisBit[] })[];
  comet: {
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    len: number;
    hue: string;
    period: number;
  } | null;
  sats: { cx: number; cy: number; R: number; a: number; sp: number; img: string; size: number }[];
  pods: (Point & { vx: number; vy: number; img: string; size: number; rot: number; sp: number })[];
  beacons: (Point & { col: string; ph: number })[];
  bgp?: (Point & { p: import('./planets.ts').PlanetDef; size: number; depth: number; a: number })[];
  meteorT: number;
  arena?: { R: number };
};
import type { ClientGameState, ClientView } from './main.ts';
import { captainMap } from './map-fog.ts';
import { laneKnown } from '../shared/map-knowledge.ts';
export type StellarBody = import('../shared/galaxy.ts').RawStellarBody & {
  /** Station visual design index */
  station?: number;

  /** Controlling faction identifier */
  faction?: string;
};
export type GalaxySystem = import('../shared/galaxy.ts').StarSystem;
export type CameraState = {
  /** Camera center X world position */
  cx: number;
  /** Camera center Y world position */
  cy: number;
  /** Zoom scale factor */
  z: number;
  /** Viewport width in pixels */
  W: number;
  /** Viewport height in pixels */
  H: number;
};
type EffectFlags = {
  hyper?: never;
  ring?: never;
  anim?: never;
  flare?: never;
  debris?: never;
  ball?: never;
  smoke?: never;
  num?: never;
};
type EffectVariant<KeyType extends keyof EffectFlags, ValueType> = Omit<EffectFlags, KeyType> &
  ValueType;
type EffectVelocity = { vx: number; vy: number } | { vx?: never; vy?: never };

/**
 * Visual effect variants use flags and animation identifiers to select their appearance.
 */
export type VisualEffect = {
  /** World X coordinate */
  x: number;

  /** World Y coordinate */
  y: number;

  /** Remaining lifetime in seconds. */
  life: number;

  /** Reference lifetime in seconds used to normalize effect progress. */
  max: number;

  /** Whether damage was dealt by or to the local player */
  mine?: boolean;
} & EffectVelocity &
  (
    | EffectVariant<
        'hyper',
        {
          hyper: true;
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
        }
      >
    | EffectVariant<
        'ring',
        {
          ring: true;
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
          /** Color hex or CSS string for sparks */
          c: string;
          fill?: boolean;
        }
      >
    | EffectVariant<
        'anim',
        {
          anim: 'boom_big' | 'boom_a' | 'boom_b';
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
          rot: number;
        }
      >
    | EffectVariant<
        'flare',
        {
          flare: true;
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
          /** Color hex or CSS string for sparks */
          c?: string;
        }
      >
    | EffectVariant<
        'debris',
        {
          debris: true;
          rot: number;
          vr: number;
          /** Radius or scale of explosion/blast */
          s: number;
          si?: number;
        }
      >
    | EffectVariant<
        'ball',
        {
          ball: true;
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
        }
      >
    | EffectVariant<
        'smoke',
        {
          smoke: true;
          /**
           * Blast radius
           * Radius or scale of explosion/blast
           */
          r: number;
          vx: number;
          vy: number;
        }
      >
    | EffectVariant<
        'num',
        {
          /** Damage number amount */
          num: number;
        }
      >
    | (EffectFlags & {
        /** Color hex or CSS string for sparks */
        c: string;
        /** Radius or scale of explosion/blast */
        s: number;
      })
  );
export type ShieldHit = {
  /** Remaining hit-flash lifetime in seconds. */
  t: number;
  /** World X coordinate of impact */
  hx: number;
  /** World Y coordinate of impact */
  hy: number;
};
export type MapFit = {
  /** World-space horizontal center used to derive the pixel horizontal offset. */
  cx: number;
  /** World-space vertical center used to derive the pixel vertical offset. */
  cy: number;
  /** Scale multiplier */
  k: number;
  fit: number;
};
export type MapTransform = {
  cx: number;
  cy: number;
  /** Zoom / scale factor */
  k: number;
  W: number;
  H: number;
};
export type ShipHull = import('../shared/rules.ts').ShipHullAsset;
export type RenderEntity = {
  /** Optional bounded Index form/roster metadata for late joiners. */
  indexState?: { slot: number; parent: number; transition: number; blades: number };
  /** Unique entity ID */
  id: number;

  /** Hull design identifier */
  hull: number;

  /** Smoothed / interpolated world X coordinate */
  rx: number;

  /** Smoothed / interpolated world Y coordinate */
  ry: number;

  /** Raw world X coordinate */
  x: number;

  /** Raw world Y coordinate */
  y: number;

  /** Heading angle in radians */
  a: number;

  /** Velocity X component */
  vx: number;

  /** Velocity Y component */
  vy: number;

  /** Entity status flags (thrust, ab, disabled, friendly, etc.) */
  fl: number;

  /** Current shield amount */
  sh: number;

  /** Current armor amount */
  ar: number;

  /** Faction identifier */
  fac: string;

  /** Captain or ship name */
  name?: string;

  /** Player owner ID if companion or drone */
  owner?: number;

  /** Public ending of this human captain; companions resolve their parent. */
  storyEnding?: RealityEnding;

  /** Power level or aura */
  pw?: number;

  /** Timestamp of last update */
  t?: number;
};
export type RenderShip = Pick<
  RenderEntity,
  'id' | 'hull' | 'rx' | 'ry' | 'a' | 'vx' | 'vy' | 'fl'
> &
  Partial<RenderEntity>;
import { drawTowing } from './towing_render.ts';
import { drawMining } from './mining_render.ts';
// Quantum Rift renderer: starfield, stellars, ship sprite sheets, shots, beams, effects, radar.
import { stationWheel } from './station_wheel.ts';
import { planetSprite } from './planets.ts';
import { drawStar } from './stars.ts';
import { drawExoticSky, drawPulseBoundary } from './exotic_scenery.ts';
import { missionTargets } from './missions.ts';
import { edgeArrowAnchor } from './edge-arrow.ts';
import type { ScreenRect } from './edge-arrow.ts';
import { drawShipChat, updateShipChat } from './chat_bubbles.ts';
import { loopFrames } from './animation_frames.ts';
import { WORMHOLE } from './wormhole_animation.ts';
import { shipBank } from './ship_banking.ts';
import { backgroundScale } from './background_scale.ts';
import { drawComet } from './comet.ts';
import { ANOMALIES } from '../shared/fronts.ts';
import { STATES } from '../shared/living.ts';
import { SYS as systemsById, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.ts';
import { weaponColor, weaponLook, price } from '../shared/rules.ts';

// ------------------------------------------------------------------ type definitions

// Map views (system map modes): colour each system by trade price, services, your standing, or danger
/**
 * Interpolates between two RGB color tuples.
 * @param firstValue Start RGB tuple
 * @param secondValue End RGB tuple
 * @param time Interpolation factor (0 to 1)
 * @returns Formatted rgb(r, g, b) string
 */
const interpolateColor = (
  firstValue: [number, number, number],
  secondValue: [number, number, number],
  time: number,
) =>
  `rgb(${firstValue.map((value, index) => Math.round(value + (secondValue[index] - value) * Math.max(0, Math.min(1, time)))).join(',')})`;
/**
 * Computes the best price-to-base ratio for a given commodity across a system's trade ports.
 * @param starSystem System object
 * @param captainId Commodity identifier
 * @returns Price ratio or null if no trade service available
 */
export function tradeRatio(starSystem: GalaxySystem, captainId: string): number | null {
  const rawStellarBodys = starSystem.stellars.filter(
    (stellarBody) => stellarBody.svc && stellarBody.svc.includes('T') && !stellarBody.site,
  );
  if (!rawStellarBodys.length) return null;
  const base = COMMODITIES.find((commodityDef) => commodityDef.id === captainId)!.base;
  let best = null;
  for (const stellarBody of rawStellarBodys) {
    const price2 = price(stellarBody, captainId);
    if (price2 !== null && (best === null || price2 < best)) best = price2;
  }
  return best === null ? null : best / base;
}
/**
 * Determines system display color on the map according to the selected map mode.
 * @param clientGameState Global client game state
 * @param starSystem System object
 * @param seen Whether the system has been visited or discovered
 * @returns CSS color string
 */
function viewColor(
  clientGameState: ClientGameState,
  starSystem: GalaxySystem,
  seen: boolean,
): string {
  const mode = clientGameState.mapMode || 'factions';
  if (mode === 'factions') return FACTIONS[starSystem.faction].color;
  if (!seen) return '#2a2e38';
  if (mode === 'trade') {
    const tradeRatio2 = tradeRatio(starSystem, clientGameState.mapCid || 'food');
    return tradeRatio2 === null
      ? '#3a3e48'
      : tradeRatio2 < 1
        ? interpolateColor([240, 220, 90], [60, 230, 110], (1 - tradeRatio2) / 0.25)
        : interpolateColor([240, 220, 90], [255, 80, 60], (tradeRatio2 - 1) / 0.25);
  }
  if (mode === 'services') {
    const positionY = starSystem.stellars.some(
        (stellarBody) => stellarBody.svc && stellarBody.svc.includes('Y'),
      ),
      options = starSystem.stellars.some(
        (stellarBody) => stellarBody.svc && stellarBody.svc.includes('O'),
      );
    return positionY && options
      ? '#c38aff'
      : positionY
        ? '#5ab0ff'
        : options
          ? '#ffaa4a'
          : '#3a3e48';
  }
  if (mode === 'standing') {
    const factionDef = FACTIONS[starSystem.faction];
    if (factionDef.region) return '#5a5e68';
    const reputation = (clientGameState.you && clientGameState.you.rep[starSystem.faction]) || 0;
    return reputation >= 0
      ? interpolateColor([200, 200, 120], [60, 230, 110], reputation / 60)
      : interpolateColor([200, 200, 120], [255, 60, 50], -reputation / 60);
  }
  if (mode === 'danger')
    return interpolateColor([90, 200, 120], [255, 50, 40], starSystem.danger / 6);
  return FACTIONS[starSystem.faction].color;
}

const faction2 = Object.keys(FACTIONS);
const riftBlend = document.createElement('canvas');
riftBlend.width = riftBlend.height = WORMHOLE.frameSize;
const riftBlendContext = riftBlend.getContext('2d')!;
/** Keep weighted atlas interpolation offscreen so the dark tear still covers stars. */
function drawQuantumRift(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  now: number,
) {
  const quantumRiftImg = assetImage('quantum_rift.png');
  if (!ready(quantumRiftImg)) return;
  const frames = loopFrames(now, WORMHOLE.frames, WORMHOLE.frameMs);
  riftBlendContext.clearRect(0, 0, WORMHOLE.frameSize, WORMHOLE.frameSize);
  riftBlendContext.globalCompositeOperation = 'lighter';
  for (const [frame, weight] of [
    [frames.first, 1 - frames.mix],
    [frames.second, frames.mix],
  ]) {
    riftBlendContext.globalAlpha = weight;
    riftBlendContext.drawImage(
      quantumRiftImg,
      (frame % 8) * 320,
      Math.floor(frame / 8) * 320,
      320,
      320,
      0,
      0,
      320,
      320,
    );
  }
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.drawImage(riftBlend, x - size / 2, y - size / 2, size, size);
  context.restore();
}
type StorySequence = { kind: 'ark-departure' | 'rift-crossing'; began: number };
const storySequences = new WeakMap<ClientGameState, StorySequence>();
const previousStorySystem = new WeakMap<ClientGameState, string | null>();
/** Presentation hook; it cannot move the ship, fit equipment or commit story progress. */
export function startStorySequence(
  state: ClientGameState,
  kind: StorySequence['kind'],
  now = performance.now(),
): void {
  storySequences.set(state, { kind, began: now });
}
/**
 * Loads or retrieves a cached sprite sheet image for a given ship hull.
 * @param shipHullAsset Ship hull specification object
 * @param glow Whether to load the thruster glow variant
 * @returns Cached or newly requested HTML Image
 */
export function sheet(shipHullAsset: ShipHull, glow?: boolean): HTMLImageElement {
  return assetImage(
    `ships/${shipHullAsset.id}${glow ? '_glow' : ''}.${shipHullAsset.spr ? 'webp' : 'png'}`,
  );
}
const HUB_FRAMES = 18,
  HUB_PERIOD = 150; // seconds for one full turn

/**
 * Creates a deterministic pseudorandom number generator function from a seed.
 * @param seed Integer seed value
 * @returns Generator returning floats in [0, 1)
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 7;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
/**
 * Hashes a string using 32-bit FNV-1a.
 * @param text Input string
 * @returns Unsigned 32-bit hash value
 */
function hashStr(text: string): number {
  let height = 2166136261;
  for (const text2 of text) {
    height ^= text2.charCodeAt(0);
    height = Math.imul(height, 16777619);
  }
  return height >>> 0;
}

// ------------------------------------------------------------------ backdrops
const starCache = new Map<string, StarBackdrop>();
/**
 * Generates and caches parallax star layers and faint nebulae for a solar system.
 * @param systemId System identifier
 * @returns Star backdrop model
 */
function stars(systemId: string): {
  layers: Array<{ L: Array<[number, number, number, number]>; depth: number; size: number }>;
  neb: Array<[number, number, number, number]>;
} {
  if (starCache.has(systemId)) return starCache.get(systemId)!;
  const randomGenerator = seeded(hashStr(systemId)),
    layers = [];
  for (const [count, depth, size] of [
    [260, 0.15, 1],
    [160, 0.35, 1.3],
    [70, 0.6, 1.8],
  ]) {
    const length: [number, number, number, number][] = [];
    for (let index = 0; index < count; index++)
      length.push([
        randomGenerator() * 2048,
        randomGenerator() * 2048,
        0.35 + randomGenerator() * 0.65,
        randomGenerator(),
      ]);
    layers.push({ L: length, depth, size });
  }
  const nebula: [number, number, number, number][] = [];
  for (let index = 0; index < 4; index++)
    nebula.push([
      randomGenerator() * 6000 - 3000,
      randomGenerator() * 6000 - 3000,
      900 + randomGenerator() * 1600,
      randomGenerator(),
    ]);
  const value = { layers, neb: nebula };
  starCache.set(systemId, value);
  return value;
}
// ------------------------------------------------------------------ 2.2 scenery: every system gets its own sky and its own clutter, seeded from its id.
// Scenery: every system gets its own sky and its own clutter, seeded from its id.
// Far (barely moves): the system's star, galaxies, a black hole or pulsar, gas giants, megastructure arcs. Middle: gas clouds,
// asteroid drifts, ion storms. Near (in the system itself): abandoned stations, ancient wrecks, ring ruins, crystal formations,
// debris fields, comets, relay satellites, cargo pods and nav beacons.
/**
 * Loads and caches background decor assets by filename.
 * @param count Asset filename key
 * @returns HTML Image instance
 */
function decorImg(count: string): HTMLImageElement {
  return assetImage(`decor/${count}.webp`);
}
/**
 * Checks whether an image has completely loaded and has positive natural dimensions.
 * @param htmlImageElement Image element to test
 * @returns True if ready to draw
 */
const ready = (htmlImageElement: HTMLImageElement) =>
  htmlImageElement.complete && htmlImageElement.naturalWidth;
const decorCache = new Map<string, DecorModel>();
const NEB_BY_FAC: Record<string, number[]> = {
  umbral: [7, 1],
  deep: [4, 7, 0],
  farside: [6, 5, 3],
  vashari: [3, 6],
  korrund: [2, 6],
  ylith: [0, 5, 3],
  thalassi: [0, 5],
  sarn: [2, 7],
  quevari: [6, 5, 0],
  hollow: [1, 7],
  frontier: [2, 3, 6],
};
const SUNS = [
  ['255,244,220', '255,200,120'],
  ['255,230,170', '255,160,70'],
  ['255,190,140', '255,110,60'],
  ['210,230,255', '140,180,255'],
  ['255,255,255', '200,220,255'],
];
/**
 * Loads and caches rendered 3D object images (asteroids, minerals, crates).
 * @param count Object name identifier
 * @returns Cached or newly created image
 */
export function objImg(count: string): HTMLImageElement {
  return assetImage(`objects/${count}.webp`);
}
let rockSprites: HTMLCanvasElement[] | null = null;
/**
 * Generates or retrieves procedural canvas textures for background asteroids.
 * @param entryKey Asteroid variant index
 * @returns Off-screen canvas sprite
 */
function rockSprite(entryKey: number): HTMLCanvasElement {
  // a few dark, lumpy background asteroids, drawn once
  if (!rockSprites)
    rockSprites = Array.from({ length: 6 }, (unused, index) => {
      const randomGenerator = seeded(77 + index),
        htmlCanvasElement = document.createElement('canvas');
      htmlCanvasElement.width = htmlCanvasElement.height = 64;
      const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!;
      canvasRenderingContext2D.beginPath();
      const count = 9 + index;
      for (let innerIndex = 0; innerIndex < count; innerIndex++) {
        const firstValue = (innerIndex / count) * 6.283,
          distance = 18 + randomGenerator() * 12;
        innerIndex
          ? canvasRenderingContext2D.lineTo(
              32 + Math.cos(firstValue) * distance,
              32 + Math.sin(firstValue) * distance,
            )
          : canvasRenderingContext2D.moveTo(
              32 + Math.cos(firstValue) * distance,
              32 + Math.sin(firstValue) * distance,
            );
      }
      canvasRenderingContext2D.closePath();
      const canvasGradient = canvasRenderingContext2D.createLinearGradient(10, 10, 54, 54);
      canvasGradient.addColorStop(0, '#6a645e');
      canvasGradient.addColorStop(1, '#1c1a19');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.fill();
      return htmlCanvasElement;
    });
  return rockSprites[entryKey % 6];
}
/**
 * Procedurally generates and caches all ambient scenery and backdrop objects for a solar system.
 * @param starSystem Solar system specification
 * @returns System scenery definitions object
 */
function decorFor(starSystem: GalaxySystem): DecorModel {
  if (decorCache.has(starSystem.id)) return decorCache.get(starSystem.id)!;
  if (starSystem.arena) {
    // the Crucible has its own look: a ring of pylons in Azure and Crimson, dark crimson nebulae, no borrowed worlds
    const randomGenerator = seeded(hashStr('crucible')),
      decorModel: DecorModel = {
        sun: { x: 380, y: -260, size: 110, core: '255,216,208', halo: '255,90,80', depth: 0.03 },
        gal: [],
        hole: null,
        pulsar: null,
        giant: null,
        arc: null,
        neb: [],
        belt: null,
        storm: null,
        derelict: [],
        wreck: [],
        ruin: [],
        crystal: [],
        debris: [],
        comet: null,
        sats: [],
        pods: [],
        beacons: [],
        bgp: [],
        meteorT: 99,
        arena: { R: 1150 },
      };
    decorModel.neb.push(
      { img: 'nebula_7', x: -700, y: 100, size: 2600, rot: 0.4, a: 0.6, depth: 0.25 },
      { img: 'nebula_1', x: 800, y: 200, size: 2400, rot: 2.1, a: 0.5, depth: 0.25 },
    );
    decorModel.arc = { img: 'arc_1', x: 0, y: -700, size: 1400, rot: 0, depth: 0.14 };
    for (let index = 0; index < 36; index++) {
      const firstValue = (index / 36) * 6.283;
      decorModel.beacons.push({
        x: Math.cos(firstValue) * 1150,
        y: Math.sin(firstValue) * 1150,
        col: Math.cos(firstValue) < 0 ? '#5aa8ff' : '#ff5a4a',
        ph: index * 0.35,
      });
    }
    decorModel.debris.push({
      x: 0,
      y: 0,
      spin: 0.002,
      bits: Array.from({ length: 18 }, () => ({
        a: randomGenerator() * 6.283,
        d: 420 + randomGenerator() * 700,
        s: 3 + randomGenerator() * 6,
        sp: (randomGenerator() - 0.5) * 0.03,
        rot: randomGenerator() * 6,
      })),
    });
    decorCache.set(starSystem.id, decorModel);
    return decorModel;
  }
  const currentRandomGenerator = seeded(hashStr('decor:' + starSystem.id)),
    pick = <ValueType>(firstValue: readonly ValueType[]): ValueType =>
      firstValue[Math.floor(currentRandomGenerator() * firstValue.length)],
    wild = ['frontier', 'deep', 'umbral'].includes(starSystem.faction) || starSystem.farside;
  const decorModel2: DecorModel = {
    sun: null,
    gal: [],
    hole: null,
    pulsar: null,
    giant: null,
    arc: null,
    neb: [],
    belt: null,
    storm: null,
    derelict: [],
    wreck: [],
    ruin: [],
    crystal: [],
    debris: [],
    comet: null,
    sats: [],
    pods: [],
    beacons: [],
    meteorT: currentRandomGenerator() * 10,
  };
  const clear = (positionX: number, positionY: number, message: number) =>
    starSystem.stellars.every(
      (stellarBody) =>
        Math.hypot(stellarBody.x - positionX, stellarBody.y - positionY) >
        (stellarBody.r || 80) + message,
    ) && Math.hypot(positionX, positionY) > 500;
  const spot = (
    minimumRadius: number,
    maximumRadius: number,
    message: number,
  ): [number, number] | null => {
    for (let index = 0; index < 30; index++) {
      const firstValue = currentRandomGenerator() * 6.283,
        distance = minimumRadius + currentRandomGenerator() * (maximumRadius - minimumRadius),
        positionX = Math.cos(firstValue) * distance,
        positionY = Math.sin(firstValue) * distance;
      if (clear(positionX, positionY, message)) return [positionX, positionY];
    }
    return null;
  };
  const pick2 = pick(SUNS);
  decorModel2.sun = {
    x: (currentRandomGenerator() - 0.5) * 1800,
    y: (currentRandomGenerator() - 0.5) * 1400,
    size: 140 + currentRandomGenerator() * 220,
    core: pick2[0],
    halo: pick2[1],
    depth: 0.04,
  };
  const noiseGradient =
    currentRandomGenerator() < 0.18 ? 0 : currentRandomGenerator() < 0.7 ? 1 : 2;
  for (let index = 0; index < noiseGradient; index++)
    decorModel2.gal.push({
      img: 'galaxy_' + Math.floor(currentRandomGenerator() * 6),
      x: (currentRandomGenerator() - 0.5) * 2600,
      y: (currentRandomGenerator() - 0.5) * 2000,
      size: 120 + currentRandomGenerator() * 220,
      rot: currentRandomGenerator() * 6.283,
      squash: 0.35 + currentRandomGenerator() * 0.65,
      a: 0.28 + currentRandomGenerator() * 0.27,
      depth: 0.02 + currentRandomGenerator() * 0.03,
    });
  if (currentRandomGenerator() < (wild ? 0.25 : 0.04))
    decorModel2.hole = {
      x: (currentRandomGenerator() - 0.5) * 2400,
      y: (currentRandomGenerator() - 0.5) * 1800,
      size: 260 + currentRandomGenerator() * 260,
      rot: (currentRandomGenerator() - 0.5) * 0.8,
      depth: 0.05,
    };
  else if (currentRandomGenerator() < 0.06)
    decorModel2.pulsar = {
      x: (currentRandomGenerator() - 0.5) * 2400,
      y: (currentRandomGenerator() - 0.5) * 1800,
      spin: 0.6 + currentRandomGenerator() * 1.4,
      len: 260 + currentRandomGenerator() * 260,
      depth: 0.05,
    };
  decorModel2.bgp = []; // background worlds painted by the planet renderer, unique to every system
  const backgroundTypes: [string, number, number, number, number][] = [
    ['gas giant ringed rings', 0, 360, 0.35, 0.65],
    ['gas giant storm bands', 0, 360, 0.3, 0.55],
    ['ice giant gas giant', 180, 230, 0.25, 0.6],
    ['volcanic lava world', 0, 25, 0.6, 0.4],
    ['ocean world seas', 190, 225, 0.55, 0.45],
    ['desert dunes', 25, 45, 0.5, 0.55],
    ['toxic acid swamp', 70, 110, 0.5, 0.45],
    ['crystal glass world', 260, 320, 0.45, 0.6],
    ['barren airless rock', 0, 360, 0.05, 0.5],
    ['jungle garden world', 90, 140, 0.45, 0.4],
    ['frozen ice world', 185, 210, 0.15, 0.75],
  ];
  const hsl2hex = (height: number, state: number, length: number) => {
    const entryKey = (count: number) => (count + height / 30) % 12,
      firstValue = state * Math.min(length, 1 - length),
      factionId = (count: number) =>
        length - firstValue * Math.max(-1, Math.min(entryKey(count) - 3, 9 - entryKey(count), 1));
    return (
      '#' +
      [factionId(0), factionId(8), factionId(4)]
        .map((value) =>
          Math.round(value * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  };
  const bgWorld = (entryKey: number, large: boolean) => {
    const time =
        large && currentRandomGenerator() < 0.62
          ? backgroundTypes[Math.floor(currentRandomGenerator() * 3)]
          : backgroundTypes[Math.floor(currentRandomGenerator() * backgroundTypes.length)],
      height = time[1] + currentRandomGenerator() * (time[2] - time[1]),
      saturation = Math.max(0.03, time[3] + (currentRandomGenerator() - 0.5) * 0.2),
      luminance = time[4] + (currentRandomGenerator() - 0.5) * 0.15;
    return {
      p: {
        id: `bg:${starSystem.id}:${entryKey}`,
        kind: 'planet',
        color: hsl2hex(height, saturation, luminance),
        desc: time[0],
        name: '',
        r: large ? 120 + currentRandomGenerator() * 40 : 50 + currentRandomGenerator() * 40,
        svc: '',
        tech: 0,
      },
      x: (currentRandomGenerator() - 0.5) * 3200,
      y: (currentRandomGenerator() - 0.5) * 2600,
      size: large ? 260 + currentRandomGenerator() * 460 : 70 + currentRandomGenerator() * 120,
      depth: large
        ? 0.08 + currentRandomGenerator() * 0.05
        : 0.03 + currentRandomGenerator() * 0.03,
      a: 0.8 + currentRandomGenerator() * 0.15,
    };
  };
  if (currentRandomGenerator() < 0.62) decorModel2.bgp.push(bgWorld(0, true));
  if (currentRandomGenerator() < 0.38) decorModel2.bgp.push(bgWorld(1, false));
  if (currentRandomGenerator() < 0.12) decorModel2.bgp.push(bgWorld(2, false));
  if (currentRandomGenerator() < (wild ? 0.2 : 0.07))
    decorModel2.arc = {
      img: 'arc_' + Math.floor(currentRandomGenerator() * 2),
      x: (currentRandomGenerator() - 0.5) * 4000,
      y: (currentRandomGenerator() - 0.5) * 3200,
      size: 900 + currentRandomGenerator() * 700,
      rot: currentRandomGenerator() * 6.283,
      depth: 0.14,
    }; // smaller, now that it is detailed
  const faction3 = starSystem.farside ? 'farside' : starSystem.faction,
    pool = NEB_BY_FAC[faction3] || [0, 1, 2, 3, 4, 5, 6, 7],
    noise = 1 + Math.floor(currentRandomGenerator() * 3) + (starSystem.danger >= 3 ? 1 : 0);
  for (let index = 0; index < noise; index++)
    decorModel2.neb.push({
      img:
        'nebula_' +
        (currentRandomGenerator() < 0.7 ? pick(pool) : Math.floor(currentRandomGenerator() * 8)),
      x: (currentRandomGenerator() - 0.5) * 7000,
      y: (currentRandomGenerator() - 0.5) * 7000,
      size: 1300 + currentRandomGenerator() * 1900,
      rot: currentRandomGenerator() * 6.283,
      a: 0.5 + currentRandomGenerator() * 0.35,
      depth: 0.18 + currentRandomGenerator() * 0.3,
    });
  if (currentRandomGenerator() < 0.38) {
    const initialAngle = currentRandomGenerator() * 6.283,
      radius = 1800 + currentRandomGenerator() * 2200;
    decorModel2.belt = {
      depth: 0.7 + currentRandomGenerator() * 0.15,
      rocks: Array.from({ length: 30 + Math.floor(currentRandomGenerator() * 40) }, () => {
        const firstValue = initialAngle + (currentRandomGenerator() - 0.5) * 1.6;
        return {
          x: Math.cos(firstValue) * (radius + (currentRandomGenerator() - 0.5) * 500),
          y: Math.sin(firstValue) * (radius + (currentRandomGenerator() - 0.5) * 500),
          s: 8 + currentRandomGenerator() * 34,
          k: Math.floor(currentRandomGenerator() * 6),
          rot: currentRandomGenerator() * 6,
          sp: (currentRandomGenerator() - 0.5) * 0.4,
        };
      }),
    };
  }
  if (currentRandomGenerator() < 0.08 + 0.05 * starSystem.danger)
    decorModel2.storm = {
      x: (currentRandomGenerator() - 0.5) * 5000,
      y: (currentRandomGenerator() - 0.5) * 5000,
      R: 900 + currentRandomGenerator() * 900,
      img: 'nebula_' + pick([0, 5, 4]),
      depth: 0.9,
    };
  if (currentRandomGenerator() < 0.26) {
    const spot2 = spot(1300, 3200, 600);
    if (spot2)
      decorModel2.derelict.push({
        img: 'derelict_' + Math.floor(currentRandomGenerator() * 4),
        x: spot2[0],
        y: spot2[1],
        size: 380 + currentRandomGenerator() * 260,
        rot: currentRandomGenerator() * 6.283,
        spin: (currentRandomGenerator() - 0.5) * 0.01,
      });
  }
  const wreckOdds = 0.32 + 0.1 * starSystem.danger + (wild ? 0.2 : 0);
  for (let index = 0; index < 2; index++)
    if (currentRandomGenerator() < wreckOdds * (index ? 0.4 : 1)) {
      const spot3 = spot(1200, 3400, 700);
      if (spot3)
        decorModel2.wreck.push({
          img: 'wreck_' + Math.floor(currentRandomGenerator() * 6),
          x: spot3[0],
          y: spot3[1],
          size: 650 + currentRandomGenerator() * 650,
          rot: currentRandomGenerator() * 6.283,
          spin: (currentRandomGenerator() - 0.5) * 0.004,
          bits: Array.from({ length: 10 + Math.floor(currentRandomGenerator() * 10) }, () => ({
            a: currentRandomGenerator() * 6.283,
            d: 0.35 + currentRandomGenerator() * 0.5,
            s: 3 + currentRandomGenerator() * 9,
            sp: (currentRandomGenerator() - 0.5) * 0.03,
            rot: currentRandomGenerator() * 6,
          })),
        });
    }
  if (currentRandomGenerator() < 0.13 + (starSystem.farside ? 0.3 : 0)) {
    const spot4 = spot(1600, 3600, 900);
    if (spot4)
      decorModel2.ruin.push({
        img: 'ruin_' + Math.floor(currentRandomGenerator() * 2),
        x: spot4[0],
        y: spot4[1],
        size: 1100 + currentRandomGenerator() * 700,
        rot: currentRandomGenerator() * 6.283,
        spin: (currentRandomGenerator() - 0.5) * 0.002,
      });
  }
  if (
    currentRandomGenerator() <
    (['ylith', 'frontier', 'deep'].includes(starSystem.faction) || starSystem.farside ? 0.45 : 0.14)
  ) {
    const spot5 = spot(900, 3200, 400);
    if (spot5)
      for (
        let index = 0, count = 1 + Math.floor(currentRandomGenerator() * 3);
        index < count;
        index++
      )
        decorModel2.crystal.push({
          img: 'crystal_' + Math.floor(currentRandomGenerator() * 3),
          x: spot5[0] + (currentRandomGenerator() - 0.5) * 500,
          y: spot5[1] + (currentRandomGenerator() - 0.5) * 500,
          size: 140 + currentRandomGenerator() * 220,
          rot: currentRandomGenerator() * 6.283,
          spin: (currentRandomGenerator() - 0.5) * 0.02,
          ph: currentRandomGenerator() * 6,
        });
  }
  if (currentRandomGenerator() < 0.3 + 0.06 * starSystem.danger) {
    const spot6 = spot(800, 3000, 300);
    if (spot6)
      decorModel2.debris.push({
        x: spot6[0],
        y: spot6[1],
        spin: (currentRandomGenerator() - 0.5) * 0.01,
        bits: Array.from({ length: 25 + Math.floor(currentRandomGenerator() * 30) }, () => ({
          a: currentRandomGenerator() * 6.283,
          d: currentRandomGenerator() * 420,
          s: 3 + currentRandomGenerator() * 14,
          rot: currentRandomGenerator() * 6,
          sp: (currentRandomGenerator() - 0.5) * 0.6,
          hot: currentRandomGenerator() < 0.12,
        })),
      });
  }
  if (currentRandomGenerator() < 0.3) {
    const firstValue = currentRandomGenerator() * 6.283;
    decorModel2.comet = {
      x0: Math.cos(firstValue) * 5200,
      y0: Math.sin(firstValue) * 5200,
      vx:
        -Math.cos(firstValue + (currentRandomGenerator() - 0.5) * 0.9) *
        (14 + currentRandomGenerator() * 16),
      vy:
        -Math.sin(firstValue + (currentRandomGenerator() - 0.5) * 0.9) *
        (14 + currentRandomGenerator() * 16),
      len: 380 + currentRandomGenerator() * 520,
      hue: currentRandomGenerator() < 0.5 ? '170,220,255' : '190,255,230',
      period: 900,
    };
  }
  for (const stellarBody of starSystem.stellars) {
    if (stellarBody.svc && stellarBody.svc.includes('L') && currentRandomGenerator() < 0.7)
      for (let index = 0; index < 2; index++)
        decorModel2.beacons.push({
          x:
            stellarBody.x +
            Math.cos(currentRandomGenerator() * 6.283) *
              ((stellarBody.r || 80) + 140 + currentRandomGenerator() * 140),
          y:
            stellarBody.y +
            Math.sin(currentRandomGenerator() * 6.283) *
              ((stellarBody.r || 80) + 140 + currentRandomGenerator() * 140),
          col: index ? '#ff4a3a' : '#5aff8a',
          ph: currentRandomGenerator() * 6.283,
        });
    if (
      (stellarBody.kind === 'planet' || stellarBody.kind === 'moon') &&
      currentRandomGenerator() < 0.55
    )
      decorModel2.sats.push({
        cx: stellarBody.x,
        cy: stellarBody.y,
        R: (stellarBody.r || 100) + 90 + currentRandomGenerator() * 120,
        a: currentRandomGenerator() * 6.283,
        sp: (currentRandomGenerator() < 0.5 ? 1 : -1) * (0.02 + currentRandomGenerator() * 0.04),
        img: 'satellite_' + Math.floor(currentRandomGenerator() * 3),
        size: 30 + currentRandomGenerator() * 22,
      });
  }
  if (currentRandomGenerator() < 0.45)
    for (
      let index = 0, count = 2 + Math.floor(currentRandomGenerator() * 4);
      index < count;
      index++
    )
      decorModel2.pods.push({
        x: (currentRandomGenerator() - 0.5) * 5000,
        y: (currentRandomGenerator() - 0.5) * 5000,
        vx: (currentRandomGenerator() - 0.5) * 6,
        vy: (currentRandomGenerator() - 0.5) * 6,
        img: 'pod_' + Math.floor(currentRandomGenerator() * 3),
        size: 24 + currentRandomGenerator() * 18,
        rot: currentRandomGenerator() * 6,
        sp: (currentRandomGenerator() - 0.5) * 0.4,
      });
  // Authored Eventide sightlines are fixed after seeded generation: legacy scenery
  // consumes precisely the same RNG and new ports always frame their signature sky.
  if (starSystem.eventide)
    decorModel2.sun = { ...decorModel2.sun, x: 0, y: -210, size: 190, depth: 0.025 };
  if (starSystem.id === EXPEDITION_HULK.system)
    decorModel2.derelict = [
      {
        img: 'derelict_0',
        x: EXPEDITION_HULK.x,
        y: EXPEDITION_HULK.y,
        size: EXPEDITION_HULK.size,
        rot: 0,
        spin: 0,
      },
    ];
  decorCache.set(starSystem.id, decorModel2);
  return decorModel2;
}
/**
 * Projects a distant background object's coordinates into screen space using parallax depth.
 * @param options Object with position and depth factor
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param centerX Camera center X
 * @param centerY Camera center Y
 * @param zoomFactor Zoom scale factor for far objects
 * @returns Screen coordinates [x, y]
 */
function farXY(
  options: { x: number; y: number; depth: number },
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  zoomFactor: number,
): [number, number] {
  return [
    width / 2 + (options.x - centerX * options.depth) * zoomFactor,
    height / 2 + (options.y - centerY * options.depth) * zoomFactor,
  ];
}
/**
 * Renders deepest background elements: primary star, distant galaxies, pulsars, and nebulae.
 * @param canvasRenderingContext2D 2D rendering context
 * @param starSystem Solar system specification
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param positionZ Camera zoom level
 * @param centerX Camera center X
 * @param centerY Camera center Y
 * @param currentTime Timestamp in milliseconds
 */
function drawDecorFar(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  starSystem: GalaxySystem,
  width: number,
  height: number,
  positionZ: number,
  centerX: number,
  centerY: number,
  currentTime: number,
): void {
  const decorModel = decorFor(starSystem),
    zoomFactor = Math.pow(positionZ, 0.25),
    time = currentTime / 1000;
  {
    const state = decorModel.sun!,
      [positionX, positionY] = farXY(state, width, height, centerX, centerY, zoomFactor),
      radius = state.size * zoomFactor; // the system's star, far off, with a soft lens flare
    if (
      positionX > -radius * 3 &&
      positionY > -radius * 3 &&
      positionX < width + radius * 3 &&
      positionY < height + radius * 3
    ) {
      if (
        starSystem.scene &&
        ['binary', 'blackhole', 'rogue', 'pulsar'].includes(starSystem.scene.kind)
      )
        drawExoticSky(
          canvasRenderingContext2D,
          starSystem,
          positionX,
          positionY,
          radius,
          currentTime,
        );
      else {
        drawStar(
          canvasRenderingContext2D,
          starSystem,
          state,
          positionX,
          positionY,
          radius,
          currentTime,
        );
        if (starSystem.scene)
          drawExoticSky(
            canvasRenderingContext2D,
            starSystem,
            positionX + radius * 2,
            positionY + radius * 0.8,
            radius * 0.7,
            currentTime,
          );
      }
    }
  }
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  for (const game of decorModel.gal) {
    const htmlImageElement = decorImg(game.img);
    if (!ready(htmlImageElement)) continue;
    const [positionX, positionY] = farXY(game, width, height, centerX, centerY, zoomFactor),
      state = game.size * zoomFactor;
    if (
      positionX < -state ||
      positionY < -state ||
      positionX > width + state ||
      positionY > height + state
    )
      continue;
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.rotate(game.rot);
    canvasRenderingContext2D.scale(1, game.squash);
    canvasRenderingContext2D.globalAlpha = game.a;
    canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -state / 2, state, state);
    canvasRenderingContext2D.restore();
  }
  if (decorModel.pulsar && !starSystem.scene) {
    const pulsar2 = decorModel.pulsar,
      [positionX, positionY] = farXY(pulsar2, width, height, centerX, centerY, zoomFactor),
      length = pulsar2.len * zoomFactor,
      firstValue = time * pulsar2.spin; // two lighthouse beams sweeping round
    if (
      positionX > -length &&
      positionY > -length &&
      positionX < width + length &&
      positionY < height + length
    )
      for (const secondState of [0, Math.PI]) {
        const unitX = Math.cos(firstValue + secondState),
          unitY = Math.sin(firstValue + secondState) * 0.45,
          canvasGradient = canvasRenderingContext2D.createLinearGradient(
            positionX,
            positionY,
            positionX + unitX * length,
            positionY + unitY * length,
          );
        canvasGradient.addColorStop(0, 'rgba(200,225,255,.6)');
        canvasGradient.addColorStop(1, 'rgba(120,170,255,0)');
        canvasRenderingContext2D.fillStyle = canvasGradient;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(positionX, positionY);
        canvasRenderingContext2D.lineTo(
          positionX + unitX * length - unitY * length * 0.08,
          positionY + unitY * length + unitX * length * 0.08,
        );
        canvasRenderingContext2D.lineTo(
          positionX + unitX * length + unitY * length * 0.08,
          positionY + unitY * length - unitX * length * 0.08,
        );
        canvasRenderingContext2D.closePath();
        canvasRenderingContext2D.fill();
      }
    canvasRenderingContext2D.fillStyle = 'rgba(230,240,255,.95)';
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, 2.5, 0, 6.283);
    canvasRenderingContext2D.fill();
  }
  canvasRenderingContext2D.globalAlpha = 1;
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  if (decorModel.hole && !starSystem.scene) {
    const hole2 = decorModel.hole,
      htmlImageElement = decorImg('blackhole_0');
    if (ready(htmlImageElement)) {
      const [positionX, positionY] = farXY(hole2, width, height, centerX, centerY, zoomFactor),
        state = hole2.size * zoomFactor;
      if (
        positionX > -state &&
        positionY > -state &&
        positionX < width + state &&
        positionY < height + state
      ) {
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.translate(positionX, positionY);
        canvasRenderingContext2D.rotate(hole2.rot + Math.sin(time / 40) * 0.03);
        canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -state / 2, state, state);
        canvasRenderingContext2D.restore();
      }
    }
  }
  // Distant comet behind worlds and navigable scenery; use the rendered sun's parallax.
  if (decorModel.comet) {
    const [positionX, positionY] = farXY(
      decorModel.sun!,
      width,
      height,
      centerX,
      centerY,
      zoomFactor,
    );
    drawComet(
      canvasRenderingContext2D,
      decorModel.comet,
      width,
      height,
      positionZ,
      centerX,
      centerY,
      currentTime,
      { x: positionX, y: positionY },
    );
  }
  for (const backgroundPlanet of [...decorModel.bgp!].sort(
    (firstValue, secondValue) => firstValue.depth - secondValue.depth,
  )) {
    // unique background worlds, the farthest first
    const [positionX, positionY] = farXY(
        backgroundPlanet,
        width,
        height,
        centerX,
        centerY,
        zoomFactor,
      ),
      state =
        backgroundPlanet.size * zoomFactor * backgroundScale('world', backgroundPlanet.p.desc);
    if (
      positionX < -state * 2 ||
      positionY < -state * 2 ||
      positionX > width + state * 2 ||
      positionY > height + state * 2
    )
      continue;
    const planetSprite2 = planetSprite(backgroundPlanet.p, currentTime);
    if (!planetSprite2) continue;
    const width3 = (state * planetSprite2.S) / planetSprite2.D;
    // Distance changes apparent size, not opacity: the solid disk must occlude
    // stars behind it. The sprite itself supplies soft atmosphere/ring alpha.
    canvasRenderingContext2D.globalAlpha = 1;
    canvasRenderingContext2D.drawImage(
      planetSprite2.canvas,
      positionX - width3 / 2,
      positionY - width3 / 2,
      width3,
      width3,
    );
    canvasRenderingContext2D.globalAlpha = 1;
  }
  if (decorModel.arc) {
    const decorLayer = decorModel.arc,
      htmlImageElement = decorImg(decorLayer.img);
    if (ready(htmlImageElement)) {
      const entryKey = Math.pow(positionZ, 0.4),
        positionX = width / 2 + (decorLayer.x - centerX * decorLayer.depth) * entryKey,
        positionY = height / 2 + (decorLayer.y - centerY * decorLayer.depth) * entryKey,
        state = decorLayer.size * entryKey;
      if (
        positionX > -state &&
        positionY > -state &&
        positionX < width + state &&
        positionY < height + state
      ) {
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.translate(positionX, positionY);
        canvasRenderingContext2D.rotate(decorLayer.rot);
        canvasRenderingContext2D.globalAlpha = 0.8;
        canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -state / 2, state, state);
        canvasRenderingContext2D.restore();
        canvasRenderingContext2D.globalAlpha = 1;
      }
    }
  }
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  for (const count of decorModel.neb) {
    const htmlImageElement = decorImg(count.img);
    if (!ready(htmlImageElement)) continue;
    const entryKey = Math.pow(positionZ, 0.55),
      positionX = width / 2 + (count.x - centerX * count.depth) * entryKey * 0.6,
      positionY = height / 2 + (count.y - centerY * count.depth) * entryKey * 0.6,
      state = count.size * entryKey;
    if (
      positionX < -state ||
      positionY < -state ||
      positionX > width + state ||
      positionY > height + state
    )
      continue;
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.rotate(count.rot + currentTime / 600000);
    canvasRenderingContext2D.globalAlpha = count.a;
    canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -state / 2, state, state);
    canvasRenderingContext2D.restore();
  }
  canvasRenderingContext2D.globalAlpha = 1;
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  // a shooting star now and then, far behind everything
  {
    const perUnit = 14,
      phase = (time + decorModel.meteorT) % perUnit;
    if (phase < 0.7) {
      const randomGenerator = seeded(
          Math.floor((time + decorModel.meteorT) / perUnit) + hashStr(starSystem.id),
        ),
        startX = randomGenerator() * width,
        startY = randomGenerator() * height * 0.6,
        firstValue = 0.4 + randomGenerator() * 1.2,
        length = 120 + randomGenerator() * 160,
        entryKey = phase / 0.7;
      const positionX = startX + Math.cos(firstValue) * length * entryKey * 2,
        positionY = startY + Math.sin(firstValue) * length * entryKey * 2,
        canvasGradient = canvasRenderingContext2D.createLinearGradient(
          positionX,
          positionY,
          positionX - Math.cos(firstValue) * length,
          positionY - Math.sin(firstValue) * length,
        );
      canvasGradient.addColorStop(0, `rgba(255,255,255,${0.7 * (1 - entryKey)})`);
      canvasGradient.addColorStop(1, 'rgba(255,255,255,0)');
      canvasRenderingContext2D.strokeStyle = canvasGradient;
      canvasRenderingContext2D.lineWidth = 1.5;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(
        positionX - Math.cos(firstValue) * length,
        positionY - Math.sin(firstValue) * length,
      );
      canvasRenderingContext2D.stroke();
    }
  }
}
/**
 * Renders mid-distance background clutter: asteroid drift belts and ion storm fields with lightning.
 * @param canvasRenderingContext2D 2D rendering context
 * @param starSystem Solar system specification
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param positionZ Camera zoom factor
 * @param centerX Camera center X
 * @param centerY Camera center Y
 * @param currentTime Timestamp in milliseconds
 */
function drawDecorMid(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  starSystem: GalaxySystem,
  width: number,
  height: number,
  positionZ: number,
  centerX: number,
  centerY: number,
  currentTime: number,
): void {
  const decorModel = decorFor(starSystem),
    time = currentTime / 1000;
  if (decorModel.belt) {
    const belt2 = decorModel.belt,
      entryKey = positionZ * belt2.depth + positionZ * (1 - belt2.depth) * 0.6;
    canvasRenderingContext2D.globalAlpha = 0.6; // a drift of distant asteroids, a little behind the play field
    for (const rock of belt2.rocks) {
      const positionX = width / 2 + (rock.x - centerX * belt2.depth) * entryKey,
        positionY = height / 2 + (rock.y - centerY * belt2.depth) * entryKey,
        state = rock.s * entryKey * 1.6;
      if (
        positionX < -state ||
        positionY < -state ||
        positionX > width + state ||
        positionY > height + state
      )
        continue;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(rock.rot + time * rock.sp);
      canvasRenderingContext2D.drawImage(rockSprite(rock.k), -state / 2, -state / 2, state, state);
      canvasRenderingContext2D.restore();
    }
    canvasRenderingContext2D.globalAlpha = 1;
  }
  if (decorModel.storm) {
    const storm2 = decorModel.storm,
      entryKey = positionZ * storm2.depth + positionZ * 0.1,
      positionX = width / 2 + (storm2.x - centerX * storm2.depth) * entryKey,
      positionY = height / 2 + (storm2.y - centerY * storm2.depth) * entryKey,
      radius = storm2.R * entryKey; // an ion storm: a charged cloud with lightning
    if (
      positionX > -radius * 1.5 &&
      positionY > -radius * 1.5 &&
      positionX < width + radius * 1.5 &&
      positionY < height + radius * 1.5
    ) {
      const htmlImageElement = decorImg(storm2.img);
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      if (ready(htmlImageElement)) {
        canvasRenderingContext2D.globalAlpha = 0.55;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          positionX - radius,
          positionY - radius,
          radius * 2,
          radius * 2,
        );
        canvasRenderingContext2D.globalAlpha = 1;
      }
      const slot = Math.floor(time * 3),
        randomGenerator = seeded(slot * 131 + hashStr(starSystem.id));
      if (randomGenerator() < 0.45) {
        let pixelX = positionX + (randomGenerator() - 0.5) * radius,
          pixelY = positionY + (randomGenerator() - 0.5) * radius;
        const flicker = 1 - (time * 3 - slot);
        canvasRenderingContext2D.strokeStyle = `rgba(190,225,255,${0.85 * flicker})`;
        canvasRenderingContext2D.lineWidth = 1.6;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(pixelX, pixelY);
        for (let index = 0; index < 9; index++) {
          pixelX += (randomGenerator() - 0.5) * radius * 0.25;
          pixelY += (randomGenerator() - 0.3) * radius * 0.18;
          canvasRenderingContext2D.lineTo(pixelX, pixelY);
        }
        canvasRenderingContext2D.stroke();
        const canvasGradient = canvasRenderingContext2D.createRadialGradient(
          positionX,
          positionY,
          0,
          positionX,
          positionY,
          radius,
        );
        canvasGradient.addColorStop(0, `rgba(150,200,255,${0.12 * flicker})`);
        canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
        canvasRenderingContext2D.fillStyle = canvasGradient;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
        canvasRenderingContext2D.fill();
      }
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
    }
  }
}
/**
 * Renders in-system foreground clutter: comets, derelicts, ancient ruins, satellites, and nav beacons.
 * @param canvasRenderingContext2D 2D rendering context
 * @param starSystem Solar system specification
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param positionZ Camera zoom factor
 * @param screenX Screen X projector function
 * @param screenY Screen Y projector function
 * @param currentTime Timestamp in milliseconds
 */
function drawDecorNear(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  starSystem: GalaxySystem,
  width: number,
  height: number,
  positionZ: number,
  screenX: (worldX: number) => number,
  screenY: (worldY: number) => number,
  currentTime: number,
): void {
  const decorModel = decorFor(starSystem),
    time = currentTime / 1000,
    isOnScreen = (positionX: number, positionY: number, state: number) =>
      positionX > -state &&
      positionY > -state &&
      positionX < width + state &&
      positionY < height + state;
  const sprite = (
    options: Omit<DecorSprite, 'spin'> & { spin?: number },
    alpha = 1,
    spin = options.spin || 0,
  ) => {
    const htmlImageElement = decorImg(options.img);
    if (!ready(htmlImageElement)) return;
    const positionX = screenX(options.x),
      positionY = screenY(options.y),
      state = options.size * positionZ,
      ship = (state * htmlImageElement.naturalHeight) / htmlImageElement.naturalWidth;
    if (!isOnScreen(positionX, positionY, state)) return;
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.rotate((options.rot || 0) + time * spin);
    canvasRenderingContext2D.globalAlpha = alpha;
    canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -ship / 2, state, ship);
    canvasRenderingContext2D.restore();
    canvasRenderingContext2D.globalAlpha = 1;
  };
  for (const decorSprite of decorModel.ruin) sprite(decorSprite, 0.92);
  // The authored ark metadata stays stable; its actual sheet is captain-specific.
  if (starSystem.id !== EXPEDITION_HULK.system)
    for (const decorSprite of decorModel.derelict) sprite(decorSprite, 0.95);
  for (const wreck2 of decorModel.wreck) {
    const htmlImageElement = decorImg(wreck2.img);
    if (!ready(htmlImageElement)) continue;
    const positionX = screenX(wreck2.x),
      positionY = screenY(wreck2.y),
      state = wreck2.size * positionZ * backgroundScale('wreck'),
      ship = (state * htmlImageElement.naturalHeight) / htmlImageElement.naturalWidth;
    if (!isOnScreen(positionX, positionY, state)) continue;
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.rotate(wreck2.rot + time * wreck2.spin);
    canvasRenderingContext2D.fillStyle = 'rgba(95,90,85,.9)';
    for (const debrisBit of wreck2.bits) {
      const firstValue = debrisBit.a + time * debrisBit.sp,
        baseX = Math.cos(firstValue) * state * debrisBit.d * 0.7,
        source = Math.sin(firstValue) * state * debrisBit.d * 0.6;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(baseX, source);
      canvasRenderingContext2D.rotate(debrisBit.rot + time * debrisBit.sp * 8);
      canvasRenderingContext2D.fillRect(
        -debrisBit.s * positionZ,
        -debrisBit.s * positionZ * 0.4,
        debrisBit.s * 2 * positionZ,
        debrisBit.s * 0.8 * positionZ,
      );
      canvasRenderingContext2D.restore();
    }
    canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -ship / 2, state, ship);
    canvasRenderingContext2D.restore();
  }
  for (const debri of decorModel.debris) {
    const positionX = screenX(debri.x),
      positionY = screenY(debri.y);
    if (!isOnScreen(positionX, positionY, 480 * positionZ)) continue; // a battle's leftovers, slowly turning
    for (const debrisBit of debri.bits) {
      const firstValue = debrisBit.a + time * debri.spin,
        baseX = positionX + Math.cos(firstValue) * debrisBit.d * positionZ,
        source = positionY + Math.sin(firstValue) * debrisBit.d * positionZ * 0.8;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(baseX, source);
      canvasRenderingContext2D.rotate(debrisBit.rot + time * debrisBit.sp);
      canvasRenderingContext2D.fillStyle = debrisBit.hot
        ? `rgba(255,${130 + 60 * Math.sin(time * 3 + debrisBit.rot)},60,.9)`
        : 'rgba(110,105,100,.95)';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-debrisBit.s * positionZ, -debrisBit.s * positionZ * 0.3);
      canvasRenderingContext2D.lineTo(
        debrisBit.s * positionZ * 0.7,
        -debrisBit.s * positionZ * 0.5,
      );
      canvasRenderingContext2D.lineTo(debrisBit.s * positionZ, debrisBit.s * positionZ * 0.4);
      canvasRenderingContext2D.lineTo(
        -debrisBit.s * positionZ * 0.4,
        debrisBit.s * positionZ * 0.3,
      );
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.restore();
    }
  }
  for (const crystal2 of decorModel.crystal) {
    sprite(crystal2, 0.95);
    const htmlImageElement = decorImg(crystal2.img);
    if (ready(htmlImageElement)) {
      const positionX = screenX(crystal2.x),
        positionY = screenY(crystal2.y),
        state = crystal2.size * positionZ * 1.25;
      if (isOnScreen(positionX, positionY, state)) {
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.globalCompositeOperation = 'lighter';
        canvasRenderingContext2D.globalAlpha = 0.18 + 0.14 * Math.sin(time * 1.3 + crystal2.ph);
        canvasRenderingContext2D.translate(positionX, positionY);
        canvasRenderingContext2D.rotate(crystal2.rot + time * crystal2.spin);
        canvasRenderingContext2D.drawImage(htmlImageElement, -state / 2, -state / 2, state, state);
        canvasRenderingContext2D.restore();
        canvasRenderingContext2D.globalAlpha = 1;
        canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      }
    }
  }
  for (const sat2 of decorModel.sats) {
    const firstValue = sat2.a + time * sat2.sp;
    sprite({
      img: sat2.img,
      x: sat2.cx + Math.cos(firstValue) * sat2.R,
      y: sat2.cy + Math.sin(firstValue) * sat2.R * 0.8,
      size: sat2.size,
      rot: firstValue + 1.57,
    });
  }
  for (const pod2 of decorModel.pods) {
    const span = 6000,
      pixelX = ((((pod2.x + pod2.vx * time) % span) + span * 1.5) % span) - span / 2,
      pixelY = ((((pod2.y + pod2.vy * time) % span) + span * 1.5) % span) - span / 2;
    sprite({
      img: pod2.img,
      x: pixelX,
      y: pixelY,
      size: pod2.size,
      rot: pod2.rot + time * pod2.sp,
    });
  }
  if (decorModel.arena) {
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.setLineDash([10 * positionZ + 4, 14 * positionZ + 6]);
    canvasRenderingContext2D.lineWidth = 1.5;
    for (const [column, initialAngle] of [
      ['rgba(90,168,255,.35)', Math.PI / 2],
      ['rgba(255,90,74,.35)', -Math.PI / 2],
    ] as [string, number][]) {
      canvasRenderingContext2D.strokeStyle = column;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        screenX(0),
        screenY(0),
        decorModel.arena.R * positionZ,
        initialAngle,
        initialAngle + Math.PI,
      );
      canvasRenderingContext2D.stroke();
    }
    canvasRenderingContext2D.restore();
  } // the Crucible's bounds
  for (const beacon of decorModel.beacons) {
    const positionX = screenX(beacon.x),
      positionY = screenY(beacon.y);
    if (!isOnScreen(positionX, positionY, 20)) continue;
    const enabled = Math.sin(time * 2.2 + beacon.ph) > 0.55;
    canvasRenderingContext2D.fillStyle = '#556';
    canvasRenderingContext2D.fillRect(
      positionX - 1.5 * positionZ - 1,
      positionY - 1.5 * positionZ - 1,
      3 * positionZ + 2,
      3 * positionZ + 2,
    );
    if (enabled) {
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        positionX,
        positionY,
        0,
        positionX,
        positionY,
        9 * positionZ + 4,
      );
      canvasGradient.addColorStop(0, beacon.col);
      canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 9 * positionZ + 4, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
    }
  }
}
const planetCache = new ByteBudgetCache<HTMLCanvasElement>(32 * 1024 * 1024, 2000, 128);
/**
 * Converts a hexadecimal color string to an RGB number triplet.
 * @param height2 Hex color code (e.g. '#ff8800')
 * @returns RGB color values [r, g, b]
 */
function hexToRgb(hexColor: string): [number, number, number] {
  const parseInt2 = parseInt(hexColor.slice(1), 16);
  return [(parseInt2 >> 16) & 255, (parseInt2 >> 8) & 255, parseInt2 & 255];
}
// rendered station designs (tools/rift_stations.py), chosen by who built the station and what it is
const stPick = new Map<string, string>();
/**
 * Determines the architectural 3D station sprite model name for a station.
 * @param stellarBody Station stellar body definition
 * @returns Station design archetype name
 */
export function stationDesign(stellarBody: StellarBody): string {
  if (stPick.has(stellarBody.id)) return stPick.get(stellarBody.id)!;
  const systemId =
      stellarBody.system || (STELLARS[stellarBody.id] && STELLARS[stellarBody.id].system),
    factionId = systemsById[systemId!] ? systemsById[systemId!].faction : '',
    toLowerCase2 = ((stellarBody.desc || '') + ' ' + stellarBody.id).toLowerCase(),
    hashStr2 = hashStr(stellarBody.id);
  const authored: Record<string, string> = {
    'twins-exchange': 'twin',
    'aureole-ring': 'ring',
    'reliquary-watch': 'disc',
    'nightjar-beacon': 'spindle',
    'glasswake-foundry': 'forge',
    'palinode-observatory': 'crystal',
  };
  const source =
    authored[stellarBody.id] ||
    (
      {
        vashari: 'hive',
        ylith: 'crystal',
        thalassi: 'reef',
        sarn: 'ring',
        quevari: 'spindle',
        umbral: 'disc',
        lamp: hashStr2 % 2 ? 'twin' : 'disc',
      } as Record<string, string>
    )[factionId] ||
    (factionId === 'korrund' ? (hashStr2 % 3 ? 'rock' : 'forge') : null) ||
    (stellarBody.outlaw ||
    (STELLARS[stellarBody.id] && STELLARS[stellarBody.id].outlaw) ||
    factionId === 'hollow'
      ? 'junk'
      : null) ||
    (factionId === 'farside' ? (hashStr2 % 2 ? 'junk' : 'twin') : null) ||
    (/shipyard|slipway|yards/.test(toLowerCase2) && factionId === 'quantum' ? 'yard' : null) ||
    ['cross', 'ring', 'spindle', 'disc', 'twin'][hashStr2 % 5];
  stPick.set(stellarBody.id, source);
  return source;
}
/**
 * Retrieves the loaded HTMLImageElement for a station's rendered sprite model.
 * @param stellarBody Station stellar body
 * @returns Loaded image or null if loading
 */
function stationSprite(stellarBody: StellarBody): HTMLImageElement | HTMLCanvasElement | null {
  // Luna keeps the original glowing wheel rather than inheriting the generic shipyard.
  if (stellarBody.id === 'luna') return stationWheel(stellarBody)!;
  const stationDesign2 = stationDesign(stellarBody);
  const htmlImageElement = assetImage(`stations/s_${stationDesign2}.webp`);
  return htmlImageElement.complete && htmlImageElement.naturalWidth ? htmlImageElement : null;
}
/**
 * Generates or retrieves a pre-rendered off-screen canvas sprite for a planet or station.
 * @param stellarBody Stellar body specification
 * @returns Off-screen canvas containing the rendered body
 */
function planetImage(stellarBody: StellarBody): HTMLCanvasElement {
  const cached = planetCache.get(stellarBody.id, performance.now());
  if (cached) return cached;
  const radius = stellarBody.r,
    state = Math.ceil(radius * 2.6),
    htmlCanvasElement = document.createElement('canvas');
  htmlCanvasElement.width = htmlCanvasElement.height = state;
  const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
    centerX = state / 2,
    centerY = state / 2,
    [redChannel, greenChannel, blueChannel] = hexToRgb(stellarBody.color || '#888'),
    randomGenerator = seeded(hashStr(stellarBody.id));
  if (stellarBody.kind === 'station') {
    canvasRenderingContext2D.translate(centerX, centerY);
    const ring = (radius: number, width: number, column: string) => {
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(0, 0, radius, 0, Math.PI * 2);
      canvasRenderingContext2D.lineWidth = width;
      canvasRenderingContext2D.strokeStyle = column;
      canvasRenderingContext2D.stroke();
    };
    ring(
      radius * 0.92,
      radius * 0.16,
      `rgb(${redChannel * 0.6},${greenChannel * 0.6},${blueChannel * 0.6})`,
    );
    ring(
      radius * 0.92,
      radius * 0.05,
      `rgb(${Math.min(255, redChannel + 60)},${Math.min(255, greenChannel + 60)},${Math.min(255, blueChannel + 60)})`,
    );
    for (let entryKey = 0; entryKey < 6; entryKey++) {
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.rotate((entryKey * Math.PI) / 3 + randomGenerator());
      canvasRenderingContext2D.fillStyle = `rgb(${redChannel * 0.5},${greenChannel * 0.5},${blueChannel * 0.5})`;
      canvasRenderingContext2D.fillRect(-radius * 0.05, 0, radius * 0.1, radius * 0.86);
      canvasRenderingContext2D.restore();
    }
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(
      -radius * 0.1,
      -radius * 0.1,
      2,
      0,
      0,
      radius * 0.4,
    );
    canvasGradient.addColorStop(
      0,
      `rgb(${Math.min(255, redChannel + 80)},${Math.min(255, greenChannel + 80)},${Math.min(255, blueChannel + 80)})`,
    );
    canvasGradient.addColorStop(
      1,
      `rgb(${redChannel * 0.3},${greenChannel * 0.3},${blueChannel * 0.3})`,
    );
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fill();
    for (let entryKey = 0; entryKey < 24; entryKey++) {
      const firstValue = (entryKey / 24) * Math.PI * 2;
      canvasRenderingContext2D.fillStyle = randomGenerator() < 0.5 ? '#ffd88a' : '#9cf';
      canvasRenderingContext2D.fillRect(
        Math.cos(firstValue) * radius * 0.92 - 1.5,
        Math.sin(firstValue) * radius * 0.92 - 1.5,
        3,
        3,
      );
    }
  } else {
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(
      centerX - radius * 0.35,
      centerY - radius * 0.35,
      radius * 0.1,
      centerX,
      centerY,
      radius,
    );
    canvasGradient.addColorStop(
      0,
      `rgb(${Math.min(255, redChannel + 70)},${Math.min(255, greenChannel + 70)},${Math.min(255, blueChannel + 70)})`,
    );
    canvasGradient.addColorStop(0.7, `rgb(${redChannel},${greenChannel},${blueChannel})`);
    canvasGradient.addColorStop(
      1,
      `rgb(${redChannel * 0.25},${greenChannel * 0.25},${blueChannel * 0.25})`,
    );
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(centerX, centerY, radius, 0, Math.PI * 2);
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fill();
    canvasRenderingContext2D.clip();
    for (let entryKey = 0; entryKey < 14; entryKey++) {
      // cloud bands / continents
      canvasRenderingContext2D.globalAlpha = 0.08 + randomGenerator() * 0.12;
      canvasRenderingContext2D.fillStyle =
        randomGenerator() < 0.5
          ? '#fff'
          : `rgb(${redChannel * 0.5},${greenChannel * 0.5},${blueChannel * 0.5})`;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.ellipse(
        centerX + (randomGenerator() - 0.5) * radius * 1.6,
        centerY + (randomGenerator() - 0.5) * radius * 1.8,
        radius * (0.2 + randomGenerator() * 0.6),
        radius * (0.05 + randomGenerator() * 0.15),
        (randomGenerator() - 0.5) * 0.6,
        0,
        Math.PI * 2,
      );
      canvasRenderingContext2D.fill();
    }
    if (stellarBody.id === 'earth') {
      // Earth gets green-brown continents and white cloud swirls
      for (let entryKey = 0; entryKey < 9; entryKey++) {
        canvasRenderingContext2D.globalAlpha = 0.9;
        canvasRenderingContext2D.fillStyle = randomGenerator() < 0.7 ? '#4f7a3a' : '#8a7a4a';
        canvasRenderingContext2D.beginPath();
        const velocityErrorX = centerX + (randomGenerator() - 0.5) * radius * 1.5,
          velocityErrorY = centerY + (randomGenerator() - 0.5) * radius * 1.5;
        for (let innerIndex = 0; innerIndex < 7; innerIndex++) {
          const firstValue = (innerIndex / 7) * Math.PI * 2,
            radiusRatio = radius * (0.12 + randomGenerator() * 0.22);
          canvasRenderingContext2D[innerIndex ? 'lineTo' : 'moveTo'](
            velocityErrorX + Math.cos(firstValue) * radiusRatio * 1.4,
            velocityErrorY + Math.sin(firstValue) * radiusRatio,
          );
        }
        canvasRenderingContext2D.closePath();
        canvasRenderingContext2D.fill();
      }
      for (let entryKey = 0; entryKey < 10; entryKey++) {
        canvasRenderingContext2D.globalAlpha = 0.45;
        canvasRenderingContext2D.fillStyle = '#fff';
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.ellipse(
          centerX + (randomGenerator() - 0.5) * radius * 1.7,
          centerY + (randomGenerator() - 0.5) * radius * 1.7,
          radius * (0.15 + randomGenerator() * 0.4),
          radius * (0.03 + randomGenerator() * 0.06),
          (randomGenerator() - 0.5) * 0.8,
          0,
          Math.PI * 2,
        );
        canvasRenderingContext2D.fill();
      }
    }
    canvasRenderingContext2D.globalAlpha = 1;
    const canvasGradient2 = canvasRenderingContext2D.createRadialGradient(
      centerX - radius * 0.6,
      centerY - radius * 0.6,
      radius * 0.6,
      centerX,
      centerY,
      radius * 1.25,
    );
    canvasGradient2.addColorStop(0, 'rgba(0,0,0,0)');
    canvasGradient2.addColorStop(1, 'rgba(0,0,0,0.85)');
    canvasRenderingContext2D.fillStyle = canvasGradient2;
    canvasRenderingContext2D.fillRect(0, 0, state, state);
    canvasRenderingContext2D.restore();
    const canvasGradient3 = canvasRenderingContext2D.createRadialGradient(
      centerX,
      centerY,
      radius * 0.95,
      centerX,
      centerY,
      radius * 1.15,
    );
    canvasGradient3.addColorStop(0, `rgba(${redChannel},${greenChannel},${blueChannel},0.35)`);
    canvasGradient3.addColorStop(1, 'rgba(0,0,0,0)');
    canvasRenderingContext2D.fillStyle = canvasGradient3;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
    canvasRenderingContext2D.fill();
  }
  planetCache.set(stellarBody.id, htmlCanvasElement, state * state * 4, performance.now());
  return htmlCanvasElement;
}

// ------------------------------------------------------------------ effects
/**
 * Active transient visual effect particle objects.
 */
const visualEffects: VisualEffect[] = [];
export { visualEffects as fx };
/**
 * Loads or returns cached visual effect sprites.
 * @param count Effect sprite name
 * @returns Effect sprite image
 */
function fxImg(count: string): HTMLImageElement {
  return assetImage(`fx/${count}.webp`);
}
for (const count of ['boom_a', 'boom_b', 'boom_big', 'shards', 'flare']) fxImg(count);
/**
 * Spawns an explosion visual effect with fireballs, shockwaves, smoke, and debris.
 * @param positionX World coordinate X
 * @param positionY World coordinate Y
 * @param size Explosion radius / size
 */
export function boom(positionX: number, positionY: number, size?: number): void {
  size = Math.max(20, size || 40);
  const count = Math.min(70, 14 + size / 3);
  visualEffects.push({
    x: positionX,
    y: positionY,
    ball: true,
    life: 0.35 + size / 900,
    max: 0.35 + size / 900,
    r: size * 0.6,
  }); // flash
  {
    const large = size > 120,
      length = (large ? 1.5 : 0.95) + size / 700;
    visualEffects.push({
      x: positionX,
      y: positionY,
      anim: large ? 'boom_big' : Math.random() < 0.5 ? 'boom_a' : 'boom_b',
      life: length,
      max: length,
      r: size * (large ? 1.35 : 1.1),
      rot: Math.random() * 6.283,
    });
  } // a rendered fireball
  for (let index = 0; index < count; index++) {
    const firstValue = Math.random() * 6.283,
      value = 30 + Math.random() * (60 + size);
    visualEffects.push({
      x: positionX,
      y: positionY,
      vx: Math.cos(firstValue) * value,
      vy: Math.sin(firstValue) * value,
      life: 0.5 + Math.random() * 0.9,
      max: 1.4,
      c: Math.random() < 0.5 ? '#ffd27a' : '#ff6a3a',
      s: 1 + Math.random() * 2.5,
    });
  }
  for (let index = 0; index < Math.min(14, 3 + size / 25); index++) {
    const firstValue = Math.random() * 6.283,
      value = 20 + Math.random() * 60;
    visualEffects.push({
      x: positionX,
      y: positionY,
      vx: Math.cos(firstValue) * value,
      vy: Math.sin(firstValue) * value,
      smoke: true,
      life: 1.2 + Math.random(),
      max: 2.2,
      r: 8 + size * 0.15,
    });
  }
  for (let index = 0; index < Math.min(10, 2 + size / 30); index++) {
    const firstValue = Math.random() * 6.283,
      value = 40 + Math.random() * 120;
    visualEffects.push({
      x: positionX,
      y: positionY,
      vx: Math.cos(firstValue) * value,
      vy: Math.sin(firstValue) * value,
      debris: true,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 12,
      life: 1.5 + Math.random(),
      max: 2.5,
      s: 2 + (Math.random() * size) / 40,
    });
  }
  visualEffects.push({
    x: positionX,
    y: positionY,
    ring: true,
    life: 0.5,
    max: 0.5,
    r: size * 1.1,
    c: '#fff1c0',
  });
  if (size > 120)
    visualEffects.push({
      x: positionX,
      y: positionY,
      ring: true,
      life: 0.9,
      max: 0.9,
      r: size * 2,
      c: '#ffb070',
    });
}
/**
 * Spawns directional weapon impact sparks and a momentary flash flare.
 * @param positionX World coordinate X
 * @param positionY World coordinate Y
 * @param column Spark color code
 */
export function spark(positionX: number, positionY: number, column?: string): void {
  visualEffects.push({
    x: positionX,
    y: positionY,
    flare: true,
    life: 0.16,
    max: 0.16,
    r: 26,
    c: column,
  });
  for (let index = 0; index < 6; index++) {
    const firstValue = Math.random() * 6.283,
      value = 40 + Math.random() * 90;
    visualEffects.push({
      x: positionX,
      y: positionY,
      vx: Math.cos(firstValue) * value,
      vy: Math.sin(firstValue) * value,
      life: 0.25,
      max: 0.25,
      c: column || '#fff',
      s: 1.6,
    });
  }
}
/**
 * Spawns a hyperspace jump departure or arrival visual flash effect.
 * @param positionX World coordinate X
 * @param positionY World coordinate Y
 */
export function flash(positionX: number, positionY: number): void {
  // a ship entering or leaving hyperspace: a hot core, a lens streak and two shock rings
  visualEffects.push({ x: positionX, y: positionY, hyper: true, life: 0.75, max: 0.75, r: 70 });
  visualEffects.push({
    x: positionX,
    y: positionY,
    ring: true,
    life: 0.55,
    max: 0.55,
    r: 150,
    c: '#bfe2ff',
  });
  visualEffects.push({
    x: positionX,
    y: positionY,
    ring: true,
    life: 0.9,
    max: 0.9,
    r: 260,
    c: '#7aa8ff',
  });
}
/**
 * Spawns an expanding circular blast wave effect.
 * @param positionX World coordinate X
 * @param positionY World coordinate Y
 * @param radius Maximum blast radius
 */
export function blast(positionX: number, positionY: number, radius: number): void {
  visualEffects.push({
    x: positionX,
    y: positionY,
    ring: true,
    life: 0.35,
    max: 0.35,
    r: radius,
    c: '#ffcf8a',
  });
}
// shield shimmer on the ship that was hit, and floating damage numbers
/**
 * Active shield hit shimmer animations mapped by entity ID.
 */
export const shieldHits: Map<number, ShieldHit> = new Map();
/**
 * Triggers a shield impact ripple shimmer effect on the target ship.
 * @param identifier Ship entity ID
 * @param positionX Impact world X
 * @param positionY Impact world Y
 */
export function shieldHit(identifier: number, positionX: number, positionY: number): void {
  shieldHits.set(identifier, { t: 0.35, hx: positionX, hy: positionY });
}
/**
 * Creates or aggregates floating combat damage numbers on screen.
 * @param positionX World coordinate X
 * @param positionY World coordinate Y
 * @param count2 Damage points
 * @param mine Whether this damage was dealt by the local player
 */
export function dmgNumber(
  positionX: number,
  positionY: number,
  count: number,
  mine: boolean,
): void {
  if (count < 1) return;
  for (
    let index = visualEffects.length - 1;
    index >= Math.max(0, visualEffects.length - 300);
    index--
  ) {
    const factionId = visualEffects[index];
    if (
      factionId.num &&
      factionId.mine === mine &&
      factionId.life > factionId.max - 0.45 &&
      Math.hypot(factionId.x - positionX, factionId.y - positionY) < 70
    ) {
      factionId.num += Math.round(count);
      factionId.life = factionId.max;
      return;
    }
  } // hits close together add up into one number
  visualEffects.push({
    x: positionX + (Math.random() - 0.5) * 16,
    y: positionY,
    vx: 0,
    vy: -45,
    num: Math.round(count),
    mine,
    life: 0.9,
    max: 0.9,
  });
}
/**
 * Current camera screen shake intensity factor.
 */
export let shake: number = 0;
/**
 * Global active camera state.
 */
const cameraState: CameraState = { cx: 0, cy: 0, z: 1, W: 1, H: 1 };
export { cameraState as cam };
/**
 * Adds an impulse to the camera screen shake intensity.
 * @param entryKey Shake magnitude to add/clamp
 */
export function addShake(entryKey: number): void {
  shake = Math.max(shake, entryKey);
}

// projectile drawing by look
const glowColor = new ByteBudgetCache<HTMLCanvasElement>(1024 * 1024, 2000, 64); // a soft additive glow behind every bolt, and a fading trail
/**
 * Generates or retrieves a radial glow sprite for projectile weapons.
 * @param column Color hex string
 * @returns Radial glow canvas sprite
 */
function glowSprite(column: string): HTMLCanvasElement {
  let htmlCanvasElement = glowColor.get(column, performance.now());
  if (!htmlCanvasElement) {
    htmlCanvasElement = document.createElement('canvas');
    htmlCanvasElement.width = htmlCanvasElement.height = 64;
    const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
      canvasGradient = canvasRenderingContext2D.createRadialGradient(32, 32, 0, 32, 32, 32);
    canvasGradient.addColorStop(0, column);
    canvasGradient.addColorStop(0.25, column + 'aa');
    canvasGradient.addColorStop(1, column + '00');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fillRect(0, 0, 64, 64);
    glowColor.set(column, htmlCanvasElement, 64 * 64 * 4, performance.now());
  }
  return htmlCanvasElement;
}
/**
 * Draws an individual projectile or missile shot on the canvas.
 * @param canvasRenderingContext2D 2D rendering context
 * @param state Shot object definition
 * @param positionX Screen coordinate X
 * @param positionY Screen coordinate Y
 * @param positionZ Zoom scale factor
 * @param currentTime Timestamp in milliseconds
 */
export function drawShot(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  state: RenderShot & { col: string; look: string },
  positionX: number,
  positionY: number,
  positionZ: number,
  currentTime: number,
): void {
  const weaponAsset = state.W,
    column = state.col,
    look = state.look,
    space = Math.hypot(state.vx, state.vy) || 1,
    unitX = state.vx / space,
    unitY = state.vy / space;
  const effectZoom = Math.max(0.7, positionZ);
  if (/^#[0-9a-f]{6}$/i.test(column) && look !== 'missile' && look !== 'rocket') {
    canvasRenderingContext2D.globalCompositeOperation = 'lighter';
    const glowSize = (look === 'torp' || look === 'sing' ? 46 : 22) * effectZoom;
    canvasRenderingContext2D.globalAlpha = 0.55;
    canvasRenderingContext2D.drawImage(
      glowSprite(column),
      positionX - glowSize / 2,
      positionY - glowSize / 2,
      glowSize,
      glowSize,
    );
    if (look !== 'rail') {
      const length = Math.min(40, space * 0.03) * positionZ,
        canvasGradient = canvasRenderingContext2D.createLinearGradient(
          positionX,
          positionY,
          positionX - unitX * length,
          positionY - unitY * length,
        );
      canvasGradient.addColorStop(0, column + 'cc');
      canvasGradient.addColorStop(1, column + '00');
      canvasRenderingContext2D.strokeStyle = canvasGradient;
      canvasRenderingContext2D.lineWidth = 3 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(positionX - unitX * length, positionY - unitY * length);
      canvasRenderingContext2D.stroke();
    }
    canvasRenderingContext2D.globalAlpha = 1;
    canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  }
  canvasRenderingContext2D.shadowColor = column;
  canvasRenderingContext2D.shadowBlur = 8;
  switch (look) {
    case 'rail': {
      const length = 26 * positionZ;
      canvasRenderingContext2D.strokeStyle = column;
      canvasRenderingContext2D.lineWidth = 2 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(positionX - unitX * length, positionY - unitY * length);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.strokeStyle = '#fff';
      canvasRenderingContext2D.lineWidth = 1;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(
        positionX - unitX * length * 0.6,
        positionY - unitY * length * 0.6,
      );
      canvasRenderingContext2D.stroke();
      break;
    }
    case 'pulse':
    case 'spit':
    case 'magma':
    case 'mining': {
      const radius = (look === 'magma' ? 4.5 : look === 'spit' ? 3.5 : 3) * effectZoom;
      canvasRenderingContext2D.fillStyle = column;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.fillStyle = 'rgba(255,255,255,.85)';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius * 0.45, 0, 6.283);
      canvasRenderingContext2D.fill();
      break;
    }
    case 'missile':
    case 'rocket': {
      canvasRenderingContext2D.strokeStyle = '#ddd';
      canvasRenderingContext2D.lineWidth = 2.5 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(
        positionX - unitX * 7 * positionZ,
        positionY - unitY * 7 * positionZ,
      );
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.fillStyle = column;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        positionX - unitX * 8 * positionZ,
        positionY - unitY * 8 * positionZ,
        2.2 * effectZoom,
        0,
        6.283,
      );
      canvasRenderingContext2D.fill();
      break;
    }
    case 'torp':
    case 'sing': {
      const pulse = 1 + 0.25 * Math.sin(currentTime / 70),
        radius = (look === 'sing' ? 8 : 6) * effectZoom * pulse;
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        positionX,
        positionY,
        0,
        positionX,
        positionY,
        radius * 2.2,
      );
      canvasGradient.addColorStop(0, '#fff');
      canvasGradient.addColorStop(0.3, column);
      canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius * 2.2, 0, 6.283);
      canvasRenderingContext2D.fill();
      if (look === 'sing') {
        canvasRenderingContext2D.fillStyle = '#05000a';
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(positionX, positionY, radius * 0.55, 0, 6.283);
        canvasRenderingContext2D.fill();
        canvasRenderingContext2D.strokeStyle = '#c090ff';
        canvasRenderingContext2D.lineWidth = 1.5;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(
          positionX,
          positionY,
          radius * 1.1,
          currentTime / 200,
          currentTime / 200 + 4.5,
        );
        canvasRenderingContext2D.stroke();
      }
      break;
    }
    case 'mine': {
      const enabled = Math.floor(currentTime / 300) % 2;
      canvasRenderingContext2D.fillStyle = '#555';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 4 * effectZoom, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.fillStyle = enabled ? '#ff3a2a' : '#401010';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 1.8 * effectZoom, 0, 6.283);
      canvasRenderingContext2D.fill();
      break;
    }
    case 'flak': {
      canvasRenderingContext2D.fillStyle = column;
      for (let entryKey = 0; entryKey < 3; entryKey++) {
        const options = (entryKey - 1) * 3 * positionZ;
        canvasRenderingContext2D.fillRect(
          positionX - unitY * options - 1.5,
          positionY + unitX * options - 1.5,
          3 * effectZoom,
          3 * effectZoom,
        );
      }
      break;
    }
    case 'pd': {
      canvasRenderingContext2D.strokeStyle = column;
      canvasRenderingContext2D.lineWidth = 1.5 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(
        positionX - unitX * 5 * positionZ,
        positionY - unitY * 5 * positionZ,
      );
      canvasRenderingContext2D.stroke();
      break;
    }
    case 'shard': {
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(currentTime / 90);
      canvasRenderingContext2D.fillStyle = column;
      const radius = 4.5 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(0, -radius);
      canvasRenderingContext2D.lineTo(radius * 0.55, 0);
      canvasRenderingContext2D.lineTo(0, radius);
      canvasRenderingContext2D.lineTo(-radius * 0.55, 0);
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.restore();
      break;
    }
    default: {
      // bolt: glowing streak with a white core
      const large = weaponAsset && weaponAsset.dmgA + weaponAsset.dmgS > 40,
        length = (large ? 14 : 10) * positionZ;
      canvasRenderingContext2D.strokeStyle = column;
      canvasRenderingContext2D.lineWidth = (large ? 4 : 2.6) * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(positionX - unitX * length, positionY - unitY * length);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.strokeStyle = 'rgba(255,255,255,.9)';
      canvasRenderingContext2D.lineWidth = 1 * effectZoom;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY);
      canvasRenderingContext2D.lineTo(
        positionX - unitX * length * 0.7,
        positionY - unitY * length * 0.7,
      );
      canvasRenderingContext2D.stroke();
    }
  }
}

// ------------------------------------------------------------------ mining fields
const rockCache = new ByteBudgetCache<HTMLCanvasElement>(32 * 1024 * 1024, 2000, 512);
/**
 * Generates and caches an off-screen canvas sprite for a minable asteroid or gas deposit.
 * @param renderRock Mining rock or gas pocket definition
 * @returns Off-screen canvas sprite
 */
export function rockImage(renderRock: RenderRock): HTMLCanvasElement {
  const entryKey = `${renderRock.id}:${renderRock.ore}:${renderRock.r}`;
  const cached = rockCache.get(entryKey, performance.now());
  if (cached) return cached;
  const radius = renderRock.r,
    state = Math.ceil(radius * 2.6),
    htmlCanvasElement = document.createElement('canvas');
  htmlCanvasElement.width = htmlCanvasElement.height = state;
  const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
    randomGenerator = seeded(renderRock.id * 7919 + 13),
    centerX = state / 2,
    centerY = state / 2;
  if (renderRock.ore === 'gas') {
    // a glowing pocket of volatile gas
    for (let index = 0; index < 7; index++) {
      const firstValue = randomGenerator() * 6.283,
        distance = randomGenerator() * radius * 0.5,
        radius2 = radius * (0.5 + randomGenerator() * 0.5),
        positionX = centerX + Math.cos(firstValue) * distance,
        positionY = centerY + Math.sin(firstValue) * distance;
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        positionX,
        positionY,
        0,
        positionX,
        positionY,
        radius2,
      );
      canvasGradient.addColorStop(0, 'rgba(140,255,200,0.35)');
      canvasGradient.addColorStop(0.6, 'rgba(60,170,160,0.18)');
      canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.fillRect(0, 0, state, state);
    }
  } else if (renderRock.ore === 'shards') {
    // a cluster of violet crystal
    const count = 5 + Math.floor(randomGenerator() * 4);
    for (let index = 0; index < count; index++) {
      const firstValue = randomGenerator() * 6.283,
        length = radius * (0.6 + randomGenerator() * 0.6),
        width = radius * (0.14 + randomGenerator() * 0.12),
        baseX = centerX + Math.cos(firstValue + 1.6) * randomGenerator() * radius * 0.25,
        source = centerY + Math.sin(firstValue + 1.6) * randomGenerator() * radius * 0.25;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(baseX, source);
      canvasRenderingContext2D.rotate(firstValue);
      const canvasGradient = canvasRenderingContext2D.createLinearGradient(-width, 0, width, 0);
      canvasGradient.addColorStop(0, '#5a3a8a');
      canvasGradient.addColorStop(0.5, '#e0c0ff');
      canvasGradient.addColorStop(1, '#7a50b0');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-width, 0);
      canvasRenderingContext2D.lineTo(0, -length);
      canvasRenderingContext2D.lineTo(width, 0);
      canvasRenderingContext2D.lineTo(0, width * 0.6);
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.restore();
    }
  } else {
    // a lumpy grey-brown asteroid
    const count = 11,
      points = [];
    for (let index = 0; index < count; index++) {
      const firstValue = (index / count) * 6.283,
        radius3 = radius * (0.72 + randomGenerator() * 0.32);
      points.push([
        centerX + Math.cos(firstValue) * radius3,
        centerY + Math.sin(firstValue) * radius3,
      ]);
    }
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(
      centerX - radius * 0.4,
      centerY - radius * 0.4,
      radius * 0.1,
      centerX,
      centerY,
      radius * 1.1,
    );
    canvasGradient.addColorStop(0, '#9a8e80');
    canvasGradient.addColorStop(0.7, '#5a524a');
    canvasGradient.addColorStop(1, '#2a2622');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.beginPath();
    points.forEach(([positionX, positionY], index) =>
      index
        ? canvasRenderingContext2D.lineTo(positionX, positionY)
        : canvasRenderingContext2D.moveTo(positionX, positionY),
    );
    canvasRenderingContext2D.closePath();
    canvasRenderingContext2D.fill();
    for (let index = 0; index < 5; index++) {
      const positionX = centerX + (randomGenerator() - 0.5) * radius,
        positionY = centerY + (randomGenerator() - 0.5) * radius,
        radius4 = radius * (0.08 + randomGenerator() * 0.12);
      canvasRenderingContext2D.fillStyle = 'rgba(0,0,0,.25)';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius4, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.fillStyle = 'rgba(255,255,255,.08)';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        positionX - radius4 * 0.3,
        positionY - radius4 * 0.3,
        radius4 * 0.6,
        0,
        6.283,
      );
      canvasRenderingContext2D.fill();
    }
    for (let index = 0; index < 4; index++) {
      canvasRenderingContext2D.fillStyle = '#c9a85a';
      canvasRenderingContext2D.fillRect(
        centerX + (randomGenerator() - 0.5) * radius,
        centerY + (randomGenerator() - 0.5) * radius,
        2,
        2,
      );
    }
  }
  rockCache.set(entryKey, htmlCanvasElement, state * state * 4, performance.now());
  return htmlCanvasElement;
}
const LOOT_COL = ['#ffd27a', '#7ad0ff', '#b0a090', '#8affc8', '#d0a0ff', '#ff5ae0']; // 5: hostile loot chest

// ------------------------------------------------------------------ main draw
let tagRects: [number, number, number][] = []; // name tags already drawn this frame, so close ships' tags stack instead of overlapping

let worldProjection: ((x: number, y: number) => { x: number; y: number }) | undefined;
/** Engine projection for flight; standalone canvas previews retain their own local camera. */
export function setWorldProjection(
  project: (x: number, y: number) => { x: number; y: number },
): void {
  worldProjection = project;
}
/**
 * Master rendering pipeline: backdrop, stellar bodies, mining fields, loot, shots, beams, ships, effects, and HUD overlays.
 * @param clientGameState Game state object
 * @param canvasRenderingContext2D Destination canvas rendering context
 * @param width2 Viewport width in pixels
 * @param height2 Viewport height in pixels
 * @param deltaTime Delta time in seconds since previous frame
 * @param currentTime Timestamp in milliseconds
 */
export function draw(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width2: number,
  height2: number,
  deltaTime: number,
  currentTime: number,
  layer: 'all' | 'background' | 'middle' | 'foreground' = 'all',
): void {
  tagRects = [];
  const clientView = clientGameState.view,
    zoom2 = clientGameState.zoom,
    starSystem = systemsById[clientGameState.sys!];
  const dock = clientGameState.landed && STELLARS[clientGameState.landed.stellar];
  let centerX = dock ? dock.x : (clientView ? clientView.rx : 0) + (clientGameState.lookX || 0),
    centerY = dock ? dock.y : (clientView ? clientView.ry : 0) + (clientGameState.lookY || 0); // hold right-click to look ahead
  Object.assign(cameraState, { cx: centerX, cy: centerY, z: zoom2, W: width2, H: height2 }); // un-shaken camera, used for mouse picking
  if (layer === 'all' && shake && clientGameState.opts && clientGameState.opts.shake !== false) {
    centerX += ((Math.random() - 0.5) * shake * 2) / zoom2;
    centerY += ((Math.random() - 0.5) * shake * 2) / zoom2;
  }
  const screenX = (positionX: number) =>
      layer !== 'all' && worldProjection
        ? worldProjection(positionX, centerY).x
        : (positionX - centerX) * zoom2 + width2 / 2,
    screenY = (positionY: number) =>
      layer !== 'all' && worldProjection
        ? worldProjection(centerX, positionY).y
        : (positionY - centerY) * zoom2 + height2 / 2;
  if (layer === 'all' || layer === 'background') {
    canvasRenderingContext2D.fillStyle = '#000';
    canvasRenderingContext2D.fillRect(0, 0, width2, height2);
    if (!starSystem) return;
    const arrivalBackdrop =
      starSystem.id === 'beyond-rift' ? assetImage('milky_way_arrival_backdrop.jpg') : null;
    if (arrivalBackdrop && ready(arrivalBackdrop)) {
      const cover = Math.max(
        width2 / arrivalBackdrop.naturalWidth,
        height2 / arrivalBackdrop.naturalHeight,
      );
      const imageWidth = arrivalBackdrop.naturalWidth * cover,
        imageHeight = arrivalBackdrop.naturalHeight * cover;
      canvasRenderingContext2D.drawImage(
        arrivalBackdrop,
        (width2 - imageWidth) / 2,
        (height2 - imageHeight) / 2,
        imageWidth,
        imageHeight,
      );
    }
    const stars2 = stars(starSystem.id),
      hexToRgb2 = hexToRgb(FACTIONS[starSystem.faction].color);
    for (const [nextX, nextY, nextRadius, entryKey] of stars2.neb) {
      // faint nebulae in the faction's colour
      const positionX = screenX(nextX * 0.4 + centerX * 0.6),
        positionY = screenY(nextY * 0.4 + centerY * 0.6),
        radius = nextRadius * zoom2 * 0.6;
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        positionX,
        positionY,
        0,
        positionX,
        positionY,
        radius,
      );
      canvasGradient.addColorStop(
        0,
        `rgba(${hexToRgb2[0]},${hexToRgb2[1]},${hexToRgb2[2]},${0.05 + entryKey * 0.05})`,
      );
      canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.fillRect(
        positionX - radius,
        positionY - radius,
        radius * 2,
        radius * 2,
      );
    }
    if (!['beyond-rift', 'founding-vigil'].includes(starSystem.id))
      drawDecorFar(
        canvasRenderingContext2D,
        starSystem,
        width2,
        height2,
        zoom2,
        centerX,
        centerY,
        currentTime,
      ); // galaxies and gas clouds far behind the stars
    for (const { L: length, depth, size } of stars2.layers) {
      for (const [startX, startY, secondValue, textWidth] of length) {
        let positionX = (startX - centerX * depth) % 2048,
          positionY = (startY - centerY * depth) % 2048;
        if (positionX < 0) positionX += 2048;
        if (positionY < 0) positionY += 2048;
        for (let positionX22 = positionX; positionX22 < width2 + 2048; positionX22 += 2048)
          for (let positionY22 = positionY; positionY22 < height2 + 2048; positionY22 += 2048) {
            if (positionX22 > width2 || positionY22 > height2) continue;
            const value = Math.round(
              255 * secondValue * (0.85 + 0.15 * Math.sin(currentTime / 700 + textWidth * 20)),
            );
            canvasRenderingContext2D.fillStyle = `rgb(${value},${value},${Math.min(255, value + 20)})`;
            canvasRenderingContext2D.fillRect(positionX22, positionY22, size, size);
          }
      }
    }
    const lens = clientGameState.you?.story?.flags as RealityFlags | undefined;
    const lensColor =
      lens?.main_ending === 'unsettling' && lens.unsettled_with
        ? FACTIONS[lens.unsettled_with]?.color
        : null;
    if (lensColor) {
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.globalAlpha = 0.055;
      canvasRenderingContext2D.fillStyle = lensColor;
      canvasRenderingContext2D.fillRect(0, 0, width2, height2);
      canvasRenderingContext2D.restore();
    }
    if (!['beyond-rift', 'founding-vigil'].includes(starSystem.id))
      drawDecorMid(
        canvasRenderingContext2D,
        starSystem,
        width2,
        height2,
        zoom2,
        centerX,
        centerY,
        currentTime,
      );
    if (!['beyond-rift', 'founding-vigil'].includes(starSystem.id))
      drawDecorNear(
        canvasRenderingContext2D,
        starSystem,
        width2,
        height2,
        zoom2,
        screenX,
        screenY,
        currentTime,
      ); // 2.2 scenery in the system itself
    if (!['beyond-rift', 'founding-vigil'].includes(starSystem.id))
      drawPulseBoundary(canvasRenderingContext2D, starSystem, screenX, screenY, zoom2);
    const reality = storyScenery(clientGameState.you?.story?.flags as RealityFlags | undefined);
    if (starSystem.id === EXPEDITION_HULK.system && reality.dormantArk) {
      const dormantArkImage = assetImage('ships/925.webp');
      const frame = SPRITES[925],
        size = EXPEDITION_HULK.size * zoom2;
      if (dormantArkImage.complete && dormantArkImage.naturalWidth) {
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.filter = 'brightness(0.45)';
        canvasRenderingContext2D.drawImage(
          dormantArkImage,
          0,
          0,
          frame.fs,
          frame.fs,
          screenX(EXPEDITION_HULK.x) - size / 2,
          screenY(EXPEDITION_HULK.y) - size / 2,
          size,
          size,
        );
        canvasRenderingContext2D.restore();
      }
    }
    if (starSystem.id === 'dimmer' && reality.breachSetpieces) {
      const station = assetImage('stations/0.png');
      const x = screenX(1600),
        y = screenY(-900),
        size = 450 * zoom2;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.globalAlpha = reducedStoryEffects(clientGameState)
        ? 0.7
        : 0.65 + 0.1 * Math.sin(currentTime / 2100);
      if (ready(station))
        canvasRenderingContext2D.drawImage(station, x - size / 2, y - size / 2, size, size);
      canvasRenderingContext2D.fillStyle = '#c9c0df';
      canvasRenderingContext2D.font = '13px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillText('Border station — disputed contact', x, y - size / 2 - 10);
      canvasRenderingContext2D.restore();
    }
    if (starSystem.id === 'founding-vigil' && reality.foundingVigil) {
      const vigil = decorImg('derelict_0');
      if (ready(vigil))
        canvasRenderingContext2D.drawImage(
          vigil,
          screenX(0) - 300 * zoom2,
          screenY(0) - 300 * zoom2,
          600 * zoom2,
          600 * zoom2,
        );
    }
    const sequence = storySequences.get(clientGameState);
    if (sequence?.kind === 'ark-departure' && clientView) {
      const awakeArkImage = assetImage('ships/926.webp');
      const progress = Math.min(1, Math.max(0, (currentTime - sequence.began) / 12000));
      const extent = Math.min(width2, height2),
        worldSpan = extent / zoom2;
      const destinationX = clientView.rx + worldSpan * 0.3,
        destinationY = clientView.ry - worldSpan * 0.22;
      drawQuantumRift(
        canvasRenderingContext2D,
        screenX(destinationX),
        screenY(destinationY),
        extent * 0.45,
        currentTime,
      );
      if (ready(awakeArkImage)) {
        const size = extent * 0.35 * (1 - Math.max(0, (progress - 0.8) / 0.2));
        canvasRenderingContext2D.drawImage(
          awakeArkImage,
          9 * 480,
          0,
          480,
          480,
          screenX(clientView.rx + worldSpan * (-0.3 + 0.6 * progress)) - size / 2,
          screenY(destinationY) - size / 2,
          size,
          size,
        );
      }
    }
    // stellars
    let position;
    for (const rawStellarBody of starSystem.stellars) {
      const positionX = screenX(rawStellarBody.x),
        positionY = screenY(rawStellarBody.y);
      if (
        positionX < -rawStellarBody.r * 3 * zoom2 ||
        positionY < -rawStellarBody.r * 3 * zoom2 ||
        positionX > width2 + rawStellarBody.r * 3 * zoom2 ||
        positionY > height2 + rawStellarBody.r * 3 * zoom2
      )
        continue;
      let label = rawStellarBody.name;
      if (rawStellarBody.wormhole) {
        const quantum = starSystem.id === 'quantum-rift' || starSystem.id === 'beyond-rift';
        const portalImage = assetImage(quantum ? 'quantum_rift.png' : 'wormhole.png');
        // Original periodic Gateway frames; interpolate only to smooth display cadence.
        if (quantum) {
          drawQuantumRift(
            canvasRenderingContext2D,
            positionX,
            positionY,
            rawStellarBody.r * 2.6 * zoom2,
            currentTime,
          );
        } else if (portalImage.complete && portalImage.naturalWidth) {
          const frames = loopFrames(currentTime, WORMHOLE.frames, WORMHOLE.frameMs),
            fileSystem = portalImage.naturalWidth / WORMHOLE.columns,
            state = rawStellarBody.r * 2.6 * zoom2;
          canvasRenderingContext2D.save();
          canvasRenderingContext2D.translate(positionX, positionY);
          if (!quantum) canvasRenderingContext2D.rotate(currentTime / 9000);
          canvasRenderingContext2D.globalCompositeOperation = quantum ? 'source-over' : 'lighter';
          // Additive weights preserve brightness, including the wrap from frame 31 to 0.
          for (const [factionId, weight] of [
            [frames.first, 1 - frames.mix],
            [frames.second, frames.mix],
          ]) {
            canvasRenderingContext2D.globalAlpha = weight;
            canvasRenderingContext2D.drawImage(
              portalImage,
              (factionId % WORMHOLE.columns) * fileSystem,
              Math.floor(factionId / WORMHOLE.columns) * fileSystem,
              fileSystem,
              fileSystem,
              -state / 2,
              -state / 2,
              state,
              state,
            );
          }
          canvasRenderingContext2D.restore();
        }
      } else if (rawStellarBody.hub) {
        if (reality.core !== 'gone' && reality.core !== 'dark') {
          const lightRadius = rawStellarBody.r * zoom2;
          const coreLight = canvasRenderingContext2D.createRadialGradient(
            positionX,
            positionY,
            0,
            positionX,
            positionY,
            lightRadius,
          );
          const intensity =
            reality.core === 'awake' ? 0.34 : reality.core === 'asleep' ? 0.035 : 0.08;
          coreLight.addColorStop(0, `rgba(174,155,255,${intensity})`);
          coreLight.addColorStop(1, 'rgba(174,155,255,0)');
          canvasRenderingContext2D.fillStyle = coreLight;
          canvasRenderingContext2D.fillRect(
            positionX - lightRadius,
            positionY - lightRadius,
            lightRadius * 2,
            lightRadius * 2,
          );
        }
        // the Quantum Station hub turns slowly; neighbouring frames are cross-faded so the rotation is smooth
        const hubImg = assetImage('hub.png');
        if (ready(hubImg)) {
          const fileSystem = hubImg.naturalWidth / 6,
            state = rawStellarBody.r * 2.13 * zoom2,
            time = (currentTime / 1000 / HUB_PERIOD) * HUB_FRAMES,
            factionId = Math.floor(time) % HUB_FRAMES,
            factionId1 = (factionId + 1) % HUB_FRAMES,
            entryKey = time - Math.floor(time);
          canvasRenderingContext2D.drawImage(
            hubImg,
            (factionId % 6) * fileSystem,
            Math.floor(factionId / 6) * fileSystem,
            fileSystem,
            fileSystem,
            positionX - state / 2,
            positionY - state / 2,
            state,
            state,
          );
          canvasRenderingContext2D.globalAlpha = entryKey;
          canvasRenderingContext2D.drawImage(
            hubImg,
            (factionId1 % 6) * fileSystem,
            Math.floor(factionId1 / 6) * fileSystem,
            fileSystem,
            fileSystem,
            positionX - state / 2,
            positionY - state / 2,
            state,
            state,
          );
          canvasRenderingContext2D.globalAlpha = 1;
        }
      } else if (rawStellarBody.site) {
        const state = clientGameState.sites && clientGameState.sites[rawStellarBody.id],
          operations = state ? state.ops : 0,
          htmlImageElement = assetImage(`stations/${operations}.png`);
        if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
          const state4 = rawStellarBody.r * (2.2 + operations * 0.25) * zoom2;
          canvasRenderingContext2D.globalCompositeOperation = 'lighter';
          canvasRenderingContext2D.drawImage(
            htmlImageElement,
            positionX - state4 / 2,
            positionY - state4 / 2,
            state4,
            state4,
          );
          canvasRenderingContext2D.globalCompositeOperation = 'source-over';
        }
        label = state
          ? `${state.owner}'s Personal Station · Station Tier ${operations}`
          : 'Derelict Station Hull (unclaimed)';
      } else if (
        (rawStellarBody.kind === 'planet' || rawStellarBody.kind === 'moon') &&
        (position = planetSprite(rawStellarBody, currentTime))
      ) {
        const width = position.S * position.scale * zoom2;
        canvasRenderingContext2D.drawImage(
          position.canvas,
          positionX - width / 2,
          positionY - width / 2,
          width,
          width,
        );
      } // procedural planets (old art until built)
      else if (rawStellarBody.kind === 'station' && (position = stationSprite(rawStellarBody))) {
        const secondState = rawStellarBody.r * 2.5 * zoom2;
        canvasRenderingContext2D.drawImage(
          position,
          positionX - secondState / 2,
          positionY - secondState / 2,
          secondState,
          secondState,
        );
      } // rendered stations
      else {
        const htmlCanvasElement = planetImage(rawStellarBody);
        canvasRenderingContext2D.drawImage(
          htmlCanvasElement,
          positionX - (htmlCanvasElement.width * zoom2) / 2,
          positionY - (htmlCanvasElement.height * zoom2) / 2,
          htmlCanvasElement.width * zoom2,
          htmlCanvasElement.height * zoom2,
        );
      }
      if (
        clientGameState.hoverStellar === rawStellarBody.id &&
        clientGameState.navStellar !== rawStellarBody.id
      ) {
        canvasRenderingContext2D.strokeStyle = 'rgba(255,255,255,.25)';
        canvasRenderingContext2D.setLineDash([3, 6]);
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(
          positionX,
          positionY,
          rawStellarBody.r * zoom2 * 1.15 + 8,
          0,
          Math.PI * 2,
        );
        canvasRenderingContext2D.stroke();
        canvasRenderingContext2D.setLineDash([]);
      }
      if (clientGameState.navStellar === rawStellarBody.id) {
        canvasRenderingContext2D.strokeStyle = 'rgba(120,200,255,.6)';
        canvasRenderingContext2D.setLineDash([6, 6]);
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(
          positionX,
          positionY,
          rawStellarBody.r * zoom2 * 1.15 + 8,
          0,
          Math.PI * 2,
        );
        canvasRenderingContext2D.stroke();
        canvasRenderingContext2D.setLineDash([]);
      }
      canvasRenderingContext2D.fillStyle = 'rgba(210,220,240,.8)';
      canvasRenderingContext2D.font = '15px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillText(
        label,
        positionX,
        positionY +
          rawStellarBody.r * zoom2 +
          (rawStellarBody.hub ? -rawStellarBody.r * zoom2 * 0.25 : 18),
      );
      const colOwner =
        clientGameState.world &&
        clientGameState.world.colonies &&
        clientGameState.world.colonies[rawStellarBody.id];
      if (colOwner) {
        canvasRenderingContext2D.fillStyle = '#ffd27a';
        canvasRenderingContext2D.font = '14px "Pixelify Sans", sans-serif';
        canvasRenderingContext2D.fillText(
          `${colOwner}'s colony`,
          positionX,
          positionY + rawStellarBody.r * zoom2 + 34,
        );
      }
    }
  }
  if (layer === 'background') return;
  if (layer === 'all') {
    // asteroids, gas pockets and crystal clusters
    for (const entryKey of clientGameState.rocks || []) {
      if (!entryKey.hp) continue;
      const positionX = screenX(entryKey.x),
        positionY = screenY(entryKey.y),
        radius = entryKey.r * zoom2;
      if (
        positionX < -radius * 2 ||
        positionY < -radius * 2 ||
        positionX > width2 + radius * 2 ||
        positionY > height2 + radius * 2
      )
        continue;
      const rowIndex =
          entryKey.ore !== 'gas' &&
          objImg(
            entryKey.ore === 'shards'
              ? 'crys' + (Math.abs(entryKey.id) % 4)
              : 'rock' + (Math.abs(entryKey.id) % 10),
          ),
        radiusRatio = rowIndex && rowIndex.complete && rowIndex.naturalWidth; // rendered asteroids
      const image = radiusRatio ? rowIndex : rockImage(entryKey),
        secondState = radiusRatio ? entryKey.r * 2.35 * zoom2 : image.width * zoom2;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(
        (currentTime / 1000) * (entryKey.ore === 'gas' ? 0.05 : 0.12) * (entryKey.id % 2 ? 1 : -1) +
          entryKey.id,
      );
      canvasRenderingContext2D.globalAlpha = 0.45 + (0.55 * entryKey.hp) / 100;
      if (entryKey.ore === 'gas') canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      canvasRenderingContext2D.drawImage(
        image,
        -secondState / 2,
        -secondState / 2,
        secondState,
        secondState,
      );
      canvasRenderingContext2D.restore();
      canvasRenderingContext2D.globalAlpha = 1;
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      if (entryKey.hp < 100 && entryKey.hp > 0) {
        canvasRenderingContext2D.fillStyle = 'rgba(0,0,0,.6)';
        canvasRenderingContext2D.fillRect(
          positionX - radius * 0.6,
          positionY + radius + 4,
          radius * 1.2,
          3,
        );
        canvasRenderingContext2D.fillStyle = '#e8c070';
        canvasRenderingContext2D.fillRect(
          positionX - radius * 0.6,
          positionY + radius + 4,
          (radius * 1.2 * entryKey.hp) / 100,
          3,
        );
      }
    }
  }
  if (layer === 'all' || layer === 'middle') {
    if (layer === 'middle') {
      for (const rock of clientGameState.rocks || []) {
        if (!(rock.hp > 0 && rock.hp < 100)) continue;
        const x = screenX(rock.x),
          y = screenY(rock.y),
          radius = rock.r * zoom2;
        canvasRenderingContext2D.fillStyle = 'rgba(0,0,0,.6)';
        canvasRenderingContext2D.fillRect(x - radius * 0.6, y + radius + 4, radius * 1.2, 3);
        canvasRenderingContext2D.fillStyle = '#e8c070';
        canvasRenderingContext2D.fillRect(
          x - radius * 0.6,
          y + radius + 4,
          (radius * 1.2 * rock.hp) / 100,
          3,
        );
      }
    }

    drawTowing(clientGameState, canvasRenderingContext2D, screenX, screenY, zoom2, width2, height2);
    drawMining(
      clientGameState,
      canvasRenderingContext2D,
      screenX,
      screenY,
      zoom2,
      width2,
      height2,
      currentTime,
    );
    for (const [pixelX, pixelY] of salvagePoints(clientGameState)) {
      const positionX = screenX(pixelX),
        positionY = screenY(pixelY);
      canvasRenderingContext2D.strokeStyle = 'rgba(255,200,90,.6)';
      canvasRenderingContext2D.lineWidth = 1.5;
      canvasRenderingContext2D.setLineDash([4, 6]);
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 160 * zoom2, 0, 6.283);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.setLineDash([]);
      canvasRenderingContext2D.fillStyle = '#ffc85a';
      canvasRenderingContext2D.font = '14px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillText('SALVAGE', positionX, positionY - 160 * zoom2 - 6);
    } // 2.4 quest salvage
    // survey points for an active survey job here
    for (const [pixelX, pixelY] of surveyPoints(clientGameState)) {
      const positionX = screenX(pixelX),
        positionY = screenY(pixelY);
      canvasRenderingContext2D.strokeStyle = 'rgba(90,216,255,.55)';
      canvasRenderingContext2D.lineWidth = 1.5;
      canvasRenderingContext2D.setLineDash([8, 8]);
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 450 * zoom2, 0, 6.283);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.setLineDash([]);
      canvasRenderingContext2D.fillStyle = '#5ad8ff';
      canvasRenderingContext2D.font = '14px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillText('SURVEY POINT', positionX, positionY);
    }
  }
  if (layer === 'middle') return;
  if (layer === 'all') {
    // loot: credits (gold), salvage crates (blue), ore (brown), gas (green), crystal shards (violet)
    for (const loot2 of clientGameState.loot) {
      const positionX = screenX(loot2.x),
        positionY = screenY(loot2.y),
        htmlImageElement = objImg('loot' + Math.min(5, loot2.kind || 0)); // rendered loot
      if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
        const quantity =
          (loot2.kind === 5 ? 30 + Math.sin(currentTime / 200) * 2 : 18) * Math.max(0.6, zoom2);
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.translate(positionX, positionY);
        canvasRenderingContext2D.rotate(currentTime / 900 + loot2.id);
        canvasRenderingContext2D.shadowColor = LOOT_COL[loot2.kind] || '#fff';
        canvasRenderingContext2D.shadowBlur = loot2.kind === 5 ? 18 : 9;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          -quantity / 2,
          -quantity / 2,
          quantity,
          quantity,
        );
        canvasRenderingContext2D.restore();
        continue;
      }
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(currentTime / 600 + loot2.id);
      canvasRenderingContext2D.fillStyle = LOOT_COL[loot2.kind] || '#fff';
      canvasRenderingContext2D.shadowColor = canvasRenderingContext2D.fillStyle;
      canvasRenderingContext2D.shadowBlur = loot2.kind === 5 ? 16 : 8;
      const quantity2 =
        loot2.kind === 5 ? 6 + Math.sin(currentTime / 200) : loot2.kind >= 2 ? 3 : 4;
      canvasRenderingContext2D.fillRect(
        -quantity2 * zoom2,
        -quantity2 * zoom2,
        quantity2 * 2 * zoom2,
        quantity2 * 2 * zoom2,
      );
      canvasRenderingContext2D.restore();
    }
    // shots
    canvasRenderingContext2D.lineCap = 'round';
    for (const shot of clientGameState.shots) {
      const weaponAsset = clientGameState.A!.weapons[shot.w];
      if (!shot.col) {
        shot.W = weaponAsset;
        shot.col = weaponColor(weaponAsset);
        shot.look = weaponLook(weaponAsset);
      }
      const positionX = screenX(shot.x),
        positionY = screenY(shot.y);
      if (positionX < -40 || positionY < -40 || positionX > width2 + 40 || positionY > height2 + 40)
        continue;
      drawShot(
        canvasRenderingContext2D,
        shot as RenderShot & { col: string; look: string },
        positionX,
        positionY,
        zoom2,
        currentTime,
      );
    }
    canvasRenderingContext2D.shadowBlur = 0;
    // ships
    for (const renderEntity of clientGameState.ents.values())
      drawShip(
        clientGameState,
        canvasRenderingContext2D,
        renderEntity,
        screenX(renderEntity.rx),
        screenY(renderEntity.ry),
        zoom2,
        currentTime,
      );
    if (clientView && clientGameState.ents.get(clientView.id)) {
    } else if (clientView && clientGameState.myHull)
      drawShip(
        clientGameState,
        canvasRenderingContext2D,
        { ...clientView, hull: clientGameState.myHull, fl: clientView.fl, id: clientView.id },
        screenX(clientView.rx),
        screenY(clientView.ry),
        zoom2,
        currentTime,
      );
  }
  if (layer === 'foreground') {
    for (const ship of clientGameState.ents.values())
      drawShip(
        clientGameState,
        canvasRenderingContext2D,
        ship,
        screenX(ship.rx),
        screenY(ship.ry),
        zoom2,
        currentTime,
        true,
      );
    if (clientView && !clientGameState.ents.has(clientView.id) && clientGameState.myHull)
      drawShip(
        clientGameState,
        canvasRenderingContext2D,
        { ...clientView, hull: clientGameState.myHull },
        screenX(clientView.rx),
        screenY(clientView.ry),
        zoom2,
        currentTime,
        true,
      );
  }
  // beams
  for (const beam of clientGameState.beams) {
    const event =
      beam.id === (clientView && clientView.id) ? clientView : clientGameState.ents.get(beam.id);
    if (!event) continue;
    const weaponAsset = clientGameState.A!.weapons[beam.w],
      weaponColor2 = weaponColor(weaponAsset);
    const startX = screenX(event.rx),
      startY = screenY(event.ry),
      firstValue = beam.a / 1000,
      positionX = startX + Math.sin(firstValue) * beam.len * zoom2,
      positionY = startY - Math.cos(firstValue) * beam.len * zoom2;
    const beamOwner = clientGameState.ents.get(beam.id);
    const opacity = beamOwner ? storyShipOpacity(clientGameState, beamOwner, currentTime) : 1;
    canvasRenderingContext2D.strokeStyle = weaponColor2;
    canvasRenderingContext2D.globalAlpha = 0.45 * opacity;
    canvasRenderingContext2D.lineWidth = 6 * Math.max(0.7, zoom2);
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.moveTo(startX, startY);
    canvasRenderingContext2D.lineTo(positionX, positionY);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.globalAlpha = opacity;
    canvasRenderingContext2D.strokeStyle = '#fff';
    canvasRenderingContext2D.lineWidth = 1.6;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.moveTo(startX, startY);
    canvasRenderingContext2D.lineTo(positionX, positionY);
    canvasRenderingContext2D.stroke();
  }
  canvasRenderingContext2D.globalAlpha = 1;
  // shield shimmer: an arc of the shield bubble facing the hit
  for (const [identifier, shieldHit] of shieldHits) {
    const event =
      identifier === (clientView && clientView.id)
        ? clientView
        : clientGameState.ents.get(identifier);
    if (!event) continue;
    const shipHullAsset =
      clientGameState.A!.ships[(event as RenderEntity).hull] ||
      clientGameState.A!.ships[clientGameState.myHull];
    const radius =
      (shipHullAsset ? shipHullAsset.size : 60) * 0.42 * zoom2 * clientGameState.spriteScale;
    const positionX = screenX(event.rx),
      positionY = screenY(event.ry),
      atan = Math.atan2(shieldHit.hy - event.ry, shieldHit.hx - event.rx),
      entryKey = shieldHit.t / 0.35;
    canvasRenderingContext2D.strokeStyle = `rgba(120,200,255,${0.8 * entryKey})`;
    canvasRenderingContext2D.lineWidth = 3;
    canvasRenderingContext2D.shadowColor = '#7ad0ff';
    canvasRenderingContext2D.shadowBlur = 10;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, radius, atan - 0.9, atan + 0.9);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.strokeStyle = `rgba(120,200,255,${0.2 * entryKey})`;
    canvasRenderingContext2D.lineWidth = 1.5;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.shadowBlur = 0;
  }
  // effects
  for (let index = visualEffects.length - 1; index >= 0; index--) {
    const factionId = visualEffects[index];
    const entryKey = factionId.life / factionId.max,
      positionX = screenX(factionId.x),
      positionY = screenY(factionId.y);
    if (factionId.hyper) {
      // 2.1 hyperspace flash
      const event = 1 - entryKey,
        radius = factionId.r * zoom2 * (0.6 + event * 0.8),
        canvasGradient = canvasRenderingContext2D.createRadialGradient(
          positionX,
          positionY,
          0,
          positionX,
          positionY,
          radius,
        );
      canvasGradient.addColorStop(0, `rgba(255,255,255,${entryKey})`);
      canvasGradient.addColorStop(0.25, `rgba(200,230,255,${entryKey * 0.85})`);
      canvasGradient.addColorStop(1, 'rgba(80,140,255,0)');
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.fill();
      const length = factionId.r * zoom2 * (2.5 + event * 5),
        canvasGradient3 = canvasRenderingContext2D.createLinearGradient(
          positionX - length,
          positionY,
          positionX + length,
          positionY,
        );
      canvasGradient3.addColorStop(0, 'rgba(120,180,255,0)');
      canvasGradient3.addColorStop(0.5, `rgba(235,245,255,${entryKey * 0.9})`);
      canvasGradient3.addColorStop(1, 'rgba(120,180,255,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient3;
      canvasRenderingContext2D.fillRect(
        positionX - length,
        positionY - Math.max(1, 2.2 * zoom2 * entryKey),
        length * 2,
        Math.max(2, 4.4 * zoom2 * entryKey),
      );
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      continue;
    }
    if (factionId.ring) {
      canvasRenderingContext2D.globalAlpha = entryKey;
      canvasRenderingContext2D.strokeStyle = factionId.c;
      canvasRenderingContext2D.lineWidth = 3;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        positionX,
        positionY,
        factionId.r * (1 - entryKey) * zoom2 + 4,
        0,
        Math.PI * 2,
      );
      if (factionId.fill) {
        canvasRenderingContext2D.fillStyle = factionId.c;
        canvasRenderingContext2D.globalAlpha = entryKey * 0.5;
        canvasRenderingContext2D.fill();
      } else canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.globalAlpha = 1;
      continue;
    }
    if (factionId.anim) {
      const htmlImageElement = fxImg(factionId.anim);
      if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
        const fileSystem = htmlImageElement.naturalWidth / 6,
          fraction = Math.min(23, Math.floor((1 - entryKey) * 24)),
          size = factionId.r * 2.6 * zoom2;
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.translate(positionX, positionY);
        canvasRenderingContext2D.rotate(factionId.rot);
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          (fraction % 6) * fileSystem,
          Math.floor(fraction / 6) * fileSystem,
          fileSystem,
          fileSystem,
          -size / 2,
          -size / 2,
          size,
          size,
        );
        canvasRenderingContext2D.restore();
      }
      continue;
    }
    if (factionId.flare) {
      const htmlImageElement = fxImg('flare');
      if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
        const size = factionId.r * 2 * zoom2 * (0.6 + 0.4 * entryKey);
        canvasRenderingContext2D.globalCompositeOperation = 'lighter';
        canvasRenderingContext2D.globalAlpha = entryKey;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          positionX - size / 2,
          positionY - size / 2,
          size,
          size,
        );
        canvasRenderingContext2D.globalAlpha = 1;
        canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      }
      continue;
    }
    if (factionId.debris && fxImg('shards').complete && fxImg('shards').naturalWidth) {
      const htmlImageElement = fxImg('shards'),
        systemIndex = factionId.si ?? 0,
        size = Math.max(6, factionId.s * 5) * zoom2;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(factionId.rot);
      canvasRenderingContext2D.globalAlpha = Math.min(1, entryKey * 2);
      canvasRenderingContext2D.drawImage(
        htmlImageElement,
        systemIndex * 48,
        0,
        48,
        48,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      if (entryKey > 0.7) {
        canvasRenderingContext2D.globalCompositeOperation = 'lighter';
        canvasRenderingContext2D.globalAlpha = (entryKey - 0.7) * 2;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          systemIndex * 48,
          0,
          48,
          48,
          -size / 2,
          -size / 2,
          size,
          size,
        );
        canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      }
      canvasRenderingContext2D.restore();
      canvasRenderingContext2D.globalAlpha = 1;
      continue;
    }
    if (factionId.ball) {
      const radius = factionId.r * (0.35 + 0.65 * (1 - entryKey * entryKey)) * zoom2,
        canvasGradient = canvasRenderingContext2D.createRadialGradient(
          positionX,
          positionY,
          0,
          positionX,
          positionY,
          radius,
        );
      canvasGradient.addColorStop(0, `rgba(255,255,230,${entryKey})`);
      canvasGradient.addColorStop(0.35, `rgba(255,200,90,${entryKey * 0.9})`);
      canvasGradient.addColorStop(0.7, `rgba(255,90,30,${entryKey * 0.6})`);
      canvasGradient.addColorStop(1, 'rgba(80,20,0,0)');
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      continue;
    }
    if (factionId.smoke) {
      const radius = factionId.r * (1.6 - entryKey) * zoom2;
      canvasRenderingContext2D.fillStyle = `rgba(90,85,80,${0.35 * entryKey})`;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.fill();
      continue;
    }
    if (factionId.debris) {
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(factionId.rot);
      canvasRenderingContext2D.globalAlpha = Math.min(1, entryKey * 2);
      canvasRenderingContext2D.fillStyle = entryKey > 0.7 ? '#ffb060' : '#6a6a70';
      canvasRenderingContext2D.fillRect(
        -factionId.s * zoom2,
        -factionId.s * zoom2 * 0.5,
        factionId.s * 2 * zoom2,
        factionId.s * zoom2,
      );
      canvasRenderingContext2D.restore();
      canvasRenderingContext2D.globalAlpha = 1;
      continue;
    }
    if (factionId.num !== undefined) {
      canvasRenderingContext2D.globalAlpha = Math.min(1, entryKey * 1.6);
      canvasRenderingContext2D.font = `bold ${factionId.mine ? 15 : 13}px "Pixelify Sans", sans-serif`;
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.lineWidth = 3;
      canvasRenderingContext2D.strokeStyle = '#000';
      canvasRenderingContext2D.strokeText(String(factionId.num), positionX, positionY);
      canvasRenderingContext2D.fillStyle = factionId.mine ? '#ffd27a' : '#ff7a6a';
      canvasRenderingContext2D.fillText(String(factionId.num), positionX, positionY);
      canvasRenderingContext2D.globalAlpha = 1;
      continue;
    }
    canvasRenderingContext2D.globalAlpha = entryKey;
    canvasRenderingContext2D.fillStyle = factionId.c;
    canvasRenderingContext2D.fillRect(
      positionX,
      positionY,
      factionId.s * zoom2 + 0.5,
      factionId.s * zoom2 + 0.5,
    );
    canvasRenderingContext2D.globalAlpha = 1;
  }
  hudOverlay(
    clientGameState,
    canvasRenderingContext2D,
    width2,
    height2,
    currentTime,
    screenX,
    screenY,
    clientView,
  );
}
// ------------------------------------------------------------------ 2.0 screen-space feedback: edge arrows, damage, jumps
// HUD cards over the flight view that edge arrows keep clear of: the career card and ship status.
const EDGE_ARROW_OBSTACLE_IDS = ['tut', 'flightstatus'];
let edgeArrowObstacles: ScreenRect[] = [];
let edgeArrowObstaclesAt = 0;

/**
 * Re-reads the HUD card rectangles in drawing pixels, at most four times a second.
 * The drawing layers are off-DOM canvases sized to the on-page flight view.
 * @param width Drawing width.
 * @param currentTime Timestamp in milliseconds.
 */
function refreshEdgeArrowObstacles(width: number, currentTime: number): void {
  if (Math.abs(currentTime - edgeArrowObstaclesAt) < 250) return;
  edgeArrowObstaclesAt = currentTime;
  const canvasRect = document.getElementById('view')?.getBoundingClientRect();
  if (!canvasRect?.width) return;
  const scale = width / canvasRect.width;
  edgeArrowObstacles = [];
  for (const id of EDGE_ARROW_OBSTACLE_IDS) {
    const element = document.getElementById(id);
    if (!element || element.classList.contains('hidden')) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    edgeArrowObstacles.push({
      left: (rect.left - canvasRect.left) * scale,
      top: (rect.top - canvasRect.top) * scale,
      right: (rect.right - canvasRect.left) * scale,
      bottom: (rect.bottom - canvasRect.top) * scale,
    });
  }
}
/**
 * Renders an off-screen pointing arrow and label at the viewport perimeter.
 * @param canvasRenderingContext2D 2D rendering context
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param positionX World-to-screen projected X coordinate
 * @param positionY World-to-screen projected Y coordinate
 * @param column CSS color string
 * @param label Display text
 * @param distance Distance in kilometers
 */
function edgeArrow(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width: number,
  height: number,
  positionX: number,
  positionY: number,
  column: string,
  label: string,
  distance: number,
): void {
  canvasRenderingContext2D.font = '13px "Pixelify Sans", sans-serif';
  const time = `${label} · ${Math.round(distance)} km`;
  const anchor = edgeArrowAnchor(width, height, positionX, positionY, edgeArrowObstacles, {
    x: canvasRenderingContext2D.measureText(time).width / 2 + 30,
    y: 30,
  });
  if (!anchor) return;
  const velocityErrorX = anchor.x,
    velocityErrorY = anchor.y,
    atan = Math.atan2(positionY - height / 2, positionX - width / 2);
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.translate(velocityErrorX, velocityErrorY);
  canvasRenderingContext2D.rotate(atan);
  canvasRenderingContext2D.fillStyle = column;
  canvasRenderingContext2D.globalAlpha = 0.9;
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.moveTo(14, 0);
  canvasRenderingContext2D.lineTo(-6, -9);
  canvasRenderingContext2D.lineTo(-2, 0);
  canvasRenderingContext2D.lineTo(-6, 9);
  canvasRenderingContext2D.closePath();
  canvasRenderingContext2D.fill();
  canvasRenderingContext2D.restore();
  canvasRenderingContext2D.textAlign = 'center';
  canvasRenderingContext2D.fillStyle = column;
  canvasRenderingContext2D.globalAlpha = 0.85;
  const localX = velocityErrorX - Math.cos(atan) * 26,
    localY = velocityErrorY - Math.sin(atan) * 22 + 4;
  canvasRenderingContext2D.lineWidth = 3;
  canvasRenderingContext2D.strokeStyle = 'rgba(0,0,0,.7)';
  canvasRenderingContext2D.strokeText(time, localX, localY);
  canvasRenderingContext2D.fillText(time, localX, localY);
  canvasRenderingContext2D.globalAlpha = 1;
}
const STARS = Array.from({ length: 170 }, (unused, index) => {
  const radius = (count: number) => {
    const value = Math.sin(index * 127.1 + count * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    x: radius(1),
    y: radius(2),
    z: 0.35 + radius(3) * 0.65,
    c: radius(4) < 0.12 ? 'w' : radius(4) < 0.4 ? 'b' : 'n',
  };
});
const STAR_COL: Record<string, string> = { n: '220,235,255', b: '150,195,255', w: '255,215,170' };
/**
 * Renders directional starfield velocity streaks during hyperspace transitions.
 * @param canvasRenderingContext2D 2D rendering context
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param firstValue Ship heading angle
 * @param length2 Streak length
 * @param alpha Opacity factor
 * @param drift Drift distance
 */
function streaks(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width: number,
  height: number,
  firstValue: number,
  length: number,
  alpha: number,
  drift: number,
): void {
  // star streaks lying along heading a, sliding backwards past you
  const unitX = Math.sin(firstValue),
    unitY = -Math.cos(firstValue),
    span = width + height;
  canvasRenderingContext2D.lineCap = 'round';
  for (const sTARS of STARS) {
    let pixelX = (sTARS.x * span - unitX * drift * sTARS.z) % span,
      pixelY = (sTARS.y * span - unitY * drift * sTARS.z) % span;
    if (pixelX < 0) pixelX += span;
    if (pixelY < 0) pixelY += span;
    pixelX -= (span - width) / 2;
    pixelY -= (span - height) / 2;
    if (pixelX < -200 || pixelY < -200 || pixelX > width + 200 || pixelY > height + 200) continue;
    const length3 = length * sTARS.z;
    canvasRenderingContext2D.strokeStyle = `rgba(${STAR_COL[sTARS.c]},${alpha * sTARS.z})`;
    canvasRenderingContext2D.lineWidth = 0.8 + sTARS.z * 1.4;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.moveTo(pixelX, pixelY);
    canvasRenderingContext2D.lineTo(pixelX - unitX * length3, pixelY - unitY * length3);
    canvasRenderingContext2D.stroke();
  }
}
/**
 * Renders hyperspace jump departure spool animation, rings, and flash.
 * @param clientGameState Game state
 * @param canvasRenderingContext2D 2D context
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param currentTime Timestamp in milliseconds
 * @param positionX Ship screen X
 * @param positionY Ship screen Y
 * @param firstValue Ship heading angle
 */
function hyperOut(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentTime: number,
  positionX: number,
  positionY: number,
  firstValue: number,
): void {
  const computedShipStats = clientGameState.you && clientGameState.you.shipStats,
    duration = computedShipStats && computedShipStats.jumpFast ? 600 : 1600,
    entryKey = Math.min(1, (currentTime - (clientGameState._jumpStart || currentTime)) / duration);
  // the edges darken as the drive spools
  const canvasGradient = canvasRenderingContext2D.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7,
  );
  canvasGradient.addColorStop(0, 'rgba(0,0,10,0)');
  canvasGradient.addColorStop(1, `rgba(0,4,20,${0.55 * Math.min(1, entryKey * 2)})`);
  canvasRenderingContext2D.fillStyle = canvasGradient;
  canvasRenderingContext2D.fillRect(0, 0, width, height);
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  if (entryKey < 0.55)
    for (let index = 0; index < 3; index++) {
      // rings of energy closing in on the ship
      const quantity = (entryKey / 0.55 + index / 3) % 1,
        radius = 22 + (1 - quantity) * 170;
      canvasRenderingContext2D.strokeStyle = `rgba(150,200,255,${0.55 * quantity * (1 - (entryKey / 0.55) * 0.6)})`;
      canvasRenderingContext2D.lineWidth = 1.5 + quantity * 2;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.stroke();
    }
  const core = canvasRenderingContext2D.createRadialGradient(
    positionX,
    positionY,
    0,
    positionX,
    positionY,
    40 + 90 * entryKey,
  );
  core.addColorStop(0, `rgba(220,240,255,${0.35 + 0.5 * entryKey})`);
  core.addColorStop(1, 'rgba(90,140,255,0)');
  canvasRenderingContext2D.fillStyle = core;
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.arc(positionX, positionY, 40 + 90 * entryKey, 0, 6.283);
  canvasRenderingContext2D.fill();
  const secondState = Math.max(0, (entryKey - 0.25) / 0.75); // the stars stretch into streaks along your heading
  if (secondState > 0)
    streaks(
      canvasRenderingContext2D,
      width,
      height,
      firstValue,
      6 + secondState * secondState * Math.max(width, height) * 0.9,
      0.25 + 0.6 * secondState,
      secondState * secondState * 2600,
    );
  if (entryKey > 0.82) {
    // the bloom and lens streak as you leave
    const secondValue = (entryKey - 0.82) / 0.18;
    canvasRenderingContext2D.fillStyle = `rgba(225,238,255,${0.85 * secondValue * secondValue})`;
    canvasRenderingContext2D.fillRect(0, 0, width, height);
    const length = width * (0.3 + secondValue),
      canvasGradient = canvasRenderingContext2D.createLinearGradient(
        positionX - length,
        positionY,
        positionX + length,
        positionY,
      );
    canvasGradient.addColorStop(0, 'rgba(120,180,255,0)');
    canvasGradient.addColorStop(0.5, `rgba(255,255,255,${0.9 * secondValue})`);
    canvasGradient.addColorStop(1, 'rgba(120,180,255,0)');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fillRect(
      positionX - length,
      positionY - 3 - 6 * secondValue,
      length * 2,
      6 + 12 * secondValue,
    );
  }
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
}
/**
 * Renders hyperspace jump arrival deceleration bloom and shockwave rings.
 * @param clientGameState Game state
 * @param canvasRenderingContext2D 2D context
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param time Milliseconds elapsed since arrival
 * @param positionX Ship screen X
 * @param positionY Ship screen Y
 * @param firstValue Ship heading angle
 */
function hyperIn(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  positionX: number,
  positionY: number,
  firstValue: number,
): void {
  const entryKey = time / 1100; // 0 at arrival .. 1 settled
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  const secondState = Math.max(0, 1 - entryKey / 0.45);
  if (secondState > 0)
    streaks(
      canvasRenderingContext2D,
      width,
      height,
      firstValue,
      4 + secondState * secondState * Math.max(width, height) * 0.7,
      0.8 * secondState,
      2600 + (1 - secondState) * 900,
    ); // streaks collapse back into stars
  for (const [distance, column] of [
    [0, '170,215,255'],
    [6, '255,170,200'],
  ] as [number, string][]) {
    const radius = 30 + entryKey * Math.max(width, height) * 0.6 + distance,
      alpha = 0.6 * (1 - entryKey);
    canvasRenderingContext2D.strokeStyle = `rgba(${column},${alpha})`;
    canvasRenderingContext2D.lineWidth = 3 * (1 - entryKey) + 1;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
    canvasRenderingContext2D.stroke();
  }
  if (entryKey < 0.5) {
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(
      positionX,
      positionY,
      0,
      positionX,
      positionY,
      160,
    );
    canvasGradient.addColorStop(0, `rgba(235,245,255,${0.8 * (1 - entryKey * 2)})`);
    canvasGradient.addColorStop(1, 'rgba(120,170,255,0)');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, 160, 0, 6.283);
    canvasRenderingContext2D.fill();
  }
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  if (entryKey < 0.35) {
    canvasRenderingContext2D.fillStyle = `rgba(225,238,255,${0.75 * (1 - entryKey / 0.35) ** 2})`;
    canvasRenderingContext2D.fillRect(0, 0, width, height);
  }
}
/**
 * Renders screen-space HUD indicators, off-screen arrows, and damage vignettes.
 * @param clientGameState Game state
 * @param canvasRenderingContext2D 2D context
 * @param width2 Viewport width
 * @param height2 Viewport height
 * @param currentTime Timestamp in milliseconds
 * @param screenX Screen X projector function
 * @param screenY Screen Y projector function
 * @param clientView Current player view state
 */
function hudOverlay(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentTime: number,
  screenX: (worldX: number) => number,
  screenY: (worldY: number) => number,
  clientView: ClientView | null,
): void {
  if (!clientView) return;
  const starSystem = systemsById[clientGameState.sys!];
  if (!starSystem) return;
  if (typeof document !== 'undefined') refreshEdgeArrowObstacles(width, currentTime);
  // mission objectives in this system, your nav point, and your target
  const seen = new Set();
  for (const missionTarget of missionTargets(clientGameState))
    if (missionTarget.stellar && !seen.has(missionTarget.stellar)) {
      const rawStellarBody = starSystem.stellars.find(
        (rawStellarBody) => rawStellarBody.id === missionTarget.stellar,
      );
      if (rawStellarBody) {
        seen.add(rawStellarBody.id);
        edgeArrow(
          canvasRenderingContext2D,
          width,
          height,
          screenX(rawStellarBody.x),
          screenY(rawStellarBody.y),
          missionTarget.kind === 'story' || missionTarget.kind === 'arc' ? '#ffd65a' : '#ffb86a',
          rawStellarBody.name,
          Math.hypot(rawStellarBody.x - clientView.rx, rawStellarBody.y - clientView.ry),
        );
      }
    }
  for (const [positionX, positionY] of salvagePoints(clientGameState))
    edgeArrow(
      canvasRenderingContext2D,
      width,
      height,
      screenX(positionX),
      screenY(positionY),
      '#ffc85a',
      'Salvage',
      Math.hypot(positionX - clientView.rx, positionY - clientView.ry),
    ); // 2.4
  if (clientGameState.navStellar && !seen.has(clientGameState.navStellar)) {
    const rawStellarBody = starSystem.stellars.find(
      (rawStellarBody3) => rawStellarBody3.id === clientGameState.navStellar,
    );
    if (rawStellarBody)
      edgeArrow(
        canvasRenderingContext2D,
        width,
        height,
        screenX(rawStellarBody.x),
        screenY(rawStellarBody.y),
        '#7ad0ff',
        rawStellarBody.name,
        Math.hypot(rawStellarBody.x - clientView.rx, rawStellarBody.y - clientView.ry),
      );
  }
  if (Math.hypot(clientGameState.lookX || 0, clientGameState.lookY || 0) > 50)
    edgeArrow(
      canvasRenderingContext2D,
      width,
      height,
      screenX(clientView.rx),
      screenY(clientView.ry),
      '#9fe0ff',
      'You',
      Math.hypot(clientGameState.lookX!, clientGameState.lookY!),
    ); // 2.1 look-ahead
  const time = clientGameState.target && clientGameState.ents.get(clientGameState.target);
  if (time)
    edgeArrow(
      canvasRenderingContext2D,
      width,
      height,
      screenX(time.rx),
      screenY(time.ry),
      clientGameState.isAlly && clientGameState.isAlly(time)
        ? clientGameState.pal.ally
        : clientGameState.hostile(time)
          ? clientGameState.pal.hostile
          : clientGameState.pal.friend,
      (time.name || (clientGameState.A!.ships[time.hull] || {}).name || 'target').split(' · ')[0],
      Math.hypot(time.rx - clientView.rx, time.ry - clientView.ry),
    );
  drawShipChat(
    clientGameState as ClientGameState & { A: GameAssets },
    canvasRenderingContext2D,
    width,
    height,
    screenX,
    screenY,
    currentTime,
    false,
  );
  // 2.1 hyperspace: spool rings, star streaks along your heading, a white bloom; arrival plays it in reverse with a shockwave
  if (clientGameState._jumping || clientView.fl & 8)
    hyperOut(
      clientGameState,
      canvasRenderingContext2D,
      width,
      height,
      currentTime,
      screenX(clientView.rx),
      screenY(clientView.ry),
      clientView.a,
    );
  if (clientGameState._arriveT && currentTime - clientGameState._arriveT < 1100)
    hyperIn(
      clientGameState,
      canvasRenderingContext2D,
      width,
      height,
      currentTime - clientGameState._arriveT,
      screenX(clientView.rx),
      screenY(clientView.ry),
      clientView.a,
    );
  const storySequence = storySequences.get(clientGameState);
  if (storySequence?.kind === 'rift-crossing') {
    const progress = Math.min(1, Math.max(0, (currentTime - storySequence.began) / 2800));
    const reduced = reducedStoryEffects(clientGameState);
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.globalAlpha = reduced
      ? 0.12 * (1 - progress)
      : (0.16 + 0.18 * Math.sin(progress * Math.PI * 7) ** 2) * (1 - progress);
    canvasRenderingContext2D.fillStyle = '#a372fa';
    canvasRenderingContext2D.fillRect(0, 0, width, height);
    if (!reduced) {
      canvasRenderingContext2D.strokeStyle = '#e4c4ff';
      canvasRenderingContext2D.lineWidth = 3;
      for (let index = 0; index < 5; index++) {
        const x = (width * (index + 0.5)) / 5;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(x, 0);
        canvasRenderingContext2D.lineTo(x + Math.sin(currentTime / 95 + index) * 90, height * 0.35);
        canvasRenderingContext2D.lineTo(x - 60, height * 0.65);
        canvasRenderingContext2D.lineTo(x + 40, height);
        canvasRenderingContext2D.stroke();
      }
    }
    canvasRenderingContext2D.restore();
  }
  // damage: a red flash when your hull is hit, and a slow pulse when armour is low
  const computedShipStats = clientGameState.you && clientGameState.you.shipStats,
    armor2 = computedShipStats ? clientView.armor / Math.max(1, computedShipStats.armor) : 1,
    hurt = clientGameState._hurtT
      ? Math.max(0, 1 - (currentTime - clientGameState._hurtT) / 450)
      : 0,
    lowerValue =
      armor2 < 0.3 ? (0.35 + 0.25 * Math.sin(currentTime / 260)) * (1 - armor2 / 0.3) : 0,
    value = Math.max(hurt * 0.55, lowerValue);
  if (value > 0.01) {
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    canvasGradient.addColorStop(0, 'rgba(255,0,0,0)');
    canvasGradient.addColorStop(1, `rgba(200,10,0,${value})`);
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fillRect(0, 0, width, height);
  }
}

/** Emit projectile trails during update, independently of rasterization/culling. */
function updateShotEffects(state: RenderShot, column: string, look: string): void {
  const space = Math.hypot(state.vx, state.vy) || 1,
    unitX = state.vx / space,
    unitY = state.vy / space;
  if (look === 'magma') {
    if (Math.random() < 0.5)
      visualEffects.push({
        x: state.x,
        y: state.y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0.35,
        max: 0.35,
        c: '#ff8a30',
        s: 1.6,
      });
  } else if (look === 'missile' || look === 'rocket') {
    if (Math.random() < 0.8)
      visualEffects.push({
        x: state.x - unitX * 8,
        y: state.y - unitY * 8,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        smoke: true,
        life: 0.6,
        max: 0.6,
        r: 3,
      });
  } else if (look === 'torp' || look === 'sing') {
    if (Math.random() < 0.6)
      visualEffects.push({
        x: state.x,
        y: state.y,
        vx: 0,
        vy: 0,
        life: 0.4,
        max: 0.4,
        c: column,
        s: 2.2,
      });
  }
}
/** Sample visual shake once; interaction camera remains unshaken. */
export function cameraShake(state: ClientGameState): { x: number; y: number } {
  return state.opts.shake === false
    ? { x: 0, y: 0 }
    : {
        x: ((Math.random() - 0.5) * shake * 2) / state.zoom,
        y: ((Math.random() - 0.5) * shake * 2) / state.zoom,
      };
}
/** Advance transient effects once per update, never while rasterizing. */
export function updateEffects(
  clientGameState: ClientGameState,
  deltaTime: number,
  currentTime: number,
): void {
  const previousSystem = previousStorySystem.get(clientGameState);
  if (
    (previousSystem === 'quantum-rift' && clientGameState.sys === 'beyond-rift') ||
    (previousSystem === 'beyond-rift' && clientGameState.sys === 'quantum-rift')
  )
    startStorySequence(clientGameState, 'rift-crossing', currentTime);
  previousStorySystem.set(clientGameState, clientGameState.sys);
  const sequence = storySequences.get(clientGameState);
  if (sequence) {
    const elapsed = currentTime - sequence.began;
    if (elapsed > (sequence.kind === 'rift-crossing' ? 2800 : 12000))
      storySequences.delete(clientGameState);
    else if (
      sequence.kind === 'rift-crossing' &&
      clientGameState.opts.shake &&
      !reducedStoryEffects(clientGameState)
    )
      shake = Math.max(shake, 16 * (1 - elapsed / 2800));
  }
  updateShipChat(clientGameState, currentTime);
  for (const [identifier, hit] of shieldHits) {
    hit.t -= deltaTime;
    if (hit.t <= 0) shieldHits.delete(identifier);
  }
  for (let index = visualEffects.length - 1; index >= 0; index--) {
    const effect = visualEffects[index];
    effect.life -= deltaTime;
    if (effect.life <= 0) {
      visualEffects.splice(index, 1);
      continue;
    }
    if (effect.vx !== undefined) {
      effect.x += effect.vx * deltaTime;
      effect.y += effect.vy * deltaTime;
    }
    if (effect.debris) {
      effect.rot += effect.vr * deltaTime;
      effect.si ??= Math.floor(Math.random() * 8);
    }
    if (effect.smoke) {
      const damping = Math.pow(0.97, deltaTime * 60);
      effect.vx *= damping;
      effect.vy *= damping;
    }
  }
  shake *= Math.pow(0.02, deltaTime);
  if (shake < 0.2) shake = 0;
  for (const shot of clientGameState.shots) {
    const weapon = clientGameState.A?.weapons[shot.w];
    if (weapon)
      updateShotEffects(
        { ...shot, x: shot.rx ?? shot.x, y: shot.ry ?? shot.y },
        weaponColor(weapon),
        weaponLook(weapon),
      );
  }
  for (const renderShip of clientGameState.ents.values()) {
    const size2 = clientGameState.A?.ships[renderShip.hull]?.size || 60;
    if (!clientGameState.A?.ships[renderShip.hull]) continue;
    shipBank(
      renderShip,
      currentTime,
      renderShip.id === clientGameState.myId &&
        !(renderShip.fl & 8) &&
        !(clientGameState.combat?.on || clientGameState.combat?.delegated),
    );
    if (
      visualEffects.length < 1200 &&
      renderShip.ar != null &&
      renderShip.ar < 50 &&
      !(renderShip.fl & 8) &&
      renderShip.rx != null &&
      Math.random() < ((50 - renderShip.ar) / 50) * 0.4
    ) {
      // damaged ships trail smoke, and badly damaged ones burn
      const offsetX = (Math.random() - 0.5) * size2 * 0.4,
        offsetY = (Math.random() - 0.5) * size2 * 0.4;
      visualEffects.push({
        x: renderShip.rx + offsetX,
        y: renderShip.ry + offsetY,
        vx: (renderShip.vx || 0) * 0.3 + (Math.random() - 0.5) * 12,
        vy: (renderShip.vy || 0) * 0.3 + (Math.random() - 0.5) * 12,
        smoke: true,
        life: 1.1,
        max: 1.1,
        r: 2.5 + size2 * 0.03,
      });
      if (renderShip.ar < 25 && Math.random() < 0.45)
        visualEffects.push({
          x: renderShip.rx + offsetX,
          y: renderShip.ry + offsetY,
          vx: (Math.random() - 0.5) * 50,
          vy: (Math.random() - 0.5) * 50,
          life: 0.3,
          max: 0.3,
          c: Math.random() < 0.5 ? '#ffb040' : '#ff6a20',
          s: 1.4,
        });
    }
  }
}
/** Authored heading/bank selection shared by native sprites and canvas previews. */
export function shipFrame(
  clientGameState: ClientGameState,
  renderShip: RenderShip,
  _currentTime: number,
) {
  const shipHullAsset = clientGameState.A!.ships[renderShip.hull];
  const size2 = shipHullAsset.size;
  const fraction0 = ((Math.round(renderShip.a / (Math.PI / 18)) % 36) + 36) % 36,
    spriteSheetConfig = shipHullAsset.spr,
    fileSystem = spriteSheetConfig ? spriteSheetConfig.fs : size2,
    columns = spriteSheetConfig ? spriteSheetConfig.cols : 6;
  const fraction =
      fraction0 +
      (spriteSheetConfig && spriteSheetConfig.banks && !(renderShip.fl & 4)
        ? ((renderShip as RenderShip & { _bank?: { bank: number } })._bank?.bank || 0) * 36
        : 0),
    sourceX = (fraction % columns) * fileSystem,
    sourceY = Math.floor(fraction / columns) * fileSystem;
  return { fraction0, fraction, sourceX, sourceY, fileSystem, spriteSheetConfig };
}
/**
 * Renders an individual ship sprite, engine trails, shield/armor bars, and name tags.
 * @param clientGameState Game state
 * @param canvasRenderingContext2D Destination canvas rendering context
 * @param renderShip Ship entity to draw
 * @param positionX Screen coordinate X
 * @param positionY Screen coordinate Y
 * @param positionZ Zoom scale factor
 * @param currentTime Timestamp in milliseconds
 */
export function drawShip(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  renderShip: RenderShip,
  positionX: number,
  positionY: number,
  positionZ: number,
  currentTime: number,
  overlaysOnly = false,
): void {
  const shipHullAsset = clientGameState.A!.ships[renderShip.hull];
  if (!shipHullAsset) return;
  const size2 = shipHullAsset.size,
    scale = positionZ * clientGameState.spriteScale,
    width2 = size2 * scale;
  if (
    positionX < -width2 ||
    positionY < -width2 ||
    positionX > canvasRenderingContext2D.canvas.width + width2 ||
    positionY > canvasRenderingContext2D.canvas.height + width2
  )
    return;
  if (!overlaysOnly)
    shipBank(
      renderShip,
      currentTime,
      renderShip.id === clientGameState.myId &&
        !(renderShip.fl & 8) &&
        !(clientGameState.combat?.on || clientGameState.combat?.delegated),
    );
  const { fraction0, sourceX, sourceY, fileSystem, spriteSheetConfig } = shipFrame(
    clientGameState,
    renderShip,
    currentTime,
  );
  const realityOpacity = storyShipOpacity(clientGameState, renderShip, currentTime);
  if (!overlaysOnly) {
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.globalAlpha = realityOpacity;
    const htmlImageElement = sheet(shipHullAsset);
    if (renderShip.fl & 8 && htmlImageElement.complete && htmlImageElement.naturalWidth) {
      // a ship in hyperspace leaves a stretched, blue-shifted ghost trail
      const unitX = Math.sin(renderShip.a),
        unitY = -Math.cos(renderShip.a);
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      for (let index = 6; index >= 1; index--) {
        canvasRenderingContext2D.globalAlpha = realityOpacity * 0.22 * (1 - index / 7);
        const options = index * width2 * 0.32;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          sourceX,
          sourceY,
          fileSystem,
          fileSystem,
          positionX - unitX * options - width2 / 2,
          positionY - unitY * options - width2 / 2,
          width2,
          width2,
        );
      }
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      canvasRenderingContext2D.globalAlpha = realityOpacity;
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        positionX + unitX * width2 * 0.35,
        positionY + unitY * width2 * 0.35,
        0,
        positionX + unitX * width2 * 0.35,
        positionY + unitY * width2 * 0.35,
        width2 * 0.6,
      );
      canvasGradient.addColorStop(0, 'rgba(220,240,255,.85)');
      canvasGradient.addColorStop(1, 'rgba(120,170,255,0)');
      canvasRenderingContext2D.globalCompositeOperation = 'lighter';
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        positionX + unitX * width2 * 0.35,
        positionY + unitY * width2 * 0.35,
        width2 * 0.6,
        0,
        6.283,
      );
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.globalCompositeOperation = 'source-over';
    }
    if (renderShip.fl & 32) {
      canvasRenderingContext2D.shadowColor = 'rgba(255,205,90,.95)';
      canvasRenderingContext2D.shadowBlur = Math.max(6, 16 * positionZ);
    } // mastery Tier 5 gold trim
    if (htmlImageElement.complete && htmlImageElement.naturalWidth)
      canvasRenderingContext2D.drawImage(
        htmlImageElement,
        sourceX,
        sourceY,
        fileSystem,
        fileSystem,
        positionX - width2 / 2,
        positionY - width2 / 2,
        width2,
        width2,
      );
    else {
      canvasRenderingContext2D.fillStyle = '#888';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, width2 / 4, 0, 6.28);
      canvasRenderingContext2D.fill();
    }
    canvasRenderingContext2D.shadowBlur = 0;
    if (renderShip.fl & 1 && shipHullAsset.glow && (!spriteSheetConfig || spriteSheetConfig.glow)) {
      const htmlImageElement = sheet(shipHullAsset, true);
      if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
        canvasRenderingContext2D.globalCompositeOperation = 'lighter';
        // Extrude the authored engine mask aft, preserving every nozzle and bank.
        // Bounded passes, no particle state or simulation changes.
        const boost = !!(renderShip.fl & 2),
          heading = fraction0 * (Math.PI / 18),
          reduced = (clientGameState._exhaustReduced ??= matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches),
          flicker = reduced ? 1 : 0.94 + 0.06 * Math.sin(currentTime / 47 + renderShip.id * 2.3),
          length = width2 * (boost ? 0.32 : 0.14) * flicker;
        canvasRenderingContext2D.save();
        // The authored glow is already soft. Per-pass canvas blur forces costly
        // full-sprite rasterization (12 times per engine per frame) on software GPUs.
        // Layer the existing mask directly so exhaust cannot stall flight input.
        for (let index = 12; index >= 1; index--) {
          const time = index / 12,
            after = length * time;
          canvasRenderingContext2D.globalAlpha =
            realityOpacity * (boost ? 0.38 : 0.26) * (1 - time * 0.85);
          canvasRenderingContext2D.drawImage(
            htmlImageElement,
            sourceX,
            sourceY,
            fileSystem,
            fileSystem,
            positionX - width2 / 2 - Math.sin(heading) * after,
            positionY - width2 / 2 + Math.cos(heading) * after,
            width2,
            width2,
          );
        }
        canvasRenderingContext2D.restore();
        canvasRenderingContext2D.globalAlpha = realityOpacity * (boost ? 1 : 0.8 * flicker);
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          sourceX,
          sourceY,
          fileSystem,
          fileSystem,
          positionX - width2 / 2,
          positionY - width2 / 2,
          width2,
          width2,
        );
        canvasRenderingContext2D.globalAlpha = realityOpacity;
        canvasRenderingContext2D.globalCompositeOperation = 'source-over';
      }
    }
    canvasRenderingContext2D.restore();
  }
  if (renderShip.fl & 4) {
    canvasRenderingContext2D.fillStyle = 'rgba(255,120,60,.8)';
    if (Math.random() < 0.3)
      canvasRenderingContext2D.fillRect(
        positionX + ((Math.random() - 0.5) * width2) / 2,
        positionY + ((Math.random() - 0.5) * width2) / 2,
        2,
        2,
      );
  }
  if (clientGameState.hover === renderShip.id && clientGameState.target !== renderShip.id) {
    const radius = width2 * 0.5 + 4;
    canvasRenderingContext2D.strokeStyle = 'rgba(255,255,255,.35)';
    canvasRenderingContext2D.lineWidth = 1;
    canvasRenderingContext2D.setLineDash([3, 4]);
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.setLineDash([]);
  }
  const target2 = clientGameState.target === renderShip.id;
  const ally = clientGameState.isAlly && clientGameState.isAlly(renderShip);
  if (ally && !target2) {
    // Armada members and their wingmates carry a green marker
    const radius = width2 * 0.55 + 5;
    canvasRenderingContext2D.strokeStyle = clientGameState.pal.ally;
    canvasRenderingContext2D.globalAlpha = 0.75;
    canvasRenderingContext2D.lineWidth = 1.2;
    for (let entryKey = 0; entryKey < 4; entryKey++) {
      const firstValue = (entryKey * Math.PI) / 2 + Math.PI / 4;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        positionX,
        positionY,
        radius,
        firstValue - 0.28,
        firstValue + 0.28,
      );
      canvasRenderingContext2D.stroke();
    }
    canvasRenderingContext2D.globalAlpha = 1;
  }
  if (target2) {
    const radius = width2 * 0.55 + 6;
    canvasRenderingContext2D.strokeStyle = ally
      ? clientGameState.pal.ally
      : clientGameState.hostile(renderShip)
        ? clientGameState.pal.hostile
        : clientGameState.pal.friend;
    canvasRenderingContext2D.lineWidth = 1.5;
    for (const [deltaX, deltaY] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(
        positionX + deltaX * radius,
        positionY + deltaY * radius * 0.6,
      );
      canvasRenderingContext2D.lineTo(positionX + deltaX * radius, positionY + deltaY * radius);
      canvasRenderingContext2D.lineTo(
        positionX + deltaX * radius * 0.6,
        positionY + deltaY * radius,
      );
      canvasRenderingContext2D.stroke();
    }
  }
  if (renderShip.name && (renderShip.fl & 16 || renderShip.fl & 64 || target2 || ally)) {
    canvasRenderingContext2D.fillStyle = ally
      ? clientGameState.pal.ally
      : renderShip.fl & 16
        ? clientGameState.hostile(renderShip)
          ? clientGameState.pal.hostile
          : '#9cf'
        : renderShip.fl & 64
          ? '#f2c66a'
          : '#ddd'; // rival captains carry gold name tags
    canvasRenderingContext2D.font = '15px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.textAlign = 'center';
    const width3 = canvasRenderingContext2D.measureText(renderShip.name).width;
    let targetY = positionY - width2 * 0.55 - 6;
    for (
      let entryKey = 0;
      entryKey < 6 &&
      tagRects.some(
        (quantity) =>
          Math.abs(quantity[0] - positionX) < (quantity[2] + width3) / 2 + 4 &&
          Math.abs(quantity[1] - targetY) < 14,
      );
      entryKey++
    )
      targetY -= 14;
    tagRects.push([positionX, targetY, width3]);
    canvasRenderingContext2D.globalAlpha = realityOpacity;
    canvasRenderingContext2D.fillText(renderShip.name, positionX, targetY);
    canvasRenderingContext2D.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ radar
/**
 * Renders the circular cockpit radar display with blips for ships, planets, loot, and asteroids.
 * @param clientGameState Game state object
 * @param canvasRenderingContext2D Radar canvas rendering context
 */
export function radar(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
): void {
  const width2 = canvasRenderingContext2D.canvas.width,
    height2 = canvasRenderingContext2D.canvas.height,
    clientView = clientGameState.view,
    diameter = Math.min(width2, height2);
  canvasRenderingContext2D.fillStyle = '#031326';
  canvasRenderingContext2D.fillRect(0, 0, width2, height2);
  canvasRenderingContext2D.strokeStyle = '#164f78';
  canvasRenderingContext2D.lineWidth = 1;
  for (let entryKey = 1; entryKey < 4; entryKey++) {
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(width2 / 2, height2 / 2, (entryKey * diameter) / 6, 0, 6.28);
    canvasRenderingContext2D.stroke();
  }
  if (!clientView) return;
  const starSystem = systemsById[clientGameState.sys!],
    nebula =
      clientGameState.world &&
      clientGameState.world.anomalies &&
      clientGameState.world.anomalies[clientGameState.sys!] === 'nebula',
    radius = 4200 * (nebula ? 0.5 : 1),
    entryKey2 = (diameter / 2 / radius) * 1.15;
  clientGameState.radarR = radius;
  const pixelX = (positionX: number) => width2 / 2 + (positionX - clientView.rx) * entryKey2,
    pixelY = (positionY: number) => height2 / 2 + (positionY - clientView.ry) * entryKey2;
  if (starSystem)
    for (const rawStellarBody of starSystem.stellars) {
      canvasRenderingContext2D.fillStyle = rawStellarBody.wormhole
        ? '#9ac8ff'
        : rawStellarBody.site
          ? clientGameState.sites && clientGameState.sites[rawStellarBody.id]
            ? '#a8f'
            : '#776'
          : rawStellarBody.hub
            ? '#9ab'
            : '#556';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        pixelX(rawStellarBody.x),
        pixelY(rawStellarBody.y),
        Math.max(2.5, rawStellarBody.r * entryKey2),
        0,
        6.28,
      );
      canvasRenderingContext2D.fill();
    }
  for (const entryKey of clientGameState.rocks || [])
    if (entryKey.hp) {
      canvasRenderingContext2D.fillStyle =
        entryKey.ore === 'gas' ? '#2a6a5a' : entryKey.ore === 'shards' ? '#6a4a8a' : '#4a4640';
      canvasRenderingContext2D.fillRect(pixelX(entryKey.x) - 1, pixelY(entryKey.y) - 1, 2, 2);
    }
  for (const loot2 of clientGameState.loot) {
    canvasRenderingContext2D.fillStyle = loot2.kind === 5 ? '#ff5ae0' : '#fff';
    const quantity = loot2.kind === 5 ? 2 : 1;
    canvasRenderingContext2D.fillRect(
      pixelX(loot2.x) - quantity,
      pixelY(loot2.y) - quantity,
      quantity * 2,
      quantity * 2,
    );
  }
  for (const [positionX, positionY] of salvagePoints(clientGameState)) {
    canvasRenderingContext2D.strokeStyle = '#ffc85a';
    canvasRenderingContext2D.lineWidth = 1.5;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.rect(pixelX(positionX) - 4, pixelY(positionY) - 4, 8, 8);
    canvasRenderingContext2D.stroke();
  }
  for (const [positionX, positionY] of surveyPoints(clientGameState)) {
    canvasRenderingContext2D.strokeStyle = '#5ad8ff';
    canvasRenderingContext2D.lineWidth = 1.5;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(pixelX(positionX), pixelY(positionY), 5, 0, 6.28);
    canvasRenderingContext2D.stroke();
  }
  if (nebula) {
    canvasRenderingContext2D.fillStyle = 'rgba(150,120,255,.10)';
    canvasRenderingContext2D.fillRect(0, 0, width2, height2);
  }
  for (const renderEntity of clientGameState.ents.values()) {
    if (renderEntity.id === clientView.id) continue;
    const positionX = pixelX(renderEntity.rx),
      positionY = pixelY(renderEntity.ry);
    if (positionX < 0 || positionY < 0 || positionX > width2 || positionY > height2) continue;
    const hostile2 = clientGameState.hostile(renderEntity),
      alpha = clientGameState.isAlly && clientGameState.isAlly(renderEntity);
    canvasRenderingContext2D.fillStyle =
      renderEntity.owner === clientView.id
        ? clientGameState.pal.own
        : alpha
          ? clientGameState.pal.ally
          : renderEntity.fl & 16
            ? hostile2
              ? clientGameState.pal.hostile
              : clientGameState.pal.player
            : hostile2
              ? clientGameState.pal.hostile
              : clientGameState.pal.neutral;
    const state = renderEntity.id === clientGameState.target ? 4 : alpha ? 3.2 : 2.5;
    if (hostile2 && clientGameState.opts.cb) {
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX, positionY - state);
      canvasRenderingContext2D.lineTo(positionX + state, positionY);
      canvasRenderingContext2D.lineTo(positionX, positionY + state);
      canvasRenderingContext2D.lineTo(positionX - state, positionY);
      canvasRenderingContext2D.fill();
    } // colour-blind mode: hostiles are diamonds too
    else
      canvasRenderingContext2D.fillRect(positionX - state / 2, positionY - state / 2, state, state);
  }
  canvasRenderingContext2D.fillStyle = '#fff';
  canvasRenderingContext2D.fillRect(width2 / 2 - 2, height2 / 2 - 2, 4, 4);
}

// ------------------------------------------------------------------ galaxy map (minimap and full map)
// opts.big: the full map (pan with drag, zoom with the wheel, view kept in G.mapView). Otherwise the companion minimap,
// centred on the current system. Systems you have not visited are drawn as hollow rings.
const SYS_LIST = Object.values(systemsById);
const BOUNDS = (() => {
  const baseSystems = SYS_LIST.filter((system) => storySystemVisible({}, system.id));
  const xScale = baseSystems.map((starSystem) => starSystem.x),
    yScale = baseSystems.map((starSystem) => starSystem.y);
  return {
    x0: Math.min(...xScale) - 60,
    x1: Math.max(...xScale) + 60,
    y0: Math.min(...yScale) - 60,
    y1: Math.max(...yScale) + 60,
  };
})();
/**
 * Calculates optimal galaxy map viewport centering and zoom factor to fit all systems.
 * @param width2 Canvas pixel width
 * @param height2 Canvas pixel height
 * @returns Map bounds fit object
 */
export function mapFit(
  width: number,
  height: number,
  flags?: RealityFlags,
  visible?: ReadonlySet<string>,
): MapFit & { cx: number; cy: number; fit: number } {
  const visibleSystems = SYS_LIST.filter(
    (system) => storySystemVisible(flags || {}, system.id) && (!visible || visible.has(system.id)),
  );
  // Under fog of war, fit the space the captain knows, never closer than a small region.
  const knownSpan = 900;
  const knownBounds = () => {
    const xs = visibleSystems.map((system) => system.x),
      ys = visibleSystems.map((system) => system.y);
    const centreX = (Math.min(...xs) + Math.max(...xs)) / 2,
      centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const halfX = Math.max(knownSpan, Math.max(...xs) - Math.min(...xs) + 240) / 2,
      halfY = Math.max(knownSpan, Math.max(...ys) - Math.min(...ys) + 240) / 2;
    return { x0: centreX - halfX, x1: centreX + halfX, y0: centreY - halfY, y1: centreY + halfY };
  };
  const bounds =
      visible && visibleSystems.length
        ? knownBounds()
        : flags
          ? {
              x0: Math.min(...visibleSystems.map((system) => system.x)) - 60,
              x1: Math.max(...visibleSystems.map((system) => system.x)) + 60,
              y0: Math.min(...visibleSystems.map((system) => system.y)) - 60,
              y1: Math.max(...visibleSystems.map((system) => system.y)) + 60,
            }
          : BOUNDS,
    entryKey = Math.min(width / (bounds.x1 - bounds.x0), height / (bounds.y1 - bounds.y0));
  return {
    cx: (bounds.x0 + bounds.x1) / 2,
    cy: (bounds.y0 + bounds.y1) / 2,
    k: entryKey,
    fit: entryKey,
  };
}
/** A galaxy map system name waiting to be placed. */
interface SystemLabel {
  /** System name. */
  text: string;

  /** Canvas X of the label centre. */
  x: number;

  /** Canvas Y of the label baseline. */
  y: number;

  /** Canvas font. */
  font: string;

  /** Fill colour. */
  color: string;

  /** Higher priorities are placed first and always drawn. */
  priority: number;
}

/**
 * Draws galaxy map system names, skipping lower-priority names that would overlap
 * one already drawn on the big map. Zooming in spreads systems out and reveals them.
 * @param canvasRenderingContext2D Starmap canvas rendering context
 * @param labels Candidate labels
 * @param large Whether this is the full galaxy map
 * @param background Chart background used to outline system names
 */
function drawSystemLabels(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  labels: SystemLabel[],
  large: boolean,
  background: string,
): void {
  const placed: ScreenRect[] = [];
  canvasRenderingContext2D.textAlign = 'center';
  canvasRenderingContext2D.lineWidth = 3;
  canvasRenderingContext2D.strokeStyle = background;
  for (const label of [...labels].sort((first, second) => second.priority - first.priority)) {
    canvasRenderingContext2D.font = label.font;
    const halfWidth = canvasRenderingContext2D.measureText(label.text).width / 2 + 2;
    const box = {
      left: label.x - halfWidth,
      right: label.x + halfWidth,
      top: label.y - 12,
      bottom: label.y + 3,
    };
    const overlaps = placed.some(
      (other) =>
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top,
    );
    if (large && overlaps && label.priority < 2) continue;
    placed.push(box);
    canvasRenderingContext2D.strokeText(label.text, label.x, label.y);
    canvasRenderingContext2D.fillStyle = label.color;
    canvasRenderingContext2D.fillText(label.text, label.x, label.y);
  }
}
/**
 * Renders the 2D galaxy starmap or minimap including hyperspace lanes, faction territories, and route plots.
 * @param clientGameState Game state object
 * @param canvasRenderingContext2D Starmap canvas rendering context
 * @param options Map render options (big: full interactive starmap)
 */
export function galaxy(
  clientGameState: ClientGameState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  options: { big?: boolean } = {},
): void {
  const flags = clientGameState.you?.story?.flags as RealityFlags | undefined;
  // Fog of war: only visited/charted systems and neighbours of visited systems are drawn.
  const knowledge = captainMap(clientGameState);
  const visibleSystems = SYS_LIST.filter(
    (system) =>
      storySystemVisible(flags || {}, system.id) &&
      (!knowledge || knowledge.visible.has(system.id) || system.id === clientGameState.sys),
  );
  const visibleIds = new Set(visibleSystems.map((system) => system.id));
  const width2 = canvasRenderingContext2D.canvas.width,
    height2 = canvasRenderingContext2D.canvas.height,
    large = !!options.big;
  // Draw the chart on the cockpit's blue glass; faction colors retain their meaning.
  const ink = {
    space: '#031326',
    lane: '#1f5c86',
    faintLane: '#10324d',
    names: ['#b9dcf0', '#7fa6c2'],
    legend: 'rgba(3,19,38,.86)',
  };
  canvasRenderingContext2D.fillStyle = ink.space;
  canvasRenderingContext2D.fillRect(0, 0, width2, height2);
  let mapFit2: MapFit;
  if (large) {
    const fogKey = knowledge ? knowledge.visible.size : 0;
    if (
      !clientGameState.mapView ||
      clientGameState.mapView.W !== width2 ||
      clientGameState.mapView.H !== height2
    ) {
      const mapFit3 = mapFit(width2, height2, flags, knowledge?.visible),
        mapView2 = clientGameState.mapView;
      clientGameState.mapView = Object.assign(mapView2 || {}, {
        W: width2,
        H: height2,
        fit: mapFit3.fit,
        fogKey,
      }) as MapFit & {
        W: number;
        H: number;
        prevFit?: number;
        fogKey?: number;
      };
      if (!clientGameState.mapView.k) Object.assign(clientGameState.mapView, mapFit3);
      else if (mapView2!.prevFit) clientGameState.mapView.k *= mapFit3.fit / mapView2!.prevFit;
      clientGameState.mapView.prevFit = mapFit3.fit;
    } else if (clientGameState.mapView.fogKey !== fogKey) {
      // Newly revealed space widens the zoom range; the current view stays where it is.
      const mapFit3 = mapFit(width2, height2, flags, knowledge?.visible);
      clientGameState.mapView.fit = clientGameState.mapView.prevFit = mapFit3.fit;
      clientGameState.mapView.fogKey = fogKey;
    }
    mapFit2 = clientGameState.mapView!;
  } // keep the zoom when the canvas is resized
  else {
    const here = systemsById[clientGameState.sys!] || SYS_LIST[0];
    mapFit2 = { cx: here.x, cy: here.y, k: Math.min(width2, height2) / 560 } as MapFit;
  }
  const /**
     * Transform galactic X to canvas X
     * Transform galactic Y to canvas Y
     */
    position = (point: Point) => [
      width2 / 2 + (point.x - mapFit2.cx) * mapFit2.k,
      height2 / 2 + (point.y - mapFit2.cy) * mapFit2.k,
    ];
  clientGameState[large ? 'mapXform' : 'miniXform'] = {
    cx: mapFit2.cx,
    cy: mapFit2.cy,
    k: mapFit2.k,
    W: width2,
    H: height2,
  };
  const zoom = large ? mapFit2.k / mapFit2.fit : 3;
  const enabled = (positionX: number, positionY: number, message = 40) =>
    positionX > -message &&
    positionY > -message &&
    positionX < width2 + message &&
    positionY < height2 + message;
  if (flags?.founding_vigil && flags.main_ending !== 'table') {
    const center = {
      x: FARSIDE.reduce((sum, system) => sum + system[2], 0) / FARSIDE.length,
      y: FARSIDE.reduce((sum, system) => sum + system[3], 0) / FARSIDE.length,
    };
    const [x, y] = position(center);
    canvasRenderingContext2D.strokeStyle = '#d8c89c';
    canvasRenderingContext2D.strokeRect(x - 5, y - 5, 10, 10);
    canvasRenderingContext2D.fillStyle = '#d8c89c';
    canvasRenderingContext2D.font = '12px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.fillText('The Founding Vigil', x + 10, y - 5);
  }
  // territory shading
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  if ((clientGameState.mapMode || 'factions') === 'factions' || !large)
    for (const starSystem of visibleSystems) {
      if (starSystem.id === 'founding-vigil') continue;
      const factionDef = FACTIONS[starSystem.faction];
      if (factionDef.region && starSystem.faction !== 'deep') continue;
      const [positionX, positionY] = position(starSystem);
      if (!enabled(positionX, positionY, 120 * mapFit2.k)) continue;
      const radius = 95 * mapFit2.k;
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
          positionX,
          positionY,
          0,
          positionX,
          positionY,
          radius,
        ),
        hexToRgb2 = hexToRgb(factionDef.color);
      canvasGradient.addColorStop(0, `rgba(${hexToRgb2[0]},${hexToRgb2[1]},${hexToRgb2[2]},0.10)`);
      canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.fillRect(
        positionX - radius,
        positionY - radius,
        radius * 2,
        radius * 2,
      );
    }
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  // routes
  canvasRenderingContext2D.lineWidth = 1;
  for (const starSystem of visibleSystems)
    for (const link of starSystem.links)
      if (link > starSystem.id && visibleIds.has(link)) {
        const [firstValue, secondValue] = position(starSystem),
          [component, distance] = position(systemsById[link]);
        if (!enabled(firstValue, secondValue, 400) && !enabled(component, distance, 400)) continue;
        if (knowledge && !laneKnown(knowledge, clientGameState.you, starSystem.id, link)) continue;
        canvasRenderingContext2D.strokeStyle = ink.lane;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(firstValue, secondValue);
        canvasRenderingContext2D.lineTo(component, distance);
        canvasRenderingContext2D.stroke();
      }
  // the Gateway: a dashed, glowing link between Concordia and the far mouth
  for (const starSystem of visibleSystems)
    if (
      starSystem.gate &&
      starSystem.id < starSystem.gate &&
      visibleIds.has(starSystem.gate) &&
      (!knowledge || laneKnown(knowledge, clientGameState.you, starSystem.id, starSystem.gate))
    ) {
      const [firstValue, secondValue] = position(starSystem),
        [component, distance] = position(systemsById[starSystem.gate]);
      canvasRenderingContext2D.strokeStyle = 'rgba(154,200,255,.55)';
      canvasRenderingContext2D.lineWidth = large ? 2 : 1.5;
      canvasRenderingContext2D.setLineDash([3, 6]);
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(firstValue, secondValue);
      canvasRenderingContext2D.quadraticCurveTo(
        (firstValue + component) / 2 - (distance - secondValue) * 0.15,
        (secondValue + distance) / 2 + (component - firstValue) * 0.15,
        component,
        distance,
      );
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.setLineDash([]);
    }
  const route = (clientGameState.route || []).filter((id) => visibleIds.has(id));
  if (route.length && systemsById[clientGameState.sys!]) {
    canvasRenderingContext2D.strokeStyle = '#ffd27a';
    canvasRenderingContext2D.lineWidth = large ? 2.5 : 2;
    canvasRenderingContext2D.beginPath();
    let [firstValue, secondValue] = position(systemsById[clientGameState.sys!]);
    canvasRenderingContext2D.moveTo(firstValue, secondValue);
    for (const route2 of route) {
      [firstValue, secondValue] = position(systemsById[route2]);
      canvasRenderingContext2D.lineTo(firstValue, secondValue);
    }
    canvasRenderingContext2D.stroke();
  }
  const onRoute = new Set(route),
    sites = clientGameState.sites || {},
    myStSys =
      clientGameState.you &&
      clientGameState.you.station &&
      clientGameState.you.station.claimed &&
      clientGameState.you.station.site &&
      STELLARS[clientGameState.you.station.site]
        ? STELLARS[clientGameState.you.station.site].system
        : null;
  const allySys: Record<string, string[]> = {};
  for (const message of (clientGameState.you &&
    clientGameState.you.armada &&
    clientGameState.you.armada.members) ||
    [])
    if (message.sysId && message.name !== clientGameState.myName)
      (allySys[message.sysId] = allySys[message.sysId] || []).push(message.name); // where your Armada is
  const systemLabels: SystemLabel[] = [];
  for (const starSystem of visibleSystems) {
    if (starSystem.id === 'founding-vigil') continue;
    const [positionX, positionY] = position(starSystem);
    if (!enabled(positionX, positionY)) continue;
    const factionDef = FACTIONS[starSystem.faction],
      here = starSystem.id === clientGameState.sys,
      seen = !knowledge || knowledge.known.has(starSystem.id),
      radius = large ? Math.max(3, Math.min(8, 3.2 * Math.sqrt(zoom))) : 4;
    if (seen || (large && clientGameState.mapMode && clientGameState.mapMode !== 'factions')) {
      canvasRenderingContext2D.fillStyle = large
        ? viewColor(clientGameState, starSystem, seen)
        : factionDef.color;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius, 0, 6.283);
      canvasRenderingContext2D.fill();
    } else {
      canvasRenderingContext2D.strokeStyle = factionDef.color;
      canvasRenderingContext2D.globalAlpha = 0.7;
      canvasRenderingContext2D.lineWidth = 1.5;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius - 0.5, 0, 6.283);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.globalAlpha = 1;
    }
    const site = starSystem.stellars.find((rawStellarBody) => rawStellarBody.site);
    if (site && (large ? zoom > 0.9 : true)) {
      const site2 = sites[site.id];
      canvasRenderingContext2D.fillStyle = site2 ? '#c0a0ff' : '#8a70b0';
      const quantity = radius + 2;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(positionX + quantity + 4, positionY - quantity);
      canvasRenderingContext2D.lineTo(positionX + quantity + 7, positionY - quantity + 3);
      canvasRenderingContext2D.lineTo(positionX + quantity + 4, positionY - quantity + 6);
      canvasRenderingContext2D.lineTo(positionX + quantity + 1, positionY - quantity + 3);
      canvasRenderingContext2D.fill();
    }
    if (myStSys === starSystem.id) {
      // your Personal Station: a gold station mark with its Station Tier
      const quantity = radius + 9,
        pulse = 0.6 + 0.4 * Math.sin(performance.now() / 500);
      canvasRenderingContext2D.strokeStyle = `rgba(255,210,110,${0.75 + 0.25 * pulse})`;
      canvasRenderingContext2D.lineWidth = 2;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, quantity, 0, 6.283);
      canvasRenderingContext2D.stroke();
      for (let entryKey = 0; entryKey < 4; entryKey++) {
        const firstValue = (entryKey * Math.PI) / 2 + Math.PI / 4;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(
          positionX + Math.cos(firstValue) * (quantity - 3),
          positionY + Math.sin(firstValue) * (quantity - 3),
        );
        canvasRenderingContext2D.lineTo(
          positionX + Math.cos(firstValue) * (quantity + 4),
          positionY + Math.sin(firstValue) * (quantity + 4),
        );
        canvasRenderingContext2D.stroke();
      }
      if (large) {
        canvasRenderingContext2D.font = 'bold 13px "Pixelify Sans", sans-serif';
        canvasRenderingContext2D.textAlign = 'center';
        canvasRenderingContext2D.lineWidth = 3;
        canvasRenderingContext2D.strokeStyle = ink.space;
        const time = `YOUR STATION · T-${(clientGameState.you!.station && clientGameState.you!.station.ops) || 0}`;
        canvasRenderingContext2D.strokeText(time, positionX, positionY - quantity - 6);
        canvasRenderingContext2D.fillStyle = '#ffd27a';
        canvasRenderingContext2D.fillText(time, positionX, positionY - quantity - 6);
      }
    }
    if (allySys[starSystem.id]) {
      canvasRenderingContext2D.fillStyle = clientGameState.pal.ally;
      for (let entryKey = 0; entryKey < Math.min(5, allySys[starSystem.id].length); entryKey++) {
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(
          positionX - radius - 4 - entryKey * 6,
          positionY + radius + 3,
          2.6,
          0,
          6.283,
        );
        canvasRenderingContext2D.fill();
      }
      if (large && zoom > 0.8) {
        canvasRenderingContext2D.font = '12px "Pixelify Sans", sans-serif';
        canvasRenderingContext2D.textAlign = 'right';
        canvasRenderingContext2D.lineWidth = 3;
        canvasRenderingContext2D.strokeStyle = ink.space;
        const join2 = allySys[starSystem.id].join(', ');
        canvasRenderingContext2D.strokeText(join2, positionX - radius - 4, positionY + radius + 15);
        canvasRenderingContext2D.fillText(join2, positionX - radius - 4, positionY + radius + 15);
      }
    }
    if (here) {
      canvasRenderingContext2D.strokeStyle = '#ff3a2a';
      canvasRenderingContext2D.lineWidth = 2;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius + 5, 0, 6.283);
      canvasRenderingContext2D.stroke();
    }
    if (clientGameState.hoverSys === starSystem.id) {
      canvasRenderingContext2D.strokeStyle = '#fff';
      canvasRenderingContext2D.lineWidth = 1;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, radius + 3, 0, 6.283);
      canvasRenderingContext2D.stroke();
    }
    const label =
      here ||
      clientGameState.hoverSys === starSystem.id ||
      onRoute.has(starSystem.id) ||
      (large
        ? zoom > 1.6 || (starSystem.anchor && zoom > 0.95)
        : systemsById[clientGameState.sys!] &&
          systemsById[clientGameState.sys!].links.includes(starSystem.id));
    if (label)
      systemLabels.push({
        text: starSystem.name,
        x: positionX,
        y: positionY - radius - 5,
        font:
          (large ? (here || starSystem.anchor ? 'bold 12px' : '11px') : '9px') +
          ' "Pixelify Sans", sans-serif',
        color: here ? '#fff' : seen ? ink.names[0] : ink.names[1],
        // Your system, the hovered system and your route always show; anchors before the rest.
        priority:
          here || clientGameState.hoverSys === starSystem.id || onRoute.has(starSystem.id)
            ? 2
            : starSystem.anchor
              ? 1
              : 0,
      });
  }
  drawSystemLabels(canvasRenderingContext2D, systemLabels, large, ink.space);
  // 0.6 overlays: the invasion, anomalies (2.6: territory claims removed)
  const width3: Partial<NonNullable<ClientGameState['world']>> = clientGameState.world || {},
    pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  for (const [sessionId, angle] of Object.entries(width3.anomalies || {})) {
    const starSystem = systemsById[sessionId],
      spaceAnomaly = ANOMALIES[angle];
    if (!starSystem || !spaceAnomaly || !visibleIds.has(starSystem.id)) continue;
    const [positionX, positionY] = position(starSystem);
    if (!enabled(positionX, positionY)) continue;
    canvasRenderingContext2D.font = (large ? 'bold 15px' : '12px') + ' "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.textAlign = 'center';
    canvasRenderingContext2D.fillStyle = spaceAnomaly.color;
    canvasRenderingContext2D.fillText(
      spaceAnomaly.icon,
      positionX + (large ? 12 : 8),
      positionY + (large ? 4 : 3),
    );
  }
  for (const [sessionId, livingPayloadState] of Object.entries(width3.states || {})) {
    const starSystem = systemsById[sessionId],
      systemState = STATES[livingPayloadState.k];
    if (!starSystem || !systemState || !visibleIds.has(starSystem.id)) continue;
    const [positionX, positionY] = position(starSystem);
    if (!enabled(positionX, positionY)) continue; // system states
    canvasRenderingContext2D.strokeStyle = systemState.color + 'aa';
    canvasRenderingContext2D.lineWidth = 1.5;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, large ? 10 : 7, 0, 6.283);
    canvasRenderingContext2D.stroke();
    if (large) {
      canvasRenderingContext2D.font = '14px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillText(systemState.icon, positionX - 13, positionY + 4);
    }
  }
  if (width3.invasion && systemsById[width3.invasion.sys] && visibleIds.has(width3.invasion.sys)) {
    const [positionX, positionY] = position(systemsById[width3.invasion.sys]);
    canvasRenderingContext2D.strokeStyle = `rgba(255,60,40,${0.4 + 0.6 * pulse})`;
    canvasRenderingContext2D.lineWidth = 3;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, (large ? 14 : 9) + pulse * 5, 0, 6.283);
    canvasRenderingContext2D.stroke();
    if (large) {
      canvasRenderingContext2D.font = 'bold 13px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillStyle = '#ff5a40';
      canvasRenderingContext2D.fillText('INVASION', positionX, positionY + 30);
    }
  }
  // active mission targets (gold diamond and ring; the main story is brighter)
  for (const missionTarget of missionTargets(clientGameState)) {
    const state = missionTarget.sys && systemsById[missionTarget.sys];
    if (!state) continue;
    const [positionX, positionY] = position(state);
    if (!enabled(positionX, positionY)) continue;
    const quantity = (large ? 9 : 7) + pulse * 3,
      column = missionTarget.kind === 'story' ? '255,214,90' : '255,190,110';
    canvasRenderingContext2D.strokeStyle = `rgba(${column},${0.55 + 0.45 * pulse})`;
    canvasRenderingContext2D.lineWidth = 2;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.moveTo(positionX, positionY - quantity);
    canvasRenderingContext2D.lineTo(positionX + quantity, positionY);
    canvasRenderingContext2D.lineTo(positionX, positionY + quantity);
    canvasRenderingContext2D.lineTo(positionX - quantity, positionY);
    canvasRenderingContext2D.closePath();
    canvasRenderingContext2D.stroke();
    if (large) {
      const label =
        missionTarget.kind === 'story' ? '★ ' + missionTarget.title : '◆ ' + missionTarget.title;
      canvasRenderingContext2D.font = 'bold 13px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'left';
      canvasRenderingContext2D.lineWidth = 3;
      canvasRenderingContext2D.strokeStyle = ink.space;
      canvasRenderingContext2D.strokeText(
        label.length > 38 ? label.slice(0, 36) + '…' : label,
        positionX + quantity + 4,
        positionY + 4,
      );
      canvasRenderingContext2D.fillStyle = `rgb(${column})`;
      canvasRenderingContext2D.fillText(
        label.length > 38 ? label.slice(0, 36) + '…' : label,
        positionX + quantity + 4,
        positionY + 4,
      );
      // An uncharted destination is a name on the map, with no lanes leading to it.
      if (!visibleIds.has(state.id)) {
        canvasRenderingContext2D.font = '11px "Pixelify Sans", sans-serif';
        canvasRenderingContext2D.strokeText(state.name, positionX + quantity + 4, positionY + 18);
        canvasRenderingContext2D.fillStyle = ink.names[1];
        canvasRenderingContext2D.fillText(state.name, positionX + quantity + 4, positionY + 18);
      }
    }
  }
  if (large) {
    const starSystem = systemsById.coldharbor;
    if (starSystem && visibleIds.has(starSystem.id)) {
      const [positionX, positionY] = position(starSystem);
      canvasRenderingContext2D.font = 'italic 14px "Pixelify Sans", sans-serif';
      canvasRenderingContext2D.textAlign = 'center';
      canvasRenderingContext2D.fillStyle = 'rgba(216,200,144,.55)';
      canvasRenderingContext2D.fillText(
        'beyond the Gateway',
        positionX - 20 * mapFit2.k,
        positionY + 50 * mapFit2.k + 14,
      );
    }
  }
  if (large && clientGameState.mapLegend === false) return; // the legend can be hidden
  if (large) {
    canvasRenderingContext2D.fillStyle = ink.legend;
    canvasRenderingContext2D.fillRect(
      0,
      height2 - (clientGameState.mapMode && clientGameState.mapMode !== 'factions' ? 26 : 42),
      width2,
      42,
    );
  } // a backing strip so the legend never sits on top of system names
  if (large && clientGameState.mapMode && clientGameState.mapMode !== 'factions') {
    // legend for the alternative views
    const length =
      {
        trade: [
          [
            '#3ce66e',
            `cheap ${(COMMODITIES.find((commodityDef) => commodityDef.id === (clientGameState.mapCid || 'food')) || {}).name || ''}`,
          ],
          ['#f0dc5a', 'average'],
          ['#ff503c', 'expensive'],
          ['#3a3e48', 'no market'],
        ],
        services: [
          ['#5ab0ff', 'shipyard'],
          ['#ffaa4a', 'outfitter'],
          ['#c38aff', 'both'],
          ['#3a3e48', 'neither'],
        ],
        standing: [
          ['#3ce66e', 'liked'],
          ['#c8c878', 'neutral'],
          ['#ff3c32', 'hated'],
          ['#5a5e68', 'no power'],
        ],
        danger: [
          ['#5ac878', 'safe'],
          ['#ff3228', 'deadly'],
        ],
      }[clientGameState.mapMode as 'trade' | 'services' | 'standing' | 'danger'] || [];
    let localX = 12,
      localY = height2 - 14;
    canvasRenderingContext2D.font = '13px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.textAlign = 'left';
    for (const [component, count] of length) {
      canvasRenderingContext2D.fillStyle = component;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(localX + 4, localY - 4, 4, 0, 6.283);
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.fillStyle = '#aaa';
      canvasRenderingContext2D.fillText(count, localX + 12, localY);
      localX += canvasRenderingContext2D.measureText(count).width + 30;
    }
    canvasRenderingContext2D.fillStyle = '#666';
    canvasRenderingContext2D.fillText('unvisited systems show grey', localX, localY);
  } else if (large) {
    // legend
    let localX = 12,
      localY = height2 - 14;
    canvasRenderingContext2D.font = '13px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.textAlign = 'left';
    for (const [_unusedId, factionDef] of Object.entries(FACTIONS)) {
      if (factionDef.hidden) continue;
      canvasRenderingContext2D.fillStyle = factionDef.color;
      canvasRenderingContext2D.fillRect(localX, localY - 8, 8, 8);
      canvasRenderingContext2D.fillStyle = '#aaa';
      canvasRenderingContext2D.fillText(factionDef.short, localX + 12, localY);
      localX += canvasRenderingContext2D.measureText(factionDef.short).width + 26;
    }
    canvasRenderingContext2D.strokeStyle = '#aaa';
    canvasRenderingContext2D.lineWidth = 1.5;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(localX + 4, localY - 4, 3.5, 0, 6.283);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.fillStyle = '#aaa';
    canvasRenderingContext2D.fillText('not yet visited', localX + 12, localY);
    localX = 12;
    localY -= 16;
    canvasRenderingContext2D.fillStyle = '#ffd65a';
    canvasRenderingContext2D.fillText('◇ mission target', localX, localY);
    localX += 100;
    canvasRenderingContext2D.fillStyle = '#ffd27a';
    canvasRenderingContext2D.fillText('◎ your station', localX, localY);
    localX += 92;
    canvasRenderingContext2D.fillStyle = '#a890d0';
    canvasRenderingContext2D.fillText('◆ station hull', localX, localY);
    localX += 90;
    if (
      !clientGameState.solo &&
      clientGameState.you &&
      clientGameState.you.armada &&
      clientGameState.you.armada.members
    ) {
      canvasRenderingContext2D.fillStyle = clientGameState.pal.ally;
      canvasRenderingContext2D.fillText('● Armada member', localX, localY);
      localX += 104;
    }
    canvasRenderingContext2D.fillStyle = '#ff5a40';
    canvasRenderingContext2D.fillText('◯ invasion', localX, localY);
    localX += 70; // no fleet claims in solo
    for (const spaceAnomaly of Object.values(ANOMALIES)) {
      canvasRenderingContext2D.fillStyle = spaceAnomaly.color;
      canvasRenderingContext2D.fillText(
        `${spaceAnomaly.icon} ${spaceAnomaly.name}`,
        localX,
        localY,
      );
      localX +=
        canvasRenderingContext2D.measureText(`${spaceAnomaly.icon} ${spaceAnomaly.name}`).width +
        14;
    }
  }
}
/**
 * Tests for system click selection hit at given screen coordinates on galaxy map or minimap.
 * @param clientGameState Game state
 * @param mouseX Screen X coordinate
 * @param mouseY Screen Y coordinate
 * @param mini Whether testing against companion minimap
 * @returns Hit solar system ID or null
 */
export function mapHit(
  clientGameState: ClientGameState,
  mouseX: number,
  mouseY: number,
  mini?: boolean,
): string | null {
  const mapTransform = mini ? clientGameState.miniXform : clientGameState.mapXform;
  if (!mapTransform) return null;
  let best = null,
    body = 14;
  const knowledge = captainMap(clientGameState);
  for (const starSystem of SYS_LIST) {
    if (!storySystemVisible(clientGameState.you?.story?.flags || {}, starSystem.id)) continue;
    if (knowledge && !knowledge.visible.has(starSystem.id) && starSystem.id !== clientGameState.sys)
      continue;
    const positionX = mapTransform.W / 2 + (starSystem.x - mapTransform.cx) * mapTransform.k,
      positionY = mapTransform.H / 2 + (starSystem.y - mapTransform.cy) * mapTransform.k,
      distance = Math.hypot(mouseX - positionX, mouseY - positionY);
    if (distance < body) {
      body = distance;
      best = starSystem.id;
    }
  }
  return best;
}
/**
 * Retrieves active salvage mission beacon world coordinates in current system.
 * @param clientGameState Game state
 * @returns Array of salvage point world coordinates [x, y]
 */
export function salvagePoints(clientGameState: ClientGameState): Array<[number, number]> {
  const result: [number, number][] = [];
  for (const mission of (clientGameState.you && clientGameState.you.missions) || [])
    if (
      mission.type === 'salvage' &&
      mission.sys === clientGameState.sys &&
      !mission.done &&
      mission.point
    )
      result.push(mission.point);
  return result;
}
/**
 * Retrieves unvisited planetary survey beacon coordinates for active missions in current system.
 * @param clientGameState Game state
 * @returns Array of survey point world coordinates [x, y]
 */
export function surveyPoints(clientGameState: ClientGameState): Array<[number, number]> {
  const result: [number, number][] = [];
  if (!clientGameState.you) return result;
  for (const mission of clientGameState.you.missions || [])
    if (mission.type === 'survey' && mission.sys === clientGameState.sys && !mission.done)
      mission.points!.forEach((position, index) => {
        if (!(mission.seen || []).includes(index)) result.push(position);
      });
  return result;
}
export { faction2 as FAC };

// World-bound visuals must not survive switching captains in the same document.
export function resetRenderSession() {
  visualEffects.length = 0;
  shieldHits.clear();
  shake = 0;
  tagRects = [];
  Object.assign(cameraState, { cx: 0, cy: 0, z: 1, W: 1, H: 1 });
}

/** Cache-owned legacy procedural pixels; active drawing references are never invalidated. */
export function proceduralResourceUsage() {
  const usage = (cache: ByteBudgetCache<HTMLCanvasElement>) => {
    cache.evict(performance.now());
    return { entries: cache.size, bytes: cache.bytes, budgetBytes: cache.budgetBytes };
  };
  return { rocks: usage(rockCache), bodies: usage(planetCache), glows: usage(glowColor) };
}
