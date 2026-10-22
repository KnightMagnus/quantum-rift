import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { DB as Database } from './db.ts';
import type { FeatureServices } from './features.ts';
import type { FloatingLoot, LootItem, Rock, Space } from './space.ts';
export type MiningLease = { from: number; to: number; seam: boolean; captain?: string | null };
export type MiningSource = {
  captain: string | null;
  source: number;
  mount: number;
  weapon: number;
  cadence: number;
  contactId: string;
};
export type MiningContact = {
  source: MiningSource;
  damage: number;
  x: number;
  y: number;
  projectile: boolean;
};
export type SavedRockGeneration = Rock & {
  key: string;
  generation: number;
  seed: number;
  stage: number;
  stages: number;
  dredgeToken?: boolean;
  dredgeWork?: number;
  dredgeContributors?: Record<string, number>;
  sweepCut?: boolean;
  heat: number;
  work: number;
  updated: number;
  lastActivity?: number;
  releaseAt: number;
  releaseHeat: number;
  ready: boolean;
  penalty: boolean;
  penaltyApplied: boolean;
  baseBudget: number;
  budget: number;
  pending: number;
  accepted: number;
  expired: number;
  discarded: number;
  emitted: number;
  tokens: boolean[];
  leases: MiningLease[];
  seen: Record<string, number>;
  captain: string | null;
  seam: number;
  lastCut: string | null;
};
export type MiningParcel = LootItem & {
  ore: string;
  rich: number;
  remainingLots: GradeLots;
  generationKey: string;
  parcelKey: string;
  progressionTokens: number[];
};
export type SavedMiningLoot = FloatingLoot & { it: MiningParcel; expires: number };
export type SavedField = {
  config: string;
  rocks: SavedRockGeneration[];
  parcels: SavedMiningLoot[];
  history: SavedRockGeneration[];
};
export type SavedMiningWorld = {
  version: 1;
  clock: number;
  nextId: number;
  systems: Record<string, SavedField>;
};
export type SavedSurvey = {
  version: 1;
  cooldownUntil: number;
  revealUntil: number;
  sys: string;
  x: number;
  y: number;
};
export type MiningRockWire = {
  id: number;
  x: number;
  y: number;
  r: number;
  ore: string;
  generation: number;
  stage: number;
  stages: number;
  hp: number;
  heat: number;
  work: number;
  ready: boolean;
  lastCut: string | null;
  acquired: boolean;
  down: boolean;
  gas: boolean;
};
export type MiningRocksWire = { version: 1; now: number; rocks: MiningRockWire[] };
export type MiningPrivateWire = {
  version: 1;
  now: number;
  cooldownUntil: number;
  revealUntil: number;
  revealed: { id: number; generation: number; seam: number; potential: string; hazard: string }[];
};
export type MiningSpace = Pick<Space, 'id' | 'rocks' | 'loot' | 'events' | 't' | 'sys'>;
export type MiningDatabase = Pick<Database, 'world' | 'touch' | 'get' | 'key'>;
export type MiningCapabilities = {
  dredgeBlueprint: (captain: string, chance: number) => void;
  db: MiningDatabase;
  pressureExtract: FeatureServices['pressure']['extracted'];
  pressureWork: FeatureServices['pressure']['work'];
  pressureRegrow: FeatureServices['pressure']['regrow'];
  paused: () => boolean;
  endTick: (miningSpace: MiningSpace) => void;
  bonus: FeatureServices['bonuses']['bonus'];
  mods: FeatureServices['fronts']['mods'];
  specOnMine: FeatureServices['specialists']['specOnMine'];
};
/**
 * @typedef {object} MiningLease
 * @property {number} from
 * @property {number} to
 * @property {boolean} seam
 * @property {string|null} [captain] Immutable useful-contact attribution.
 *
 * @typedef {object} MiningSource
 * @property {string|null} captain Captured normalized captain account at firing, not collision.
 * @property {number} source
 * @property {number} mount
 * @property {number} weapon
 * @property {number} cadence
 * @property {string} contactId Real shot ID or beam emitter/mount/frame identity.
 *
 * @typedef {object} MiningContact
 * @property {MiningSource} source
 * @property {number} damage
 * @property {number} x
 * @property {number} y
 * @property {boolean} projectile
 *
 * @typedef {Rock & {
 * key:string, generation:number, seed:number, stage:number, stages:number,
 * dredgeToken?:boolean,dredgeWork?:number,dredgeContributors?:Record<string,number>,sweepCut?:boolean,heat:number,work:number,updated:number,lastActivity?:number,releaseAt:number,releaseHeat:number,
 * ready:boolean,penalty:boolean,penaltyApplied:boolean,baseBudget:number,budget:number,pending:number,
 * accepted:number,expired:number,discarded:number,emitted:number,
 * tokens:boolean[],leases:MiningLease[],seen:Record<string,number>,captain:string|null,
 * seam:number,lastCut:string|null
 * }} SavedRockGeneration
 * @typedef {LootItem & {
 * ore:string,rich:number,remainingLots:GradeLots,
 * generationKey:string,parcelKey:string,progressionTokens:number[]
 * }} MiningParcel
 * @typedef {FloatingLoot & {it:MiningParcel,expires:number}} SavedMiningLoot
 * @typedef {{config:string,rocks:SavedRockGeneration[],parcels:SavedMiningLoot[],history:SavedRockGeneration[]}} SavedField
 * @typedef {{version:1,clock:number,nextId:number,systems:Record<string,SavedField>}} SavedMiningWorld
 * @typedef {{version:1,cooldownUntil:number,revealUntil:number,sys:string,x:number,y:number}} SavedSurvey
 * @typedef {{id:number,x:number,y:number,r:number,ore:string,generation:number,stage:number,stages:number,hp:number,heat:number,work:number,ready:boolean,lastCut:string|null,acquired:boolean,down:boolean,gas:boolean}} MiningRockWire
 * @typedef {{version:1,now:number,rocks:MiningRockWire[]}} MiningRocksWire
 * @typedef {{version:1,now:number,cooldownUntil:number,revealUntil:number,revealed:{id:number,generation:number,seam:number,potential:string,hazard:string}[]}} MiningPrivateWire
 * @typedef {Pick<Space,'id'|'rocks'|'loot'|'events'|'t'|'sys'>} MiningSpace
 * @typedef {Pick<DB,'world'|'touch'|'get'|'key'>} MiningDatabase
 * @typedef {object} MiningCapabilities
 * @property {(captain:string,chance:number)=>void} dredgeBlueprint
 * @property {MiningDatabase} db
 * @property {FeatureServices["pressure"]["extracted"]} pressureExtract
 * @property {FeatureServices["pressure"]["work"]} pressureWork
 * @property {FeatureServices["pressure"]["regrow"]} pressureRegrow
 * @property {()=>boolean} paused
 * @property {(sp:MiningSpace)=>void} endTick
 * @property {FeatureServices['bonuses']['bonus']} bonus
 * @property {FeatureServices['fronts']['mods']} mods
 * @property {FeatureServices['specialists']['specOnMine']} specOnMine
 */
