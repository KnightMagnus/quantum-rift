import type { CargoOwner } from './cargo-contracts.ts';
export type CargoTotals = import('./cargo-contracts.ts').CargoTotals;
export type CargoLedger = import('./cargo-contracts.ts').CargoLedger;
export type GradeLots = import('./cargo-contracts.ts').GradeLots;
export type LotTransfer = import('./cargo-contracts.ts').LotTransfer;
/** Pure integer-tonne accounting. Totals stay authoritative; corrupt ledgers fail closed.
 * No time, RNG, capacity calculation, crate quality or field richness belongs here.
 * @typedef {import('./cargo-contracts.ts').CargoTotals} CargoTotals
 * @typedef {import('./cargo-contracts.ts').CargoLedger} CargoLedger
 * @typedef {import('./cargo-contracts.ts').GradeLots} GradeLots
 * @typedef {import('./cargo-contracts.ts').LotTransfer} LotTransfer
 */
export const RAW_COMMODITIES = Object.freeze(['ore', 'gas', 'shards']);
export const RAW_GRADES = Object.freeze(['common', 'rich', 'pure'] as const);
const forbidden = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

function record(value: unknown): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error('Cargo ledger: expected plain record');
  for (const ownKey of Reflect.ownKeys(value)) {
    if (typeof ownKey !== 'string' || forbidden.has(ownKey))
      throw new Error('Cargo ledger: unsafe key');
    const descriptor = Object.getOwnPropertyDescriptor(value, ownKey);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new Error('Cargo ledger: expected serializable data properties');
  }
}
/** Owner validation is limited to inventory fields: real players have unrelated data/methods.
 * @param {CargoOwner} player
 */
function owner(player: CargoOwner) {
  if (
    !player ||
    typeof player !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(player))
  )
    throw new Error('Cargo ledger: expected plain record');
  for (const entryKey of ['cargo', 'storage', 'cargoLots', 'storageLots']) {
    const descriptor = Object.getOwnPropertyDescriptor(player, entryKey);
    if (descriptor && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))
      throw new Error('Cargo ledger: expected serializable data properties');
  }
}
/** Check the real assignment target before any transaction writes.
 * @param {object} target @param {string} entryKey
 */
function writable(target: object, entryKey: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, entryKey);
  if (
    descriptor
      ? !Object.hasOwn(descriptor, 'value') || !descriptor.writable
      : !Object.isExtensible(target)
  )
    throw new Error('Cargo ledger: destination is not writable');
}

function writableLots(totals: CargoTotals, ledger: CargoLedger, captainId: string) {
  writable(totals, captainId);
  if (RAW_COMMODITIES.includes(captainId)) writable(ledger.byCommodity, captainId);
}

function count(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('Cargo ledger: invalid quantity');
}

function commodity(captainId: string) {
  if (typeof captainId !== 'string' || !captainId || forbidden.has(captainId))
    throw new Error('Cargo ledger: unsafe commodity');
}

const empty = () => ({ common: 0, rich: 0, pure: 0 });

function sumValues(lots: GradeLots) {
  return lots.common + lots.rich + lots.pure;
}

function grades(value: unknown): asserts value is GradeLots {
  record(value);
  if (Reflect.ownKeys(value).length !== 3 || RAW_GRADES.some((game) => !Object.hasOwn(value, game)))
    throw new Error('Cargo ledger: expected common/rich/pure only');
  for (const rAW_GRADES of RAW_GRADES) count(value[rAW_GRADES]);
  count(sumValues(value as GradeLots));
}

export function assertLots(totals: CargoTotals, ledger: CargoLedger) {
  record(totals);
  record(ledger);
  for (const quantity of Object.values(totals)) count(quantity);
  if (
    ledger.version !== 1 ||
    Object.keys(ledger).some((entryKey) => !['version', 'byCommodity'].includes(entryKey))
  )
    throw new Error('Cargo ledger: unsupported version/schema');
  record(ledger.byCommodity);
  for (const [captainId, lots] of Object.entries(ledger.byCommodity)) {
    if (!RAW_COMMODITIES.includes(captainId))
      throw new Error('Cargo ledger: unsupported graded commodity');
    grades(lots);
  }
  for (const rAW_COMMODITIES of RAW_COMMODITIES) {
    const lots = ledger.byCommodity[rAW_COMMODITIES];
    if (sumValues(lots || empty()) !== (totals[rAW_COMMODITIES] || 0))
      throw new Error('Cargo ledger: aggregate mismatch for ' + rAW_COMMODITIES);
  }
}
/** Both cargo and storage validate before either migration is committed.
 * Missing legacy records become common. Existing valid records are never rewritten.
 * @param {CargoOwner} player
 * @returns {{changed:boolean}}
 */
