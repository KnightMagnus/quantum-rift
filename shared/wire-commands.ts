import {
  wireRecord,
  parseTradeAction,
  parsePortPurchaseAction,
  parseRefineryAction,
  parseTowingAction,
  parseIndustrialAction,
} from './wire-actions.ts';
import type { EconomicAction } from './wire-actions.ts';
import type { GradeLots } from './cargo-contracts.ts';
import { utf8Bytes } from './health.ts';

/** A parser never normalizes a value; existing owners retain coercion and authority. */
type Guard<Value> = (value: unknown) => value is Value;
const text: Guard<string> = (value): value is string =>
  typeof value === 'string' && value.length <= 200;
const selector: Guard<string> = (value): value is string =>
  text(value) && value !== 'prototype' && !Object.hasOwn(Object.prototype, value);
const prose: Guard<string> = (value): value is string =>
  typeof value === 'string' && value.length <= 4096;
const numeric: Guard<number | string> = (value): value is number | string =>
  (typeof value === 'number' || text(value)) && Number.isFinite(Number(value));
const flag: Guard<boolean | number> = (value): value is boolean | number =>
  typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
const identifier: Guard<string | number> = (value): value is string | number =>
  text(value) || (typeof value === 'number' && Number.isFinite(value));
const nullableIdentifier: Guard<string | number | null> = (
  value,
): value is string | number | null => value === null || identifier(value);
const choices =
  <const Values extends readonly string[]>(...values: Values): Guard<Values[number]> =>
  (value): value is Values[number] =>
    typeof value === 'string' && values.includes(value);
const lots: Guard<Partial<GradeLots> | 'common-first'> = (
  value,
): value is Partial<GradeLots> | 'common-first' =>
  value === 'common-first' ||
  (wireRecord(value) &&
    Object.keys(value).length <= 3 &&
    Object.entries(value).every(
      ([key, count]) =>
        ['common', 'rich', 'pure'].includes(key) &&
        Number.isSafeInteger(count) &&
        Number(count) >= 0,
    ));
/** Station trades accept bounded, partial grade selections, as their owner does. */
export interface WireTradeOffer {
  /** Proposed credits; affordability is checked on settlement. */
  credits?: number | string;
  /** Commodity counts; legacy numeric text is retained. */
  items?: Record<string, number | string>;
  /** Explicit commodity grade selection. */
  lots?: Record<string, Partial<GradeLots> | 'common-first'>;
}
function dictionary<Value>(value: unknown, guard: Guard<Value>): boolean {
  return (
    wireRecord(value) &&
    Object.keys(value).length <= 128 &&
    Object.entries(value).every(([key, entry]) => selector(key) && guard(entry))
  );
}
const give: Guard<WireTradeOffer> = (value): value is WireTradeOffer =>
  wireRecord(value) &&
  Object.keys(value).every((key) => ['credits', 'items', 'lots'].includes(key)) &&
  (value.credits === undefined || numeric(value.credits)) &&
  (value.items === undefined || dictionary(value.items, numeric)) &&
  (value.lots === undefined || dictionary(value.lots, lots));

/** Family fields are optional where legacy handlers supply defaults or denials.
 * An operation selector is required when present in a family schema. Unknown
 * operations are denied before service setup can change persistent state.
 */
