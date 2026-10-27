import type { GradeLots } from './cargo-contracts.ts';

/** Commodity settlement request; quantity retains the legacy signed-int coercion. */
export type TradeAction = {
  /** Fixed route discriminator. */
  t: 'trade';
  /** Catalog commodity identifier. */
  cid: string;
  /** Numeric quantity or legacy numeric text, coerced by the route. */
  qty: number | string;
  /** Optional explicit grades; absence selects common-first. */
  lots?: GradeLots | 'common-first';
};
/** Refinery operations share optional selectors; services enforce operation requirements. */
export type RefineryAction = {
  /** Server-issued quote, batch or order identity. */
  id?: string;
  /** Requested port, still checked against authoritative location. */
  port?: string;
  /** Recipe catalog identifier. */
  recipe?: string;
  /** Requested raw grade. */
  grade?: string;
  /** Immediate or stored processing mode. */
  mode?: string;
  /** Recipe or fuel quantity; positive-integer rules belong to the service. */
  n?: number;
} & (
  | {
      /** Fixed processing route. */
      t: 'refinery';
      /** Processing or fuel operation. */
      op:
        | 'quote'
        | 'preview'
        | 'submit'
        | 'claim'
        | 'cancel'
        | 'returns'
        | 'fuelQuote'
        | 'fuel'
        | 'list';
    }
  | {
      /** Fixed mining-order route. */
      t: 'miningOrder';
      /** Order operation. */
      op: 'accept' | 'deliver' | 'cancelOrder';
    }
);
/** Towing commands always identify the selected object's observed revision. */
export type TowingAction = {
  /** Fixed route discriminator. */
  t: 'towing';
  /** Authoritative operation to request. */
  op: 'attach' | 'detach' | 'offer' | 'accept' | 'deliver';
  /** Selected motherlode identity. */
  id: number;
  /** Observed revision, checked by the service. */
  revision: number;
  /** Transfer recipient, permitted only for offers. */
  to?: string;
  /** Delivery destination, permitted only for delivery. */
  port?: string;
};
/** Mobile industrial controls; production amounts remain server-owned. */
export type IndustrialAction = {
  /** Fixed route discriminator. */
  t: 'industrial';
  /** Requested mode toggle, recipe selection or all-off command. */
  op: 'sweep' | 'harvest' | 'smelter' | 'recipe' | 'off';
  /** Mobile recipe selector; the service checks its catalog. */
  recipe?: string;
  /** Exact input grade selector; the service checks supported grades. */
  grade?: string;
};
/** Legacy finite numeric value; routes retain their signed 32-bit coercion. */
export type PurchaseNumber = number | string;
/** Ordinary port purchases; prices, stock and ownership remain server-owned. */
export type PortPurchaseAction =
  | {
      /** Shipyard purchase route. */
      t: 'buyship';
      /** Catalog hull, converted by the route. */
      hull: PurchaseNumber;
      /** Store the purchase in the hangar instead of replacing the flagship. */
      store?: boolean;
    }
  | {
      /** Outfitter buy/sell route. */
      t: 'outfit';
      /** Catalog outfit, converted by the route. */
      id: PurchaseNumber;
      /** Signed buy/sell quantity, converted by the route. */
      n: PurchaseNumber;
    }
  | {
      /** Engineering material buy/sell route. */
      t: 'buymat';
      /** Catalog material identifier. */
      mat: string;
      /** Material grade, converted by the route. */
      grade: PurchaseNumber;
      /** Signed buy/sell quantity, converted by the route. */
      n: PurchaseNumber;
    };
/** Migrated economic request families; not a claim that all routes are validated. */
export type EconomicAction =
  | TradeAction
  | RefineryAction
  | TowingAction
  | IndustrialAction
  | PortPurchaseAction;

/** Plain decoded JSON object, excluding arrays and custom prototypes. */
export function wireRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}
function fields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === 'string' &&
      allowed.includes(key) &&
      !!descriptor &&
      descriptor.enumerable &&
      Object.hasOwn(descriptor, 'value')
    );
  });
}
function text(value: unknown, maximum = 200): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