export function migrateCargoLots(player: CargoOwner): { changed: boolean } {
  owner(player);
  const pairs = [
    ['cargo', 'cargoLots'],
    ['storage', 'storageLots'],
  ] as const;
  const pending = [];
  for (const [totalKey, lotKey] of pairs) {
    const totals = player[totalKey] === undefined ? {} : player[totalKey];
    record(totals);
    let ledger = player[lotKey];
    if (ledger === undefined) {
      ledger = { version: 1, byCommodity: {} };
      for (const rAW_COMMODITIES of RAW_COMMODITIES)
        if (totals[rAW_COMMODITIES])
          ledger.byCommodity[rAW_COMMODITIES] = {
            common: totals[rAW_COMMODITIES],
            rich: 0,
            pure: 0,
          };
      pending.push({ totalKey, lotKey, totals, ledger });
    }
    assertLots(totals, ledger);
  }
  for (const pending2 of pending) {
    writable(player, pending2.totalKey);
    writable(player, pending2.lotKey);
  }
  for (const pending3 of pending) {
    player[pending3.totalKey] = pending3.totals;
    player[pending3.lotKey] = pending3.ledger;
  }
  return { changed: pending.length > 0 };
}

function owned(totals: CargoTotals, ledger: CargoLedger, captainId: string): GradeLots {
  return RAW_COMMODITIES.includes(captainId)
    ? { ...(ledger.byCommodity[captainId] || empty()) }
    : { common: totals[captainId] || 0, rich: 0, pure: 0 };
}
/** Select up to qty in deterministic common -> rich -> pure order; no rolls.
 * @param {GradeLots} available @param {number} quantity @returns {GradeLots}
 */
export function splitLots(available: GradeLots, quantity: number): GradeLots {
  grades(available);
  count(quantity);
  if (quantity > sumValues(available)) throw new Error('Cargo ledger: insufficient lots');
  const selected = empty();
  for (const rAW_GRADES of RAW_GRADES) {
    selected[rAW_GRADES] = Math.min(quantity, available[rAW_GRADES]);
    quantity -= selected[rAW_GRADES];
  }
  return selected;
}

const plans: WeakMap<LotTransfer, { totals: CargoTotals; ledger: CargoLedger; before: GradeLots }> =
  new WeakMap();
/** Plans are immutable, process-local and single use. Explicit selection is never substituted.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {string} captainId @param {number} quantity
 * @param {GradeLots|'common-first'} [selection='common-first'] @returns {LotTransfer}
 */
export function planTake(
  totals: CargoTotals,
  ledger: CargoLedger,
  captainId: string,
  quantity: number,
  selection: GradeLots | 'common-first' = 'common-first',
): LotTransfer {
  commodity(captainId);
  count(quantity);
  assertLots(totals, ledger);
  const before = owned(totals, ledger, captainId);
  if (selection !== 'common-first') grades(selection);
  const selected = selection === 'common-first' ? splitLots(before, quantity) : { ...selection };
  grades(selected);
  if (sumValues(selected) !== quantity || RAW_GRADES.some((game) => selected[game] > before[game]))
    throw new Error('Cargo ledger: unavailable grade selection');
  const plan = Object.freeze({ cid: captainId, qty: quantity, grades: Object.freeze(selected) });
  plans.set(plan, { totals, ledger, before });
  return plan;
}

function write(totals: CargoTotals, ledger: CargoLedger, captainId: string, lots: GradeLots) {
  writableLots(totals, ledger, captainId);
  totals[captainId] = sumValues(lots);
  if (RAW_COMMODITIES.includes(captainId)) ledger.byCommodity[captainId] = lots;
}
/** Revalidates against current inventory and rejects forged/reused/stale plans without mutation.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {LotTransfer} plan @returns {LotTransfer}
 */
