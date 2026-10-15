// Quantum Rift shared rules: stat conversion, loadouts, crew and research bonuses, flight physics, prices.
import { COMMODITIES, FACTIONS, RESEARCH, EXTRA_OUTFITS , EXTRA_WEAPONS, MINING_WEAPONS, MK2_OF, MK3_OF, ARMADA_HULLS } from "./galaxy.js";
import { SHIPS23 } from './ships23.js';
import { ROLES, RARITY, STAT_BASE, SYNERGY, BRIDGE_SLOTS } from "./hangar.js";
import { roleOf } from "./roles.js";
import { SPRITES } from './sprites26.js';
import { SPECIALISTS } from "./specialty.js";
import { RANK_MULT, TRAITS, LOWER_DECK } from "./syndicate.js";

export const TICK = 30;                 // simulation steps per second
export const DT = 1 / TICK;
// EV Nova units -> Rift units
export const K = { speed: 0.45, accel: 0.55, turn: 3.0, shot: 0.45, shieldRe: 0.08, armorRe: 0.6, beamDps: 14, jumpFuel: 100, jumpClear: 1100 };

// Add Quantum Rift's own weapons to the exported asset data (safe to call more than once)
export function augmentAssets(A) {
  for (const w of EXTRA_WEAPONS) if (!A.weapons[w.id]) A.weapons[w.id] = w;
  for (const id of MINING_WEAPONS) if (A.weapons[id]) A.weapons[id].mining = true;
  for (const S of SPECIALISTS) if (!A.ships[S.id]) A.ships[S.id] = { ...S, img: `ships/${S.id}_yard.png` };   // 0.8: specialty ships
  for (const S of SHIPS23) if (!A.ships[S.id]) A.ships[S.id] = { ...S };   // 2.3: new common Quantum hulls
  for (const H of Object.values(A.ships)) H.role = roleOf(H, A.weapons);   // 0.8: class triangle roles
  for (const M of [MK2_OF, MK3_OF]) for (const [b, mk] of Object.entries(M)) if (A.ships[b] && A.ships[mk]) A.ships[mk].role = A.ships[b].role;   // refits keep their role
  for (const id of [...Object.values(MK2_OF), ...Object.values(MK3_OF), ...ARMADA_HULLS]) if (A.ships[id]) A.ships[id].npcOnly = true;   // 2.6: enemy ships only
  for (const [id, s] of Object.entries(SPRITES)) if (A.ships[id]) A.ships[id].spr = s;   // 2.6: sharper sheets with banking
  return A;
}
export function allOutfits(A) {
  const o = { ...A.outfits };
  for (const e of EXTRA_OUTFITS) o[e.id] = e;
  return o;
}

