import { bodyArtwork } from '../shared/body-artwork.ts';
import { planetType } from '../shared/planet-type.ts';
import { ByteBudgetCache, retainedBytes } from './render-cache-budget.ts';
export { planetType } from '../shared/planet-type.ts';
export interface PlanetDef {
  /** Explicit artwork for distant decorative worlds. */
  art?: string;
  /** World celestial identifier. */
  id: string;

  /** Display name of the world. */
  name?: string;

  /** Descriptive text lore for planet classification. */
  desc?: string;

  /** Body type (e.g., 'planet', 'moon', 'station'). */
  kind?: string;

  /** Hex color code. */
  color?: string;

  /** Celestial radius in world units. */
  r: number;
  svc?: string;
  tech?: number;
}
export interface PlanetSprite {
  /** Canvas or image buffer for rendering. */
  canvas: HTMLCanvasElement | HTMLImageElement;

  /** Canvas diameter dimension in pixels. */
  S: number;

  /** Projected planetary disk diameter in pixels. */
  D: number;

  /** Scaling factor converting canvas pixels to world units. */
  scale: number;
}
type ColorChannels = readonly number[];
type Biome =
  | 'earth'
  | 'lava'
  | 'gas'
  | 'crystal'
  | 'ice'
  | 'desert'
  | 'ocean'
  | 'terran'
  | 'toxic'
  | 'barren';
type GeneratorResult<ValueType> =
  ValueType extends Generator<unknown, infer ResultType, unknown> ? ResultType : never;
type ProceduralTexture = GeneratorResult<ReturnType<typeof buildTexture>>;
type ProceduralPlanet = GeneratorResult<ReturnType<typeof setup>>;
interface RenderedDefinition {
  id: string;
  type: string;
  hue: number;
  r: number;
  rings: boolean;
  lights?: boolean;
  tw: number;
  th: number;
  bk: number;
  ecol?: number[];
  atm?: number[];
  atmk?: number;
  cloud?: number[];
  gas?: boolean;
  night?: boolean;
}
interface RenderedTextureBase {
  R: RenderedDefinition;
  tex: HTMLImageElement;
  aux: HTMLImageElement;
  back: HTMLImageElement;
  front: HTMLImageElement | null;
  ready: boolean;
  used: number;
}
interface RenderedTexture extends RenderedTextureBase {
  tw: number;
  th: number;
  aw: number;
  ah: number;
  col: Uint8Array;
  wat: Uint8Array;
  emi: Uint8Array;
  cld: Uint8Array;
  ge: Float32Array;
  gn: Float32Array;
}
type RenderedPlanet = ReturnType<typeof setupRendered>;
// procedural planets. Each world gets a seamless surface texture built from 3D noise sampled on the sphere,
// chosen by type (from its description and colour), then is drawn as a lit sphere that slowly turns, with drifting
// clouds, night-side city lights or lava glow, an atmosphere rim and, for some giants, rings.
// planetSprite(p, now) -> { canvas, scale }: scale is world units per canvas pixel.

const textWidth = 512,
  textureHeight = 256;

