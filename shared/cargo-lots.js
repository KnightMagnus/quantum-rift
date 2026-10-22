/** @import { CargoOwner } from './cargo-contracts.js' */

// @ts-check
/** Pure integer-tonne accounting. Totals stay authoritative; corrupt ledgers fail closed.
 * No time, RNG, capacity calculation, crate quality or field richness belongs here.
 * @typedef {import('./cargo-contracts.js').CargoTotals} CargoTotals
 * @typedef {import('./cargo-contracts.js').CargoLedger} CargoLedger
 * @typedef {import('./cargo-contracts.js').GradeLots} GradeLots
 * @typedef {import('./cargo-contracts.js').LotTransfer} LotTransfer
 */
export const RAW_COMMODITIES = Object.freeze(['ore', 'gas', 'shards']);
export const RAW_GRADES = Object.freeze(/** @type {const} */ (['common', 'rich', 'pure']));
const forbidden = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
/** @param {unknown} value @returns {asserts value is Record<string, any>} */
function record(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error('Cargo ledger: expected plain record');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbidden.has(key)) throw new Error('Cargo ledger: unsafe key');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new Error('Cargo ledger: expected serializable data properties');
  }
}
/** Owner validation is limited to inventory fields: real players have unrelated data/methods.
 * @param {CargoOwner} player
 */
function owner(player) {
  if (
    !player ||
    typeof player !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(player))
  )
    throw new Error('Cargo ledger: expected plain record');
  for (const key of ['cargo', 'storage', 'cargoLots', 'storageLots']) {
    const descriptor = Object.getOwnPropertyDescriptor(player, key);
    if (descriptor && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))
      throw new Error('Cargo ledger: expected serializable data properties');
  }
}
/** Check the real assignment target before any transaction writes.
 * @param {object} target @param {string} key
 */
function writable(target, key) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (
    descriptor
      ? !Object.hasOwn(descriptor, 'value') || !descriptor.writable
      : !Object.isExtensible(target)
  )
    throw new Error('Cargo ledger: destination is not writable');
}
/** @param {CargoTotals} totals @param {CargoLedger} ledger @param {string} cid */
function writableLots(totals, ledger, cid) {
  writable(totals, cid);
  if (RAW_COMMODITIES.includes(cid)) writable(ledger.byCommodity, cid);
}
/** @param {number} value */
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Cargo ledger: invalid quantity');
}
/** @param {string} cid */
function commodity(cid) {
  if (typeof cid !== 'string' || !cid || forbidden.has(cid))
    throw new Error('Cargo ledger: unsafe commodity');
}
/** @returns {GradeLots} */
const empty = () => ({ common: 0, rich: 0, pure: 0 });
/** @param {GradeLots} lots */
function sum(lots) {
  return lots.common + lots.rich + lots.pure;
}
/** @param {unknown} value @returns {asserts value is GradeLots} */
function grades(value) {
  record(value);
  if (Reflect.ownKeys(value).length !== 3 || RAW_GRADES.some((g) => !Object.hasOwn(value, g)))
    throw new Error('Cargo ledger: expected common/rich/pure only');
  for (const g of RAW_GRADES) count(value[g]);
  count(sum(/** @type {GradeLots} */ (value)));
}
/** @param {CargoTotals} totals @param {CargoLedger} ledger */
export function assertLots(totals, ledger) {
  record(totals);
  record(ledger);
  for (const qty of Object.values(totals)) count(qty);
  if (
    ledger.version !== 1 ||
    Object.keys(ledger).some((k) => !['version', 'byCommodity'].includes(k))
  )
    throw new Error('Cargo ledger: unsupported version/schema');
  record(ledger.byCommodity);
  for (const [cid, lots] of Object.entries(ledger.byCommodity)) {
    if (!RAW_COMMODITIES.includes(cid))
      throw new Error('Cargo ledger: unsupported graded commodity');
    grades(lots);
  }
  for (const cid of RAW_COMMODITIES) {
    const lots = ledger.byCommodity[cid];
    if (sum(lots || empty()) !== (totals[cid] || 0))
      throw new Error('Cargo ledger: aggregate mismatch for ' + cid);
  }
}
/** Both cargo and storage validate before either migration is committed.
 * Missing legacy records become common. Existing valid records are never rewritten.
 * @param {CargoOwner} player
 * @returns {{changed:boolean}}
 */
