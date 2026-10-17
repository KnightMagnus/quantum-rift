// Presentation only: all heat/work/stage/reveal data comes from server snapshots.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function drawMining(G, ctx, sx, sy, z, W, H, now) {
  const wire = G.miningRocks;
  if (!wire || wire.version !== 1) return;
  const reveal = new Map((G.mining?.revealed || []).map((r) => [r.id, r]));
  ctx.save();
  ctx.font = `bold ${Math.max(12, Math.min(17, 13 * (Number(G.opts.scale) || 1)))}px Tahoma`;
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
      const text = `${r.gas ? 'VENT' : 'SEAM'} ${r.stage + 1}/${r.stages} · ${r.ready ? 'READY' : Math.round(r.heat) + '°'}${shown ? ' · SAFE' : ''}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#090d14';
      ctx.strokeText(text, x, y + R + 18);
      ctx.fillStyle = '#fff1c9';
      ctx.fillText(text, x, y + R + 18);
      if (shown) {
        ctx.font = '12px Tahoma';
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
  if (G.mining?.revealUntil > G.mining.now && G.view) {
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
  ctx.restore();
}
