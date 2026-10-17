// @ts-check
/**
 * @typedef {object} MiningLease
 * @property {number} from
 * @property {number} to
 * @property {boolean} seam
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
 * @typedef {import('./space.js').Rock & {
 * key:string, generation:number, seed:number, stage:number, stages:number,
 * heat:number,work:number,updated:number,releaseAt:number,releaseHeat:number,
 * ready:boolean,penalty:boolean,penaltyApplied:boolean,baseBudget:number,budget:number,pending:number,
 * accepted:number,expired:number,discarded:number,emitted:number,
 * tokens:boolean[],leases:MiningLease[],seen:Record<string,number>,captain:string|null,
 * seam:number,lastCut:string|null
 * }} SavedRockGeneration
 * @typedef {import('./space.js').LootItem & {
 * ore:string,rich:number,remainingLots:import('../shared/cargo-contracts.js').GradeLots,
 * generationKey:string,parcelKey:string,progressionTokens:number[]
 * }} MiningParcel
 * @typedef {import('./space.js').FloatingLoot & {it:MiningParcel,expires:number}} SavedMiningLoot
 * @typedef {{config:string,rocks:SavedRockGeneration[],parcels:SavedMiningLoot[],history:SavedRockGeneration[]}} SavedField
 * @typedef {{version:1,clock:number,nextId:number,systems:Record<string,SavedField>}} SavedMiningWorld
 * @typedef {{version:1,cooldownUntil:number,revealUntil:number,sys:string,x:number,y:number}} SavedSurvey
 * @typedef {{id:number,x:number,y:number,r:number,ore:string,generation:number,stage:number,stages:number,hp:number,heat:number,work:number,ready:boolean,lastCut:string|null,acquired:boolean,down:boolean,gas:boolean}} MiningRockWire
 * @typedef {{version:1,now:number,rocks:MiningRockWire[]}} MiningRocksWire
 * @typedef {{version:1,now:number,cooldownUntil:number,revealUntil:number,revealed:{id:number,generation:number,seam:number,potential:string,hazard:string}[]}} MiningPrivateWire
 * @typedef {Pick<import('./space.js').Space,'id'|'rocks'|'loot'|'events'|'t'|'sys'>} MiningSpace
 * @typedef {Pick<import('./db.js').DB,'world'|'touch'|'get'|'key'>} MiningDatabase
 * @typedef {object} MiningCapabilities
 * @property {MiningDatabase} db
 * @property {()=>boolean} paused
 * @property {(sp:MiningSpace)=>void} endTick
 * @property {import('./features.js').FeatureServices['bonuses']['bonus']} bonus
 * @property {import('./features.js').FeatureServices['fronts']['mods']} mods
 * @property {import('./features.js').FeatureServices['specialists']['specOnMine']} specOnMine
 */
export {};
