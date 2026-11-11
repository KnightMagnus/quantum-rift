import { dockingUpkeepFee } from '../shared/docking-upkeep.ts';
import { recordEconomy, type Account as ReceiptAccount } from '../shared/economy-receipt.ts';

/** Captain state that docking upkeep reads and settles. */
export type UpkeepAccount = ReceiptAccount & {
  /** Current credit balance; upkeep is deducted here. */
  credits: number;
};

/** One docking, as seen by the upkeep charge. */
export type UpkeepDocking = {
  /** List price of the docking hull. */
  hullCost: number;
  /** Stellar id of the port; the fee is recorded on that port's trip receipt. */
  port: string;
  /** True when the captain docks at their own station, which never charges upkeep. */
  ownStation: boolean;
};

/**
 * Charges docking upkeep for one successful landing and records it as a port service fee.
 * Call once, after the landing is accepted. Returns the credits taken (0 when exempt).
 */
export function chargeDockingUpkeep(account: UpkeepAccount, docking: UpkeepDocking): number {
  if (docking.ownStation) return 0;
  const fee = dockingUpkeepFee(docking.hullCost, account.credits);
  if (fee <= 0) return 0;
  account.credits -= fee;
  recordEconomy(account, docking.port, 'serviceFees', fee);
  return fee;
}
