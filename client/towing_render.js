import { STELLARS } from '/shared/galaxy.js';
import { MOTHERLODE_ART, TOW } from '/shared/towing-rules.js';
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
  ctx.font = `bold ${12 * px}px Tahoma`;
  ctx.textAlign = 'center';
  for (const o of w.objects) {
    if (['delivered', 'destroyed'].includes(o.status)) continue;
    const x = sx(o.x),
      y = sy(o.y);
    if (x < -150 || x > W + 150 || y < -150 || y > H + 150) continue;
    const selected = o.id === G.towTarget,
      own = o.id === w.attached,
      art = MOTHERLODE_ART[o.ore] || MOTHERLODE_ART.ore,
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
    const im = image(art.base);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, x - R, y - R, R * 2, R * 2);
    else {
      ctx.fillStyle = art.color;
      ctx.fill();
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
