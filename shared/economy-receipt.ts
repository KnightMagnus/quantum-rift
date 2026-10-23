export type DockCosts = {
  port: string;
  purchases: number;
  serviceFees: number;
  sales: number;
  refunds: number;
};
export type TripReceipt = {
  from: string;
  to: string | null;
  departedAt: number;
  arrivedAt: number | null;
  purchases: number;
  serviceFees: number;
  sales: number;
  refunds: number;
};
export type EconomyReceipt = { version: 1; pending: DockCosts | null; trip: TripReceipt | null };
export type Account = { economyReceipt?: EconomyReceipt };
// A small cash-flow recap, not a profit calculator or a second source of credits.

function cashValid(radius: DockCosts | TripReceipt | null) {
  return (
    !radius ||
    (['purchases', 'serviceFees', 'sales', 'refunds'] as const).every(
      (entryKey) => Number.isSafeInteger(radius[entryKey]) && radius[entryKey] >= 0,
    )
  );
}

function valid(economyReceipt: EconomyReceipt | undefined): economyReceipt is EconomyReceipt {
  return (
    !!economyReceipt &&
    economyReceipt.version === 1 &&
    cashValid(economyReceipt.pending) &&
    cashValid(economyReceipt.trip) &&
    (!economyReceipt.pending || typeof economyReceipt.pending.port === 'string') &&
    (!economyReceipt.trip ||
      (typeof economyReceipt.trip.from === 'string' &&
        Number.isSafeInteger(economyReceipt.trip.departedAt) &&
        (economyReceipt.trip.to === null || typeof economyReceipt.trip.to === 'string') &&
        (economyReceipt.trip.arrivedAt === null ||
          Number.isSafeInteger(economyReceipt.trip.arrivedAt))))
  );
}

function state(account: Account): EconomyReceipt {
  if (!valid(account.economyReceipt))
    account.economyReceipt = { version: 1, pending: null, trip: null };
  return account.economyReceipt;
}
/**
 * Record only successful, authoritative settlements. No event can itself issue money.
 */
export function recordEconomy(
  account: Account,
  port: string,
  kind: 'purchases' | 'serviceFees' | 'sales' | 'refunds',
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  const economyReceipt = state(account);
  if (
    ['sales', 'refunds'].includes(kind) &&
    economyReceipt.trip?.arrivedAt != null &&
    economyReceipt.trip.to === port
  ) {
    if (Number.isSafeInteger(economyReceipt.trip[kind] + amount))
      economyReceipt.trip[kind] += amount;
    return;
  }
  if (!economyReceipt.pending || economyReceipt.pending.port !== port)
    economyReceipt.pending = { port, purchases: 0, serviceFees: 0, sales: 0, refunds: 0 };
  if (Number.isSafeInteger(economyReceipt.pending[kind] + amount))
    economyReceipt.pending[kind] += amount;
}
/**
 * Supplies bought at the departure stop belong to the following trip, not the previous sale.
 */
export function beginEconomyTrip(account: Account, port: string, currentTime: number) {
  const economyReceipt = state(account),
    dockCosts = economyReceipt.pending?.port === port ? economyReceipt.pending : null;
  economyReceipt.trip = {
    from: port,
    to: null,
    departedAt: currentTime,
    arrivedAt: null,
    purchases: dockCosts?.purchases || 0,
    serviceFees: dockCosts?.serviceFees || 0,
    sales: dockCosts?.sales || 0,
    refunds: dockCosts?.refunds || 0,
  };
  economyReceipt.pending = null;
}

export function arriveEconomyTrip(account: Account, port: string, currentTime: number) {
  const trip = valid(account.economyReceipt) ? account.economyReceipt.trip : null;
  if (trip && trip.arrivedAt === null) {
    trip.to = port;
    trip.arrivedAt = currentTime;
  }
}
/**
 * Read-only: old saves do not gain state merely because their HUD is rendered.
 */
export function economyReceipt(account: Account) {
  const economyReceipt2 = account.economyReceipt;
  if (!valid(economyReceipt2)) return null;
  const receipt =
    economyReceipt2.trip ||
    (economyReceipt2.pending
      ? {
          ...economyReceipt2.pending,
          from: economyReceipt2.pending.port,
          to: null,
          departedAt: null,
          arrivedAt: null,
        }
      : null);
  if (!receipt) return null;
  return {
    ...receipt,
    net: receipt.sales + receipt.refunds - receipt.purchases - receipt.serviceFees,
  };
}
