// Seeded, cached artwork: no per-frame randomness, filters or particle allocation.
const sprites = new WeakMap();
export const COMET_DEPTH = 0.12;

// A continuous ellipse rather than a modulo flight/reset. About 1–2 px/sec at
// normal zoom: visible over seconds, never a foreground projectile.
export function cometPose(c, now) {
  const phase = Math.atan2(c.y0, c.x0),
    a = phase + now / 1000 / 720;
  return {
    x: Math.cos(a) * 920,
    y: Math.sin(a) * 560,
    angle: Math.atan2(Math.sin(a) * 560, Math.cos(a) * 920),
  };
}

export function cometScreen(c, W, H, z, cx, cy, now) {
  const p = cometPose(c, now),
    scale = Math.pow(z, 0.25);
  return {
    ...p,
    x: W / 2 + (p.x - cx * COMET_DEPTH) * scale,
    y: H / 2 + (p.y - cy * COMET_DEPTH) * scale,
    scale,
  };
}

function artwork(c) {
  if (sprites.has(c)) return sprites.get(c);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.translate(110, 220);
  ctx.globalCompositeOperation = 'lighter';
  let seed = Math.round(c.x0 * 31 + c.y0 * 17 + c.len * 101) >>> 0 || 1;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const puff = (x, y, rx, ry, rgb, alpha) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.35, `rgba(${rgb},${alpha * 0.52})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };
  // Curved dust fan assembled from soft overlapping wisps, not polygon beams.
  for (let i = 100; i >= 0; i--) {
    const u = i / 100;
    puff(
      u * 690,
      115 * u * u,
      28 + u * 100,
      12 + u * 62,
      '218,201,166',
      0.034 * Math.pow(1 - u, 1.7),
    );
  }
  for (let strand = 0; strand < 13; strand++) {
    const offset = (random() - 0.5) * 80,
      phase = random() * 6.28;
    for (let i = 1; i < 80; i++) {
      const u = i / 80;
      puff(
        u * 690,
        115 * u * u + offset * u + Math.sin(u * 13 + phase) * u * 12,
        13 + u * 28,
        2 + u * 7,
        '228,209,174',
        0.026 * Math.pow(1 - u, 1.3),
      );
    }
  }
  // Narrow blue ion filaments stream anti-solar, separate from the warm dust.
  for (let strand = 0; strand < 7; strand++) {
    const offset = (random() - 0.5) * 24,
      phase = random() * 6.28;
    for (let i = 0; i < 110; i++) {
      const u = i / 110;
      puff(
        u * 790,
        -14 * u + offset * u + Math.sin(u * 20 + phase) * u * 5,
        18 + 15 * u,
        3 + 7 * u,
        '116,180,255',
        0.046 * Math.pow(1 - u, 1.6),
      );
    }
  }
  puff(8, 0, 70, 55, c.hue, 0.15);
  puff(3, 0, 35, 28, c.hue, 0.35);
  puff(0, 0, 14, 12, '217,241,255', 0.62);
  puff(-1, 0, 5, 4, '255,251,231', 0.95);
  sprites.set(c, canvas);
  return canvas;
}

export function cometTailAngle(p, sun) {
  return Math.atan2(p.y - sun.y, p.x - sun.x);
}

export function drawComet(ctx, c, W, H, z, cx, cy, now, sun) {
  const p = cometScreen(c, W, H, z, cx, cy, now);
  const scale = (c.len / 790) * p.scale;
  const radius = 1000 * scale; // Include the entire tail when culling.
  if (p.x < -radius || p.y < -radius || p.x > W + radius || p.y > H + radius) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(cometTailAngle(p, sun));
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(artwork(c), -110, -220);
  ctx.restore();
}
