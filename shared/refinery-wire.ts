import type { GradeLots } from './cargo-contracts.ts';
import type { Recipe } from './refinery-rules.ts';

export type RefineryInput = { cid: string; lots: GradeLots };
export type RefineryQuote = {
  id: string;
  owner: string;
  port: string;
  recipe: string;
  version: 1;
  mode: string;
  inputs: RefineryInput[];
  inputTonnes: number;
  units: number;
  output: string;
  fee: number;
  cancelFee: number;
  expires: number;
  duration: number;
  recovery: number;
  fingerprint: string;
  ask: number;
  bid: number;
  preview?: boolean;
};
export type RefineryBatch = {
  id: string;
  owner: string;
  port: string;
  quote: RefineryQuote;
  submittedAt: number;
  startAt: number;
  readyAt: number;
  status: 'queued' | 'processing' | 'ready' | 'collected' | 'cancelled';
  credited: boolean;
  returns: RefineryInput[];
};
export type RefineryReady = {
  owner: string;
  port: string;
  cid: string;
  units: number;
  producedUnits: number;
  claimedUnits: number;
};
export type RefineryReceipt = {
  id: string;
  owner: string;
  kind: string;
  time: number;
  result: string;
};
export type RefineryDemand = {
  key: string;
  input: number;
  composite: number;
  reserved: number;
  paid: number;
  sold: number;
  usedOffers: string[];
};
export type MiningOrder = {
  id: string;
  owner: string;
  port: string;
  cid: string;
  grade: string;
  qty: number;
  reward: number;
  deadline: number;
  status: 'accepted' | 'delivered' | 'cancelled' | 'expired';
  demand: string;
  event: string | null;
};
export type FuelQuote = {
  id: string;
  owner: string;
  n: number;
  gain: number;
  before: number;
  capacity: number;
  ship: string;
  issuedAt: number;
  expires: number;
};
export type SavedRefinery = {
  version: 1;
  nextId: number;
  fuelQuotes: FuelQuote[];
  quotes: RefineryQuote[];
  batches: RefineryBatch[];
  ready: RefineryReady[];
  operations: RefineryReceipt[];
  demand: RefineryDemand[];
  orders: MiningOrder[];
};
export type RefineryWire = {
  port: string | null;
  available: boolean;
  home: boolean;
  faction: string;
  now: number;
  recipes: readonly Recipe[];
  batches: RefineryBatch[];
  ready: RefineryReady[];
  orders: MiningOrder[];
  offers: MiningOrder[];
};
