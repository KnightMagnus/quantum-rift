import type { RefineryAction } from '../shared/wire-actions.ts';
import type { RefineryWire } from '../shared/refinery-wire.ts';
export type {
  RefineryInput,
  RefineryQuote,
  RefineryBatch,
  RefineryReady,
  RefineryReceipt,
  RefineryDemand,
  MiningOrder,
  FuelQuote,
  SavedRefinery,
  RefineryWire,
} from '../shared/refinery-wire.ts';
import type { CargoLedger, CargoTotals } from '../shared/cargo-contracts.ts';
import type { GameStorage as Database } from './game-storage.ts';
import type { Mission, PlayerData, Session } from './game.ts';
export type RefineryPlayer = PlayerData & {
  cargo: CargoTotals;
  cargoLots: CargoLedger;
  missions: Mission[];
  fuel?: number;
  landPass?: Record<string, number>;
};
export type RefinerySession = Omit<Session, 'data'> & { data: RefineryPlayer };
/** Legacy direct-service request; transport envelopes use RefineryAction. */
export type RefineryRequest = Omit<Partial<RefineryAction>, 't' | 'op'> & {
  t?: string;
  op?: string;
};
export type RefineryCapabilities = {
  db: Pick<
    Database,
    'world' | 'touch' | 'flush' | 'get' | 'key' | 'hasPendingCheckpoint' | 'economicFrozen'
  >;
  now: () => number;
  paused: () => boolean;
  room: (refineryPlayer: RefineryPlayer) => number;
  fuelCapacity: (refineryPlayer: RefineryPlayer) => number;
  access: (
    refineryPlayer: RefineryPlayer,
    port: string,
  ) => { available: boolean; home: boolean; faction: string; near: boolean };
  pricing: (
    refineryPlayer: RefineryPlayer,
    port: string,
    captainId: string,
    currentTime: number,
  ) => { ask: number; bid: number; fingerprint: string };
  rushProgress: (refinerySession: RefinerySession, event: string, delivered: number) => void;
  rush: (starSystem: string) => { id: string; until: number } | null;
  payload: (refinerySession: RefinerySession) => RefineryWire;
  refresh: (refinerySession: RefinerySession) => void;
  send: (refinerySession: RefinerySession, message: object) => void;
  toast: (refinerySession: RefinerySession, text: string) => void;
};