export const commandFields = {
  portrait: { portraitId: text, portraitRequestId: text, name: text, target: identifier },
  miningPressure: { op: choices('join', 'leave') },
  mining: { op: choices('survey') },
  combat: { op: choices('off', 'manual', 'assist', 'coordinate', 'delegate'), on: boolean },
  input: {
    seq: numeric,
    th: flag,
    tu: numeric,
    ab: flag,
    rv: flag,
    f1: flag,
    f2: flag,
    nav: boolean,
    // Legacy prediction echoes are bounded but never used by the flight owner.
    x: numeric,
    credits: numeric,
    dt: numeric,
  },
  target: { id: identifier },
  tutskip: {},
  land: { stellar: text },
  depart: {},
  jump: { to: text },
  docks: {
    op: choices('repair', 'outfitterRepair', 'activate', 'assign', 'crew'),
    uid: nullableIdentifier,
    k: numeric,
    slot: identifier,
    w: numeric,
    role: text,
    oid: nullableIdentifier,
  },
  questdrop: { qid: text },
  accept: { id: identifier },
  abandon: { id: identifier },
  station: {
    op: choices(
      'claim',
      'upgrade',
      'process',
      'collect',
      'research',
      'hire',
      'dismiss',
      'unqueue',
      'defense',
      'refine',
      'refit',
      'relocate',
    ),
    id: identifier,
    hull: numeric,
    i: numeric,
    all: flag,
    lots,
    mat: selector,
    g: numeric,
    n: numeric,
    site: selector,
  },
  rename: { name: prose },
  note: { text: prose },
  chat: { msg: prose, ch: text },
  officer: {
    op: choices('hire', 'assign', 'dismiss'),
    id: identifier,
    oid: nullableIdentifier,
    slot: identifier,
  },
  shuttle: {
    op: choices('build', 'crew', 'send', 'claim', 'repair', 'scrap'),
    sid: identifier,
    kind: selector,
    job: selector,
    oid: nullableIdentifier,
  },
  dock: { op: choices('store', 'sell'), i: nullableIdentifier, uid: nullableIdentifier },
  board: { id: identifier, act: choices('plunder', 'capture', 'rescue') },
  spec: { op: choices('build', 'parts', 'comp', 'tierup'), id: numeric, c: selector },
  armada: {
    op: choices(
      'form',
      'invite',
      'accept',
      'decline',
      'leave',
      'kick',
      'lead',
      'rename',
      'uninvite',
      'rally',
      'follow',
      'contractReady',
      'contractDecline',
      'contractStart',
      'contractCancel',
    ),
    name: text,
    id: identifier,
    on: boolean,
    revision: numeric,
  },
  holdout: {},
  storyacc: { id: text, choice: text },
  social: {
    op: choices('add', 'accept', 'decline', 'cancel', 'remove', 'block', 'unblock', 'prefs', 'dm'),
    name: text,
    msg: prose,
    dmAll: boolean,
    hideSys: boolean,
  },
  trade2: {
    op: choices('open', 'offer', 'lock', 'confirm', 'cancel'),
    name: text,
    give,
    on: boolean,
  },
  duel: { op: choices('challenge', 'accept', 'decline', 'yield'), name: text, armada: boolean },
  goal: { period: choices('daily', 'weekly'), i: numeric },
  store: { fac: selector, id: text },
  colony: {
    op: choices('found', 'build', 'demolish', 'upgrade', 'collect', 'abandon'),
    kind: selector,
    i: numeric,
  },
  arena: { op: choices('queue', 'leave'), mode: text },
  exchange: {
    op: choices('place', 'cancel', 'collect', 'transfer'),
    side: text,
    qty: numeric,
    price: numeric,
    kind: selector,
    mat: selector,
    grade: numeric,
    cid: selector,
    lots,
    id: identifier,
    to: text,
    n: numeric,
  },
  boards: { cat: text },
  profile: { name: text },
  ping: { c: identifier },
  hail: { stellar: text, id: numeric },
  hailin: {
    op: choices('prefs', 'list', 'send', 'dismiss', 'open', 'answer'),
    allow: boolean,
    id: numeric,
    text: prose,
    key: text,
    k: identifier,
    sender: text,
  },
  hailopt: { stellar: text, id: numeric, k: identifier },
  order: { o: text },
  jettison: { cid: selector, n: numeric, lots },
  rivals: {},
  bm: { id: identifier },
  arcacc: { fac: selector },
  promote: { id: identifier },
  lower: { op: choices('hire', 'dismiss'), i: numeric, kind: selector },
  bank: { op: choices('borrow', 'pay'), amt: numeric },
  pause: {},
} as const;

type GuardValue<Value> = Value extends Guard<infer Parsed> ? Parsed : never;
/** Discriminated wire commands, derived from the same field rules used at runtime. */
export type CommandAction = {
  [Type in keyof typeof commandFields]: { t: Type } & {
    [Field in Exclude<keyof (typeof commandFields)[Type], 'op'>]?: GuardValue<
      (typeof commandFields)[Type][Field]
    >;
  } & ('op' extends keyof (typeof commandFields)[Type]
      ? { op: GuardValue<(typeof commandFields)[Type]['op']> }
      : object);
}[keyof typeof commandFields];
/** Every authenticated action family; pre-login hello stays with the login owner. */
export type ClientAction = EconomicAction | CommandAction;

/** Economic routes already call these shared parsers inside their service boundary.
 * Keeping that boundary preserves their existing denial replies before settlement.
 */
export const economicActionTypes: readonly string[] = [
  'trade',
  'buyship',
  'outfit',
  'buymat',
  'refinery',
  'miningOrder',
  'towing',
  'industrial',
];

/** Shared by local and native Game ingress; unknown routes fail closed. */
export function parseClientAction(value: unknown): ClientAction | null {
  if (!wireRecord(value) || typeof value.t !== 'string') return null;
  if (economicActionTypes.includes(value.t))
    return (
      parseTradeAction(value) ||
      parsePortPurchaseAction(value) ||
      parseRefineryAction(value) ||
      parseTowingAction(value) ||
      parseIndustrialAction(value)
    );
  if (!Object.hasOwn(commandFields, value.t)) return null;
  const schema: Record<string, Guard<unknown>> = commandFields[
    value.t as keyof typeof commandFields
  ];
  if (schema.op && !schema.op(value.op)) return null;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      return null;
    if (key === 't') continue;
    if (!Object.hasOwn(schema, key) || (value[key] !== undefined && !schema[key](value[key])))
      return null;
  }
  if (utf8Bytes(JSON.stringify(value)) > 8192) return null;
  return value as CommandAction;
}
