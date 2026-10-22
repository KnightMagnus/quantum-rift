import type { QuestRecord } from '../shared/quests.ts';
export interface SavedQuests {
  active: Record<string, QuestRecord>;
  done: Array<{ id: string; name: string; giver: string; side: boolean; t: number }>;
  contacts: Record<string, { n?: number; cool?: number; last?: (string | undefined)[] }>;
  sides: Record<string, number>;
}
import type { Mission } from './game.ts';
import type { CargoLedger } from '../shared/cargo-contracts.ts';
import type { ShipLoadout } from '../shared/rules.ts';

export interface SavedDockWing {
  uid: string;
  cap: number | string | null;
  crew: number | string | null;
}
export interface SavedDock {
  lead: string | null;
  wings: (SavedDockWing | null)[];
}
export interface StoredShip {
  repairT?: number;
  ship: ShipLoadout;
  bridge?: Record<string, number | string | null>;
  escorts?: Array<{ ship: ShipLoadout }>;
}
export interface SavedStory {
  step: number;
  active: { id: string; got: number; spawned: boolean; ready: boolean; allies?: number[] } | null;
  done: string[];
  pass?: boolean;
}
export interface SavedSpecialist {
  tier: number;
  comp: Record<string, number>;
  upT?: number | null;
}
export interface SavedHoldoutRun {
  wave: number;
  nextT: number;
  ids: number[];
  platforms: number[];
  cleared: number;
  waveT?: number;
  helpers?: string[];
}
export interface SavedHoldout {
  best: number;
  lastT: number;
  active?: SavedHoldoutRun | null;
}
export interface SavedMail {
  from: string;
  to: string;
  msg: string;
  at: number;
}

export interface SavedArc {
  step: number;
  active: { got: number; ready: boolean } | null;
  done: boolean;
}
export interface SavedGoal {
  type: string;
  n: number;
  got: number;
  claimed: boolean;
}

/** Fields introduced by feature migrations are optional until their owner initializes them. */
export interface FeaturePlayerState {
  missions: Mission[];
  cargoLots: CargoLedger;
  storage: Record<string, number>;
  storageLots: CargoLedger;
  escorts: number[];
  log: Array<{ t: number; text: string }>;
  tut: number;
  tutV: number;
  hideSys?: boolean;
  lastSeen?: number;
  duels?: { w: number; l: number; d: number };
  explored: string[];
  shipless?: boolean;
  docks: SavedDock[];
  activeDock: number;
  credit: number;
  loan?: { bal: number; next: number } | null;
  parts: Record<string, number>;
  specState: Record<string, SavedSpecialist>;
  holdout: SavedHoldout;
  expd: { n: number; lore?: number[] };
  goals?: { day?: number; week?: number; daily?: SavedGoal[]; weekly?: SavedGoal[] };
  story: SavedStory;
  lower: (string | null)[];
  mastery?: Record<string | number, number>;
  fuel?: number;
  shieldNow?: number;
  armorNow?: number;
  landPass?: Record<string, number>;
  paid?: Record<string, number>;
  arena?: { rating: number; w: number; l: number };
  arenaReturn?: string | null;
  chains?: Record<string, number>;
  lastStellar?: string;
  shards: number;
  blocks: string[];
  sampleT?: number;
  directives?: Record<string, number>;
  v26?: boolean;
  friends: string[];
  freqIn: string[];
  freqOut: string[];
  mail: SavedMail[];
  seedFleet?: boolean;
  protWarned?: boolean;
  fleet?: unknown;
  noShield?: boolean;
  playerHails?: boolean;
  dmAll?: boolean;
}

export interface ShuttleReward {
  credits: number;
  chart?: boolean;
  mats?: Array<[string, number, number]>;
  rep?: [string, number];
}
export interface ShuttleJob {
  id: string;
  kind: string;
  sys: string;
  jumps: number;
  danger: number;
  minutes: number;
  title: string;
  reward?: ShuttleReward;
}
export interface SavedShuttle {
  id: number;
  kind: string;
  state: 'idle' | 'out' | 'damaged' | 'gone';
  crew: number | string | null;
  runs: number;
  job?: ShuttleJob | null;
  ends?: number | null;
  outcome?: string | null;
  chance?: number | null;
}
