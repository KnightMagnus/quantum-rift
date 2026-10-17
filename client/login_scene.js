// An observation-window view of the actual starting system, not a second simulation.
// Traffic is decorative: it never connects to the server or touches a player save.
import { START, SYS, STELLARS } from '/shared/galaxy.js';
import { SPRITES } from '/shared/sprites26.js';
import { planetSprite } from './planets.js';
import { loopFrames } from './animation_frames.js';

const TRAFFIC = [
  { hull: 703, lane: 0.19, phase: 0.12, speed: 0.019, size: 60, right: true },
  { hull: 706, lane: 0.74, phase: 0.79, speed: 0.012, size: 112, right: false },
  { hull: 708, lane: 0.38, phase: 0.83, speed: 0.016, size: 74, right: true },
  { hull: 711, lane: 0.85, phase: 0.3, speed: 0.009, size: 130, right: true },
  { hull: 704, lane: 0.53, phase: 0.08, speed: 0.022, size: 54, right: false },
  { hull: 705, lane: 0.11, phase: 0.62, speed: 0.014, size: 46, right: false },
];

/** Decorative traffic positions; seconds are active scene time, not wall time. */
export function loginTraffic(seconds, width, height) {
  const scale = Math.min(1.25, Math.max(0.6, width / 1440));
  return TRAFFIC.map((ship) => {
    const progress = (ship.phase + seconds * ship.speed) % 1;
    return {
      ...ship,
      x: (ship.right ? progress : 1 - progress) * (width + 240) - 120,
      y: ship.lane * height,
      size: ship.size * scale,
    };
  });
}