export function migrateCargoLots(player) {
  owner(player);
  const pairs = /** @type {const} */ ([
    ['cargo', 'cargoLots'],
    ['storage', 'storageLots'],
  ]);
  const pending = [];
  for (const [totalKey, lotKey] of pairs) {
    const totals = player[totalKey] === undefined ? {} : player[totalKey];
    record(totals);
    let ledger = player[lotKey];
    if (ledger === undefined) {
      ledger = { version: 1, byCommodity: {} };
      for (const cid of RAW_COMMODITIES)
        if (totals[cid]) ledger.byCommodity[cid] = { common: totals[cid], rich: 0, pure: 0 };
      pending.push({ totalKey, lotKey, totals, ledger });
    }
    assertLots(totals, ledger);
  }
  for (const p of pending) {
    writable(player, p.totalKey);
    writable(player, p.lotKey);
  }
  for (const p of pending) {
    player[p.totalKey] = p.totals;
    player[p.lotKey] = p.ledger;
  }
  return { changed: pending.length > 0 };
}
/** @param {CargoTotals} totals @param {CargoLedger} ledger @param {string} cid @returns {GradeLots} */
function owned(totals, ledger, cid) {
  return RAW_COMMODITIES.includes(cid)
    ? { ...(ledger.byCommodity[cid] || empty()) }
    : { common: totals[cid] || 0, rich: 0, pure: 0 };
}
/** Select up to qty in deterministic common -> rich -> pure order; no rolls.
 * @param {GradeLots} available @param {number} qty @returns {GradeLots}
 */
export function splitLots(available, qty) {
  grades(available);
  count(qty);
  if (qty > sum(available)) throw new Error('Cargo ledger: insufficient lots');
  const selected = empty();
  for (const g of RAW_GRADES) {
    selected[g] = Math.min(qty, available[g]);
    qty -= selected[g];
  }
  return selected;
}
/** @type {WeakMap<LotTransfer, {totals:CargoTotals, ledger:CargoLedger, before:GradeLots}>} */
const plans = new WeakMap();
/** Plans are immutable, process-local and single use. Explicit selection is never substituted.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {string} cid @param {number} qty
 * @param {GradeLots|'common-first'} [selection='common-first'] @returns {LotTransfer}
 */
export function planTake(totals, ledger, cid, qty, selection = 'common-first') {
  commodity(cid);
  count(qty);
  assertLots(totals, ledger);
  const before = owned(totals, ledger, cid);
  if (selection !== 'common-first') grades(selection);
  const selected = selection === 'common-first' ? splitLots(before, qty) : { ...selection };
  grades(selected);
  if (sum(selected) !== qty || RAW_GRADES.some((g) => selected[g] > before[g]))
    throw new Error('Cargo ledger: unavailable grade selection');
  const plan = Object.freeze({ cid, qty, grades: Object.freeze(selected) });
  plans.set(plan, { totals, ledger, before });
  return plan;
}
/** @param {CargoTotals} totals @param {CargoLedger} ledger @param {string} cid @param {GradeLots} lots */
function write(totals, ledger, cid, lots) {
  writableLots(totals, ledger, cid);
  totals[cid] = sum(lots);
  if (RAW_COMMODITIES.includes(cid)) ledger.byCommodity[cid] = lots;
}
/** Revalidates against current inventory and rejects forged/reused/stale plans without mutation.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {LotTransfer} plan @returns {LotTransfer}
 */
