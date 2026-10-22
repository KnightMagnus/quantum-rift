// An observation-window view of the actual starting system, not a second simulation.
// Traffic is decorative: it never connects to the server or touches a player save.
import { START, SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { planetSprite } from './planets.ts';
import { loopFrames } from './animation_frames.ts';

const TRAFFIC = [
  { hull: 703, lane: 0.19, phase: 0.12, speed: 0.019, size: 60, right: true },
  { hull: 706, lane: 0.74, phase: 0.79, speed: 0.012, size: 112, right: false },
  { hull: 708, lane: 0.38, phase: 0.83, speed: 0.016, size: 74, right: true },
  { hull: 711, lane: 0.85, phase: 0.3, speed: 0.009, size: 130, right: true },
  { hull: 704, lane: 0.53, phase: 0.08, speed: 0.022, size: 54, right: false },
  { hull: 705, lane: 0.11, phase: 0.62, speed: 0.014, size: 46, right: false },
];

/** Decorative traffic positions; seconds are active scene time, not wall time. */
export function loginTraffic(seconds: number, width: number, height: number) {
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
export function initLoginScene(login: HTMLElement) {
  const candidate = login.querySelector<HTMLCanvasElement>('.login-scene');
  if (!candidate || candidate.dataset.initialized) return;
  const canvas = candidate;
  canvas.dataset.initialized = 'true';
  const context = canvas.getContext('2d');
  if (!context) return;
  const canvasRenderingContext2D = context;
  const htmlCanvasElement = document.createElement('canvas'),
    canvasRenderingContext2D2 = htmlCanvasElement.getContext('2d')!,
    motion = matchMedia('(prefers-reduced-motion: reduce)'),
    system = systemsById[START.system],
    planet = system.stellars.find((body) => body.kind === 'planet')!,
    station = STELLARS[START.stellar];
  canvas.dataset.system = system.id;
  canvas.dataset.station = station.id;
  canvas.dataset.planet = planet.id;
  canvas.dataset.hulls = TRAFFIC.map((ship) => ship.hull).join(',');
  const images = new Map<string, HTMLImageElement>();
  let width = 0,
    height = 0,
    ratio = 1,
    frame = 0,
    elapsed = 0,
    last = 0,
    drawn = 0,
    staticPlanetTime = performance.now(),
    settle: ReturnType<typeof setTimeout>[] = [];
  const visible = () => !login.classList.contains('hidden') && !document.hidden;
  const loaded = (
    htmlImageElement: HTMLImageElement | null | undefined,
  ): htmlImageElement is HTMLImageElement =>
    !!htmlImageElement?.complete && htmlImageElement.naturalWidth > 0;
  function image(file: string) {
    const htmlImageElement = new Image();
    htmlImageElement.onload = () => {
      if (visible()) paint();
    };
    htmlImageElement.src = `assets/${file}`;
    images.set(file, htmlImageElement);
    return htmlImageElement;
  }
  const htmlImageElement2 = image('hub.png');
  // Extract the actual asset's red/green navigation lights once, not each frame.
  const hubLights = document.createElement('canvas');
  const lights = hubLights.getContext('2d')!;
  htmlImageElement2.addEventListener('load', () => {
    // Half-resolution glow mask is enough for tiny lamps, at one quarter the memory.
    hubLights.width = htmlImageElement2.naturalWidth / 2;
    hubLights.height = htmlImageElement2.naturalHeight / 2;
    lights.drawImage(htmlImageElement2, 0, 0, hubLights.width, hubLights.height);
    const pixels = lights.getImageData(0, 0, hubLights.width, hubLights.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const data2 = pixels.data[index],
        data3 = pixels.data[index + 1],
        data4 = pixels.data[index + 2];
      if (
        !(
          (data2 > 180 && data3 < 130 && data4 < 130) ||
          (data3 > 180 && data2 < 150 && data4 < 160)
        )
      )
        pixels.data[index + 3] = 0;
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
    canvas.width = htmlCanvasElement.width = Math.round(width * ratio);
    canvas.height = htmlCanvasElement.height = Math.round(height * ratio);
    canvasRenderingContext2D.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvasRenderingContext2D2.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvasRenderingContext2D2.fillStyle = '#030711';
    canvasRenderingContext2D2.fillRect(0, 0, width, height);
    const glow = canvasRenderingContext2D2.createRadialGradient(
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
    canvasRenderingContext2D2.fillStyle = glow;
    canvasRenderingContext2D2.fillRect(0, 0, width, height);
    let seed = 42073;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let index = 0; index < Math.min(1100, (width * height) / 1500); index++) {
      const positionX = random() * width,
        positionY = random() * height,
        radius = random() < 0.95 ? 0.35 + random() * 0.55 : 1.2;
      canvasRenderingContext2D2.globalAlpha = 0.22 + random() * 0.65;
      canvasRenderingContext2D2.fillStyle = index % 4 ? '#d3e7ff' : '#ffe3ba';
      canvasRenderingContext2D2.beginPath();
      canvasRenderingContext2D2.arc(positionX, positionY, radius, 0, Math.PI * 2);
      canvasRenderingContext2D2.fill();
    }
    canvasRenderingContext2D2.globalAlpha = 1;
    if (visible()) paint();
  }

  function paint() {
    if (!width || !visible()) return;
    canvasRenderingContext2D.drawImage(htmlCanvasElement, 0, 0, width, height);
    if (loaded(nebula)) {
      canvasRenderingContext2D.globalAlpha = 0.15;
      const size = Math.max(width * 0.9, height);
      canvasRenderingContext2D.drawImage(nebula, width * 0.35, -height * 0.3, size, size);
      canvasRenderingContext2D.globalAlpha = 1;
    }
    // Concordia and Quantum Station are the landmarks a new captain starts beside.
    const radius = Math.min(width * 0.32, height * 0.57) * 0.7,
      pixelX = width * 0.08,
      pixelY = height * 1.02,
      atmosphere = canvasRenderingContext2D.createRadialGradient(
        pixelX,
        pixelY,
        radius * 0.8,
        pixelX,
        pixelY,
        radius * 1.11,
      );
    atmosphere.addColorStop(0, '#1761a2');
    atmosphere.addColorStop(0.81, '#69c8ef');
    atmosphere.addColorStop(1, '#102c5800');
    canvasRenderingContext2D.fillStyle = atmosphere;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(pixelX, pixelY, radius * 1.11, 0, Math.PI * 2);
    canvasRenderingContext2D.fill();
    const seconds = motion.matches ? 0 : elapsed;
    // Match the shared game's monotonic renderer/budget clock, including after logout.
    // Reduced motion captures one pose; texture-settling repaints never advance it.
    const world = planetSprite(planet, motion.matches ? staticPlanetTime : performance.now());
    if (world) {
      const size = (2 * radius * world.S) / world.D;
      canvasRenderingContext2D.drawImage(
        world.canvas,
        pixelX - size / 2,
        pixelY - size / 2,
        size,
        size,
      );
      canvas.dataset.planetReady = 'true';
    }
    if (loaded(htmlImageElement2)) {
      const size = Math.min(width * 0.39, height * 0.57);
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(width * 0.85, height * 0.35);
      canvasRenderingContext2D.rotate(-0.12);
      canvasRenderingContext2D.shadowColor = '#72bbff';
      canvasRenderingContext2D.shadowBlur = 24;
      const frames = loopFrames(seconds * 1000, 18, 150000 / 18);
      const fileSystem = htmlImageElement2.naturalWidth / 6;
      for (const [factionId, weight] of [
        [frames.first, 1 - frames.mix],
        [frames.second, frames.mix],
      ]) {
        const screenX = (factionId % 6) * fileSystem,
          screenY = Math.floor(factionId / 6) * fileSystem;
        canvasRenderingContext2D.globalAlpha = factionId === frames.first ? 1 : weight;
        canvasRenderingContext2D.drawImage(
          htmlImageElement2,
          screenX,
          screenY,
          fileSystem,
          fileSystem,
          -size / 2,
          -size / 2,
          size,
          size,
        );
        if (hubLights.width * 2 === htmlImageElement2.naturalWidth) {
          // Dim the baked-in lamps first so bright source pixels can visibly pulse
          // instead of immediately saturating under an additive overlay.
          canvasRenderingContext2D.shadowBlur = 0;
          canvasRenderingContext2D.filter = 'brightness(0)';
          canvasRenderingContext2D.globalAlpha = weight * 0.8;
          canvasRenderingContext2D.drawImage(
            hubLights,
            screenX / 2,
            screenY / 2,
            fileSystem / 2,
            fileSystem / 2,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          canvasRenderingContext2D.filter = 'none';
          canvasRenderingContext2D.globalCompositeOperation = 'lighter';
          canvasRenderingContext2D.shadowBlur = 5;
          canvasRenderingContext2D.globalAlpha =
            weight * (0.2 + 0.75 * (0.5 + 0.5 * Math.sin(seconds * 2)));
          canvasRenderingContext2D.drawImage(
            hubLights,
            screenX / 2,
            screenY / 2,
            fileSystem / 2,
            fileSystem / 2,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          canvasRenderingContext2D.globalCompositeOperation = 'source-over';
          canvasRenderingContext2D.shadowBlur = 24;
        }
      }
      canvasRenderingContext2D.globalAlpha = 1;
      canvasRenderingContext2D.restore();
    }
    for (const ship of loginTraffic(motion.matches ? 0 : elapsed, width, height)) {
      const htmlImageElement = images.get(`ships/${ship.hull}.webp`),
        sprite = SPRITES[ship.hull],
        heading = ship.right ? 9 : 27,
        screenX = (heading % sprite.cols) * sprite.fs,
        screenY = Math.floor(heading / sprite.cols) * sprite.fs;
      if (!loaded(htmlImageElement)) continue;
      canvasRenderingContext2D.drawImage(
        htmlImageElement,
        screenX,
        screenY,
        sprite.fs,
        sprite.fs,
        ship.x - ship.size / 2,
        ship.y - ship.size / 2,
        ship.size,
        ship.size,
      );
    }
    canvas.dataset.ready =
      loaded(htmlImageElement2) &&
      TRAFFIC.every(({ hull }) => loaded(images.get(`ships/${hull}.webp`)))
        ? 'true'
        : 'false';
  }

  function tick(currentTime: number) {
    frame = 0;
    if (!visible() || motion.matches) {
      // Reconcile even if a browser drops/coalesces the media/visibility change event.
      sync();
      return;
    }
    if (last) elapsed += Math.min((currentTime - last) / 1000, 0.1);
    last = currentTime;
    if (currentTime - drawn >= 1000 / 30) {
      paint();
      drawn = currentTime;
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
    else settle = [150, 500, 1500].map((milliseconds) => setTimeout(paint, milliseconds));
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
