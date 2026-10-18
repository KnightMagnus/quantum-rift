// @ts-check
/**
 * @typedef {import('./game.js').PlayerData & {cargo:import('../shared/cargo-contracts.js').CargoTotals,cargoLots:import('../shared/cargo-contracts.js').CargoLedger,missions:import('./game.js').Mission[],fuel?:number,landPass?:Record<string,number>}} RefineryPlayer
 * @typedef {Omit<import('./game.js').Session,'data'> & {data:RefineryPlayer}} RefinerySession
 * @typedef {{cid:string,lots:import('../shared/cargo-contracts.js').GradeLots}} RefineryInput
 * @typedef {{id:string,owner:string,port:string,recipe:string,version:1,mode:string,inputs:RefineryInput[],inputTonnes:number,units:number,output:string,fee:number,cancelFee:number,expires:number,duration:number,recovery:number,fingerprint:string,ask:number,bid:number,preview?:boolean}} RefineryQuote
 * @typedef {{id:string,owner:string,port:string,quote:RefineryQuote,submittedAt:number,startAt:number,readyAt:number,status:'queued'|'processing'|'ready'|'collected'|'cancelled',credited:boolean,returns:RefineryInput[]}} RefineryBatch
 * @typedef {{owner:string,port:string,cid:string,units:number,producedUnits:number,claimedUnits:number}} RefineryReady
 * @typedef {{id:string,owner:string,kind:string,time:number,result:string}} RefineryReceipt
 * @typedef {{key:string,input:number,composite:number,reserved:number,paid:number,sold:number,usedOffers:string[]}} RefineryDemand
 * @typedef {{id:string,owner:string,port:string,cid:string,grade:string,qty:number,reward:number,deadline:number,status:'accepted'|'delivered'|'cancelled'|'expired',demand:string,event:string|null}} MiningOrder
 * @typedef {{id:string,owner:string,n:number,gain:number,before:number,capacity:number,ship:string,issuedAt:number,expires:number}} FuelQuote
 * @typedef {{version:1,nextId:number,fuelQuotes:FuelQuote[],quotes:RefineryQuote[],batches:RefineryBatch[],ready:RefineryReady[],operations:RefineryReceipt[],demand:RefineryDemand[],orders:MiningOrder[]}} SavedRefinery
 * @typedef {{port:string|null,available:boolean,home:boolean,faction:string,now:number,recipes:readonly import('../shared/refinery-rules.js').Recipe[],batches:RefineryBatch[],ready:RefineryReady[],orders:MiningOrder[],offers:MiningOrder[]}} RefineryWire
 * @typedef {{t?:string,op?:string,id?:string,port?:string,recipe?:string,grade?:string,mode?:string,n?:number}} RefineryRequest
 * @typedef {object} RefineryCapabilities
 * @property {Pick<import('./db.js').DB,'world'|'touch'|'flush'|'get'|'key'|'journal'|'economicFrozen'>} db
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
export {};
