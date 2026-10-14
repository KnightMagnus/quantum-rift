// Quantum Rift renderer: starfield, stellars, ships (EV Quantum sprite sheets), shots, beams, effects, radar.
import { planetSprite } from './planets.js';
import { missionTargets } from './missions.js';
import { ANOMALIES } from '/shared/fronts.js';
import { SYS, FACTIONS, COMMODITIES } from '/shared/galaxy.js';
import { weaponParams, BEAM_COLORS, weaponColor, weaponLook, price } from '/shared/rules.js';
// 1.2 map views (after Endless Sky's map modes): colour each system by trade price, services, your standing, or danger
const lerpC = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`;
export function tradeRatio(s, cid) { const ps = s.stellars.filter(p => p.svc && p.svc.includes('T') && !p.site); if (!ps.length) return null; const base = COMMODITIES.find(c => c.id === cid).base; let best = null; for (const p of ps) { const v = price(p, cid); if (v !== null && (best === null || v < best)) best = v; } return best === null ? null : best / base; }
function viewColor(G, s, seen) {
  const mode = G.mapMode || 'factions'; if (mode === 'factions') return FACTIONS[s.faction].color;
  if (!seen) return '#2a2e38';
  if (mode === 'trade') { const r = tradeRatio(s, G.mapCid || 'food'); return r === null ? '#3a3e48' : r < 1 ? lerpC([240, 220, 90], [60, 230, 110], (1 - r) / 0.25) : lerpC([240, 220, 90], [255, 80, 60], (r - 1) / 0.25); }
  if (mode === 'services') { const y = s.stellars.some(p => p.svc && p.svc.includes('Y')), o = s.stellars.some(p => p.svc && p.svc.includes('O')); return y && o ? '#c38aff' : y ? '#5ab0ff' : o ? '#ffaa4a' : '#3a3e48'; }
  if (mode === 'standing') { const F = FACTIONS[s.faction]; if (F.region) return '#5a5e68'; const rep = (G.you && G.you.rep[s.faction]) || 0; return rep >= 0 ? lerpC([200, 200, 120], [60, 230, 110], rep / 60) : lerpC([200, 200, 120], [255, 60, 50], -rep / 60); }
  if (mode === 'danger') return lerpC([90, 200, 120], [255, 50, 40], s.danger / 6);
  return FACTIONS[s.faction].color;
}

const FAC = Object.keys(FACTIONS);
const wormImg = new Image(); wormImg.src = 'assets/wormhole.png';
const sheets = new Map();
export function sheet(hull, glow) {
  const k = hull + (glow ? 'g' : '');
  if (!sheets.has(k)) { const im = new Image(); im.src = `assets/ships/${hull}${glow ? '_glow' : ''}.png`; sheets.set(k, im); }
  return sheets.get(k);
}
const stationImgs = [0, 1, 2, 3, 4, 5].map(k => { const im = new Image(); im.src = `assets/stations/${k}.png`; return im; });
const hubImg = new Image(); hubImg.src = 'assets/hub.png';
const HUB_FRAMES = 18, HUB_PERIOD = 150;   // seconds for one full turn

function seeded(seed) { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hashStr(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ------------------------------------------------------------------ backdrops
const starCache = new Map();
function stars(sysId) {
  if (starCache.has(sysId)) return starCache.get(sysId);
  const r = seeded(hashStr(sysId)), layers = [];
  for (const [n, depth, size] of [[260, 0.15, 1], [160, 0.35, 1.3], [70, 0.6, 1.8]]) {
    const L = []; for (let i = 0; i < n; i++) L.push([r() * 2048, r() * 2048, 0.35 + r() * 0.65, r()]);
    layers.push({ L, depth, size });
  }
  const neb = []; for (let i = 0; i < 4; i++) neb.push([r() * 6000 - 3000, r() * 6000 - 3000, 900 + r() * 1600, r()]);
  const v = { layers, neb }; starCache.set(sysId, v); return v;
}
const planetCache = new Map();
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function planetImage(p) {
  if (planetCache.has(p.id)) return planetCache.get(p.id);
  const R = p.r, S = Math.ceil(R * 2.6), c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), cx = S / 2, cy = S / 2, [r0, g0, b0] = hexToRgb(p.color || '#888'), rnd = seeded(hashStr(p.id));
  if (p.kind === 'station') {
    g.translate(cx, cy);
    const ring = (rad, w, col) => { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
    ring(R * 0.92, R * 0.16, `rgb(${r0 * 0.6},${g0 * 0.6},${b0 * 0.6})`); ring(R * 0.92, R * 0.05, `rgb(${Math.min(255, r0 + 60)},${Math.min(255, g0 + 60)},${Math.min(255, b0 + 60)})`);
    for (let k = 0; k < 6; k++) { g.save(); g.rotate(k * Math.PI / 3 + rnd()); g.fillStyle = `rgb(${r0 * 0.5},${g0 * 0.5},${b0 * 0.5})`; g.fillRect(-R * 0.05, 0, R * 0.1, R * 0.86); g.restore(); }
    const hub = g.createRadialGradient(-R * 0.1, -R * 0.1, 2, 0, 0, R * 0.4); hub.addColorStop(0, `rgb(${Math.min(255, r0 + 80)},${Math.min(255, g0 + 80)},${Math.min(255, b0 + 80)})`); hub.addColorStop(1, `rgb(${r0 * 0.3},${g0 * 0.3},${b0 * 0.3})`);
    g.beginPath(); g.arc(0, 0, R * 0.38, 0, Math.PI * 2); g.fillStyle = hub; g.fill();
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.fillStyle = rnd() < 0.5 ? '#ffd88a' : '#9cf'; g.fillRect(Math.cos(a) * R * 0.92 - 1.5, Math.sin(a) * R * 0.92 - 1.5, 3, 3); }
  } else {
    const grd = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    grd.addColorStop(0, `rgb(${Math.min(255, r0 + 70)},${Math.min(255, g0 + 70)},${Math.min(255, b0 + 70)})`); grd.addColorStop(0.7, `rgb(${r0},${g0},${b0})`); grd.addColorStop(1, `rgb(${r0 * 0.25},${g0 * 0.25},${b0 * 0.25})`);
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = grd; g.fill(); g.clip();
    for (let k = 0; k < 14; k++) {   // cloud bands / continents
      g.globalAlpha = 0.08 + rnd() * 0.12; g.fillStyle = rnd() < 0.5 ? '#fff' : `rgb(${r0 * 0.5},${g0 * 0.5},${b0 * 0.5})`;
      g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * R * 1.6, cy + (rnd() - 0.5) * R * 1.8, R * (0.2 + rnd() * 0.6), R * (0.05 + rnd() * 0.15), (rnd() - 0.5) * 0.6, 0, Math.PI * 2); g.fill();
    }
    if (p.id === 'earth') {   // Earth gets green-brown continents and white cloud swirls
      for (let k = 0; k < 9; k++) { g.globalAlpha = 0.9; g.fillStyle = rnd() < 0.7 ? '#4f7a3a' : '#8a7a4a'; g.beginPath(); const ex = cx + (rnd() - 0.5) * R * 1.5, ey = cy + (rnd() - 0.5) * R * 1.5;
        for (let j = 0; j < 7; j++) { const a2 = j / 7 * Math.PI * 2, rr = R * (0.12 + rnd() * 0.22); g[j ? 'lineTo' : 'moveTo'](ex + Math.cos(a2) * rr * 1.4, ey + Math.sin(a2) * rr); } g.closePath(); g.fill(); }
      for (let k = 0; k < 10; k++) { g.globalAlpha = 0.45; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * R * 1.7, cy + (rnd() - 0.5) * R * 1.7, R * (0.15 + rnd() * 0.4), R * (0.03 + rnd() * 0.06), (rnd() - 0.5) * 0.8, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    const sh = g.createRadialGradient(cx - R * 0.6, cy - R * 0.6, R * 0.6, cx, cy, R * 1.25); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S); g.restore();
    const atm = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.15); atm.addColorStop(0, `rgba(${r0},${g0},${b0},0.35)`); atm.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = atm; g.beginPath(); g.arc(cx, cy, R * 1.2, 0, Math.PI * 2); g.fill();
  }
  planetCache.set(p.id, c); return c;
}

// ------------------------------------------------------------------ effects
export const fx = [];
export function boom(x, y, size) {
  size = Math.max(20, size || 40);
  const n = Math.min(70, 14 + size / 3);
  fx.push({ x, y, ball: true, life: 0.55 + size / 600, max: 0.55 + size / 600, r: size * 0.75 });                       // fireball
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 30 + Math.random() * (60 + size); fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.9, max: 1.4, c: Math.random() < 0.5 ? '#ffd27a' : '#ff6a3a', s: 1 + Math.random() * 2.5 }); }
  for (let i = 0; i < Math.min(14, 3 + size / 25); i++) { const a = Math.random() * 6.283, v = 20 + Math.random() * 60; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, smoke: true, life: 1.2 + Math.random(), max: 2.2, r: 8 + size * 0.15 }); }
  for (let i = 0; i < Math.min(10, 2 + size / 30); i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 120; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, debris: true, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: 1.5 + Math.random(), max: 2.5, s: 2 + Math.random() * size / 40 }); }
  fx.push({ x, y, ring: true, life: 0.5, max: 0.5, r: size * 1.1, c: '#fff1c0' });
  if (size > 120) fx.push({ x, y, ring: true, life: 0.9, max: 0.9, r: size * 2, c: '#ffb070' });
}
export function spark(x, y, col) { for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 90; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, max: 0.25, c: col || '#fff', s: 1.6 }); } }
export function flash(x, y) { fx.push({ x, y, ring: true, life: 0.6, max: 0.6, r: 90, c: '#cfe8ff', fill: true }); }
export function blast(x, y, r) { fx.push({ x, y, ring: true, life: 0.35, max: 0.35, r, c: '#ffcf8a' }); }
// shield shimmer on the ship that was hit, and floating damage numbers
export const shieldHits = new Map();
export function shieldHit(id, x, y) { shieldHits.set(id, { t: 0.35, hx: x, hy: y }); }
export function dmgNumber(x, y, n, mine) { if (n < 1) return; fx.push({ x: x + (Math.random() - 0.5) * 16, y, vx: 0, vy: -45, num: Math.round(n), mine, life: 0.9, max: 0.9 }); }
export let shake = 0;
export const cam = { cx: 0, cy: 0, z: 1, W: 1, H: 1 };
export function addShake(k) { shake = Math.max(shake, k); }

// projectile drawing by look
function drawShot(ctx, s, x, y, z, now) {
  const W_ = s.W, col = s.col, look = s.look, sp = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / sp, uy = s.vy / sp;
  const zz = Math.max(0.7, z);
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  switch (look) {
    case 'rail': {
      const L = 26 * z; ctx.strokeStyle = col; ctx.lineWidth = 2 * zz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L * 0.6, y - uy * L * 0.6); ctx.stroke(); break;
    }
    case 'pulse': case 'spit': case 'magma': case 'mining': {
      const r = (look === 'magma' ? 4.5 : look === 'spit' ? 3.5 : 3) * zz;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.283); ctx.fill();
      if (look === 'magma' && Math.random() < 0.5) fx.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.35, max: 0.35, c: '#ff8a30', s: 1.6 });
      break;
    }
    case 'missile': case 'rocket': {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2.5 * zz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 7 * z, y - uy * 7 * z); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - ux * 8 * z, y - uy * 8 * z, 2.2 * zz, 0, 6.283); ctx.fill();
      if (Math.random() < 0.8) fx.push({ x: s.x - ux * 8, y: s.y - uy * 8, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, smoke: true, life: 0.6, max: 0.6, r: 3 });
      break;
    }
    case 'torp': case 'sing': {
      const pulse = 1 + 0.25 * Math.sin(now / 70), r = (look === 'sing' ? 8 : 6) * zz * pulse;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, '#fff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 6.283); ctx.fill();
      if (look === 'sing') { ctx.fillStyle = '#05000a'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#c090ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 1.1, now / 200, now / 200 + 4.5); ctx.stroke(); }
      if (Math.random() < 0.6) fx.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.4, max: 0.4, c: col, s: 2.2 });
      break;
    }
    case 'mine': {
      const on = Math.floor(now / 300) % 2; ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x, y, 4 * zz, 0, 6.283); ctx.fill();
      ctx.fillStyle = on ? '#ff3a2a' : '#401010'; ctx.beginPath(); ctx.arc(x, y, 1.8 * zz, 0, 6.283); ctx.fill(); break;
    }
    case 'flak': {
      ctx.fillStyle = col; for (let k = 0; k < 3; k++) { const o = (k - 1) * 3 * z; ctx.fillRect(x - uy * o - 1.5, y + ux * o - 1.5, 3 * zz, 3 * zz); } break;
    }
    case 'pd': { ctx.strokeStyle = col; ctx.lineWidth = 1.5 * zz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 5 * z, y - uy * 5 * z); ctx.stroke(); break; }
    case 'shard': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(now / 90); ctx.fillStyle = col; const r = 4.5 * zz;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.55, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.55, 0); ctx.closePath(); ctx.fill(); ctx.restore(); break;
    }
    default: {   // bolt: glowing streak with a white core
      const big = W_ && (W_.dmgA + W_.dmgS) > 40, L = (big ? 14 : 10) * z;
      ctx.strokeStyle = col; ctx.lineWidth = (big ? 4 : 2.6) * zz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1 * zz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L * 0.7, y - uy * L * 0.7); ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ mining fields
const rockCache = new Map();
function rockImage(k) {
  const key = k.id; if (rockCache.has(key)) return rockCache.get(key);
  const R = k.r, S = Math.ceil(R * 2.6), c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rnd = seeded(k.id * 7919 + 13), cx = S / 2, cy = S / 2;
  if (k.ore === 'gas') {   // a glowing pocket of volatile gas
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, d = rnd() * R * 0.5, r = R * (0.5 + rnd() * 0.5), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(140,255,200,0.35)'); gr.addColorStop(0.6, 'rgba(60,170,160,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
  } else if (k.ore === 'shards') {   // a cluster of violet crystal
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, L = R * (0.6 + rnd() * 0.6), w = R * (0.14 + rnd() * 0.12), bx = cx + Math.cos(a + 1.6) * rnd() * R * 0.25, by = cy + Math.sin(a + 1.6) * rnd() * R * 0.25;
      g.save(); g.translate(bx, by); g.rotate(a);
      const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, '#5a3a8a'); gr.addColorStop(0.5, '#e0c0ff'); gr.addColorStop(1, '#7a50b0');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-w, 0); g.lineTo(0, -L); g.lineTo(w, 0); g.lineTo(0, w * 0.6); g.closePath(); g.fill(); g.restore();
    }
  } else {   // a lumpy grey-brown asteroid
    const n = 11, pts = []; for (let i = 0; i < n; i++) { const a = i / n * 6.283, r = R * (0.72 + rnd() * 0.32); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    const gr = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1); gr.addColorStop(0, '#9a8e80'); gr.addColorStop(0.7, '#5a524a'); gr.addColorStop(1, '#2a2622');
    g.fillStyle = gr; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) { const x = cx + (rnd() - 0.5) * R, y = cy + (rnd() - 0.5) * R, r = R * (0.08 + rnd() * 0.12); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.6, 0, 6.283); g.fill(); }
    for (let i = 0; i < 4; i++) { g.fillStyle = '#c9a85a'; g.fillRect(cx + (rnd() - 0.5) * R, cy + (rnd() - 0.5) * R, 2, 2); }
  }
  rockCache.set(key, c); return c;
}
const LOOT_COL = ['#ffd27a', '#7ad0ff', '#b0a090', '#8affc8', '#d0a0ff', '#ff5ae0'];   // 5: hostile loot chest

// ------------------------------------------------------------------ main draw
export function draw(G, ctx, W, H, dt, now) {
  const me = G.view, z = G.zoom, S = SYS[G.sys];
  let cx = me ? me.rx : 0, cy = me ? me.ry : 0;
  Object.assign(cam, { cx, cy, z, W, H });   // un-shaken camera, used for mouse picking
  if (shake && G.opts && G.opts.shake !== false) { cx += (Math.random() - 0.5) * shake * 2 / z; cy += (Math.random() - 0.5) * shake * 2 / z; }
  const sx = (x) => (x - cx) * z + W / 2, sy = (y) => (y - cy) * z + H / 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!S) return;
  const st = stars(S.id), fcol = hexToRgb(FACTIONS[S.faction].color);
  for (const [nx, ny, nr, k] of st.neb) {   // faint nebulae in the faction's colour
    const x = sx(nx * 0.4 + cx * 0.6), y = sy(ny * 0.4 + cy * 0.6), r = nr * z * 0.6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${fcol[0]},${fcol[1]},${fcol[2]},${0.05 + k * 0.05})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const { L, depth, size } of st.layers) {
    for (const [x0, y0, b, tw] of L) {
      let x = (x0 - cx * depth) % 2048, y = (y0 - cy * depth) % 2048; if (x < 0) x += 2048; if (y < 0) y += 2048;
      for (let ox = x; ox < W + 2048; ox += 2048) for (let oy = y; oy < H + 2048; oy += 2048) {
        if (ox > W || oy > H) continue;
        const v = Math.round(255 * b * (0.85 + 0.15 * Math.sin(now / 700 + tw * 20))); ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`; ctx.fillRect(ox, oy, size, size);
      }
    }
  }
  // stellars
  let P_;
  for (const p of S.stellars) {
    const x = sx(p.x), y = sy(p.y); if (x < -p.r * 3 * z || y < -p.r * 3 * z || x > W + p.r * 3 * z || y > H + p.r * 3 * z) continue;
    let label = p.name;
    if (p.wormhole) {   // the Sol Gateway: the mod's animated vortex, slowly turning
      if (wormImg.complete && wormImg.naturalWidth) { const f = Math.floor(now / 55) % 32, fs = wormImg.naturalWidth / 8, s = p.r * 2.6 * z;
        ctx.save(); ctx.translate(x, y); ctx.rotate(now / 9000); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(wormImg, (f % 8) * fs, Math.floor(f / 8) * fs, fs, fs, -s / 2, -s / 2, s, s); ctx.restore(); }
    } else if (p.hub) {   // the Quantum Station hub turns slowly; neighbouring frames are cross-faded so the rotation is smooth
      if (hubImg.complete && hubImg.naturalWidth) {
        const fs = hubImg.naturalWidth / 6, s = p.r * 2.13 * z, t = (now / 1000) / HUB_PERIOD * HUB_FRAMES, f0 = Math.floor(t) % HUB_FRAMES, f1 = (f0 + 1) % HUB_FRAMES, k = t - Math.floor(t);
        ctx.drawImage(hubImg, (f0 % 6) * fs, Math.floor(f0 / 6) * fs, fs, fs, x - s / 2, y - s / 2, s, s);
        ctx.globalAlpha = k; ctx.drawImage(hubImg, (f1 % 6) * fs, Math.floor(f1 / 6) * fs, fs, fs, x - s / 2, y - s / 2, s, s); ctx.globalAlpha = 1;
      }
    } else if (p.site) {
      const st = G.sites && G.sites[p.id], ops = st ? st.ops : 0, im = stationImgs[ops];
      if (im.complete && im.naturalWidth) { const s = p.r * (2.2 + ops * 0.25) * z; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(im, x - s / 2, y - s / 2, s, s); ctx.globalCompositeOperation = 'source-over'; }
      label = st ? `${st.owner}'s Personal Station · Ops ${ops}` : 'Derelict Station Hull (unclaimed)';
    } else if ((p.kind === 'planet' || p.kind === 'moon') && (P_ = planetSprite(p, now))) { const w = P_.S * P_.scale * z; ctx.drawImage(P_.canvas, x - w / 2, y - w / 2, w, w); }   // 1.0.1: procedural planets (old art until built)
    else { const im = planetImage(p); ctx.drawImage(im, x - im.width * z / 2, y - im.height * z / 2, im.width * z, im.height * z); }
    if (G.hoverStellar === p.id && G.navStellar !== p.id) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(x, y, p.r * z * 1.15 + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (G.navStellar === p.id) { ctx.strokeStyle = 'rgba(120,200,255,.6)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, y, p.r * z * 1.15 + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(210,220,240,.8)'; ctx.font = '13px Tahoma'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + p.r * z + (p.hub ? -p.r * z * 0.25 : 18));
    const colOwner = G.world && G.world.colonies && G.world.colonies[p.id]; if (colOwner) { ctx.fillStyle = '#ffd27a'; ctx.font = '12px Tahoma'; ctx.fillText(`${colOwner}'s colony`, x, y + p.r * z + 34); }
  }
  // asteroids, gas pockets and crystal clusters
  for (const k of G.rocks || []) {
    if (!k.hp) continue; const x = sx(k.x), y = sy(k.y), R = k.r * z; if (x < -R * 2 || y < -R * 2 || x > W + R * 2 || y > H + R * 2) continue;
    const im = rockImage(k), s2 = im.width * z; ctx.save(); ctx.translate(x, y); ctx.rotate((now / 1000) * (k.ore === 'gas' ? 0.05 : 0.12) * ((k.id % 2) ? 1 : -1) + k.id);
    ctx.globalAlpha = 0.45 + 0.55 * k.hp / 100; if (k.ore === 'gas') ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(im, -s2 / 2, -s2 / 2, s2, s2); ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (k.hp < 100 && k.hp > 0) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - R * 0.6, y + R + 4, R * 1.2, 3); ctx.fillStyle = '#e8c070'; ctx.fillRect(x - R * 0.6, y + R + 4, R * 1.2 * k.hp / 100, 3); }
  }
  // survey points for an active survey job here
  for (const [px_, py_] of surveyPoints(G)) { const x = sx(px_), y = sy(py_); ctx.strokeStyle = 'rgba(90,216,255,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.arc(x, y, 450 * z, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5ad8ff'; ctx.font = '12px Tahoma'; ctx.textAlign = 'center'; ctx.fillText('SURVEY POINT', x, y); }
  // loot: credits (gold), salvage crates (blue), ore (brown), gas (green), crystal shards (violet)
  for (const l of G.loot) { const x = sx(l.x), y = sy(l.y); ctx.save(); ctx.translate(x, y); ctx.rotate(now / 600 + l.id); ctx.fillStyle = LOOT_COL[l.kind] || '#fff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = l.kind === 5 ? 16 : 8; const q = l.kind === 5 ? 6 + Math.sin(now / 200) : l.kind >= 2 ? 3 : 4; ctx.fillRect(-q * z, -q * z, q * 2 * z, q * 2 * z); ctx.restore(); }
  // shots
  ctx.lineCap = 'round';
  for (const s of G.shots) {
    const W_ = G.A.weapons[s.w];
    if (!s.col) { s.W = W_; s.col = weaponColor(W_); s.look = weaponLook(W_); }
    const x = sx(s.x), y = sy(s.y); if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    drawShot(ctx, s, x, y, z, now);
  }
  ctx.shadowBlur = 0;
  // ships
  for (const e of G.ents.values()) drawShip(G, ctx, e, sx(e.rx), sy(e.ry), z, now);
  if (me && G.ents.get(me.id)) {} else if (me && G.myHull) drawShip(G, ctx, { ...me, hull: G.myHull, fl: me.fl, id: me.id }, sx(me.rx), sy(me.ry), z, now);
  // beams
  for (const b of G.beams) {
    const e = b.id === (me && me.id) ? me : G.ents.get(b.id); if (!e) continue;
    const W_ = G.A.weapons[b.w], col = weaponColor(W_);
    const x0 = sx(e.rx), y0 = sy(e.ry), a = b.a / 1000, x1 = x0 + Math.sin(a) * b.len * z, y1 = y0 - Math.cos(a) * b.len * z;
    ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 6 * Math.max(0.7, z); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // shield shimmer: an arc of the shield bubble facing the hit
  for (const [id, h] of shieldHits) {
    h.t -= dt; if (h.t <= 0) { shieldHits.delete(id); continue; }
    const e = id === (me && me.id) ? me : G.ents.get(id); if (!e) continue;
    const Hh = G.A.ships[e.hull] || G.A.ships[G.myHull]; const r = (Hh ? Hh.size : 60) * 0.42 * z * G.spriteScale;
    const x = sx(e.rx), y = sy(e.ry), a = Math.atan2(h.hy - e.ry, h.hx - e.rx), k = h.t / 0.35;
    ctx.strokeStyle = `rgba(120,200,255,${0.8 * k})`; ctx.lineWidth = 3; ctx.shadowColor = '#7ad0ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, r, a - 0.9, a + 0.9); ctx.stroke();
    ctx.strokeStyle = `rgba(120,200,255,${0.2 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke(); ctx.shadowBlur = 0;
  }
  // effects
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt; if (f.life <= 0) { fx.splice(i, 1); continue; }
    const k = f.life / f.max, x = sx(f.x), y = sy(f.y);
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; }
    if (f.ring) { ctx.globalAlpha = k; ctx.strokeStyle = f.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, f.r * (1 - k) * z + 4, 0, Math.PI * 2); f.fill ? (ctx.fillStyle = f.c, ctx.globalAlpha = k * 0.5, ctx.fill()) : ctx.stroke(); ctx.globalAlpha = 1; continue; }
    if (f.ball) {
      const r = f.r * (0.35 + 0.65 * (1 - k * k)) * z, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,230,${k})`); g.addColorStop(0.35, `rgba(255,200,90,${k * 0.9})`); g.addColorStop(0.7, `rgba(255,90,30,${k * 0.6})`); g.addColorStop(1, 'rgba(80,20,0,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; continue;
    }
    if (f.smoke) { f.vx *= 0.97; f.vy *= 0.97; const r = f.r * (1.6 - k) * z; ctx.fillStyle = `rgba(90,85,80,${0.35 * k})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); continue; }
    if (f.debris) { f.rot += f.vr * dt; ctx.save(); ctx.translate(x, y); ctx.rotate(f.rot); ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = k > 0.7 ? '#ffb060' : '#6a6a70'; ctx.fillRect(-f.s * z, -f.s * z * 0.5, f.s * 2 * z, f.s * z); ctx.restore(); ctx.globalAlpha = 1; continue; }
    if (f.num !== undefined) { ctx.globalAlpha = Math.min(1, k * 1.6); ctx.font = `bold ${f.mine ? 15 : 13}px Tahoma`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(f.num, x, y); ctx.fillStyle = f.mine ? '#ffd27a' : '#ff7a6a'; ctx.fillText(f.num, x, y); ctx.globalAlpha = 1; continue; }
    ctx.globalAlpha = k; ctx.fillStyle = f.c; ctx.fillRect(x, y, f.s * z + 0.5, f.s * z + 0.5); ctx.globalAlpha = 1;
  }
  shake *= Math.pow(0.02, dt); if (shake < 0.2) shake = 0;
  hudOverlay(G, ctx, W, H, now, sx, sy, me);
}
// ------------------------------------------------------------------ 2.0 screen-space feedback: edge arrows, damage, jumps
function edgeArrow(ctx, W, H, x, y, col, label, dist) {
  const m = 46, cxs = W / 2, cys = H / 2, dx = x - cxs, dy = y - cys; if (x > m && y > m && x < W - m && y < H - m) return;
  const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6)), ex = cxs + dx * k, ey = cys + dy * k, a = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.font = '11px Tahoma'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.globalAlpha = 0.85;
  const lx = ex - Math.cos(a) * 26, ly = ey - Math.sin(a) * 22 + 4; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; const t = `${label} · ${Math.round(dist)} km`; ctx.strokeText(t, lx, ly); ctx.fillText(t, lx, ly); ctx.globalAlpha = 1;
}
function hudOverlay(G, ctx, W, H, now, sx, sy, me) {
  if (!me) return; const S = SYS[G.sys]; if (!S) return;
  // mission objectives in this system, your nav point, and your target
  const seen = new Set();
  for (const t of missionTargets(G)) if (t.stellar && !seen.has(t.stellar)) { const p = S.stellars.find(x => x.id === t.stellar); if (p) { seen.add(p.id); edgeArrow(ctx, W, H, sx(p.x), sy(p.y), t.kind === 'story' || t.kind === 'arc' ? '#ffd65a' : '#ffb86a', p.name, Math.hypot(p.x - me.rx, p.y - me.ry)); } }
  if (G.navStellar && !seen.has(G.navStellar)) { const p = S.stellars.find(x => x.id === G.navStellar); if (p) edgeArrow(ctx, W, H, sx(p.x), sy(p.y), '#7ad0ff', p.name, Math.hypot(p.x - me.rx, p.y - me.ry)); }
  const T = G.target && G.ents.get(G.target); if (T) edgeArrow(ctx, W, H, sx(T.rx), sy(T.ry), G.hostile(T) ? G.pal.hostile : G.pal.friend, (T.name || (G.A.ships[T.hull] || {}).name || 'target').split(' · ')[0], Math.hypot(T.rx - me.rx, T.ry - me.ry));
  // hyperspace: streaks while jumping, a flash on arrival
  if (me.fl & 8) { const k = Math.min(1, (now - (G._jumpStart || now)) / 1200); ctx.strokeStyle = `rgba(200,225,255,${0.25 + 0.5 * k})`; ctx.lineWidth = 1.5; const rr = Math.max(W, H);
    for (let i = 0; i < 90; i++) { const a = (i * 2.399) % 6.283, r0 = ((i * 97) % 300) + 40 + k * 200, r1 = r0 + 40 + k * rr * 0.5; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1); ctx.stroke(); } }
  if (G._arriveT && now - G._arriveT < 700) { ctx.fillStyle = `rgba(220,235,255,${0.55 * (1 - (now - G._arriveT) / 700)})`; ctx.fillRect(0, 0, W, H); }
  // damage: a red flash when your hull is hit, and a slow pulse when armour is low
  const st = G.you && G.you.shipStats, ar = st ? me.armor / Math.max(1, st.armor) : 1, hurt = G._hurtT ? Math.max(0, 1 - (now - G._hurtT) / 450) : 0, low = ar < 0.3 ? (0.35 + 0.25 * Math.sin(now / 260)) * (1 - ar / 0.3) : 0, v = Math.max(hurt * 0.55, low);
  if (v > 0.01) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(200,10,0,${v})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}
function drawShip(G, ctx, e, x, y, z, now) {
  const H = G.A.ships[e.hull]; if (!H) return;
  const sz = H.size, scale = z * G.spriteScale, w = sz * scale;
  if (x < -w || y < -w || x > ctx.canvas.width + w || y > ctx.canvas.height + w) return;
  const fr = ((Math.round(e.a / (Math.PI / 18)) % 36) + 36) % 36;
  const im = sheet(e.hull);
  if (e.fl & 8) { ctx.globalAlpha = 0.6; }
  if (e.fl & 32) { ctx.shadowColor = 'rgba(255,205,90,.95)'; ctx.shadowBlur = Math.max(6, 16 * z); }   // mastery Tier 5 gold trim
  if (im.complete && im.naturalWidth) ctx.drawImage(im, (fr % 6) * sz, Math.floor(fr / 6) * sz, sz, sz, x - w / 2, y - w / 2, w, w);
  else { ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(x, y, w / 4, 0, 6.28); ctx.fill(); }
  ctx.shadowBlur = 0;
  if (e.fl & 1 && H.glow) { const g = sheet(e.hull, true); if (g.complete && g.naturalWidth) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(g, (fr % 6) * sz, Math.floor(fr / 6) * sz, sz, sz, x - w / 2, y - w / 2, w, w); ctx.globalCompositeOperation = 'source-over'; } }
  ctx.globalAlpha = 1;
  if (e.fl & 4) { ctx.fillStyle = 'rgba(255,120,60,.8)'; if (Math.random() < 0.3) ctx.fillRect(x + (Math.random() - 0.5) * w / 2, y + (Math.random() - 0.5) * w / 2, 2, 2); }
  if (G.hover === e.id && G.target !== e.id) { const r = w * 0.5 + 4; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
  const tgt = G.target === e.id;
  if (tgt) {
    const r = w * 0.55 + 6; ctx.strokeStyle = G.hostile(e) ? G.pal.hostile : G.pal.friend; ctx.lineWidth = 1.5;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + dx * r, y + dy * r * 0.6); ctx.lineTo(x + dx * r, y + dy * r); ctx.lineTo(x + dx * r * 0.6, y + dy * r); ctx.stroke(); }
  }
  if (e.name && (e.fl & 16 || e.fl & 64 || tgt)) { ctx.fillStyle = e.fl & 16 ? '#9cf' : e.fl & 64 ? '#f2c66a' : '#ddd';   // 1.1: rival captains carry gold name tags
    ctx.font = '13px Tahoma'; ctx.textAlign = 'center'; ctx.fillText(e.name, x, y - w * 0.55 - 6); }
}

// ------------------------------------------------------------------ radar
export function radar(G, ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height, me = G.view;
  ctx.fillStyle = '#020408'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#0d2a1a'; ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, k * H / 6, 0, 6.28); ctx.stroke(); }
  if (!me) return;
  const S = SYS[G.sys], neb = G.world && G.world.anomalies && G.world.anomalies[G.sys] === 'nebula', R = 4200 * (neb ? 0.5 : 1), k = (H / 2) / R * 1.15; G.radarR = R;
  const px = (x) => W / 2 + (x - me.rx) * k, py = (y) => H / 2 + (y - me.ry) * k;
  if (S) for (const p of S.stellars) { ctx.fillStyle = p.wormhole ? '#9ac8ff' : p.site ? (G.sites && G.sites[p.id] ? '#a8f' : '#776') : p.hub ? '#9ab' : '#556'; ctx.beginPath(); ctx.arc(px(p.x), py(p.y), Math.max(2.5, p.r * k), 0, 6.28); ctx.fill(); }
  for (const k of G.rocks || []) if (k.hp) { ctx.fillStyle = k.ore === 'gas' ? '#2a6a5a' : k.ore === 'shards' ? '#6a4a8a' : '#4a4640'; ctx.fillRect(px(k.x) - 1, py(k.y) - 1, 2, 2); }
  for (const l of G.loot) { ctx.fillStyle = l.kind === 5 ? '#ff5ae0' : '#fff'; const q = l.kind === 5 ? 2 : 1; ctx.fillRect(px(l.x) - q, py(l.y) - q, q * 2, q * 2); }
  for (const [x, y] of surveyPoints(G)) { ctx.strokeStyle = '#5ad8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(x), py(y), 5, 0, 6.28); ctx.stroke(); }
  if (neb) { ctx.fillStyle = 'rgba(150,120,255,.10)'; ctx.fillRect(0, 0, W, H); }
  for (const e of G.ents.values()) {
    if (e.id === me.id) continue;
    const x = px(e.rx), y = py(e.ry); if (x < 0 || y < 0 || x > W || y > H) continue;
    const hos = G.hostile(e); ctx.fillStyle = e.owner === me.id ? G.pal.own : e.fl & 16 ? G.pal.player : hos ? G.pal.hostile : G.pal.neutral;
    const s = e.id === G.target ? 4 : 2.5;
    if (hos && G.opts.cb) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.fill(); }   // colour-blind mode: hostiles are diamonds too
    else ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
}

// ------------------------------------------------------------------ galaxy map (minimap and full map)
// opts.big: the full map (pan with drag, zoom with the wheel, view kept in G.mapView). Otherwise the companion minimap,
// centred on the current system. Systems you have not visited are drawn as hollow rings.
const SYS_LIST = Object.values(SYS);
const BOUNDS = (() => { const xs = SYS_LIST.map(s => s.x), ys = SYS_LIST.map(s => s.y); return { x0: Math.min(...xs) - 60, x1: Math.max(...xs) + 60, y0: Math.min(...ys) - 60, y1: Math.max(...ys) + 60 }; })();
export function mapFit(W, H) { const B = BOUNDS, k = Math.min(W / (B.x1 - B.x0), H / (B.y1 - B.y0)); return { cx: (B.x0 + B.x1) / 2, cy: (B.y0 + B.y1) / 2, k, fit: k }; }
export function galaxy(G, ctx, opts = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height, big = !!opts.big;
  ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H);
  let V;
  if (big) { if (!G.mapView || G.mapView.W !== W || G.mapView.H !== H) { const f = mapFit(W, H), old = G.mapView; G.mapView = Object.assign(old || {}, { W, H, fit: f.fit }); if (!G.mapView.k) Object.assign(G.mapView, f); else if (old.prevFit) G.mapView.k *= f.fit / old.prevFit; G.mapView.prevFit = f.fit; } V = G.mapView; }   // 1.0.1: keep the zoom when the canvas is resized
  else { const here = SYS[G.sys] || SYS_LIST[0]; V = { cx: here.x, cy: here.y, k: Math.min(W, H) / 560 }; }
  const P = (s) => [W / 2 + (s.x - V.cx) * V.k, H / 2 + (s.y - V.cy) * V.k];
  G[big ? 'mapXform' : 'miniXform'] = { cx: V.cx, cy: V.cy, k: V.k, W, H };
  const explored = new Set((G.you && G.you.explored) || []), zoom = big ? V.k / V.fit : 3;
  const on = (x, y, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
  // territory shading
  ctx.globalCompositeOperation = 'lighter';
  if ((G.mapMode || 'factions') === 'factions' || !big) for (const s of SYS_LIST) {
    const F = FACTIONS[s.faction]; if (F.region && s.faction !== 'deep') continue;
    const [x, y] = P(s); if (!on(x, y, 120 * V.k)) continue; const r = 95 * V.k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), c = hexToRgb(F.color);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.10)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // routes
  ctx.lineWidth = 1;
  for (const s of SYS_LIST) for (const l of s.links) if (l > s.id) {
    const [a, b] = P(s), [c, d] = P(SYS[l]); if (!on(a, b, 400) && !on(c, d, 400)) continue;
    const known = explored.has(s.id) || explored.has(l);
    ctx.strokeStyle = known ? '#34405a' : '#1c2232'; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  }
  // the Sol Gateway: a dashed, glowing link between Sol and the far mouth
  for (const s of SYS_LIST) if (s.gate && s.id < s.gate) { const [a, b] = P(s), [c, d] = P(SYS[s.gate]);
    ctx.strokeStyle = 'rgba(154,200,255,.55)'; ctx.lineWidth = big ? 2 : 1.5; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + c) / 2 - (d - b) * 0.15, (b + d) / 2 + (c - a) * 0.15, c, d); ctx.stroke(); ctx.setLineDash([]); }
  const route = G.route || [];
  if (route.length && SYS[G.sys]) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = big ? 2.5 : 2; ctx.beginPath(); let [a, b] = P(SYS[G.sys]); ctx.moveTo(a, b); for (const r of route) { [a, b] = P(SYS[r]); ctx.lineTo(a, b); } ctx.stroke(); }
  const onRoute = new Set(route), sites = G.sites || {};
  for (const s of SYS_LIST) {
    const [x, y] = P(s); if (!on(x, y)) continue;
    const F = FACTIONS[s.faction], here = s.id === G.sys, seen = explored.has(s.id) || !G.you, r = big ? Math.max(3, Math.min(8, 3.2 * Math.sqrt(zoom))) : 4;
    if (seen || (big && G.mapMode && G.mapMode !== 'factions')) { ctx.fillStyle = big ? viewColor(G, s, seen) : F.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    else { ctx.strokeStyle = F.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    const site = s.stellars.find(p => p.site);
    if (site && (big ? zoom > 0.9 : true)) { const own = sites[site.id]; ctx.fillStyle = own ? '#c0a0ff' : '#8a70b0'; const q = r + 2; ctx.beginPath(); ctx.moveTo(x + q + 4, y - q); ctx.lineTo(x + q + 7, y - q + 3); ctx.lineTo(x + q + 4, y - q + 6); ctx.lineTo(x + q + 1, y - q + 3); ctx.fill(); }
    if (here) { ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.283); ctx.stroke(); }
    if (G.hoverSys === s.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.283); ctx.stroke(); }
    const label = here || G.hoverSys === s.id || onRoute.has(s.id) || (big ? (zoom > 1.6 || (s.anchor && zoom > 0.95)) : (SYS[G.sys] && SYS[G.sys].links.includes(s.id)));
    if (label) {
      ctx.font = (big ? (here || s.anchor ? 'bold 12px' : '11px') : '9px') + ' Tahoma'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#02030a'; ctx.strokeText(s.name, x, y - r - 5);
      ctx.fillStyle = here ? '#fff' : seen ? '#c8ccd8' : '#80869a'; ctx.fillText(s.name, x, y - r - 5);
    }
  }
  // 0.6 overlays: fleet claims, the invasion, anomalies
  const Wd = G.world || {}, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  for (const [sid, c] of Object.entries(Wd.claims || {})) { const S_ = SYS[sid]; if (!S_) continue; const [x, y] = P(S_); if (!on(x, y)) continue;
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(x, y, (big ? 11 : 8), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    if (big) { ctx.font = 'bold 10px Tahoma'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#02030a'; ctx.strokeText(`[${c.tag}]`, x, y + 22); ctx.fillStyle = '#ffd27a'; ctx.fillText(`[${c.tag}]`, x, y + 22); } }
  for (const [sid, an] of Object.entries(Wd.anomalies || {})) { const S_ = SYS[sid], A_ = ANOMALIES[an]; if (!S_ || !A_) continue; const [x, y] = P(S_); if (!on(x, y)) continue;
    ctx.font = (big ? 'bold 13px' : '10px') + ' Tahoma'; ctx.textAlign = 'center'; ctx.fillStyle = A_.color; ctx.fillText(A_.icon, x + (big ? 12 : 8), y + (big ? 4 : 3)); }
  if (Wd.invasion && SYS[Wd.invasion.sys]) { const [x, y] = P(SYS[Wd.invasion.sys]);
    ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.6 * pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, (big ? 14 : 9) + pulse * 5, 0, 6.283); ctx.stroke();
    if (big) { ctx.font = 'bold 11px Tahoma'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5a40'; ctx.fillText('INVASION', x, y + 30); } }
  // 1.0.1: active mission targets (gold diamond and ring; the main story is brighter)
  for (const t of missionTargets(G)) { const S_ = t.sys && SYS[t.sys]; if (!S_) continue; const [x, y] = P(S_); if (!on(x, y)) continue;
    const q = (big ? 9 : 7) + pulse * 3, col = t.kind === 'story' ? '255,214,90' : '255,190,110';
    ctx.strokeStyle = `rgba(${col},${0.55 + 0.45 * pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath(); ctx.stroke();
    if (big) { const lab = t.kind === 'story' ? '★ ' + t.title : '◆ ' + t.title; ctx.font = 'bold 11px Tahoma'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = '#02030a'; ctx.strokeText(lab.length > 38 ? lab.slice(0, 36) + '…' : lab, x + q + 4, y + 4); ctx.fillStyle = `rgb(${col})`; ctx.fillText(lab.length > 38 ? lab.slice(0, 36) + '…' : lab, x + q + 4, y + 4); } }
  if (big) { const ch = SYS.coldharbor; if (ch) { const [x, y] = P(ch); ctx.font = 'italic 12px Tahoma'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(216,200,144,.55)'; ctx.fillText('beyond the Gateway', x - 20 * V.k, y + 50 * V.k + 14); } }
  if (big) { ctx.fillStyle = 'rgba(2,3,10,.82)'; ctx.fillRect(0, H - (G.mapMode && G.mapMode !== 'factions' ? 26 : 42), W, 42); }   // a backing strip so the legend never sits on top of system names
  if (big && G.mapMode && G.mapMode !== 'factions') {   // legend for the alternative views
    const L = { trade: [['#3ce66e', `cheap ${(COMMODITIES.find(c => c.id === (G.mapCid || 'food')) || {}).name || ''}`], ['#f0dc5a', 'average'], ['#ff503c', 'expensive'], ['#3a3e48', 'no market']], services: [['#5ab0ff', 'shipyard'], ['#ffaa4a', 'outfitter'], ['#c38aff', 'both'], ['#3a3e48', 'neither']],
      standing: [['#3ce66e', 'liked'], ['#c8c878', 'neutral'], ['#ff3c32', 'hated'], ['#5a5e68', 'no power']], danger: [['#5ac878', 'safe'], ['#ff3228', 'deadly']] }[G.mapMode] || [];
    let lx = 12, ly = H - 14; ctx.font = '11px Tahoma'; ctx.textAlign = 'left';
    for (const [c, n] of L) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 4, ly - 4, 4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#aaa'; ctx.fillText(n, lx + 12, ly); lx += ctx.measureText(n).width + 30; }
    ctx.fillStyle = '#666'; ctx.fillText('unvisited systems show grey', lx, ly);
  } else if (big) {   // legend
    let lx = 12, ly = H - 14; ctx.font = '11px Tahoma'; ctx.textAlign = 'left';
    for (const [id, F] of Object.entries(FACTIONS)) { if (F.hidden) continue; ctx.fillStyle = F.color; ctx.fillRect(lx, ly - 8, 8, 8); ctx.fillStyle = '#aaa'; ctx.fillText(F.short, lx + 12, ly); lx += ctx.measureText(F.short).width + 26; }
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx + 4, ly - 4, 3.5, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#aaa'; ctx.fillText('not yet visited', lx + 12, ly);
    lx = 12; ly -= 16; ctx.fillStyle = '#ffd65a'; ctx.fillText('◇ mission target', lx, ly); lx += 100; ctx.fillStyle = '#ffd27a'; ctx.fillText('◌ fleet claim', lx, ly); lx += 80; ctx.fillStyle = '#ff5a40'; ctx.fillText('◯ invasion', lx, ly); lx += 70;
    for (const A_ of Object.values(ANOMALIES)) { ctx.fillStyle = A_.color; ctx.fillText(`${A_.icon} ${A_.name}`, lx, ly); lx += ctx.measureText(`${A_.icon} ${A_.name}`).width + 14; }
  }
}
export function mapHit(G, mx, my, mini) {
  const t = mini ? G.miniXform : G.mapXform; if (!t) return null; let best = null, bd = 14;
  for (const s of SYS_LIST) { const x = t.W / 2 + (s.x - t.cx) * t.k, y = t.H / 2 + (s.y - t.cy) * t.k, d = Math.hypot(mx - x, my - y); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
export function surveyPoints(G) {
  const out = []; if (!G.you) return out;
  for (const m of G.you.missions || []) if (m.type === 'survey' && m.sys === G.sys && !m.done) m.points.forEach((p, i) => { if (!(m.seen || []).includes(i)) out.push(p); });
  return out;
}
export { FAC };
