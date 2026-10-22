import type { Session } from './game.ts';
export type NetworkMessage = {
  t?: string;
  op?: string;
  id?: string | number;
  fac?: string;
  n?: number;
  name?: string;
  pass?: string;
  text?: string;
  msg?: string;
  from?: string;
  to?: string;
  o?: string;
  dest?: string;
  target?: number;
  slot?: string | number;
  hull?: number;
  uid?: string | null;
  val?: number;
  share?: number;
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
  data?: Record<string, string | number | boolean | null>;
};
export type MessageHandler = (session: Session, message: NetworkMessage) => void;
export type MessageRegistry = {
  types: readonly string[];
  dispatch: (type: string, session: Session, message: NetworkMessage) => void;
};

/** @import { CommandSession } from './contracts.ts' */

// @ts-check
/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 *
 * @typedef {object} NetworkMessage
 * Incoming or outgoing network packet payload.
 * @property {string} [t] Message type identifier.
 * @property {string} [op] Allowlisted operation, validated by its route.
 * @property {string} [id] Target entity or item identifier.
 * @property {string} [fac] Faction identifier.
 * @property {number} [n] Quantity or numeric count.
 * @property {string} [name] Player or character name.
 * @property {string} [pass] Secret password string.
 * @property {string} [text] Chat or broadcast text content.
 * @property {string} [msg] Message body string.
 * @property {string} [from] Message sender name.
 * @property {string} [to] Message recipient name.
 * @property {string} [o] Fleet order string or mode.
 * @property {string} [dest] Navigation destination identifier.
 * @property {string} [target] Targeted entity identifier.
 * @property {string} [slot] Assigned ship or equipment slot identifier.
 * @property {number} [hull] Ship chassis or hull identifier.
 * @property {string} [uid] Entity unique instance identifier.
 * @property {number} [val] Credit valuation or amount.
 * @property {number} [share] Reward share payout.
 * @property {boolean} [ok] Confirmation boolean status.
 * @property {Record<string, string | number | boolean | null>} [data] Message data fields.
 *
 * @typedef {(session: Session, message: NetworkMessage) => void} MessageHandler
 * Handler callback invoked when a registered message type is received.
 *
 * @typedef {object} MessageRegistry
 * Immutable message router providing registered type listing and dispatch capabilities.
 * @property {readonly string[]} types Immutable list of registered message types.
 * @property {(type: string, session: Session, message: NetworkMessage) => void} dispatch Dispatches a message to its registered handler.
 */

/**
 * Creates an immutable message registry for dispatching typed network messages to their respective handlers.
 * @param {ReadonlyArray<readonly [string, MessageHandler]>} entries Array of message type to handler mappings.
 * @returns {MessageRegistry} Frozen message registry instance with dispatch capability.
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
     * @param {string} type Message type identifier.
     * @param {CommandSession} session Active player network session.
     * @param {NetworkMessage} message Decoded payload object.
     * @returns {void}
     */
    dispatch(type: string, session: Session, message: NetworkMessage): void {
      if (typeof type === 'string') handlers.get(type)?.(session, message);
    },
  });
}
