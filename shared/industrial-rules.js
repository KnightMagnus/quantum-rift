// @ts-check
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
/** @param {string} sys @param {number} x @param {number} y */
export function coronaAt(sys, x, y) {
  return (
    CORONA_BANDS.find(
      (b) =>
        b.sys === sys &&
        Math.hypot(x - b.x, y - b.y) >= b.inner &&
        Math.hypot(x - b.x, y - b.y) <= b.outer,
    ) || null
  );
}
/** A swept forward cone samples the actual travelled segment, not just its endpoint.
 * @param {{x:number,y:number,a:number,vx:number,vy:number}} e @param {{x:number,y:number,r?:number}} target @param {number} dt */
export function inSweep(e, target, dt) {
  const sx = Math.sin(e.a),
    cy = -Math.cos(e.a),
    length = Math.hypot(e.vx, e.vy) * dt;
  const samples = Math.max(1, Math.ceil(length / 40));
  for (let i = 0; i <= samples; i++) {
    const x = target.x - (e.x - (e.vx * dt * i) / samples),
      y = target.y - (e.y - (e.vy * dt * i) / samples),
      n = Math.hypot(x, y);
    if (
      n <= INDUSTRIAL.sweepRadius + (target.r || 0) &&
      (n < 1 || (x * sx + y * cy) / n >= Math.cos(INDUSTRIAL.cone))
    )
      return true;
  }
  return false;
}

/** Conservative autopilot keep-out: route segments must clear the whole collector.
 * A margin includes stock stopping drift; manual harvesting flight remains available.
 * @param {string} sys @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} end @param {number} [margin] */
export function coronaRouteBlocked(sys, start, end, margin = 1000) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = dx * dx + dy * dy;
  return CORONA_BANDS.some((b) => {
    if (b.sys !== sys) return false;
    const t = length
      ? Math.max(0, Math.min(1, ((b.x - start.x) * dx + (b.y - start.y) * dy) / length))
      : 0;
    return Math.hypot(start.x + t * dx - b.x, start.y + t * dy - b.y) <= b.outer + margin;
  });
}
