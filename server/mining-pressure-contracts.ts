import type { DB } from './db.ts';
import type { PlayerData, Session } from './game.ts';
import type { Space } from './space.ts';
export type CaptainPressure = {
  owner: string;
  sys: string;
  noise: number;
  updated: number;
  lastEncounter: number;
  warned: boolean;
};
export type MiningHazard = {
  id: string;
  sys: string;
  owner: string;
  participants: string[];
  sessions: number[];
  x: number;
  y: number;
  radius: number;
  triggerAt: number;
  detonateAt: number;
  resolved: boolean;
  entities: number[];
};
export type MiningEncounter = {
  id: string;
  sys: string;
  owner: string;
  participants: string[];
  sessions: number[];
  ids: number[];
  at: number;
  active: boolean;
};
export type MiningConsent = {
  owner: string;
  session: number;
  entity: number;
  sys: string;
  group: string;
  until: number;
};
export type MiningFieldRecovery = { key: string; recovery: number; updated: number };
export type SavedMiningPressure = {
  version: 1;
  nextId: number;
  captains: CaptainPressure[];
  hazards: MiningHazard[];
  encounters: MiningEncounter[];
  consent: MiningConsent[];
  fields: MiningFieldRecovery[];
};
export type PressureWire = {
  noise: number;
  warn: boolean;
  groupConsent: boolean;
  cooldown: number;
};
export type PressureSpace = Pick<
  Space,
  'id' | 'sys' | 'ships' | 'rocks' | 'makeShip' | 'root' | 'damage' | 'events'
>;
export type PressureCapabilities = {
  db: Pick<DB, 'world' | 'get' | 'key' | 'touch'>;
  sessions: () => Iterable<Session>;
  newcomer: (d: PlayerData) => boolean;
  rush: (sys: string) => boolean;
  toast: (s: Session, text: string) => void;
};

/** @import { DB } from './db.ts' */
/** @import { PlayerData, Session } from './game.ts' */
/** @import { Space } from './space.ts' */

// @ts-check
/**
 * @typedef {{owner:string,sys:string,noise:number,updated:number,lastEncounter:number,warned:boolean}} CaptainPressure
 * @typedef {{id:string,sys:string,owner:string,participants:string[],sessions:number[],x:number,y:number,radius:number,triggerAt:number,detonateAt:number,resolved:boolean,entities:number[]}} MiningHazard
 * @typedef {{id:string,sys:string,owner:string,participants:string[],sessions:number[],ids:number[],at:number,active:boolean}} MiningEncounter
 * @typedef {{owner:string,session:number,entity:number,sys:string,group:string,until:number}} MiningConsent
 * @typedef {{key:string,recovery:number,updated:number}} MiningFieldRecovery
 * @typedef {{version:1,nextId:number,captains:CaptainPressure[],hazards:MiningHazard[],encounters:MiningEncounter[],consent:MiningConsent[],fields:MiningFieldRecovery[]}} SavedMiningPressure
 * @typedef {{noise:number,warn:boolean,groupConsent:boolean,cooldown:number}} PressureWire
 * @typedef {Pick<Space,'id'|'sys'|'ships'|'rocks'|'makeShip'|'root'|'damage'|'events'>} PressureSpace
 * @typedef {object} PressureCapabilities
 * @property {Pick<DB,'world'|'get'|'key'|'touch'>} db
 * @property {()=>Iterable<Session>} sessions
 * @property {(d:PlayerData)=>boolean} newcomer
 * @property {(sys:string)=>boolean} rush
 * @property {(s:Session,text:string)=>void} toast
 */
