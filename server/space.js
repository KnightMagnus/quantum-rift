// One star system's live simulation: ships (players, their escorts, NPC traffic), shots, beams, loot.
import { SYS, TRAFFIC, FACTIONS, MATERIALS } from '../shared/galaxy.js';
import { roleMult } from '../shared/roles.js';
import { STATES } from '../shared/living.js';
import { shipStats, weaponParams, weaponSound, step, wrap, angDiff, angleTo, hostileFactions, K, DT } from '../shared/rules.js';

let NEXT = 1;
const SLOTS = [[-1, 1], [1, 1], [-2, 1.8], [2, 1.8], [0, 2.2], [-3, 2.6], [3, 2.6], [-1, 3], [1, 3]];   // escort formation: [lateral, behind]
const d0 = (e, x, y) => Math.hypot(x - e.x, y - e.y);
const FAC = Object.keys(FACTIONS);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Space {
  constructor(game, sysId) {
    this.game = game; this.A = game.A; this.sys = SYS[sysId]; this.id = sysId;
    this.ships = new Map(); this.shots = []; this.beams = []; this.loot = []; this.events = []; this.t = 0; this.spawnT = 1; this.players = 0;
    if (!this.sys.arena) for (let i = 0, n = 5 + this.sys.danger + Math.floor(this.ports().length / 2); i < n; i++) this.spawnTraffic(true);   // 2.3: busier systems
    // asteroids and gas pockets in the system's mining fields: they break into ore that ships scoop up, and regrow
    this.rocks = [];
    for (const f of this.sys.fields || []) for (let i = 0; i < f.rocks; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * f.r, r = 16 + Math.random() * 30;
      const max = Math.round(r * (f.ore === 'gas' ? 6 : f.ore === 'shards' ? 12 : 9) * (1 + f.rich * 0.5));
      this.rocks.push({ id: NEXT++, x: Math.round(f.x + Math.cos(a) * d), y: Math.round(f.y + Math.sin(a) * d), r: Math.round(r), ore: f.ore, rich: f.rich, hp: max, max, down: 0, evT: 0 });
    }
  }
  rocksPayload() { return this.rocks.map(k => [k.id, k.x, k.y, k.r, k.ore, k.down ? 0 : Math.round(100 * k.hp / k.max)]); }
  hitRock(k, dmg, mining) {
    if (k.down) return;
    k.hp -= dmg * (mining ? 6 : 1);
    if (k.hp <= 0) {
      k.down = this.t + (100 + Math.random() * 60) / (this.m ? this.m.regrow : 1); k.hp = k.max;
      const n = Math.max(1, Math.round(k.r / 14)) + (k.rich - 1);
      for (let i = 0; i < n; i++) this.loot.push({ id: NEXT++, x: k.x + rnd(-k.r, k.r) * 0.6, y: k.y + rnd(-k.r, k.r) * 0.6, vx: rnd(-25, 25), vy: rnd(-25, 25), t: this.t,
                                                   it: { ore: k.ore, rich: k.rich, n: k.rich + (Math.random() < 0.4 ? 1 : 0) }, kind: { ore: 2, gas: 3, shards: 4 }[k.ore] });
      this.events.push(['rock', k.id, 0], ['boom', k.x, k.y, k.r * 1.2]);
    } else if (this.t - k.evT > 0.25) { k.evT = this.t; this.events.push(['rock', k.id, Math.round(100 * k.hp / k.max)]); }
  }
  rockAt(x, y, pad = 0) { for (const k of this.rocks) if (!k.down && Math.abs(k.x - x) < k.r + pad && Math.abs(k.y - y) < k.r + pad && Math.hypot(k.x - x, k.y - y) < k.r + pad) return k; return null; }

  // ------------------------------------------------------------------ ships
  makeShip(o) {
    const loadout = o.loadout || { hull: o.hull, outfits: {} };
    const st = shipStats(this.A, loadout, o.bonus || {});
    const e = { id: NEXT++, hull: loadout.hull, faction: o.faction || 'spacer', x: o.x || 0, y: o.y || 0, vx: o.vx || 0, vy: o.vy || 0, a: o.a || 0,
      st, shield: o.shield ?? st.shield, armor: o.armor ?? st.armor, fuel: o.fuel ?? st.fuel, ai: o.ai || null, player: o.player || null, owner: o.owner || null,
      name: o.name || null, target: null, aggro: new Set(), inp: { thrust: 0, turn: 0 }, guns: [], dead: false, born: this.t, think: 0, dest: null,
      state: o.state || 'fly', jumpT: 0, mission: o.mission || null, life: rnd(150, 300), cargo: o.cargo || 0, strength: this.A.ships[loadout.hull].strength || 10 };
    const H = this.A.ships[loadout.hull]; e.role = H.role;
    if (!e.player) { const F = FACTIONS[e.faction] || {}, r = Math.random(); e.pers = o.pers || (F.pirate ? (r < 0.15 ? 'cautious' : r < 0.6 ? 'steady' : 'reckless') : r < 0.35 ? 'cautious' : r < 0.85 ? 'steady' : 'reckless'); }   // 2.4: how a captain fights
    const ob = o.bonus || {}; e.pw = Math.round((H.strength || 10) * (1 + ((ob.shieldPct || 0) + (ob.armorPct || 0) + (ob.damagePct || 0)) / 300));   // 0.9: effective strength (levels)
    const defAmmo = {}; for (const [w, , a] of H.weapons) defAmmo[w] = (defAmmo[w] || 0) + a;
    for (const [w, n] of Object.entries(st.weapons)) {
      const W = this.A.weapons[w]; if (!W) continue;
      const p = weaponParams(W);
      const needsAmmo = (p.homing || p.rocket || p.bay) && W.ammo !== -1;
      const ammo = needsAmmo ? (o.ammo && o.ammo[w] !== undefined ? o.ammo[w] : (defAmmo[w] || 0)) : Infinity;
      e.guns.push({ w: +w, n, p, cd: rnd(0, p.reload), ammo, snd: weaponSound(W), sec: p.homing || p.rocket || p.bay, sndT: 0 });
    }
    this.ships.set(e.id, e);
    return e;
  }
  remove(e, why) { e.dead = true; this.ships.delete(e.id); if (why) this.events.push(['flash', Math.round(e.x), Math.round(e.y)]); }
  root(e) { let r = e, k = 0; while (r && r.owner && k++ < 4) r = this.ships.get(r.owner) || null; return r || e; }
  ports() { return this._ports || (this._ports = this.sys.stellars.filter(p => p.svc && p.svc.includes('L') && !p.site)); }   // 2.3: where traffic can land
  pid(e) { const r = this.root(e); return r && r.player ? r.player.id : null; }
  // 2.0.3: newcomer protection. Pirates, raiders, swarms and other always-hostile ships never pick a fight with a protected
  // captain (Personal Station below Ops 3) in inner space (danger 0-2), and nobody targets a captain in the first seconds
  // after a jump. Firing on them, or a job's own target, ends the truce for that fight.
  spared(e, o) {
    const ro = this.root(o), re = this.root(e); if (!ro || !ro.player || !re || re.player) return false;
    if (ro.graceT > this.t) return true;   // just arrived
    if (re.aggro.has(ro.id) || (re.mission && re.mission.owner === ro.player.id) || re.storyKill || re.arcOf || re.huntOf) return false;
    if (!this.inner()) return false;
    const F = FACTIONS[re.faction] || {};
    if (!(F.pirate || F.alwaysHostile || re.boss || re.bossMinion || re.warFleet)) return false;
    return !!(this.game.newcomer && this.game.newcomer(ro.player.s && ro.player.s.data));
  }
  // 2.1: can a's fire hurt b? Hostiles always; a captain's own guns also hit any ship not on their side (like EV Nova),
  // which angers it and costs standing. Escorts and NPCs still only hit their enemies.
  // 2.1: your wingmates under an attack order (K) go after whatever you have targeted, hostile or not
  ordered(e, t) {
    const r = this.root(e); if (!e.owner || !r || !r.player || r.order !== 'attack' || !r.target || r.target.dead || this.sys.arena) return false;
    const rt = this.root(t); return rt === this.root(r.target) && rt !== r && !rt.player;
  }
  canHit(a, b) {
    if (this.isHostile(a, b)) return !this.spared(a, b);
    if (this.ordered(a, b)) return true;
    if (!a || !b || !a.player || this.sys.arena) return false;
    const rb = this.root(b); if (rb === a || rb.player) return false;   // never your own wing; players only in lawless space (isHostile)
    return !b.dead && b.state === 'fly';
  }
  inner() { const S = this.sys; return S.danger <= 2 && !S.farside && !S.arena && !['umbral', 'deep'].includes(S.faction); }

  isHostile(a, b) {
    if (!a || !b || a === b || a.dead || b.dead) return false;
    const ra = this.root(a), rb = this.root(b); if (ra === rb) return false;
    if (ra.rescueT > this.t || rb.rescueT > this.t) return false;   // 2.6: a downed captain waiting for rescue is left alone
    const pa = ra.player, pb = rb.player;
    if (this.sys.arena) return !!(ra.team && rb.team && ra.team !== rb.team);   // arena: teams only
    if (pa && pb && this.game.features.coop.sameArmada(pa, pb)) return false;   // 2.6: Armada members and their wingmates never fight
    if (pa && pb) return !!(this.game.features.coop.dueling && this.game.features.coop.dueling(pa, pb));   // 2.6: no open-galaxy PvP, whatever was fired; only agreed duels (and the Crucible, above)
    if (ra.aggro.has(rb.id) || rb.aggro.has(ra.id)) return true;
    if ((ra.boss || ra.bossMinion || ra.kingpin) && pb || (rb.boss || rb.bossMinion || rb.kingpin) && pa) return true;   // 2.6: Armada contract kingpins too   // invasion bosses attack everyone
    if (pa || pb) {
      const p = pa || pb, npc = pa ? rb : ra, rep = p.rep[npc.faction] || 0, F = FACTIONS[npc.faction];
      const rh = this.game.features.rivals.rivalHostile ? this.game.features.rivals.rivalHostile(npc, p) : undefined; if (rh !== undefined) return rh;   // 1.1: rivals, hired guns, bribes
      if (F && F.pirate) return rep < 30;
      if (F && F.alwaysHostile) return true;
      if (npc.mission && npc.mission.owner === p.id) return true;
      return rep <= -30;
    }
    return hostileFactions(ra.faction, rb.faction);
  }

  // ------------------------------------------------------------------ traffic
  spawnTraffic(initial) {
    const S = this.sys;
    if ((S.faction === 'vashari' || S.faction === 'frontier') && Math.random() < 0.14 * (this.m ? this.m.swarm : 1)) return this.spawnSwarm(initial);
    if (this.game.features.hostile.eclipseChance && Math.random() < this.game.features.hostile.eclipseChance(S, this.m)) return this.spawnEclipse(initial);
    let fac = S.faction;
    if (FACTIONS[fac].region) {   // Frontier and the Deep fly no flag: traffic comes from the neighbours, raiders and scavengers
      if (!this.nearFacs) { const ns = new Set(); for (const l of S.links) { const f = SYS[l].faction; if (!FACTIONS[f].region && !FACTIONS[f].pirate) ns.add(f); } this.nearFacs = [...ns, 'spacer', 'spacer']; }
      const roll0 = Math.random();
      if (fac === 'deep') fac = roll0 < 0.7 ? 'umbral' : 'hollow';
      else fac = roll0 < 0.12 * S.danger ? 'hollow' : pick(this.nearFacs);
    }
    const T = TRAFFIC[fac];
    let kind, f = fac, roll = Math.random();
    const st = this.game.features.living.stateOf ? this.game.features.living.stateOf(this.id) : null, SX = st ? STATES[st.kind] : null;   // 2.4: the system's state shapes its traffic
    if (st && st.kind === 'war' && st.enemy && TRAFFIC[st.enemy] && Math.random() < 0.35) { const lead = this.spawnGroup('patrol', st.enemy, TRAFFIC[st.enemy].war, initial); if (lead) for (const e of this.ships.values()) if (e === lead || e.owner === lead.id) e.warFleet = true; return lead; }   // 2.5.2: tagged, so newcomers are spared
    if (st && st.kind === 'pirates' && Math.random() < 0.3) roll = -1;   // force a raid roll below
    if (FACTIONS[fac].pirate) kind = 'raid';
    else if ((S.danger >= 2 || roll < 0) && roll < 0.08 * S.danger * (this.m ? this.m.raid : 1)) { kind = 'raid'; f = Math.random() < 0.3 && S.danger >= 3 && !S.farside ? 'umbral' : 'hollow'; }
    else if (roll < 0.68 && T.traders.length) kind = 'trade';
    else if (roll < 0.82) { kind = 'trade'; f = 'spacer'; }
    else kind = 'patrol';
    if (kind === 'raid' && FACTIONS[S.faction].pirate && [...this.ships.values()].filter(e => e.ai === 'raid' && !e.owner && !e.mission).length >= 3 + Math.floor(S.danger / 2)) { kind = 'trade'; f = 'spacer'; }   // 2.3: pirate havens get visiting smugglers and free traders too
    else if (kind === 'raid' && !FACTIONS[S.faction].pirate && [...this.ships.values()].filter(e => e.ai === 'raid' && !e.owner && !e.mission).length >= (this.inner() ? 1 : 2) + Math.floor(S.danger / 2) + (SX && SX.raidCap || 0)) { kind = 'trade'; f = T.traders.length ? fac : 'spacer'; roll = 1; }   // 2.0.3: raiders don't pile up while traders come and go
    let pool = kind === 'trade' ? (TRAFFIC[f].traders.length ? TRAFFIC[f].traders : TRAFFIC.spacer.traders) : TRAFFIC[f].war;
    if (kind === 'raid' && this.inner() && pool.length > 2) pool = [...pool].sort((a, b) => ((this.A.ships[a] || {}).cost || 0) - ((this.A.ships[b] || {}).cost || 0)).slice(0, pool.length - 1);   // 2.0.3: no destroyers raiding inner space
    const hull = pick(pool); if (!this.A.ships[hull]) return;
    const n = kind === 'trade' ? (Math.random() < 0.22 ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1) : (Math.random() < 0.4 ? 2 : 1) + (kind === 'raid' && S.danger > 3 ? 1 : 0);   // 2.3: some traders run in small convoys
    let lead = null;
    for (let i = 0; i < n; i++) {
      const h = i === 0 ? hull : pick(pool.filter(x => (this.A.ships[x].cost || 0) <= (this.A.ships[hull].cost || 1e9)) || pool);
      let x, y, a, v;
      if (initial) { x = rnd(-1800, 1800); y = rnd(-1800, 1800); a = rnd(-Math.PI, Math.PI); v = 30; }
      else if (kind === 'trade' && this.ports().length && Math.random() < 0.45) {   // take off from a spaceport
        const s = pick(this.ports()); x = s.x + rnd(-40, 40); y = s.y + rnd(-40, 40); a = rnd(-Math.PI, Math.PI); v = 10;
      } else { const ang = rnd(-Math.PI, Math.PI); x = Math.sin(ang) * 2600; y = -Math.cos(ang) * 2600; a = wrap(ang + Math.PI); v = 140; }
      const e = this.makeShip({ hull: h, faction: f, x: x + i * 60, y: y + i * 50, a, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, ai: kind, owner: lead ? lead.id : null });
      if (!initial) this.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
      if (!lead) lead = e; else { e.ai = 'escort'; if (kind === 'trade') e.tradeMate = true; }
    }
  }
  // 2.4: a group of warships of one power (a border war's attackers)
  spawnGroup(kind, f, pool, initial) {
    const hull = pick(pool.filter(h => this.A.ships[h])); if (!hull) return; const ang = rnd(-Math.PI, Math.PI), n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    let lead = null;
    for (let i = 0; i < n; i++) {
      const x = initial ? rnd(-1800, 1800) : Math.sin(ang) * 2600, y = initial ? rnd(-1800, 1800) : -Math.cos(ang) * 2600, a = wrap(ang + Math.PI);
      const e = this.makeShip({ hull: i ? pick(pool.filter(h => this.A.ships[h] && (this.A.ships[h].cost || 0) <= (this.A.ships[hull].cost || 1e9))) || hull : hull, faction: f, x: x + i * 70, y: y + i * 50, a, vx: Math.sin(a) * 120, vy: -Math.cos(a) * 120, ai: i ? 'escort' : kind, owner: lead ? lead.id : null });
      if (!initial) this.events.push(['flash', Math.round(e.x), Math.round(e.y)]); if (!lead) lead = e;
    }
    return lead;
  }
  // 0.8: a Feral Swarm cluster: a Thrip Darter brood-leader and its drones, hostile to everyone
  spawnSwarm(initial) {
    const ang = Math.random() * Math.PI * 2, d = initial ? 600 + Math.random() * 1400 : 2400, x = Math.cos(ang) * d, y = Math.sin(ang) * d;
    const lead = this.makeShip({ hull: 765, faction: 'swarm', x, y, a: ang + Math.PI, ai: 'raid', name: 'Swarm Brood-Leader' });
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { const e = this.makeShip({ hull: i % 3 ? 718 : 765, faction: 'swarm', x: x + (Math.random() - 0.5) * 160, y: y + (Math.random() - 0.5) * 160, a: ang + Math.PI, ai: 'escort', owner: lead.id }); e.swarmling = true; }
    if (!initial) this.events.push(['flash', Math.round(x), Math.round(y)]);
    return lead;
  }
  // 0.9: an Umbral Eclipse cell, violet-lit and far from home
  spawnEclipse(initial) {
    const ang = Math.random() * Math.PI * 2, d = initial ? 700 + Math.random() * 1300 : 2400, x = Math.cos(ang) * d, y = Math.sin(ang) * d;
    const lead = this.makeShip({ hull: Math.random() < 0.35 ? 763 : 762, faction: 'eclipse', x, y, a: ang + Math.PI, ai: 'raid', name: 'Eclipse Cell' });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.makeShip({ hull: i ? 761 : 762, faction: 'eclipse', x: x + (i - 1) * 110, y: y + 90, a: ang + Math.PI, ai: 'escort', owner: lead.id });
    if (!initial) this.events.push(['flash', Math.round(x), Math.round(y)]);
    return lead;
  }
  nextLootId() { return NEXT++; }
  spawnMissionTarget(m) {
    const hull = m.hull, ang = rnd(-Math.PI, Math.PI);
    const e = this.makeShip({ hull, faction: m.faction, x: Math.sin(ang) * 1500, y: -Math.cos(ang) * 1500, a: wrap(ang + Math.PI), ai: 'raid', name: m.targetName,
                              mission: { id: m.id, owner: m.owner } });
    e.life = 1e9; this.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    return e;
  }

  // ------------------------------------------------------------------ AI
  steer(e, tx, ty, arrive, tvx = 0, tvy = 0) {
    const st = e.st, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), sp = Math.hypot(e.vx, e.vy);
    const want = Math.atan2(dx, -dy), diff = angDiff(want, e.a);
    if (arrive) {   // 2.0.1: plan a speed that falls to zero at the target (allowing time to turn around), and steer to close the velocity error
      const tflip = Math.PI / Math.max(0.3, st.turn), ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 0;
      const vAllow = Math.min(st.maxSpeed * 0.95, Math.sqrt(2 * st.accel * Math.max(0, d - 10 - sp * tflip * 0.6)) * 0.8);
      const ex = tvx + ux * vAllow - e.vx, ey = tvy + uy * vAllow - e.vy, em = Math.hypot(ex, ey);
      if (em < 8) { e.inp = { turn: 0, thrust: 0 }; return d; }
      const wa = Math.atan2(ex, -ey), da = angDiff(wa, e.a);
      e.inp = { turn: Math.abs(da) < st.turn * DT ? 0 : Math.sign(da), thrust: Math.abs(da) < 0.45 && em > 12 ? 1 : 0 };
      if (Math.abs(da) < st.turn * DT) e.a = wa;
      return d;
    }
    e.inp = { turn: Math.abs(diff) < st.turn * DT ? 0 : Math.sign(diff), thrust: Math.abs(diff) < 0.7 ? 1 : 0 };
    if (Math.abs(diff) < st.turn * DT) e.a = want;
    return d;
  }
  findTarget(e, range = 1800) {
    let best = null, bd = range;
    for (const o of this.ships.values()) {
      if (o === e || o.state !== 'fly' || !this.isHostile(e, o) || this.spared(e, o)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y) * (o.hull === 813 && o.player ? 3 : 1);   // the Wraith is noticed at a third of the range
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  ai(e) {
    if (e.player) return;
    e.think -= DT;
    const owner = e.owner ? this.ships.get(e.owner) : null;
    if (e.ai === 'escort' && !owner) e.ai = e.fighterOf ? 'leave' : e.tradeMate ? 'trade' : 'patrol';   // 2.3: a convoy whose leader landed goes about its own trade
    if (e.armor < e.st.armor * 0.15 && !e.player && !e.noDisable) {   // disabled: drifts; unclaimed wrecks are towed away after a while
      if (!e.disabled) e.disT = this.t;
      e.inp = { thrust: 0, turn: 0 }; e.disabled = true;
      if (this.t - e.disT > 75 && !e.mission && !e.rescueOf && !e.boardedBy && !this.pid(e)) this.remove(e, "jump");
      return;
    }
    if (e.think <= 0) {
      e.think = 0.4 + Math.random() * 0.3;
      if (e.recall) { e.target = null; } else {
      if (e.target && (e.target.dead || e.target.state !== 'fly' || !(this.isHostile(e, e.target) || this.ordered(e, e.target)) || this.spared(e, e.target))) e.target = null;
      if (e.rival && this.game.features.rivals.rivalThink && !e.owner) this.game.features.rivals.rivalThink(e, this);   // 1.1
      if (e.distractT > this.t) { e.target = null; if (e.dest) { this.steer(e, e.dest.x, e.dest.y, true); return; } }   // raiders chasing jettisoned cargo
      if (e.ai === 'escort' && owner) {
        const ord = owner.order || 'gather';   // 1.1 fleet commands: gather, attack, hold, holdfire, loot
        if (e.ordSeq !== owner.orderSeq) { e.ordSeq = owner.orderSeq; e.holdAt = { x: e.x, y: e.y }; if (ord === 'holdfire' || ord === 'loot') e.target = null; }
        const ot = owner.target && !owner.target.dead && (this.isHostile(e, owner.target) || (ord === 'attack' && this.ordered(e, owner.target))) ? owner.target : null;
        const attacker = [...this.root(owner).aggro].map(id => this.ships.get(id)).find(s => s && !s.dead);
        if (ord === 'holdfire' || (ord === 'loot' && !attacker)) e.target = null;
        else if (ord === 'attack') e.target = ot || attacker || null;
        else if (ord === 'hold') { const near = (t) => t && Math.hypot(t.x - e.holdAt.x, t.y - e.holdAt.y) < 900 ? t : null; e.target = near(ot) || near(attacker) || near(this.findTarget(e, 600)); }
        else e.target = ot || attacker || (owner.player ? null : this.findTarget(e, 900)) || (owner.player ? this.findTarget(e, 700) : null);
      } else if (e.ai === 'patrol' || e.ai === 'raid') e.target = e.target || this.findTarget(e, e.ai === 'raid' ? 2200 : 1500);
      else if (e.ai === 'trade' && e.aggro.size) e.ai = 'flee';
      if (this.t - e.born > e.life && (e.ai === 'patrol' || e.ai === 'raid') && !e.target) e.ai = 'leave';
      if (e.target && (e.ai === 'patrol' || e.ai === 'raid') && this.mayFlee(e)) { e.ai = 'flee'; e.target = null; e.fled = true; this.events.push(['flee', e.id]); }   // 2.4: a beaten captain runs for the jump point
      if (e.ai === 'flee') e.target = null;
      }   // (not recalled)
    }
    if (e.target) { e.catchup = null; return this.fight(e, e.target); }
    switch (e.ai) {
      case 'trade': {
        if (!e.dest) e.dest = this.ports().length && Math.random() < 0.75 ? pick(this.ports()) : { x: rnd(-3000, 3000), y: rnd(-3000, 3000), out: true };   // 2.3: traders fly to worlds they can land on
        const d = this.steer(e, e.dest.x, e.dest.y, !e.dest.out);
        if (!e.dest.out && d < Math.max(40, (e.dest.r || 60) * 0.5) && Math.hypot(e.vx, e.vy) < 45) {   // settled over the pad: land
          this.events.push(['land', e.id]); if (e.convoyOf) this.game.features.fronts.onConvoyLanded(e); if (e.rival && this.game.features.rivals.rivalDocked) this.game.features.rivals.rivalDocked(e); this.remove(e);
        }
        if (e.dest.out && d < 200) e.ai = 'leave';
        break;
      }
      case 'guard': {   // Dreadnoughts and invasion bosses hold station near their anchor point
        const h = e.home || { x: 0, y: 0 }, dd = Math.hypot(h.x - e.x, h.y - e.y);
        if (dd > 250) this.steer(e, h.x, h.y, true); else { e.inp = { turn: 1, thrust: Math.hypot(e.vx, e.vy) < 15 ? 1 : 0 }; }
        break;
      }
      case 'patrol': case 'raid': {
        if (!e.dest || Math.hypot(e.dest.x - e.x, e.dest.y - e.y) < 200) e.dest = Math.random() < 0.5 && this.sys.stellars.length ? { x: pick(this.sys.stellars).x + rnd(-400, 400), y: pick(this.sys.stellars).y + rnd(-400, 400) } : { x: rnd(-2000, 2000), y: rnd(-2000, 2000) };
        this.steer(e, e.dest.x, e.dest.y, false); e.inp.thrust = e.inp.thrust && Math.hypot(e.vx, e.vy) < e.st.maxSpeed * 0.6 ? 1 : 0;
        break;
      }
      case 'escort': {
        if (!owner) break;
        if (e.recall) { const d = this.steer(e, owner.x, owner.y, true, owner.vx, owner.vy); e.catchup = owner.st; if (d < Math.max(50, owner.st.size * 0.35)) this.dock(e, owner); break; }   // 2.1: drones flying home
        const ord = owner.order || 'gather';
        if (ord === 'hold' && e.holdAt) { const d = this.steer(e, e.holdAt.x, e.holdAt.y, true); if (d < 60) e.inp = { turn: 0, thrust: 0 }; break; }
        if (ord === 'loot') {   // sweep up nearby loot for the fleet's owner
          let best = null, bd = 1800; for (const l of this.loot) { if (l.taken) continue; const dd = Math.hypot(l.x - e.x, l.y - e.y); if (dd < bd) { bd = dd; best = l; } }
          const rp = this.root(owner).player;
          if (best && rp) { this.steer(e, best.x, best.y, true); if (bd < Math.max(40, e.st.size * 0.5) && this.game.onLoot(rp, best.it) !== false) { best.taken = true; this.events.push(['pickup', best.id]); } break; }
        }
        if (e.slot == null) {   // each escort keeps its own formation slot
          const used = new Set(); for (const o of this.ships.values()) if (o !== e && o.owner === e.owner && o.slot != null) used.add(o.slot);
          let i = 0; while (used.has(i)) i++; e.slot = i;
        }
        const [lat, back] = SLOTS[e.slot % SLOTS.length], ring = Math.floor(e.slot / SLOTS.length), sz = Math.max(60, owner.st.size * 0.5);
        const L = lat * (55 + sz * 0.4), B = back * (60 + sz * 0.45) + ring * 70;
        const ox = owner.x + Math.cos(owner.a) * L - Math.sin(owner.a) * B, oy = owner.y + Math.sin(owner.a) * L + Math.cos(owner.a) * B;
        const d = this.steer(e, ox, oy, d0(e, ox, oy) > 250 ? false : true, owner.vx, owner.vy);
        e.catchup = d > 200 ? owner.st : null;   // escorts can always keep up with the ship they guard
        if (d < 120) { const sp = Math.hypot(owner.vx, owner.vy); if (sp > 30) { const da = angDiff(owner.a, e.a); e.inp = { turn: Math.sign(da), thrust: Math.hypot(e.vx, e.vy) < sp ? 1 : 0 }; } }
        if (e.fighterOf && owner && !owner.player && !owner.target && d < 60 && this.t - e.born > 20) { this.dock(e, owner); }   // a captain's drones stay out until recalled
        break;
      }
      case 'flee': case 'leave': {
        const ang = Math.atan2(e.x, -e.y) || 0.01; this.steer(e, e.x + Math.sin(ang) * 2000, e.y - Math.cos(ang) * 2000, false);
        if (Math.hypot(e.x, e.y) > 2800) { if (e.rival) { e.ai = e.rivalAi || 'patrol'; e.dest = null; e.aggro.clear(); } else this.remove(e, 'jump'); }
        break;
      }
    }
  }
  // 2.4 personalities: cautious captains run early, steady ones when badly hurt, reckless ones never; named and story ships fight to the end
  mayFlee(e) {
    const thr = { cautious: 0.45, steady: 0.27, reckless: 0 }[e.pers] || 0;
    if (!thr || e.owner || e.mission || e.rival || e.boss || e.bossMinion || e.arcOf || e.storyKill || e.fighterOf || e.noDisable || this.sys.arena) return false;
    return e.armor < e.st.armor * thr && e.shield < e.st.shield * 0.15;
  }
  // 2.4: a ship under attack calls nearby ships of its own side to help
  callHelp(s, attacker) {
    if (s.player || this.sys.arena || (s.helpT || -99) > this.t - 5) return; s.helpT = this.t;
    for (const o of this.ships.values()) {
      if (o === s || o.player || o.owner || o.faction !== s.faction || o.target || o.dead || o.disabled || (o.ai !== 'patrol' && o.ai !== 'raid' && o.ai !== 'guard')) continue;
      if (Math.hypot(o.x - s.x, o.y - s.y) > 1800 || this.spared(o, attacker)) continue;
      o.aggro.add(attacker.id); o.target = attacker;
    }
  }
  dock(f, owner) { const g = owner.guns.find(g => g.p.bay && this.A.weapons[g.w].launch === f.hull); if (g && g.ammo !== Infinity) g.ammo++; this.remove(f); }
  fight(e, t) {
    const best = e.guns.filter(g => !g.p.pd && g.ammo > 0).reduce((m, g) => Math.max(m, g.p.range), 300);
    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
    const lead = Math.min(1.2, d / 600);
    const lx = t.x + (t.vx - e.vx) * lead, ly = t.y + (t.vy - e.vy) * lead;
    if (!e.player && e.st.size >= 110 && e.st.turrets >= 2 && d < best * 1.1 && d > Math.max(140, e.st.size)) {   // 2.4: capitals with turrets circle and fire broadsides instead of ramming
      const side = e.id % 2 ? 1 : -1, ta = Math.atan2(dx, -dy) + side * (Math.PI / 2 - (d > best * 0.8 ? 0.35 : d < best * 0.5 ? -0.35 : 0));
      this.steer(e, e.x + Math.sin(ta) * 300, e.y - Math.cos(ta) * 300, false); e.inp.thrust = Math.hypot(e.vx, e.vy) < e.st.maxSpeed * 0.6 ? e.inp.thrust : 0;
    }
    else if (d > best * 0.75) this.steer(e, lx, ly, false);
    else if (d < Math.max(120, e.st.size * 0.9)) { const away = Math.atan2(-dx, dy) + 0.8; this.steer(e, e.x + Math.sin(away) * 300, e.y - Math.cos(away) * 300, false); }
    else { this.steer(e, lx, ly, false); e.inp.thrust = Math.hypot(e.vx, e.vy) < e.st.maxSpeed * 0.5 ? e.inp.thrust : 0; }
    e.fireAt = t;
  }

  // ------------------------------------------------------------------ combat
  fire(e, g, t, angle) {
    const p = g.p, W = this.A.weapons[g.w];
    if (g.ammo <= 0) return;
    if (p.bay) {
      const launch = W.launch; if (!launch || !this.A.ships[launch]) return;
      if ([...this.ships.values()].filter(s => s.fighterOf === e.id).length >= Math.min(6, g.n * 4)) return;
      const f = this.makeShip({ hull: launch, faction: e.faction, x: e.x, y: e.y, a: e.a, vx: e.vx, vy: e.vy, ai: 'escort', owner: e.id });
      f.fighterOf = e.id; f.life = 1e9; g.ammo--; g.cd = 2.5; this.sound(e, g); return;
    }
    if (p.homing || p.rocket) g.ammo--;
    g.cd = p.reload / Math.max(1, g.n);
    const ang = angle + (Math.random() - 0.5) * p.inacc;
    const dm = e.st.damageMul || 1;
    if (p.beam) {
      const len = p.range; let hit = this.ray(e, ang, len);
      const rk = this.rayRock(e, ang, hit ? hit.d : len);
      if (rk) { this.beams.push({ id: e.id, a: ang, len: rk.d, w: g.w, until: this.t + (p.continuous ? DT * 1.5 : 0.12) }); this.hitRock(rk.k, (p.dmgA + p.dmgS * 0.3) * (p.continuous ? K.beamDps * DT * Math.max(1, g.n) : 1), this.A.weapons[g.w].mining);
        if (!p.continuous || this.t - g.sndT > 0.6) this.sound(e, g); if (p.continuous) g.cd = 0; return; }
      const dur = p.continuous ? DT * 1.5 : 0.12;
      this.beams.push({ id: e.id, a: ang, len: hit ? hit.d : len, w: g.w, until: this.t + dur });
      if (hit) {
        const k = p.continuous ? K.beamDps * DT * Math.max(1, g.n) : 1;
        const bm = this.m ? this.m.beam : 1, r = this.damage(hit.s, p.dmgA * k * dm * bm, p.dmgS * k * dm * bm, e, p.ion);
        if (p.continuous) { hit.s.beamAcc = (hit.s.beamAcc || 0) + r[0]; if (this.t - (hit.s.beamEvT || 0) > 0.3) { hit.s.beamEvT = this.t; this.hitEv(hit.x, hit.y, g.w, hit.s, [hit.s.beamAcc, r[1], r[2]]); hit.s.beamAcc = 0; } }
        else this.hitEv(hit.x, hit.y, g.w, hit.s, r);
      }
      if (!p.continuous || this.t - g.sndT > 0.6) this.sound(e, g);
      if (p.continuous) g.cd = 0;
      return;
    }
    const sp = p.speed;
    const ox = e.x + Math.sin(e.a) * e.st.size * 0.35, oy = e.y - Math.cos(e.a) * e.st.size * 0.35;
    this.shots.push({ x: ox, y: oy, vx: e.vx * (p.homing ? 0.3 : 1) + Math.sin(ang) * sp, vy: e.vy * (p.homing ? 0.3 : 1) - Math.cos(ang) * sp, life: p.life, w: g.w, p,
                      owner: e.id, target: p.homing ? t : null, dmgA: p.dmgA * dm, dmgS: p.dmgS * dm, pd: 0 });
    this.sound(e, g);
  }
  sound(e, g) { if (this.t - g.sndT > 0.12) { g.sndT = this.t; this.events.push(['snd', g.snd, Math.round(e.x), Math.round(e.y)]); } }
  ray(e, ang, len) {
    const dx = Math.sin(ang), dy = -Math.cos(ang); let best = null;
    for (const s of this.ships.values()) {
      if (s === e || s.state !== 'fly' || !this.canHit(e, s)) continue;
      const rx = s.x - e.x, ry = s.y - e.y, along = rx * dx + ry * dy; if (along < 0 || along > len) continue;
      const perp = Math.abs(rx * dy - ry * dx), r = Math.max(10, s.st.size * 0.32);
      if (perp < r && (!best || along < best.d)) best = { s, d: along, x: e.x + dx * along, y: e.y + dy * along };
    }
    return best;
  }
  rayRock(e, ang, len) {
    const dx = Math.sin(ang), dy = -Math.cos(ang); let best = null;
    for (const k of this.rocks) {
      if (k.down) continue; const rx = k.x - e.x, ry = k.y - e.y, along = rx * dx + ry * dy; if (along < 0 || along > len) continue;
      if (Math.abs(rx * dy - ry * dx) < k.r && (!best || along < best.d)) best = { k, d: along };
    }
    return best;
  }
  // 2.1: a captain's fighter bays work as a toggle on F: tap to launch every drone, tap again to call them all home
  toggleDrones(e) {
    const out = [...this.ships.values()].filter(s => s.fighterOf === e.id && !s.dead);
    const say = (m) => { if (e.player && e.player.s && this.game.toast) this.game.toast(e.player.s, m); };
    if (out.some(f => !f.recall)) { for (const f of out) { f.recall = true; f.target = null; } say(`Drones recalled (${out.length}). Tap F to launch them again.`); return; }
    let n = 0;
    for (const g of e.guns) {
      if (!g.p.bay) continue; const W = this.A.weapons[g.w], launch = W && W.launch; if (!launch || !this.A.ships[launch]) continue;
      const cap = Math.min(6, g.n * 4);
      while (g.ammo > 0 && [...this.ships.values()].filter(s => s.fighterOf === e.id).length < cap) {
        const a = e.a + (n % 2 ? 1 : -1) * (0.6 + 0.25 * n), f = this.makeShip({ hull: launch, faction: e.faction, x: e.x + Math.sin(a) * 30, y: e.y - Math.cos(a) * 30, a, vx: e.vx + Math.sin(a) * 60, vy: e.vy - Math.cos(a) * 60, ai: 'escort', owner: e.id });
        f.fighterOf = e.id; f.life = 1e9; if (g.ammo !== Infinity) g.ammo--; n++;
      }
      if (n) this.sound(e, g);
    }
    say(n ? `Drones launched (${n}). Tap F to recall them.` : 'No drones left in the bays.');
  }
  weapons(e) {
    const inp = e.inp || {}, t = e.player ? (e.target && this.ships.get(e.target.id) ? e.target : null) : e.fireAt;
    if (e.player) { const f2 = inp.fire2 ? 1 : 0; if (f2 && !e._f2 && e.guns.some(g => g.p.bay)) this.toggleDrones(e); e._f2 = f2; }
    for (const g of e.guns) {
      g.cd -= DT; if (g.cd > 0 || g.ammo <= 0) continue;
      const p = g.p;
      if (p.pd) {   // point defense: shoot down missiles and fighters
        let best = null, bd = p.range;
        for (const s of this.shots) { if (!s.target || !s.p.homing) continue; const o = this.ships.get(s.owner); if (!o || !this.isHostile(e, o)) continue; const d = Math.hypot(s.x - e.x, s.y - e.y); if (d < bd) { bd = d; best = s; } }
        if (best) { if (Math.random() < 0.35) { best.life = 0; this.events.push(['hit', Math.round(best.x), Math.round(best.y), g.w]); } this.fire(e, g, null, angleTo(e, best.x, best.y)); continue; }
        const f = [...this.ships.values()].find(s => s.fighterOf && this.isHostile(e, s) && Math.hypot(s.x - e.x, s.y - e.y) < p.range);
        if (f) this.fire(e, g, f, angleTo(e, f.x, f.y));
        continue;
      }
      if (p.bay && e.player) continue;   // 2.1: bays launch and recall on a tap of F (toggleDrones)
      const wantFire = e.player ? (g.sec ? inp.fire2 : inp.fire1) : !!t;
      if (!wantFire) continue;
      const tgt = t && !t.dead ? t : null;
      if (p.bay || p.homing) { if (tgt || !p.homing) this.fire(e, g, tgt, e.a); continue; }
      if (tgt) {
        const d = Math.hypot(tgt.x - e.x, tgt.y - e.y); if (!e.player && d > p.range * 1.05) continue;
        const tt = p.beam ? 0 : d / p.speed;
        const aim = angleTo(e, tgt.x + (tgt.vx - e.vx) * tt, tgt.y + (tgt.vy - e.vy) * tt);
        if (p.turret) { if (d < p.range * 1.1 || e.player) this.fire(e, g, tgt, aim); continue; }
        if (p.arc && Math.abs(angDiff(aim, e.a)) < p.arc) { this.fire(e, g, tgt, aim); continue; }
        if (!e.player && Math.abs(angDiff(aim, e.a)) > 0.18) continue;
      } else if (!e.player) continue;
      this.fire(e, g, tgt, e.a);
    }
  }
  damage(s, dA, dS, src, ion) {
    if (s.dead) return;
    const srcRoot = src ? this.root(src) : null;
    if (srcRoot && srcRoot !== this.root(s)) { const first = !this.root(s).aggro.has(srcRoot.id); this.root(s).aggro.add(srcRoot.id); if (!s.player && !s.target && s.ai !== 'flee') s.target = srcRoot; if (first && !s.owner) this.callHelp(s, srcRoot); }
    if (src && src.role && s.role) { const rm = roleMult(src.role, s.role); dA *= rm; dS *= rm; }   // the class triangle
    if (src && this.game.features.specialists.specMult) { const sm = this.game.features.specialists.specMult(this.root(src), src, s); dA *= sm; dS *= sm; }   // specialty ships
    const sh0 = s.shield, ar0 = s.armor, hadShield = s.shield > 0;
    if (s.shield > 0) { s.shield -= dS; if (s.shield < 0) { s.armor += s.shield * (dA / Math.max(1, dS)) * 0.5; s.shield = 0; } }
    else s.armor -= dA;
    s.hitT = this.t; if (src) s.lastHitBy = src.id;
    if (srcRoot && srcRoot.player && !s.player) this.game.onHit(srcRoot.player, s, this);
    const done = Math.max(0, sh0 - s.shield) + Math.max(0, ar0 - s.armor);
    if (s.boss) this.game.features.fronts.onBossDamage(s, srcRoot, done);
    if (srcRoot && srcRoot.player && this.root(s).player && !this.sys.arena && this.game.features.coop.duelHit && this.game.features.coop.duelHit(srcRoot, s, this)) return [done, hadShield ? 1 : 0, srcRoot.id];   // 2.6: a duel stops at disabled
    if (s.armor <= 0 && s.player && this.game.features.coop.rescueHold && this.game.features.coop.rescueHold(s, srcRoot, this)) return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0];   // 2.6: an Armada can rescue a downed captain
    if (s.armor <= 0) this.kill(s, srcRoot);
    return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0];
  }
  // hit event: x, y, weapon, target id, damage dealt, shooter (root) id, 1 if it hit shields
  hitEv(x, y, w, s, r) { this.events.push(['hit', Math.round(x), Math.round(y), w, s.id, Math.round(r[0]), r[2], r[1]]); }
  kill(s, by) {
    this.events.push(['boom', Math.round(s.x), Math.round(s.y), s.st.size]);
    this.remove(s);
    for (const f of this.ships.values()) if (f.fighterOf === s.id) f.ai = 'leave';
    if (s.player) { this.game.onPlayerDeath(s.player, this, by); return; }
    if (s.boss) this.game.features.fronts.onBossKilled(s, this);
    if (s.convoyOf) this.game.features.fronts.onConvoyLost(s);
    if (s.wingUid && this.game.features.docks.onWingLost) this.game.features.docks.onWingLost(s);   // 2.1
    if (s.wave) this.game.features.frontier.onWaveKill(s);
    if (this.game.features.hostile.maybeChest) this.game.features.hostile.maybeChest(this, s, by);
    if (by && by.player) this.game.onKill(by.player, s, this, s.lastHitBy && s.lastHitBy !== by.id);
    if (!s.fighterOf && Math.random() < (by && by.hull === 810 ? 0.82 : 0.55)) this.dropLoot(s);
  }
  dropLoot(s) {
    const str = s.strength || 10, items = [];
    items.push({ credits: Math.round(str * rnd(15, 40)) });
    if (Math.random() < 0.35) items.push({ mat: pick(MATERIALS), grade: Math.min(4, Math.floor(Math.random() * (1 + str / 300))) });
    for (const it of items) this.loot.push({ id: NEXT++, x: s.x + rnd(-30, 30), y: s.y + rnd(-30, 30), vx: s.vx * 0.3 + rnd(-20, 20), vy: s.vy * 0.3 + rnd(-20, 20), it, t: this.t, kind: it.mat ? 1 : 0 });
  }

  // ------------------------------------------------------------------ tick
  tick() {
    this.t += DT;
    if (!this.m || ++this.mT % 30 === 0) { this.m = this.game.features.fronts.mods ? this.game.features.fronts.mods(this.id) : null; this.mT = this.mT || 1; }
    const S = this.sys;
    if (this.players > 0 && !this.sys.arena) {
      this.spawnT -= DT;
      const SX = this.game.features.living.stateOf && this.game.features.living.stateOf(this.id), tm = SX ? (STATES[SX.kind].traders || 1) : 1;
      const want = Math.min(28, (6 + this.ports().length * 2 + S.stellars.length * 0.5 + S.danger * 1.5) * tm);   // 2.3: more traffic everywhere; 2.4: booms and festivals bring more
      const npcs = [...this.ships.values()].filter(e => !e.player && !e.owner).length;
      if (this.spawnT <= 0) { this.spawnT = rnd(2, 5); if (npcs < want) this.spawnTraffic(false); }
    }
    for (const e of this.ships.values()) {
      if (e.state === 'jumpout') {
        e.jumpT -= DT; const sp = e.st.maxSpeed * 3; e.vx = Math.sin(e.a) * sp; e.vy = -Math.cos(e.a) * sp; e.x += e.vx * DT; e.y += e.vy * DT;
        if (e.jumpT <= 0) this.game.finishJump(e, this);
        continue;
      }
      if (e.player) { const q = e.player.inputs; const inp = q.length ? q.shift() : e.player.lastInput; if (inp) { e.player.lastInput = inp; e.inp = inp; e.seq = inp.seq; } }
      else this.ai(e);
      const st = e.catchup ? { ...e.st, maxSpeed: Math.max(e.st.maxSpeed, e.catchup.maxSpeed * 1.15), accel: Math.max(e.st.accel, e.catchup.accel * 1.1), turn: Math.max(e.st.turn, e.catchup.turn) } : e.st;
      step(e, st, e.disabled ? {} : e.inp);
      e.shield = Math.min(e.st.shield, e.shield + e.st.shieldRe * DT * (this.t - (e.hitT || -9) > 2 ? 1 : 0.4) * (this.m ? this.m.shieldRe : 1) * (e.coopRe || 1));   // 2.6: coopRe is the Armada buff
      if (e.st.armorRe) e.armor = Math.min(e.st.armor, e.armor + e.st.armorRe * DT);
      if (e.st.fuelRe) e.fuel = Math.min(e.st.fuel, e.fuel + e.st.fuelRe * DT);
      if (!e.disabled) this.weapons(e);
      if (e.player && e.state === 'fly' && this.sys.gate && !(e.wormT > this.t)) for (const p of this.sys.stellars) if (p.wormhole && Math.hypot(p.x - e.x, p.y - e.y) < p.r * 0.5) { this.game.wormholeTransit(e, this, p); break; }
    }
    for (const s of this.shots) {
      if (s.target && !s.target.dead) {
        const want = angleTo(s, s.target.x, s.target.y), cur = Math.atan2(s.vx, -s.vy), d = angDiff(want, cur), sp = Math.hypot(s.vx, s.vy);
        const na = cur + Math.max(-3 * DT, Math.min(3 * DT, d)); s.vx = Math.sin(na) * sp; s.vy = -Math.cos(na) * sp;
      }
      s.x += s.vx * DT; s.y += s.vy * DT; s.life -= DT;
      if (s.life <= 0) continue;
      const owner = this.ships.get(s.owner);
      for (const e of this.ships.values()) {
        if (e.id === s.owner || e.state !== 'fly') continue;
        if (owner ? !this.canHit(owner, e) : false) continue;
        const r = Math.max(9, e.st.size * 0.32);
        if (Math.abs(e.x - s.x) < r && Math.abs(e.y - s.y) < r && Math.hypot(e.x - s.x, e.y - s.y) < r) {
          const r = this.damage(e, s.dmgA, s.dmgS, owner || null, s.p.ion); s.life = 0;
          this.hitEv(s.x, s.y, s.w, e, r);
          if (s.p.blast) this.events.push(['blast', Math.round(s.x), Math.round(s.y), s.p.blast]);
          if (s.p.blast) for (const o of this.ships.values()) if (o !== e && owner && this.canHit(owner, o) && Math.hypot(o.x - s.x, o.y - s.y) < s.p.blast) this.damage(o, s.dmgA * 0.5, s.dmgS * 0.5, owner);
          break;
        }
      }
      if (s.life > 0 && this.rocks.length) { const k = this.rockAt(s.x, s.y); if (k) { this.hitRock(k, s.dmgA + s.dmgS * 0.3, this.A.weapons[s.w] && this.A.weapons[s.w].mining); s.life = 0; this.events.push(['hit', Math.round(s.x), Math.round(s.y), s.w]); } }
    }
    this.shots = this.shots.filter(s => s.life > 0);
    this.beams = this.beams.filter(b => b.until > this.t && this.ships.has(b.id));
    for (const k of this.rocks) if (k.down && this.t > k.down) { k.down = 0; this.events.push(['rock', k.id, 100]); }
    for (const l of this.loot) { l.x += l.vx * DT; l.y += l.vy * DT; l.vx *= 0.99; l.vy *= 0.99; }
    this.loot = this.loot.filter(l => this.t - l.t < (l.it.ore ? 150 : 90));
    for (const e of this.ships.values()) if (e.player && e.state === 'fly') {
      const reach = Math.max(30, e.st.size * 0.5) * (e.hull === 810 ? 4 : 1);   // the Tidecaller's tractor tentacles
      for (const l of this.loot) if (!l.taken && Math.hypot(l.x - e.x, l.y - e.y) < reach) { if (this.game.onLoot(e.player, l.it) === false) continue; l.taken = true; this.events.push(['pickup', l.id]); }
    }
    this.loot = this.loot.filter(l => !l.taken);
  }
  snapshot() {
    const ships = [];
    for (const e of this.ships.values()) {
      const fl = (e.inp && e.inp.thrust ? 1 : 0) | (e.inp && e.inp.ab ? 2 : 0) | (e.disabled ? 4 : 0) | (e.state === 'jumpout' ? 8 : 0) | (e.player ? 16 : 0) | (e.elite ? 32 : 0) | (e.rival ? 64 : 0);
      ships.push([e.id, e.hull, Math.round(e.x), Math.round(e.y), Math.round(e.a * 1000), Math.round(e.vx), Math.round(e.vy), fl,
                  Math.round(100 * e.shield / Math.max(1, e.st.shield)), Math.round(100 * e.armor / Math.max(1, e.st.armor)), FAC.indexOf(e.faction),
                  e.player ? (this.sys.arena ? `${e.team === 'A' ? 'Azure' : 'Crimson'} · ` : '') + e.player.name : (e.name || null), e.owner || 0, e.pw || 0]);
    }
    const shots = this.shots.map(s => [Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), s.w]);
    const beams = this.beams.map(b => [b.id, Math.round(b.a * 1000), Math.round(b.len), b.w]);
    const loot = this.loot.map(l => [l.id, Math.round(l.x), Math.round(l.y), l.kind]);
    const ev = this.events; this.events = [];
    return { ships, shots, beams, loot, ev };
  }
}
