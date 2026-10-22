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
/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 * NetworkMessage fields:
 * Incoming or outgoing network packet payload.
 * [t]: Message type identifier.
 * [op]: Allowlisted operation, validated by its route.
 * [id]: Target entity or item identifier.
 * [fac]: Faction identifier.
 * [n]: Quantity or numeric count.
 * [name]: Player or character name.
 * [pass]: Secret password string.
 * [text]: Chat or broadcast text content.
 * [msg]: Message body string.
 * [from]: Message sender name.
 * [to]: Message recipient name.
 * [o]: Fleet order string or mode.
 * [dest]: Navigation destination identifier.
 * [target]: Targeted entity identifier.
 * [slot]: Assigned ship or equipment slot identifier.
 * [hull]: Ship chassis or hull identifier.
 * [uid]: Entity unique instance identifier.
 * [val]: Credit valuation or amount.
 * [share]: Reward share payout.
 * [ok]: Confirmation boolean status.
 * [data]: Message data fields.
 * MessageHandler fields:
 * Handler callback invoked when a registered message type is received.
 * MessageRegistry fields:
 * Immutable message router providing registered type listing and dispatch capabilities.
 * types: Immutable list of registered message types.
 * dispatch: Dispatches a message to its registered handler.
 */

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
