import { EXALTED_STANDING } from './reputation.js';
// Quantum Rift shared rules: stat conversion, loadouts, crew and research bonuses, flight physics, prices.
import {
  COMMODITIES,
  FACTIONS,
  RESEARCH,
  EXTRA_OUTFITS,
  EXTRA_WEAPONS,
  MINING_WEAPONS,
  MK2_OF,
  MK3_OF,
  ARMADA_HULLS,
  WINGMATES,
} from './galaxy.js';
import { SHIPS23 } from './ships23.js';
import { passengerSeats } from './passengers.js';
import { ROLES, RARITY, STAT_BASE, SYNERGY, BRIDGE_SLOTS } from './hangar.js';
import { roleOf } from './roles.js';
import { SPRITES } from './sprites26.js';
import { SPECIALISTS } from './specialty.js';
import { RANK_MULT, TRAITS, LOWER_DECK } from './syndicate.js';

/**
 * Simulation tick rate in cycles per second.
 * @type {number}
 */
export const TICK = 30; // simulation steps per second

/**
 * Duration of a single simulation time step in seconds.
 * @type {number}
 */
export const DT = 1 / TICK;

/**
 * Raw asset physics units to Quantum Rift physics scaling factors.
 * @typedef {Object} PhysicsConstants
 * @property {number} speed - Velocity multiplier.
 * @property {number} accel - Acceleration multiplier.
 * @property {number} turn - Turn rate multiplier.
 * @property {number} shot - Projectile velocity multiplier.
 * @property {number} shieldRe - Shield recharge rate multiplier.
 * @property {number} armorRe - Armor repair rate multiplier.
 * @property {number} beamDps - Continuous beam damage scale.
 * @property {number} jumpFuel - Fuel cost per hyperdrive jump.
 * @property {number} jumpClear - Minimum clearance distance from stellar bodies required to jump.
 */

/**
 * Scaling constants for translating raw engine units to Rift units.
 * @type {PhysicsConstants}
 */
// Asset-space units -> simulation units
export const K = {
  speed: 0.45,
  accel: 0.55,
  turn: 3.0,
  shot: 0.45,
  shieldRe: 0.08,
  armorRe: 0.6,
  beamDps: 14,
  jumpFuel: 100,
  jumpClear: 1100,
};

/**
 * Ship hull specification definition from asset database.
 * @typedef {Object} ShipHullAsset
 * @property {number|string} [id] Hull item identifier.
 * @property {string} name Ship model name.
 * @property {number} price Chassis purchase price in credits.
 * @property {number} mass Base dry hull mass.
 * @property {number} shield Base shield hit points.
 * @property {number} armor Base armor hit points.
 * @property {number} accel Base linear acceleration.
 * @property {number} speed Base maximum velocity.
 * @property {number} turn Base angular turn rate.
 * @property {number} space Total outfit space capacity.
 * @property {number} cargo Cargo hold capacity in tons.
 * @property {number} fuel Maximum hyperspace fuel units.
 * @property {number} shieldRe Shield recharge rate per second.
 * @property {number} armorRe Armor repair rate per second.
 * @property {number} fuelRe Fuel regeneration rate per second.
 * @property {Array<[number|string, number]>} weapons Stock factory weapon loadout.
 * @property {number} [guns] Maximum fixed weapon mounts.
 * @property {number} [turrets] Maximum turret weapon mounts.
 * @property {string} [role] Combat class role ('interceptor', 'fighter', 'corvette', 'frigate', 'destroyer', 'cruiser').
 * @property {string} [img] Ship sprite image asset path.
 * @property {boolean} [fastJump] Spools jump drive faster.
 * @property {boolean} [npcOnly] Whether restricted to non-player ships.
 */

/**
 * Outfit catalog item specification.
 * @typedef {Object} OutfitAsset
 * @property {number|string} id Outfit item identifier.
 * @property {string} name Outfit display name.
 * @property {number} price Purchase price in credits.
 * @property {number} [mass] Outfit mass in space units.
 * @property {number} [space] Space requirement.
 * @property {number} [max] Maximum allowed installations.
 * @property {boolean} [turret] Whether mounted as a turret.
 * @property {Record<string, number>} [eff] Attribute modifier effects.
 * @property {string} [desc] Item description.
 */

/**
 * Weapon catalog definition.
 * @typedef {Object} WeaponAsset
 * @property {number|string} id Weapon identifier.
 * @property {string} name Weapon display name.
 * @property {number} [price] Weapon purchase price.
 * @property {number} [range] Effective range in space units.
 * @property {number} [reload] Firing delay in seconds.
 * @property {number} [speed] Projectile velocity.
 * @property {number} [damage] Impact damage.
 * @property {number} [shieldDamage] Shield damage modifier.
 * @property {number} [beam] Beam weapon duration.
 * @property {number} [ammo] Maximum ammunition capacity.
 * @property {number} [homing] Tracking turn rate.
 * @property {string} [kind] Visual projectile style.
 * @property {string} [snd] Audio firing effect name.
 * @property {boolean} [sec] True if secondary missile/bay.
 * @property {boolean} [mining] Mining beam capability.
 */

