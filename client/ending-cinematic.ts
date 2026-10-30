import { assetImage } from './asset-resources.ts';
import { overlays } from './overlay-controller.ts';
import * as audio from './audio.ts';
import { setRadioBlocked } from './radio.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { STORY_QUESTS } from '../shared/story-quests.ts';

/** Seconds on the presentation clock; no scene changes authoritative world state. */
export const ENDING_SHOTS = [
  { id: 'fade', duration: 2 },
  { id: 'crawl', duration: 40 },
  { id: 'lamps', duration: 12 },
  { id: 'awakening', duration: 12 },
  { id: 'core', duration: 18 },
  { id: 'gateway', duration: 10 },
  { id: 'rift', duration: 18 },
  { id: 'captain', duration: 8 },
] as const;
/** Resolve a bounded scene and local progress without granting progression. */
export function endingShot(seconds: number) {
  let start = 0;
  for (const shot of ENDING_SHOTS) {
    if (seconds < start + shot.duration)
      return { id: shot.id, progress: Math.max(0, (seconds - start) / shot.duration) };
    start += shot.duration;
  }
  return { id: 'complete', progress: 1 };
}

let departureFrame: HTMLCanvasElement | null = null;
/** Freeze the departure view before the authoritative transfer changes the live camera. */
export function prepareEndingDeparture() {
  const view = document.getElementById('view') as HTMLCanvasElement | null;
  if (!view?.width || !view.height) return;
  const frame = document.createElement('canvas');
  frame.width = view.width;
  frame.height = view.height;
  const context = frame.getContext('2d')!;
  // The engine canvas may contain transparent pixels; never expose the live
  // world through the frozen departure when the server changes systems.
  context.fillStyle = '#000';
  context.fillRect(0, 0, frame.width, frame.height);
  context.drawImage(view, 0, 0);
  // Closing the decision must not undim the backdrop and reveal scenery that
  // was barely visible behind the dialog. Preserve its exact tint in the fade.
  const choice = document.getElementById('storybox');
  if (choice && !choice.classList.contains('hidden')) {
    context.fillStyle = getComputedStyle(choice).backgroundColor;
    context.fillRect(0, 0, frame.width, frame.height);
  }
  departureFrame = frame;
  // Hold the selected view synchronously, before closing the choice or sending
  // the transfer request can expose a new live camera frame.
  document.getElementById('endingdeparture')?.remove();
  document.body.classList.add('ending-departure');
  frame.id = 'endingdeparture';
  document.body.append(frame);
}
let cancelCurrent: (() => void) | null = null;
/** Session teardown cancels both the animation clock and its input/audio ownership. */
export function resetEndingCinematic() {
  cancelCurrent?.();
  cancelCurrent = null;
  document.getElementById('endingdeparture')?.remove();
  document.body.classList.remove('ending-choice', 'ending-departure');
}

/** Decode the handful of scene assets while the decision window is open. */
export function preloadEndingCinematic(hullId: number) {
  audio.preload(['music_login33']);
  for (const path of [
    'ships/925.webp',
    'ships/926.webp',
    'ships/926_glow.webp',
    'hub_still.png',
    'decor/crystal_0.webp',
    'quantum_rift.png',
    'wormhole.png',
    `ships/${hullId}.webp`,
  ])
    assetImage(path);
}

