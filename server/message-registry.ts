import type { Session } from './game.ts';

/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 * Incoming or outgoing network packet payload.
 */
export type NetworkMessage = {
  /** Message type identifier. */
  t?: string;

  /** Allowlisted personal portrait identity. */
  portraitId?: unknown;

  /** Allowlisted operation, validated by its route. */
  op?: string;

  /** Target entity or item identifier. */
  id?: string | number;

  /** Faction identifier. */
  fac?: string;

  /** Quantity or numeric count. */
  n?: number;

  /** Player or character name. */
  name?: string;

  /** Secret password string. */
  pass?: string;

  /** Chat or broadcast text content. */
  text?: string;

  /** Message body string. */
  msg?: string;

  /** Message sender name. */
  from?: string;

  /** Message recipient name. */
  to?: string;

  /** Fleet order string or mode. */
  o?: string;

  /** Navigation destination identifier. */
  dest?: string;

  /** Targeted entity identifier. */
  target?: number;

  /** Assigned ship or equipment slot identifier. */
  slot?: string | number;

  /** Ship chassis or hull identifier. */
  hull?: number;

  /** Entity unique instance identifier. */
  uid?: string | null;

  /** Credit valuation or amount. */
  val?: number;

  /** Reward share payout. */
  share?: number;

  /** Confirmation boolean status. */
  ok?: boolean;
  th?: number;
  tu?: number;
  ab?: boolean | number;
  rv?: boolean | number;
  f1?: boolean | number;
  f2?: boolean | number;
  nav?: boolean;
  seq?: number;
  stellar?: string;
  cid?: string;
  qty?: number;
  lots?: import('../shared/cargo-contracts.ts').GradeLots;
  store?: boolean;
  qid?: string;
  grade?: string | number;
  mat?: string;
  c?: string;
  cat?: string;
  ch?: string;
  k?: string | number;
  revision?: number;
  port?: string;
  recipe?: string;
  on?: boolean;
  dmAll?: boolean;
  armada?: boolean;
  give?: {
    items?: Record<string, number>;
    lots?: Record<string, import('../shared/cargo-contracts.ts').GradeLots>;
    credits?: number;
    mats?: Record<string, number[]>;
  };
  site?: string;
  all?: boolean | number;
  kind?: string;
  period?: 'daily' | 'weekly';
  side?: string;
  g?: number;
  crew?: number | null;
  cap?: number | null;
  hideSys?: boolean;
  w?: number;
  role?: string;
  price?: number;
  job?: string;
  mode?: string;
  i?: number;
  act?: string;
  oid?: string | number | null;
  sid?: string | number;
  amt?: number;

  /** Message data fields. */
  data?: Record<string, string | number | boolean | null>;
};

/** Handler callback invoked when a registered message type is received. */
export type MessageHandler = (session: Session, message: NetworkMessage) => void;

/** Immutable message router providing registered type listing and dispatch capabilities. */
export type MessageRegistry = {
  /** Immutable list of registered message types. */
  types: readonly string[];

  /** Dispatches a message to its registered handler. */
  dispatch: (type: string, session: Session, message: NetworkMessage) => void;
};

/**
 * Creates an immutable message registry for dispatching typed network messages to their respective handlers.
 * @param entries Array of message type to handler mappings.
 * @returns Frozen message registry instance with dispatch capability.
 * @throws {TypeError} If a route type is invalid or a handler is not a function.
 * @throws {Error} If duplicate message route types are provided.
 */
export function createMessageRegistry(
  entries: ReadonlyArray<readonly [string, MessageHandler]>,
): MessageRegistry {
  const handlers = new Map<string, MessageHandler>();
  for (const [type, handler] of entries) {
    if (!type || typeof type !== 'string' || typeof handler !== 'function')
      throw new TypeError('Invalid message route');
    if (handlers.has(type)) throw new Error(`Duplicate message route: ${type}`);
    handlers.set(type, handler);
  }
  return Object.freeze({
    types: Object.freeze([...handlers.keys()]),
    /**
     * Dispatches an incoming message to its registered handler if recognized.
     * @param type Message type identifier.
     * @param session Active player network session.
     * @param message Decoded payload object.
     */
    dispatch(type: string, session: Session, message: NetworkMessage): void {
      if (typeof type === 'string') handlers.get(type)?.(session, message);
    },
  });
}