/**
 * Master collection of game assets (ships, outfits, weapons, etc.).
 * @typedef {Object} GameAssets
 * @property {Record<string|number, ShipHullAsset>} ships - Ship hull definitions map.
 * @property {Record<string|number, OutfitAsset>} outfits - Outfit catalog map.
 * @property {Record<string|number, WeaponAsset>} weapons - Weapon catalog map.
 */

/**
 * Injects Quantum Rift custom ships, weapons, roles, and sprites into the raw asset dictionary.
 * Safe to call idempotently multiple times.
 * @param {GameAssets} A - Raw game assets object to augment in place.
 * @returns {GameAssets} The augmented assets object.
 */
// Add Quantum Rift's own weapons to the exported asset data (safe to call more than once)
export function augmentAssets(A) {
  for (const w of EXTRA_WEAPONS) if (!A.weapons[w.id]) A.weapons[w.id] = w;
  for (const id of MINING_WEAPONS) if (A.weapons[id]) A.weapons[id].mining = true;
  for (const S of SPECIALISTS)
    if (!A.ships[S.id]) A.ships[S.id] = { ...S, img: `ships/${S.id}_yard.png` }; // 0.8: specialty ships
  for (const S of SHIPS23) if (!A.ships[S.id]) A.ships[S.id] = { ...S }; // 2.3: new common Quantum hulls
  for (const H of Object.values(A.ships)) H.role = roleOf(H, A.weapons); // 0.8: class triangle roles
  for (const M of [MK2_OF, MK3_OF])
    for (const [b, mk] of Object.entries(M))
      if (A.ships[b] && A.ships[mk]) A.ships[mk].role = A.ships[b].role; // refits keep their role
  for (const id of [...Object.values(MK2_OF), ...Object.values(MK3_OF), ...ARMADA_HULLS])
    if (A.ships[id]) A.ships[id].npcOnly = true; // 2.6: enemy ships only
  for (const [id, s] of Object.entries(SPRITES)) if (A.ships[id]) A.ships[id].spr = s; // 2.6: sharper sheets with banking
  return A;
}

/**
 * Returns a dictionary of all outfits, merging base outfits with Rift custom extensions.
 * @param {GameAssets} A - Game assets object.
 * @returns {Record<string|number, OutfitAsset>} Merged map of all outfits.
 */
export function allOutfits(A) {
  const o = { ...A.outfits };
  for (const e of EXTRA_OUTFITS) o[e.id] = e;
  return o;
}

/**
 * Player ship loadout data structure.
 * @typedef {Object} ShipLoadout
 * @property {import("../server/industrial-contracts.js").IndustrialShip} [industrial] Saved hull-owned industrial work/heat.
 * @property {string} [uid] Stable saved hull identity assigned by docks.
 * @property {number|string} hull - Hull ID.
 * @property {Record<string|number, number>} outfits - Map of outfit ID to equipped quantity.
 * @property {Record<string|number, number>} ammo - Map of weapon ID to current ammunition count.
 * @property {Array<[number|string, number, number?]>} fixed - Built-in non-swappable weapon slots.
 * @property {number} bonusSpace - Extra outfit space refunded from built-in weapon conversion.
 * @property {string} name - Ship name.
 */

/**
 * Generates an initial loadout for a newly purchased ship hull, converting standard built-in weapons into modular outfits.
 * @param {GameAssets} A - Game assets collection.
 * @param {number|string} hull - Hull identifier.
 * @param {string} [name='Rift Runner'] - Display name for the ship.
 * @returns {ShipLoadout} Initialized loadout object.
 */
// A player's new ship: the hull's built-in weapons become ordinary outfits (so they can be sold or swapped) where an
// outfit exists for them; anything else (fighter bays, special guns) stays fixed. Their mass is refunded as space.
export function makeLoadout(A, hull, name) {
  const O = allOutfits(A),
    H = A.ships[hull],
    byWeapon = {};
  for (const o of Object.values(O))
    if (o.eff && o.eff.weapon && !(o.eff.weapon in byWeapon)) byWeapon[o.eff.weapon] = o;
  const L = { hull, outfits: {}, ammo: {}, fixed: [], bonusSpace: 0, name: name || 'Rift Runner' };
  for (const [w, n, a] of H.weapons) {
    const o = byWeapon[w];
    if (o) {
      L.outfits[o.id] = (L.outfits[o.id] || 0) + n;
      L.bonusSpace += (o.mass || 0) * n;
    } else L.fixed.push([w, n, a]);
    if (a) L.ammo[w] = (L.ammo[w] || 0) + a;
  }
  L.stockOutfits = { ...L.outfits };
  return L;
}

// A factory weapon bank is refittable even where its authored count exceeds a generic shop limit.
/**
 * Resolves maximum purchasable/mountable limit for an outfit on a ship.
 * @param {GameAssets} A - Game assets.
 * @param {ShipLoadout} ship - Ship loadout.
 * @param {string|number} id - Outfit ID.
 * @returns {number} Maximum allowed outfit count.
 */