/** Play the server-confirmed ending with real hull/station assets and local camera cuts. */
export function playEndingCinematic(options: {
  /** Authored ending text from the accepted story message. */
  text: string;
  /** Only the completed Lamplighter branch may relight its lamps. */
  lampsRelit: boolean;
  /** Actual player hull used in the final camera shot. */
  hull: number;
  /** Restore the story owner after the mandatory objective briefing. */
  complete: () => void;
}) {
  const introFrame = departureFrame;
  departureFrame = null;
  resetEndingCinematic();
  document.body.dataset.endingCinematic = 'active';
  document.body.classList.add('ending-choice');
  document.getElementById('endingcinematic')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'endingcinematic';
  overlay.className = 'overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'The Table');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  const canvas = document.createElement('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  if (introFrame) canvas.getContext('2d')!.drawImage(introFrame, 0, 0, canvas.width, canvas.height);
  canvas.setAttribute('aria-label', 'The Table ending sequence');
  const transcript = document.createElement('p');
  transcript.className = 'ending-transcript';
  transcript.textContent = options.text;
  overlay.append(canvas, transcript);
  document.body.append(overlay);
  setRadioBlocked(true);
  audio.unlock();
  let began = performance.now();
  let themeStarted = false;
  let themeFinished = false;
  let continueButton: HTMLButtonElement | null = null;
  audio.stopMusic(0);
  audio.startMusic({
    loop: false,
    onStarted: () => {
      began = performance.now();
      themeStarted = true;
    },
    onEnded: () => {
      themeFinished = true;
      if (continueButton) {
        continueButton.disabled = false;
        continueButton.textContent = 'CONTINUE';
        continueButton.focus();
      }
    },
  });
  let animation = 0;
  let closed = false;
  let thunder = false;
  let lastScene = '';
  let hiddenAt: number | null = null;
  const visibility = () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (hiddenAt !== null) {
      began += performance.now() - hiddenAt;
      hiddenAt = null;
    }
  };
  document.addEventListener('visibilitychange', visibility);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(animation);
    document.removeEventListener('visibilitychange', visibility);
    overlays.close('endingcinematic');
    overlay.replaceChildren();
    setRadioBlocked(false);
    audio.stopMusic();
    document.body.classList.remove('ending-choice', 'ending-departure');
    document.body.dataset.endingCinematic = 'complete';
  };
  // The owner is registered once; all later runs replace the DOM behind it.
  registerCinematicOverlay();
  cancelCurrent = cleanup;
  overlays.open('endingcinematic');
  overlay.focus();
  const context = canvas.getContext('2d')!;
  const sceneOptions = { ...options, introFrame };
  const crawl = options.text.split(' In Farside')[0];
  const draw = (now: number) => {
    if (closed) return;
    if (document.hidden) {
      animation = requestAnimationFrame(draw);
      return;
    }
    const seconds = themeStarted ? (now - began) / 1000 : 0;
    const shot = endingShot(seconds);
    canvas.dataset.scene = shot.id;
    canvas.dataset.elapsed = seconds.toFixed(2);
    if (shot.id === 'complete') {
      paintEndingShot(context, canvas.width, canvas.height, 'captain', 0.5, seconds, crawl, {
        ...sceneOptions,
        showCaption: false,
      });
      canvas.dataset.scene = 'briefing';
      document.body.dataset.endingCinematic = 'briefing';
      const briefing = document.createElement('section');
      briefing.className = 'ending-briefing metal';
      const title = document.createElement('h2');
      title.textContent = 'MISSION ACCEPTED · THROUGH THE SECOND DOOR';
      const text = document.createElement('p');
      text.textContent =
        'No ordinary ship survives the Rift. The peoples at the Table promised you a way through. Recover the five components, then bring them to the keepers at Vigil Lamp to fit the Rift Harness.';
      const list = document.createElement('ol');
      for (const id of ['rift-alloy', 'rift-lattice', 'rift-tuning', 'rift-song', 'rift-route']) {
        const quest = STORY_QUESTS.find((entry) => entry.id === id)!;
        const item = document.createElement('li');
        item.textContent = quest.name + ' — ' + quest.giver;
        list.append(item);
      }
      const button = document.createElement('button');
      button.className = 'btn';
      continueButton = button;
      button.disabled = !themeFinished;
      button.textContent = themeFinished ? 'CONTINUE' : 'THE SECOND DOOR AWAITS…';
      button.onclick = () => {
        cleanup();
        options.complete();
      };
      briefing.append(title, text, list, button);
      overlay.append(briefing);
      button.focus();
      return;
    }
    if (shot.id !== lastScene) {
      lastScene = shot.id;
      overlay.dataset.scene = shot.id;
    }
    const width = innerWidth;
    const height = innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    paintEndingShot(context, width, height, shot.id, shot.progress, seconds, crawl, sceneOptions);
    if (shot.id === 'rift' && shot.progress > 0.69 && !thunder) {
      thunder = true;
      audio.riftThunder();
    }
    animation = requestAnimationFrame(draw);
  };
  animation = requestAnimationFrame(draw);
}
let registered = false;
function registerCinematicOverlay() {
  if (registered) return;
  registered = true;
  overlays.register({
    id: 'endingcinematic',
    priority: 90,
    dismiss: () => {},
    initialFocus: () => document.getElementById('endingcinematic'),
    reset: resetEndingCinematic,
  });
}

