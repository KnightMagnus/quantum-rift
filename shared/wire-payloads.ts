import { wireRecord } from './wire-actions.ts';

/** Shared envelopes preserve precise application payloads without importing implementations. */
export type StateMessage<Player, Landed> = { t: 'you'; d: Player } | (Landed & { t: 'landed' });

/** Bound traversal as well as individual fields; this is not a full nested state schema. */
function boundedTree(value: unknown, budget: { remaining: number }, depth = 0): boolean {
  if (--budget.remaining < 0 || depth > 24) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 65536;
  if (Array.isArray(value))
    return value.length <= 8192 && value.every((entry) => boundedTree(entry, budget, depth + 1));
  if (!wireRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length <= 8192 &&
    keys.every(
      (key) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        boundedTree(value[key], budget, depth + 1),
    )
  );
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 200;
function numericRecord(value: unknown): boolean {
  return wireRecord(value) && Object.values(value).every(finite);
}
/** Validate economic state headers and quote fields before either transport reaches the UI.
 * Other nested state remains application-typed, not runtime schema-validated.
 */
export function validEconomicPayload(value: unknown): boolean {
  if (!wireRecord(value)) return false;
  if (!['you', 'landed', 'refineryQuote', 'refineryFuelQuote'].includes(String(value.t)))
    return true;
  if (!boundedTree(value, { remaining: 100000 })) return false;
  if (value.t === 'you') {
    const player = value.d;
    return (
      wireRecord(player) &&
      text(player.name) &&
      text(player.sys) &&
      finite(player.credits) &&
      numericRecord(player.cargo) &&
      wireRecord(player.ship)
    );
  }
  if (value.t === 'landed')
    return (
      text(value.stellar) &&
      Array.isArray(value.offers) &&
      Array.isArray(value.mats) &&
      ['yard', 'outfitter'].every((key) => value[key] === null || Array.isArray(value[key]))
    );
  const quote = value.quote;
  if (!wireRecord(quote) || !text(quote.id) || !text(quote.owner)) return false;
  if (value.t === 'refineryFuelQuote')
    return (
      text(quote.ship) &&
      ['n', 'gain', 'before', 'capacity', 'issuedAt', 'expires'].every((key) => finite(quote[key]))
    );
  return (
    ['port', 'recipe', 'mode', 'output', 'fingerprint'].every((key) => text(quote[key])) &&
    quote.version === 1 &&
    [
      'inputTonnes',
      'units',
      'fee',
      'cancelFee',
      'expires',
      'duration',
      'recovery',
      'ask',
      'bid',
    ].every((key) => finite(quote[key])) &&
    (quote.preview === undefined || typeof quote.preview === 'boolean') &&
    Array.isArray(quote.inputs) &&
    quote.inputs.length <= 32 &&
    quote.inputs.every(
      (input) =>
        wireRecord(input) &&
        text(input.cid) &&
        wireRecord(input.lots) &&
        Object.keys(input.lots).length === 3 &&
        ['common', 'rich', 'pure'].every(
          (grade) =>
            Number.isSafeInteger((input.lots as Record<string, unknown>)[grade]) &&
            Number((input.lots as Record<string, unknown>)[grade]) >= 0,
        ),
    )
  );
}