export function stockOutfitLimit(A, ship, id) {
  const o = allOutfits(A)[id];
  return Math.max(o?.max || 1, o?.eff?.weapon ? makeLoadout(A, ship.hull).outfits[id] || 0 : 0);
}

// Factory equipment is included in the hull price, not a second retail purchase.
// Reserve at most half that price for removable stock gear; the rest is chassis.
/**
 * Calculates stock outfits, chassis value, and equipment price scale for a hull.
 * @param {GameAssets} A - Game assets.
 * @param {number|string} hull - Hull ID.
 * @returns {{ stock: Record<string, number>, chassis: number, scale: number }}
 */
export function loadoutBasis(A, hull) {
  const stock = makeLoadout(A, hull),
    O = allOutfits(A);
  const retail = Object.entries(stock.outfits).reduce(
    (v, [id, n]) => v + (O[id]?.cost || 0) * n,
    0,
  );
  const gear = Math.min(retail, Math.max(0, A.ships[hull]?.cost || 0) * 0.5);
  return {
    stock: stock.outfits,
    chassis: Math.max(0, (A.ships[hull]?.cost || 0) - gear),
    scale: retail ? gear / retail : 0,
  };
}

// Named hull prices are recruitment fees; rush repairs use actual factory kit replacement value.
/**
 * Calculates repair cost basis for hull and factory kit.
 * @param {GameAssets} A - Game assets.
 * @param {number|string} hull - Hull ID.
 * @returns {number} Repair base cost.
 */
export function repairBasis(A, hull) {
  const cost = A.ships[hull]?.cost || 0;
  if (!WINGMATES.includes(hull)) return cost;
  const O = allOutfits(A),
    stock = makeLoadout(A, hull);
  return Math.max(
    cost,
    Object.entries(stock.outfits).reduce((v, [id, n]) => v + (O[id]?.cost || 0) * n, 0),
  );
}

// Old saves predate provenance: count only equipment still present, up to the factory kit.
// Initialize before buying/removing equipment so subsequent paid replacements remain retail-valued.
/**
 * Ensures a ship loadout records its original factory equipment.
 * @param {GameAssets} A - Game assets.
 * @param {ShipLoadout} ship - Ship loadout.
 * @returns {Record<string, number>} Normalized stock outfits record.
 */
export function ensureStockOutfits(A, ship) {
  const { stock } = loadoutBasis(A, ship.hull);
  if (!ship.stockOutfits || typeof ship.stockOutfits !== 'object') ship.stockOutfits = { ...stock };
  for (const id of Object.keys(ship.stockOutfits)) {
    const n = Math.max(
      0,
      Math.min(Math.floor(ship.stockOutfits[id]) || 0, stock[id] || 0, ship.outfits?.[id] || 0),
    );
    if (n) ship.stockOutfits[id] = n;
    else delete ship.stockOutfits[id];
  }
  return ship.stockOutfits;
}

/**
 * Calculates trade-in resale value of a ship and its installed outfits.
 * @param {GameAssets} A - Game assets.
 * @param {ShipLoadout} ship - Ship loadout.
 * @returns {number} Net credit trade-in value.
 */
export function loadoutValue(A, ship) {
  const { stock, chassis, scale } = loadoutBasis(A, ship.hull),
    O = allOutfits(A);
  let value = chassis;
  for (const [id, n] of Object.entries(ship.outfits || {})) {
    const original = Math.max(
      0,
      Math.min(n, stock[id] || 0, ship.stockOutfits ? ship.stockOutfits[id] || 0 : stock[id] || 0),
    );
    value += (O[id]?.cost || 0) * (n - original + original * scale);
  }
  return Math.round(value * 0.5);
}

// Call before decrementing outfits. Stock is sold first; paid additions retain normal resale.
/**
 * Calculates refund value when selling an installed outfit from a ship.
 * @param {GameAssets} A - Game assets.
 * @param {ShipLoadout} ship - Ship loadout.
 * @param {string|number} id - Outfit ID.
 * @param {number} count - Quantity being sold.
 * @returns {number} Credit refund value.
 */
export function outfitSaleValue(A, ship, id, count) {
  const originals = ensureStockOutfits(A, ship),
    { scale } = loadoutBasis(A, ship.hull);
  const n = Math.max(0, Math.min(count, ship.outfits?.[id] || 0));
  const original = Math.min(n, originals[id] || 0),
    o = allOutfits(A)[id];
  originals[id] = (originals[id] || 0) - original;
  if (!originals[id]) delete originals[id];
  return Math.round((o?.cost || 0) * (n - original + original * scale) * 0.5);
}

