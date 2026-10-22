import type { CargoLedger, CargoTotals, GradeLots } from '../shared/cargo-contracts.ts';
import type { Recipe } from '../shared/refinery-rules.ts';
import type { DB as Database } from './db.ts';
import type { Mission, PlayerData, Session } from './game.ts';
export type RefineryPlayer = PlayerData & {
  cargo: CargoTotals;
  cargoLots: CargoLedger;
  missions: Mission[];
  fuel?: number;
  landPass?: Record<string, number>;
};
export type RefinerySession = Omit<Session, 'data'> & { data: RefineryPlayer };
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
export type RefineryRequest = {
  t?: string;
  op?: string;
  id?: string;
  port?: string;
  recipe?: string;
  grade?: string;
  mode?: string;
  n?: number;
};
export type RefineryCapabilities = {
  db: Pick<Database, 'world' | 'touch' | 'flush' | 'get' | 'key' | 'journal' | 'economicFrozen'>;
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

/** @import { CargoLedger, CargoTotals, GradeLots } from '../shared/cargo-contracts.ts' */
/** @import { Recipe } from '../shared/refinery-rules.ts' */
/** @import { DB } from './db.ts' */
/** @import { Mission, PlayerData, Session } from './game.ts' */

// @ts-check
/**
 * @typedef {PlayerData & {cargo:CargoTotals,cargoLots:CargoLedger,missions:Mission[],fuel?:number,landPass?:Record<string,number>}} RefineryPlayer
 * @typedef {Omit<Session,'data'> & {data:RefineryPlayer}} RefinerySession
 * @typedef {{cid:string,lots:GradeLots}} RefineryInput
 * @typedef {{id:string,owner:string,port:string,recipe:string,version:1,mode:string,inputs:RefineryInput[],inputTonnes:number,units:number,output:string,fee:number,cancelFee:number,expires:number,duration:number,recovery:number,fingerprint:string,ask:number,bid:number,preview?:boolean}} RefineryQuote
 * @typedef {{id:string,owner:string,port:string,quote:RefineryQuote,submittedAt:number,startAt:number,readyAt:number,status:'queued'|'processing'|'ready'|'collected'|'cancelled',credited:boolean,returns:RefineryInput[]}} RefineryBatch
 * @typedef {{owner:string,port:string,cid:string,units:number,producedUnits:number,claimedUnits:number}} RefineryReady
 * @typedef {{id:string,owner:string,kind:string,time:number,result:string}} RefineryReceipt
 * @typedef {{key:string,input:number,composite:number,reserved:number,paid:number,sold:number,usedOffers:string[]}} RefineryDemand
 * @typedef {{id:string,owner:string,port:string,cid:string,grade:string,qty:number,reward:number,deadline:number,status:'accepted'|'delivered'|'cancelled'|'expired',demand:string,event:string|null}} MiningOrder
 * @typedef {{id:string,owner:string,n:number,gain:number,before:number,capacity:number,ship:string,issuedAt:number,expires:number}} FuelQuote
 * @typedef {{version:1,nextId:number,fuelQuotes:FuelQuote[],quotes:RefineryQuote[],batches:RefineryBatch[],ready:RefineryReady[],operations:RefineryReceipt[],demand:RefineryDemand[],orders:MiningOrder[]}} SavedRefinery
 * @typedef {{port:string|null,available:boolean,home:boolean,faction:string,now:number,recipes:readonly Recipe[],batches:RefineryBatch[],ready:RefineryReady[],orders:MiningOrder[],offers:MiningOrder[]}} RefineryWire
 * @typedef {{t?:string,op?:string,id?:string,port?:string,recipe?:string,grade?:string,mode?:string,n?:number}} RefineryRequest
 * @typedef {object} RefineryCapabilities
 * @property {Pick<DB,'world'|'touch'|'flush'|'get'|'key'|'journal'|'economicFrozen'>} db
 * @property {()=>number} now
 * @property {()=>boolean} paused
 * @property {(d:RefineryPlayer)=>number} room
 * @property {(d:RefineryPlayer)=>number} fuelCapacity
 * @property {(d:RefineryPlayer,port:string)=>{available:boolean,home:boolean,faction:string,near:boolean}} access
 * @property {(d:RefineryPlayer,port:string,cid:string,now:number)=>{ask:number,bid:number,fingerprint:string}} pricing
 * @property {(s:RefinerySession,event:string,delivered:number)=>void} rushProgress
 * @property {(sys:string)=>{id:string,until:number}|null} rush
 * @property {(s:RefinerySession)=>RefineryWire} payload
 * @property {(s:RefinerySession)=>void} refresh
 * @property {(s:RefinerySession,m:object)=>void} send
 * @property {(s:RefinerySession,text:string)=>void} toast
 */