// ---------------------------------------------------------------- noise
function hash3(gridX: number, gridY: number, gridZ: number, noiseSeed: number) {
  let height =
    Math.imul(gridX, 374761393) ^
    Math.imul(gridY, 668265263) ^
    Math.imul(gridZ, 1274126177) ^
    Math.imul(noiseSeed, 144665);
  height = Math.imul(height ^ (height >>> 13), 1274126177);
  height ^= height >>> 16;
  return (height & 0xffff) / 65535;
}
function vnoise(sampleX: number, sampleY: number, sampleZ: number, noiseSeed: number) {
  const xIndex = Math.floor(sampleX),
    yIndex = Math.floor(sampleY),
    zIndex = Math.floor(sampleZ),
    transform = sampleX - xIndex,
    fractionY = sampleY - yIndex,
    zoomFactor = sampleZ - zIndex;
  const fraction = transform * transform * (3 - 2 * transform),
    value = fractionY * fractionY * (3 - 2 * fractionY),
    width = zoomFactor * zoomFactor * (3 - 2 * zoomFactor);
  const component = (firstValue: number, secondValue: number, distance: number) =>
    hash3(xIndex + firstValue, yIndex + secondValue, zIndex + distance, noiseSeed);
  const positionX = component(0, 0, 0) + (component(1, 0, 0) - component(0, 0, 0)) * fraction,
    positionX10 = component(0, 1, 0) + (component(1, 1, 0) - component(0, 1, 0)) * fraction;
  const positionX01 = component(0, 0, 1) + (component(1, 0, 1) - component(0, 0, 1)) * fraction,
    positionX11 = component(0, 1, 1) + (component(1, 1, 1) - component(0, 1, 1)) * fraction;
  const startY = positionX + (positionX10 - positionX) * value,
    positionY = positionX01 + (positionX11 - positionX01) * value;
  return startY + (positionY - startY) * width;
}
function fractalBrownianMotion(
  sampleX: number,
  sampleY: number,
  sampleZ: number,
  noiseSeed: number,
  octaveCount = 5,
) {
  let amplitude = 0.5,
    frequency = 1,
    accumulatedNoise = 0,
    amplitudeSum = 0;
  for (let octaveIndex = 0; octaveIndex < octaveCount; octaveIndex++) {
    accumulatedNoise +=
      amplitude *
      vnoise(
        sampleX * frequency,
        sampleY * frequency,
        sampleZ * frequency,
        noiseSeed + octaveIndex * 31,
      );
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return accumulatedNoise / amplitudeSum;
}
const ridge = (
  positionX: number,
  positionY: number,
  positionZ: number,
  state: number,
  octave = 4,
) => {
  let firstValue = 0.5,
    factionId = 1,
    time = 0,
    count = 0;
  for (let options = 0; options < octave; options++) {
    time +=
      firstValue *
      (1 -
        Math.abs(
          vnoise(
            positionX * factionId,
            positionY * factionId,
            positionZ * factionId,
            state + options * 17,
          ) *
            2 -
            1,
        ));
    count += firstValue;
    firstValue *= 0.5;
    factionId *= 2.1;
  }
  return time / count;
};
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function hashStr(text: string) {
  let height = 2166136261;
  for (let index = 0; index < text.length; index++) {
    height ^= text.charCodeAt(index);
    height = Math.imul(height, 16777619);
  }
  return height >>> 0;
}
const clamp = (value: number, firstValue = 0, secondValue = 1) =>
  value < firstValue ? firstValue : value > secondValue ? secondValue : value;
const smooth = (firstValue: number, secondValue: number, value: number) => {
  const clamp2 = clamp((value - firstValue) / (secondValue - firstValue));
  return clamp2 * clamp2 * (3 - 2 * clamp2);
};
const interpolateValues = (
  colorChannels: ColorChannels,
  currentColorChannels: ColorChannels,
  time: number,
) => [
  colorChannels[0] + (currentColorChannels[0] - colorChannels[0]) * time,
  colorChannels[1] + (currentColorChannels[1] - colorChannels[1]) * time,
  colorChannels[2] + (currentColorChannels[2] - colorChannels[2]) * time,
];
const shade = (colorChannels: ColorChannels, entryKey: number) => [
  colorChannels[0] * entryKey,
  colorChannels[1] * entryKey,
  colorChannels[2] * entryKey,
];
const lift = (colorChannels: ColorChannels, entryKey: number) => [
  colorChannels[0] + (255 - colorChannels[0]) * entryKey,
  colorChannels[1] + (255 - colorChannels[1]) * entryKey,
  colorChannels[2] + (255 - colorChannels[2]) * entryKey,
];
function hexToRgb(hexColor?: string) {
  const parseInt2 = parseInt((hexColor || '#888').slice(1), 16);
  return [(parseInt2 >> 16) & 255, (parseInt2 >> 8) & 255, parseInt2 & 255];
}
function hueSaturationLightness(colorChannels: ColorChannels) {
  const radius = colorChannels[0] / 255,
    game = colorChannels[1] / 255,
    secondValue = colorChannels[2] / 255,
    mouseX = Math.max(radius, game, secondValue),
    minimum = Math.min(radius, game, secondValue),
    length = (mouseX + minimum) / 2,
    distance = mouseX - minimum;
  if (!distance) return [0, 0, length];
  const state = distance / (1 - Math.abs(2 * length - 1));
  let height =
    mouseX === radius
      ? ((game - secondValue) / distance) % 6
      : mouseX === game
        ? (secondValue - radius) / distance + 2
        : (radius - game) / distance + 4;
  return [(height * 60 + 360) % 360, state, length];
}

// ---------------------------------------------------------------- what kind of world is it?
/**
 * Classifies a stellar body into a procedural or visual planet category.
 * @param planetDef - Stellar object descriptor.
 * @returns Planet biome category (e.g. 'earth', 'lava', 'gas', 'ocean', 'terran', 'desert', 'ice', 'crystal', 'toxic', 'barren').
 */

// ---------------------------------------------------------------- surface textures
// returns { col: Uint8ClampedArray(TW*TH*3), emis: Uint8Array (night lights / glow), cloud: Uint8Array|null, atm: [r,g,b]|null, rings, spin }
function* buildTexture(planetDef: PlanetDef, type: Biome) {
  // a generator: yields every few rows so building never stalls a frame
  const seed = hashStr(planetDef.id) & 0xffff,
    randomGenerator = seeded(hashStr(planetDef.id) ^ 0x9e3779b9),
    base = hexToRgb(planetDef.color || '#888');
  const column = new Uint8ClampedArray(textWidth * textureHeight * 3),
    emission = new Uint8Array(textWidth * textureHeight);
  let cloud: Uint8Array | null = null;
  const inhabited =
    /L/.test(planetDef.svc || '') &&
    (planetDef.tech || 0) >= 2 &&
    type !== 'gas' &&
    type !== 'lava';
  const craters: number[][] = [];
  if (type === 'barren' || type === 'desert' || type === 'ice')
    for (let index = 0; index < (type === 'barren' ? 46 : 14); index++) {
      const positionZ = randomGenerator() * 2 - 1,
        firstValue = randomGenerator() * 6.283,
        sqrt2 = Math.sqrt(1 - positionZ * positionZ);
      craters.push([
        sqrt2 * Math.cos(firstValue),
        sqrt2 * Math.sin(firstValue),
        positionZ,
        0.03 + Math.pow(randomGenerator(), 2.5) * (type === 'barren' ? 0.28 : 0.14),
      ]);
    }
  const storms: number[][] = [];
  if (type === 'gas')
    for (let index = 0; index < 1 + ((randomGenerator() * 3) | 0); index++)
      storms.push([
        randomGenerator() * 6.283,
        (randomGenerator() - 0.5) * 1.6,
        0.12 + randomGenerator() * 0.22,
        randomGenerator(),
      ]);
  const seaLevel = type === 'earth' ? 0.53 : type === 'ocean' ? 0.6 : 0.47;
  // palettes, built around the planet's own colour
  const position = {
    deep:
      type === 'earth' ? [14, 38, 92] : shade(interpolateValues(base, [20, 60, 140], 0.5), 0.45),
    shallow: type === 'earth' ? [40, 110, 170] : interpolateValues(base, [60, 150, 200], 0.35),
    low:
      type === 'earth'
        ? [70, 120, 50]
        : type === 'terran'
          ? interpolateValues(base, [60, 130, 50], 0.5)
          : interpolateValues([180, 160, 110], base, 0.3),
    high: type === 'earth' ? [130, 110, 75] : interpolateValues(base, [120, 100, 80], 0.6),
    peak: [235, 235, 240],
  };
  const lift2 = lift(base, 0.25),
    shade2 = shade(base, 0.55),
    game = interpolateValues(base, [240, 220, 190], 0.5),
    game4 = interpolateValues(base, [120, 60, 40], 0.4); // gas bands
  const spinLon = randomGenerator() * 6.283,
    bands = 5 + randomGenerator() * 9;
  for (let innerIndex = 0; innerIndex < textureHeight; innerIndex++) {
    const lateralOffset = (0.5 - (innerIndex + 0.5) / textureHeight) * Math.PI,
      className = Math.cos(lateralOffset),
      slot = Math.sin(lateralOffset);
    for (let index = 0; index < textWidth; index++) {
      const longitude = (index / textWidth) * Math.PI * 2,
        positionX = className * Math.cos(longitude),
        positionY = className * Math.sin(longitude),
        slot2 = slot,
        entryKey = innerIndex * textWidth + index;
      let component,
        event = 0;
      if (type === 'gas') {
        const warp =
            fractalBrownianMotion(positionX * 2.2, positionY * 2.2, slot2 * 2.2, seed, 4) - 0.5,
          value = (slot2 + warp * 0.35) * bands,
          time =
            0.5 +
            0.5 *
              Math.sin(
                value * Math.PI +
                  fractalBrownianMotion(positionX * 6, positionY * 6, slot2 * 6, seed + 9, 3) * 2.5,
              );
        component = interpolateValues(
          interpolateValues(shade2, lift2, time),
          time > 0.55 ? game : game4,
          0.35 * Math.abs(Math.sin(value * 0.7)),
        );
        component = shade(
          component,
          0.85 +
            0.3 * fractalBrownianMotion(positionX * 14, positionY * 3, slot2 * 14, seed + 4, 3),
        );
        for (const [slot, size, surfaceRadius, state] of storms) {
          // oval storms
          let deltaLength = longitude - slot;
          deltaLength = Math.atan2(Math.sin(deltaLength), Math.cos(deltaLength));
          const distanceSquared = Math.hypot(
            deltaLength / (surfaceRadius * 1.8),
            (lateralOffset - size) / surfaceRadius,
          );
          if (distanceSquared < 1) {
            const screenWidth =
              0.5 +
              0.5 *
                Math.sin(distanceSquared * 9 - Math.atan2(lateralOffset - size, deltaLength) * 2);
            component = interpolateValues(
              component,
              interpolateValues(
                state > 0.5 ? [230, 140, 90] : lift(base, 0.5),
                shade(base, 0.5),
                screenWidth * 0.5,
              ),
              smooth(1, 0.6, distanceSquared),
            );
          }
        }
      } else {
        const height = fractalBrownianMotion(
            positionX * 1.6,
            positionY * 1.6,
            slot2 * 1.6,
            seed,
            6,
          ),
          deltaTime = fractalBrownianMotion(positionX * 9, positionY * 9, slot2 * 9, seed + 77, 3);
        if (type === 'earth' || type === 'ocean' || type === 'terran') {
          if (height < seaLevel + 0.012) {
            component = interpolateValues(
              position.deep,
              position.shallow,
              smooth(seaLevel - 0.16, seaLevel, height),
            );
            if (height > seaLevel)
              component = interpolateValues(
                component,
                [196, 182, 130],
                (height - seaLevel) / 0.012,
              );
          } else {
            const time = (height - seaLevel) / (1 - seaLevel);
            component =
              time < 0.12
                ? interpolateValues([196, 182, 130], position.low, time / 0.12)
                : time < 0.5
                  ? interpolateValues(position.low, position.high, (time - 0.12) / 0.38)
                  : interpolateValues(position.high, position.peak, smooth(0.62, 0.9, time));
            component = shade(component, 0.82 + 0.36 * deltaTime);
            if (inhabited && deltaTime > 0.58 && time < 0.45)
              event =
                clamp((deltaTime - 0.58) * 6) *
                255 *
                (0.4 + 0.6 * vnoise(positionX * 60, positionY * 60, slot2 * 60, seed + 5));
          }
          const capacity = Math.abs(lateralOffset) + (height - 0.5) * 0.5;
          if (capacity > 1.22)
            component = interpolateValues(component, [236, 242, 250], smooth(1.22, 1.32, capacity));
        } else if (type === 'desert') {
          const dune =
            0.5 +
            0.5 *
              Math.sin(
                longitude * 22 +
                  lateralOffset * 9 +
                  fractalBrownianMotion(positionX * 4, positionY * 4, slot2 * 4, seed + 3, 3) * 9,
              );
          component = interpolateValues(
            shade(base, 0.6),
            lift(base, 0.25),
            height * 0.8 + dune * 0.25,
          );
          component = shade(component, 0.85 + 0.3 * deltaTime);
          if (inhabited && deltaTime > 0.66) event = clamp((deltaTime - 0.66) * 7) * 200;
        } else if (type === 'ice') {
          const ridge2 = ridge(positionX * 4, positionY * 4, slot2 * 4, seed + 11, 3),
            ridge3 = ridge(positionX * 11, positionY * 11, slot2 * 11, seed + 12, 2);
          component = interpolateValues(
            interpolateValues(
              lift(interpolateValues(base, [170, 205, 240], 0.6), 0.2),
              [240, 247, 255],
              height,
            ),
            shade(interpolateValues(base, [190, 215, 240], 0.7), 0.9),
            0.35 * deltaTime,
          );
          const crack = Math.max(smooth(0.9, 0.97, ridge2), 0.6 * smooth(0.93, 0.99, ridge3));
          if (crack > 0)
            component = interpolateValues(
              component,
              interpolateValues(base, [90, 140, 190], 0.6),
              crack * 0.75,
            );
        } else if (type === 'lava') {
          const ridge4 = ridge(positionX * 2.6, positionY * 2.6, slot2 * 2.6, seed + 13, 5);
          component = shade(interpolateValues(base, [50, 40, 38], 0.75), 0.5 + 0.6 * height);
          const smooth2 = smooth(0.82, 0.95, ridge4);
          if (smooth2 > 0) {
            component = interpolateValues(component, [255, 120 + 100 * smooth2, 30], smooth2);
            event = smooth2 * 255;
          }
        } else if (type === 'toxic') {
          component = interpolateValues(
            shade(interpolateValues(base, [150, 170, 40], 0.4), 0.55),
            lift(interpolateValues(base, [200, 210, 80], 0.3), 0.15),
            height,
          );
          component = shade(component, 0.8 + 0.4 * deltaTime);
        } else if (type === 'crystal') {
          const vnoise2 = vnoise(positionX * 26, positionY * 26, slot2 * 26, seed + 21),
            ridge5 = ridge(positionX * 5, positionY * 5, slot2 * 5, seed + 23, 3);
          component = interpolateValues(
            interpolateValues(lift(base, 0.35), [230, 235, 255], 0.3),
            shade(base, 0.6),
            height,
          );
          if (ridge5 > 0.8) component = lift(component, 0.4 * smooth(0.8, 0.95, ridge5));
          if (vnoise2 > 0.9) event = (vnoise2 - 0.9) * 2550;
        } else {
          // barren
          component = interpolateValues(
            shade(interpolateValues(base, [128, 124, 120], 0.6), 0.5),
            lift(interpolateValues(base, [150, 146, 140], 0.6), 0.2),
            height,
          );
          component = shade(component, 0.8 + 0.4 * deltaTime);
        }
        for (const [centerX, centerY, cloudDepth, credits] of craters) {
          // impact craters: dark floor, bright rim
          const distanceSquared =
            Math.acos(
              clamp(positionX * centerX + positionY * centerY + slot2 * cloudDepth, -1, 1),
            ) / credits;
          if (distanceSquared < 1.15) {
            component =
              distanceSquared < 0.85
                ? shade(component, 0.72 + 0.2 * distanceSquared)
                : lift(component, 0.25 * smooth(1.15, 0.9, distanceSquared));
          }
        }
      }
      column[entryKey * 3] = component[0];
      column[entryKey * 3 + 1] = component[1];
      column[entryKey * 3 + 2] = component[2];
      emission[entryKey] = event;
    }
    if (innerIndex % 3 === 2) yield;
  }
  if (
    type === 'earth' ||
    type === 'ocean' ||
    type === 'terran' ||
    type === 'toxic' ||
    (type === 'gas' && randomGenerator() < 0.3)
  ) {
    cloud = new Uint8Array(textWidth * textureHeight);
    const density = type === 'toxic' ? 0.42 : type === 'gas' ? 0.6 : 0.5;
    for (let innerIndex = 0; innerIndex < textureHeight; innerIndex++) {
      const lateralOffset = (0.5 - (innerIndex + 0.5) / textureHeight) * Math.PI,
        className = Math.cos(lateralOffset),
        slot = Math.sin(lateralOffset);
      for (let index = 0; index < textWidth; index++) {
        const longitude = (index / textWidth) * Math.PI * 2,
          positionX = className * Math.cos(longitude),
          positionY = className * Math.sin(longitude),
          slot32 = slot;
        const width = fractalBrownianMotion(
            positionX * 2,
            positionY * 2,
            slot32 * 2,
            seed + 101,
            3,
          ),
          count = fractalBrownianMotion(
            positionX * 3.5 + width * 2.2,
            positionY * 3.5 + width * 2.2,
            slot32 * 6,
            seed + 202,
            5,
          );
        cloud[innerIndex * textWidth + index] = clamp((count - density) * 3.2) * 235;
      }
      if (innerIndex % 4 === 3) yield;
    }
  }
  const atmosphere =
    {
      earth: [110, 170, 255],
      ocean: lift(interpolateValues(base, [90, 160, 255], 0.5), 0.2),
      terran: [140, 200, 255],
      toxic: [190, 210, 90],
      gas: lift(base, 0.3),
      desert: lift(interpolateValues(base, [255, 200, 150], 0.4), 0.2),
      lava: [255, 120, 60],
      ice: [190, 220, 255],
      crystal: lift(base, 0.5),
    }[type as Exclude<Biome, 'barren'>] || null;
  const rings =
    type === 'gas' &&
    (randomGenerator() < 0.55 || /ring/.test((planetDef.desc || '').toLowerCase()))
      ? {
          tilt: 0.18 + randomGenerator() * 0.2,
          rot: (randomGenerator() - 0.5) * 0.5,
          inner: 1.3 + randomGenerator() * 0.15,
          outer: 1.9 + randomGenerator() * 0.4,
          col: interpolateValues(lift(base, 0.35), [220, 205, 170], 0.5),
          seed,
        }
      : null;
  const period = type === 'gas' ? 140 + randomGenerator() * 80 : 200 + randomGenerator() * 220; // seconds per turn
  return {
    col: column,
    emis: emission,
    cloud,
    atm: atmosphere,
    rings,
    spin: textWidth / period,
    cspin: (textWidth / period) * (0.6 + randomGenerator() * 0.8),
    tilt: (randomGenerator() - 0.5) * 0.5,
    spinLon,
  };
}

// ---------------------------------------------------------------- the sphere
const length2 = (() => {
  const value = [-0.55, -0.48, 0.68],
    count = Math.hypot(...value);
  return value.map((positionX) => positionX / count);
})(); // light from the upper left
// Per-world render caches are bounded by retained bytes. The budgets hold roughly three of the
// busiest systems' worlds; docs/PERFORMANCE.md records the measurements behind them. A world
// drawn within LIVE_PLANET_MS is never evicted, so visible worlds stay valid over budget.
const PROCEDURAL_BUDGET_BYTES = 32 * 1024 * 1024,
  RENDERED_BUDGET_BYTES = 48 * 1024 * 1024,
  LIVE_PLANET_MS = 2000;
const cache = new ByteBudgetCache<ProceduralPlanet>(PROCEDURAL_BUDGET_BYTES, LIVE_PLANET_MS),
  building = new Map<string, { type: Biome; gen: Generator<void, ProceduralPlanet, unknown> }>();
let workTime = 0,
  workMs = 0;
function* setup(planetDef: PlanetDef, time: ProceduralTexture, type: Biome) {
  const distance = Math.max(64, Math.min(320, Math.round(planetDef.r * 2))),
    radius = distance / 2,
    padding = time.rings ? Math.ceil(radius * (time.rings.outer + 0.15)) : Math.ceil(radius * 1.22);
  const state = padding * 2,
    count = distance * distance,
    lightUnit = new Int16Array(count),
    level = new Int16Array(count),
    lightScale = new Float32Array(count),
    lightAngle = new Uint8Array(count),
    lineFeed = new Float32Array(count),
    lineNumber = new Float32Array(count);
  const count2 = Math.cos(time.tilt),
    state2 = Math.sin(time.tilt);
  for (let pixelY = 0; pixelY < distance; pixelY++) {
    if (pixelY % 12 === 11) yield;
    for (let pixelX = 0; pixelX < distance; pixelX++) {
      const entryKey = pixelY * distance + pixelX,
        positionX = (pixelX + 0.5 - radius) / radius,
        positionY = (pixelY + 0.5 - radius) / radius,
        radiusRatio = positionX * positionX + positionY * positionY;
      if (radiusRatio >= 1.0) {
        lightAngle[entryKey] = 0;
        continue;
      }
      const sqrt2 = Math.sqrt(1 - radiusRatio),
        lighting = positionX * length2[0] + positionY * length2[1] + sqrt2 * length2[2];
      const xRatio = positionX * count2 - positionY * state2,
        yRatio = positionX * state2 + positionY * count2; // axial tilt
      const asin2 = Math.asin(clamp(-yRatio, -1, 1)),
        atan = Math.atan2(xRatio, sqrt2);
      lightUnit[entryKey] = Math.floor((atan / (Math.PI * 2) + 1) * textWidth) % textWidth;
      level[entryKey] = Math.min(
        textureHeight - 1,
        Math.floor((0.5 - asin2 / Math.PI) * textureHeight),
      );
      lightScale[entryKey] = lighting;
      lineFeed[entryKey] = Math.pow(1 - sqrt2, 2.2);
      lineNumber[entryKey] = smooth(0.12, -0.18, lighting); // fresnel rim, night mask
      lightAngle[entryKey] = Math.round(clamp((1 - Math.sqrt(radiusRatio)) * radius * 1.4) * 255);
    }
  }
  yield;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = state;
  const disk = document.createElement('canvas');
  disk.width = disk.height = distance;
  const canvasRenderingContext2D = disk.getContext('2d')!,
    imageData = canvasRenderingContext2D.createImageData(distance, distance);
  // static layers: atmosphere halo and rings (back and front halves)
  const halo = document.createElement('canvas');
  halo.width = halo.height = state;
  if (time.atm) {
    const canvasRenderingContext2D = halo.getContext('2d')!,
      canvasGradient = canvasRenderingContext2D.createRadialGradient(
        state / 2,
        state / 2,
        radius * 0.92,
        state / 2,
        state / 2,
        radius * 1.2,
      ),
      firstValue = time.atm;
    canvasGradient.addColorStop(
      0,
      `rgba(${firstValue[0] | 0},${firstValue[1] | 0},${firstValue[2] | 0},0.55)`,
    );
    canvasGradient.addColorStop(
      0.35,
      `rgba(${firstValue[0] | 0},${firstValue[1] | 0},${firstValue[2] | 0},0.18)`,
    );
    canvasGradient.addColorStop(1, 'rgba(0,0,0,0)');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(state / 2, state / 2, radius * 1.22, 0, 6.283);
    canvasRenderingContext2D.fill();
  }
  yield;
  let ringBack: HTMLCanvasElement | null = null,
    ringFront: HTMLCanvasElement | null = null;
  if (time.rings) {
    const rings2 = time.rings,
      makeElement = (front: boolean) => {
        const htmlCanvasElement = document.createElement('canvas');
        htmlCanvasElement.width = htmlCanvasElement.height = state;
        const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!;
        canvasRenderingContext2D.translate(state / 2, state / 2);
        canvasRenderingContext2D.rotate(rings2.rot);
        canvasRenderingContext2D.beginPath();
        front
          ? canvasRenderingContext2D.rect(-state, 0, state * 2, state)
          : canvasRenderingContext2D.rect(-state, -state, state * 2, state);
        canvasRenderingContext2D.clip();
        canvasRenderingContext2D.scale(1, rings2.tilt);
        const randomGenerator = seeded(rings2.seed + 7);
        for (let inner2 = rings2.inner; inner2 < rings2.outer; inner2 += 0.012) {
          const band = randomGenerator();
          if (band < 0.12) continue;
          canvasRenderingContext2D.beginPath();
          canvasRenderingContext2D.arc(0, 0, radius * inner2, 0, 6.283);
          canvasRenderingContext2D.lineWidth = ((radius * 0.014) / rings2.tilt) * rings2.tilt + 1.2;
          canvasRenderingContext2D.strokeStyle = `rgba(${rings2.col[0] | 0},${rings2.col[1] | 0},${rings2.col[2] | 0},${(0.18 + band * 0.5) * (1 - Math.abs((inner2 - rings2.inner) / (rings2.outer - rings2.inner) - 0.45))})`;
          canvasRenderingContext2D.stroke();
        }
        return htmlCanvasElement;
      };
    yield;
    ringBack = makeElement(false);
    yield;
    ringFront = makeElement(true);
  }
  const position = {
    type,
    T: time,
    D: distance,
    R: radius,
    S: state,
    lu: lightUnit,
    lv: level,
    ls: lightScale,
    la: lightAngle,
    lf: lineFeed,
    ln: lineNumber,
    canvas,
    ctx: canvas.getContext('2d')!,
    disk,
    dctx: canvasRenderingContext2D,
    img: imageData,
    halo,
    ringBack,
    ringFront,
    scale: planetDef.r / radius,
    lastU: -1,
    lastC: -1,
    fresh: true,
  };
  cache.set(planetDef.id, position, retainedBytes(position, time), performance.now());
  return position;
}
// spend at most ~8 ms a frame (across all planets) building textures; until then the caller draws its old placeholder
function advance(planetDef: PlanetDef, currentTime: number) {
  let secondValue = building.get(planetDef.id);
  if (!secondValue) {
    const type = planetType(planetDef);
    secondValue = {
      type,
      gen: (function* () {
        const time = yield* buildTexture(planetDef, type);
        return yield* setup(planetDef, time, type);
      })(),
    };
    building.set(planetDef.id, secondValue);
  }
  if (currentTime !== workTime) {
    workTime = currentTime;
    workMs = 0;
  }
  const time0 = performance.now();
  while (workMs + (performance.now() - time0) < 8) {
    const next2 = secondValue.gen.next();
    if (next2.done) {
      building.delete(planetDef.id);
      workMs += performance.now() - time0;
      return next2.value;
    }
  }
  workMs += performance.now() - time0;
  return null;
}
function renderDisk(position: ProceduralPlanet, radiusUnit: number, resultCode: number) {
  const {
      D: distance,
      lu: lightUnit,
      lv: level,
      ls: lightScale,
      la: lightAngle,
      lf: lineFeed,
      ln: lineNumber,
      T: time,
      img: imageData,
    } = position,
    imageDataArray = imageData.data,
    column = time.col,
    emis2 = time.emis,
    cloud2 = time.cloud,
    atmosphere = time.atm || [0, 0, 0],
    count = distance * distance;
  for (let entryKey = 0; entryKey < count; entryKey++) {
    const lightAngle2 = lightAngle[entryKey];
    const options = entryKey * 4;
    if (!lightAngle2) {
      imageDataArray[options + 3] = 0;
      continue;
    }
    const value = level[entryKey] * textWidth,
      targetIndex = value + ((lightUnit[entryKey] + radiusUnit) % textWidth),
      lightScale2 = lightScale[entryKey],
      dayIndex =
        lightScale2 > 0 ? 0.08 + 0.92 * Math.pow(lightScale2, 0.85) : 0.08 * (1 + lightScale2),
      lineFeed2 = lineFeed[entryKey];
    let radius = column[targetIndex * 3] * dayIndex,
      game = column[targetIndex * 3 + 1] * dayIndex,
      secondValue = column[targetIndex * 3 + 2] * dayIndex;
    const emis = emis2[targetIndex];
    if (emis) {
      const night =
        position.type === 'lava' || position.type === 'crystal'
          ? 0.45 + 0.55 * lineNumber[entryKey]
          : lineNumber[entryKey];
      const entityKey = (emis / 255) * night;
      radius += 255 * entityKey;
      game += (position.type === 'lava' ? 140 : 205) * entityKey;
      secondValue +=
        (position.type === 'lava' ? 40 : position.type === 'crystal' ? 255 : 120) * entityKey;
    }
    if (cloud2) {
      const cosAngle = cloud2[value + ((lightUnit[entryKey] + resultCode) % textWidth)] / 255;
      if (cosAngle) {
        const cooldown = 0.1 + 0.95 * Math.max(0, lightScale2);
        radius = radius * (1 - cosAngle) + 245 * cooldown * cosAngle;
        game = game * (1 - cosAngle) + 247 * cooldown * cosAngle;
        secondValue = secondValue * (1 - cosAngle) + 252 * cooldown * cosAngle;
      }
    }
    if (time.atm) {
      const rimLighting = lineFeed2 * (0.35 + Math.max(0, lightScale2) * 0.9);
      radius += atmosphere[0] * rimLighting;
      game += atmosphere[1] * rimLighting;
      secondValue += atmosphere[2] * rimLighting;
    }
    imageDataArray[options] = radius;
    imageDataArray[options + 1] = game;
    imageDataArray[options + 2] = secondValue;
    imageDataArray[options + 3] = lightAngle2;
  }
  position.dctx.putImageData(imageData, 0, 0);
  const canvasRenderingContext2D = position.ctx,
    state = position.S;
  canvasRenderingContext2D.clearRect(0, 0, state, state);
  canvasRenderingContext2D.drawImage(position.halo, 0, 0);
  if (position.ringBack) canvasRenderingContext2D.drawImage(position.ringBack, 0, 0);
  canvasRenderingContext2D.drawImage(position.disk, (state - distance) / 2, (state - distance) / 2);
  if (position.ringFront) canvasRenderingContext2D.drawImage(position.ringFront, 0, 0);
}
let budget = 0,
  budgetT = 0;
// pre-rendered planets (tools/rift_planets.py) in a pre-rendered space-art style. Each world picks the rendered planet of its type
// whose colour is closest to its own; the procedural sphere above stays as the fallback while images load.
let renderManifest: Record<string, Omit<RenderedDefinition, 'id'>> | null = null;
const images = new Map<string, HTMLImageElement>(),
  pick = new Map<string, RenderedDefinition | null>();
const irregularSprites = new Map<string, PlanetSprite>();
// A transient failed response must not permanently strand the renderer in its fallback.
// Retry only twice, with a cache-busting URL, then leave the procedural world usable.
const ASSET_RETRY_DELAYS = [1000, 4000];
const ASSET_TIMEOUT = 8000;
async function loadManifest(attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSET_TIMEOUT);
  try {
    const source = 'assets/planets/planets.json' + (attempt ? `?retry=${attempt}` : '');
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error('Planet manifest unavailable');
    const manifest = await response.json();
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
      throw new Error('Invalid planet manifest');
    renderManifest = manifest;
    pick.clear();
  } catch {
    if (attempt < ASSET_RETRY_DELAYS.length)
      setTimeout(() => loadManifest(attempt + 1), ASSET_RETRY_DELAYS[attempt]);
  } finally {
    clearTimeout(timeout);
  }
}
void loadManifest();
const TYPE_POOL: Record<string, string[]> = {
  earth: ['earth'],
  terran: ['terran', 'jungle'],
  ocean: ['ocean'],
  desert: ['desert'],
  ice: ['ice'],
  lava: ['lava'],
  barren: ['barren', 'sulfur'],
  gas: ['gas'],
  toxic: ['toxic'],
  crystal: ['crystal'],
};
function chooseRendered(planetDef: PlanetDef) {
  if (pick.has(planetDef.id)) return pick.get(planetDef.id);
  if (!renderManifest) return null;
  const art = planetDef.art || bodyArtwork(planetDef.id)?.art;
  if (art && renderManifest[art]) {
    const definition = { id: art, ...renderManifest[art] };
    pick.set(planetDef.id, definition);
    return definition;
  }
  let type: string = planetType(planetDef);
  const toLowerCase2 = ((planetDef.desc || '') + ' ' + (planetDef.name || '')).toLowerCase();
  if (
    type === 'terran' &&
    /(city|capital|sprawl|metropol|ecumen|arcolog)/.test(toLowerCase2) &&
    (planetDef.tech || 0) >= 3
  )
    type = 'city';
  const pool = Object.entries(renderManifest).filter(
    ([, message]) =>
      (type === 'city'
        ? message.type === 'city'
        : (TYPE_POOL[type] || [type]).includes(message.type)) &&
      (planetDef.kind !== 'moon' || !message.rings),
  );
  if (!pool.length) {
    pick.set(planetDef.id, null);
    return null;
  }
  const colorHue = hueSaturationLightness(hexToRgb(planetDef.color))[0],
    heading = (firstValue: number) =>
      Math.min(Math.abs(firstValue - colorHue), 360 - Math.abs(firstValue - colorHue));
  pool.sort((firstValue, secondValue) => heading(firstValue[1].hue) - heading(secondValue[1].hue));
  const hashStr2 = hashStr(planetDef.id),
    slice2 = pool.slice(0, Math.min(pool.length, planetDef.id.startsWith('bg:') ? 4 : 2));
  const want =
    /ring/.test(toLowerCase2) && type === 'gas'
      ? slice2.find(([, message]) => message.rings) || slice2[hashStr2 % slice2.length]
      : slice2[hashStr2 % slice2.length];
  const options = { id: want[0], ...want[1] };
  pick.set(planetDef.id, options);
  return options;
}
// the rendered planets turn. tools/rift_planets.py bakes each world into surface maps (albedo; height, water,
// emissive and cloud), and they are lit here every time the surface turns a texel: bump relief, the soft terminator,
// ocean glint, cloud shadows, night lights and the atmosphere rim, as in the static renders. The halo and the rings are
// fixed layers rendered with the planet (_back and _front).
const textureCache = new Map<string, RenderedTextureBase>(),
  RCACHE = new ByteBudgetCache<RenderedPlanet>(RENDERED_BUDGET_BYTES, LIVE_PLANET_MS);
