interface MiningRock {
  id: number;
  down?: boolean;
  x: number;
  y: number;
  r: number;
  gas?: boolean;
  heat: number;
  stage: number;
  stages: number;
  ready?: boolean;
}
interface MiningReveal {
  id: number;
  seam: number;
  hazard: string;
}
export interface MiningRenderState {
  you?: { sys?: string } | null;
  opts: { scale?: number; cb?: boolean; motion?: boolean };
  miningRocks?: { version: number; rocks: MiningRock[] } | null;
  mining?: { revealed?: MiningReveal[]; revealUntil: number; now: number } | null;
  miningTarget?: number;
  view?: { rx: number; ry: number } | null;
  miningHazards?: Array<{ x: number; y: number; radius: number; detonateAt: number }>;
  miningPressure?: { warn?: boolean; noise: number } | null;
}
import { CORONA_BANDS } from '../shared/industrial-rules.ts';
// Presentation only: all heat/work/stage/reveal data comes from server snapshots.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function drawMining(
  G: MiningRenderState,
  ctx: CanvasRenderingContext2D,
  sx: (x: number) => number,
  sy: (y: number) => number,
  z: number,
  W: number,
  H: number,
  now: number,
) {
  ctx.save();
  ctx.font = `bold ${14 * (devicePixelRatio || 1)}px "Pixelify Sans", sans-serif`;
  ctx.strokeStyle = '#ffcf8a';
  ctx.fillStyle = '#fff0cf';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  for (const b of CORONA_BANDS.filter((b) => b.sys === G.you?.sys)) {
    for (const radius of [b.inner, b.outer]) {
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), radius * z, 0, Math.PI * 2);
      ctx.stroke();
    }
    const x = sx(b.entry.x),
      y = sy(b.entry.y);
    ctx.fillText('☀ OPT-IN SHALLOW COLLECTOR — EXIT EAST →', x, y - 20);
    ctx.strokeRect(x - 15, y - 15, 30, 30);
  }
  ctx.restore();
  const wire = G.miningRocks;
  if (!wire || wire.version !== 1) return;
  const reveal = new Map((G.mining?.revealed || []).map((r) => [r.id, r]));
  ctx.save();
  ctx.font = `bold ${Math.max(12, Math.min(17, 13 * (Number(G.opts.scale) || 1)))}px "Pixelify Sans", sans-serif`;
  ctx.textAlign = 'center';
  for (const r of wire.rocks) {
    if (r.down) continue;
    const shown = reveal.get(r.id),
      selected = r.id === G.miningTarget;
    if (!shown && !selected && r.heat < 1) continue;
    const x = sx(r.x),
      y = sy(r.y),
      R = r.r * z + 6;
    if (x < -100 || x > W + 100 || y < -100 || y > H + 100) continue;
    ctx.strokeStyle = G.opts.cb ? '#fff0a0' : '#7de8ea';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash(shown ? [7, 4] : [2, 6]);
    ctx.beginPath();
    if (shown) ctx.arc(x, y, R, shown.seam - 1.15, shown.seam + 1.15);
    else ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected || shown) {
      const text = `${r.gas ? 'VENT' : 'SEAM'} ${r.stage + 1}/${r.stages} · ${r.ready ? 'READY' : Math.round(r.heat) + '°'}${shown ? ' · ' + (shown.hazard === 'volatile' ? 'VOLATILE' : 'SAFE') : ''}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#090d14';
      ctx.strokeText(text, x, y + R + 18);
      ctx.fillStyle = '#fff1c9';
      ctx.fillText(text, x, y + R + 18);
      if (shown) {
        ctx.font = '14px "Pixelify Sans", sans-serif';
        ctx.strokeText('common / rich / pure potential', x, y + R + 33);
        ctx.fillText('common / rich / pure potential', x, y + R + 33);
      }
    }
    if (r.gas && shown) {
      ctx.fillStyle = '#b2f8df';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + (reduced() || G.opts.motion === false ? 0 : now * 0.0002);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (G.mining && G.mining.revealUntil > G.mining.now && G.view) {
    ctx.strokeStyle = '#7de8ea55';
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.arc(
      sx(G.view.rx),
      sy(G.view.ry),
      (reduced() || G.opts.motion === false ? 120 : 70 + (now % 1000) * 0.07) * z,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  const dpr = devicePixelRatio || 1;
  ctx.font = `bold ${14 * dpr}px "Pixelify Sans", sans-serif`;
  for (const h of G.miningHazards || []) {
    const x = sx(h.x),
      y = sy(h.y);
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = G.opts.cb ? '#fff' : '#ffb84a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, h.radius * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.fillText(
      `VOLATILE — ${Math.max(0, h.detonateAt - (G.mining?.now || 0)).toFixed(1)}s`,
      x,
      y - h.radius * z - 16 * dpr,
    );
  }
  if (G.miningPressure?.warn) {
    ctx.fillStyle = '#ffdf9e';
    ctx.textAlign = 'left';
    ctx.fillText(
      `MINING PRESSURE ${Math.round(G.miningPressure.noise)}/100 — leave field to cool`,
      18 * dpr,
      90 * dpr,
    );
  }
  ctx.restore();
}
