/** @import { ComputedShipStats } from '../shared/rules.js' */
/** @import { DB } from './db.js' */
/** @import { PlayerData } from './game.js' */

// @ts-check
/**
 * @typedef {import('../shared/cargo-contracts.js').GradeLots} Lots
 * @typedef {'available'|'attached'|'detached'|'delivered'|'destroyed'} TowStatus
 * @typedef {{id:number,epoch:number,slot:string,sys:string,x:number,y:number,vx:number,vy:number,mass:number,ore:string,lots:Lots,hp:number,status:TowStatus,owner:string|null,ship:string|null,graceUntil:number,revision:number,acceptPorts:string[]}} Motherlode
 * @typedef {{key:string,sys:string,field:number,epoch:number,issued:number,delivered:number,discarded:number,nextAt:number,object:Motherlode|null}} TowSlot
 * @typedef {{id:number,owner:string,port:string,ore:string,lots:Lots,mass:number}} TowReceipt
 * @typedef {{id:number,revision:number,from:string,to:string,fromShip:string,toShip:string,fromEntity:number,toEntity:number,until:number}} TowOffer
 * @typedef {{version:1,nextId:number,slots:TowSlot[],receipts:TowReceipt[],offers:TowOffer[]}} TowWorld
 * @typedef {{t?:string,op?:'attach'|'detach'|'offer'|'accept'|'deliver',id?:number,revision?:number,to?:string,port?:string}} TowRequest
 * @typedef {import('./game.js').Session} Session
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
export {};