function loadImg(source: string) {
  const htmlImageElement = new Image();
  let attempt = 0;
  const load = () => {
    let settled = false;
    const timeout = setTimeout(failed, ASSET_TIMEOUT);
    function failed() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      htmlImageElement.onload = htmlImageElement.onerror = null;
      if (attempt < ASSET_RETRY_DELAYS.length) {
        const delay = ASSET_RETRY_DELAYS[attempt++];
        setTimeout(load, delay);
      }
    }
    htmlImageElement.onload = () => {
      if (!htmlImageElement.naturalWidth) return failed();
      settled = true;
      clearTimeout(timeout);
      htmlImageElement.onload = htmlImageElement.onerror = null;
    };
    htmlImageElement.onerror = failed;
    // Also recovers HTTP 200 LFS-pointer responses: those fail image decoding.
    htmlImageElement.src = source + (attempt ? `?retry=${attempt}` : '');
  };
  load();
  return htmlImageElement;
}
function texFor(renderedDefinition: RenderedDefinition): RenderedTexture | null {
  let renderedTextureBase = textureCache.get(renderedDefinition.id);
  if (!renderedTextureBase) {
    renderedTextureBase = {
      R: renderedDefinition,
      tex: loadImg(`assets/planets/${renderedDefinition.id}_tex.webp`),
      aux: loadImg(`assets/planets/${renderedDefinition.id}_aux.webp`),
      back: loadImg(`assets/planets/${renderedDefinition.id}_back.webp`),
      front: renderedDefinition.rings
        ? loadImg(`assets/planets/${renderedDefinition.id}_front.webp`)
        : null,
      ready: false,
      used: 0,
    };
    textureCache.set(renderedDefinition.id, renderedTextureBase);
  }
  renderedTextureBase.used = performance.now();
  if (!renderedTextureBase.ready) {
    const isValid = (htmlImageElement: HTMLImageElement | null) =>
      htmlImageElement && htmlImageElement.complete && htmlImageElement.naturalWidth;
    if (
      !isValid(renderedTextureBase.tex) ||
      !isValid(renderedTextureBase.aux) ||
      !isValid(renderedTextureBase.back) ||
      (renderedTextureBase.front && !isValid(renderedTextureBase.front))
    )
      return null;
    const grab = (htmlImageElement: HTMLImageElement) => {
      const htmlCanvasElement = document.createElement('canvas');
      htmlCanvasElement.width = htmlImageElement.naturalWidth;
      htmlCanvasElement.height = htmlImageElement.naturalHeight;
      const canvasRenderingContext2D = htmlCanvasElement.getContext('2d', {
        willReadFrequently: true,
      })!;
      canvasRenderingContext2D.drawImage(htmlImageElement, 0, 0);
      return canvasRenderingContext2D.getImageData(
        0,
        0,
        htmlCanvasElement.width,
        htmlCanvasElement.height,
      ).data;
    };
    const naturalWidth2 = renderedTextureBase.tex.naturalWidth,
      naturalHeight2 = renderedTextureBase.tex.naturalHeight,
      naturalWidth3 = renderedTextureBase.aux.naturalWidth,
      availableHeight = renderedTextureBase.aux.naturalHeight / 4,
      imageDataArray = grab(renderedTextureBase.tex),
      imageDataArray2 = grab(renderedTextureBase.aux),
      normalAngle0 = naturalWidth3 * availableHeight;
    const atlasData = new Uint8Array(normalAngle0 * 4);
    for (let component = 0; component < 4; component++)
      for (let index = 0; index < normalAngle0; index++)
        atlasData[index * 4 + component] = imageDataArray2[(component * normalAngle0 + index) * 4]; // the four grey maps, interleaved
    const column = new Uint8Array(naturalWidth2 * naturalHeight2 * 3);
    for (let index = 0, count = naturalWidth2 * naturalHeight2; index < count; index++) {
      column[index * 3] = imageDataArray[index * 4];
      column[index * 3 + 1] = imageDataArray[index * 4 + 1];
      column[index * 3 + 2] = imageDataArray[index * 4 + 2];
    }
    const normalAngle = naturalWidth3 * availableHeight,
      water = new Uint8Array(normalAngle),
      emissive = new Uint8Array(normalAngle),
      cloud = new Uint8Array(normalAngle),
      gameEntity = new Float32Array(normalAngle),
      generator = new Float32Array(normalAngle),
      rough = renderedDefinition.type === 'barren' || renderedDefinition.type === 'sulfur',
      background = (renderedDefinition.bk || 0) * (rough ? 0.5 : 0.8),
      maximumGreen = rough ? 0.7 : 0.9;
    for (let innerIndex = 0; innerIndex < availableHeight; innerIndex++) {
      const lateralOffset = (0.5 - (innerIndex + 0.5) / availableHeight) * Math.PI,
        className = Math.max(0.15, Math.cos(lateralOffset));
      for (let index = 0; index < naturalWidth3; index++) {
        const entryKey = innerIndex * naturalWidth3 + index,
          height = (positionX: number, positionY: number) =>
            atlasData[
              (((positionY + availableHeight) % availableHeight) * naturalWidth3 +
                ((positionX + naturalWidth3) % naturalWidth3)) *
                4
            ] / 255;
        water[entryKey] = atlasData[entryKey * 4 + 1];
        emissive[entryKey] = atlasData[entryKey * 4 + 2];
        cloud[entryKey] = atlasData[entryKey * 4 + 3];
        if (background) {
          gameEntity[entryKey] = clamp(
            (((height(index + 2, innerIndex) - height(index - 2, innerIndex)) * naturalWidth3) /
              (8 * Math.PI) /
              className) *
              background,
            -maximumGreen,
            maximumGreen,
          );
          generator[entryKey] = clamp(
            ((-(
              height(index, Math.min(availableHeight - 1, innerIndex + 2)) -
              height(index, Math.max(0, innerIndex - 2))
            ) *
              availableHeight) /
              (4 * Math.PI)) *
              background,
            -maximumGreen,
            maximumGreen,
          );
        }
      }
    }
    Object.assign(renderedTextureBase, {
      tw: naturalWidth2,
      th: naturalHeight2,
      aw: naturalWidth3,
      ah: availableHeight,
      col: column,
      wat: water,
      emi: emissive,
      cld: cloud,
      ge: gameEntity,
      gn: generator,
      ready: true,
    });
    if (textureCache.size > 18) {
      let previousValue: { k: string; used: number } | null = null;
      for (const [entryKey, renderedTextureBase2] of textureCache)
        if (
          renderedTextureBase2 !== renderedTextureBase &&
          (!previousValue || renderedTextureBase2.used < previousValue.used)
        )
          previousValue = renderedTextureBase2 && { k: entryKey, used: renderedTextureBase2.used };
      if (previousValue) {
        textureCache.delete(previousValue.k);
        for (const [playerKey, position] of RCACHE)
          if (position.T.R.id === previousValue.k) RCACHE.delete(playerKey);
      }
    }
  }
  return renderedTextureBase as RenderedTexture;
}
function setupRendered(planetDef: PlanetDef, renderedTexture: RenderedTexture) {
  const renderedDefinition = renderedTexture.R,
    randomGenerator = seeded(hashStr(planetDef.id) ^ 0x51ed),
    distance = Math.max(
      64,
      Math.min(planetDef.id.startsWith('bg:') ? 200 : 320, Math.round(planetDef.r * 2)),
    ),
    radiusRatio = distance / 2,
    state = Math.ceil(distance / renderedDefinition.r);
  const tilt = renderedDefinition.rings ? 0 : (randomGenerator() - 0.5) * 0.5,
    count = Math.cos(tilt),
    state2 = Math.sin(tilt),
    count2 = distance * distance;
  const lightUnit = new Float32Array(count2),
    level = new Float32Array(count2),
    lightScale = new Float32Array(count2),
    leaderEntity = new Float32Array(count2),
    lightNormals = new Float32Array(count2),
    space = new Float32Array(count2),
    rimLighting = new Float32Array(count2),
    lightDepth = new Float32Array(count2),
    lightAngle = new Uint8Array(count2);
  const halfVector = [length2[0], length2[1], length2[2] + 1],
    highlight = Math.hypot(...halfVector);
  halfVector[0] /= highlight;
  halfVector[1] /= highlight;
  halfVector[2] /= highlight;
  for (let pixelY = 0; pixelY < distance; pixelY++)
    for (let pixelX = 0; pixelX < distance; pixelX++) {
      const entryKey = pixelY * distance + pixelX,
        positionX = (pixelX + 0.5 - radiusRatio) / radiusRatio,
        positionY = (pixelY + 0.5 - radiusRatio) / radiusRatio,
        radiusRatio2 = positionX * positionX + positionY * positionY;
      if (radiusRatio2 >= 1) continue;
      const sqrt2 = Math.sqrt(1 - radiusRatio2),
        xRatio = positionX * count - positionY * state2,
        yRatio = positionX * state2 + positionY * count,
        asin2 = Math.asin(clamp(-yRatio, -1, 1)),
        atan = Math.atan2(xRatio, sqrt2);
      lightUnit[entryKey] = (atan / (Math.PI * 2) + 1) % 1;
      level[entryKey] = clamp(0.5 - asin2 / Math.PI, 0, 0.9999);
      const slot = Math.sin(asin2),
        className = Math.cos(asin2),
        source = Math.sin(atan),
        cosine = Math.cos(atan);
      const radialDirection = [cosine, 0, -source],
        nextRadius = [-slot * source, -className, -slot * cosine]; // east and north in the tilted frame
      const velocityErrorX = radialDirection[0] * count + radialDirection[1] * state2,
        velocityErrorY = -radialDirection[0] * state2 + radialDirection[1] * count,
        nextX = nextRadius[0] * count + nextRadius[1] * state2,
        nextY = -nextRadius[0] * state2 + nextRadius[1] * count;
      lightScale[entryKey] = positionX * length2[0] + positionY * length2[1] + sqrt2 * length2[2];
      leaderEntity[entryKey] =
        velocityErrorX * length2[0] + velocityErrorY * length2[1] + radialDirection[2] * length2[2];
      lightNormals[entryKey] = nextX * length2[0] + nextY * length2[1] + nextRadius[2] * length2[2];
      const ship = Math.max(
        0,
        positionX * halfVector[0] + positionY * halfVector[1] + sqrt2 * halfVector[2],
      );
      space[entryKey] = Math.pow(ship, 70) * 0.75 + Math.pow(ship, 12) * 0.08;
      rimLighting[entryKey] = Math.pow(1 - sqrt2, 2.6) * (renderedDefinition.atmk || 1);
      lightDepth[entryKey] = sqrt2;
      lightAngle[entryKey] = Math.round(
        clamp((1 - Math.sqrt(radiusRatio2)) * radiusRatio * 1.4) * 255,
      );
    }
  const statistic = {
    term: new Float32Array(count2),
    gasd: new Float32Array(count2),
    atmR: new Float32Array(count2),
    atmG: new Float32Array(count2),
    atmB: new Float32Array(count2),
    nightF: new Float32Array(count2),
    clL: new Float32Array(count2),
  }; // what does not change as it turns
  for (let entryKey = 0; entryKey < count2; entryKey++) {
    if (!lightAngle[entryKey]) continue;
    const lightScale2 = lightScale[entryKey];
    statistic.term[entryKey] = smoothJ(-0.12, 0.35, lightScale2);
    statistic.gasd[entryKey] =
      (Math.pow(Math.max(0, lightScale2), 0.8) * 0.95 + 0.03) *
      (0.55 + 0.45 * Math.pow(lightDepth[entryKey], 0.4));
    if (renderedDefinition.atm) {
      const quantity = rimLighting[entryKey] * (0.25 + 0.95 * smoothJ(-0.35, 0.5, lightScale2));
      statistic.atmR[entryKey] = renderedDefinition.atm[0] * quantity;
      statistic.atmG[entryKey] = renderedDefinition.atm[1] * quantity;
      statistic.atmB[entryKey] = renderedDefinition.atm[2] * quantity;
    }
    statistic.nightF[entryKey] = renderedDefinition.night
      ? smoothJ(0.15, -0.2, lightScale2)
      : 0.35 + 0.65 * smoothJ(0.3, -0.2, lightScale2);
    statistic.clL[entryKey] = Math.pow(Math.max(0, lightScale2), 0.8) * 0.95 + 0.04;
    space[entryKey] *= 1;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = state;
  const disk = document.createElement('canvas');
  disk.width = disk.height = distance;
  const canvasRenderingContext2D = disk.getContext('2d')!;
  const period = renderedDefinition.gas
    ? 160 + randomGenerator() * 90
    : 230 + randomGenerator() * 200;
  const position = {
    T: renderedTexture,
    D: distance,
    S: state,
    lu: lightUnit,
    lv: level,
    ls: lightScale,
    le: leaderEntity,
    lnn: lightNormals,
    sp: space,
    rim: rimLighting,
    lz: lightDepth,
    la: lightAngle,
    canvas,
    ctx: canvas.getContext('2d')!,
    disk,
    dctx: canvasRenderingContext2D,
    img: canvasRenderingContext2D.createImageData(distance, distance),
    st: statistic,
    spin: 1 / period,
    off: randomGenerator(),
    cdrift: (0.04 + randomGenerator() * 0.06) / period,
    scale: planetDef.r / radiusRatio,
    lastU: -1,
    lastC: -1,
    rendered: true,
  };
  RCACHE.set(planetDef.id, position, retainedBytes(position, statistic), performance.now());
  return position;
}
function _cloudAt(
  cloud: Uint8Array,
  availableWidth: number,
  availableHeight: number,
  fuel: number,
  forwardVelocity: number,
) {
  forwardVelocity = Math.max(0, Math.min(availableHeight - 1.001, forwardVelocity));
  const initialValue = forwardVelocity | 0,
    finalValue = Math.min(availableHeight - 1, initialValue + 1),
    targetValue = forwardVelocity - initialValue,
    flags = Math.floor(fuel),
    initialFraction = ((flags % availableWidth) + availableWidth) % availableWidth,
    finalFraction = (initialFraction + 1) % availableWidth,
    targetFraction = fuel - flags;
  return (
    ((cloud[initialValue * availableWidth + initialFraction] * (1 - targetFraction) +
      cloud[initialValue * availableWidth + finalFraction] * targetFraction) *
      (1 - targetValue) +
      (cloud[finalValue * availableWidth + initialFraction] * (1 - targetFraction) +
        cloud[finalValue * availableWidth + finalFraction] * targetFraction) *
        targetValue) /
    255
  );
}
const smoothJ = (firstValue: number, secondValue: number, value: number) => {
  const clamp2 = clamp((value - firstValue) / (secondValue - firstValue));
  return clamp2 * clamp2 * (3 - 2 * clamp2);
};
function renderRendered(position: RenderedPlanet, horizontalOffset: number, cloudOffset: number) {
  const {
      T: renderedTexture,
      D: distance,
      lu: lightUnit,
      lv: level,
      ls: lightScale,
      le: leaderEntity,
      lnn: lightNormals,
      sp: space,
      la: lightAngle,
      img: imageData,
      st: state,
    } = position,
    renderedDefinition = renderedTexture.R,
    imageDataArray = imageData.data,
    {
      tw: textWidth,
      th: textureHeight,
      aw: availableWidth,
      ah: availableHeight,
      col: column,
      wat: water,
      emi: emissive,
      cld: cloud2,
      ge: gameEntity,
      gn: generator,
    } = renderedTexture,
    count = distance * distance;
  const errorCount = renderedDefinition.ecol || [255, 200, 120],
    colorChannel = renderedDefinition.cloud || [248, 249, 252],
    gasRock = renderedDefinition.gas,
    bump = renderedDefinition.bk > 0,
    cloudShift = Math.round(availableWidth * 0.004) + 1;
  const {
    term,
    gasd: gasDensity,
    atmR: atmosphereRed,
    atmG: atmosphereGreen,
    atmB: atmosphereBlue,
    nightF,
    clL: cloudLighting,
  } = state;
  for (let entryKey = 0; entryKey < count; entryKey++) {
    const lightAngle2 = lightAngle[entryKey],
      options = entryKey * 4;
    if (!lightAngle2) {
      imageDataArray[options + 3] = 0;
      continue;
    }
    let fraction = lightUnit[entryKey] + horizontalOffset;
    if (fraction >= 1) fraction -= 1;
    const level2 = level[entryKey],
      targetIndex = (((level2 * textureHeight) | 0) * textWidth + ((fraction * textWidth) | 0)) * 3,
      atlasIndex =
        ((level2 * availableHeight) | 0) * availableWidth + ((fraction * availableWidth) | 0),
      lightScale2 = lightScale[entryKey],
      term2 = term[entryKey];
    let diff;
    if (gasRock) diff = gasDensity[entryKey];
    else {
      let lightScale = lightScale2;
      if (bump) {
        const gameEntity2 = gameEntity[atlasIndex],
          generator2 = generator[atlasIndex];
        if (gameEntity2 || generator2)
          lightScale =
            (lightScale2 -
              (gameEntity2 * leaderEntity[entryKey] + generator2 * lightNormals[entryKey])) /
            Math.sqrt(1 + gameEntity2 * gameEntity2 + generator2 * generator2);
      }
      diff =
        (lightScale > 0 ? lightScale * (1.08 - 0.08 * lightScale) : 0) * 0.92 * term2 +
        0.035 +
        0.03 * term2;
    }
    let radius = column[targetIndex] * diff,
      game = column[targetIndex + 1] * diff,
      secondValue = column[targetIndex + 2] * diff;
    // clouds and their shadows (bilinear)
    let forwardVelocity = level2 * availableHeight - 0.5;
    if (forwardVelocity < 0) forwardVelocity = 0;
    else if (forwardVelocity > availableHeight - 1.001) forwardVelocity = availableHeight - 1.001;
    const fuel = fraction * availableWidth - 0.5 + cloudOffset,
      initialValue = forwardVelocity | 0,
      finalValue = initialValue + 1 < availableHeight ? initialValue + 1 : initialValue,
      targetValue = forwardVelocity - initialValue,
      flags = Math.floor(fuel),
      targetFraction = fuel - flags;
    let initialFraction = flags % availableWidth;
    if (initialFraction < 0) initialFraction += availableWidth;
    const finalFraction = initialFraction + 1 === availableWidth ? 0 : initialFraction + 1,
      radius0 = initialValue * availableWidth,
      radius1 = finalValue * availableWidth;
    const cosAngle =
      ((cloud2[radius0 + initialFraction] * (1 - targetFraction) +
        cloud2[radius0 + finalFraction] * targetFraction) *
        (1 - targetValue) +
        (cloud2[radius1 + initialFraction] * (1 - targetFraction) +
          cloud2[radius1 + finalFraction] * targetFraction) *
          targetValue) *
      0.0039215;
    let savedValue = initialValue - cloudShift;
    if (savedValue < 0) savedValue = 0;
    let surface = initialFraction - cloudShift;
    if (surface < 0) surface += availableWidth;
    const cargoSpace = cloud2[savedValue * availableWidth + surface] * 0.0039215;
    if (cargoSpace) {
      const ship = 1 - cargoSpace * 0.45 * term2;
      radius *= ship;
      game *= ship;
      secondValue *= ship;
    }
    if (cosAngle) {
      const className = cloudLighting[entryKey] * cosAngle,
        initialAngle = 1 - cosAngle;
      radius = radius * initialAngle + colorChannel[0] * className;
      game = game * initialAngle + colorChannel[1] * className;
      secondValue = secondValue * initialAngle + colorChannel[2] * className;
    }
    const water2 = water[atlasIndex];
    if (water2) {
      const secondState = space[entryKey] * water2 * (1 - cosAngle);
      radius += secondState;
      game += secondState * 0.97;
      secondValue += secondState * 0.9;
    }
    const emissive2 = emissive[atlasIndex];
    if (emissive2) {
      const entityKey = emissive2 * 0.0039215 * nightF[entryKey] * (1 - cosAngle * 0.7),
        hovered = entityKey * entityKey * 0.5;
      radius += (errorCount[0] + (255 - errorCount[0]) * hovered) * entityKey;
      game += (errorCount[1] + (255 - errorCount[1]) * hovered) * entityKey;
      secondValue += (errorCount[2] + (255 - errorCount[2]) * hovered) * entityKey;
    }
    imageDataArray[options] = radius + atmosphereRed[entryKey];
    imageDataArray[options + 1] = game + atmosphereGreen[entryKey];
    imageDataArray[options + 2] = secondValue + atmosphereBlue[entryKey];
    imageDataArray[options + 3] = lightAngle2;
  }
  position.dctx.putImageData(imageData, 0, 0);
  const canvasRenderingContext2D = position.ctx,
    state2 = position.S;
  canvasRenderingContext2D.clearRect(0, 0, state2, state2);
  canvasRenderingContext2D.drawImage(renderedTexture.back, 0, 0, state2, state2);
  canvasRenderingContext2D.drawImage(
    position.disk,
    (state2 - distance) / 2,
    (state2 - distance) / 2,
  );
  if (renderedTexture.front)
    canvasRenderingContext2D.drawImage(renderedTexture.front, 0, 0, state2, state2);
}
/**
 * Generates or retrieves the lit, rotating canvas sprite for a planet or moon.
 * @param planetDef - Stellar object descriptor.
 * @param currentTime - High-resolution timestamp in milliseconds.
 * @returns Active planet sprite buffer with rendering metrics, or null if loading.
 */
export function planetSprite(planetDef: PlanetDef, currentTime: number): PlanetSprite | null {
  const authored = bodyArtwork(planetDef.id);
  if (authored?.shape === 'irregular') {
    const source = `moons/${authored.art}`;
    let image = images.get(source);
    if (!image) {
      image = loadImg(`assets/${source}.webp`);
      images.set(source, image);
    }
    if (image.complete && image.naturalWidth) {
      const size = image.naturalWidth;
      let sprite = irregularSprites.get(planetDef.id);
      if (!sprite) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        sprite = { canvas, S: size, D: size, scale: (2 * planetDef.r) / size };
        irregularSprites.set(planetDef.id, sprite);
      }
      const canvas = sprite.canvas as HTMLCanvasElement;
      const context = canvas.getContext('2d')!;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, size, size);
      context.translate(size / 2, size / 2);
      context.rotate(currentTime / 180000 + (hashStr(planetDef.id) % 628) / 100);
      context.drawImage(image, -size / 2, -size / 2);
      return sprite;
    }
    return procSprite(planetDef, currentTime);
  }
  const renderedDefinition = chooseRendered(planetDef);
  if (renderedDefinition) {
    let position = RCACHE.get(planetDef.id, performance.now());
    if (!position) {
      const renderedTexture = texFor(renderedDefinition);
      if (!renderedTexture) {
        let htmlImageElement = images.get(renderedDefinition.id);
        if (!htmlImageElement) {
          htmlImageElement = loadImg(`assets/planets/${renderedDefinition.id}.webp`);
          images.set(renderedDefinition.id, htmlImageElement);
        } // the still render until the maps arrive
        if (htmlImageElement.complete && htmlImageElement.naturalWidth) {
          const naturalWidth2 = htmlImageElement.naturalWidth,
            distance = renderedDefinition.r * naturalWidth2;
          return {
            canvas: htmlImageElement,
            S: naturalWidth2,
            D: distance,
            scale: (2 * planetDef.r) / distance,
          };
        }
        return procSprite(planetDef, currentTime);
      }
      position = setupRendered(planetDef, renderedTexture);
    } else texFor(renderedDefinition);
    const time = currentTime / 1000,
      unitOffset = (position.off + time * position.spin) % 1,
      radiusUnit = Math.floor(unitOffset * position.T.tw),
      resultCode = Math.floor(time * position.cdrift * position.T.aw) % position.T.aw;
    if (radiusUnit !== position.lastU || resultCode !== position.lastC) {
      if (currentTime - budgetT > 50) {
        budgetT = currentTime;
        budget = 0;
      }
      if (position.lastU < 0 || budget < 2) {
        budget++;
        position.lastU = radiusUnit;
        position.lastC = resultCode;
        renderRendered(position, radiusUnit / position.T.tw, resultCode);
      }
    }
    return position;
  }
  return procSprite(planetDef, currentTime);
}
function procSprite(planetDef: PlanetDef, currentTime: number) {
  const position = cache.get(planetDef.id, performance.now()) || advance(planetDef, currentTime);
  if (!position) return null;
  const radiusUnit =
      Math.floor(
        (position.T.spinLon / 6.283) * textWidth + (currentTime / 1000) * position.T.spin,
      ) % textWidth,
    resultCode = Math.floor((currentTime / 1000) * position.T.cspin) % textWidth;
  if (position.fresh) {
    position.fresh = false;
    return null;
  } // the first render waits for the next frame
  if (radiusUnit !== position.lastU || resultCode !== position.lastC) {
    // re-render only when the surface has turned a texel (a few times a second at most)
    if (currentTime - budgetT > 50) {
      budgetT = currentTime;
      budget = 0;
    }
    if (position.lastU < 0 || budget < 2) {
      budget++;
      position.lastU = radiusUnit;
      position.lastC = resultCode;
      renderDisk(position, radiusUnit, resultCode);
    }
  }
  return position;
}

