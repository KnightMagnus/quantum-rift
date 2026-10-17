// @ts-check
/**
 * @typedef {{version:1,heat:number,cutoff:boolean,workMs:number,harvestMs:number,outputs:Record<string,number>,recipe:string,grade:'common'|'rich'|'pure',sweep:boolean,harvest:boolean,smelter:boolean,reason:string,inputs:{sweep:number,smelter:number,corona:number}}} IndustrialShip
 * @typedef {{version:1,sources:Record<string,{units:number,last:number}>}} IndustrialWorld
 * @typedef {{t?:string,op?:'sweep'|'harvest'|'smelter'|'recipe'|'off',recipe?:string,grade?:'common'|'rich'|'pure'}} IndustrialRequest
 * @typedef {import('./game.js').Session} Session
 * @typedef {object} IndustrialCapabilities
 * @property {Pick<import('./db.js').DB,'world'|'players'|'touch'|'flush'|'economicFrozen'>} db
 * @property {()=>boolean} paused
 * @property {(d:import('./refinery-contracts.js').RefineryPlayer)=>number} room
 * @property {(d:import('./refinery-contracts.js').RefineryPlayer)=>number} power
 * @property {import('./features.js').FeatureServices['mining']['sweep']} sweep
 * @property {(p:import('./game.js').PlayerReference,it:import('./space.js').LootItem)=>boolean|void} loot
 * @property {(s:Session)=>void} refresh
 * @property {(s:Session,text:string)=>void} toast
 */
export {};
