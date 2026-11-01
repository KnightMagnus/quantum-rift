import type { StarSystem, StellarBody } from '../shared/galaxy.ts';
type StationSite = { ops?: number } | null | undefined;
// Authored distant vistas. Decorative only: no moving orbits, collision or gravity changes.
import { drawStar } from './stars.ts';
import { artworkUrl } from './artwork.ts';
import { eventidePulse } from '../shared/eventide.ts';
const fullCircleRadians = Math.PI * 2;
const skies = new Map<string, HTMLCanvasElement>();
const landings = new Map<string, Promise<string | null>>();
function random(seed: string) {
  let state = 2166136261;
  for (const seed2 of seed) state = Math.imul(state ^ seed2.charCodeAt(0), 16777619);
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function ellipse(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  positionX: number,
  positionY: number,
  relativeX: number,
  relativeY: number,
  color: string,
  width = 1,
) {
  canvasRenderingContext2D.strokeStyle = color;
  canvasRenderingContext2D.lineWidth = width;
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.ellipse(
    positionX,
    positionY,
    relativeX,
    relativeY,
    0,
    0,
    fullCircleRadians,
  );
  canvasRenderingContext2D.stroke();
}
function glow(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  positionX: number,
  positionY: number,
  radius: number,
  color: string,
) {
  const canvasGradient = canvasRenderingContext2D.createRadialGradient(
    positionX,
    positionY,
    0,
    positionX,
    positionY,
    radius,
  );
  canvasGradient.addColorStop(0, color);
  canvasGradient.addColorStop(1, 'transparent');
  canvasRenderingContext2D.fillStyle = canvasGradient;
  canvasRenderingContext2D.fillRect(positionX - radius, positionY - radius, radius * 2, radius * 2);
}
function skyArt(kind: string, identifier: string) {
  const entryKey = kind + ':' + identifier;
  if (skies.has(entryKey)) return skies.get(entryKey)!;
  const htmlCanvasElement = document.createElement('canvas');
  htmlCanvasElement.width = 1100;
  htmlCanvasElement.height = 760;
  const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
    random2 = random(entryKey);
  canvasRenderingContext2D.translate(550, 380);
  if (kind === 'blackhole') {
    glow(canvasRenderingContext2D, 0, 0, 365, '#482037a0');
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.rotate(-0.23);
    // Hundreds of separately seeded dust streamlets form a stratified accretion disk.
    for (let index = 0; index < 280; index++) {
      const radius = 85 + random2() * 260;
      ellipse(
        canvasRenderingContext2D,
        0,
        0,
        radius,
        radius * 0.22,
        `rgba(255,${Math.floor(100 + random2() * 135)},${Math.floor(40 + random2() * 100)},${0.05 + random2() * 0.2})`,
        0.6 + random2() * 2,
      );
    }
    glow(canvasRenderingContext2D, 0, -100, 130, '#ffbe6c44');
    ellipse(canvasRenderingContext2D, 0, -26, 108, 104, '#ffdc9b99', 9);
    canvasRenderingContext2D.fillStyle = '#010106';
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(0, 0, 78, 0, fullCircleRadians);
    canvasRenderingContext2D.fill();
    ellipse(canvasRenderingContext2D, 0, 0, 80, 80, '#fff0bc', 2.5);
    // The near side passes in front of the dark silhouette, not through its center.
    for (let index = 0; index < 70; index++) {
      const radius = 95 + index * 3.1;
      canvasRenderingContext2D.strokeStyle = `rgba(255,${180 - index},90,${0.34 - index * 0.003})`;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.ellipse(0, 0, radius, radius * 0.22, 0, 0, Math.PI);
      canvasRenderingContext2D.stroke();
    }
    canvasRenderingContext2D.restore();
  } else if (kind === 'pulsar') {
    glow(canvasRenderingContext2D, 0, 0, 270, '#3263a944');
    // Broken hulls rather than identical sticks: tapered pressure vessels,
    // severed wings, exposed bays, panel seams and disconnected engine bells.
    for (let index = 0; index < 38; index++) {
      const angle = random2() * fullCircleRadians,
        radius = 110 + random2() * 205,
        scale = 0.35 + random2() * 0.8;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.65);
      canvasRenderingContext2D.rotate(angle + random2() * 1.2);
      canvasRenderingContext2D.scale(scale, scale);
      canvasRenderingContext2D.globalAlpha = 0.35 + random2() * 0.45;
      const hull = canvasRenderingContext2D.createLinearGradient(0, -13, 0, 13);
      hull.addColorStop(0, '#82919f');
      hull.addColorStop(0.35, '#435466');
      hull.addColorStop(1, '#111d2a');
      canvasRenderingContext2D.fillStyle = hull;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-32, -7);
      canvasRenderingContext2D.lineTo(-16, -12);
      canvasRenderingContext2D.lineTo(25, -9);
      canvasRenderingContext2D.lineTo(39, -2);
      canvasRenderingContext2D.lineTo(30, 6);
      canvasRenderingContext2D.lineTo(3, 12);
      canvasRenderingContext2D.lineTo(-24, 8);
      canvasRenderingContext2D.lineTo(-21, 1);
      canvasRenderingContext2D.lineTo(-32, -1);
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.strokeStyle = '#abb9c16e';
      canvasRenderingContext2D.lineWidth = 0.8;
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.fillStyle = '#1b2733';
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-13, -8);
      canvasRenderingContext2D.lineTo(-25, -24);
      canvasRenderingContext2D.lineTo(-3, -19);
      canvasRenderingContext2D.lineTo(8, -6);
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-7, 8);
      canvasRenderingContext2D.lineTo(-16, 22);
      canvasRenderingContext2D.lineTo(2, 18);
      canvasRenderingContext2D.lineTo(12, 7);
      canvasRenderingContext2D.closePath();
      canvasRenderingContext2D.fill();
      canvasRenderingContext2D.strokeStyle = '#72849388';
      for (let innerIndex = 0; innerIndex < 5; innerIndex++) {
        const pixelX = -18 + innerIndex * 9;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(pixelX, -7);
        canvasRenderingContext2D.lineTo(pixelX + 2, 6);
        canvasRenderingContext2D.stroke();
      }
      canvasRenderingContext2D.fillStyle = '#070d15';
      canvasRenderingContext2D.fillRect(-24, -4, 10, 7);
      canvasRenderingContext2D.fillRect(3, -3, 13, 5);
      canvasRenderingContext2D.fillStyle = '#9da6ae';
      canvasRenderingContext2D.fillRect(-36, -3, 4, 5);
      canvasRenderingContext2D.fillRect(-39, 4, 5, 3);
      canvasRenderingContext2D.fillStyle = '#b99d6f88';
      canvasRenderingContext2D.fillRect(23, -3, 4, 1);
      canvasRenderingContext2D.restore();
    }
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.rotate(-0.5);
    for (const sign of [-1, 1])
      for (let index = 0; index < 26; index++) {
        const positionY = (index - 13) * 0.7;
        const canvasGradient = canvasRenderingContext2D.createLinearGradient(0, 0, sign * 420, 0);
        canvasGradient.addColorStop(0, '#eaf8ff99');
        canvasGradient.addColorStop(0.2, '#78cfff44');
        canvasGradient.addColorStop(1, 'transparent');
        canvasRenderingContext2D.strokeStyle = canvasGradient;
        canvasRenderingContext2D.lineWidth = 1.5;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(0, positionY * 0.1);
        canvasRenderingContext2D.quadraticCurveTo(sign * 180, positionY, sign * 450, positionY * 3);
        canvasRenderingContext2D.stroke();
      }
    canvasRenderingContext2D.restore();
    glow(canvasRenderingContext2D, 0, 0, 46, '#b9eaff');
    glow(canvasRenderingContext2D, 0, 0, 12, '#ffffff');
  } else if (kind === 'rogue' || kind === 'shattered') {
    const broken = kind === 'shattered';
    glow(canvasRenderingContext2D, 0, 0, 245, broken ? '#ab62422a' : '#526bba20');
    // Disk surface uses seeded crater/mountain strokes, not a plain silhouette.
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(0, 0, 172, 0, fullCircleRadians);
    canvasRenderingContext2D.clip();
    const canvasGradient = canvasRenderingContext2D.createLinearGradient(-170, -130, 140, 160);
    canvasGradient.addColorStop(0, broken ? '#a38069' : '#3a526d');
    canvasGradient.addColorStop(0.55, broken ? '#403331' : '#111b30');
    canvasGradient.addColorStop(1, '#02040c');
    canvasRenderingContext2D.fillStyle = canvasGradient;
    canvasRenderingContext2D.fillRect(-175, -175, 350, 350);
    for (let index = 0; index < 1100; index++) {
      const positionX = (random2() - 0.5) * 350,
        positionY = (random2() - 0.5) * 350;
      canvasRenderingContext2D.strokeStyle = `rgba(160,175,184,${random2() * 0.08})`;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(positionX, positionY, 2 + random2() * 14, 0, fullCircleRadians);
      canvasRenderingContext2D.stroke();
    }
    if (broken) {
      canvasRenderingContext2D.strokeStyle = '#ffb45d';
      canvasRenderingContext2D.lineWidth = 3;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-50, -170);
      canvasRenderingContext2D.lineTo(10, -80);
      canvasRenderingContext2D.lineTo(-15, -10);
      canvasRenderingContext2D.lineTo(45, 35);
      canvasRenderingContext2D.lineTo(20, 175);
      canvasRenderingContext2D.stroke();
    }
    canvasRenderingContext2D.restore();
    ellipse(canvasRenderingContext2D, 0, 0, 173, 173, broken ? '#c68f6b55' : '#a8ceff66', 2);
    for (let index = 0; index < (broken ? 160 : 35); index++) {
      const firstValue = random2() * fullCircleRadians,
        radius = 195 + random2() * 150,
        positionX = Math.cos(firstValue) * radius,
        positionY = Math.sin(firstValue) * radius * 0.45;
      canvasRenderingContext2D.fillStyle = broken ? '#8e7971' : '#38516b';
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(firstValue);
      canvasRenderingContext2D.fillRect(0, 0, 2 + random2() * 9, 1 + random2() * 5);
      canvasRenderingContext2D.restore();
    }
  } else if (kind === 'observatory') {
    // Broken ancient interferometer arcs with suspended crystal receiver arrays.
    for (let index = 0; index < 5; index++) {
      canvasRenderingContext2D.strokeStyle = `rgba(137,198,221,${0.15 + index * 0.06})`;
      canvasRenderingContext2D.lineWidth = 2 + index;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.ellipse(0, 0, 170 + index * 25, 85 + index * 12, -0.3, 0.3, 5.6);
      canvasRenderingContext2D.stroke();
    }
    for (let index = 0; index < 28; index++) {
      const firstValue = (index / 28) * fullCircleRadians,
        positionX = Math.cos(firstValue) * 245,
        positionY = Math.sin(firstValue) * 125;
      canvasRenderingContext2D.save();
      canvasRenderingContext2D.translate(positionX, positionY);
      canvasRenderingContext2D.rotate(firstValue);
      canvasRenderingContext2D.fillStyle = '#446876';
      canvasRenderingContext2D.fillRect(-10, -5, 20, 10);
      canvasRenderingContext2D.fillStyle = '#9ae5f2';
      canvasRenderingContext2D.fillRect(-6, -1, 12, 2);
      canvasRenderingContext2D.restore();
    }
    glow(canvasRenderingContext2D, 0, 0, 60, '#4cf2e52b');
  }
  skies.set(entryKey, htmlCanvasElement);
  if (skies.size > 24) skies.delete(skies.keys().next().value!);
  return htmlCanvasElement;
}
export function drawExoticSky(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  system: StarSystem,
  positionX: number,
  positionY: number,
  radius: number,
  currentTime = 0,
) {
  const scene = system.scene;
  if (!scene) return;
  canvasRenderingContext2D.save();
  if (scene.kind === 'binary') {
    const radius2 = radius * 0.58;
    drawStar(
      canvasRenderingContext2D,
      { ...system, id: system.id + '-red' },
      { core: '255,225,184', halo: '255,95,48' },
      positionX - radius * 0.65,
      positionY + radius * 0.06,
      radius2,
      currentTime,
    );
    drawStar(
      canvasRenderingContext2D,
      { ...system, id: system.id + '-blue' },
      { core: '236,249,255', halo: '95,169,255' },
      positionX + radius * 0.8,
      positionY - radius * 0.18,
      radius2 * 0.78,
      currentTime,
    );
  } else {
    const htmlCanvasElement = skyArt(scene.kind, system.id),
      scale = (radius / 210) * (scene.scale || 1);
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.rotate(scene.rotation || 0);
    canvasRenderingContext2D.drawImage(
      htmlCanvasElement,
      -550 * scale,
      -380 * scale,
      1100 * scale,
      760 * scale,
    );
  }
  canvasRenderingContext2D.restore();
}
// Match all three flight-renderer branches: the unique hub, tiered personal hulls,
// and faction/authored stations. A hub must never inherit Personal Station artwork.
export function stationLandingSource(
  stellarBody: StellarBody,
  design: string | number,
  site?: StationSite,
) {
  if (stellarBody.hub) return artworkUrl('hub.png');
  if (stellarBody.site)
    return artworkUrl(`stations/${Math.max(0, Math.min(5, site?.ops || 0))}.png`);
  const landedDesigns = ['biodome', 'cylinder', 'crescent', 'bastion', 'refinery', 'relay', 'luna'];
  return artworkUrl(
    `stations/s_${design}${landedDesigns.includes(String(design)) ? '_landed' : ''}.webp`,
  );
}