/**
 * Percentage and flat stat bonuses affecting ship performance.
 * @typedef {Object} ShipStatsBonus
 * @property {number} [shieldPct] - Shield capacity bonus percent.
 * @property {number} [armorPct] - Armor hit point bonus percent.
 * @property {number} [speedPct] - Top speed bonus percent.
 * @property {number} [turnPct] - Turning rate bonus percent.
 * @property {number} [accelPct] - Acceleration bonus percent.
 * @property {number} [cargoPct] - Cargo capacity bonus percent.
 * @property {number} [shieldRePct] - Shield recharge rate bonus percent.
 * @property {number} [fuelRe] - Fuel regeneration rate addition.
 * @property {number} [fuel] - Flat additional jump fuel capacity.
 * @property {number|boolean} [jumpFast] - Whether fast jump drive spools are enabled.
 * @property {number} [damagePct] - Weapon damage bonus percent.
 */

/**
 * Live calculated flight, combat, and capacity attributes for an equipped ship.
 * @typedef {Object} ComputedShipStats
 * @property {boolean} towRig - Installed industrial towing capability.
 * @property {number} hull - Hull identifier.
 * @property {string} name - Ship model name.
 * @property {number} size - Visual sprite size.
 * @property {number} mass - Total mass.
 * @property {number} maxSpeed - Max flight speed in Rift units.
 * @property {number} accel - Acceleration rate in Rift units.
 * @property {number} turn - Turn rate in radians per second.
 * @property {number} shield - Max shield capacity.
 * @property {number} armor - Max armor hit points.
 * @property {number} shieldRe - Shield recharge per second in Rift units.
 * @property {number} armorRe - Armor repair per second in Rift units.
 * @property {number} fuel - Maximum jump fuel.
 * @property {number} fuelRe - Fuel regen rate per second.
 * @property {number} cargo - Cargo capacity in tons.
 * @property {number} space - Total outfit space available.
 * @property {number} used - Outfit space occupied by installed equipment.
 * @property {number} free - Remaining outfit space available.
 * @property {number} guns - Number of active fixed guns.
 * @property {number} turrets - Number of active turrets.
 * @property {number} maxGuns - Maximum gun mounts on the hull.
 * @property {number} maxTurrets - Maximum turret mounts on the hull.
 * @property {number} afterburner - Afterburner boost tier / capability.
 * @property {number} cloak - Cloaking device enabled flag (0 or 1).
 * @property {number} multiJump - Consecutive hyperdrive jump range.
 * @property {number} jumpFast - Fast jump drive spool flag (0 or 1).
 * @property {Record<string|number, number>} weapons - Map of weapon ID to mounted count.
 * @property {number} damageMul - Final outgoing damage multiplier.
 */

/**
 * Computes live operational flight, combat, and cargo stats from hull, fitted outfits, and captain bonuses.
 * @param {GameAssets} A - Game assets collection.
 * @param {ShipLoadout} ship - Player ship state or loadout.
 * @param {ShipStatsBonus} [bonus={}] - Research and crew stat bonuses.
 * @returns {ComputedShipStats|null} Live computed ship statistics, or null if hull not found.
 */
// The ship a player is flying: hull + bought outfits (+ research bonuses) -> live stats.
export function shipStats(A, ship, bonus = {}) {
  const H = A.ships[ship.hull];
  if (!H) return null;
  const O = allOutfits(A);
  let shield = H.shield,
    armor = H.armor,
    accel = H.accel,
    speed = H.speed,
    turn = H.turn,
    cargo = H.cargo,
    fuel = H.fuel,
    shieldRe = H.shieldRe,
    armorRe = H.armorRe,
    fuelRe = H.fuelRe,
    used = 0,
    guns = 0,
    turrets = 0,
    afterburner = 0,
    cloak = 0,
    multiJump = 1,
    jumpFast = H.fastJump ? 1 : 0;
  const weapons = {}; // weapon id -> count
  const builtIn = ship.fixed !== undefined ? ship.fixed : H.weapons;
  for (const [w, n] of builtIn) weapons[w] = (weapons[w] || 0) + n;
  for (const [id, n] of Object.entries(ship.outfits || {})) {
    const o = O[id];
    if (!o || !n) continue;
    used += (o.mass || 0) * n;
    const e = o.eff || {};
    if (e.weapon) {
      weapons[e.weapon] = (weapons[e.weapon] || 0) + n;
      if (o.turret) turrets += n;
      else guns += n;
    }
    shield += (e.shield || 0) * n;
    armor += (e.armor || 0) * n;
    accel += (e.accel || 0) * n;
    speed += (e.speed || 0) * n;
    turn += (e.turn || 0) * n;
    cargo += (e.cargo || 0) * n;
    fuel += (e.fuel || 0) * n;
    shieldRe += (e.shieldRe || 0) * n;
    armorRe += (e.armorRe || 0) * n;
    fuelRe += (e.fuelRe || 0) * n;
    afterburner = Math.max(afterburner, e.afterburner || 0);
    if (e.cloak) cloak = 1;
    if (e.multiJump) multiJump = Math.max(multiJump, e.multiJump);
    if (e.jumpSpeed) jumpFast = 1;
  }
  shield *= 1 + (bonus.shieldPct || 0) / 100;
  armor *= 1 + (bonus.armorPct || 0) / 100;
  speed *= 1 + (bonus.speedPct || 0) / 100;
  turn *= 1 + (bonus.turnPct || 0) / 100;
  accel *= 1 + (bonus.accelPct || 0) / 100;
  cargo = Math.round(cargo * (1 + (bonus.cargoPct || 0) / 100));
  shieldRe *= 1 + (bonus.shieldRePct || 0) / 100;
  fuelRe += (bonus.fuelRe || 0) * 30;
  fuel += bonus.fuel || 0;
  if (bonus.jumpFast) jumpFast = 1;
  return {
    towRig:
      Number(H.id) === 815 ||
      (cargo >= 60 &&
        !['fighter', 'interceptor'].includes(H.role) &&
        Object.entries(ship.outfits || {}).some(([id, n]) => n > 0 && !!O[id]?.eff?.towRig)),
    hull: H.id,
    name: H.name,
    size: H.size,
    mass: H.mass,
    maxSpeed: speed * K.speed,
    accel: accel * K.accel,
    turn: (turn * K.turn * Math.PI) / 180,
    shield: Math.round(shield),
    armor: Math.round(armor),
    shieldRe: Math.max(0.5, shieldRe * K.shieldRe),
    armorRe: armorRe * K.armorRe,
    fuel,
    fuelRe: fuelRe / 30,
    cargo,
    passengerSeats: passengerSeats(H, ship),
    space: H.space + (ship.bonusSpace || 0),
    used,
    free: H.space + (ship.bonusSpace || 0) - used,
    guns,
    turrets,
    maxGuns: H.guns,
    maxTurrets: H.turrets,
    afterburner,
    cloak,
    multiJump,
    jumpFast,
    weapons,
    damageMul: 1 + (bonus.damagePct || 0) / 100,
  };
}

