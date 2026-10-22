/** @import { DB } from './db.js' */
/** @import { PlayerData, Session } from './game.js' */
/** @import { Space } from './space.js' */

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
export {};
