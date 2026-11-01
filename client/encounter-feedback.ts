import type { EncounterFeedback } from '../shared/encounter-feedback.ts';

/** Paint actual range boundaries in world space and a bounded health/countdown list in screen space. */
export function drawEncounterFeedback(
  context: CanvasRenderingContext2D,
  encounters: readonly EncounterFeedback[],
  width: number,
  height: number,
  screenX: (worldX: number) => number,
  screenY: (worldY: number) => number,
): void {
  if (!encounters.length) return;
  context.save();
  for (const encounter of encounters) {
    if (!encounter.ability) continue;
    const radius = Math.abs(screenX(encounter.x + encounter.ability.radius) - screenX(encounter.x));
    context.beginPath();
    context.arc(screenX(encounter.x), screenY(encounter.y), radius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 100, 64, 0.12)';
    context.fill();
    context.strokeStyle = '#ff936a';
    context.lineWidth = 2;
    context.setLineDash([8, 6]);
    context.stroke();
  }
  context.setLineDash([]);
  const cardWidth = Math.min(340, Math.max(0, width - 24));
  const ordered = [...encounters].sort(
    (left, right) =>
      Number(!!right.ability) - Number(!!left.ability) ||
      (left.ability?.seconds ?? Infinity) - (right.ability?.seconds ?? Infinity),
  );
  const availableHeight = Math.max(0, height - 24);
  let cardCount = Math.min(6, ordered.length, Math.floor((availableHeight + 4) / 48));
  // Leave a line for omitted encounters; all active range circles remain visible.
  if (cardCount < ordered.length && availableHeight - cardCount * 48 < 18)
    cardCount = Math.max(0, cardCount - 1);
  if (cardWidth < 32 || availableHeight < 18) {
    context.restore();
    return;
  }
  const left = (width - cardWidth) / 2;
  context.font = '13px sans-serif';
  context.textAlign = 'left';
  for (const [index, encounter] of ordered.slice(0, cardCount).entries()) {
    const top = 12 + index * 48;
    context.fillStyle = 'rgba(9, 15, 24, 0.88)';
    context.fillRect(left, top, cardWidth, 44);
    context.fillStyle = '#edf4ff';
    context.fillText(
      `${encounter.name} · ${Math.ceil(encounter.health * 100)}%`,
      left + 8,
      top + 15,
      cardWidth - 16,
    );
    context.fillStyle = '#ff936a';
    context.fillRect(left + 8, top + 20, (cardWidth - 16) * encounter.health, 4);
    if (encounter.ability)
      context.fillText(
        `${encounter.ability.name}: ${Math.ceil(encounter.ability.seconds)}s · leave ${encounter.ability.radius} range`,
        left + 8,
        top + 38,
        cardWidth - 16,
      );
  }
  if (cardCount < ordered.length) {
    const hidden = ordered.slice(cardCount);
    const windups = hidden.filter((encounter) => encounter.ability).length;
    context.fillStyle = '#edf4ff';
    context.fillText(
      `+${hidden.length} encounters${windups ? ` (${windups} active windups)` : ''}`,
      left + 8,
      12 + cardCount * 48 + 13,
      cardWidth - 16,
    );
  }
  context.restore();
}