/** Retained size of one planet render cache. */
export interface PlanetCacheUsage {
  /** Cached worlds or texture sets. */
  entries: number;

  /** Estimated retained bytes; decoded image elements are not included. */
  bytes: number;

  /** Byte budget; texture sets are bounded by count instead. */
  budgetBytes: number;
}

/**
 * Reports the retained size of the planet render caches for diagnostics and regression tests.
 * @returns Usage of the procedural, rendered and shared texture caches.
 */
export function planetCacheUsage(): Record<
  'procedural' | 'rendered' | 'textures',
  PlanetCacheUsage
> {
  let textureBytes = 0;
  for (const texture of textureCache.values())
    if (texture.ready) textureBytes += retainedBytes(texture);
  return {
    procedural: { entries: cache.size, bytes: cache.bytes, budgetBytes: cache.budgetBytes },
    rendered: { entries: RCACHE.size, bytes: RCACHE.bytes, budgetBytes: RCACHE.budgetBytes },
    textures: { entries: textureCache.size, bytes: textureBytes, budgetBytes: Infinity },
  };
}

/**
 * Replaces the planet cache budgets, evicting idle worlds if the caches are now over budget.
 * Used by measurement runs; gameplay keeps the defaults.
 * @param proceduralBytes Budget for procedural worlds.
 * @param renderedBytes Budget for worlds lit from pre-rendered maps.
 */
export function setPlanetCacheBudgets(proceduralBytes: number, renderedBytes: number): void {
  const now = performance.now();
  cache.budgetBytes = proceduralBytes;
  RCACHE.budgetBytes = renderedBytes;
  cache.evict(now);
  RCACHE.evict(now);
}