// A player's new ship: the hull's built-in weapons become ordinary outfits (so they can be sold or swapped) where an
// outfit exists for them; anything else (fighter bays, special guns) stays fixed. Their mass is refunded as space.
export function makeLoadout(A, hull, name) {
  const O = allOutfits(A), H = A.ships[hull], byWeapon = {};
  for (const o of Object.values(O)) if (o.eff && o.eff.weapon && !(o.eff.weapon in byWeapon)) byWeapon[o.eff.weapon] = o;
  const L = { hull, outfits: {}, ammo: {}, fixed: [], bonusSpace: 0, name: name || 'Rift Runner' };
  for (const [w, n, a] of H.weapons) {
    const o = byWeapon[w];
    if (o) { L.outfits[o.id] = (L.outfits[o.id] || 0) + n; L.bonusSpace += (o.mass || 0) * n; } else L.fixed.push([w, n, a]);
    if (a) L.ammo[w] = (L.ammo[w] || 0) + a;
  }
  return L;
}
// The ship a player is flying: hull + bought outfits (+ research bonuses) -> live stats.
export function shipStats(A, ship, bonus = {}) {
  const H = A.ships[ship.hull]; if (!H) return null;
  const O = allOutfits(A);
  let shield = H.shield, armor = H.armor, accel = H.accel, speed = H.speed, turn = H.turn, cargo = H.cargo, fuel = H.fuel,
      shieldRe = H.shieldRe, armorRe = H.armorRe, fuelRe = H.fuelRe, used = 0, guns = 0, turrets = 0, afterburner = 0, cloak = 0, multiJump = 1, jumpFast = H.fastJump ? 1 : 0;
  const weapons = {};   // weapon id -> count
  const builtIn = ship.fixed !== undefined ? ship.fixed : H.weapons;
  for (const [w, n] of builtIn) weapons[w] = (weapons[w] || 0) + n;
  for (const [id, n] of Object.entries(ship.outfits || {})) {
    const o = O[id]; if (!o || !n) continue;
    used += (o.mass || 0) * n;
    const e = o.eff || {};
    if (e.weapon) { weapons[e.weapon] = (weapons[e.weapon] || 0) + n; if (o.turret) turrets += n; else guns += n; }
    shield += (e.shield || 0) * n; armor += (e.armor || 0) * n; accel += (e.accel || 0) * n; speed += (e.speed || 0) * n;
    turn += (e.turn || 0) * n; cargo += (e.cargo || 0) * n; fuel += (e.fuel || 0) * n; shieldRe += (e.shieldRe || 0) * n;
    armorRe += (e.armorRe || 0) * n; fuelRe += (e.fuelRe || 0) * n; afterburner = Math.max(afterburner, e.afterburner || 0);
    if (e.cloak) cloak = 1; if (e.multiJump) multiJump = Math.max(multiJump, e.multiJump); if (e.jumpSpeed) jumpFast = 1;
  }
  shield *= 1 + (bonus.shieldPct || 0) / 100; armor *= 1 + (bonus.armorPct || 0) / 100; speed *= 1 + (bonus.speedPct || 0) / 100;
  turn *= 1 + (bonus.turnPct || 0) / 100; accel *= 1 + (bonus.accelPct || 0) / 100; cargo = Math.round(cargo * (1 + (bonus.cargoPct || 0) / 100));
  shieldRe *= 1 + (bonus.shieldRePct || 0) / 100; fuelRe += (bonus.fuelRe || 0) * 30;
  fuel += bonus.fuel || 0; if (bonus.jumpFast) jumpFast = 1;
  return {
    hull: H.id, name: H.name, size: H.size, mass: H.mass,
    maxSpeed: speed * K.speed, accel: accel * K.accel, turn: turn * K.turn * Math.PI / 180,
    shield: Math.round(shield), armor: Math.round(armor), shieldRe: Math.max(0.5, shieldRe * K.shieldRe), armorRe: armorRe * K.armorRe,
    fuel, fuelRe: fuelRe / 30, cargo, space: H.space + (ship.bonusSpace || 0), used, free: H.space + (ship.bonusSpace || 0) - used, guns, turrets, maxGuns: H.guns, maxTurrets: H.turrets,
    afterburner, cloak, multiJump, jumpFast, weapons, damageMul: 1 + (bonus.damagePct || 0) / 100,
  };
}

export function researchBonus(station) {
  const b = {};
  for (const r of RESEARCH) if (station && station.done && station.done.includes(r.id)) for (const [k, v] of Object.entries(r.bonus)) b[k] = (b[k] || 0) + v;
  return b;
}
// one officer's stat values: base x rarity, +10% per level above 1
export function officerStats(o) {
  const out = {}, R = ROLES[o.role], mult = RARITY[o.rarity].mult * (1 + 0.1 * (o.lv - 1)) * RANK_MULT(o.rank);   // 1.2: rank adds 12% each
  for (const k of R.stats) out[k] = Math.round(STAT_BASE[k] * mult * 10) / 10;
  return out;
}
// bridge officers (captain slot counts 1.25x) plus race synergy when two or more of a race share the bridge
export function officerBonus(officers, bridge) {
  const b = {}, races = {};
  if (!officers || !bridge) return b;
  for (const slot of BRIDGE_SLOTS) {
    const o = officers.find(x => x.id === bridge[slot]); if (!o) continue;
    const k = slot === 'captain' ? 1.25 : 1;
    for (const [s, v] of Object.entries(officerStats(o))) b[s] = (b[s] || 0) + v * k;
    for (const t of o.traits || []) if (TRAITS[t]) for (const [s, v] of Object.entries(TRAITS[t].bonus)) b[s] = (b[s] || 0) + v;   // 1.2: traits
    races[o.race] = (races[o.race] || 0) + 1;
  }
  for (const [r, n] of Object.entries(races)) if (n >= 2 && SYNERGY[r]) for (const [s, v] of Object.entries(SYNERGY[r])) b[s] = (b[s] || 0) + v;
  return b;
}
// everything that modifies a captain's ship: research + bridge crew
export function captainBonus(d) {
  const b = researchBonus(d.station), o = officerBonus(d.officers, d.bridge);
  for (const [k, v] of Object.entries(o)) b[k] = (b[k] || 0) + v;
  for (const c of d.lower || []) if (LOWER_DECK[c]) for (const [k, v] of Object.entries(LOWER_DECK[c].bonus)) b[k] = (b[k] || 0) + v;   // 1.2: lower-deck crew
  return b;
}

