// @ts-check
/**
 * @typedef {{owner:string,sys:string,noise:number,updated:number,lastEncounter:number,warned:boolean}} CaptainPressure
 * @typedef {{id:string,sys:string,owner:string,participants:string[],sessions:number[],x:number,y:number,radius:number,triggerAt:number,detonateAt:number,resolved:boolean,entities:number[]}} MiningHazard
 * @typedef {{id:string,sys:string,owner:string,participants:string[],sessions:number[],ids:number[],at:number,active:boolean}} MiningEncounter
 * @typedef {{owner:string,session:number,sys:string,group:string,until:number}} MiningConsent
 * @typedef {{key:string,recovery:number,updated:number}} MiningFieldRecovery
 * @typedef {{version:1,nextId:number,captains:CaptainPressure[],hazards:MiningHazard[],encounters:MiningEncounter[],consent:MiningConsent[],fields:MiningFieldRecovery[]}} SavedMiningPressure
 * @typedef {{noise:number,warn:boolean,groupConsent:boolean,cooldown:number}} PressureWire
 * @typedef {Pick<import('./space.js').Space,'id'|'sys'|'ships'|'rocks'|'makeShip'|'root'|'damage'|'events'>} PressureSpace
 * @typedef {object} PressureCapabilities
 * @property {Pick<import('./db.js').DB,'world'|'get'|'key'|'touch'>} db
 * @property {()=>Iterable<import('./game.js').Session>} sessions
 * @property {(d:import('./game.js').PlayerData)=>boolean} newcomer
 * @property {(sys:string)=>boolean} rush
 * @property {(s:import('./game.js').Session,text:string)=>void} toast
 */
export {};