/**
 * Personal station state object.
 * @typedef {Object} StationState
 * @property {number} [ops] - Station operations tier.
 * @property {string[]} [done] - List of completed research technology IDs.
 * @property {Array<{id: string, t: number, total: number}>} [queue] - In-progress research jobs.
 */

/**
 * Aggregates all completed station research project stat bonuses.
 * @param {StationState | null | undefined} station - Personal station state object containing `done` research ID list.
 * @returns {Record<string, number>} Aggregated stat bonuses.
 */
export function researchBonus(station) {
  const b = {};
  for (const r of RESEARCH)
    if (station && station.done && station.done.includes(r.id))
      for (const [k, v] of Object.entries(r.bonus)) b[k] = (b[k] || 0) + v;
  return b;
}

/**
 * Officer data record structure.
 * @typedef {Object} OfficerRecord
 * @property {string} id - Unique officer ID.
 * @property {string} role - Officer division / role (e.g. 'tactical', 'helm').
 * @property {string} rarity - Rarity tier (e.g. 'common', 'rare', 'epic').
 * @property {number} lv - Level of the officer (starts at 1).
 * @property {number} rank - Rank index (1.2 rank multiplier).
 * @property {string} [race] - Alien or human race identifier.
 * @property {string[]} [traits] - Special innate traits.
 */

/**
 * Calculates a single officer's individual stat contributions based on role, level, rarity, and rank.
 * @param {OfficerRecord} o - Officer state record.
 * @returns {Record<string, number>} Map of stat names to bonus values.
 */
// one officer's stat values: base x rarity, +10% per level above 1
export function officerStats(o) {
  const out = {},
    R = ROLES[o.role],
    mult = RARITY[o.rarity].mult * (1 + 0.1 * (o.lv - 1)) * RANK_MULT(o.rank); // 1.2: rank adds 12% each
  for (const k of R.stats) out[k] = Math.round(STAT_BASE[k] * mult * 10) / 10;
  return out;
}

/**
 * Computes combined stat bonuses from all officers assigned to bridge stations,
 * including captain multiplier (1.25x), officer traits, and racial synergy bonuses.
 * @param {OfficerRecord[]|null|undefined} officers - Hired officers roster.
 * @param {Record<string, string>|null|undefined} bridge - Bridge slot map of slot name to officer ID.
 * @returns {Record<string, number>} Cumulative bridge stat bonuses.
 */
// bridge officers (captain slot counts 1.25x) plus race synergy when two or more of a race share the bridge
export function officerBonus(officers, bridge) {
  const b = {},
    races = {};
  if (!officers || !bridge) return b;
  for (const slot of BRIDGE_SLOTS) {
    const o = officers.find((x) => x.id === bridge[slot]);
    if (!o) continue;
    const k = slot === 'captain' ? 1.25 : 1;
    for (const [s, v] of Object.entries(officerStats(o))) b[s] = (b[s] || 0) + v * k;
    for (const t of o.traits || [])
      if (TRAITS[t]) for (const [s, v] of Object.entries(TRAITS[t].bonus)) b[s] = (b[s] || 0) + v; // 1.2: traits
    races[o.race] = (races[o.race] || 0) + 1;
  }
  for (const [r, n] of Object.entries(races))
    if (n >= 2 && SYNERGY[r])
      for (const [s, v] of Object.entries(SYNERGY[r])) b[s] = (b[s] || 0) + v;
  return b;
}

