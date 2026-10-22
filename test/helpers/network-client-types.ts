import type { PlayerPayload } from '../../client/main.ts';
import type { ServerMessage, SnapshotMessage } from '../../client/protocol.ts';
import type { RefineryQuote } from '../../server/refinery-contracts.ts';

/** Mutable WebSocket fixture state; each scenario waits for its required packet before use. */
export interface NetworkClient {
  ws: WebSocket;
  name: string;
  messages: ServerMessage[];
  you: PlayerPayload;
  snap: SnapshotMessage;
  space: Extract<ServerMessage, { t: 'space' }>;
  quote?: RefineryQuote;
  social: Extract<ServerMessage, { t: 'social' }>;
  jump: Extract<ServerMessage, { t: 'follow' }>;
  send: (message: object) => void;
}
