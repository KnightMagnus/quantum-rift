// Stellar artwork is generated once per cached system, never per animation frame.
// These are distant decoration profiles, not changes to stellar gameplay geometry.
const TAU = Math.PI * 2;
const SIZE = 256;
const CACHE_LIMIT = 12;
const surfaces = new Map();
function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function random(seed) {
  let state = seed;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const rgb = (color) => color.split(',').map(Number);
export function starProfile(system, sun) {
  const seed = hash(String(system.id));
  // Retain the existing authored palettes, including Crucible and Farside decor.
  // Sol is intentionally recognizable rather than a random blue/orange star.
  const sol = system.id === 'sol';
  return {
    seed,
    core: rgb(sol ? '255,244,220' : sun.core),
    halo: rgb(sol ? '255,190,90' : sun.halo),
    radiusScale: system.arena || sol ? 1 : 0.8 + (seed % 451) / 1000,
  };
}
function noise(x, y, seed) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const f = (v) => v * v * (3 - 2 * v);
  const u = f(x - ix),
    v = f(y - iy);
  const sample = (a, b) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const a = sample(ix, iy),
    b = sample(ix + 1, iy);
  const c = sample(ix, iy + 1),
    d = sample(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
}
function buildSurface(profile) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(SIZE, SIZE),
    rnd = random(profile.seed);
  const spots = Array.from({ length: 5 }, () => ({
    x: (rnd() - 0.5) * 1.3,
    y: (rnd() - 0.5) * 1.1,
    r: 0.025 + rnd() * 0.045,
  }));
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5 - SIZE / 2) / (SIZE / 2 - 1);
      const v = (y + 0.5 - SIZE / 2) / (SIZE / 2 - 1);
      const r2 = u * u + v * v;
      if (r2 >= 1) continue;
      const depth = Math.sqrt(1 - r2);
      // Multi-scale convection cells and darker intergranular lanes. The radial
      // projection compresses their size toward the limb, revealing a sphere.
      const px = Math.atan2(u, depth) * 24,
        py = Math.asin(v) * 24;
      const broad = noise(px * 0.55, py * 0.55, profile.seed);
      const cells = noise(px * 2.1, py * 2.1, profile.seed ^ 1741);
      const fine = noise(px * 5, py * 5, profile.seed ^ 7283);
      let heat = 0.55 + broad * 0.2 + cells * 0.21 + fine * 0.08;
      for (const spot of spots) {
        const distance = Math.hypot(u - spot.x, v - spot.y) / spot.r;
        if (distance < 2) heat *= 1 - 0.6 * Math.exp(-distance * distance * 1.4);
      }
      const limb = 0.56 + depth * 0.44;
      const offset = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) {
        const tone = profile.halo[c] * (1 - heat) + profile.core[c] * heat;
        image.data[offset + c] = tone * limb * (0.65 + heat * 0.35);
      }
      image.data[offset + 3] = Math.min(1, ((1 - Math.sqrt(r2)) * SIZE) / 2) * 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
function surface(profile) {
  const key = `${profile.seed}:${profile.core}:${profile.halo}`;
  if (surfaces.has(key)) {
    const value = surfaces.get(key);
    surfaces.delete(key);
    surfaces.set(key, value);
    return value;
  }
  const canvas = buildSurface(profile);
  if (canvas) {
    surfaces.set(key, canvas);
    if (surfaces.size > CACHE_LIMIT) surfaces.delete(surfaces.keys().next().value);
  }
  return canvas;
}
export function drawStar(ctx, system, sun, x, y, decorRadius, now) {
  const profile = starProfile(system, sun),
    t = now / 1000;
  // The old radius described a glow, not a solid disc. Keep the new disc modest
  // so planets, targeting markers and navigation remain readable in front of it.
  const radius = decorRadius * 0.34 * profile.radiusScale;
  if (!(radius > 0)) return;
  const halo = profile.halo.join(','),
    core = profile.core.join(',');
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(0, 0, radius * 0.85, 0, 0, radius * 4.5);
  glow.addColorStop(0, `rgba(${halo},.30)`);
  glow.addColorStop(0.2, `rgba(${halo},.10)`);
  glow.addColorStop(1, `rgba(${halo},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-radius * 4.5, -radius * 4.5, radius * 9, radius * 9);
  // Continuous sine motion: no finite frame sequence or loop-boundary jump.
  for (let i = 0; i < 6; i++) {
    const angle = ((hash(`${profile.seed}:${i}`) % 10000) / 10000) * TAU;
    const pulse = 0.5 + Math.sin(t * 0.34 + i * 1.7) * 0.5;
    ctx.strokeStyle = `rgba(${halo},${0.09 + pulse * 0.09})`;
    ctx.lineWidth = radius * 0.012;
    ctx.beginPath();
    const height = radius * (1.12 + pulse * 0.07);
    ctx.moveTo(Math.cos(angle - 0.055) * radius, Math.sin(angle - 0.055) * radius);
    ctx.bezierCurveTo(
      Math.cos(angle - 0.1) * height,
      Math.sin(angle - 0.1) * height,
      Math.cos(angle + 0.1) * height,
      Math.sin(angle + 0.1) * height,
      Math.cos(angle + 0.055) * radius,
      Math.sin(angle + 0.055) * radius,
    );
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  const image = surface(profile);
  if (image) {
    ctx.save();
    ctx.rotate(t * 0.002);
    ctx.drawImage(image, -radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  } else {
    // Canvas allocation failure must not remove the star from the scene.
    ctx.fillStyle = `rgb(${core})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(${core},.30)`;
  ctx.lineWidth = Math.max(0.6, radius * 0.008);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