// Landing variants render the same mesh and camera at higher resolution.
export function stationLanding(
  stellarBody: StellarBody,
  system: StarSystem,
  design: string | number,
  site?: StationSite,
) {
  const source = stationLandingSource(stellarBody, design, site);
  const entryKey = stellarBody.id + ':' + source + ':' + (system.scene?.kind || 'normal');
  if (landings.has(entryKey)) return landings.get(entryKey)!;
  const promise = new Promise<string | null>((resolve) => {
    const htmlImageElement = new Image();
    htmlImageElement.onload = () => {
      const htmlCanvasElement = document.createElement('canvas');
      htmlCanvasElement.width = 1200;
      htmlCanvasElement.height = 650;
      const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
        random2 = random(stellarBody.id);
      canvasRenderingContext2D.fillStyle = '#030712';
      canvasRenderingContext2D.fillRect(0, 0, 1200, 650);
      for (let index = 0; index < 400; index++) {
        canvasRenderingContext2D.fillStyle = `rgba(175,202,230,${0.15 + random2() * 0.6})`;
        canvasRenderingContext2D.fillRect(
          random2() * 1200,
          random2() * 650,
          1 + random2(),
          1 + random2(),
        );
      }
      if (system.scene) drawExoticSky(canvasRenderingContext2D, system, 830, 235, 155, 0);
      else {
        glow(canvasRenderingContext2D, 940, 130, 125, '#e8b26733');
        glow(canvasRenderingContext2D, 940, 130, 24, '#fff2ce');
      }
      const canvasGradient = canvasRenderingContext2D.createRadialGradient(
        120,
        740,
        40,
        120,
        740,
        460,
      );
      canvasGradient.addColorStop(0, '#1b334c');
      canvasGradient.addColorStop(0.92, '#183e5a');
      canvasGradient.addColorStop(0.96, '#5e9dc5');
      canvasGradient.addColorStop(1, 'transparent');
      canvasRenderingContext2D.fillStyle = canvasGradient;
      canvasRenderingContext2D.fillRect(0, 280, 620, 370);
      const size = stellarBody.hub ? 560 : stellarBody.site ? 480 : 380;
      // The landing card crops wide panoramas on narrow windows; keep the
      // complete station silhouette within its central safe area.
      if (stellarBody.hub) {
        const frame = htmlImageElement.naturalWidth / 6;
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          0,
          0,
          frame,
          frame,
          600 - size / 2,
          320 - size / 2,
          size,
          size,
        );
      } else
        canvasRenderingContext2D.drawImage(
          htmlImageElement,
          600 - size / 2,
          320 - size / 2,
          size,
          size,
        );
      resolve(htmlCanvasElement.toDataURL('image/png'));
    };
    htmlImageElement.onerror = () => {
      // A transient failure must not poison this station's cached landing forever.
      landings.delete(entryKey);
      resolve(null);
    };
    htmlImageElement.src = source;
  });
  landings.set(entryKey, promise);
  if (landings.size > 24) landings.delete(landings.keys().next().value!);
  return promise;
}

