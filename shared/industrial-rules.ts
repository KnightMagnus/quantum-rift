// Provisional industrial tuning. No rate depends on client messages or frame count.
export const INDUSTRIAL = Object.freeze({
  hull: 815,
  sweepRadius: 240,
  cone: (Math.PI * 35) / 180,
  minForward: 20,
  sweepDamage: 1500,
  cooling: 4,
  sweepHeat: 6,
  smelterHeat: 5,
  coronaHeat: 7,
  warning: 70,
  cutoff: 100,
  restart: 65,
  shield: 120,
  critical: 150,
  shieldDrain: 20,
  hullDrain: 8,
  plasmaMs: 3000,
  sourceUnits: 300000,
  renewPerSecond: 15,
  workMs: 10000,
  outputPerInput: 70,
  units: 300,
  droneHull: 718,
  blueprintChance: 0.25,
});
// These are real local collectors, not the distant parallax suns. Outward escape is east.
export const CORONA_BANDS = Object.freeze([
  {
    id: 'meridian-shallow',
    sys: 'meridian',
    name: 'Meridian shallow stellar collector',
    x: 14000,
    y: 14000,
    inner: 1200,
    outer: 2200,
    entry: { x: 15900, y: 14000, a: Math.PI / 2 },
    productive: 15,
    exit: 10,
  },
  {
    id: 'halcyon-shallow',
    sys: 'halcyon',
    name: 'Halcyon shallow stellar collector',
    x: -14000,
    y: 14000,
    inner: 1200,
    outer: 2200,
    entry: { x: -12100, y: 14000, a: Math.PI / 2 },
    productive: 15,
    exit: 10,
  },
]);

export function coronaAt(starSystem: string, positionX: number, positionY: number) {
  return (
    CORONA_BANDS.find(
      (secondValue) =>
        secondValue.sys === starSystem &&
        Math.hypot(positionX - secondValue.x, positionY - secondValue.y) >= secondValue.inner &&
        Math.hypot(positionX - secondValue.x, positionY - secondValue.y) <= secondValue.outer,
    ) || null
  );
}
/**
 * A swept forward cone samples the actual travelled segment, not just its endpoint.
 */
export function inSweep(
  event: { x: number; y: number; a: number; vx: number; vy: number },
  target: { x: number; y: number; r?: number },
  deltaTime: number,
) {
  const screenX = Math.sin(event.a),
    centerY = -Math.cos(event.a),
    length = Math.hypot(event.vx, event.vy) * deltaTime;
  const samples = Math.max(1, Math.ceil(length / 40));
  for (let index = 0; index <= samples; index++) {
    const positionX = target.x - (event.x - (event.vx * deltaTime * index) / samples),
      positionY = target.y - (event.y - (event.vy * deltaTime * index) / samples),
      count = Math.hypot(positionX, positionY);
    if (
      count <= INDUSTRIAL.sweepRadius + (target.r || 0) &&
      (count < 1 ||
        (positionX * screenX + positionY * centerY) / count >= Math.cos(INDUSTRIAL.cone))
    )
      return true;
  }
  return false;
}

/**
 * Conservative autopilot keep-out: route segments must clear the whole collector.
 * A margin includes stock stopping drift; manual harvesting flight remains available.
 */
export function coronaRouteBlocked(
  starSystem: string,
  start: { x: number; y: number },
  endPosition: { x: number; y: number },
  margin: number = 1000,
) {
  const deltaX = endPosition.x - start.x,
    deltaY = endPosition.y - start.y,
    length = deltaX * deltaX + deltaY * deltaY;
  return CORONA_BANDS.some((secondValue) => {
    if (secondValue.sys !== starSystem) return false;
    const time = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((secondValue.x - start.x) * deltaX + (secondValue.y - start.y) * deltaY) / length,
          ),
        )
      : 0;
    return (
      Math.hypot(
        start.x + time * deltaX - secondValue.x,
        start.y + time * deltaY - secondValue.y,
      ) <=
      secondValue.outer + margin
    );
  });
}