function paragraphs(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && context.measureText(line + ' ' + word).width > width) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}
function hull(
  context: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  size: number,
  opacity = 1,
  rotation = 0,
) {
  const image = assetImage('ships/' + id + '.webp');
  const frame = SPRITES[id];
  if (!frame || !image.complete || !image.naturalWidth) return;
  context.save();
  context.globalAlpha *= opacity;
  context.translate(x, y);
  context.rotate(rotation);
  context.drawImage(image, 9 * frame.fs, 0, frame.fs, frame.fs, -size / 2, -size / 2, size, size);
  context.restore();
}
function glow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.12, color);
  gradient.addColorStop(1, 'transparent');
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
/** Use the same authored engine mask and normal-thrust trail as flight. */
function thrusters(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
) {
  const image = assetImage('ships/926_glow.webp');
  const frame = SPRITES[926];
  if (!image.complete || !image.naturalWidth) return;
  context.save();
  context.globalCompositeOperation = 'lighter';
  const flicker = 0.94 + 0.06 * Math.sin((time * 1000) / 47);
  for (let index = 12; index >= 1; index--) {
    const trail = index / 12;
    context.globalAlpha = 0.26 * (1 - trail * 0.85);
    context.drawImage(
      image,
      9 * frame.fs,
      0,
      frame.fs,
      frame.fs,
      x - size / 2 - size * 0.14 * flicker * trail,
      y - size / 2,
      size,
      size,
    );
  }
  context.globalAlpha = 0.8 * flicker;
  context.drawImage(
    image,
    9 * frame.fs,
    0,
    frame.fs,
    frame.fs,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  context.restore();
}
/** Sparse surface arcs accompany normal thrust without obscuring the hull. */
function arkLightning(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seconds: number,
) {
  if (seconds % 1.2 > 0.22) return;
  context.save();
  context.strokeStyle = '#b982ff';
  context.lineWidth = 1.4;
  context.globalAlpha = 0.4;
  context.shadowColor = '#9b54ff';
  context.shadowBlur = 6;
  for (const side of [-1, 1]) {
    context.beginPath();
    for (let index = 0; index < 7; index++) {
      const px = x + (index / 6 - 0.5) * size * 0.65;
      const py = y + side * size * (0.19 + Math.sin(index * 2.7 + seconds * 21) * 0.025);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }
  context.restore();
}
function portal(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seconds: number,
  quantum = true,
) {
  const image = assetImage(quantum ? 'quantum_rift.png' : 'wormhole.png');
  if (!image.complete || !image.naturalWidth) return;
  const frame = Math.floor(seconds * 12) % 32;
  const unit = image.naturalWidth / 8;
  context.drawImage(
    image,
    (frame % 8) * unit,
    Math.floor(frame / 8) * unit,
    unit,
    unit,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
}
function paintEndingShot(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: string,
  progress: number,
  seconds: number,
  crawl: string,
  options: {
    lampsRelit: boolean;
    hull: number;
    introFrame?: HTMLCanvasElement | null;
    showCaption?: boolean;
  },
) {
  const extent = Math.min(width, height);
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  if (scene === 'fade') {
    if (options.introFrame) context.drawImage(options.introFrame, 0, 0, width, height);
    context.fillStyle = `rgba(0,0,0,${progress})`;
    context.fillRect(0, 0, width, height);
    return;
  }
  if (scene === 'crawl') {
    const font = Math.max(28, Math.min(46, width / 31));
    context.font = `600 ${font}px sans-serif`;
    context.fillStyle = '#efd693';
    context.textAlign = 'center';
    const lines = ['THE CHOICE', ...crawl.split(/(?<=[.!?])\s+/)];
    const lineHeight = font * 1.65;
    const pauseHeight = lineHeight * 1.6;
    const lastOffset = (lines.length - 1) * lineHeight + pauseHeight;
    // Separate the closing pair, then cut to the lamps as the final row fades.
    const scroll = progress * (height * 0.9 + lastOffset);
    // Each scanline is a perspective-scaled text row, narrowing toward the vanishing point.
    lines.forEach((line, index) => {
      const y =
        height + index * lineHeight + (index >= lines.length - 2 ? pauseHeight : 0) - scroll;
      if (y < height * 0.12 || y > height + lineHeight) return;
      const perspective = 0.38 + (0.62 * y) / height;
      context.save();
      context.translate(width / 2, y);
      const fit = Math.min(1, (width * 0.94) / context.measureText(line).width);
      context.scale(perspective * fit, perspective);
      context.globalAlpha = Math.min(1, (y / height - 0.12) * 5);
      context.fillText(line, 0, 0);
      context.restore();
    });
    return;
  }
  context.fillStyle = '#03050e';
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 220; index++) {
    const x = (((index * 7919) % 1009) / 1009) * width;
    const y = (((index * 3571) % 1013) / 1013) * height;
    context.fillStyle = `rgba(210,220,255,${0.2 + (index % 5) * 0.13})`;
    context.fillRect(x, y, index % 9 ? 1 : 2, index % 9 ? 1 : 2);
  }
  const centerY = height * 0.44;
  let caption = '';
  let label = '';
  if (scene === 'awakening') {
    label = 'FARSIDE';
    caption = 'In Farside the vast hulk wakes: Gargantua Prime.';
    const x = width * (0.45 + Math.max(0, progress - 0.3) * 0.3);
    const size = extent * 0.72;
    hull(context, 925, x, centerY, size, Math.max(0, 1 - progress * 3.2));
    hull(context, 926, x, centerY, size, Math.min(1, progress * 3.2));
    for (let index = 0; index < 11; index++) {
      const growth = Math.max(0, Math.min(1, progress * 3 - index / 9));
      glow(
        context,
        x + (index - 5) * size * 0.037,
        centerY - Math.sin(index * 1.7) * size * 0.12,
        size * 0.055 * growth + 0.01,
        '#a99bff',
      );
    }
    if (progress > 0.3) {
      thrusters(context, x, centerY, size, seconds);
      arkLightning(context, x, centerY, size, seconds);
    }
  } else if (scene === 'core') {
    label = 'QUANTUM STATION';
    caption = 'The Riftweavers depart for their ancient ark.';
    const station = assetImage('hub_still.png');
    const size = extent * 0.64;
    const released = Math.max(0, Math.min(1, (progress - 0.18) / 0.55));
    context.globalAlpha = 1 - released * 0.18;
    if (station.complete && station.naturalWidth)
      context.drawImage(station, width * 0.27 - size / 2, centerY - size / 2, size, size);
    context.globalAlpha = 1;
    const arkX = width * 0.75;
    const arkY = centerY + extent * 0.08;
    const arkSize = extent * 0.55;
    const facing = Math.PI + 0.22;
    hull(context, 926, arkX, arkY, arkSize, 1, facing);
    const crystal = assetImage('decor/crystal_0.webp');
    const crystalX = arkX + Math.sin(facing) * arkSize * 0.15;
    const crystalY = arkY - Math.cos(facing) * arkSize * 0.15;
    const x = width * 0.27 + released * (crystalX - width * 0.27);
    const y =
      centerY + (crystalY - centerY) * released - Math.sin(released * Math.PI) * height * 0.19;
    glow(context, x, y, extent * 0.09 * (1 - released * 0.35), '#c1a8ff');
    if (crystal.complete && crystal.naturalWidth && released < 0.98)
      context.drawImage(
        crystal,
        x - extent * 0.035,
        y - extent * 0.05,
        extent * 0.07,
        extent * 0.1,
      );
    if (released > 0.96)
      glow(
        context,
        crystalX,
        crystalY,
        extent * 0.2 * Math.max(0, 1 - (progress - 0.72) * 4),
        '#e1ceff',
      );
  } else if (scene === 'gateway') {
    label = 'THE GATEWAY';
    caption = 'It carries the Core through the Second Door.';
    portal(context, width * 0.8, centerY, extent * 0.7, seconds, false);
    const x = width * (0.2 + progress * 0.53);
    thrusters(context, x, centerY, extent * 0.48, seconds);
    hull(context, 926, x, centerY, extent * 0.48);
    arkLightning(context, x, centerY, extent * 0.48, seconds);
  } else if (scene === 'rift' || scene === 'captain') {
    label = 'The Quantum Rift';
    portal(context, width * 0.75, centerY, extent * 0.88, seconds);
    if (scene === 'captain') {
      hull(context, options.hull, width * 0.3, height * 0.58, extent * 0.16);
      caption = options.showCaption === false ? '' : 'Welcome Captain, to the Quantum Rift.';
    } else {
      caption = 'The Index record one final word: Present.';
      const size = extent * 0.56;
      const x = width * (0.18 + Math.min(progress, 0.25) * 1.1);
      if (progress < 0.25) {
        thrusters(context, x, centerY, size, seconds);
        hull(context, 926, x, centerY, size);
        arkLightning(context, x, centerY, size, seconds);
      } else {
        const image = assetImage('ships/926.webp');
        if (image.complete && image.naturalWidth) {
          const threads: { x: number; y: number; length: number }[] = [];
          for (let index = 0; index < 16; index++) {
            const pull = Math.max(0, Math.min(1, (progress - 0.25 - index * 0.016) / 0.18));
            if (pull >= 1) continue;
            const pieceX = x + (width * 0.75 - x) * pull;
            const pieceY = centerY + (((index - 7.5) * size) / 16) * (1 - pull);
            const length = size * (1 + Math.sin(pull * Math.PI) * 1.5) * (1 - pull * 0.92);
            threads.push({ x: pieceX, y: pieceY, length });
            context.drawImage(
              image,
              9 * 480,
              index * 30,
              480,
              30,
              pieceX - length / 2,
              pieceY - size / 32,
              length,
              (size / 16) * (1 - pull),
            );
          }
          // Lightning snakes through the surviving strips, following their pull
          // rather than floating over the portal after the hull is gone.
          context.save();
          context.globalCompositeOperation = 'lighter';
          context.shadowColor = '#a13cff';
          context.shadowBlur = 18;
          for (let branch = 0; branch < 3; branch++) {
            context.beginPath();
            threads.forEach((piece, index) => {
              const px =
                piece.x + Math.sin(seconds * 23 + index * 4.7 + branch * 2) * piece.length * 0.32;
              if (index === 0) context.moveTo(px, piece.y);
              else {
                const previous = threads[index - 1];
                context.lineTo(
                  (px + previous.x) / 2 + Math.sin(seconds * 39 + index) * size * 0.06,
                  (piece.y + previous.y) / 2,
                );
                context.lineTo(px, piece.y);
              }
            });
            context.strokeStyle = branch === 0 ? '#f1cbff' : '#a350ff';
            context.lineWidth = branch === 0 ? 2 : 3;
            context.stroke();
          }
          context.restore();
        }
      }
      if (progress > 0.69 && progress < 0.82) {
        const flash = Math.sin(((progress - 0.69) / 0.13) * Math.PI);
        glow(context, width * 0.75, centerY, extent * 1.2 * flash, '#d4a7ff');
        context.fillStyle = `rgba(238,217,255,${flash * 0.65})`;
        context.fillRect(0, 0, width, height);
      }
    }
  } else if (scene === 'lamps') {
    const radius = extent * 0.3;
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
      const x = width / 2 + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const lit = options.lampsRelit && progress > index * 0.055 + 0.08;
      context.fillStyle = lit ? '#ffecc4' : '#373947';
      context.beginPath();
      context.arc(x, y, lit ? 5 : 3, 0, Math.PI * 2);
      context.fill();
      if (lit) glow(context, x, y, extent * 0.065, '#cfabff');
      if (progress > 0.6) {
        const lastAngle = ((index - 1) / 10) * Math.PI * 2 - Math.PI / 2;
        context.strokeStyle = '#9989c4';
        context.beginPath();
        context.moveTo(
          width / 2 + Math.cos(lastAngle) * radius,
          centerY + Math.sin(lastAngle) * radius,
        );
        context.lineTo(x, y);
        context.stroke();
      }
    }
    // Lamp ten lights at 0.575; the Table cannot arrive before the ring.
    if (progress > 0.64) {
      const arrival = Math.min(1, (progress - 0.64) / 0.16);
      const burst = Math.sin(arrival * Math.PI);
      glow(context, width / 2, centerY, extent * (0.09 + burst * 0.65), '#e2d0ff');
      context.fillStyle = `rgba(242,225,255,${burst * 0.6})`;
      context.fillRect(0, 0, width, height);
    }
  }
  const font = Math.max(24, Math.min(36, width / 38));
  context.font = `500 ${font}px sans-serif`;
  const lines = caption
    ? caption.split('\n').flatMap((line) => paragraphs(context, line, width * 0.94))
    : [];
  const top = height - 40 - lines.length * font * 1.45;
  context.fillStyle = 'rgba(0,0,0,0.72)';
  if (lines.length) context.fillRect(0, top - 18, width, height - top + 18);
  context.textAlign = 'center';
  context.fillStyle = '#f1ebff';
  lines.forEach((line, index) =>
    context.fillText(line, width / 2, top + font + index * font * 1.45),
  );
  context.font = '18px sans-serif';
  context.fillStyle = '#b7b1ce';
  if (label) context.fillText(label, width / 2, 42);
  const fade = Math.max(
    0,
    1 - progress * (scene === 'lamps' ? 24 : 8),
    scene === 'captain' ? 0 : (progress - 0.88) / 0.12,
  );
  context.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
  context.fillRect(0, 0, width, height);
}
