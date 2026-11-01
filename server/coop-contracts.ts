import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { ArmadaState } from './db.ts';
import type { PlayerData, PlayerReference, Session, StellarBody } from './game.ts';
import type { Entity } from './space.ts';
import type { SavedHoldoutRun } from './save-contracts.ts';
export interface TradeOffer {
  credits?: number;
  items?: Record<string, number>;
  lots?: Record<string, GradeLots>;
}
export interface TradeState {
  id: string;
  a: string;
  b: string;
  give: Record<string, TradeOffer>;
  lock: Record<string, boolean>;
  ok: Record<string, boolean>;
  t: number;
}
export interface DuelInvite {
  from: string;
  armada: boolean;
  t: number;
}
export interface DuelState {
  id: string;
  armada: boolean;
  sys: string;
  sides: Record<'A' | 'B', string[]>;
  out: Set<string>;
  on: boolean;
  startT: number;
  until: number;
}
export interface SocialRow {
  name: string;
  status: 'online' | 'away' | 'offline';
  sys: string;
  sysId: string | null;
  last: number;
}
export interface SocialPayload {
  friends: SocialRow[];
  inReq: string[];
  outReq: string[];
  blocks: string[];
  dmAll: boolean;
  hideSys: boolean;
}
export interface ArmadaInvite {
  id: string;
  name: string;
  leader: string;
  n: number;
}
export interface ArmadaPayload {
  id: string;
  name: string;
  leader: string;
  members: Array<{
    name: string;
    online: boolean;
    sys: string;
    sysId: string | null;
    hull: string;
    landed: boolean;
    jobSlots: number;
    /** Generic story status, never a hidden chapter title or destination. */
    storyStatus?: string;
  }>;
  pending: string[];
  follow: boolean;
  followingFlight: boolean;
  /** Existing same-system Armada shield-recharge and bounty bonuses. */
  buffsActive?: boolean;
  invites: ArmadaInvite[];
  max: number;
}
export type ArmadaSummary = ArmadaPayload | { none: boolean; invites: ArmadaInvite[] } | null;
export type DuelPayload =
  | { invite: DuelInvite }
  | {
      id: string;
      armada: boolean;
      on: boolean;
      with: string | null;
      foes: string[];
      friends: string[];
      out: string[];
      until: number;
    }
  | null;
export interface CoopMessage {
  op: string;
  name?: string;
  msg?: string;
  id?: string;
  revision?: number;
  on?: boolean;
  give?: TradeOffer;
  armada?: boolean;
  dmAll?: boolean;
  hideSys?: boolean;
  follow?: boolean;
}
export interface CoopOperations {
  rescueBoard(session: Session, target: Entity): void;
  holdoutHelpers(data: PlayerData, site: StellarBody): Session[];
  holdoutAnnounce(session: Session): void;
  holdoutReward(
    host: PlayerData,
    savedHoldoutRun: SavedHoldoutRun,
    waves: number,
    hasWon: boolean,
    reward: { credits: number; grade: number },
  ): void;
  sessionOf(name: string): Session | null;
  socialInit(data: PlayerData): PlayerData;
  has(list: string[], name: string): boolean;
  drop(list: string[], name: string): string[];
  blocked(data: PlayerData | null | undefined, name: string): boolean;
  statusOf(name: string): 'online' | 'away' | 'offline';
  refreshPlayer(name: string): void;
  pushSocial(name: string): void;
  socialPayload(data: PlayerData): SocialPayload | null;
  presence(data: PlayerData): void;
  socialOp(session: Session, message: CoopMessage): void;
  dm(session: Session, data: PlayerData | null | undefined, text?: string): void;
  armadaOf(data: Pick<PlayerData, 'armada'> | null | undefined): ArmadaState | null;
  armadaChat(armada: ArmadaState, message: string, skip?: string): void;
  armadaPayload(data: PlayerData): ArmadaSummary;
  armadaPush(armada: ArmadaState): void;
  armadaLeave(data: PlayerData, armada: ArmadaState, reason: string): void;
  armadaRefresh(armada: ArmadaState): void;
  armadaNear(data: PlayerData): number;
  armadaBonus(data: PlayerData, bonus: Record<string, number>): void;
  atOwnStation(data: PlayerData): boolean;
  tradeClean(data: PlayerData, give: TradeOffer): TradeOffer | string;
  tradePush(identifier: string): void;
  tradeCancel(identifier: string, reason: string): void;
  tradeDo(trade: TradeState): void;
  duelOf(session: Session | null | undefined): DuelState | null;
  duelSide(duel: DuelState, name: string): 'A' | 'B' | null;
  dueling(
    playerReference: PlayerReference | null,
    playerReference2: PlayerReference | null,
  ): boolean;
  duelOut(session: Session, reason: string): void;
  duelSay(duel: DuelState, message: string): void;
  duelEnd(duel: DuelState, winner: 'A' | 'B' | null): void;
  duelTick(): void;
  rescueTick(): void;
}
