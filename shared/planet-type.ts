/** Classification inputs shared by orbital art and landed scenes. */
export interface PlanetDescription {
  /** Stable celestial catalog identity. */
  id: string;
  /** Display name used by authored biome hints. */
  name?: string;
  /** Catalog description containing terrain hints. */
  desc?: string;
  /** Catalog body category. */
  kind?: string;
  /** Fallback orbital palette. */
  color?: string;
  /** Catalog radius used by the fallback classifier. */
  r: number;
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

export function planetType(planetDef: PlanetDescription): Biome {
  if (planetDef.id === 'earth') return 'earth';
  if (planetDef.id === 'luna') return 'barren';
  const distance =
      (planetDef.desc || '').toLowerCase() + ' ' + (planetDef.name || '').toLowerCase(),
    randomGenerator = seeded(hashStr(planetDef.id + 't'));
  const containsEntry = (...width: string[]) =>
    width.some((positionX) => distance.includes(positionX));
  if (containsEntry('volcan', 'lava', 'molten', 'magma', 'forge', 'smelt')) return 'lava';
  if (containsEntry('gas giant', 'giant', 'storm', 'rings', 'ring ')) return 'gas';
  if (containsEntry('crystal', 'glass')) return 'crystal';
  if (containsEntry('ice', 'frozen', 'snow', 'glacier', 'tundra')) return 'ice';
  if (containsEntry('desert', 'dune', 'sand', 'dust')) return 'desert';
  if (containsEntry('ocean', 'water', 'sea ', 'seas', 'reef', 'island')) return 'ocean';
  if (containsEntry('jungle', 'garden', 'farm', 'forest', 'orchard', 'green')) return 'terran';
  if (containsEntry('toxic', 'acid', 'poison', 'swamp')) return 'toxic';
  if (containsEntry('dead', 'barren', 'airless', 'mine', 'rock')) return 'barren';
  if (planetDef.kind === 'moon') return randomGenerator() < 0.3 ? 'ice' : 'barren';
  const [redChannel, greenChannel, blueChannel] = hueSaturationLightness(hexToRgb(planetDef.color));
  if (planetDef.r >= 160 && randomGenerator() < 0.6) return 'gas';
  if (greenChannel < 0.18) return blueChannel > 0.6 ? 'ice' : 'barren';
  if (redChannel >= 180 && redChannel < 250) return randomGenerator() < 0.75 ? 'ocean' : 'ice';
  if (redChannel >= 80 && redChannel < 180) return randomGenerator() < 0.7 ? 'terran' : 'toxic';
  if (redChannel >= 250 && redChannel < 330) return randomGenerator() < 0.6 ? 'gas' : 'crystal';
  if (redChannel < 20 || redChannel >= 330) return randomGenerator() < 0.55 ? 'lava' : 'desert';
  return randomGenerator() < 0.7 ? 'desert' : 'gas';
}
