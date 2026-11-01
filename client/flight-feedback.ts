import type { FlightFeedback } from '../server/flight-feedback.ts';
/** Finite-ammo mount readout; infinite weapons never produce a warning. */
export function ammoReadout(name: string, count: number | undefined): string {
  return `${name}: ${count ?? '?'}${count === 0 ? ' — EMPTY' : count !== undefined && count <= 5 ? ' — LOW' : ''}`;
}
/** Persistent rescue guidance uses only the latest authoritative same-system contacts. */
export function rescueReadout(feedback: FlightFeedback | undefined, x: number, y: number): string {
  if (!feedback) return '';
  const distance = (contact: FlightFeedback['contacts'][number]) =>
    Math.hypot(contact.x - x, contact.y - y);
  if (feedback.rescueSeconds > 0) {
    const rescuer = feedback.contacts
      .filter((contact) => contact.canRescue)
      .sort((left, right) => distance(left) - distance(right))[0];
    return `DISABLED · Rescue: ${feedback.rescueSeconds}s${rescuer ? ` · Nearest rescuer: ${rescuer.name}, ${Math.round(distance(rescuer) / 45) / 10} km` : ' · No eligible rescuer in this system'}`;
  }
  return feedback.contacts
    .filter((contact) => contact.rescueSeconds > 0)
    .map(
      (contact) =>
        `RESCUE ${contact.name}: ${contact.rescueSeconds}s · ${Math.round(distance(contact) / 45) / 10} km · Target and board to repair`,
    )
    .join(' | ');
}
/** Clamps an offscreen contact to the viewport edge, pointing toward its real position. */
export function contactEdge(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; angle: number } | null {
  const margin = Math.min(60, width / 4, height / 4);
  if (x >= margin && x <= width - margin && y >= margin && y <= height - margin) return null;
  const dx = x - width / 2,
    dy = y - height / 2;
  const scale = Math.min(
    (width / 2 - margin) / Math.max(Math.abs(dx), 0.001),
    (height / 2 - margin) / Math.max(Math.abs(dy), 0.001),
  );
  return { x: width / 2 + dx * scale, y: height / 2 + dy * scale, angle: Math.atan2(dy, dx) };
}