export function applyTake(
  totals: CargoTotals,
  ledger: CargoLedger,
  plan: LotTransfer,
): LotTransfer {
  const saved = plans.get(plan);
  if (!saved || saved.totals !== totals || saved.ledger !== ledger)
    throw new Error('Cargo ledger: stale or untrusted withdrawal plan');
  assertLots(totals, ledger);
  const current = owned(totals, ledger, plan.cid);
  if (RAW_GRADES.some((game) => current[game] !== saved.before[game]))
    throw new Error('Cargo ledger: stale or untrusted withdrawal plan');
  if (plan.qty === 0) {
    plans.delete(plan);
    return plan;
  }
  const next = empty();
  for (const rAW_GRADES of RAW_GRADES)
    next[rAW_GRADES] = current[rAW_GRADES] - plan.grades[rAW_GRADES];
  write(totals, ledger, plan.cid, next);
  plans.delete(plan);
  return plan;
}

function validateTransfer(transfer: LotTransfer) {
  record(transfer);
  commodity(transfer.cid);
  count(transfer.qty);
  grades(transfer.grades);
  if (
    sumValues(transfer.grades) !== transfer.qty ||
    (!RAW_COMMODITIES.includes(transfer.cid) && (transfer.grades.rich || transfer.grades.pure))
  )
    throw new Error('Cargo ledger: invalid transfer');
}
/** All-or-nothing credit. room is remaining capacity from authoritative holdUsed,
 * including jobCargo; Infinity explicitly means unbounded storage. Partial callers
 * must split once-resolved lots first, retaining their exact remainder externally.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {LotTransfer} transfer @param {number} [room=Infinity]
 */
export function addLots(
  totals: CargoTotals,
  ledger: CargoLedger,
  transfer: LotTransfer,
  room: number = Infinity,
) {
  assertLots(totals, ledger);
  validateTransfer(transfer);
  if (room !== Infinity) count(room);
  if (transfer.qty > room) throw new Error('Cargo ledger: capacity exceeded');
  if (transfer.qty === 0) return;
  const next = owned(totals, ledger, transfer.cid);
  for (const rAW_GRADES of RAW_GRADES) {
    next[rAW_GRADES] += transfer.grades[rAW_GRADES];
    count(next[rAW_GRADES]);
  }
  count(sumValues(next));
  write(totals, ledger, transfer.cid, next);
}
/** Preflight quantities on copies and real destinations before debiting source; no await/callback in commit.
 * @param {CargoTotals} source @param {CargoLedger} sourceLedger
 * @param {CargoTotals} target @param {CargoLedger} targetLedger
 * @param {string} captainId @param {number} quantity @param {GradeLots|'common-first'} [selection]
 * @param {number} [room=Infinity] @returns {LotTransfer}
 */
export function moveLots(
  source: CargoTotals,
  sourceLedger: CargoLedger,
  target: CargoTotals,
  targetLedger: CargoLedger,
  captainId: string,
  quantity: number,
  selection: GradeLots | 'common-first' = 'common-first',
  room: number = Infinity,
): LotTransfer {
  assertLots(target, targetLedger);
  if (
    source === target ||
    sourceLedger === targetLedger ||
    sourceLedger.byCommodity === targetLedger.byCommodity
  )
    throw new Error('Cargo ledger: aliased transfer');
  const plan = planTake(source, sourceLedger, captainId, quantity, selection);
  const trialTotals = { ...target },
    trialLedger = structuredClone(targetLedger);
  addLots(trialTotals, trialLedger, plan, room);
  if (quantity !== 0) {
    writableLots(source, sourceLedger, captainId);
    writableLots(target, targetLedger, captainId);
  }
  applyTake(source, sourceLedger, plan);
  if (quantity === 0) return plan;
  write(target, targetLedger, captainId, owned(trialTotals, trialLedger, captainId));
  return plan;
}

export function clearLots(totals: CargoTotals, ledger: CargoLedger) {
  assertLots(totals, ledger);
  for (const captainId of Object.keys(totals)) {
    if (!Object.getOwnPropertyDescriptor(totals, captainId)?.configurable)
      throw new Error('Cargo ledger: destination is not configurable');
  }
  writable(ledger, 'byCommodity');
  for (const captainId of Object.keys(totals)) delete totals[captainId];
  ledger.byCommodity = {};
}
/** Legacy new production (not a reconstruction of a premium withdrawal).
 * @param {string} captainId @param {number} quantity @returns {LotTransfer}
 */
export function commonLots(captainId: string, quantity: number): LotTransfer {
  commodity(captainId);
  count(quantity);
  return { cid: captainId, qty: quantity, grades: { common: quantity, rich: 0, pure: 0 } };
}