/**
 * Aggregates all active player modifications: station research, bridge officers, and lower-deck crew.
 * @param {import("../server/game.js").PlayerData} d - Full player save state.
 * @returns {Record<string, number>} Total unified stat bonuses.
 */
// everything that modifies a captain's ship: research + bridge crew
export function captainBonus(d) {
  const b = researchBonus(d.station),
    o = officerBonus(d.officers, d.bridge);
  for (const [k, v] of Object.entries(o)) b[k] = (b[k] || 0) + v;
  for (const c of d.lower || [])
    if (LOWER_DECK[c])
      for (const [k, v] of Object.entries(LOWER_DECK[c].bonus)) b[k] = (b[k] || 0) + v; // 1.2: lower-deck crew
  return b;
}

/**
 * Resolved operational weapon parameters in Rift simulation units.
 * @typedef {Object} WeaponConfig
 * @property {boolean} beam - Whether weapon is an instant beam weapon.
 * @property {number} speed - Projectile travel speed.
 * @property {number} life - Projectile lifetime in seconds.
 * @property {number} range - Effective maximum firing range.
 * @property {number} reload - Cooldown reload delay between shots in seconds.
 * @property {boolean} turret - Whether weapon is mounted on a turret.
 * @property {number} arc - Turret firing arc limit in radians (0 for 360 degree).
 * @property {boolean} homing - Whether projectile homes on targeted ship.
 * @property {boolean} pd - Whether weapon acts as point-defense against munitions.
 * @property {boolean} bay - Whether weapon is a fighter launch bay.
 * @property {boolean} rocket - Whether weapon fires unguided rockets.
 * @property {number} inacc - Inaccuracy spread angle in radians.
 * @property {number} dmgA - Armor damage dealt per hit or second.
 * @property {number} dmgS - Shield damage dealt per hit or second.
 * @property {boolean} continuous - Whether beam fires continuously without cycling.
 * @property {string} color - Hex color code for rendering projectile or beam.
 * @property {string} look - Projectile visual graphic style.
 * @property {number} blast - Area-of-effect blast radius.
 * @property {number} ion - Ion damage disabling ship systems.
 */

/**
 * Converts raw weapon asset definitions into live physics and combat parameters.
 * @param {WeaponAsset} w - Raw weapon definition from asset registry.
 * @returns {WeaponConfig} Configured weapon parameters.
 */
// Weapon parameters in Rift units
export function weaponParams(w) {
  const beam = w.type === 'beam' || w.type === 'turretbeam' || w.type === 'pdbeam';
  const speed = Math.max(200, (w.speed || 1000) * K.shot);
  const life = Math.max(0.4, ((w.duration || 30) / 30) * 1.4);
  return {
    beam,
    speed,
    life,
    range: beam ? w.beamLen || 360 : speed * life,
    reload: Math.max(1, w.reload || 1) / 30,
    turret:
      w.type === 'turret' || w.type === 'turretbeam' || w.type === 'pd' || w.type === 'pdbeam',
    arc: w.type === 'frontturret' ? Math.PI / 6 : w.type === 'rearturret' ? Math.PI / 6 : 0,
    homing: w.type === 'homing',
    pd: w.type === 'pd' || w.type === 'pdbeam',
    bay: w.type === 'bay',
    rocket: w.type === 'rocket',
    inacc: ((w.inacc || 0) * Math.PI) / 180,
    dmgA: Math.max(0, w.dmgA || 0),
    dmgS: Math.max(0, w.dmgS || 0),
    continuous: beam && !(w.reload > 0),
    color: weaponColor(w),
    look: weaponLook(w),
    blast: w.blast || 0,
    ion: w.ion || 0,
  };
}

/**
 * Default beam colors indexed by weapon ID.
 * @type {Record<number, string>}
 */
export const BEAM_COLORS = {
  146: '#ff4a4a',
  331: '#7ad0ff',
  334: '#ffc070',
  337: '#ffe0a0',
  338: '#7ae8ff',
  343: '#d050a0',
  346: '#ff70f0',
  348: '#70ffff',
  349: '#a070ff',
  355: '#70ffe0',
  128: '#7affb0',
  129: '#7affb0',
  130: '#7affb0',
  131: '#7affb0',
  132: '#ffaa50',
  330: '#ffb060',
  339: '#e8f8ff',
  341: '#c0f0ff',
  344: '#a8ff40',
  345: '#ff7a20',
  347: '#d0b080',
  156: '#c0d8ff',
  157: '#c0d8ff',
  158: '#c0d8ff',
  197: '#c0d8ff',
  143: '#ff9040',
  162: '#ff9040',
  161: '#ffe060',
  181: '#d0d0ff',
};
/**
 * Determines audio sound effect ID for a weapon discharge.
 * @param {WeaponAsset} w - Weapon asset definition.
 * @returns {number} Sound effect resource ID.
 */