/** Validate without normalizing or granting permission to settle an operation. */
export function parseTradeAction(value: unknown): TradeAction | null {
  if (
    !wireRecord(value) ||
    !fields(value, ['t', 'cid', 'qty', 'lots']) ||
    value.t !== 'trade' ||
    !text(value.cid) ||
    !value.cid ||
    ['__proto__', 'constructor', 'prototype'].includes(value.cid) ||
    !(typeof value.qty === 'number' || text(value.qty)) ||
    !Number.isFinite(Number(value.qty))
  )
    return null;
  if (value.lots !== undefined && value.lots !== 'common-first') {
    if (
      !wireRecord(value.lots) ||
      !fields(value.lots, ['common', 'rich', 'pure']) ||
      !['common', 'rich', 'pure'].every(
        (grade) =>
          Number.isSafeInteger((value.lots as Record<string, unknown>)[grade]) &&
          Number((value.lots as Record<string, unknown>)[grade]) >= 0,
      )
    )
      return null;
  }
  return value as TradeAction;
}
const refineryFields: Record<RefineryAction['op'], readonly string[]> = {
  quote: ['t', 'op', 'port', 'recipe', 'grade', 'mode', 'n'],
  preview: ['t', 'op', 'port', 'recipe', 'grade', 'mode', 'n'],
  submit: ['t', 'op', 'id'],
  claim: ['t', 'op', 'port', 'recipe'],
  cancel: ['t', 'op', 'id'],
  returns: ['t', 'op', 'port', 'id'],
  fuelQuote: ['t', 'op', 'n'],
  fuel: ['t', 'op', 'id'],
  list: ['t', 'op'],
  accept: ['t', 'op', 'id', 'port'],
  deliver: ['t', 'op', 'id', 'port'],
  cancelOrder: ['t', 'op', 'id', 'port'],
};
/** Reject authority fields before refinery state or queues are inspected. */
export function validRefineryRequest(value: unknown, orders: boolean): boolean {
  if (!wireRecord(value) || !text(value.op) || !Object.hasOwn(refineryFields, value.op))
    return false;
  const operation = value.op as RefineryAction['op'];
  const order = ['accept', 'deliver', 'cancelOrder'].includes(operation);
  if (
    orders !== order ||
    !fields(value, refineryFields[operation]) ||
    ['id', 'port', 'recipe', 'grade', 'mode'].some(
      (key) => value[key] !== undefined && !text(value[key]),
    )
  )
    return false;
  return true;
}
/** Parse the discriminated transport envelope using the service shape rules. */
export function parseRefineryAction(value: unknown): RefineryAction | null {
  if (
    !wireRecord(value) ||
    (value.t !== 'refinery' && value.t !== 'miningOrder') ||
    !validRefineryRequest(value, value.t === 'miningOrder') ||
    (value.n !== undefined && (typeof value.n !== 'number' || !Number.isFinite(value.n)))
  )
    return null;
  return value as RefineryAction;
}
/** Shape validation leaves ownership, distance and receipt replay checks to towing. */
export function validTowingRequest(value: unknown): boolean {
  if (
    !wireRecord(value) ||
    !fields(value, ['t', 'op', 'id', 'revision', 'to', 'port']) ||
    typeof value.op !== 'string' ||
    !['attach', 'detach', 'offer', 'accept', 'deliver'].includes(value.op) ||
    !Number.isSafeInteger(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    (value.to !== undefined && (!text(value.to, 64) || !value.to.trim())) ||
    (value.port !== undefined && !text(value.port))
  )
    return false;
  return true;
}
/** Optional recipient/destination fields cannot grant authority to another operation. */
export function validTowingAuthority(value: { op?: string; to?: string; port?: string }): boolean {
  return (
    (value.op === 'offer' || value.to === undefined) &&
    (value.op === 'deliver' || value.port === undefined)
  );
}
/** Parse a towing transport envelope without changing its values. */
export function parseTowingAction(value: unknown): TowingAction | null {
  return wireRecord(value) &&
    value.t === 'towing' &&
    validTowingRequest(value) &&
    validTowingAuthority(value)
    ? (value as TowingAction)
    : null;
}

/** Bound direct industrial calls without requiring their transport discriminator. */
export function validIndustrialRequest(value: unknown): boolean {
  return (
    wireRecord(value) &&
    fields(value, ['t', 'op', 'recipe', 'grade']) &&
    (value.t === undefined || value.t === 'industrial') &&
    typeof value.op === 'string' &&
    ['sweep', 'harvest', 'smelter', 'recipe', 'off'].includes(value.op) &&
    (value.recipe === undefined || text(value.recipe)) &&
    (value.grade === undefined || text(value.grade))
  );
}
/** Parse industrial envelopes without changing selectors or granting production. */
export function parseIndustrialAction(value: unknown): IndustrialAction | null {
  return wireRecord(value) && value.t === 'industrial' && validIndustrialRequest(value)
    ? (value as IndustrialAction)
    : null;
}

/** Reject malformed purchase envelopes without normalizing legacy numeric text. */
export function parsePortPurchaseAction(value: unknown): PortPurchaseAction | null {
  if (!wireRecord(value)) return null;
  const numeric = (entry: unknown): entry is PurchaseNumber =>
    (typeof entry === 'number' || text(entry)) && Number.isFinite(Number(entry));
  if (value.t === 'buyship')
    return fields(value, ['t', 'hull', 'store']) &&
      numeric(value.hull) &&
      (value.store === undefined || typeof value.store === 'boolean')
      ? (value as PortPurchaseAction)
      : null;
  if (value.t === 'outfit')
    return fields(value, ['t', 'id', 'n']) && numeric(value.id) && numeric(value.n)
      ? (value as PortPurchaseAction)
      : null;
  if (value.t === 'buymat')
    return fields(value, ['t', 'mat', 'grade', 'n']) &&
      text(value.mat) &&
      !!value.mat &&
      !['__proto__', 'constructor', 'prototype'].includes(value.mat) &&
      numeric(value.grade) &&
      numeric(value.n)
      ? (value as PortPurchaseAction)
      : null;
  return null;
}
