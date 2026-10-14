import { TUTORIAL } from '../shared/tutorial.js';
import fs from 'node:fs';
// Quantum Rift game server: sessions, the galaxy's systems, landing services, missions, Quantum Station.
import { SYSTEMS, SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES, START, FACTION_HULLS, FACTION_OUTFITS, EXTRA_OUTFITS,
         OPS, RESEARCH, REFINERY, ORE_PROCESS, STATION_SHIPS, MK2_OF, MK3_OF, WINGMATES, ARMADA, TRAFFIC, SITES, SITE_PRICES } from '../shared/galaxy.js';
import { augmentAssets, shipStats, researchBonus, price, allOutfits, makeLoadout, K, DT, TICK, angleTo, credits } from '../shared/rules.js';
import { Space } from './space.js';
import { HangarMixin } from './hangar.js';
import { FrontsMixin } from './fronts.js';
import { FrontierMixin } from './frontier.js';
import { SpecialistMixin } from './specialists.js';
import { HostileMixin } from './hostile.js';
import { StoryMixin } from './story.js';
import { RivalsMixin } from './rivals.js';
import { HailMixin } from './hail.js';
import { FleetCmdMixin } from './fleetcmd.js';
import { SyndicateMixin, destType } from './syndicate.js';
import { synTier } from '../shared/syndicate.js';
import { ArcsMixin } from './arcs.js';
import { DocksMixin } from './docks.js';
import { LivingMixin } from './living.js';
import { QuestMixin } from './quests.js';
import { STATES } from '../shared/living.js';
import { WING_ONLY } from '../shared/docks.js';
import { ARCS } from '../shared/arcs.js';
const ARCS_NAME = (f) => ARCS[f] ? ARCS[f].name : '';
import { masteryTier } from '../shared/frontier.js';
import { SHUTTLES } from '../shared/hangar.js';
import { SPEC } from '../shared/specialty.js';
import { captainBonus } from '../shared/rules.js';
import { bunks } from '../shared/syndicate.js';

