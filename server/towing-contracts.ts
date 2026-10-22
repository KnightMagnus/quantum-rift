import type { ComputedShipStats } from '../shared/rules.ts';
import type { DB } from './db.ts';
import type { PlayerData } from './game.ts';
export type Lots = import('../shared/cargo-contracts.ts').GradeLots;
export type TowStatus = 'available' | 'attached' | 'detached' | 'delivered' | 'destroyed';
export type Motherlode = {
  id: number;
  epoch: number;
  slot: string;
  sys: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  ore: string;
  lots: Lots;
  hp: number;
  status: TowStatus;
  owner: string | null;
  ship: string | null;
  graceUntil: number;
  revision: number;
  acceptPorts: string[];
};
export type TowSlot = {
  key: string;
  sys: string;
  field: number;
  epoch: number;
  issued: number;
  delivered: number;
  discarded: number;
  nextAt: number;
  object: Motherlode | null;
};
export type TowReceipt = {
  id: number;
  owner: string;
  port: string;
  ore: string;
  lots: Lots;
  mass: number;
};
export type TowOffer = {
  id: number;
  revision: number;
  from: string;
  to: string;
  fromShip: string;
  toShip: string;
  fromEntity: number;
  toEntity: number;
  until: number;
};
export type TowWorld = {
  version: 1;
  nextId: number;
  slots: TowSlot[];
  receipts: TowReceipt[];
  offers: TowOffer[];
};
export type TowRequest = {
  t?: string;
  op?: 'attach' | 'detach' | 'offer' | 'accept' | 'deliver';
  id?: number;
  revision?: number;
  to?: string;
  port?: string;
};
export type Session = import('./game.ts').Session;
export type TowCapabilities = {
  db: Pick<DB, 'world' | 'players' | 'touch' | 'flush' | 'economicFrozen' | 'key'>;
  paused: () => boolean;
  sessions: () => IterableIterator<Session>;
  refresh: (s: Session) => void;
  toast: (s: Session, text: string) => void;
  stopCombat: (s: Session) => void;
  room: (d: PlayerData) => number;
  stats: (d: PlayerData) => ComputedShipStats | null;
  field: (sys: string, field: number) => { recovery: number; label: string; factor: number };
};

/** @import { ComputedShipStats } from '../shared/rules.ts' */
/** @import { DB } from './db.ts' */
/** @import { PlayerData } from './game.ts' */

// @ts-check
/**
 * @typedef {import('../shared/cargo-contracts.ts').GradeLots} Lots
 * @typedef {'available'|'attached'|'detached'|'delivered'|'destroyed'} TowStatus
 * @typedef {{id:number,epoch:number,slot:string,sys:string,x:number,y:number,vx:number,vy:number,mass:number,ore:string,lots:Lots,hp:number,status:TowStatus,owner:string|null,ship:string|null,graceUntil:number,revision:number,acceptPorts:string[]}} Motherlode
 * @typedef {{key:string,sys:string,field:number,epoch:number,issued:number,delivered:number,discarded:number,nextAt:number,object:Motherlode|null}} TowSlot
 * @typedef {{id:number,owner:string,port:string,ore:string,lots:Lots,mass:number}} TowReceipt
 * @typedef {{id:number,revision:number,from:string,to:string,fromShip:string,toShip:string,fromEntity:number,toEntity:number,until:number}} TowOffer
 * @typedef {{version:1,nextId:number,slots:TowSlot[],receipts:TowReceipt[],offers:TowOffer[]}} TowWorld
 * @typedef {{t?:string,op?:'attach'|'detach'|'offer'|'accept'|'deliver',id?:number,revision?:number,to?:string,port?:string}} TowRequest
 * @typedef {import('./game.ts').Session} Session
 * @typedef {object} TowCapabilities
 * @property {Pick<DB,'world'|'players'|'touch'|'flush'|'economicFrozen'|'key'>} db
 * @property {()=>boolean} paused
 * @property {()=>IterableIterator<Session>} sessions
 * @property {(s:Session)=>void} refresh
 * @property {(s:Session,text:string)=>void} toast
 * @property {(s:Session)=>void} stopCombat
 * @property {(d:PlayerData)=>number} room
 * @property {(d:PlayerData)=>ComputedShipStats|null} stats
 * @property {(sys:string,field:number)=>{recovery:number,label:string,factor:number}} field
 */