/** Install one scene; hide/show and tab visibility own its animation lifecycle. */
export function initLoginScene(login) {
  const canvas = login.querySelector('.login-scene');
  if (!canvas || canvas.dataset.initialized) return;
  canvas.dataset.initialized = 'true';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sky = document.createElement('canvas'),
    bg = sky.getContext('2d'),
    motion = matchMedia('(prefers-reduced-motion: reduce)'),
    system = SYS[START.system],
    planet = system.stellars.find((body) => body.kind === 'planet'),
    station = STELLARS[START.stellar];
  canvas.dataset.system = system.id;
  canvas.dataset.station = station.id;
  canvas.dataset.planet = planet.id;
  canvas.dataset.hulls = TRAFFIC.map((ship) => ship.hull).join(',');
  const images = new Map();
  let width = 0,
    height = 0,
    ratio = 1,
    frame = 0,
    elapsed = 0,
    last = 0,
    drawn = 0,
    staticPlanetTime = performance.now(),
    settle = [];
  const visible = () => !login.classList.contains('hidden') && !document.hidden;
  const loaded = (im) => im?.complete && im.naturalWidth > 0;
  function image(file) {
    const im = new Image();
    im.onload = () => {
      if (visible()) paint();
    };
    im.src = `assets/${file}`;
    images.set(file, im);
    return im;
  }
  const hub = image('hub.png');
  // Extract the actual asset's red/green navigation lights once, not each frame.
  const hubLights = document.createElement('canvas');
  const lights = hubLights.getContext('2d');
  hub.addEventListener('load', () => {
    // Half-resolution glow mask is enough for tiny lamps, at one quarter the memory.
    hubLights.width = hub.naturalWidth / 2;
    hubLights.height = hub.naturalHeight / 2;
    lights.drawImage(hub, 0, 0, hubLights.width, hubLights.height);
    const pixels = lights.getImageData(0, 0, hubLights.width, hubLights.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i],
        g = pixels.data[i + 1],
        b = pixels.data[i + 2];
      if (!((r > 180 && g < 130 && b < 130) || (g > 180 && r < 150 && b < 160)))
        pixels.data[i + 3] = 0;
    }
    lights.putImageData(pixels, 0, 0);
    if (visible()) paint();
  });
  const nebula = image('decor/nebula_2.webp');
  for (const { hull } of TRAFFIC) image(`ships/${hull}.webp`);

  // A crisp, deterministic star field is cached at display resolution.
  function resize() {
    // Layout dimensions exclude the opening overlay's transient scale animation.
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = sky.width = Math.round(width * ratio);
    canvas.height = sky.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    bg.setTransform(ratio, 0, 0, ratio, 0, 0);
    bg.fillStyle = '#030711';
    bg.fillRect(0, 0, width, height);
    const glow = bg.createRadialGradient(
      width * 0.8,
      height * 0.25,
      0,
      width * 0.7,
      height * 0.4,
      width * 0.85,
    );
    glow.addColorStop(0, '#11273a');
    glow.addColorStop(0.55, '#080f21');
    glow.addColorStop(1, '#03050b');
    bg.fillStyle = glow;
    bg.fillRect(0, 0, width, height);
    let seed = 42073;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < Math.min(1100, (width * height) / 1500); i++) {
      const x = random() * width,
        y = random() * height,
        r = random() < 0.95 ? 0.35 + random() * 0.55 : 1.2;
      bg.globalAlpha = 0.22 + random() * 0.65;
      bg.fillStyle = i % 4 ? '#d3e7ff' : '#ffe3ba';
      bg.beginPath();
      bg.arc(x, y, r, 0, Math.PI * 2);
      bg.fill();
    }
    bg.globalAlpha = 1;
    if (visible()) paint();
  }

  function paint() {
    if (!width || !visible()) return;
    ctx.drawImage(sky, 0, 0, width, height);
    if (loaded(nebula)) {
      ctx.globalAlpha = 0.15;
      const size = Math.max(width * 0.9, height);
      ctx.drawImage(nebula, width * 0.35, -height * 0.3, size, size);
      ctx.globalAlpha = 1;
    }
    // Concordia and Quantum Station are the landmarks a new captain starts beside.
    const radius = Math.min(width * 0.32, height * 0.57) * 0.7,
      px = width * 0.08,
      py = height * 1.02,
      atmosphere = ctx.createRadialGradient(px, py, radius * 0.8, px, py, radius * 1.11);
    atmosphere.addColorStop(0, '#1761a2');
    atmosphere.addColorStop(0.81, '#69c8ef');
    atmosphere.addColorStop(1, '#102c5800');
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(px, py, radius * 1.11, 0, Math.PI * 2);
    ctx.fill();
    const seconds = motion.matches ? 0 : elapsed;
    // Match the shared game's monotonic renderer/budget clock, including after logout.
    // Reduced motion captures one pose; texture-settling repaints never advance it.
    const world = planetSprite(planet, motion.matches ? staticPlanetTime : performance.now());
    if (world) {
      const size = (2 * radius * world.S) / world.D;
      ctx.drawImage(world.canvas, px - size / 2, py - size / 2, size, size);
      canvas.dataset.planetReady = 'true';
    }
    if (loaded(hub)) {
      const size = Math.min(width * 0.39, height * 0.57);
      ctx.save();
      ctx.translate(width * 0.85, height * 0.35);
      ctx.rotate(-0.12);
      ctx.shadowColor = '#72bbff';
      ctx.shadowBlur = 24;
      const frames = loopFrames(seconds * 1000, 18, 150000 / 18);
      const fs = hub.naturalWidth / 6;
      for (const [f, weight] of [
        [frames.first, 1 - frames.mix],
        [frames.second, frames.mix],
      ]) {
        const sx = (f % 6) * fs,
          sy = Math.floor(f / 6) * fs;
        ctx.globalAlpha = f === frames.first ? 1 : weight;
        ctx.drawImage(hub, sx, sy, fs, fs, -size / 2, -size / 2, size, size);
        if (hubLights.width * 2 === hub.naturalWidth) {
          // Dim the baked-in lamps first so bright source pixels can visibly pulse
          // instead of immediately saturating under an additive overlay.
          ctx.shadowBlur = 0;
          ctx.filter = 'brightness(0)';
          ctx.globalAlpha = weight * 0.8;
          ctx.drawImage(
            hubLights,
            sx / 2,
            sy / 2,
            fs / 2,
            fs / 2,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          ctx.filter = 'none';
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowBlur = 5;
          ctx.globalAlpha = weight * (0.2 + 0.75 * (0.5 + 0.5 * Math.sin(seconds * 2)));
          ctx.drawImage(
            hubLights,
            sx / 2,
            sy / 2,
            fs / 2,
            fs / 2,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowBlur = 24;
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    for (const ship of loginTraffic(motion.matches ? 0 : elapsed, width, height)) {
      const im = images.get(`ships/${ship.hull}.webp`),
        sprite = SPRITES[ship.hull],
        heading = ship.right ? 9 : 27,
        sx = (heading % sprite.cols) * sprite.fs,
        sy = Math.floor(heading / sprite.cols) * sprite.fs;
      if (!loaded(im)) continue;
      ctx.drawImage(
        im,
        sx,
        sy,
        sprite.fs,
        sprite.fs,
        ship.x - ship.size / 2,
        ship.y - ship.size / 2,
        ship.size,
        ship.size,
      );
    }
    canvas.dataset.ready =
      loaded(hub) && TRAFFIC.every(({ hull }) => loaded(images.get(`ships/${hull}.webp`)))
        ? 'true'
        : 'false';
  }

  function tick(now) {
    frame = 0;
    if (!visible() || motion.matches) {
      // Reconcile even if a browser drops/coalesces the media/visibility change event.
      sync();
      return;
    }
    if (last) elapsed += Math.min((now - last) / 1000, 0.1);
    last = now;
    if (now - drawn >= 1000 / 30) {
      paint();
      drawn = now;
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    for (const timer of settle) clearTimeout(timer);
    settle = [];
    const active = visible();
    staticPlanetTime = performance.now();
    canvas.dataset.running = String(active && !motion.matches);
    if (!active) return;
    paint();
    if (!motion.matches) frame = requestAnimationFrame(tick);
    // Give the shared planet renderer time to decode its textures in static mode.
    // These bounded repaints never change positions, and are cancelled on hide.
    else settle = [150, 500, 1500].map((ms) => setTimeout(paint, ms));
  }
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);
  const loginObserver = new MutationObserver(sync);
  loginObserver.observe(login, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  // Moving between displays can change DPR without changing CSS dimensions.
  window.addEventListener('resize', resize);
  resize();
  sync();
}