const MAT_PRICE = [6000, 18000, 45000, 110000, 260000];
const NAMES = ['Vask', 'Oru', 'Sable', 'Kettle', 'Marrow', 'Jask', 'Thorne', 'Cinder', 'Wren', 'Grail', 'Hollis', 'Vey', 'Rook', 'Ash', 'Quill', 'Drey'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function jumpsFrom(a) { const d = { [a]: 0 }, q = [a]; while (q.length) { const s = q.shift(); for (const l of SYS[s].links) if (d[l] === undefined) { d[l] = d[s] + 1; q.push(l); } } return d; }
const JUMPS = Object.fromEntries(SYSTEMS.map(s => [s.id, jumpsFrom(s.id)]));

export class Game {
  constructor(A, db) {
    augmentAssets(A); this.A = A; this.db = db; this.O = allOutfits(A); this.spaces = {}; this.sessions = new Map(); this.nextSid = 1; this.tickN = 0;
    // Systems are simulated only while someone is there (or was, recently): a space is created on first access
    // and dropped after two quiet minutes, so 200 systems cost no more than the handful that are occupied.
    const live = this.live = {};
    this.spaces = new Proxy(live, { get: (t, k) => t[k] || (typeof k === 'string' && SYS[k] ? this.wake(t[k] = new Space(this, k)) : undefined) });
    this.frontsInit(); this.frontierInit(); this.rivalsInit(); this.livingInit(); this.livingTick();
    this.seed();
    setInterval(() => { try { this.tick(); } catch (e) { this.tickErr = (this.tickErr || 0) + 1; if (this.tickErr < 20 || this.tickErr % 500 === 0) console.error('tick error', this.tickErr, e); } }, 1000 / TICK);   // 2.0.2: one bad ship never takes the server down
  }

  // solo mode: save slots and save files
  slots() { return Object.values(this.db.players).map(p => ({ name: p.name, ship: this.A.ships[p.ship.hull] ? this.A.ships[p.ship.hull].name : '?', credits: p.credits, ops: p.station ? p.station.ops : 0, sys: SYS[p.sys] ? SYS[p.sys].name : '' })); }
  importSave(sv) {
    if (!sv || typeof sv.name !== 'string' || !sv.ship || !sv.station) throw new Error('That is not a Quantum Rift save file.');
    const name = sv.name.trim().slice(0, 20); if (!/^[A-Za-z0-9 _'-]{3,20}$/.test(name)) throw new Error('Bad captain name in the save.');
    for (const o of this.sessions.values()) if (o.data && o.data.name.toLowerCase() === name.toLowerCase()) throw new Error('That captain is playing right now.');
    const p = this.db.create(name, 'solo', {}); for (const k of Object.keys(sv)) if (!['__proto__', 'constructor', 'prototype', 'salt', 'hash'].includes(k)) p[k] = sv[k]; p.name = name; this.db.touch(); this.db.flush(); return name;   // 2.0.3: own keys only
  }
  wake(sp) { this.spawnDread(sp); return sp; }
  // Accounts listed in server/seeds.json are created on start-up if they don't exist yet (existing saves are never touched).
  seed() {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(process.env.SEEDS_FILE || new URL('./seeds.json', import.meta.url), 'utf8')); } catch { return; }
    for (const c of list) {
      if (c.retire && c.name) { this.retireAccount(c.name); continue; }   // 2.0.2: retired seed accounts are removed, and their holdings freed
      if (!c.name || !c.pass) continue;
      const have = this.db.get(c.name);
      if (have) { if (c.sync) this.syncSeed(have, c); continue; }
      const d = this.fresh(); d.tut = c.tutorial ? 0 : TUTORIAL.length;   // seeded veterans skip the tutorial
      d.explored = SYSTEMS.filter(x => x.anchor).map(x => x.id);
      if (c.credits !== undefined) d.credits = c.credits;
      if (c.rep) Object.assign(d.rep, c.rep); if (c.extra) Object.assign(d, JSON.parse(JSON.stringify(c.extra)));   // 1.2: test seeds can set standing, Syndicate points, commendations...
      if (c.ship) d.ship = makeLoadout(this.A, c.ship, c.shipName || 'Rift Runner');
      if (c.outfits) for (const [o, n] of Object.entries(c.outfits)) d.ship.outfits[o] = (d.ship.outfits[o] || 0) + n;
      if (c.station) {
        const st = d.station; st.claimed = true; st.ops = c.station.ops || 0; st.refT = Date.now();
        if (c.station.research === 'all') st.done = RESEARCH.map(r => r.id);
        if (c.station.site && STELLARS[c.station.site] && !this.siteOwner(c.station.site)) { st.site = c.station.site; this.db.world.sites[c.station.site] = this.db.key(c.name); }
      }
      if (c.mats) for (const m of MATERIALS) d.mats[m] = c.mats.slice();
      if (c.system && SYS[c.system]) { d.sys = c.system; d.stellar = c.stellar || d.stellar; }
      const p = this.db.create(c.name, c.pass, d); this.log(p, c.log || 'Arrived in the Rift.');
      if (c.sync) this.syncSeed(p, c);
      console.log('Created seeded captain', c.name);
    }
    this.db.touch(); this.db.flush();
  }
  // "sync": true keeps a showcase captain's station fully upgraded across new versions (every research project done,
  // Ops 5, a full hangar and, if listed, an elite bridge crew). Credits, ships and cargo are left alone.
  retireAccount(name) {
    const k = this.db.key(name), p = this.db.get(name); if (!p) return;
    for (const o of this.sessions.values()) if (o.data === p) { try { o.sock.close(); } catch {} }
    const W = this.db.world;
    for (const [site, owner] of Object.entries(W.sites || {})) if (owner === k) delete W.sites[site];                 // the station hull is a derelict again
    for (const [id, c] of Object.entries(W.colonies || {})) if (c.owner === k) delete W.colonies[id];
    if (Array.isArray(W.orders)) W.orders = W.orders.filter(o => o.owner !== p.name);
    for (const F of Object.values(W.fleets || {})) if (Array.isArray(F.members)) F.members = F.members.filter(m => (typeof m === 'string' ? this.db.key(m) : m) !== k);
    delete this.db.players[k]; this.db.touch(); this.db.flush(); console.log(`Retired seeded captain ${p.name}; their station hull is unclaimed again.`);
  }
  syncSeed(p, c) {
    this.hangarInit(p);
    const st = p.station, want = c.station || {};
    st.claimed = true; st.ops = Math.max(st.ops || 0, want.ops || 5);
    if (want.research === 'all') { st.done = RESEARCH.map(r => r.id); st.active = null; st.queue = []; }
    if (!st.site && want.site && STELLARS[want.site] && !this.siteOwner(want.site)) { st.site = want.site; this.db.world.sites[want.site] = this.db.key(p.name); }
    if (want.shuttles === 'all') for (const kind of Object.keys(SHUTTLES)) if (!p.shuttles.some(x => x.kind === kind) && p.shuttles.length < this.bays(p)) p.shuttles.push({ id: this.uid(p), kind, state: 'idle', crew: null, runs: 0 });
    if (c.officers && !p.officers.some(o => o.seed)) for (const [i, o] of c.officers.entries()) {
      const off = { id: this.uid(p), seed: true, name: o.name, race: o.race, role: o.role, rarity: o.rarity ?? 3, lv: o.lv || 10, xp: 0 };
      p.officers.push(off); if (o.slot) p.bridge[o.slot] = off.id;
    }
    if (c.mats) for (const m of MATERIALS) p.mats[m] = p.mats[m].map((n, g) => Math.max(n, c.mats[g]));
    p.tut = TUTORIAL.length;   // showcase captains skip the career guide
    if (c.storyPass) { this.storyInit(p); p.story.pass = true; }
    if (c.blueprints) { p.bp = p.bp || {}; for (const id of Object.keys(SPEC)) p.bp[id] = Math.max(p.bp[id] || 0, c.blueprints); }
    if (c.fleet && !p.seedFleet) this.seedFleet(p, c.fleet);
    console.log('Synced seeded captain', c.name);
  }
  // 2.1 playtest seeds: fill the docks with ships and crew them, once ({ docks: [{ lead, name, wings: [hulls] }], crew: [...officers], spare: [...officers] })
  seedFleet(p, F) {
    this.docksInit(p); p.seedFleet = true;
    const crew = [...(F.crew || [])], newOff = (o) => { const off = { id: this.uid(p), seed: true, name: o.name, race: o.race, role: o.role, rarity: o.rarity ?? 2, lv: o.lv || 10, xp: 0 }; p.officers.push(off); return off.id; };
    (F.docks || []).forEach((D, i) => {
      if (i >= p.docks.length) return;
      if (D.lead) {
        const ship = makeLoadout(this.A, D.lead, D.name || this.A.ships[D.lead].name); ship.uid = this.shipUid(p);
        if (i === p.activeDock) { p.ship = ship; p.shipless = false; p.docks[i].lead = ship.uid; }   // a test account: the old ship is simply replaced
        else { p.dock.push({ ship, bridge: {} }); p.docks[i].lead = ship.uid; }
      }
      p.docks[i].wings = (D.wings || []).map(h => {
        const ship = makeLoadout(this.A, h, this.A.ships[h].name); ship.uid = this.shipUid(p); p.dock.push({ ship, bridge: {} });
        const cap = crew.length ? newOff(crew.shift()) : null, mate = crew.length ? newOff(crew.shift()) : null;
        return { uid: ship.uid, cap, crew: mate };
      });
    });
    for (const o of F.spare || []) newOff(o);
    this.docksInit(p);
  }
  // ------------------------------------------------------------------ sessions
  fresh() {
    const rep = Object.fromEntries(Object.keys(FACTIONS).map(f => [f, 0])); rep.quantum = 10;
    return { credits: START.credits, sys: START.system, stellar: START.stellar, ship: makeLoadout(this.A, START.ship, 'Rift Runner'),
             cargo: {}, mats: Object.fromEntries(MATERIALS.map(m => [m, [0, 0, 0, 0, 0]])), rep, missions: [], escorts: [], log: [],
             station: { claimed: false, ops: 0, refUnits: 0, refT: Date.now(), active: null, done: [] }, stats: { kills: 0, jumps: 0, earned: 0 }, tut: 0, explored: [START.system] };
  }
  connect(sock, ip = '?') {
    const s = { id: this.nextSid++, sock, ip, data: null, ent: null, inputs: [], lastInput: null, name: null, chatT: 0, msgs: 0, msgT: Date.now() };
    this.sessions.set(s.id, s);
    sock.on('message', (m) => { try { this.onMessage(s, JSON.parse(m)); } catch (e) { console.error('message error', e); } });
    sock.on('close', () => this.disconnect(s));
  }
  disconnect(s) {
    this.sessions.delete(s.id);
    for (const q of Object.values(this.arenaQ || {})) { const i = q.indexOf(s.id); if (i >= 0) q.splice(i, 1); }
    if (s.data && this.matches && this.matches[s.data.sys]) { this.matches[s.data.sys].alive.delete(s.data.name); s.data.stellar = s.data.arenaReturn || 'qstation'; }
    if (s.ent) {
      const d = s.data, sp = this.spaces[d.sys], e = s.ent;
      this.dropEscorts(sp, e); sp.remove(e); sp.players--; s.ent = null;
      // logging off in space: you are docked at the nearest world in the same system, or back at your last landing
      const here = SYS[d.sys].stellars.filter(p => p.svc.includes('L') && !(p.site && this.siteOwner(p.id) && !this.ownSite(d, p)))
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (here) d.stellar = here.id;
      else { const back = d.lastStellar && STELLARS[d.lastStellar] ? d.lastStellar : START.stellar; d.stellar = back; d.sys = STELLARS[back].system; }
      d.fuel = e.fuel;
    }
    if (s.data) { this.db.touch(); if (!this.solo) this.broadcast({ t: 'chat', from: '', msg: `${s.name} left the Rift.` }); }
  }
  send(s, m) { if (s.sock.open && s.sock.backlog < 4e6) s.sock.send(m); }
  toast(s, msg) { this.send(s, { t: 'toast', msg }); }
  broadcast(m, filter) { const str = JSON.stringify(m); for (const s of this.sessions.values()) if (s.data && (!filter || filter(s))) this.send(s, str); }
  get rep() { return null; }
  you(s) {
    const d = s.data; this.docksInit(d); this.checkStation(d);
    const st = this.stats(d);
    this.send(s, { t: 'you', d: { name: d.name, credits: d.credits, sys: d.sys, stellar: d.stellar, ship: d.ship, cargo: d.cargo, paid: d.paid || {}, mats: d.mats, rep: d.rep,
      shipless: !!d.shipless, docks: this.docksPayload(d), newcomer: this.newcomer(d), arcs: this.arcsPayload(d), expd: d.expd || { n: 0 }, rank: this.rankOf(d), syn: synTier(d.syn), shards: d.shards || 0, lower: d.lower || [], loan: d.loan || null, credit: d.credit || 600, missions: d.missions, escorts: d.escorts, shuttles: d.shuttles, officers: d.officers, bridge: d.bridge, dock: d.dock, bays: this.bays(d), dockSlots: this.dockSlots(d),
      board: this.shuttleBoard(d), bonus: this.bonus(d), fleet: this.fleetPayload(d), goals: this.goalsFor(d), tokens: d.tokens || {}, chains: d.chains || {}, quests: this.questsPayload(d),
      arena: this.arenaPayload(d, s), spec: d.spec || {}, bp: d.bp || {}, directives: d.directives || { 1: 0, 2: 0, 3: 0 }, story: this.storyPayload(d), holdout: d.holdout ? { best: d.holdout.best || 0, lastT: d.holdout.lastT || 0, wave: d.holdout.active ? d.holdout.active.wave : 0, active: !!d.holdout.active } : null, power: this.myPower(d), parts: d.parts || {}, specState: d.specState || {}, mastery: d.mastery || {}, colonies: this.coloniesOf(d).map(([id, c]) => ({ id, name: c.name, lv: c.lv, sys: STELLARS[id].system })), defense: this.defenseRating(d), storage: d.storage || {}, explored: d.explored, tut: d.tut ?? TUTORIAL.length, station: d.station, stats: d.stats, log: d.log.slice(-60), shipStats: st, fuel: s.ent ? s.ent.fuel : (d.fuel ?? st.fuel),
      cargoUsed: Object.values(d.cargo).reduce((a, b) => a + b, 0), jobCargo: this.jobCargo(d) } });
  }
  // ---- claimable station hulls
  siteOwner(id) { const k = this.db.world.sites[id]; return k ? this.db.players[k] || null : null; }
  sitesPayload() { const out = {}; for (const st of SITES) { const o = this.siteOwner(st.id); if (o) out[st.id] = { owner: o.name, ops: o.station.ops }; } return out; }
  ownSite(d, p) { return !!(p && p.site && d.station.site === p.id); }
  pushSites() { this.broadcast({ t: 'sites', sites: this.sitesPayload() }); }
  tut(s, ev) {   // advance the first-flight tutorial if this event is the current goal
    const d = s.data; if (d.tut == null || d.tut >= TUTORIAL.length) return;
    const T = TUTORIAL[d.tut]; if (ev !== '*check' && T.ev !== ev) return; if (ev === '*check' && !(T.check && T.check(d, this.A))) return;
    d.credits += T.reward; if (T.mat) d.mats[T.mat[0]][T.mat[1]] += T.mat[2];
    d.tut++;
    this.toast(s, `Career: ${T.title} complete. +${credits(T.reward)} credits${T.mat ? ` and a ${T.mat[0]} ${GRADES[T.mat[1]]} crate` : ''}.`);
    this.log(d, `Career goal "${T.title}" complete.`);
    if (d.tut >= TUTORIAL.length) this.toast(s, 'Career guide complete. The Rift is yours, Captain.');
    this.db.touch(); this.you(s);
  }
  // 2.0.3: newcomer protection lasts until your Personal Station reaches Ops 3 (see Space.spared)
  // 2.0.3: cargo carried for jobs takes up real hold space
  jobCargo(d) { return (d.missions || []).filter(m => m.type === 'cargo' || m.type === 'smuggle').reduce((a, m) => a + (m.qty || 0), 0); }
  holdUsed(d) { return Object.values(d.cargo).reduce((a, b) => a + b, 0) + this.jobCargo(d); }
  jobBunks(d) { return (d.missions || []).filter(m => m.type === 'passenger').reduce((a, m) => a + (m.pax || 0), 0); }
  // can this hull carry your current job cargo, goods and passengers? returns a reason, or null
  fitsJobs(d, hull, goods = true) {
    const H = this.A.ships[hull]; if (!H) return 'Unknown hull.';
    const need = (goods ? Object.values(d.cargo).reduce((a, b) => a + b, 0) : 0) + this.jobCargo(d), cap = shipStats(this.A, makeLoadout(this.A, hull, '')).cargo;
    if (need > cap) return `The ${H.name} can't hold your ${need} t of cargo${this.jobCargo(d) ? ' (including job cargo)' : ''}.`;
    const pax = this.jobBunks(d); if (pax && pax > bunks(H)) return `The ${H.name} doesn't have bunks for your ${pax} passenger${pax > 1 ? 's' : ''}.`;
    return null;
  }
  // 2.0.3: when you leave a system, your escorts go with you; a rival flying alongside goes back to their own business
  dropEscorts(space, e, why) {
    const ids = new Set([e.id]); for (let k = 0; k < 3; k++) for (const x of space.ships.values()) if (x.owner && ids.has(x.owner)) ids.add(x.id);   // escorts, and their fighters
    for (const x of [...space.ships.values()]) {
      if (x === e || !ids.has(x.id)) continue;
      if (x.fighterOf === e.id) { space.dock(x, e); continue; }   // 2.1: drones still out go back into their bays
      if (x.rival && x.owner === e.id) { x.owner = null; x.ai = x.rivalAi || 'patrol'; x.target = null; x.slot = null; x.state = 'fly'; continue; }
      space.remove(x, why);
    }
  }
  // 2.0.3: pausing a solo game stops the clock on rush deadlines and loan payments (station timers still run in real time)
  setPaused(on) {
    if (on === !!this.paused) return; this.paused = on;
    if (on) { this.pausedAt = Date.now(); return; }
    const dt = Date.now() - (this.pausedAt || Date.now()); this.pausedAt = 0; if (dt <= 0) return;
    for (const p of Object.values(this.db.players)) {
      for (const m of p.missions || []) if (m.deadline) m.deadline += dt;
      if (p.loan && p.loan.next) p.loan.next += dt;
    }
    this.db.touch();
  }
  newcomer(d) { return !!d && !d.noShield && !((d.station && d.station.ops) >= 3); }
  protectNote(s, S) {   // tell protected captains once when they leave the safety of inner space
    const d = s.data; if (!this.newcomer(d) || d.protWarned) return;
    if (S.danger >= 3 || S.farside || ['umbral', 'deep'].includes(S.faction)) { d.protWarned = true; this.toast(s, `Newcomer protection does not reach ${S.name}: this is lawless space, and raiders here will attack you.`); }
  }
  log(d, text) { d.log.push({ t: Date.now(), text }); if (d.log.length > 200) d.log.shift(); }

  onMessage(s, m) {
    const now = Date.now(); if (now - s.msgT > 1000) { s.msgT = now; s.msgs = 0; } if (++s.msgs > 120) return;   // flood guard
    if (!s.data) { if (m.t === 'hello') this.hello(s, m); return; }
    const d = s.data;
    switch (m.t) {
      case 'input': if (s.ent && s.inputs.length < 8) s.inputs.push({ seq: m.seq | 0, thrust: m.th ? 1 : 0, turn: clamp(m.tu | 0, -1, 1), ab: m.ab ? 1 : 0, rev: m.rv ? 1 : 0, fire1: m.f1 ? 1 : 0, fire2: m.f2 ? 1 : 0 }); break;
      case 'target': if (s.ent) { const sp = this.spaces[d.sys]; s.ent.target = m.id ? sp.ships.get(m.id) || null : null; if (s.ent.target) this.tut(s, 'target'); } break;
      case 'tutskip': if (d.tut != null && d.tut < TUTORIAL.length) { d.tut = TUTORIAL.length; this.you(s); } break;
      case 'land': this.land(s, m.stellar); break;
      case 'depart': this.depart(s); break;
      case 'jump': this.jump(s, m.to); break;
      case 'trade': this.trade(s, m.cid, m.qty | 0); break;
      case 'buyship': if (m.store) this.buyToHangar(s, m.hull | 0); else this.buyShip(s, m.hull | 0); break;
      case 'docks': this.docksOp(s, m); break;   // 2.1
      case 'questdrop': if (typeof m.qid === 'string') { this.questFail(s, m.qid, 'abandoned'); this.you(s); if (d.stellar) this.landed(s); } break;   // 2.4
      case 'outfit': this.outfit(s, m.id | 0, m.n | 0); break;
      case 'accept': this.accept(s, m.id); break;
      case 'abandon': {   // 2.0.3: an abandoned bounty's target leaves too
        const gone = d.missions.find(x => x.id === m.id); if (!gone) break;
        d.missions = d.missions.filter(x => x !== gone);
        if (gone.quest) this.questFail(s, gone.quest.qid, 'abandoned');   // 2.4: abandoning a step ends the story
        if (gone.sys && this.live[gone.sys]) { const sp = this.live[gone.sys]; for (const x of [...sp.ships.values()]) if (x.mission && x.mission.id === gone.id) { x.mission = null; x.ai = 'leave'; x.target = null; x.life = 0; } }
        this.log(d, `Abandoned: ${gone.title}.`); this.db.touch(); this.you(s); if (d.stellar) this.landed(s); break;
      }
      case 'station': this.station(s, m); break;
      case 'buymat': this.buyMat(s, m.mat, m.grade | 0, m.n | 0); break;
      case 'rename': if (typeof m.name === 'string' && !d.shipless) { d.ship.name = m.name.replace(/[<>]/g, '').trim().slice(0, 28) || this.A.ships[d.ship.hull].name; this.you(s); } break;
      case 'note': if (typeof m.text === 'string' && m.text.trim()) { this.log(d, m.text.slice(0, 500)); this.you(s); } break;
      case 'chat': this.chat(s, m); break;
      case 'officer': this.officerOp(s, m); break;
      case 'shuttle': this.shuttleOp(s, m); break;
      case 'dock': this.dockOp(s, m); break;
      case 'board': this.board(s, m); break;
      case 'spec': this.specOp(s, m); break;
      case 'armada': this.summonArmada(s, m.tier); break;
      case 'holdout': this.holdoutStart(s); break;
      case 'storyacc': this.storyAccept(s, m); break;
      case 'fleet': this.fleetOp(s, m); break;
      case 'goal': this.claimGoal(s, m); break;
      case 'store': this.storeBuy(s, m); break;
      case 'colony': this.colonyOp(s, m); break;
      case 'arena': this.arenaOp(s, m); break;
      case 'exchange': this.exchangeOp(s, m); break;
      case 'boards': this.send(s, { t: 'boards', cat: m.cat, list: this.leaderboard(m.cat) }); break;
      case 'profile': this.send(s, { t: 'profile', p: this.profile(m.name) }); break;
      case 'ping': this.send(s, { t: 'pong', c: m.c }); break;
      case 'hail': this.hail(s, m); break;            // 1.1
      case 'hailopt': this.hailOpt(s, m); break;
      case 'order': this.fleetOrder(s, m.o); break;
      case 'jettison': this.jettison(s, m.cid, m.n | 0); break;
      case 'rivals': this.send(s, { t: 'rivals', list: this.rivalsPayload(d) }); break;
      case 'bm': this.bmBuy(s, m.id); break;
      case 'arcacc': this.arcAccept(s, m.fac); break;                 // 1.2
      case 'promote': this.promote(s, m.id); break;
      case 'lower': this.lowerDeck(s, m); break;
      case 'bank': this.bankOp(s, m); break;
      case 'pause': if (this.solo && [...this.sessions.values()].filter(x => x.data).length === 1) { this.setPaused(!this.paused); this.send(s, { t: 'paused', on: this.paused }); } break;
    }
  }
  hello(s, m) {
    const name = String(m.name || '').trim(), pass = String(m.pass || '');
    if (!/^[A-Za-z0-9 _'-]{3,20}$/.test(name) || /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i.test(name.trim())) return this.send(s, { t: 'error', msg: 'Pick a captain name of 3-20 letters or numbers.' });
    if (pass.length < 4 && !this.solo) return this.send(s, { t: 'error', msg: 'Your password needs at least 4 characters.' });
    // failed-login throttle: 6 misses per name or per address in 10 minutes locks that name/address out for the rest of the window
    const now = Date.now(), fk = ['n:' + name.toLowerCase(), 'i:' + s.ip];
    this.fails = this.fails || new Map();
    for (const k of fk) { const f = this.fails.get(k); if (f && now - f.t > 600000) this.fails.delete(k); }
    if (fk.some(k => (this.fails.get(k) || { n: 0 }).n >= 6)) return this.send(s, { t: 'error', msg: 'Too many failed sign-ins. Try again in a few minutes.' });
    let p = this.db.get(name);
    if (p) { if (!this.solo && !this.db.check(p, pass)) { for (const k of fk) { const f = this.fails.get(k) || { n: 0, t: now }; f.n++; this.fails.set(k, f); } return this.send(s, { t: 'error', msg: 'Wrong password for that captain.' }); } }
    else { p = this.db.create(name, pass || 'solo', this.fresh()); this.log(p, 'Took command of the Gnat Skiff "Rift Runner" at Quantum Station.'); s.isNew = true; }
    for (const o of this.sessions.values()) if (o !== s && o.data === p) { this.send(o, { t: 'error', msg: 'Signed in somewhere else.' }); o.sock.close(); this.disconnect(o); }
    s.data = p; s.name = p.name; p.id = s.id; this.hangarInit(p); this.docksInit(p); this.hostInit(p); this.storyInit(p); this.synInit(p); this.arcsInit(p);
    if (!p.explored) p.explored = SYSTEMS.filter(x => x.anchor).map(x => x.id);   // captains from before 0.4 know the old 30 systems
    s.rep = p.rep; s.id = s.id;
    if (!STELLARS[p.stellar]) { p.sys = START.system; p.stellar = START.stellar; }
    if (STELLARS[p.stellar].system !== p.sys) p.sys = STELLARS[p.stellar].system;   // repair saves from the old log-off bug
    this.send(s, { t: 'welcome', id: s.id, name: p.name }); this.send(s, { t: 'sites', sites: this.sitesPayload() }); this.send(s, this.worldPayload());
    if (p.fleet && !this.db.world.fleets[p.fleet]) p.fleet = null;
    this.idleCheck(s); this.you(s); this.landed(s); this.storyOnLand(s, STELLARS[p.stellar]); this.arcOnLand(s, STELLARS[p.stellar]);   // a story step waiting where you logged off still pops up
    if (!this.solo) this.broadcast({ t: 'chat', from: '', msg: `${p.name} entered the Rift.` });   // 2.4: no join messages in a solo game
    if (s.isNew) this.toast(s, 'Newcomer protection: raiders in inner space (danger 0-2) leave you alone until your Personal Station reaches Ops 3, unless you shoot first.');
  }
  // player-facing reference used by Space (id, name, rep, inputs)
  pref(s) { return { id: s.id, name: s.name, rep: s.data.rep, get inputs() { return s.inputs; }, get lastInput() { return s.lastInput; }, set lastInput(v) { s.lastInput = v; }, s }; }

  // ------------------------------------------------------------------ space: depart, land, jump
  spawnPlayer(s, x, y, a, v) {
    const d = s.data, sp = this.spaces[d.sys];
    const e = sp.makeShip({ loadout: d.ship, bonus: this.bonus(d), faction: 'quantum', x, y, a, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, player: this.pref(s),
                            fuel: d.fuel, ammo: d.ship.ammo, shield: d.shieldNow, armor: d.armorNow });
    s.ent = e; s.inputs = []; sp.players++; e.elite = masteryTier((d.mastery || {})[d.ship.hull] || 0) >= 5;
    const eb = this.flying(d, 'herald') ? { shieldPct: 25 * this.power(d) } : this.flying(d, 'tidecaller') ? { shieldRePct: 40 * this.power(d) } : {};
    for (const { w, i, x: W } of this.activeWings(d)) {   // 2.1: the active dock's wingmates, with their own outfits and officers
      const wb = this.wingBonus(d, w); for (const [k, v] of Object.entries(eb)) wb[k] = (wb[k] || 0) + v;
      const m = sp.makeShip({ loadout: W.ship, ammo: { ...(W.ship.ammo || {}) }, faction: 'quantum', bonus: wb, x: x - Math.sin(a) * 120 + (i - 1) * 70, y: y + Math.cos(a) * 120, a, vx: e.vx, vy: e.vy, ai: 'escort', owner: e.id,
                              name: W.ship.name || this.A.ships[W.ship.hull].name });
      m.escortSlot = i; m.wingUid = W.ship.uid; m.wingOf = s.id;
    }
    for (const m of d.missions) if (m.type === 'bounty' && m.sys === d.sys && !m.done && ![...sp.ships.values()].some(x => x.mission && x.mission.id === m.id)) { m.spawned = true; sp.spawnMissionTarget({ ...m, owner: s.id }); this.toast(s, `Your bounty target, ${m.targetName}, is in this system.`); }
    this.send(s, { t: 'space', sys: d.sys, id: e.id, rocks: sp.rocksPayload() });
    this.missionArrive(s, sp); this.storyArrive(s, sp); this.arcArrive(s, sp);
  }
  depart(s) {
    const d = s.data; if (s.ent || !d.stellar) return;
    if (d.shipless) return this.toast(s, 'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.');
    if (this.inDrydock(d)) { const st = d.specState[d.ship.hull]; return this.toast(s, `The ${this.A.ships[d.ship.hull].name} is in the drydock for her tier-up: ${Math.ceil((st.upT - Date.now()) / 60000)} minutes left.`); }
    const p = STELLARS[d.stellar]; const a = Math.random() * Math.PI * 2;
    d.stellar = null; this.spawnPlayer(s, p.x + Math.sin(a) * (p.r + 30), p.y - Math.cos(a) * (p.r + 30), a, 40);
    this.you(s);
  }
  land(s, sid) {
    const d = s.data, e = s.ent; if (!e) return;
    const p = STELLARS[sid]; if (!p || p.system !== d.sys) return;
    if (!p.svc.includes('L')) return this.toast(s, `${p.name} has nowhere to land.`);
    const dist = Math.hypot(e.x - p.x, e.y - p.y), sp = Math.hypot(e.vx, e.vy);
    if (dist > p.r + 60) return this.toast(s, `Too far from ${p.name} to land.`);
    if (sp > 80) return this.toast(s, 'Slow down to land.');
    const fac = SYS[d.sys].faction;
    if (!p.outlaw && (d.rep[fac] || 0) <= -30 && !(d.landPass && d.landPass[p.id] > Date.now())) return this.toast(s, `${p.name} refuses you permission to land. Hail them (T) to talk.`);
    const space = this.spaces[d.sys];
    this.dropEscorts(space, e);
    d.fuel = e.fuel; for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    space.remove(e); space.players--; s.ent = null; d.stellar = sid;
    // free refuel and repair
    const st = this.stats(d); d.fuel = st.fuel; d.shieldNow = undefined; d.armorNow = undefined;
    this.completeOnLanding(s, p);
    if (d.sys !== START.system) this.tut(s, 'land2');
    if (p.site) this.tut(s, 'site');
    this.db.touch(); this.you(s); this.landed(s); this.storyOnLand(s, p); this.arcOnLand(s, p);
  }
  landed(s) {
    const d = s.data, p = STELLARS[d.stellar];
    if (!p) return;
    const own = this.ownSite(d, p), so = p.site ? this.siteOwner(p.id) : null;
    this.send(s, { t: 'landed', stellar: p.id, market: this.market(p), offers: this.offers(p, d), yard: this.yard(p, d), outfitter: this.outfitter(p, d), mats: this.matsFor(p, d),
                   site: p.site ? { owner: so ? so.name : null, ops: so ? so.station.ops : 0, own } : null, community: p.hub ? this.community() : null, news: p.svc.includes('B') || p.hub ? this.newsFeed(6) : null, contact: this.barTalk(p, d), blackmarket: this.blackMarket(p, d), arcs: this.arcOffersAt(d, p).map(o => ({ fac: o.fac, title: o.title, brief: o.brief, text: o.text, locked: o.locked || null, arc: ARCS_NAME(o.fac) })), bank: this.bankAt(p) ? this.bankInfo(d) : null, bar: this.barOffers(p, d), store: this.storeFor(p), fleets: this.fleetList(), colony: this.colonyPayload(p, d), story: (() => { const o = this.storyOffer(d, p); return o ? { id: o.id, title: o.title, brief: o.brief, text: o.text, acc: o.acc, locked: o.locked || null } : null; })(), exchange: p.hub || (p.svc.includes('T') && !p.site) ? this.exchangePayload(d) : null });
  }
  jump(s, to) {
    const d = s.data, e = s.ent; if (!e || e.state !== 'fly') return;
    const S = SYS[d.sys];
    const skip = !S.links.includes(to) ? this.pathfinderJump(d, d.sys, to) : null;
    if (!S.links.includes(to) && !skip) return this.toast(s, 'No hyperspace route there.');
    if (this.inDrydock(d)) return this.toast(s, 'Your ship is booked into the drydock for her tier-up. Land and wait for it to finish.');
    if (this.deepLocked(d, to)) return this.toast(s, 'The Deep is uncharted: ships that jump in blind are never seen again. The Que\'vari are said to keep charts of the dark.');
    const fuelCost = K.jumpFuel * this.mods(d.sys).jumpFuel * (skip ? 1.5 : 1); e.jumpCost = fuelCost;
    if (e.fuel < fuelCost) return this.toast(s, skip ? `A Pathfinder skip-jump needs ${Math.round(fuelCost / K.jumpFuel * 10) / 10} jumps of fuel.` : this.mods(d.sys).jumpFuel > 1 ? 'Gravity shear: this jump needs double fuel.' : 'Not enough fuel to jump.');
    for (const p of S.stellars) if (Math.hypot(e.x - p.x, e.y - p.y) < K.jumpClear) return this.toast(s, 'Too close to ' + p.name + ' to jump. Fly further out.');
    const T = SYS[to];
    e.a = Math.atan2(T.x - S.x, -(T.y - S.y)); e.state = 'jumpout'; e.jumpT = e.st.jumpFast ? 0.6 : 1.6; e.jumpTo = to;
    this.spaces[d.sys].events.push(['jump', e.id]);
    for (const x of this.spaces[d.sys].ships.values()) if (x.owner === e.id && !x.fighterOf && !x.rival) { x.state = 'jumpout'; x.jumpT = e.jumpT + 0.3; x.a = e.a; x.jumpTo = '-'; }
  }
  finishJump(e, space) {
    if (!e.player) { space.remove(e, 'jump'); return; }
    const s = e.player.s, d = s.data, from = SYS[d.sys], to = SYS[e.jumpTo];
    this.dropEscorts(space, e, 'jump');   // first, so drones still out are counted back into the bays
    d.fuel = e.fuel - (e.jumpCost || K.jumpFuel); for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    d.shieldNow = e.shield; d.armorNow = e.armor;
    space.remove(e, 'jump'); space.players--; s.ent = null;
    d.sys = to.id; d.stats.jumps++; this.officerXp(s, 4); this.goal(s, 'jumps'); this.mastery(s, 3);
    if (!d.explored.includes(to.id)) { d.explored.push(to.id); this.goal(s, 'charted'); this.specOnChart(s); if (to.gen) this.log(d, `Charted ${to.name} (${FACTIONS[to.faction].name}).`); }
    const ang = Math.atan2(from.x - to.x, -(from.y - to.y));   // arrive from the direction we came
    const a = ang + Math.PI;
    this.spawnPlayer(s, Math.sin(ang) * 2200, -Math.cos(ang) * 2200, a, e.st.maxSpeed);
    d.shieldNow = d.armorNow = undefined; s.ent.graceT = this.spaces[d.sys].t + 6;   // 2.0.3: a few seconds to get your bearings after a jump
    this.protectNote(s, to);
    this.spaces[d.sys].events.push(['flash', Math.round(s.ent.x), Math.round(s.ent.y)]);
    this.you(s);
    for (const m of d.missions) if (m.type === 'patrol' && m.sys === d.sys) this.toast(s, `Patrol: destroy ${m.need - m.got} more hostile ships here.`);
  }

  // 0.8: flying into the Sol Gateway (or its far mouth) crosses instantly, with no fuel cost
  wormholeTransit(e, space, p) {
    const s = e.player.s, d = s.data, to = SYS[p.wormhole], exit = to.stellars.find(x => x.id === p.exit);
    this.dropEscorts(space, e);
    d.fuel = e.fuel; for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    d.shieldNow = e.shield; d.armorNow = e.armor;
    space.events.push(['flash', Math.round(e.x), Math.round(e.y)]); space.remove(e); space.players--; s.ent = null;
    d.sys = to.id; d.stats.jumps++; this.goal(s, 'jumps'); this.mastery(s, 3);
    const first = !d.explored.includes(to.id);
    if (first) { d.explored.push(to.id); this.goal(s, 'charted'); this.log(d, to.farside ? 'Passed through the Sol Gateway. The stars on the far side match no chart.' : 'Came home through the Gateway to Sol.'); }
    const a = Math.random() * Math.PI * 2;
    this.spawnPlayer(s, exit.x + Math.sin(a) * (exit.r + 90), exit.y - Math.cos(a) * (exit.r + 90), a, 140);
    d.shieldNow = d.armorNow = undefined; s.ent.wormT = this.spaces[d.sys].t + 4; s.ent.graceT = this.spaces[d.sys].t + 6; this.protectNote(s, to);
    this.spaces[d.sys].events.push(['flash', Math.round(s.ent.x), Math.round(s.ent.y)]);
    this.toast(s, to.farside ? `Through the Gateway: ${to.name}.${first ? ' Nothing out here is on any chart.' : ''}` : 'Back through the Gateway: Sol.');
    this.you(s);
  }
  // ------------------------------------------------------------------ combat outcomes
  onHit(pref, npc, space) {
    const s = pref.s, d = s.data; if (!d) return;
    this.rivalOnHit(s, npc, space);
    if (space.isHostile(npc, s.ent || npc) && npc.aggro.size <= 1 && FACTIONS[npc.faction].pirate) return;
    if (!FACTIONS[npc.faction].pirate && !FACTIONS[npc.faction].alwaysHostile && !npc.dread && !npc.boss && !(npc.mission) && (d.rep[npc.faction] || 0) > -100 && (!npc.repHitT || space.t - npc.repHitT > 1.5)) {
      npc.repHitT = space.t; d.rep[npc.faction] = clamp((d.rep[npc.faction] || 0) - 1, -100, 100);
    }
  }
  onKill(pref, npc, space, byEscort) {
    const s = pref.s, d = s.data; if (!d) return;
    d.stats.kills++; d.stats.combat = (d.stats.combat || 0) + (npc.pw || npc.strength || 10);   // 1.1: combat rating
    this.officerXp(s, 8 + Math.round((npc.strength || 10) / 40)); this.mastery(s, (npc.strength || 10) / 8); this.specOnKill(s, npc, space, byEscort);
    const F = FACTIONS[npc.faction];
    if (this.rivalOnKill(s, npc, space)) { this.toast(s, `You destroyed ${npc.name.split(' · ')[0]}'s ship. They will not forget it.`); this.you(s); return; }   // 1.1
    if (npc.storyKill) this.storyProgress(s, npc);
    this.stateOnKill(s, npc, space);   // 2.4
    if (npc.arcOf) this.arcProgress(s, npc);   // 1.2 faction arcs
    if (npc.dread || npc.boss || npc.bossMinion) { this.goal(s, 'kills'); this.you(s); return; }
    if (F.pirate || F.alwaysHostile || npc.mission) {
      const stB = (() => { const st = this.stateOf(space.id); return st && STATES[st.kind].bounty || 1; })();   // 2.4: a pirate scourge pays more
      const bounty = Math.round(((npc.strength || 10) * 25 + 500) * (1 + (this.bonus(d).lootPct || 0) / 100) * this.mods(space.id).bounty * stB * (this.flying(d, 'vanguard') ? 1 + 0.5 * this.power(d) : 1));
      this.shareBounty(s, bounty, space); this.goal(s, 'kills');
      d.credits += bounty; d.stats.earned += bounty;
      d.rep.quantum = clamp(d.rep.quantum + 1, -100, 100); d.rep.spacer = clamp(d.rep.spacer + 1, -100, 100);
      this.toast(s, `Destroyed ${npc.name || this.A.ships[npc.hull].name}. Bounty: ${credits(bounty)} credits.`);
      this.tut(s, 'kill');
    } else {
      d.rep[npc.faction] = clamp((d.rep[npc.faction] || 0) - 10, -100, 100);
      for (const [f, X] of Object.entries(FACTIONS)) if (X.hostile.includes(npc.faction)) d.rep[f] = clamp((d.rep[f] || 0) + 2, -100, 100);
      this.toast(s, `Destroyed a ${F.short} ship. ${F.name} will remember that.`);
    }
    for (const m of d.missions) {
      if (m.type === 'bounty' && npc.mission && npc.mission.id === m.id) { m.done = true; this.toast(s, `Bounty complete: ${m.targetName} is dead. Land anywhere to collect ${credits(m.reward)}.`); }
      if (m.type === 'patrol' && m.sys === space.id && (F.pirate || FACTIONS[SYS[m.sys].faction].hostile.includes(npc.faction)) && !m.done) {
        m.got++; if (m.got >= m.need) { m.done = true; this.toast(s, 'Patrol complete. Land anywhere to collect your pay.'); } }
    }
    this.you(s);
  }
  onPlayerDeath(pref, space, by) {
    const s = pref.s, d = s.data; if (!d) return;
    if (space.sys.arena && this.onArenaDeath(s, space)) return;
    if (s.ent) this.dropEscorts(space, s.ent, 'jump');   // 2.0.3: escorts no longer linger after you are destroyed
    space.players--; s.ent = null;
    const fee = Math.min(d.credits, Math.round((this.A.ships[d.ship.hull].cost || 0) * 0.05));
    d.credits -= fee; if (!this.flying(d, 'lodestar')) d.cargo = {};   // the Lodestar's hold is protected; wingmates fly home
    const back = d.station && d.station.site && STELLARS[d.station.site] && this.ownSite(d, STELLARS[d.station.site]) ? d.station.site : START.stellar;   // 1.0.1: your own station hull if you have one, otherwise the hub
    d.stellar = back; d.sys = STELLARS[back].system; d.fuel = undefined;
    for (const m of d.missions) if (m.type === 'cargo') m.lost = true;
    d.missions = d.missions.filter(m => !m.lost);
    this.log(d, `Ship destroyed${by && by.player ? ' by ' + by.player.name : ''}. The insurers rebuilt it at ${STELLARS[back].name} for ${credits(fee)} credits; the cargo was lost.`);
    this.send(s, { t: 'dead', fee, at: STELLARS[back].name });
    if (by && by.player) this.broadcast({ t: 'chat', from: '', msg: `${by.player.name} destroyed ${s.name} in ${SYS[space.id].name}.` });
    this.db.touch(); this.you(s); this.landed(s);
  }
  onLoot(pref, it) {
    const s = pref.s, d = s.data; if (!d) return;
    if (it.cargo) return this.lootCargo(s, it);   // 1.1: jettisoned cargo
    if (it.salvage) return this.questLoot(s, it);   // 2.4: a quest's salvage
    if (it.ore) {   // mined ore goes into the cargo hold, if there is room
      const b = this.bonus(d), raw = it.n * (1 + (b.miningPct || 0) / 100) * this.mods(d.sys).mining, want = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
      const st = this.stats(d), used = this.holdUsed(d), n = Math.min(want, st.cargo - used);
      if (n <= 0) { if (!s.fullT || Date.now() - s.fullT > 8000) { s.fullT = Date.now(); this.toast(s, 'Cargo hold full: sell or process your ore.'); } return false; }
      d.cargo[it.ore] = (d.cargo[it.ore] || 0) + n; d.stats.mined = (d.stats.mined || 0) + n; this.goal(s, 'mined', n); this.mastery(s, n * 0.3); this.specOnMine(s, it);
      this.toast(s, `+${n} t ${COMMODITIES.find(c => c.id === it.ore).name}`); this.you(s); return true;
    }
    if (it.credits) { it.credits = Math.round(it.credits * (1 + (this.bonus(d).lootPct || 0) / 100)); d.credits += it.credits; this.toast(s, `Salvaged ${credits(it.credits)} credits.`); }
    if (it.chest) return this.openChest(s, it);
    if (it.credits || it.mat) this.specOnLoot(s);
    if (it.mat) { d.mats[it.mat][it.grade]++; this.toast(s, `Salvaged a ${it.mat} crate (grade ${GRADES[it.grade]}).`); }
    this.you(s);
  }

  community() {
    const docked = [...this.sessions.values()].filter(x => x.data && x.data.stellar === 'qstation').map(x => x.name);
    const all = Object.values(this.db.players);
    const top = all.map(p => ({ name: p.name, earned: (p.stats && p.stats.earned) || 0, kills: (p.stats && p.stats.kills) || 0, ship: this.A.ships[p.ship.hull] ? this.A.ships[p.ship.hull].name : '' }))
      .concat(Object.values(this.db.world.rivals || {}).map(r => ({ name: (this.rivalName || (() => ''))(r.id), ai: true, earned: r.earned, kills: r.kills, ship: this.A.ships[r.hull] ? this.A.ships[r.hull].name : '' })))
      .sort((a, b) => b.earned - a.earned).slice(0, 10);
    const stations = SITES.map(st => { const o = this.siteOwner(st.id); return { system: SYS[st.system].name, owner: o ? o.name : null, ops: o ? o.station.ops : 0 }; });
    const online = [...this.sessions.values()].filter(x => x.data).map(x => ({ name: x.name, sys: SYS[x.data.sys].name }));
    return { docked, top, stations, online };
  }
  // ------------------------------------------------------------------ markets
  market(p) {
    if (p.site) { const o = this.siteOwner(p.id); return o && o.station.ops >= 1 ? COMMODITIES.map(c => ({ id: c.id, name: c.name, price: price({ ...p, prices: SITE_PRICES }, c.id) })).filter(x => x.price !== null) : null; }
    if (!p.svc.includes('T')) return null;
    const now = Date.now();
    return COMMODITIES.map(c => { const pr = price(p, c.id, now), lm = this.livingMult(p, c.id); return { id: c.id, name: c.name, price: pr === null ? null : Math.round(pr * this.flashMult(p.id, c.id) * lm), flash: this.flashMult(p.id, c.id) !== 1, moved: Math.round((lm - 1) * 100) }; }).filter(x => x.price !== null);   // 1.1: market flashes; 2.4: system states and what captains sold here
  }
  trade(s, cid, qty) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p || s.ent) return;
    const pr0 = price(p.site ? { ...p, prices: SITE_PRICES } : p, cid); if (pr0 === null || !qty || !this.market(p)) return; const pr = p.site ? pr0 : Math.round(pr0 * this.flashMult(p.id, cid) * this.livingMult(p, cid));
    const st = this.stats(d), used = this.holdUsed(d);
    if (qty > 0) {
      const tb = (this.bonus(d).tradePct || 0) / 100, bp = Math.max(1, Math.round(pr * (1 - tb)));   // 1.2: haggling officers and crew
      qty = Math.min(qty, st.cargo - used, Math.floor(d.credits / bp)); if (qty <= 0) return this.toast(s, 'No room or no money for that.');
      d.paid = d.paid || {}; d.paid[cid] = Math.round(((d.paid[cid] || bp) * (d.cargo[cid] || 0) + bp * qty) / ((d.cargo[cid] || 0) + qty));   // 2.4: what you paid, on average
      d.credits -= qty * bp; d.cargo[cid] = (d.cargo[cid] || 0) + qty; this.tradeTax(d, p.system, qty * pr); if (!p.site) this.addImpact(p.id, cid, -qty);   // 2.4: buying raises the local price
    } else {
      const have = d.cargo[cid] || 0; qty = Math.min(-qty, have); if (!qty) return;
      const sale = Math.round(qty * pr * this.mods(p.system).sell * (1 + (this.bonus(d).tradePct || 0) / 100)), tax = this.tradeTax(d, p.system, sale); this.goal(s, 'trade', sale - tax);
      d.credits += sale - tax - qty * pr;
      d.credits += qty * pr; d.cargo[cid] = have - qty; if (!d.cargo[cid]) { delete d.cargo[cid]; if (d.paid) delete d.paid[cid]; } d.stats.earned += qty * pr;
      this.tut(s, 'sell'); if (!p.site) { this.addImpact(p.id, cid, qty); this.stateProgress(s, p.system, 'cid:' + cid, qty); }   // 2.4: selling lowers it, and feeds a famine or a rush
    }
    this.db.touch(); this.you(s); this.landed(s);
  }
  matsFor(p, d) {
    const fac = SYS[p.system].faction, out = [];
    if (p.hub || (d && this.ownSite(d, p) && d.station.ops >= 1)) MATERIALS.forEach(m => [0, 1].forEach(g => out.push({ mat: m, grade: g, price: MAT_PRICE[g] })));
    if (p.site) return out;
    const special = { korrund: ['alloy', 2], ylith: ['crystal', 2], thalassi: ['isotope', 2], quevari: ['crystal', 3] }[fac];
    if (special && p.svc.includes('T')) out.push({ mat: special[0], grade: special[1], price: MAT_PRICE[special[1]] });
    return out;
  }
  buyMat(s, mat, grade, n) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p || s.ent) return;
    const offer = this.matsFor(p, d).find(o => o.mat === mat && o.grade === grade); if (!offer) return;
    if (n > 0) { n = Math.min(n, Math.floor(d.credits / offer.price)); if (!n) return this.toast(s, 'Not enough credits.'); d.credits -= n * offer.price; d.mats[mat][grade] += n; }
    else { n = Math.min(-n, d.mats[mat][grade]); d.credits += Math.round(n * offer.price * 0.6); d.mats[mat][grade] -= n; }
    this.db.touch(); this.you(s);
  }

  // ------------------------------------------------------------------ shipyard and outfitter
  yard(p, d) {
    if (p.site) {   // your Personal Station sells the station ships for its Ops level
      if (!this.ownSite(d, p) || d.station.ops < 3) return null;
      const list = new Set(); for (const [lv, hs] of Object.entries(STATION_SHIPS)) if (d.station.ops >= +lv) hs.forEach(h => list.add(h));
      for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713]) list.add(h);
      if (d.station.ops >= 4) WINGMATES.forEach(h => list.add(h)); if (d.station.ops >= 5) ARMADA.forEach(h => list.add(h));   // 2.1: wingmate ships
      return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
    }
    if (!p.svc.includes('Y')) return null;
    const fac = SYS[p.system].faction, list = new Set();
    for (const h of FACTION_HULLS[fac] || []) { const H = this.A.ships[h]; if (H && (H.tech <= p.tech || H.tech >= 400)) list.add(h); }
    if (fac !== 'quevari' && fac !== 'umbral') for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 820, 821, 822]) if (this.A.ships[h].tech <= p.tech) list.add(h);   // 2.3: the Wasp, Swift and Pelican are sold everywhere
    return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
  }
  tradeIn(d) {
    if (d.shipless) return 0;
    const H = this.A.ships[d.ship.hull]; let v = (H.cost || 0) * 0.5;
    for (const [id, n] of Object.entries(d.ship.outfits)) v += (this.O[id] ? this.O[id].cost : 0) * n * 0.5;
    return Math.round(v);
  }
  buyShip(s, hull) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p || s.ent) return;
    const yard = this.yard(p, d) || []; if (!yard.includes(hull)) return;
    if (WING_ONLY.includes(hull)) return this.buyToHangar(s, hull);   // 2.1: escort hulls go straight to the hangar
    const H = this.A.ships[hull], cost = H.cost - this.tradeIn(d);
    if (d.credits < cost) return this.toast(s, `You need ${credits(cost)} credits (after your trade-in).`);
    { const why = this.fitsJobs(d, hull); if (why) return this.toast(s, why + ' Sell cargo or finish jobs first.'); }
    d.credits -= cost; this.log(d, `Bought a ${H.name} at ${p.name}.`);
    d.ship = makeLoadout(this.A, hull, d.shipless ? 'Rift Runner' : d.ship.name); d.shipless = false; d.fuel = undefined; this.leadChanged(d);
    this.db.touch(); this.you(s); this.landed(s); this.toast(s, `The ${H.name} is yours.`);
  }
  outfitter(p, d) {
    if (p.site && !(d && this.ownSite(d, p) && d.station.ops >= 2)) return null;
    if (!p.site && !p.svc.includes('O')) return null;
    const fac = p.site ? 'quantum' : SYS[p.system].faction, list = [];
    for (const o of Object.values(this.O)) {
      if (o.faction && o.faction !== fac) continue;
      const special = FACTION_OUTFITS[fac] && FACTION_OUTFITS[fac].includes(o.id);
      if (special || ((o.tech <= p.tech || p.site) && o.tech < 100 && !(fac === 'umbral'))) {
        if (o.tech >= 7 && !special && !(p.hub || p.site || fac === 'quantum')) continue;   // quantum tech only in Concord space
        list.push(o.id);
      }
    }
    return list.sort((a, b) => this.O[a].cost - this.O[b].cost);
  }
  outfit(s, id, n) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p || s.ent || !n) return;
    const o = this.O[id]; if (!o) return;
    if (d.shipless) return this.toast(s, 'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.');
    const list = this.outfitter(p, d); if (!list) return this.toast(s, 'There is no outfitter here.'); if (n > 0 && !list.includes(id)) return;
    const st = this.stats(d);
    if (n > 0) {
      if (o.eff.ammo) {   // ammunition: needs the launcher
        const w = o.eff.ammo, H = this.A.ships[d.ship.hull];
        const launchers = (st.weapons[w] || 0); if (!launchers) return this.toast(s, 'You have nothing that fires that.');
        const have = d.ship.ammo[w] ?? 0;
        const cap = o.max * launchers; const k = Math.min(n, cap - have, Math.floor(d.credits / o.cost));
        if (k <= 0) return this.toast(s, 'Magazines full or not enough credits.');
        d.ship.ammo[w] = have + k; d.credits -= k * o.cost;
      } else {
        const cur = d.ship.outfits[id] || 0; if (cur + n > (o.max || 1)) return this.toast(s, `You can carry at most ${o.max || 1}.`);
        if ((o.mass || 0) * n > st.free) return this.toast(s, 'Not enough free space.');
        if (o.eff.weapon && o.turret && st.turrets + n > st.maxTurrets) return this.toast(s, 'No free turret mounts.');
        if (o.eff.weapon && !o.turret && st.guns + n > st.maxGuns) return this.toast(s, 'No free gun mounts.');
        if (d.credits < o.cost * n) return this.toast(s, 'Not enough credits.');
        d.credits -= o.cost * n; d.ship.outfits[id] = cur + n;
      }
    } else {
      const cur = d.ship.outfits[id] || 0, k = Math.min(cur, -n); if (!k) return;
      if (o.eff.cargo && this.holdUsed(d) > st.cargo - o.eff.cargo * k) return this.toast(s, 'Sell cargo first.');
      d.ship.outfits[id] = cur - k; if (!d.ship.outfits[id]) delete d.ship.outfits[id];
      d.credits += Math.round(o.cost * k * 0.5);
    }
    this.db.touch(); this.you(s);
  }

  // ------------------------------------------------------------------ missions
  offers(p, d) {
    if (!p.svc.includes('B')) return [];
    const win = Math.floor(Date.now() / 600000), r = rng(hash(p.id + win)), out = [], here = p.system;
    const near = Object.entries(JUMPS[here]).filter(([s, n]) => n >= 1 && n <= 4 && SYS[s].stellars.some(x => x.svc.includes('L')) && SYS[s].faction !== 'umbral');
    const usedNames = new Set();
    for (let i = 0; i < 5 && near.length; i++) {
      const roll = r(), [sys, jumps] = near[Math.floor(r() * near.length)], S = SYS[sys];
      const id = `${p.id}-${win}-${i}`;
      if (roll < 0.5) {
        const lands = S.stellars.filter(x => x.svc.includes('L') && !x.site), dest = lands[Math.floor(r() * lands.length)];   // 1.0.3: never to an empty derelict hull
        if (!dest) continue;
        const c = COMMODITIES[Math.floor(r() * COMMODITIES.length)], qty = 5 + Math.floor(r() * 26);
        out.push({ id, type: 'cargo', title: `Deliver ${qty} tons of ${c.name}`, sys, dest: dest.id, cid: c.id, qty, reward: Math.round((800 + jumps * 1100 + qty * 60) * 1.35),   // 2.4: cargo runs pay better
                   text: `Carry ${qty} tons of ${c.name.toLowerCase()} to ${dest.name} in the ${S.name} system (${jumps} jump${jumps > 1 ? 's' : ''}).` });
      } else if (roll < 0.8) {
        const fac = S.danger >= 3 || r() < 0.6 || S.farside ? 'hollow' : 'umbral', hull = TRAFFIC[fac].war[Math.floor(r() * TRAFFIC[fac].war.length)], H = this.A.ships[hull];
        let ni = Math.floor(r() * NAMES.length); while (usedNames.has(ni)) ni = (ni + 1) % NAMES.length; usedNames.add(ni); const nm = (fac === 'hollow' ? 'Hollow captain ' : 'Umbral hunter ') + NAMES[ni];
        out.push({ id, type: 'bounty', title: `Bounty: ${nm}`, sys, hull, faction: fac, targetName: nm, reward: Math.round(4000 + (H.strength || 20) * 60),
                   text: `${nm} has been raiding the lanes in a ${H.name}. Find and destroy them in the ${S.name} system.` });
      } else {
        const need = 2 + Math.floor(r() * 3);
        out.push({ id, type: 'patrol', title: `Patrol ${S.name}`, sys, need, got: 0, reward: Math.round(3000 + need * 1800 + S.danger * 1500),
                   text: `Destroy ${need} pirate or hostile ships in the ${S.name} system, then land anywhere to be paid.` });
      }
    }
    out.push(...this.moreOffers(p, d, r, near, win));
    { const X = this.expeditionOffer(p, d); if (X) out.push(X); }   // 1.2 Farside expeditions
    out.unshift(...this.stateOffers(p, d, r, near, win));   // 2.4: jobs posted by troubled systems nearby
    out.push(...this.extraOffers(p, d, r, near, win, (sys) => { const ls = SYS[sys].stellars.filter(x => x.svc.includes('L') && !x.site); return ls.length ? ls[Math.floor(r() * ls.length)] : null; }));   // 1.2
    // 1.1 combat rating: Wanted contracts need Competent; bounties pay more as your rank rises; Dangerous captains get elite contracts
    const rank = this.rankOf(d).i;
    for (const o of out) if (o.type === 'bounty' || o.type === 'assassinate') o.reward = Math.round(o.reward * (1 + 0.06 * rank));
    if (rank >= 5 && near.length) {
      const [sys] = near[Math.floor(r() * near.length)], S = SYS[sys], pool = [...TRAFFIC.umbral.war, ...TRAFFIC.hollow.war].filter(h => this.A.ships[h]).sort((a, b) => (this.A.ships[b].strength || 0) - (this.A.ships[a].strength || 0));
      const hull = pool[Math.floor(r() * Math.min(2, pool.length))], H = this.A.ships[hull], nm = 'the ' + ['Ashen Admiral', 'Red Widow', 'Quiet Knife', 'Last Lantern'][Math.floor(r() * 4)];
      out.push({ id: `${p.id}-${win}-elite`, type: 'bounty', elite: true, title: `ELITE CONTRACT: ${nm}`, sys, hull, faction: TRAFFIC.umbral.war.includes(hull) ? 'umbral' : 'hollow', targetName: nm, reward: Math.round(45000 + (H.strength || 200) * 160),
                 text: `Only captains rated Dangerous or better are offered this one. ${nm} flies a ${H.name} out of ${S.name}. The Concord wants it gone.` });
    }
    out.unshift(...this.questOffers(p, d));   // 2.4: contacts and side stories lead the board
    return out.filter(o => !d.missions.some(m => m.id === o.id) && !(o.type === 'assassinate' && rank < 3));
  }
  accept(s, id) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p) return;
    if (d.missions.length >= 6) return this.toast(s, 'You already have six jobs.');
    const o = this.offers(p, d).find(x => x.id === id); if (!o) return;
    if (o.type === 'quest') return this.questStart(s, o);   // 2.4
    if (o.type === 'cargo' || o.type === 'smuggle') {
      const st = this.stats(d), used = this.holdUsed(d);
      if (used + o.qty > st.cargo) return this.toast(s, 'Not enough cargo space for that job.');
    }
    if (!this.acceptCheck(s, o)) return;
    d.missions.push({ ...o, owner: s.id, taken: Date.now(), ...(o.rush ? { deadline: Date.now() + o.rush * 60000 } : {}) });
    this.log(d, `Accepted: ${o.title}.`);
    this.db.touch(); this.you(s); this.landed(s);
  }
  completeOnLanding(s, p) {
    const d = s.data; d.lastStellar = p.id;
    for (const m of [...d.missions]) {   // a snapshot: follow-up jobs added on this landing wait for the next one
      if (m.type === 'supply' && m.dest === p.id && !this.supplyReady(d, m)) { this.toast(s, `${m.title}: you need ${m.qty} t of ${m.cid} in your hold.`); continue; }
      if ((destType(m) && m.dest === p.id) || (!destType(m) && m.done)) {
        if (m.type === 'supply') { d.cargo[m.cid] -= m.qty; if (!d.cargo[m.cid]) delete d.cargo[m.cid]; this.stateProgress(s, p.system, 'cid:' + m.cid, m.qty); }   // 2.4: your goods are unloaded
        if (m.type === 'smuggle') this.synGain(s, m.syn ? 'contract' : 'smuggle'); if (m.syn === 'hit') this.synGain(s, 'hit');   // 1.2
        this.jobDone(s, m, p); if (m.exp) this.expeditionNext(s, m); this.mastery(s, 15); this.specOnJob(s, m); this.tut(s, 'job');
        if ((m.type === 'bounty' || m.type === 'assassinate') && this.flying(d, 'vanguard')) { const extra = Math.round(m.reward * 0.5 * this.power(d)); d.credits += extra; this.toast(s, `Vanguard bonus: +${credits(extra)} credits.`); }
        d.credits += m.reward; d.stats.earned += m.reward; m.paid = true;
        d.rep[SYS[p.system].faction] = clamp((d.rep[SYS[p.system].faction] || 0) + 2, -100, 100);
        if (Math.random() < 0.35) { const mt = MATERIALS[Math.floor(Math.random() * 3)], g = Math.min(4, Math.floor(m.reward / 9000)); d.mats[mt][g]++; this.toast(s, `Bonus: a ${mt} crate (grade ${GRADES[g]}).`); }
        this.officerXp(s, 20); this.toast(s, `Job complete: ${m.title}. Paid ${credits(m.reward)} credits.`); this.log(d, `Completed: ${m.title} (+${credits(m.reward)}).`);
        if (m.quest) this.questAdvance(s, m);   // 2.4: the story goes on
      }
    }
    d.missions = d.missions.filter(m => !m.paid);
    for (const m of d.missions) if (m.type === 'bounty' && !m.done) m.spawned = false;   // the target returns if you left
  }

  // ------------------------------------------------------------------ Quantum Station (each captain's own)
  checkStation(d) {
    const S = d.station; if (!S.claimed) return;
    this.hangarInit(d);
    const rb = researchBonus(S), now = Date.now(), per = REFINERY.minutes[S.ops] * 60000 / (1 + (rb.refineSpeed || 0) / 100), cap = REFINERY.silo + (rb.silo || 0);
    if (S.ops >= 1 && per > 0) {
      while (S.refUnits < cap && now - S.refT >= per) { S.refUnits++; S.refT += per; }
      if (S.refUnits >= cap) S.refT = now;
    }
    if (S.active && now >= S.active.ends) { S.done.push(S.active.id); this.log(d, `Research complete: ${RESEARCH.find(r => r.id === S.active.id).name}.`); S.active = null; }
    this.startQueued(d);
  }
  hasMats(d, mats) { return mats.every(([m, g, n]) => d.mats[m][g] >= n); }
  takeMats(d, mats) { for (const [m, g, n] of mats) d.mats[m][g] -= n; }
  station(s, m) {
    const d = s.data, p = STELLARS[d.stellar], S = d.station;
    if (!p || s.ent) return;
    this.checkStation(d);
    if (m.op === 'claim') {
      if (!p.site) return this.toast(s, 'Find a derelict station hull to claim. They drift in systems across the galaxy.');
      if (this.siteOwner(p.id)) return this.toast(s, 'Another captain has already claimed this hull.');
      if (S.site) return this.toast(s, `You already have a Personal Station in ${SYS[STELLARS[S.site].system].name}.`);
      const first = !S.claimed;
      S.site = p.id; S.claimed = true; S.refT = Date.now(); this.db.world.sites[p.id] = this.db.key(d.name);
      if (first) d.mats.alloy[0] += 1;
      this.log(d, `Claimed a derelict station hull in ${SYS[p.system].name}.${first ? ' Its last crew left an Alloy I crate aboard.' : ' Your station progress moved with you.'}`);
      this.toast(s, 'This hull is yours. Start Ops 1 when ready.');
      this.broadcast({ t: 'chat', from: '', msg: `${s.name} claimed a station hull in ${SYS[p.system].name}.` });
      this.db.touch(); this.pushSites(); this.you(s); this.landed(s); return;
    }
    if (!this.ownSite(d, p)) return this.toast(s, 'Land at your Personal Station for that.');
    switch (m.op) {
      case 'upgrade': {
        const o = OPS[S.ops]; if (!S.claimed || !o) break;
        if (d.credits < o.cost || !this.hasMats(d, o.mats)) return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= o.cost; this.takeMats(d, o.mats); S.ops++; S.refT = Date.now();
        this.log(d, `Quantum Station reached Ops ${S.ops}: ${o.title}.`); this.toast(s, `Ops ${S.ops} complete: ${o.unlock}.`);
        if (S.ops === 3) this.toast(s, 'Newcomer protection has ended: raiders in inner space now treat you like any other captain.');
        this.broadcast({ t: 'chat', from: '', msg: `${s.name}'s Personal Station reached Ops ${S.ops}.` }); this.pushSites();
        break;
      }
      case 'process': {   // ore -> material crates
        if (S.ops < 1) return this.toast(s, 'Build Ops 1 first.');
        const ore = m.id, mat = ORE_PROCESS.to[ore]; if (!mat) break;
        const have = d.cargo[ore] || 0, n = Math.min(Math.floor(have / ORE_PROCESS.per), Math.floor(d.credits / ORE_PROCESS.cost), m.all ? 99 : 1);
        if (n <= 0) return this.toast(s, `You need ${ORE_PROCESS.per} t of ${COMMODITIES.find(c => c.id === ore).name} and ${credits(ORE_PROCESS.cost)} credits per crate.`);
        const g = Math.min(4, ORE_PROCESS.grade[S.ops] + (researchBonus(S).processGrade || 0));
        d.cargo[ore] = have - n * ORE_PROCESS.per; if (!d.cargo[ore]) delete d.cargo[ore]; d.credits -= n * ORE_PROCESS.cost; d.mats[mat][g] += n;
        this.toast(s, `Processed ${n * ORE_PROCESS.per} t into ${n} ${mat} ${GRADES[g]} crate${n > 1 ? 's' : ''}.`);
        break;
      }
      case 'collect': {
        if (!S.refUnits) return this.toast(s, 'The refinery has nothing ready.');
        const n = S.refUnits, cr = n * (2500 + S.ops * 1500); d.credits += cr; S.refUnits = 0; S.refT = Date.now();
        const got = []; for (let i = 0; i < n; i++) { const mt = MATERIALS[Math.floor(Math.random() * 3)], g = Math.min(4, Math.floor(Math.random() * (S.ops >= 4 ? 4 : S.ops >= 2 ? 3 : 2)) + (researchBonus(S).refineGrade && Math.random() < 0.5 ? 1 : 0)); d.mats[mt][g]++; got.push(`${mt} ${GRADES[g]}`); }
        this.toast(s, `Collected ${n} refinery unit${n > 1 ? 's' : ''}: ${credits(cr)} credits and ${got.join(', ')}.`); break;
      }
      case 'research': {
        if (S.active || (RESEARCH.find(x => x.id === m.id) || {}).needs && !S.done.includes(RESEARCH.find(x => x.id === m.id).needs)) { this.queueResearch(s, m.id); break; }
        const r = RESEARCH.find(x => x.id === m.id); if (!r || S.done.includes(r.id) || S.ops < r.ops) break;
        if (d.credits < r.cost || !this.hasMats(d, r.mats)) return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= r.cost; this.takeMats(d, r.mats); S.active = { id: r.id, ends: Date.now() + r.minutes * 60000 };
        this.toast(s, `Research started: ${r.name} (${r.minutes} minutes).`); break;
      }
      case 'hire': case 'dismiss': return this.toast(s, 'Wingmates are ships now: buy them at your station shipyard and assign them to a dock (STATION, then DOCKS).');   // 2.1
      case 'unqueue': S.queue = S.queue.filter(x => x !== m.id); break;
      case 'defense': this.defenseUpgrade(s); break;
      case 'refine': this.refineUp(s, m.mat, m.g | 0, m.n | 0); break;
      case 'refit': {
        if (d.shipless) return this.toast(s, 'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.');
        const to = S.ops >= 3 && MK2_OF[d.ship.hull] ? MK2_OF[d.ship.hull] : (S.ops >= 5 && MK3_OF[d.ship.hull] ? MK3_OF[d.ship.hull] : null);
        if (!to) return this.toast(s, 'No refit available for this hull at your Ops level.');
        const mk3 = !!MK3_OF[d.ship.hull], cost = Math.round(this.A.ships[to].cost * (mk3 ? 0.45 : 0.3));
        const mats = mk3 ? [['alloy', 4, 1], ['crystal', 4, 1], ['isotope', 3, 1]] : [['alloy', 2, 1], ['crystal', 2, 1], ['isotope', 0, 1]];
        if (d.credits < cost || !this.hasMats(d, mats)) return this.toast(s, `Refit needs ${credits(cost)} credits and ${mats.map(([a, g]) => a + ' ' + GRADES[g]).join(', ')}.`);
        d.credits -= cost; this.takeMats(d, mats); d.ship.hull = to; this.log(d, `Refit complete: now flying the ${this.A.ships[to].name}.`); this.toast(s, `Refit complete: ${this.A.ships[to].name}.`); break;
      }
    }
    this.db.touch(); this.you(s); this.landed(s);
  }

  // ------------------------------------------------------------------ chat
  chat(s, m) {
    const msg = String(m.msg || '').slice(0, 240).trim(); if (!msg) return;
    const now = Date.now(); if (now - s.chatT < 700) return; s.chatT = now;
    const sys = m.ch === 'sys', fl = m.ch === 'fleet' && s.data.fleet;
    if (m.ch === 'fleet' && !fl) return this.toast(s, 'You are not in a fleet.');
    this.broadcast({ t: 'chat', from: (fl ? `[${s.data.fleet}] ` : '') + s.name, msg, ch: fl ? 'fleet' : sys ? 'sys' : 'all', sys: s.data.sys }, fl ? (o => o.data.fleet === s.data.fleet) : sys ? (o => o.data.sys === s.data.sys) : null);
  }

  sleep(sp) { this.saveDreads(); delete this.live[sp.id]; }
  saveDreads() { for (const sp of Object.values(this.live)) for (const e of sp.ships.values()) if (e.dread && this.db.world.claims[sp.id]) { const c = this.db.world.claims[sp.id]; c.hp = Math.max(0.01, e.armor / e.st.armor); c.t = Date.now(); } }
  // every two seconds: shuttles that have come home report in, finished research hands over to the queue
  idleCheck(s) {
    const d = s.data; this.hangarInit(d);
    const before = (d.station.active && d.station.active.id) + '|' + d.station.queue.length + '|' + d.station.done.length + '|' + d.station.refUnits;
    this.checkStation(d);
    if (d.tut != null && d.tut < TUTORIAL.length && TUTORIAL[d.tut].check) this.tut(s, '*check');
    let changed = this.specCheck(d) || before !== (d.station.active && d.station.active.id) + '|' + d.station.queue.length + '|' + d.station.done.length + '|' + d.station.refUnits;
    const now = Date.now(), back = d.shuttles.filter(x => x.state === 'out' && now >= x.ends);
    for (const sh of back) this.resolveShuttle(s, sh);
    if (back.length) { d.shuttles = d.shuttles.filter(x => x.state !== 'gone'); changed = true; }
    if (changed) { this.db.touch(); this.you(s); }
  }
  // ------------------------------------------------------------------ loop
  tick() {
    if (this.paused) { if (![...this.sessions.values()].some(x => x.data)) this.setPaused(false); return; }   // solo pause
    this.tickN++;
    if (this.tickN % (TICK * 2) === 0) { for (const s of this.sessions.values()) if (s.data) { this.idleCheck(s); this.missionIdle(s); this.missionDeadlines(s); this.questSweep(s); this.questSalvageIdle(s); this.bankTick(s); this.raidCheck(s); this.specIdle(s); this.holdoutTick(s); } this.invasionTick(); this.saveDreads(); this.waveTick(); this.arenaTick(); this.armadaTick(); }
    if (this.tickN % (TICK * 20) === 0) { this.rivalsTick(); this.livingTick(); }   // 2.4: system states come and go   // 1.1: rival careers, news, market flashes, hired guns
    if (this.tickN % (TICK * 2) === 1) for (const sp of Object.values(this.live)) if (sp.players > 0) this.rivalSync(sp);
    if (this.tickN % (TICK * 30) === 0) { const v = this.worldPayload(), k = JSON.stringify([v.vuln, v.anomalies, v.event.id, v.states]); if (k !== this.worldKey) { this.worldKey = k; this.broadcast(v); } }
    for (const sp of Object.values(this.live)) {
      const safeTick = () => { try { sp.tick(); } catch (e) { sp.errs = (sp.errs || 0) + 1; if (sp.errs < 5) console.error('space tick error', sp.id, e); } };
      if (sp.players > 0) { sp.quietT = 0; safeTick(); }
      else if (this.tickN % 15 === 0) { safeTick(); sp.quietT = (sp.quietT || 0) + 15 / TICK; if (sp.quietT > 120 && !sp.keep) this.sleep(sp); }
    }
    if (this.tickN % 2) return;
    const bySys = {};
    for (const s of this.sessions.values()) if (s.data && s.ent) (bySys[s.data.sys] = bySys[s.data.sys] || []).push(s);
    for (const [sys, list] of Object.entries(bySys)) {
      const snap = this.spaces[sys].snapshot();
      for (const s of list) {
        const e = s.ent; if (!e) continue;
        this.send(s, JSON.stringify({ t: 'snap', ...snap, me: [e.id, e.seq || 0, +e.x.toFixed(2), +e.y.toFixed(2), +e.vx.toFixed(2), +e.vy.toFixed(2), +e.a.toFixed(4),
          Math.round(e.shield), Math.round(e.armor), Math.round(e.fuel), e.target ? e.target.id : 0, e.guns.filter(g => g.ammo !== Infinity).map(g => [g.w, g.ammo])] }));
      }
    }
    for (const sp of Object.values(this.live)) if (!bySys[sp.id]) sp.events = [];
  }
}

Object.assign(Game.prototype, HangarMixin, FrontsMixin, FrontierMixin, SpecialistMixin, HostileMixin, StoryMixin, RivalsMixin, HailMixin, FleetCmdMixin, SyndicateMixin, ArcsMixin, DocksMixin, LivingMixin, QuestMixin);
