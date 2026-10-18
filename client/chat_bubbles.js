// System chat is still logged normally; these short-lived labels only decorate live player ships.
export const CHAT_BUBBLE_MS = 7000;
const MAX_BUBBLES = 64;
const segments = (text) =>
  typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
        (s) => s.segment,
      )
    : Array.from(text);

export function receiveShipChat(G, message, now = performance.now()) {
  // The server supplies the active entity ID. Never attach messages by display name.
  if (
    message.ch !== 'sys' ||
    message.sys !== G.sys ||
    !Number.isSafeInteger(message.ship) ||
    message.ship <= 0 ||
    typeof message.msg !== 'string' ||
    G.landed ||
    !G.view
  )
    return false;
  const text = segments(message.msg.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' '))
    .slice(0, 240)
    .join('')
    .trim();
  if (!text) return false;
  const bubbles = (G.chatBubbles ||= new Map());
  // Updating a ship replaces its bubble instead of stacking chat over the battlefield.
  bubbles.delete(message.ship);
  bubbles.set(message.ship, { text, sys: message.sys, until: now + CHAT_BUBBLE_MS });
  while (bubbles.size > MAX_BUBBLES) bubbles.delete(bubbles.keys().next().value);
  return true;
}

export function wrapShipChat(text, measure, width, maxLines = 3) {
  const glyphs = segments(text);
  const lines = [];
  let line = '';
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    if (line && measure(line + glyph) > width) {
      if (lines.length === maxLines - 1) {
        while (line && measure(line + '…') > width) line = segments(line).slice(0, -1).join('');
        lines.push(line.trimEnd() + '…');
        return lines;
      }
      lines.push(line.trimEnd());
      line = '';
    }
    if (line || glyph.trim()) line += glyph;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawShipChat(G, ctx, W, H, sx, sy, now) {
  if (!G.chatBubbles) return;
  if (!G.view || G.landed || G.view.armor <= 0) {
    G.chatBubbles.clear();
    return;
  }
  ctx.save();
  ctx.font = '15px "Pixelify Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const [id, bubble] of G.chatBubbles) {
    const entity = G.ents.get(id);
    if (bubble.until <= now || bubble.sys !== G.sys || !entity || entity.ar <= 0) {
      G.chatBubbles.delete(id);
      continue;
    }
    if (!(entity.fl & 16) || entity.fl & 8) continue;
    const ship = id === G.myId ? G.view : entity;
    const x = sx(ship.rx),
      y = sy(ship.ry);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > W || y > H) continue;
    const maxWidth = Math.min(260, W - 48);
    if (maxWidth < 30) continue;
    const lines = wrapShipChat(bubble.text, (s) => ctx.measureText(s).width, maxWidth);
    const width = Math.min(
        W - 16,
        Math.max(220, Math.max(...lines.map((s) => ctx.measureText(s).width)) + 24),
      ),
      height = lines.length * 19 + 42,
      size = G.A.ships[entity.hull]?.size || 30,
      left = Math.max(4, Math.min(W - width - 4, x - width / 2)),
      top = Math.max(4, y - size * G.zoom * G.spriteScale * 0.55 - height - 27);
    ctx.globalAlpha = Math.min(1, (bubble.until - now) / 700);
    ctx.fillStyle = 'rgba(40,54,62,.97)';
    ctx.strokeStyle = '#627780';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#33454d';
    ctx.strokeRect(left + 3, top + 3, width - 6, height - 6);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let scan = top + 5; scan < top + height - 3; scan += 3)
      ctx.fillRect(left + 4, scan, width - 8, 1);
    ctx.fillStyle = '#3a4b54';
    ctx.beginPath();
    ctx.moveTo(Math.max(left + 5, Math.min(left + width - 5, x)) - 4, top + height);
    ctx.lineTo(x, top + height + 6);
    ctx.lineTo(Math.max(left + 5, Math.min(left + width - 5, x)) + 4, top + height);
    ctx.fill();
    ctx.fillStyle = '#09161d';
    ctx.fillRect(left + 8, top + 26, width - 16, height - 34);
    ctx.strokeStyle = '#52656b';
    ctx.strokeRect(left + 8, top + 26, width - 16, height - 34);
    ctx.font = '11px "Pixelify Sans", sans-serif';
    ctx.fillStyle = '#d69a74';
    ctx.fillText('SYSTEM COMMS', left + width / 2, top + 8);
    ctx.font = '15px "Pixelify Sans", sans-serif';
    ctx.fillStyle = '#eef7ff';
    lines.forEach((line, i) => ctx.fillText(line, left + width / 2, top + 31 + i * 19));
  }
  ctx.restore();
}
