import type { EncounterFeedback } from '../shared/encounter-feedback.ts';
import type { FlightFeedback } from '../server/flight-feedback.ts';
import type { StateMessage } from '../shared/wire-payloads.ts';
import type { ClientGameState, PlayerPayload, LandedPayload, ContractPlan } from './main.ts';
import type { AttentionPayload } from '../server/attention.ts';
import type { CombatPayload } from '../server/combat-assist.ts';
import type { MiningPrivateWire, MiningRocksWire } from '../server/mining-contracts.ts';
import type { PressureWire, MiningHazard } from '../server/mining-pressure-contracts.ts';
import type { RefineryQuote, RefineryWire, FuelQuote } from '../shared/refinery-wire.ts';
import type { SocialState, TradeState } from './coop_ui.ts';
export interface StoryMessage {
  t: 'story';
  id: string;
  title: string;
  text: string;
  tag?: string;
  done?: boolean;
  ref?: string;
  acc?: string;
  arc?: string;
  choices?: Array<{ value: string; label: string }>;
  sequence?: 'ark-departure';
  /** Server-confirmed Table branch; does not depend on a later player projection. */
  tableEnding?: { lampsRelit: boolean };
}
export interface HailConversation {
  /** Known NPC-only machine hull, shown instead of a captain portrait. */
  machineHull?: number;
  t: 'hail';
  who?: string;
  sub?: string;
  text?: string;
  player?: number;
  key?: string;
  stellar?: string;
  id?: number;
  opts?: Array<{ label: string; k: string }>;
}
export type SocialMessage =
  | { t: 'social'; social?: SocialState; armada?: PlayerPayload['armada'] }
  | {
      t: 'dm';
      from: string;
      to: string;
      msg: string;
      at?: number;
      sent?: boolean;
      offline?: boolean;
    }
  | { t: 'dms'; list: Array<{ from: string; msg: string; at?: number }> }
  | { t: 'trade2'; trade: TradeState | null }
  | { t: 'rally'; sys: string; from: string }
  | { t: 'follow'; to: string; leader: string };
export interface MiningMessage {
  t: string;
  miningRocks?: MiningRocksWire;
  mining?: MiningPrivateWire | null;
  miningPressure?: PressureWire | null;
  miningHazards?: MiningHazard[];
  industrial?: PlayerPayload['industrial'];
  towing?: PlayerPayload['towing'];
}
export type SnapshotEvent = [string, ...number[]];
export interface SnapshotMessage extends MiningMessage {
  t: 'snap' | 'scene';
  sys?: string;
  ships: Array<
    [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      string | null,
      number,
      number,
      (string | null)?,
      number?,
      number?,
      number?,
      number?,
    ]
  >;
  shots: Array<[number, number, number, number, number, number?]>;
  beams: Array<[number, number, number, number]>;
  /** Salvage tuple ends with an optional Index-claim marker. */
  loot: Array<[number, number, number, number, number?]>;
  ev: SnapshotEvent[];
  /** Recipient-only combat intent and recent scan notification. */
  attention?: AttentionPayload;
  /** One countdown per active creature status, never a stacking icon list. */
  nhal?: { slow: number; ichor: number; latch: number };
  /** Visible encounter health and real active windups only. */
  encounters?: EncounterFeedback[];
  combat?: CombatPayload;
  formation?: boolean;
  /** Private same-system Armada and rescue readout. */
  flightFeedback?: FlightFeedback;
  me?: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    Array<[number, number]>,
  ];
}
export type ServerMessage =
  | SocialMessage
  | StoryMessage
  | HailConversation
  | SnapshotMessage
  | { t: 'error' | 'toast'; msg: string }
  | { t: 'welcome'; name: string }
  | { t: 'refineryFuelQuote'; quote: FuelQuote }
  | { t: 'refineryQuote'; quote: RefineryQuote }
  | { t: 'refineryError'; op: string }
  | { t: 'refinery'; op: string; data: RefineryWire }
  | StateMessage<PlayerPayload, LandedPayload>
  | (MiningMessage & {
      t: 'space';
      id: number;
      sys: string;
      rocks?: Array<[number, number, number, number, string, number]>;
    })
  | { t: 'armadaContract'; plan: ContractPlan | null }
  | { t: 'paused'; on: boolean }
  | {
      t: 'chat';
      msg: string;
      from?: string;
      ch?: string;
      id?: number;
      sys: string | null;
      ship: number;
    }
  | { t: 'order'; o: string }
  | { t: 'rivals'; list: NonNullable<ClientGameState['rivals']> }
  | (NonNullable<ClientGameState['world']> & { t: 'world' })
  | { t: 'arena'; id?: string; team: string }
  | { t: 'boards'; cat: string; list: NonNullable<ClientGameState['boards']>[string] }
  | { t: 'profile'; p: ClientGameState['prof'] | null }
  | { t: 'notify'; title: string; body: string }
  | { t: 'sites'; sites: NonNullable<ClientGameState['sites']> }
  | { t: 'dead'; at: string; fee: number; summary?: string }
  | {
      t: 'hailinbox';
      entries?: Array<{
        key: string;
        who: string;
        unread?: boolean;
        archived?: boolean;
        kind: string;
      }>;
      allow?: boolean;
    }
  | { t: 'hailmark'; until: number; id?: number; x: number; y: number; label: string };