// Stable sound references for weapon effects, with a nearest-match fallback.
export function weaponSound(w) {
  if (w.sound >= 36) return 200 + w.sound;
  const p = weaponParams(w);
  if (p.homing) return 238;
  if (p.beam) return 240;
  if (p.pd) return 236;
  if (p.bay) return 239;
  return w.dmgA + w.dmgS > 40 ? 241 : 236;
}

/**
 * Physics entity moving in 2D space.
 * @typedef {Object} FlightEntity
 * @property {number} x - Current X position coordinate.
 * @property {number} y - Current Y position coordinate.
 * @property {number} vx - Current velocity vector X component.
 * @property {number} vy - Current velocity vector Y component.
 * @property {number} a - Heading angle in radians (0 = up, clockwise).
 * @property {number} fuel - Current remaining fuel.
 * @property {number} [towCap] Hard attached velocity cap.
 */

/**
 * Flight control inputs for a single simulation step.
 * @typedef {Object} FlightInput
 * @property {number|boolean} [thrust] - Forward main thruster active.
 * @property {number} [turn] - Turning control input (-1 left, 0 neutral, 1 right).
 * @property {number|boolean} [ab] - Afterburner boost active.
 * @property {number|boolean} [rev] - Reverse thrusters / face retrograde active.
 */

/**
 * Advances flight physics for an entity by one simulation time step.
 * @param {FlightEntity} e - Ship entity state modified in place.
 * @param {ComputedShipStats} st - Ship performance attributes.
 * @param {FlightInput} inp - Flight control inputs.
 * @param {number} [dt=DT] - Step duration in seconds.
 * @returns {void}
 */
