// Stellar artwork is generated once per cached system, never per animation frame.
// These are distant decoration profiles, not changes to stellar gameplay geometry.
const fullCircleRadians = Math.PI * 2;
const SIZE = 256;
const CACHE_LIMIT = 12;
interface StarSystem {
  id: string;
  arena?: boolean;
}
interface SunPalette {
  core: string;
  halo: string;
}
type StarProfile = ReturnType<typeof starProfile>;
const surfaces = new Map<string, HTMLCanvasElement>();
function hash(text: string) {
  let height = 2166136261;
  for (const text2 of text) height = Math.imul(height ^ text2.charCodeAt(0), 16777619);
  return height >>> 0;
}
function random(seed: number) {
  let state = seed;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const colorChannels = (color: string) => color.split(',').map(Number);
export function starProfile(system: StarSystem, sunPalette: SunPalette) {
  const seed = hash(String(system.id));
  // Retain the existing authored palettes, including Crucible and Farside decor.
  // Sol is intentionally recognizable rather than a random blue/orange star.
  const solution = system.id === 'sol';
  return {
    seed,
    core: colorChannels(solution ? '255,244,220' : sunPalette.core),
    halo: colorChannels(solution ? '255,190,90' : sunPalette.halo),
    radiusScale: system.arena || solution ? 1 : 0.8 + (seed % 451) / 1000,
  };
}
function noise(positionX: number, positionY: number, seed: number) {
  const indexX = Math.floor(positionX),
    indexY = Math.floor(positionY);
  const factionId = (value: number) => value * value * (3 - 2 * value);
  const fraction = factionId(positionX - indexX),
    value = factionId(positionY - indexY);
  const sample = (firstValue: number, secondValue: number) => {
    let count = Math.imul(firstValue, 374761393) ^ Math.imul(secondValue, 668265263) ^ seed;
    count = Math.imul(count ^ (count >>> 13), 1274126177);
    return ((count ^ (count >>> 16)) >>> 0) / 4294967296;
  };
  const sample2 = sample(indexX, indexY),
    sample3 = sample(indexX + 1, indexY);
  const sample4 = sample(indexX, indexY + 1),
    sample5 = sample(indexX + 1, indexY + 1);
  return (
    sample2 +
    (sample3 - sample2) * fraction +
    (sample4 - sample2 + (sample2 - sample3 - sample4 + sample5) * fraction) * value
  );
}
function buildSurface(profile: StarProfile) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const canvasRenderingContext2D = canvas.getContext('2d');
  if (!canvasRenderingContext2D) return null;
  const image = canvasRenderingContext2D.createImageData(SIZE, SIZE),
    random2 = random(profile.seed);
  const spots = Array.from({ length: 5 }, () => ({
    x: (random2() - 0.5) * 1.3,
    y: (random2() - 0.5) * 1.1,
    r: 0.025 + random2() * 0.045,
  }));
  for (let positionY = 0; positionY < SIZE; positionY++)
    for (let positionX = 0; positionX < SIZE; positionX++) {
      const fraction = (positionX + 0.5 - SIZE / 2) / (SIZE / 2 - 1);
      const value = (positionY + 0.5 - SIZE / 2) / (SIZE / 2 - 1);
      const radiusSquared = fraction * fraction + value * value;
      if (radiusSquared >= 1) continue;
      const depth = Math.sqrt(1 - radiusSquared);
      // Multi-scale convection cells and darker intergranular lanes. The radial
      // projection compresses their size toward the limb, revealing a sphere.
      const pixelX = Math.atan2(fraction, depth) * 24,
        pixelY = Math.asin(value) * 24;
      const broad = noise(pixelX * 0.55, pixelY * 0.55, profile.seed);
      const cells = noise(pixelX * 2.1, pixelY * 2.1, profile.seed ^ 1741);
      const fine = noise(pixelX * 5, pixelY * 5, profile.seed ^ 7283);
      let heat = 0.55 + broad * 0.2 + cells * 0.21 + fine * 0.08;
      for (const spot of spots) {
        const distance = Math.hypot(fraction - spot.x, value - spot.y) / spot.r;
        if (distance < 2) heat *= 1 - 0.6 * Math.exp(-distance * distance * 1.4);
      }
      const limb = 0.56 + depth * 0.44;
      const offset = (positionY * SIZE + positionX) * 4;
      for (let component = 0; component < 3; component++) {
        const tone = profile.halo[component] * (1 - heat) + profile.core[component] * heat;
        image.data[offset + component] = tone * limb * (0.65 + heat * 0.35);
      }
      image.data[offset + 3] = Math.min(1, ((1 - Math.sqrt(radiusSquared)) * SIZE) / 2) * 255;
    }
  canvasRenderingContext2D.putImageData(image, 0, 0);
  return canvas;
}
function surface(profile: StarProfile) {
  const entryKey = `${profile.seed}:${String(profile.core)}:${String(profile.halo)}`;
  if (surfaces.has(entryKey)) {
    const value = surfaces.get(entryKey)!;
    surfaces.delete(entryKey);
    surfaces.set(entryKey, value);
    return value;
  }
  const canvas = buildSurface(profile);
  if (canvas) {
    surfaces.set(entryKey, canvas);
    if (surfaces.size > CACHE_LIMIT) surfaces.delete(surfaces.keys().next().value!);
  }
  return canvas;
}
export function drawStar(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  system: StarSystem,
  sunPalette: SunPalette,
  positionX: number,
  positionY: number,
  decorRadius: number,
  currentTime: number,
) {
  const profile = starProfile(system, sunPalette),
    time = currentTime / 1000;
  // The source radius describes a glow, not a solid disc. Keep the disc modest
  // so planets, targeting markers and navigation remain readable in front of it.
  const radius = decorRadius * 0.34 * profile.radiusScale;
  if (!(radius > 0)) return;
  const halo = profile.halo.join(','),
    core = profile.core.join(',');
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.translate(positionX, positionY);
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  const glow = canvasRenderingContext2D.createRadialGradient(
    0,
    0,
    radius * 0.85,
    0,
    0,
    radius * 4.5,
  );
  glow.addColorStop(0, `rgba(${halo},.30)`);
  glow.addColorStop(0.2, `rgba(${halo},.10)`);
  glow.addColorStop(1, `rgba(${halo},0)`);
  canvasRenderingContext2D.fillStyle = glow;
  canvasRenderingContext2D.fillRect(-radius * 4.5, -radius * 4.5, radius * 9, radius * 9);
  // Continuous sine motion: no finite frame sequence or loop-boundary jump.
  for (let index = 0; index < 6; index++) {
    const angle = ((hash(`${profile.seed}:${index}`) % 10000) / 10000) * fullCircleRadians;
    const pulse = 0.5 + Math.sin(time * 0.34 + index * 1.7) * 0.5;
    canvasRenderingContext2D.strokeStyle = `rgba(${halo},${0.09 + pulse * 0.09})`;
    canvasRenderingContext2D.lineWidth = radius * 0.012;
    canvasRenderingContext2D.beginPath();
    const height = radius * (1.12 + pulse * 0.07);
    canvasRenderingContext2D.moveTo(
      Math.cos(angle - 0.055) * radius,
      Math.sin(angle - 0.055) * radius,
    );
    canvasRenderingContext2D.bezierCurveTo(
      Math.cos(angle - 0.1) * height,
      Math.sin(angle - 0.1) * height,
      Math.cos(angle + 0.1) * height,
      Math.sin(angle + 0.1) * height,
      Math.cos(angle + 0.055) * radius,
      Math.sin(angle + 0.055) * radius,
    );
    canvasRenderingContext2D.stroke();
  }
  canvasRenderingContext2D.globalCompositeOperation = 'source-over';
  const image = surface(profile);
  if (image) {
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.rotate(time * 0.002);
    canvasRenderingContext2D.drawImage(image, -radius, -radius, radius * 2, radius * 2);
    canvasRenderingContext2D.restore();
  } else {
    // Canvas allocation failure must not remove the star from the scene.
    canvasRenderingContext2D.fillStyle = `rgb(${core})`;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(0, 0, radius, 0, fullCircleRadians);
    canvasRenderingContext2D.fill();
  }
  canvasRenderingContext2D.strokeStyle = `rgba(${core},.30)`;
  canvasRenderingContext2D.lineWidth = Math.max(0.6, radius * 0.008);
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.arc(0, 0, radius, 0, fullCircleRadians);
  canvasRenderingContext2D.stroke();
  canvasRenderingContext2D.restore();
}
