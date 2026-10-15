// Quantum Rift 0.7 "Frontier Life" server logic, mixed into Game: planetary colonies, station defense raids, ship
// mastery, the arena, the player exchange, leaderboards, captain profiles and browser notifications.
import { SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.js';
import { COLONY, COLONY_LEVELS, BUILDINGS, BUFF_CAP, DEFENSE, MASTERY, masteryTier, ARENA, arenaSystem, elo, EXCHANGE, BOARDS } from '../shared/frontier.js';
import { FrontsMixin } from './fronts.js';
import { credits } from '../shared/rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const comName = (id) => (COMMODITIES.find(c => c.id === id) || { name: id }).name;

export const FrontierMixin = {
  frontierInit() {
    const W = this.db.world; W.colonies = W.colonies || {}; W.orders = W.orders || []; W.nextOrder = W.nextOrder || 1;
    this.arenaQ = { '1v1': [], '2v2': [], '4v4': [] }; this.matches = {}; this.nextMatch = 1; this.waves = {};
  },
  // ------------------------------------------------------------------ bonuses: + ship mastery tier + colony buildings
  bonus(d) {
    const b = FrontsMixin.bonus.call(this, d);
    const tier = masteryTier((d.mastery || {})[d.ship.hull] || 0);
    for (const [k, v] of Object.entries(MASTERY.bonus[tier] || {})) b[k] = (b[k] || 0) + v;
    for (const [k, v] of Object.entries(this.colonyBuffs(d))) b[k] = (b[k] || 0) + v;
    if (this.A.ships[d.ship.hull] && this.A.ships[d.ship.hull].role === 'survey') b.miningPct = (b.miningPct || 0) + 50;   // survey ships mine better
    return b;
  },
  notify(s, title, body) { if (s) this.send(s, { t: 'notify', title, body }); },
  sessionOf(name) { for (const o of this.sessions.values()) if (o.data && o.data.name === name) return o; return null; },

  worldPayload() {
    const w = FrontsMixin.worldPayload.call(this), col = {};
    for (const [id, c] of Object.entries(this.db.world.colonies || {})) { const o = this.db.players[c.owner]; if (o) col[id] = o.name; }
    w.colonies = col; return w;
  },
  // ------------------------------------------------------------------ mastery
  mastery(s, amount) {
    const d = s.data; d.mastery = d.mastery || {}; const h = d.ship.hull, before = masteryTier(d.mastery[h] || 0);
    d.mastery[h] = Math.round(((d.mastery[h] || 0) + amount) * 10) / 10;
    const after = masteryTier(d.mastery[h]);
    if (after > before) { const H = this.A.ships[h]; this.toast(s, `Mastery: your ${H.name} reached Tier ${after}.${after === 5 ? ' Her hull now carries a gold trim.' : ''}`); this.log(d, `${H.name} reached mastery Tier ${after}.`); if (s.ent) s.ent.elite = after >= 5; }
  },

  // ------------------------------------------------------------------ colonies
  colonizable(p) { return !!(p && p.kind === 'planet' && !p.site && p.svc.includes('L') && FACTIONS[SYS[p.system].faction].region); },
  coloniesOf(d) { const k = this.db.key(d.name); return Object.entries(this.db.world.colonies).filter(([, c]) => c.owner === k); },
  colonyMax(d) { return d.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max; },
  colonyBuffs(d) {
    const out = {}; if (!this.db.world.colonies) return out;
    for (const [, c] of this.coloniesOf(d)) for (const b of c.buildings) { const B = BUILDINGS[b]; if (B && B.buff) for (const [k, v] of Object.entries(B.buff)) out[k] = Math.min(BUFF_CAP[k] || 99, (out[k] || 0) + v); }
    return out;
  },
  accrue(c) {
    const now = Date.now(), h = (now - (c.t || now)) / 3600000, L = COLONY_LEVELS[c.lv];
    c.store = c.store || {};
    for (const b of c.buildings) { const B = BUILDINGS[b]; if (!B || !B.produce) continue; for (const [k, v] of Object.entries(B.produce)) { const cap = v * L.mult * COLONY.storeHours; c.store[k] = Math.min(cap, (c.store[k] || 0) + v * L.mult * h); } }
    c.t = now;
  },
  colonyPayload(p, d) {
    if (!p) return null; const c = this.db.world.colonies[p.id];
    if (!c) return this.colonizable(p) ? { open: true } : null;
    this.accrue(c); const o = this.db.players[c.owner];
    return { owner: o ? o.name : '?', own: o && o.name === d.name, lv: c.lv, buildings: c.buildings, store: Object.fromEntries(Object.entries(c.store).map(([k, v]) => [k, Math.floor(v)])), name: c.name };
  },
  colonyOp(s, m) {
    const d = s.data, p = STELLARS[d.stellar]; if (!p || s.ent) return;
    const W = this.db.world, c = W.colonies[p.id], own = c && c.owner === this.db.key(d.name);
    switch (m.op) {
      case 'found': {
        if (!this.colonizable(p) || c) return this.toast(s, 'This world cannot be settled.');
        if (this.coloniesOf(d).length >= this.colonyMax(d)) return this.toast(s, `You can run ${this.colonyMax(d)} colonies${d.station.ops < 5 ? ' (3 at Ops 5)' : ''}.`);
        if (d.credits < COLONY.cost || !this.hasMats(d, COLONY.mats)) return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= COLONY.cost; this.takeMats(d, COLONY.mats);
        W.colonies[p.id] = { owner: this.db.key(d.name), lv: 1, buildings: [], store: {}, t: Date.now(), name: `${p.name} Colony` };
        this.log(d, `Founded a colony on ${p.name} (${SYS[p.system].name}).`);
        this.broadcast({ t: 'chat', from: '', msg: `${d.name} settled ${p.name} in ${SYS[p.system].name}.` });
        break;
      }
      case 'build': {
        if (!own) return; const B = BUILDINGS[m.kind]; if (!B) return;
        if (c.buildings.length >= COLONY_LEVELS[c.lv].slots) return this.toast(s, 'Every building slot is used. Upgrade the colony for more.');
        if (B.buff && c.buildings.includes(m.kind)) return this.toast(s, 'One of each buff building per colony.');
        if (d.credits < B.cost) return this.toast(s, 'Not enough credits.');
        this.accrue(c); d.credits -= B.cost; c.buildings.push(m.kind); this.toast(s, `${B.name} built.`); break;
      }
      case 'demolish': { if (!own) return; this.accrue(c); c.buildings.splice(m.i | 0, 1); break; }
      case 'upgrade': {
        if (!own) return; const L = COLONY_LEVELS[c.lv + 1]; if (!L) return;
        if (d.credits < L.cost || !this.hasMats(d, L.mats)) return this.toast(s, 'You need the credits and materials listed.');
        this.accrue(c); d.credits -= L.cost; this.takeMats(d, L.mats); c.lv++; this.toast(s, `Colony upgraded to level ${c.lv}.`); this.log(d, `${c.name} reached level ${c.lv}.`); break;
      }
      case 'collect': {
        if (!own) return; this.accrue(c);
        const st = this.stats(d); let room = st.cargo - Object.values(d.cargo).reduce((a, b) => a + b, 0); const got = [];
        if (c.store.credits >= 1) { const cr = Math.floor(c.store.credits); d.credits += cr; d.stats.earned += cr; c.store.credits -= cr; got.push(`${credits(cr)} cr`); }
        for (const [k, v] of Object.entries(c.store)) { if (k === 'credits') continue; const n = Math.min(Math.floor(v), room); if (n <= 0) continue; d.cargo[k] = (d.cargo[k] || 0) + n; c.store[k] -= n; room -= n; got.push(`${n} t ${comName(k)}`); }
        this.toast(s, got.length ? `Collected ${got.join(', ')}.` : 'Nothing to collect (or no cargo room).'); break;
      }
      case 'abandon': { if (!own) return; delete W.colonies[p.id]; this.log(d, `Abandoned the colony on ${p.name}.`); break; }
      default: return;
    }
    this.db.touch(); this.you(s); this.landed(s); this.pushWorld();
  },

  // ------------------------------------------------------------------ station defense
  defenseRating(d) { const S = d.station; return DEFENSE.levels[S.defense || 0].rating + S.ops * DEFENSE.opsRating + (S.ops >= 5 ? DEFENSE.gridBonus : 0); },
  defenseUpgrade(s) {
    const d = s.data, S = d.station, L = DEFENSE.levels[(S.defense || 0) + 1]; if (!L) return this.toast(s, 'Station defenses are at their maximum.');
    if (d.credits < L.cost || !this.hasMats(d, L.mats)) return this.toast(s, 'You need the credits and materials listed.');
    d.credits -= L.cost; this.takeMats(d, L.mats); S.defense = (S.defense || 0) + 1; this.toast(s, `Defense turrets upgraded to level ${S.defense}.`);
  },
  raidStrength(d, win) { const S = SYS[STELLARS[d.station.site].system]; let h = 0; for (const c of d.name + win) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 150 + d.station.ops * 150 + (h % 300) + S.danger * 80; },
  raidCheck(s) {
    const d = s.data, S = d.station; if (!S.site || S.ops < DEFENSE.minOps || this.waves[d.name]) return;
    const win = Math.floor(Date.now() / (DEFENSE.everyH * 3600000)); if (S.raidWin === undefined) { S.raidWin = win; return; }
    if (S.raidWin >= win) return;
    S.raidWin = win;
    const strength = this.raidStrength(d, win), site = STELLARS[S.site];
    if (s.ent && d.sys === site.system) return this.startWave(s, strength);
    this.resolveRaid(s, strength, false);
  },
  startWave(s, strength) {
    const d = s.data, site = STELLARS[d.station.site], sp = this.spaces[site.system], n = clamp(Math.round(strength / 160), 2, 8), ids = new Set();
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2, fac = i % 3 === 2 && strength > 900 ? 'umbral' : 'hollow', pool = fac === 'umbral' ? [761, 762] : [705, 708, 711, 716];
      const e = sp.makeShip({ hull: pool[i % pool.length], faction: fac, x: site.x + Math.cos(ang) * 1400, y: site.y + Math.sin(ang) * 1400, ai: 'raid', name: i === 0 ? 'Raid Leader' : null });
      e.wave = d.name; e.life = 1e9; e.target = s.ent; ids.add(e.id); sp.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    }
    this.waves[d.name] = { ids, until: Date.now() + DEFENSE.waveMin * 60000, strength, sys: site.system };
    this.toast(s, `RAID: ${n} raiders are closing on your Personal Station. Drive them off!`); this.notify(s, 'Station under attack', `${n} raiders are attacking your Personal Station.`);
  },
  onWaveKill(e) {
    const w = this.waves[e.wave]; if (!w) return; w.ids.delete(e.id);
    if (!w.ids.size) { delete this.waves[e.wave]; const s = this.sessionOf(e.wave); if (s) this.resolveRaid(s, w.strength, true); }
  },
  waveTick() {
    for (const [name, w] of Object.entries(this.waves)) if (Date.now() > w.until) {
      delete this.waves[name]; const sp = this.live[w.sys];
      if (sp) for (const id of w.ids) { const e = sp.ships.get(id); if (e) sp.remove(e, 'jump'); }
      const s = this.sessionOf(name); if (s) this.resolveRaid(s, w.strength * Math.max(0.3, w.ids.size / 4), false);
    }
  },
  resolveRaid(s, strength, foughtOff) {
    const d = s.data, rating = this.defenseRating(d), win = foughtOff || Math.random() < rating / (rating + strength);
    if (win) {
      const cr = Math.round(strength * (foughtOff ? 60 : 30) * (this.flying && this.flying(d, 'bulwark') ? 2 : 1)); d.credits += cr; d.stats.earned += cr; if (this.specOnRaid) this.specOnRaid(s, true);
      let extra = ''; if (foughtOff || Math.random() < 0.4) { const mt = MATERIALS[Math.floor(Math.random() * 3)], g = clamp(Math.floor(strength / 500), 0, 3); d.mats[mt][g]++; extra = ` and a ${mt} ${GRADES[g]} crate`; }
      const msg = foughtOff ? `You drove off the raid on your station: ${credits(cr)} credits salvage${extra}.` : `Your station's turrets repelled a raid (defense ${rating} vs ${strength}): ${credits(cr)} credits salvage${extra}.`;
      this.toast(s, msg); this.log(d, msg); this.notify(s, 'Raid repelled', msg);
    } else {
      const lost = [];
      for (const m of MATERIALS) for (let g = 0; g < 2; g++) { const n = Math.floor(d.mats[m][g] * 0.2); if (n) { d.mats[m][g] -= n; lost.push(`${n} ${m} ${GRADES[g]}`); } }
      d.station.refUnits = 0;
      const msg = `Raiders broke through your station's defenses (defense ${rating} vs ${strength}) and looted the refinery${lost.length ? ' and ' + lost.join(', ') : ''}. Upgrade the turrets.`;
      this.toast(s, msg); this.log(d, msg); this.notify(s, 'Station raided', msg);
    }
    this.db.touch(); this.you(s);
  },

  // ------------------------------------------------------------------ the arena
  arenaOp(s, m) {
    const d = s.data;
    if (m.op === 'queue') {
      if (s.ent || !d.stellar) return this.toast(s, 'Queue for the arena while docked.');
      if (!ARENA.modes[m.mode]) return;
      for (const q of Object.values(this.arenaQ)) { const i = q.indexOf(s.id); if (i >= 0) q.splice(i, 1); }
      this.arenaQ[m.mode].push(s.id); this.toast(s, `Queued for ${m.mode}. You will be pulled into the Crucible when a match is ready.`);
      this.tryMatch(m.mode);
    } else if (m.op === 'leave') { for (const q of Object.values(this.arenaQ)) { const i = q.indexOf(s.id); if (i >= 0) q.splice(i, 1); } this.toast(s, 'Left the arena queue.'); }
    this.you(s);
  },
  arenaPayload(d, s) { d.arena = d.arena || { rating: ARENA.start, w: 0, l: 0 }; const q = Object.entries(this.arenaQ).find(([, q]) => q.includes(s.id)); return { ...d.arena, queued: q ? q[0] : null, sizes: Object.fromEntries(Object.entries(this.arenaQ).map(([k, v]) => [k, v.length])) }; },
  tryMatch(mode) {
    const n = ARENA.modes[mode], q = this.arenaQ[mode];
    for (let i = q.length - 1; i >= 0; i--) { const o = this.sessions.get(q[i]); if (!o || o.ent || !o.data || !o.data.stellar) q.splice(i, 1); }
    if (q.length < n * 2) return null;
    const ids = q.splice(0, n * 2).map(id => this.sessions.get(id)).sort((a, b) => ((b.data.arena || {}).rating || 1000) - ((a.data.arena || {}).rating || 1000));
    const A = [], B = []; ids.forEach((o, i) => ((i % 4 === 0 || i % 4 === 3) ? A : B).push(o));   // snake draft by rating
    const id = `arena-${this.nextMatch++}`; SYS[id] = arenaSystem(id);
    const sp = this.spaces[id]; sp.keep = true;
    const match = this.matches[id] = { id, mode, sp, teams: { A: A.map(o => o.data.name), B: B.map(o => o.data.name) }, until: Date.now() + ARENA.matchMin * 60000, alive: new Set() };
    for (const [team, list, side] of [['A', A, -1], ['B', B, 1]]) list.forEach((o, i) => {
      const d = o.data; d.arenaReturn = d.stellar; d.stellar = null; d.sys = id;
      this.spawnPlayer(o, side * ARENA.size / 2, (i - (list.length - 1) / 2) * 160, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      for (const x of [...sp.ships.values()]) if (x.owner === o.ent.id) sp.remove(x);   // no escorts in the Crucible
      o.ent.team = team; o.ent.arena = id; match.alive.add(d.name);
      this.send(o, { t: 'arena', id, team, teams: match.teams, until: match.until });
      this.toast(o, `ARENA ${mode}: you fight for team ${team === 'A' ? 'Azure' : 'Crimson'}. Last team flying wins.`); this.notify(o, 'Arena match found', `${mode} in the Crucible. Good hunting.`);
    });
    return match;
  },
  // a captain leaves the arena: back to where they queued, ship repaired, no insurance fee
  arenaExit(o, match, died) {
    const d = o.data, sp = match.sp;
    if (o.ent) { for (const x of [...sp.ships.values()]) if (x.owner === o.ent.id) sp.remove(x); if (!died) sp.remove(o.ent, 'jump'); sp.players--; o.ent = null; }
    match.alive.delete(d.name);
    d.stellar = d.arenaReturn && STELLARS[d.arenaReturn] ? d.arenaReturn : 'qstation'; d.sys = STELLARS[d.stellar].system; d.arenaReturn = null; d.fuel = undefined; d.shieldNow = d.armorNow = undefined;
    this.send(o, { t: 'arena', id: null }); this.you(o); this.landed(o);
  },
  onArenaDeath(o, space) {
    const match = this.matches[space.id]; if (!match) return false;
    this.toast(o, 'Your ship was knocked out of the match. The arena crew patched her up for free.');
    this.arenaExit(o, match, true); this.arenaCheck(match); return true;
  },
  arenaCheck(match) {
    const alive = (t) => match.teams[t].filter(n => match.alive.has(n));
    const a = alive('A'), b = alive('B'), timeUp = Date.now() > match.until;
    if (a.length && b.length && !timeUp) return;
    let winner = !a.length ? 'B' : !b.length ? 'A' : null;
    if (!winner) {   // time: the side with more hull and shield left wins
      const hp = (names) => names.reduce((t, n) => { const o = this.sessionOf(n); return t + (o && o.ent ? o.ent.armor / o.ent.st.armor + o.ent.shield / Math.max(1, o.ent.st.shield) : 0); }, 0);
      winner = hp(a) >= hp(b) ? 'A' : 'B';
    }
    const rating = (names) => names.reduce((t, n) => t + ((this.db.get(n) || {}).arena || { rating: ARENA.start }).rating, 0) / Math.max(1, names.length);
    const rA = rating(match.teams.A), rB = rating(match.teams.B);
    for (const t of ['A', 'B']) for (const n of match.teams[t]) {
      const p = this.db.get(n); if (!p) continue; p.arena = p.arena || { rating: ARENA.start, w: 0, l: 0 };
      const won = t === winner, delta = elo(t === 'A' ? rA : rB, t === 'A' ? rB : rA, won);
      p.arena.rating = Math.max(100, p.arena.rating + delta); won ? p.arena.w++ : p.arena.l++;
      const cr = won ? 15000 * ARENA.modes[match.mode] : 3000; p.credits += cr;
      const o = this.sessionOf(n); if (o) this.toast(o, `Arena: team ${winner === 'A' ? 'Azure' : 'Crimson'} wins. Rating ${delta >= 0 ? '+' : ''}${delta} (now ${p.arena.rating}), ${credits(cr)} credits.`);
      this.log(p, `Arena ${match.mode}: ${won ? 'won' : 'lost'} (rating ${p.arena.rating}).`);
    }
    for (const n of [...match.alive]) { const o = this.sessionOf(n); if (o) this.arenaExit(o, match, false); }
    match.sp.keep = false; delete this.matches[match.id]; delete this.live[match.id];
    this.db.touch();
  },
  arenaTick() { for (const m of Object.values(this.matches)) this.arenaCheck(m); for (const mode of Object.keys(this.arenaQ)) this.tryMatch(mode); },

  // ------------------------------------------------------------------ the exchange (player market): escrowed orders, matched by price
  exchangeOp(s, m) {
    const d = s.data, p = STELLARS[d.stellar], W = this.db.world;
    if (!p || s.ent || !(p.hub || (p.svc.includes('T') && !p.site))) return this.toast(s, 'The exchange is open at market worlds.');
    d.storage = d.storage || {};
    switch (m.op) {
      case 'place': {
        const side = m.side === 'buy' ? 'buy' : 'sell', qty = Math.max(1, Math.min(9999, m.qty | 0)), price = Math.max(1, Math.min(EXCHANGE.maxPrice, Math.round(+m.price || 0)));
        let item;
        if (m.kind === 'mat' && MATERIALS.includes(m.mat) && m.grade >= 0 && m.grade <= 4) item = { kind: 'mat', mat: m.mat, grade: m.grade | 0 };
        else if (m.kind === 'com' && COMMODITIES.some(c => c.id === m.cid)) item = { kind: 'com', cid: m.cid };
        else return;
        if (W.orders.filter(o => o.owner === d.name).length >= EXCHANGE.maxOrders) return this.toast(s, `You can have ${EXCHANGE.maxOrders} open orders.`);
        if (side === 'sell') {   // escrow the goods
          if (item.kind === 'mat') { if (d.mats[item.mat][item.grade] < qty) return this.toast(s, 'You do not have that many crates.'); d.mats[item.mat][item.grade] -= qty; }
          else { if ((d.cargo[item.cid] || 0) < qty) return this.toast(s, 'You do not have that much in your hold.'); d.cargo[item.cid] -= qty; if (!d.cargo[item.cid]) delete d.cargo[item.cid]; }
        } else { if (d.credits < qty * price) return this.toast(s, 'Not enough credits to back that order.'); d.credits -= qty * price; }
        const order = { id: W.nextOrder++, owner: d.name, side, item, qty, price, t: Date.now() };
        this.matchOrder(order);
        if (order.qty > 0) { W.orders.push(order); this.toast(s, `Order placed: ${side} ${order.qty} ${this.itemName(item)} at ${credits(price)}.`); }
        break;
      }
      case 'cancel': {
        const o = W.orders.find(x => x.id === m.id && x.owner === d.name); if (!o) return;
        this.refundOrder(o); W.orders = W.orders.filter(x => x !== o); this.toast(s, 'Order cancelled.'); break;
      }
      case 'collect': {
        const st = this.stats(d); let room = st.cargo - Object.values(d.cargo).reduce((a, b) => a + b, 0), got = 0;
        for (const [k, v] of Object.entries(d.storage)) { const n = Math.min(v, room); if (n <= 0) continue; d.cargo[k] = (d.cargo[k] || 0) + n; d.storage[k] -= n; if (!d.storage[k]) delete d.storage[k]; room -= n; got += n; }
        this.toast(s, got ? `Loaded ${got} t from exchange storage.` : 'Nothing in storage, or no room.'); break;
      }
      case 'transfer': {   // send credits to another captain
        const to = this.db.get(String(m.to || '')), n = Math.max(0, Math.min(d.credits, m.n | 0));
        if (!to || to.name === d.name) return this.toast(s, 'No captain by that name.'); if (n < 1000) return this.toast(s, 'Transfers start at 1,000 credits.');
        d.credits -= n; to.credits += n; this.log(to, `Received ${credits(n)} credits from ${d.name}.`); this.log(d, `Sent ${credits(n)} credits to ${to.name}.`);
        const o = this.sessionOf(to.name); if (o) { this.toast(o, `${d.name} sent you ${credits(n)} credits.`); this.you(o); }
        this.toast(s, `Sent ${credits(n)} credits to ${to.name}.`); break;
      }
      default: return;
    }
    this.db.touch(); this.you(s); this.landed(s);
  },
  itemName(it) { return it.kind === 'mat' ? `${it.mat} ${GRADES[it.grade]}` : comName(it.cid); },
  sameItem(a, b) { return a.kind === b.kind && (a.kind === 'mat' ? a.mat === b.mat && a.grade === b.grade : a.cid === b.cid); },
  deliver(name, it, qty) {   // goods to a buyer: crates straight in, commodities to exchange storage
    const p = this.db.get(name); if (!p) return;
    if (it.kind === 'mat') p.mats[it.mat][it.grade] += qty; else { p.storage = p.storage || {}; p.storage[it.cid] = (p.storage[it.cid] || 0) + qty; }
  },
  pay(name, n) { const p = this.db.get(name); if (p) { p.credits += n; p.stats.earned += n; } },
  refundOrder(o) { if (o.side === 'sell') this.deliver(o.owner, o.item, o.qty); else this.pay(o.owner, o.qty * o.price); },
  matchOrder(order) {
    const W = this.db.world;
    const book = W.orders.filter(o => o.side !== order.side && this.sameItem(o.item, order.item) && o.owner !== order.owner && (order.side === 'buy' ? o.price <= order.price : o.price >= order.price))
      .sort((a, b) => order.side === 'buy' ? a.price - b.price || a.t - b.t : b.price - a.price || a.t - b.t);
    for (const o of book) {
      if (!order.qty) break;
      const n = Math.min(order.qty, o.qty), price = o.price, buyer = order.side === 'buy' ? order : o, seller = order.side === 'buy' ? o : order;
      this.deliver(buyer.owner, order.item, n);
      this.pay(seller.owner, Math.round(n * price * (1 - EXCHANGE.fee)));
      if (buyer === order && order.price > price) this.pay(order.owner, n * (order.price - price));   // the buyer escrowed at their own price
      order.qty -= n; o.qty -= n;
      for (const nm of [buyer.owner, seller.owner]) { const ss = this.sessionOf(nm); if (ss) { this.toast(ss, `Exchange: ${nm === buyer.owner ? 'bought' : 'sold'} ${n} ${this.itemName(order.item)} at ${credits(price)}.`); this.notify(ss, 'Exchange order filled', `${n} ${this.itemName(order.item)} at ${credits(price)}`); this.you(ss); } }
    }
    W.orders = W.orders.filter(o => o.qty > 0);
  },
  exchangePayload(d) {
    const book = {};
    for (const o of this.db.world.orders) { const k = o.item.kind === 'mat' ? `mat:${o.item.mat}:${o.item.grade}` : `com:${o.item.cid}`; const b = book[k] = book[k] || { item: o.item, bid: 0, ask: 0, bids: 0, asks: 0 };
      if (o.side === 'buy') { b.bid = Math.max(b.bid, o.price); b.bids += o.qty; } else { b.ask = b.ask ? Math.min(b.ask, o.price) : o.price; b.asks += o.qty; } }
    return { book: Object.values(book), mine: this.db.world.orders.filter(o => o.owner === d.name), storage: d.storage || {} };
  },

  // ------------------------------------------------------------------ leaderboards and profiles
  leaderboard(cat) {
    const all = Object.values(this.db.players), vals = {
      earned: p => (p.stats && p.stats.earned) || 0, kills: p => (p.stats && p.stats.kills) || 0, mined: p => (p.stats && p.stats.mined) || 0,
      arena: p => (p.arena && (p.arena.w + p.arena.l) ? p.arena.rating : 0), station: p => (p.station && p.station.ops) || 0,
      colonies: p => this.coloniesOf(p).length, mastery: p => Object.values(p.mastery || {}).reduce((a, b) => a + b, 0),
    }; const val = Object.prototype.hasOwnProperty.call(vals, cat) ? vals[cat] : null;
    if (!val) return [];
    return all.map(p => ({ name: p.name, fleet: null, v: Math.round(val(p)) })).concat(this.rivalBoard ? this.rivalBoard(cat) : []).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 20);   // 1.1: rival captains compete too
  },
  profile(name) {
    const p = this.db.get(String(name || '')); if (!p) return null;
    const top = Object.entries(p.mastery || {}).sort((a, b) => b[1] - a[1])[0];
    return { name: p.name, fleet: null, ship: this.A.ships[p.ship.hull].name, shipName: p.ship.name, ops: p.station.ops, site: p.station.site ? SYS[STELLARS[p.station.site].system].name : null,
             colonies: this.coloniesOf(p).map(([id]) => STELLARS[id].name), kills: p.stats.kills, earned: p.stats.earned, jumps: p.stats.jumps, mined: p.stats.mined || 0,
             arena: p.arena || null, mastery: top ? { ship: this.A.ships[top[0]].name, tier: masteryTier(top[1]) } : null, officers: (p.officers || []).length, online: !!this.sessionOf(p.name), created: p.created || null };
  },
};
