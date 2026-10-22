// Seeded, cached artwork: no per-frame randomness, filters or particle allocation.
/** @type {WeakMap<CometConfig, HTMLCanvasElement>} */
export interface CometConfig {
  x0: number;
  y0: number;
  len: number;
  hue: string;
}
interface Point {
  x: number;
  y: number;
}
const sprites = new WeakMap<CometConfig, HTMLCanvasElement>();

/**
 * Depth parallax factor for background comet rendering.
 * @type {number}
 */
export const COMET_DEPTH = 0.12;

/**
 * Comet orbital parameters.
 * @typedef {object} CometConfig
 * @property {number} x0 Initial orbital X reference.
 * @property {number} y0 Initial orbital Y reference.
 * @property {number} len Visual tail length scale.
 * @property {string} hue RGB color string for coma glow.
 */

/**
 * Evaluated orbital pose in world space.
 * @typedef {object} CometPose
 * @property {number} x World coordinate X.
 * @property {number} y World coordinate Y.
 * @property {number} angle Tangent trajectory angle in radians.
 */

/**
 * Evaluated comet pose transformed into screen viewport coordinates.
 * @typedef {object} CometScreenPose
 * @property {number} x Screen coordinate X.
 * @property {number} y Screen coordinate Y.
 * @property {number} angle Tangent trajectory angle in radians.
 * @property {number} scale Parallax zoom scale factor.
 */

/**
 * A continuous ellipse rather than a modulo flight/reset. About 1–2 px/sec at
 * normal zoom: visible over seconds, never a foreground projectile.
 * @param {CometConfig} cometConfig Comet configuration parameters.
 * @param {number} currentTime Current simulation or animation timestamp in milliseconds.
 * @returns {CometPose} Orbital pose in system space.
 */
export function cometPose(cometConfig: CometConfig, currentTime: number) {
  const phase = Math.atan2(cometConfig.y0, cometConfig.x0),
    firstValue = phase + currentTime / 1000 / 720;
  return {
    x: Math.cos(firstValue) * 920,
    y: Math.sin(firstValue) * 560,
    angle: Math.atan2(Math.sin(firstValue) * 560, Math.cos(firstValue) * 920),
  };
}

/**
 * Computes the screen-space position and parallax scaling for a comet.
 * @param {CometConfig} cometConfig Comet configuration parameters.
 * @param {number} width Viewport width in pixels.
 * @param {number} height Viewport height in pixels.
 * @param {number} positionZ Camera zoom level.
 * @param {number} centerX Camera center X in world space.
 * @param {number} centerY Camera center Y in world space.
 * @param {number} currentTime Timestamp in milliseconds.
 * @returns {CometScreenPose} Viewport-mapped screen pose.
 */
export function cometScreen(
  cometConfig: CometConfig,
  width: number,
  height: number,
  positionZ: number,
  centerX: number,
  centerY: number,
  currentTime: number,
) {
  const cometPose2 = cometPose(cometConfig, currentTime),
    scale = Math.pow(positionZ, 0.25);
  return {
    ...cometPose2,
    x: width / 2 + (cometPose2.x - centerX * COMET_DEPTH) * scale,
    y: height / 2 + (cometPose2.y - centerY * COMET_DEPTH) * scale,
    scale,
  };
}

/**
 * Generates or retrieves cached offscreen canvas sprite artwork for a comet.
 * @param {CometConfig} cometConfig Comet configuration parameters.
 * @returns {HTMLCanvasElement} Rendered canvas sprite texture.
 */
