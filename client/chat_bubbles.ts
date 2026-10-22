// System chat is still logged normally; these short-lived labels only decorate live player ships.
export const CHAT_BUBBLE_MS = 7000;
const MAX_BUBBLES = 64;
interface ChatBubble {
  text: string;
  sys: string | null;
  until: number;
}
interface ChatEntity {
  rx: number;
  ry: number;
  ar: number;
  fl: number;
  hull: number;
}
export interface ShipChatState {
  sys: string | null;
  landed?: unknown;
  view: { rx: number; ry: number; armor: number } | null;
  chatBubbles?: Map<number, ChatBubble>;
  ents: Map<number, ChatEntity>;
  myId: number;
  A: { ships: Record<number, { size: number }> } | null;
  zoom: number;
  spriteScale: number;
}
export interface ShipChatMessage {
  ch?: string;
  sys: string | null;
  ship: number;
  msg?: string;
}
const segments = (text: string) =>
  typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
        (segmentData) => segmentData.segment,
      )
    : Array.from(text);

export function receiveShipChat(
  shipChatState: ShipChatState,
  message: ShipChatMessage,
  currentTime = performance.now(),
) {
  // The server supplies the active entity ID. Never attach messages by display name.
  if (
    message.ch !== 'sys' ||
    message.sys !== shipChatState.sys ||
    !Number.isSafeInteger(message.ship) ||
    message.ship <= 0 ||
    typeof message.msg !== 'string' ||
    shipChatState.landed ||
    !shipChatState.view
  )
    return false;
  // oxlint-disable-next-line no-control-regex -- Reject or sanitize control characters in player text.
  const text = segments(message.msg.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' '))
    .slice(0, 240)
    .join('')
    .trim();
  if (!text) return false;
  const bubbles = (shipChatState.chatBubbles ||= new Map());
  // Updating a ship replaces its bubble instead of stacking chat over the battlefield.
  bubbles.delete(message.ship);
  bubbles.set(message.ship, { text, sys: message.sys, until: currentTime + CHAT_BUBBLE_MS });
  while (bubbles.size > MAX_BUBBLES) bubbles.delete(bubbles.keys().next().value!);
  return true;
}

export function wrapShipChat(
  text: string,
  measure: (text: string) => number,
  width: number,
  maxLines = 3,
) {
  const glyphs = segments(text);
  const lines = [];
  let line = '';
  for (let index = 0; index < glyphs.length; index++) {
    const glyph = glyphs[index];
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

/** Remove expired or unavailable speech bubbles during presentation update. */
export function updateShipChat(state: ShipChatState, currentTime: number): void {
  if (!state.chatBubbles) return;
  if (!state.view || state.landed || state.view.armor <= 0) {
    state.chatBubbles.clear();
    return;
  }
  for (const [id, bubble] of state.chatBubbles) {
    const entity = state.ents.get(id);
    if (bubble.until <= currentTime || bubble.sys !== state.sys || !entity || entity.ar <= 0)
      state.chatBubbles.delete(id);
  }
}
export function drawShipChat(
  shipChatState: ShipChatState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  width2: number,
  height2: number,
  screenX: (positionX: number) => number,
  screenY: (positionY: number) => number,
  currentTime: number,
  prune = true,
) {
  if (prune) updateShipChat(shipChatState, currentTime);
  if (!shipChatState.chatBubbles) return;
  if (!shipChatState.view || shipChatState.landed || shipChatState.view.armor <= 0) {
    return;
  }
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.font = '15px "Pixelify Sans", sans-serif';
  canvasRenderingContext2D.textAlign = 'center';
  canvasRenderingContext2D.textBaseline = 'top';
  for (const [identifier, bubble] of shipChatState.chatBubbles) {
    const entity = shipChatState.ents.get(identifier);
    if (
      bubble.until <= currentTime ||
      bubble.sys !== shipChatState.sys ||
      !entity ||
      entity.ar <= 0
    ) {
      continue;
    }
    if (!(entity.fl & 16) || entity.fl & 8) continue;
    const ship = identifier === shipChatState.myId ? shipChatState.view : entity;
    const positionX = screenX(ship.rx),
      positionY = screenY(ship.ry);
    if (
      !Number.isFinite(positionX) ||
      !Number.isFinite(positionY) ||
      positionX < 0 ||
      positionY < 0 ||
      positionX > width2 ||
      positionY > height2
    )
      continue;
    const maxWidth = Math.min(260, width2 - 48);
    if (maxWidth < 30) continue;
    const lines = wrapShipChat(
      bubble.text,
      (state) => canvasRenderingContext2D.measureText(state).width,
      maxWidth,
    );
    const width = Math.min(
        width2 - 16,
        Math.max(
          220,
          Math.max(...lines.map((state) => canvasRenderingContext2D.measureText(state).width)) + 24,
        ),
      ),
      height = lines.length * 19 + 42,
      size = shipChatState.A!.ships[entity.hull]?.size || 30,
      left = Math.max(4, Math.min(width2 - width - 4, positionX - width / 2)),
      topOffset = Math.max(
        4,
        positionY - size * shipChatState.zoom * shipChatState.spriteScale * 0.55 - height - 27,
      );
    canvasRenderingContext2D.globalAlpha = Math.min(1, (bubble.until - currentTime) / 700);
    canvasRenderingContext2D.fillStyle = 'rgba(40,54,62,.97)';
    canvasRenderingContext2D.strokeStyle = '#627780';
    canvasRenderingContext2D.lineWidth = 1;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.rect(left, topOffset, width, height);
    canvasRenderingContext2D.fill();
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.strokeStyle = '#33454d';
    canvasRenderingContext2D.strokeRect(left + 3, topOffset + 3, width - 6, height - 6);
    canvasRenderingContext2D.fillStyle = 'rgba(0,0,0,.12)';
    for (let scan = topOffset + 5; scan < topOffset + height - 3; scan += 3)
      canvasRenderingContext2D.fillRect(left + 4, scan, width - 8, 1);
    canvasRenderingContext2D.fillStyle = '#3a4b54';
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.moveTo(
      Math.max(left + 5, Math.min(left + width - 5, positionX)) - 4,
      topOffset + height,
    );
    canvasRenderingContext2D.lineTo(positionX, topOffset + height + 6);
    canvasRenderingContext2D.lineTo(
      Math.max(left + 5, Math.min(left + width - 5, positionX)) + 4,
      topOffset + height,
    );
    canvasRenderingContext2D.fill();
    canvasRenderingContext2D.fillStyle = '#09161d';
    canvasRenderingContext2D.fillRect(left + 8, topOffset + 26, width - 16, height - 34);
    canvasRenderingContext2D.strokeStyle = '#52656b';
    canvasRenderingContext2D.strokeRect(left + 8, topOffset + 26, width - 16, height - 34);
    canvasRenderingContext2D.font = '11px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.fillStyle = '#d69a74';
    canvasRenderingContext2D.fillText('SYSTEM COMMS', left + width / 2, topOffset + 8);
    canvasRenderingContext2D.font = '15px "Pixelify Sans", sans-serif';
    canvasRenderingContext2D.fillStyle = '#eef7ff';
    lines.forEach((line, index) =>
      canvasRenderingContext2D.fillText(line, left + width / 2, topOffset + 31 + index * 19),
    );
  }
  canvasRenderingContext2D.restore();
}