// Weapon parameters in Rift units
export function weaponParams(w) {
  const beam = w.type === 'beam' || w.type === 'turretbeam' || w.type === 'pdbeam';
  const speed = Math.max(200, (w.speed || 1000) * K.shot);
  const life = Math.max(0.4, (w.duration || 30) / 30 * 1.4);
  return {
    beam, speed, life, range: beam ? (w.beamLen || 360) : speed * life,
    reload: Math.max(1, w.reload || 1) / 30,
    turret: w.type === 'turret' || w.type === 'turretbeam' || w.type === 'pd' || w.type === 'pdbeam',
    arc: w.type === 'frontturret' ? Math.PI / 6 : (w.type === 'rearturret' ? Math.PI / 6 : 0),
    homing: w.type === 'homing', pd: w.type === 'pd' || w.type === 'pdbeam', bay: w.type === 'bay', rocket: w.type === 'rocket',
    inacc: (w.inacc || 0) * Math.PI / 180,
    dmgA: Math.max(0, w.dmgA || 0), dmgS: Math.max(0, w.dmgS || 0), continuous: beam && !(w.reload > 0),
    color: weaponColor(w), look: weaponLook(w), blast: w.blast || 0, ion: w.ion || 0,
  };
}
export const BEAM_COLORS = { 146: '#ff4a4a', 331: '#7ad0ff', 334: '#ffc070', 337: '#ffe0a0', 338: '#7ae8ff', 343: '#d050a0', 346: '#ff70f0',
  348: '#70ffff', 349: '#a070ff', 355: '#70ffe0', 128: '#7affb0', 129: '#7affb0', 130: '#7affb0', 131: '#7affb0', 132: '#ffaa50', 330: '#ffb060',
  339: '#e8f8ff', 341: '#c0f0ff', 344: '#a8ff40', 345: '#ff7a20', 347: '#d0b080', 156: '#c0d8ff', 157: '#c0d8ff', 158: '#c0d8ff', 197: '#c0d8ff',
  143: '#ff9040', 162: '#ff9040', 161: '#ffe060', 181: '#d0d0ff' };
// Sound for each weapon: EV Quantum's own sounds where the weapon has one, otherwise the closest match from the pack
export function weaponSound(w) {
  if (w.sound >= 36) return 200 + w.sound;
  const p = weaponParams(w);
  if (p.homing) return 238; if (p.beam) return 240; if (p.pd) return 236; if (p.bay) return 239;
  return (w.dmgA + w.dmgS) > 40 ? 241 : 236;
}

// Flight: one fixed step. input: {thrust: 0/1, turn: -1/0/1, ab: 0/1, rev: 0/1}
export function step(e, st, inp, dt = DT) {
  if (inp.rev) {   // turn to face against the direction of travel
    const want = wrap(Math.atan2(e.vx, -e.vy) + Math.PI); let d = angDiff(want, e.a);
    const t = st.turn * dt; e.a += Math.abs(d) < t ? d : Math.sign(d) * t;
  } else e.a += (inp.turn || 0) * st.turn * dt;
  e.a = wrap(e.a);
  let acc = inp.thrust ? st.accel : 0, max = st.maxSpeed;
  if (inp.ab && st.afterburner && e.fuel > 0) { acc *= 1.8; max *= 1.4; e.fuel -= 0.3; }
  if (acc) { e.vx += Math.sin(e.a) * acc * dt; e.vy -= Math.cos(e.a) * acc * dt; }
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > max) { const k = Math.max(max / sp, 1 - 2 * dt); e.vx *= k; e.vy *= k; }
  e.x += e.vx * dt; e.y += e.vy * dt;
}
export function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
export function angDiff(a, b) { return wrap(a - b); }
export function angleTo(e, x, y) { return Math.atan2(x - e.x, -(y - e.y)); }   // 0 = up, clockwise