// Explicitly marked, bounded flight-space zone; the server owns damage and timing.
export function drawPulseBoundary(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  system: StarSystem,
  screenX: (positionX: number) => number,
  screenY: (positionY: number) => number,
  zoom: number,
) {
  const hazardDefinition = system.scene?.hazard;
  if (!hazardDefinition) return;
  const positionX = screenX(hazardDefinition.x),
    positionY = screenY(hazardDefinition.y),
    radius = hazardDefinition.r * zoom;
  canvasRenderingContext2D.save();
  const phase = eventidePulse(hazardDefinition, Date.now() / 1000);
  canvasRenderingContext2D.strokeStyle =
    phase === 'active' ? '#ff7979cc' : phase === 'warning' ? '#ffcb72cc' : '#e9af6855';
  canvasRenderingContext2D.lineWidth = 1.5;
  canvasRenderingContext2D.setLineDash([9, 10]);
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.arc(positionX, positionY, radius, 0, fullCircleRadians);
  canvasRenderingContext2D.stroke();
  canvasRenderingContext2D.setLineDash([]);
  canvasRenderingContext2D.font = '12px Tahoma';
  canvasRenderingContext2D.textAlign = 'center';
  canvasRenderingContext2D.fillStyle = '#f4c183';
  canvasRenderingContext2D.fillText(
    `PULSAR ${phase.toUpperCase()} · shield drain only`,
    positionX,
    positionY - radius - 12,
  );
  canvasRenderingContext2D.restore();
}
