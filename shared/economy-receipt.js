// @ts-check
// A small cash-flow recap, not a profit calculator or a second source of credits.
/** @typedef {{port:string,purchases:number,serviceFees:number,sales:number,refunds:number}} DockCosts */
/** @typedef {{from:string,to:string|null,departedAt:number,arrivedAt:number|null,purchases:number,serviceFees:number,sales:number,refunds:number}} TripReceipt */
/** @typedef {{version:1,pending:DockCosts|null,trip:TripReceipt|null}} EconomyReceipt */
/** @typedef {{economyReceipt?:EconomyReceipt}} Account */
/** @param {DockCosts|TripReceipt|null} r */
function cashValid(r) {
  return (
    !r ||
    /** @type {const} */ (['purchases', 'serviceFees', 'sales', 'refunds']).every(
      (k) => Number.isSafeInteger(r[k]) && r[k] >= 0,
    )
  );
}
/** @param {EconomyReceipt|undefined} e @returns {e is EconomyReceipt} */
function valid(e) {
  return (
    !!e &&
    e.version === 1 &&
    cashValid(e.pending) &&
    cashValid(e.trip) &&
    (!e.pending || typeof e.pending.port === 'string') &&
    (!e.trip ||
      (typeof e.trip.from === 'string' &&
        Number.isSafeInteger(e.trip.departedAt) &&
        (e.trip.to === null || typeof e.trip.to === 'string') &&
        (e.trip.arrivedAt === null || Number.isSafeInteger(e.trip.arrivedAt))))
  );
}
/** @param {Account} d @returns {EconomyReceipt} */
function state(d) {
  if (!valid(d.economyReceipt)) d.economyReceipt = { version: 1, pending: null, trip: null };
  return d.economyReceipt;
}
/** Record only successful, authoritative settlements. No event can itself issue money.
 * @param {Account} d @param {string} port @param {'purchases'|'serviceFees'|'sales'|'refunds'} kind @param {number} amount */
export function recordEconomy(d, port, kind, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  const e = state(d);
  if (['sales', 'refunds'].includes(kind) && e.trip?.arrivedAt != null && e.trip.to === port) {
    if (Number.isSafeInteger(e.trip[kind] + amount)) e.trip[kind] += amount;
    return;
  }
  if (!e.pending || e.pending.port !== port)
    e.pending = { port, purchases: 0, serviceFees: 0, sales: 0, refunds: 0 };
  if (Number.isSafeInteger(e.pending[kind] + amount)) e.pending[kind] += amount;
}
/** Supplies bought at the departure stop belong to the following trip, not the previous sale.
 * @param {Account} d @param {string} port @param {number} now */
export function beginEconomyTrip(d, port, now) {
  const e = state(d),
    p = e.pending?.port === port ? e.pending : null;
  e.trip = {
    from: port,
    to: null,
    departedAt: now,
    arrivedAt: null,
    purchases: p?.purchases || 0,
    serviceFees: p?.serviceFees || 0,
    sales: p?.sales || 0,
    refunds: p?.refunds || 0,
  };
  e.pending = null;
}
/** @param {Account} d @param {string} port @param {number} now */
export function arriveEconomyTrip(d, port, now) {
  const trip = valid(d.economyReceipt) ? d.economyReceipt.trip : null;
  if (trip && trip.arrivedAt === null) {
    trip.to = port;
    trip.arrivedAt = now;
  }
}
/** Read-only: old saves do not gain state merely because their HUD is rendered.
 * @param {Account} d */
export function economyReceipt(d) {
  const e = d.economyReceipt;
  if (!valid(e)) return null;
  const receipt =
    e.trip ||
    (e.pending
      ? { ...e.pending, from: e.pending.port, to: null, departedAt: null, arrivedAt: null }
      : null);
  if (!receipt) return null;
  return {
    ...receipt,
    net: receipt.sales + receipt.refunds - receipt.purchases - receipt.serviceFees,
  };
}