// Prices at a stellar for a commodity (level -1 / 0 / 1), with a slow drift by time so markets move
export function price(stellar, cid, t = Date.now()) {
  const c = COMMODITIES.find(c => c.id === cid); const lv = stellar.prices && stellar.prices[cid];
  if (lv === undefined || !c) return null;
  const drift = 1 + 0.06 * Math.sin(t / 3.6e6 + cid.length * 1.7 + stellar.id.length);
  return Math.round(c.base * (1 + 0.28 * lv) * drift);
}
export function hostileFactions(a, b) {
  if (!a || !b || a === b) return false;
  return (FACTIONS[a] && FACTIONS[a].hostile.includes(b)) || (FACTIONS[b] && FACTIONS[b].hostile.includes(a));
}
export function repLabel(v) { return v >= 50 ? 'Honored' : v >= 20 ? 'Friendly' : v > -20 ? 'Neutral' : v > -50 ? 'Wanted' : 'Hunted'; }
export function credits(n) { n = Math.round(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n.toLocaleString('en-US'); }

// Weapon colours: the mod exports projectile weapons with colour #000000 (they used sprites in EV Nova), so black counts as "unset".
const isBlack = (c) => !c || /^#?0{3}(0{3})?$/i.test(c);
export function weaponColor(w) {
  if (!w) return '#ffd27a';
  if (!isBlack(w.color)) return w.color;
  const beam = w.type === 'beam' || w.type === 'turretbeam' || w.type === 'pdbeam';
  return BEAM_COLORS[w.id] || (beam ? '#ff6a4a' : '#ffd27a');
}
// How a projectile is drawn: bolt, rail, pulse, missile, rocket, torp, sing, mine, flak, pd, shard, spit, magma
export const WEAPON_LOOKS = { 134: 'missile', 332: 'rocket', 335: 'torp', 340: 'torp', 350: 'sing', 336: 'mine', 330: 'flak', 347: 'flak', 341: 'flak',
  161: 'pd', 9101: 'mining', 156: 'rail', 157: 'rail', 158: 'rail', 197: 'rail', 339: 'shard', 344: 'spit', 345: 'magma', 143: 'pulse', 162: 'pulse', 181: 'mining' };
export function weaponLook(w) {
  if (!w) return 'bolt';
  if (WEAPON_LOOKS[w.id]) return WEAPON_LOOKS[w.id];
  if (w.look) return w.look;
  if (w.type === 'homing') return (w.dmgA + w.dmgS) > 150 ? 'torp' : 'missile';
  if (w.type === 'rocket') return 'rocket';
  if (w.type === 'pd') return 'pd';
  return 'bolt';
}

// A* route between systems: fewest jumps, preferring safer systems when two routes are the same length
export function route(SYS, from, to) {
  if (!SYS[from] || !SYS[to]) return [];
  const h = (id) => Math.hypot(SYS[id].x - SYS[to].x, SYS[id].y - SYS[to].y) / 240;
  const g = { [from]: 0 }, prev = { [from]: null }, open = new Set([from]);
  while (open.size) {
    let cur = null, cf = Infinity; for (const id of open) { const f = g[id] + h(id); if (f < cf) { cf = f; cur = id; } }
    if (cur === to) break; open.delete(cur);
    for (const l of SYS[cur].gate ? [...SYS[cur].links, SYS[cur].gate] : SYS[cur].links) { const c = g[cur] + 1 + SYS[l].danger * 0.08; if (c < (g[l] ?? Infinity)) { g[l] = c; prev[l] = cur; open.add(l); } }
  }
  if (!(to in prev)) return [];
  const r = []; let c = to; while (c && c !== from) { r.unshift(c); c = prev[c]; } return r;
}