export function applyTake(totals, ledger, plan) {
  const saved = plans.get(plan);
  if (!saved || saved.totals !== totals || saved.ledger !== ledger)
    throw new Error('Cargo ledger: stale or untrusted withdrawal plan');
  assertLots(totals, ledger);
  const current = owned(totals, ledger, plan.cid);
  if (RAW_GRADES.some((g) => current[g] !== saved.before[g]))
    throw new Error('Cargo ledger: stale or untrusted withdrawal plan');
  if (plan.qty === 0) {
    plans.delete(plan);
    return plan;
  }
  const next = empty();
  for (const g of RAW_GRADES) next[g] = current[g] - plan.grades[g];
  write(totals, ledger, plan.cid, next);
  plans.delete(plan);
  return plan;
}
/** @param {LotTransfer} transfer */
function validateTransfer(transfer) {
  record(transfer);
  commodity(transfer.cid);
  count(transfer.qty);
  grades(transfer.grades);
  if (
    sum(transfer.grades) !== transfer.qty ||
    (!RAW_COMMODITIES.includes(transfer.cid) && (transfer.grades.rich || transfer.grades.pure))
  )
    throw new Error('Cargo ledger: invalid transfer');
}
/** All-or-nothing credit. room is remaining capacity from authoritative holdUsed,
 * including jobCargo; Infinity explicitly means unbounded storage. Partial callers
 * must split once-resolved lots first, retaining their exact remainder externally.
 * @param {CargoTotals} totals @param {CargoLedger} ledger @param {LotTransfer} transfer @param {number} [room=Infinity]
 */
export function addLots(totals, ledger, transfer, room = Infinity) {
  assertLots(totals, ledger);
  validateTransfer(transfer);
  if (room !== Infinity) count(room);
  if (transfer.qty > room) throw new Error('Cargo ledger: capacity exceeded');
  if (transfer.qty === 0) return;
  const next = owned(totals, ledger, transfer.cid);
  for (const g of RAW_GRADES) {
    next[g] += transfer.grades[g];
    count(next[g]);
  }
  count(sum(next));
  write(totals, ledger, transfer.cid, next);
}
/** Preflight quantities on copies and real destinations before debiting source; no await/callback in commit.
 * @param {CargoTotals} source @param {CargoLedger} sourceLedger
 * @param {CargoTotals} target @param {CargoLedger} targetLedger
 * @param {string} cid @param {number} qty @param {GradeLots|'common-first'} [selection]
 * @param {number} [room=Infinity] @returns {LotTransfer}
 */
export function moveLots(
  source,
  sourceLedger,
  target,
  targetLedger,
  cid,
  qty,
  selection = 'common-first',
  room = Infinity,
) {
  assertLots(target, targetLedger);
  if (
    source === target ||
    sourceLedger === targetLedger ||
    sourceLedger.byCommodity === targetLedger.byCommodity
  )
    throw new Error('Cargo ledger: aliased transfer');
  const plan = planTake(source, sourceLedger, cid, qty, selection);
  const trialTotals = { ...target },
    trialLedger = structuredClone(targetLedger);
  addLots(trialTotals, trialLedger, plan, room);
  if (qty !== 0) {
    writableLots(source, sourceLedger, cid);
    writableLots(target, targetLedger, cid);
  }
  applyTake(source, sourceLedger, plan);
  if (qty === 0) return plan;
  write(target, targetLedger, cid, owned(trialTotals, trialLedger, cid));
  return plan;
}
/** @param {CargoTotals} totals @param {CargoLedger} ledger */
export function clearLots(totals, ledger) {
  assertLots(totals, ledger);
  for (const cid of Object.keys(totals)) {
    if (!Object.getOwnPropertyDescriptor(totals, cid)?.configurable)
      throw new Error('Cargo ledger: destination is not configurable');
  }
  writable(ledger, 'byCommodity');
  for (const cid of Object.keys(totals)) delete totals[cid];
  ledger.byCommodity = {};
}
/** Legacy new production (not a reconstruction of a premium withdrawal).
 * @param {string} cid @param {number} qty @returns {LotTransfer}
 */
export function commonLots(cid, qty) {
  commodity(cid);
  count(qty);
  return { cid, qty, grades: { common: qty, rich: 0, pure: 0 } };
}
