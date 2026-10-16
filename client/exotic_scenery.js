// Authored distant vistas. Decorative only: no moving orbits, collision or gravity changes.
import { drawStar } from './stars.js';
import { artworkUrl } from './artwork.js';
import { eventidePulse } from '/shared/eventide.js';
const TAU = Math.PI * 2;
const skies = new Map();
const landings = new Map();
function random(seed) {
  let s = 2166136261;
  for (const c of seed) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function ellipse(ctx, x, y, rx, ry, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.stroke();
}
function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function skyArt(kind, id) {
  const key = kind + ':' + id;
  if (skies.has(key)) return skies.get(key);
  const c = document.createElement('canvas');
  c.width = 1100;
  c.height = 760;
  const ctx = c.getContext('2d'),
    rnd = random(key);
  ctx.translate(550, 380);
  if (kind === 'blackhole') {
    glow(ctx, 0, 0, 365, '#482037a0');
    ctx.save();
    ctx.rotate(-0.23);
    // Hundreds of separately seeded dust streamlets form a stratified accretion disk.
    for (let i = 0; i < 280; i++) {
      const r = 85 + rnd() * 260;
      ellipse(
        ctx,
        0,
        0,
        r,
        r * 0.22,
        `rgba(255,${Math.floor(100 + rnd() * 135)},${Math.floor(40 + rnd() * 100)},${0.05 + rnd() * 0.2})`,
        0.6 + rnd() * 2,
      );
    }
    glow(ctx, 0, -100, 130, '#ffbe6c44');
    ellipse(ctx, 0, -26, 108, 104, '#ffdc9b99', 9);
    ctx.fillStyle = '#010106';
    ctx.beginPath();
    ctx.arc(0, 0, 78, 0, TAU);
    ctx.fill();
    ellipse(ctx, 0, 0, 80, 80, '#fff0bc', 2.5);
    // The near side passes in front of the dark silhouette, not through its center.
    for (let i = 0; i < 70; i++) {
      const r = 95 + i * 3.1;
      ctx.strokeStyle = `rgba(255,${180 - i},90,${0.34 - i * 0.003})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.22, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  } else if (kind === 'pulsar') {
    glow(ctx, 0, 0, 270, '#3263a944');
    // Broken hulls rather than identical sticks: tapered pressure vessels,
    // severed wings, exposed bays, panel seams and disconnected engine bells.
    for (let i = 0; i < 38; i++) {
      const angle = rnd() * TAU,
        r = 110 + rnd() * 205,
        scale = 0.35 + rnd() * 0.8;
      ctx.save();
      ctx.translate(Math.cos(angle) * r, Math.sin(angle) * r * 0.65);
      ctx.rotate(angle + rnd() * 1.2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.35 + rnd() * 0.45;
      const hull = ctx.createLinearGradient(0, -13, 0, 13);
      hull.addColorStop(0, '#82919f');
      hull.addColorStop(0.35, '#435466');
      hull.addColorStop(1, '#111d2a');
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(-32, -7);
      ctx.lineTo(-16, -12);
      ctx.lineTo(25, -9);
      ctx.lineTo(39, -2);
      ctx.lineTo(30, 6);
      ctx.lineTo(3, 12);
      ctx.lineTo(-24, 8);
      ctx.lineTo(-21, 1);
      ctx.lineTo(-32, -1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#abb9c16e';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = '#1b2733';
      ctx.beginPath();
      ctx.moveTo(-13, -8);
      ctx.lineTo(-25, -24);
      ctx.lineTo(-3, -19);
      ctx.lineTo(8, -6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 8);
      ctx.lineTo(-16, 22);
      ctx.lineTo(2, 18);
      ctx.lineTo(12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#72849388';
      for (let j = 0; j < 5; j++) {
        const px = -18 + j * 9;
        ctx.beginPath();
        ctx.moveTo(px, -7);
        ctx.lineTo(px + 2, 6);
        ctx.stroke();
      }
      ctx.fillStyle = '#070d15';
      ctx.fillRect(-24, -4, 10, 7);
      ctx.fillRect(3, -3, 13, 5);
      ctx.fillStyle = '#9da6ae';
      ctx.fillRect(-36, -3, 4, 5);
      ctx.fillRect(-39, 4, 5, 3);
      ctx.fillStyle = '#b99d6f88';
      ctx.fillRect(23, -3, 4, 1);
      ctx.restore();
    }
    ctx.save();
    ctx.rotate(-0.5);
    for (const sign of [-1, 1])
      for (let i = 0; i < 26; i++) {
        const y = (i - 13) * 0.7;
        const g = ctx.createLinearGradient(0, 0, sign * 420, 0);
        g.addColorStop(0, '#eaf8ff99');
        g.addColorStop(0.2, '#78cfff44');
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y * 0.1);
        ctx.quadraticCurveTo(sign * 180, y, sign * 450, y * 3);
        ctx.stroke();
      }
    ctx.restore();
    glow(ctx, 0, 0, 46, '#b9eaff');
    glow(ctx, 0, 0, 12, '#ffffff');
  } else if (kind === 'rogue' || kind === 'shattered') {
    const broken = kind === 'shattered';
    glow(ctx, 0, 0, 245, broken ? '#ab62422a' : '#526bba20');
    // Disk surface uses seeded crater/mountain strokes, not a plain silhouette.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 172, 0, TAU);
    ctx.clip();
    const g = ctx.createLinearGradient(-170, -130, 140, 160);
    g.addColorStop(0, broken ? '#a38069' : '#3a526d');
    g.addColorStop(0.55, broken ? '#403331' : '#111b30');
    g.addColorStop(1, '#02040c');
    ctx.fillStyle = g;
    ctx.fillRect(-175, -175, 350, 350);
    for (let i = 0; i < 1100; i++) {
      const x = (rnd() - 0.5) * 350,
        y = (rnd() - 0.5) * 350;
      ctx.strokeStyle = `rgba(160,175,184,${rnd() * 0.08})`;
      ctx.beginPath();
      ctx.arc(x, y, 2 + rnd() * 14, 0, TAU);
      ctx.stroke();
    }
    if (broken) {
      ctx.strokeStyle = '#ffb45d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-50, -170);
      ctx.lineTo(10, -80);
      ctx.lineTo(-15, -10);
      ctx.lineTo(45, 35);
      ctx.lineTo(20, 175);
      ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, 0, 0, 173, 173, broken ? '#c68f6b55' : '#a8ceff66', 2);
    for (let i = 0; i < (broken ? 160 : 35); i++) {
      const a = rnd() * TAU,
        r = 195 + rnd() * 150,
        x = Math.cos(a) * r,
        y = Math.sin(a) * r * 0.45;
      ctx.fillStyle = broken ? '#8e7971' : '#38516b';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(0, 0, 2 + rnd() * 9, 1 + rnd() * 5);
      ctx.restore();
    }
  } else if (kind === 'observatory') {
    // Broken ancient interferometer arcs with suspended crystal receiver arrays.
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(137,198,221,${0.15 + i * 0.06})`;
      ctx.lineWidth = 2 + i;
      ctx.beginPath();
      ctx.ellipse(0, 0, 170 + i * 25, 85 + i * 12, -0.3, 0.3, 5.6);
      ctx.stroke();
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU,
        x = Math.cos(a) * 245,
        y = Math.sin(a) * 125;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = '#446876';
      ctx.fillRect(-10, -5, 20, 10);
      ctx.fillStyle = '#9ae5f2';
      ctx.fillRect(-6, -1, 12, 2);
      ctx.restore();
    }
    glow(ctx, 0, 0, 60, '#4cf2e52b');
  }
  skies.set(key, c);
  if (skies.size > 24) skies.delete(skies.keys().next().value);
  return c;
}
export function drawExoticSky(ctx, system, x, y, radius, now = 0) {
  const scene = system.scene;
  if (!scene) return;
  ctx.save();
  if (scene.kind === 'binary') {
    const r = radius * 0.58;
    drawStar(
      ctx,
      { ...system, id: system.id + '-red' },
      { core: '255,225,184', halo: '255,95,48' },
      x - radius * 0.65,
      y + radius * 0.06,
      r,
      now,
    );
    drawStar(
      ctx,
      { ...system, id: system.id + '-blue' },
      { core: '236,249,255', halo: '95,169,255' },
      x + radius * 0.8,
      y - radius * 0.18,
      r * 0.78,
      now,
    );
  } else {
    const c = skyArt(scene.kind, system.id),
      scale = (radius / 210) * (scene.scale || 1);
    ctx.translate(x, y);
    ctx.rotate(scene.rotation || 0);
    ctx.drawImage(c, -550 * scale, -380 * scale, 1100 * scale, 760 * scale);
  }
  ctx.restore();
}
// Use the very same station silhouette as flight, avoiding unrelated stock landscapes.
export function stationLanding(p, system, design) {
  const key = p.id + ':' + design + ':' + (system.scene?.kind || 'normal');
  if (landings.has(key)) return landings.get(key);
  const promise = new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 650;
      const ctx = c.getContext('2d'),
        rnd = random(p.id);
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, 1200, 650);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(175,202,230,${0.15 + rnd() * 0.6})`;
        ctx.fillRect(rnd() * 1200, rnd() * 650, 1 + rnd(), 1 + rnd());
      }
      if (system.scene) drawExoticSky(ctx, system, 830, 235, 155, 0);
      else {
        glow(ctx, 940, 130, 125, '#e8b26733');
        glow(ctx, 940, 130, 24, '#fff2ce');
      }
      const g = ctx.createRadialGradient(120, 740, 40, 120, 740, 460);
      g.addColorStop(0, '#1b334c');
      g.addColorStop(0.92, '#183e5a');
      g.addColorStop(0.96, '#5e9dc5');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 280, 620, 370);
      const size = 380;
      ctx.drawImage(im, 360 - size / 2, 320 - size / 2, size, size);
      resolve(c.toDataURL('image/png'));
    };
    im.onerror = () => resolve(null);
    im.src = artworkUrl(`stations/s_${design}.webp`);
  });
  landings.set(key, promise);
  if (landings.size > 24) landings.delete(landings.keys().next().value);
  return promise;
}

// Explicitly marked, bounded flight-space zone; the server owns damage and timing.
export function drawPulseBoundary(ctx, system, sx, sy, zoom) {
  const h = system.scene?.hazard;
  if (!h) return;
  const x = sx(h.x),
    y = sy(h.y),
    r = h.r * zoom;
  ctx.save();
  const phase = eventidePulse(h, Date.now() / 1000);
  ctx.strokeStyle =
    phase === 'active' ? '#ff7979cc' : phase === 'warning' ? '#ffcb72cc' : '#e9af6855';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '12px Tahoma';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4c183';
  ctx.fillText(`PULSAR ${phase.toUpperCase()} · shield drain only`, x, y - r - 12);
  ctx.restore();
}
