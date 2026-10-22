import type { DB } from './db.ts';
import type { FeatureServices } from './features.ts';
import type { PlayerReference } from './game.ts';
import type { RefineryPlayer } from './refinery-contracts.ts';
import type { LootItem } from './space.ts';
export type IndustrialShip = {
  version: 1;
  heat: number;
  cutoff: boolean;
  workMs: number;
  harvestMs: number;
  outputs: Record<string, number>;
  recipe: string;
  grade: 'common' | 'rich' | 'pure';
  sweep: boolean;
  harvest: boolean;
  smelter: boolean;
  reason: string;
  inputs: { sweep: number; smelter: number; corona: number };
};
export type IndustrialWorld = {
  version: 1;
  sources: Record<string, { units: number; last: number }>;
};
export type IndustrialRequest = {
  t?: string;
  op?: 'sweep' | 'harvest' | 'smelter' | 'recipe' | 'off';
  recipe?: string;
  grade?: 'common' | 'rich' | 'pure';
};
export type Session = import('./game.ts').Session;
export type IndustrialCapabilities = {
  db: Pick<DB, 'world' | 'players' | 'touch' | 'flush' | 'economicFrozen'>;
  paused: () => boolean;
  room: (d: RefineryPlayer) => number;
  power: (d: RefineryPlayer) => number;
  sweep: FeatureServices['mining']['sweep'];
  loot: (p: PlayerReference, it: LootItem) => boolean | void;
  refresh: (s: Session) => void;
  toast: (s: Session, text: string) => void;
};

/** @import { DB } from './db.ts' */
/** @import { FeatureServices } from './features.ts' */
/** @import { PlayerReference } from './game.ts' */
/** @import { RefineryPlayer } from './refinery-contracts.ts' */
/** @import { LootItem } from './space.ts' */

// @ts-check
/**
 * @typedef {{version:1,heat:number,cutoff:boolean,workMs:number,harvestMs:number,outputs:Record<string,number>,recipe:string,grade:'common'|'rich'|'pure',sweep:boolean,harvest:boolean,smelter:boolean,reason:string,inputs:{sweep:number,smelter:number,corona:number}}} IndustrialShip
 * @typedef {{version:1,sources:Record<string,{units:number,last:number}>}} IndustrialWorld
 * @typedef {{t?:string,op?:'sweep'|'harvest'|'smelter'|'recipe'|'off',recipe?:string,grade?:'common'|'rich'|'pure'}} IndustrialRequest
 * @typedef {import('./game.ts').Session} Session
 * @typedef {object} IndustrialCapabilities
 * @property {Pick<DB,'world'|'players'|'touch'|'flush'|'economicFrozen'>} db
 * @property {()=>boolean} paused
 * @property {(d:RefineryPlayer)=>number} room
 * @property {(d:RefineryPlayer)=>number} power
 * @property {FeatureServices['mining']['sweep']} sweep
 * @property {(p:PlayerReference,it:LootItem)=>boolean|void} loot
 * @property {(s:Session)=>void} refresh
 * @property {(s:Session,text:string)=>void} toast
 */