function artwork(cometConfig: CometConfig) {
  if (sprites.has(cometConfig)) return sprites.get(cometConfig)!;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const canvasRenderingContext2D = canvas.getContext('2d');
  if (!canvasRenderingContext2D) return canvas;
  canvasRenderingContext2D.translate(110, 220);
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  let seed =
    Math.round(cometConfig.x0 * 31 + cometConfig.y0 * 17 + cometConfig.len * 101) >>> 0 || 1;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  /**
   * @param {number} positionX
   * @param {number} positionY
   * @param {number} relativeX
   * @param {number} relativeY
   * @param {string} colorChannels
   * @param {number} alpha
   */
  const puff = (
    positionX: number,
    positionY: number,
    relativeX: number,
    relativeY: number,
    colorChannels: string,
    alpha: number,
  ) => {
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.scale(relativeX, relativeY);
    const canvasGradient = canvasRenderingContext2D.createRadialGradient(0, 0, 0, 0, 0, 1);
    canvasGradient.addColorStop(0, `rgba(${colorChannels},${alpha})`);
    canvasGradient.addColorStop(0.35, `rgba(${colorChannels},${alpha * 0.52})`);
    canvasGradient.addColorStop(1, `rgba(${colorChannels},0)`);
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fillRect(-1, -1, 2, 2);
    canvasRenderingContext2D.restore();
  };
  // Curved dust fan assembled from soft overlapping wisps, not polygon beams.
  for (let index = 100; index >= 0; index--) {
    const fraction = index / 100;
    puff(
      fraction * 690,
      115 * fraction * fraction,
      28 + fraction * 100,
      12 + fraction * 62,
      '218,201,166',
      0.034 * Math.pow(1 - fraction, 1.7),
    );
  }
  for (let strand = 0; strand < 13; strand++) {
    const offset = (random() - 0.5) * 80,
      phase = random() * 6.28;
    for (let index = 1; index < 80; index++) {
      const fraction = index / 80;
      puff(
        fraction * 690,
        115 * fraction * fraction +
          offset * fraction +
          Math.sin(fraction * 13 + phase) * fraction * 12,
        13 + fraction * 28,
        2 + fraction * 7,
        '228,209,174',
        0.026 * Math.pow(1 - fraction, 1.3),
      );
    }
  }
  // Narrow blue ion filaments stream anti-solar, separate from the warm dust.
  for (let strand = 0; strand < 7; strand++) {
    const offset = (random() - 0.5) * 24,
      phase = random() * 6.28;
    for (let index = 0; index < 110; index++) {
      const fraction = index / 110;
      puff(
        fraction * 790,
        -14 * fraction + offset * fraction + Math.sin(fraction * 20 + phase) * fraction * 5,
        18 + 15 * fraction,
        3 + 7 * fraction,
        '116,180,255',
        0.046 * Math.pow(1 - fraction, 1.6),
      );
    }
  }
  puff(8, 0, 70, 55, cometConfig.hue, 0.15);
  puff(3, 0, 35, 28, cometConfig.hue, 0.35);
  puff(0, 0, 14, 12, '217,241,255', 0.62);
  puff(-1, 0, 5, 4, '255,251,231', 0.95);
  sprites.set(cometConfig, canvas);
  return canvas;
}

/**
 * Calculates anti-solar tail angle pointing away from the system star.
 * @param {{x: number, y: number}} point Comet screen coordinates.
 * @param {{x: number, y: number}} point2 Primary stellar body screen coordinates.
 * @returns {number} Tail angle in radians.
 */
export function cometTailAngle(point: Point, point2: Point) {
  return Math.atan2(point.y - point2.y, point.x - point2.x);
}

/**
 * Renders a comet and its dust/ion tail onto the main viewport canvas.
 * @param {CanvasRenderingContext2D} canvasRenderingContext2D 2D canvas rendering context.
 * @param {CometConfig} cometConfig Comet configuration parameters.
 * @param {number} width Viewport width in pixels.
 * @param {number} height Viewport height in pixels.
 * @param {number} positionZ Camera zoom scale.
 * @param {number} centerX Camera center X in world space.
 * @param {number} centerY Camera center Y in world space.
 * @param {number} currentTime Timestamp in milliseconds.
 * @param {{x: number, y: number}} point Primary stellar body screen coordinates.
 * @returns {void}
 */
export function drawComet(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  cometConfig: CometConfig,
  width: number,
  height: number,
  positionZ: number,
  centerX: number,
  centerY: number,
  currentTime: number,
  point: Point,
) {
  const cometScreen2 = cometScreen(
    cometConfig,
    width,
    height,
    positionZ,
    centerX,
    centerY,
    currentTime,
  );
  const scale = (cometConfig.len / 790) * cometScreen2.scale;
  const radius = 1000 * scale; // Include the entire tail when culling.
  if (
    cometScreen2.x < -radius ||
    cometScreen2.y < -radius ||
    cometScreen2.x > width + radius ||
    cometScreen2.y > height + radius
  )
    return;
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.translate(cometScreen2.x, cometScreen2.y);
  canvasRenderingContext2D.rotate(cometTailAngle(cometScreen2, point));
  canvasRenderingContext2D.scale(scale, scale);
  canvasRenderingContext2D.globalAlpha = 1;
  canvasRenderingContext2D.globalCompositeOperation = 'lighter';
  canvasRenderingContext2D.drawImage(artwork(cometConfig), -110, -220);
  canvasRenderingContext2D.restore();
}
