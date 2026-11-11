export interface LivingPayloadState {
  /** State kind key (e.g. 'boom', 'war', 'plague') */
  k: string;
  got: number;
  need: number;
  until: number;
  enemy: string | null;
}
import type { Space } from './space.ts';
export interface ArenaMatch {
  id: string;
  mode: '1v1' | '2v2' | '4v4';
  sp: Space;
  teams: Record<'A' | 'B', string[]>;
  until: number;
  alive: Set<string>;
}
export interface RaidWave {
  ids: Set<number>;
  until: number;
  strength: number;
  sys: string;
}
import type { GradeLots } from '../shared/cargo-contracts.ts';

export interface ColonyState {
  owner: string;
  lv: number;
  buildings: string[];
  store: Record<string, number>;
  t: number;
  name: string;
}
export type ExchangeItem =
  | { kind: 'mat'; mat: string; grade: number }
  | { kind: 'com'; cid: string };
export interface ExchangeOrder {
  id: number;
  owner: string;
  side: string;
  item: ExchangeItem;
  qty: number;
  price: number;
  lots?: GradeLots;
  /** Original purchase costs retained while sale inventory is in escrow. */
  basis?: GradeLots;
  t: number;
}
export interface LivingState {
  kind: string;
  start: number;
  until: number;
  got: number;
  need: number;
  miningOrderGot?: number;
  enemy?: string | null;
}
export interface RivalState {
  id: string;
  sys: string;
  credits: number;
  earned: number;
  kills: number;
  hull: number;
  down: number;
  rel: Record<string, number>;
  dockT?: number;
  dockAt?: string | null;
  /** Start time of the current kill window, in epoch milliseconds. */
  killWindowAt?: number;
  /** Kills logged in the current kill window. */
  killWindowCount?: number;
}
export interface LegacyFleet {
  members: string[];
  bank?: number;
  tag: string;
  name: string;
  leader: string;
}
/** Version-one deterministic gameplay streams stored with the world checkpoint. */
export interface RandomStreamsState {
  /** Algorithm/identity schema version. Unknown versions must not be silently reseeded. */
  version: 1;
  /** Root seed shared by independently derived stream identities. */
  rootSeed: number;
  /** Current algorithm state for each initialized identity. */
  states: Record<string, number>;
}
export interface FeatureWorldState {
  /** Absent on legacy worlds; initialized once without changing existing gameplay data. */
  randomStreams?: RandomStreamsState;
  colonies: Record<string, ColonyState>;
  orders: ExchangeOrder[];
  nextOrder: number;
  states: Record<string, LivingState>;
  stateCool: Record<string, number>;
  tradeImpact: Record<string, Record<string, { v: number; t: number }>>;
  rivals: Record<string, RivalState>;
  news: Array<{ t: number; text: string }>;
  flash: Array<{ stellar: string; cid: string; mult: number; until: number }>;
  fleets?: Record<string, LegacyFleet>;
  claims?: unknown;
  cooldown?: unknown;
}
