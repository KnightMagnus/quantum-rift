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

/** Common non-economic receive headers. Nested feature state remains owner-typed. */
export function validServerEnvelope(value: unknown): boolean {
  if (!wireRecord(value) || !text(value.t) || !boundedTree(value, { remaining: 100000 }))
    return false;
  if (!validEconomicPayload(value)) return false;
  const optional = (key: string, check: (entry: unknown) => boolean) =>
    value[key] === undefined || check(value[key]);
  const prose = (entry: unknown) => typeof entry === 'string' && entry.length <= 65536;
  const array = Array.isArray;
  const recordOrNull = (entry: unknown) => entry === null || wireRecord(entry);
  switch (value.t) {
    case 'welcome':
      return text(value.name);
    case 'error':
    case 'toast':
      return prose(value.msg);
    case 'paused':
      return typeof value.on === 'boolean';
    case 'portrait':
      return (
        typeof value.ok === 'boolean' &&
        optional('portraitId', text) &&
        optional('portraitRequestId', text)
      );
    case 'space':
      return finite(value.id) && text(value.sys) && optional('rocks', array);
    case 'chat':
      return (
        prose(value.msg) &&
        optional('sys', (entry) => entry === null || text(entry)) &&
        optional('ship', finite) &&
        optional('from', text) &&
        optional('ch', text)
      );
    case 'story':
      // Completed job/quest notices have no action ID; choices still need one.
      return (
        (text(value.id) ||
          (value.id === undefined &&
            value.done === true &&
            (value.choices === undefined ||
              (Array.isArray(value.choices) && value.choices.length === 0)))) &&
        prose(value.title) &&
        prose(value.text) &&
        optional(
          'choices',
          (entry) =>
            Array.isArray(entry) &&
            entry.length <= 64 &&
            entry.every(
              (choice) => wireRecord(choice) && text(choice.value) && prose(choice.label),
            ),
        )
      );
    case 'hail':
      return (
        optional('who', prose) &&
        optional('text', prose) &&
        optional(
          'opts',
          (entry) =>
            Array.isArray(entry) &&
            entry.length <= 64 &&
            entry.every((choice) => wireRecord(choice) && text(choice.k) && prose(choice.label)),
        )
      );
    case 'dm':
      return text(value.from) && text(value.to) && prose(value.msg);
    case 'dms':
      return (
        Array.isArray(value.list) &&
        value.list.every(
          (entry) =>
            wireRecord(entry) &&
            text(entry.from) &&
            prose(entry.msg) &&
            (entry.at === undefined || finite(entry.at)),
        )
      );
    case 'social':
      return optional('social', recordOrNull) && optional('armada', recordOrNull);
    case 'trade2':
      return recordOrNull(value.trade);
    case 'armadaContract':
      return recordOrNull(value.plan);
    case 'rally':
      return text(value.sys) && text(value.from);
    case 'follow':
      return text(value.to) && text(value.leader);
    case 'order':
      return text(value.o);
    case 'rivals':
      return Array.isArray(value.list);
    case 'boards':
      return text(value.cat) && Array.isArray(value.list);
    case 'profile':
      return recordOrNull(value.p);
    case 'notify':
      return prose(value.title) && prose(value.body);
    case 'dead':
      return text(value.at) && finite(value.fee);
    case 'hailmark':
      // The hail owner clears an active marker with only { until: 0 }.
      return (
        finite(value.until) &&
        (value.until === 0
          ? optional('x', finite) && optional('y', finite) && optional('label', text)
          : finite(value.x) && finite(value.y) && text(value.label))
      );
    case 'hailinbox':
      return optional('entries', array) && optional('allow', (entry) => typeof entry === 'boolean');
    case 'refinery':
      return optional('op', text) && wireRecord(value.data);
    case 'refineryError':
      return text(value.op);
    // Snapshot tuple schemas are checked by the connection's prediction boundary.
    // These owners retain their nested feature schemas and compatibility fields.
    case 'snap':
    case 'scene':
    case 'world':
    case 'sites':
    case 'arena':
    case 'pong':
    case 'you':
    case 'landed':
    case 'refineryQuote':
    case 'refineryFuelQuote':
      return true;
    default:
      return false;
  }
}
