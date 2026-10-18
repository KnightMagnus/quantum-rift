import { STELLARS } from '/shared/galaxy.js';
import { motherlodeArt, TOW } from '/shared/towing-rules.js';
const images = new Map();
function image(name) {
  if (!images.has(name)) {
    const im = new Image();
    im.src = '/assets/objects/' + name;
    images.set(name, im);
  }
  return images.get(name);
}
export function drawTowing(G, ctx, sx, sy, z, W, H) {
  const w = G.towing || G.you?.towing;
  if (!w) return;
  ctx.save();
  const px = devicePixelRatio || 1;
  ctx.font = `bold ${14 * px}px "Pixelify Sans", sans-serif`;
  ctx.textAlign = 'center';
  for (const o of w.objects) {
    if (['delivered', 'destroyed'].includes(o.status)) continue;
    const x = sx(o.x),
      y = sy(o.y);
    if (x < -150 || x > W + 150 || y < -150 || y > H + 150) continue;
    const selected = o.id === G.towTarget,
      own = o.id === w.attached,
      art = motherlodeArt(o),
      R = 42 * z;
    const tug = own && G.view ? G.view : o.tug;
    if (o.status === 'attached' && tug) {
      const tx = sx(tug.x),
        ty = sy(tug.y);
      ctx.strokeStyle = G.opts.cb ? '#fff0a0' : own ? '#82e5e0' : '#c8c9d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(tx - 4, ty - 4, 8, 8);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(
        `TETHER ${Math.round(Math.hypot(tug.x - o.x, tug.y - o.y))}/320 · NO TRANSIT`,
        (tx + x) / 2,
        (ty + y) / 2 - 12 * px,
      );
    }
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < art.sides; i++) {
      const a = (i * Math.PI * 2) / art.sides,
        r = R * (i % 2 ? 0.82 : 1);
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    const im = art.base ? image(art.base) : null;
    if (im?.complete && im.naturalWidth) ctx.drawImage(im, x - R, y - R, R * 2, R * 2);
    else {
      if (art.kind === 'unknown') {
        const shade = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
        shade.addColorStop(0, '#b0b5bc');
        shade.addColorStop(0.4, '#747d88');
        shade.addColorStop(1, '#282f39');
        ctx.fillStyle = shade;
      } else ctx.fillStyle = '#333943';
      ctx.fill();
    }
    // Material geometry stays recognizable at flight zoom, even without rasters.
    ctx.translate(x, y);
    ctx.scale(R, R);
    ctx.strokeStyle = art.color;
    ctx.fillStyle = art.color;
    ctx.lineWidth = 0.045;
    ctx.setLineDash([]);
    if (art.kind === 'unknown') {
      // Identical neutral geology: no resource-derived seeds or hues.
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39996,
          r = 0.17 + (i % 5) * 0.13,
          dx = Math.cos(a) * r,
          dy = Math.sin(a) * r,
          pit = 0.035 + (i % 3) * 0.018;
        ctx.fillStyle = '#424b57';
        ctx.beginPath();
        ctx.arc(dx, dy, pit, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#929ba6';
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.arc(dx, dy + 0.015, pit, 0.15, 2.6);
        ctx.stroke();
      }
      ctx.strokeStyle = '#56616e';
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.moveTo(-0.6, -0.4);
      ctx.lineTo(-0.25, -0.18);
      ctx.lineTo(-0.32, 0.14);
      ctx.lineTo(0.12, 0.42);
      ctx.stroke();
    } else if (art.kind === 'ore') {
      for (const [dx, dy] of [
        [-0.4, -0.25],
        [0.12, 0.05],
        [-0.25, 0.4],
      ]) {
        ctx.beginPath();
        ctx.moveTo(dx - 0.18, dy + 0.12);
        ctx.lineTo(dx, dy - 0.12);
        ctx.lineTo(dx + 0.27, dy - 0.02);
        ctx.stroke();
      }
    } else if (art.kind === 'gas') {
      for (const [dx, dy, r] of [
        [-0.5, -0.35, 0.24],
        [0.4, 0.2, 0.3],
        [-0.2, 0.5, 0.2],
      ]) {
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
    } else if (art.kind === 'shards') {
      for (const [dx, dy, tilt] of [
        [-0.35, 0.1, -0.4],
        [0, -0.08, 0.1],
        [0.35, 0.2, 0.5],
      ]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.moveTo(0, -0.85);
        ctx.lineTo(0.16, -0.25);
        ctx.lineTo(0.12, 0.25);
        ctx.lineTo(-0.12, 0.25);
        ctx.lineTo(-0.16, -0.25);
        ctx.closePath();
        ctx.fillStyle = '#563973';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -0.85);
        ctx.lineTo(0, 0.2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.strokeStyle = G.opts.cb ? '#fff0a0' : art.color;
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.setLineDash(o.status === 'detached' ? [2, 5] : [9, 4]);
    ctx.strokeRect(x - R - 4, y - R - 4, R * 2 + 8, R * 2 + 8);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff1cb';
    ctx.strokeStyle = '#0b1019';
    ctx.lineWidth = 4;
    const text = `MOTHERLODE ${o.id} · ${o.status.toUpperCase()} · ${o.mass ?? '?'}t`;
    ctx.strokeText(text, x, y + R + 20 * px);
    ctx.fillText(text, x, y + R + 20 * px);
    if (o.revealed && selected) {
      ctx.fillText(`${o.ore.toUpperCase()} · ${o.field.label}`, x, y + R + 36 * px);
      for (const id of o.ports) {
        const p = STELLARS[id];
        if (p) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), (p.r + TOW.deliveryApron) * z, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          ctx.strokeRect(sx(p.x) - 15, sy(p.y) - 15, 30, 30);
          ctx.fillText('ACCEPTS MOTHERLODE · AUTO DELIVERY', sx(p.x), sy(p.y) - 24 * px);
        }
      }
    }
  }
  ctx.restore();
}