// Flight: one fixed step. input: {thrust: 0/1, turn: -1/0/1, ab: 0/1, rev: 0/1}
export function step(e, st, inp, dt = DT) {
  if (inp.rev) {
    // turn to face against the direction of travel
    const want = wrap(Math.atan2(e.vx, -e.vy) + Math.PI);
    let d = angDiff(want, e.a);
    const t = st.turn * dt;
    e.a += Math.abs(d) < t ? d : Math.sign(d) * t;
  } else e.a += (inp.turn || 0) * st.turn * dt;
  e.a = wrap(e.a);
  let acc = inp.thrust ? st.accel : 0,
    max = st.maxSpeed;
  if (inp.ab && st.afterburner && e.fuel > 0) {
    acc *= 1.8;
    max *= 1.4;
    e.fuel -= 0.3;
  }
  if (acc) {
    e.vx += Math.sin(e.a) * acc * dt;
    e.vy -= Math.cos(e.a) * acc * dt;
  }
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > max) {
    const k = Math.max(max / sp, 1 - 2 * dt);
    e.vx *= k;
    e.vy *= k;
  }
  // Tow is a hard physical limit after all acceleration/afterburner/catchup, before displacement.
  if (Number.isFinite(e.towCap) && e.towCap > 0) {
    const speed = Math.hypot(e.vx, e.vy);
    if (speed > e.towCap) {
      e.vx *= e.towCap / speed;
      e.vy *= e.towCap / speed;
    }
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

/**
 * Wraps an angle in radians into the interval (-PI, PI].
 * @param {number} a - Angle in radians.
 * @returns {number} Normalized angle in radians.
 */
export function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Computes the signed shortest angular difference between two angles in radians.
 * @param {number} a - First angle.
 * @param {number} b - Second angle.
 * @returns {number} Angular difference between (-PI, PI].
 */
export function angDiff(a, b) {
  return wrap(a - b);
}

/**
 * Computes heading angle in radians from an origin entity to a destination coordinate (0 = up, clockwise).
 * @param {{ x: number, y: number }} e - Origin entity coordinates.
 * @param {number} x - Target X coordinate.
 * @param {number} y - Target Y coordinate.
 * @returns {number} Angle in radians.
 */
export function angleTo(e, x, y) {
  return Math.atan2(x - e.x, -(y - e.y));
} // 0 = up, clockwise

/**
 * Calculates current market trading price for a commodity at a stellar station or planet, including time drift.
 * @param {{id: string, prices?: Record<string, number>}} stellar - Stellar object with market prices map.
 * @param {string} cid - Commodity identifier.
 * @param {number} [t=Date.now()] - Timestamp for deterministic market price drift.
 * @returns {number|null} Current trade price in credits, or null if commodity not traded.
 */
// Prices at a stellar for a commodity (level -1 / 0 / 1), with a slow drift by time so markets move
export function price(stellar, cid, t = Date.now()) {
  const c = COMMODITIES.find((c) => c.id === cid);
  const lv = stellar.prices && stellar.prices[cid];
  if (lv === undefined || !c) return null;
  const drift = 1 + 0.06 * Math.sin(t / 3.6e6 + cid.length * 1.7 + stellar.id.length);
  return Math.round(c.base * (1 + 0.28 * lv) * drift);
}

/**
 * Determines whether two faction identifiers are mutually hostile.
 * @param {string|null|undefined} a - First faction ID.
 * @param {string|null|undefined} b - Second faction ID.
 * @returns {boolean} True if either faction considers the other an enemy.
 */
export function hostileFactions(a, b) {
  if (!a || !b || a === b) return false;
  return (
    (FACTIONS[a] && FACTIONS[a].hostile.includes(b)) ||
    (FACTIONS[b] && FACTIONS[b].hostile.includes(a))
  );
}

/**
 * Returns descriptive standing tier label corresponding to a numerical reputation score.
 * @param {number} v - Reputation value.
 * @returns {'Exalted' | 'Honored' | 'Friendly' | 'Neutral' | 'Wanted' | 'Hunted'} Reputation label.
 */
export function repLabel(v) {
  return v >= EXALTED_STANDING
    ? 'Exalted'
    : v >= 50
      ? 'Honored'
      : v >= 20
        ? 'Friendly'
        : v > -20
          ? 'Neutral'
          : v > -50
            ? 'Wanted'
            : 'Hunted';
}

/**
 * Formats a credit amount into a human-readable display string (e.g. "1.25M" or "25,000").
 * @param {number} n - Credit balance.
 * @returns {string} Formatted credits string.
 */
export function credits(n) {
  n = Math.round(n || 0);
  return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n.toLocaleString('en-US');
}

/**
 * Checks whether a given color hex string represents unset / black color.
 * @param {string|null|undefined} c - Color hex string.
 * @returns {boolean} True if color is null, empty, or black.
 */
// Legacy projectile records can use black as an unset colour; supply a visible fallback.
const isBlack = (c) => !c || /^#?0{3}(0{3})?$/i.test(c);

/**
 * Determines the display render color for a weapon projectile or beam.
 * @param {WeaponAsset} w - Weapon asset definition.
 * @returns {string} Hex color string.
 */
export function weaponColor(w) {
  if (!w) return '#ffd27a';
  if (!isBlack(w.color)) return w.color;
  const beam = w.type === 'beam' || w.type === 'turretbeam' || w.type === 'pdbeam';
  return BEAM_COLORS[w.id] || (beam ? '#ff6a4a' : '#ffd27a');
}

/**
 * Mapping of weapon IDs to their projectile visual sprite or rendering style.
 * @type {Record<number, string>}
 */
// How a projectile is drawn: bolt, rail, pulse, missile, rocket, torp, sing, mine, flak, pd, shard, spit, magma
export const WEAPON_LOOKS = {
  134: 'missile',
  332: 'rocket',
  335: 'torp',
  340: 'torp',
  350: 'sing',
  336: 'mine',
  330: 'flak',
  347: 'flak',
  341: 'flak',
  161: 'pd',
  9101: 'mining',
  156: 'rail',
  157: 'rail',
  158: 'rail',
  197: 'rail',
  339: 'shard',
  344: 'spit',
  345: 'magma',
  143: 'pulse',
  162: 'pulse',
  181: 'mining',
};

/**
 * Resolves the visual projectile rendering style for a given weapon.
 * @param {WeaponAsset} w - Weapon asset definition.
 * @returns {string} Projectile visual style name.
 */
export function weaponLook(w) {
  if (!w) return 'bolt';
  if (WEAPON_LOOKS[w.id]) return WEAPON_LOOKS[w.id];
  if (w.look) return w.look;
  if (w.type === 'homing') return w.dmgA + w.dmgS > 150 ? 'torp' : 'missile';
  if (w.type === 'rocket') return 'rocket';
  if (w.type === 'pd') return 'pd';
  return 'bolt';
}

/**
 * A* pathfinding algorithm computing the shortest and safest hyperspace jump route between two star systems.
 * @param {Record<string, {x: number, y: number, danger?: number, links: string[]}>} SYS - Star systems dictionary keyed by system ID.
 * @param {string} from - Origin system ID.
 * @param {string} to - Destination system ID.
 * @returns {string[]} Ordered array of system IDs to jump through (excluding origin).
 */
// A* route between systems: fewest jumps, preferring safer systems when two routes are the same length
export function route(SYS, from, to) {
  if (!SYS[from] || !SYS[to]) return [];
  const h = (id) => Math.hypot(SYS[id].x - SYS[to].x, SYS[id].y - SYS[to].y) / 240;
  const g = { [from]: 0 },
    prev = { [from]: null },
    open = new Set([from]);
  while (open.size) {
    let cur = null,
      cf = Infinity;
    for (const id of open) {
      const f = g[id] + h(id);
      if (f < cf) {
        cf = f;
        cur = id;
      }
    }
    if (cur === to) break;
    open.delete(cur);
    for (const l of SYS[cur].gate ? [...SYS[cur].links, SYS[cur].gate] : SYS[cur].links) {
      const c = g[cur] + 1 + SYS[l].danger * 0.08;
      if (c < (g[l] ?? Infinity)) {
        g[l] = c;
        prev[l] = cur;
        open.add(l);
      }
    }
  }
  if (!(to in prev)) return [];
  const r = [];
  let c = to;
  while (c && c !== from) {
    r.unshift(c);
    c = prev[c];
  }
  return r;
}
