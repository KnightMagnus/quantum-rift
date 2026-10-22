import type { RoleId } from './roles.ts';
import type { PlayerData } from '../server/game.ts';
import type { IndustrialShip } from '../server/industrial-contracts.ts';
export type PhysicsConstants = {
  speed: number;
  accel: number;
  turn: number;
  shot: number;
  shieldRe: number;
  armorRe: number;
  beamDps: number;
  jumpFuel: number;
  jumpClear: number;
};
export type ShipHullAsset = {
  id: number;
  name: string;
  cost: number;
  mass: number;
  shield: number;
  armor: number;
  accel: number;
  speed: number;
  turn: number;
  space: number;
  cargo: number;
  fuel: number;
  shieldRe: number;
  armorRe: number;
  fuelRe: number;
  weapons: Array<[number, number, number?]>;
  guns: number;
  turrets: number;
  size: number;
  role?: RoleId;
  img?: string;
  sub?: string;
  loop?: string;
  fastJump?: boolean;
  npcOnly?: boolean;
  strength: number;
  cat?: string;
  faction?: string;
  kind?: string;
  tech?: number;
  crew?: number;
  desc?: string;
  spr?: import('./sprites26.ts').SpriteSheetConfig;
  buy?: number;
  ai?: number;
  glow?: boolean;
  pilot?: string;
};
export type OutfitAsset = {
  id: number;
  name: string;
  cost: number;
  mass: number;
  max?: number;
  tech?: number;
  eff?: Record<string, number>;
  desc?: string;
  turret?: boolean;
  gun?: boolean;
  icon?: string;
  faction?: string;
  space?: number;
};
export type WeaponAsset = {
  id: number;
  name: string;
  type: string;
  dmgA: number;
  dmgS: number;
  reload: number;
  speed: number;
  duration: number;
  inacc: number;
  sound?: number;
  blast?: number;
  beamLen?: number;
  color?: string | null;
  ion?: number;
  burst?: number;
  ammo?: number;
  desc?: string;
  launch?: number;
  look?: string;
  mining?: boolean;
  range?: number;
  sec?: boolean;
  homing?: number;
  damage?: number;
  shieldDamage?: number;
  beam?: number;
  snd?: string;
};
export type GameAssets = {
  ships: Record<string | number, ShipHullAsset>;
  outfits: Record<string | number, OutfitAsset>;
  weapons: Record<string | number, WeaponAsset>;
};
export type ShipLoadout = {
  industrial?: IndustrialShip;
  stockOutfits?: Record<string, number>;
  uid?: string;
  hull: number | string;
  outfits: Record<string | number, number>;
  ammo: Record<string | number, number>;
  fixed: Array<[number | string, number, number?]>;
  bonusSpace: number;
  name: string;
};
export type ShipStatsLoadout = Pick<ShipLoadout, 'hull'> &
  Partial<Pick<ShipLoadout, 'outfits' | 'fixed' | 'bonusSpace'>>;
export type ShipStatsBonus = {
  shieldPct?: number;
  armorPct?: number;
  speedPct?: number;
  turnPct?: number;
  accelPct?: number;
  cargoPct?: number;
  shieldRePct?: number;
  fuelRe?: number;
  fuel?: number;
  jumpFast?: number | boolean;
  damagePct?: number;
};
export type ComputedShipStats = {
  passengerSeats: number;
  towRig: boolean;
  hull: number | string;
  name: string;
  size: number;
  mass: number;
  maxSpeed: number;
  accel: number;
  turn: number;
  shield: number;
  armor: number;
  shieldRe: number;
  armorRe: number;
  fuel: number;
  fuelRe: number;
  cargo: number;
  space: number;
  used: number;
  free: number;
  guns: number;
  turrets: number;
  maxGuns: number;
  maxTurrets: number;
  afterburner: number;
  cloak: number;
  multiJump: number;
  jumpFast: number;
  weapons: Record<string | number, number>;
  damageMul: number;
};
export type StationState = {
  claimed: boolean;
  site?: string;
  ops: number;
  refUnits: number;
  refT: number;
  active: { id: string; ends: number; from?: number } | null;
  done: string[];
  queue?: string[];
  defense?: number;
  raidWin?: number;
  activeDoneT?: number;
  relocT?: number;
  waiting?: boolean;
};
export type OfficerRecord = {
  id: string | number;
  name: string;
  seed?: boolean;
  src?: string;
  cost?: number;
  xp?: number;
  role: string;
  rarity: number;
  lv: number;
  rank?: number;
  race?: string;
  traits?: string[];
};
export type WeaponConfig = {
  beam: boolean;
  speed: number;
  life: number;
  range: number;
  reload: number;
  turret: boolean;
  arc: number;
  homing: boolean;
  pd: boolean;
  bay: boolean;
  rocket: boolean;
  inacc: number;
  dmgA: number;
  dmgS: number;
  continuous: boolean;
  color: string;
  look: string;
  blast: number;
  ion: number;
};
export type FlightEntity = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  fuel: number;
  towCap?: number;
};
export type FlightInput = {
  thrust?: number | boolean;
  turn?: number;
  ab?: number | boolean;
  rev?: number | boolean;
  navigation?: number | boolean;
};
import { EXALTED_STANDING } from './reputation.ts';
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
} from './galaxy.ts';
import { SHIPS23 } from './ships23.ts';
import { passengerSeats } from './passengers.ts';
import { ROLES, RARITY, STAT_BASE, SYNERGY, BRIDGE_SLOTS } from './hangar.ts';
import { roleOf } from './roles.ts';
import { SPRITES } from './sprites26.ts';
import { SPECIALISTS } from './specialty.ts';
import { RANK_MULT, TRAITS, LOWER_DECK } from './syndicate.ts';

/**
 * Simulation tick rate in cycles per second.
 */
export const TICK: number = 30; // simulation steps per second

/**
 * Duration of a single simulation time step in seconds.
 */
const tickDuration: number = 1 / TICK;
export { tickDuration as DT };

/**
 * Raw asset physics units to Quantum Rift physics scaling factors.
 * PhysicsConstants fields:
 * speed: - Velocity multiplier.
 * accel: - Acceleration multiplier.
 * turn: - Turn rate multiplier.
 * shot: - Projectile velocity multiplier.
 * shieldRe: - Shield recharge rate multiplier.
 * armorRe: - Armor repair rate multiplier.
 * beamDps: - Continuous beam damage scale.
 * jumpFuel: - Fuel cost per hyperdrive jump.
 * jumpClear: - Minimum clearance distance from stellar bodies required to jump.
 */

/**
 * Scaling constants for translating raw engine units to Rift units.
 */
// Asset-space units -> simulation units
const physicsConstants: PhysicsConstants = {
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
export { physicsConstants as K };

/**
 * Ship hull specification definition from asset database.
 * ShipHullAsset fields:
 * [id]: Hull item identifier.
 * name: Ship model name.
 * price: Chassis purchase price in credits.
 * mass: Base dry hull mass.
 * shield: Base shield hit points.
 * armor: Base armor hit points.
 * accel: Base linear acceleration.
 * speed: Base maximum velocity.
 * turn: Base angular turn rate.
 * space: Total outfit space capacity.
 * cargo: Cargo hold capacity in tons.
 * fuel: Maximum hyperspace fuel units.
 * shieldRe: Shield recharge rate per second.
 * armorRe: Armor repair rate per second.
 * fuelRe: Fuel regeneration rate per second.
 * weapons: Stock factory weapon loadout.
 * [guns]: Maximum fixed weapon mounts.
 * [turrets]: Maximum turret weapon mounts.
 * [role]: Combat class role ('interceptor', 'fighter', 'corvette', 'frigate', 'destroyer', 'cruiser').
 * [img]: Ship sprite image asset path.
 * [fastJump]: Spools jump drive faster.
 * [npcOnly]: Whether restricted to non-player ships.
 */

/**
 * Outfit catalog item specification.
 * OutfitAsset fields:
 * id: Outfit item identifier.
 * name: Outfit display name.
 * price: Purchase price in credits.
 * [mass]: Outfit mass in space units.
 * [space]: Space requirement.
 * [max]: Maximum allowed installations.
 * [turret]: Whether mounted as a turret.
 * [eff]: Attribute modifier effects.
 * [desc]: Item description.
 */

/**
 * Weapon catalog definition.
 * WeaponAsset fields:
 * id: Weapon identifier.
 * name: Weapon display name.
 * [price]: Weapon purchase price.
 * [range]: Effective range in space units.
 * [reload]: Firing delay in seconds.
 * [speed]: Projectile velocity.
 * [damage]: Impact damage.
 * [shieldDamage]: Shield damage modifier.
 * [beam]: Beam weapon duration.
 * [ammo]: Maximum ammunition capacity.
 * [homing]: Tracking turn rate.
 * [kind]: Visual projectile style.
 * [snd]: Audio firing effect name.
 * [sec]: True if secondary missile/bay.
 * [mining]: Mining beam capability.
 */

/**
 * Master collection of game assets (ships, outfits, weapons, etc.).
 * GameAssets fields:
 * ships: - Ship hull definitions map.
 * outfits: - Outfit catalog map.
 * weapons: - Weapon catalog map.
 */

/**
 * Injects Quantum Rift custom ships, weapons, roles, and sprites into the raw asset dictionary.
 * Safe to call idempotently multiple times.
 * @param assets - Raw game assets object to augment in place.
 * @returns The augmented assets object.
 */
// Add Quantum Rift's own weapons to the exported asset data (safe to call more than once)
export function augmentAssets(assets: GameAssets): GameAssets {
  for (const weaponAsset of EXTRA_WEAPONS)
    if (!assets.weapons[weaponAsset.id]) assets.weapons[weaponAsset.id] = weaponAsset;
  for (const mINING_WEAPONS of MINING_WEAPONS)
    if (assets.weapons[mINING_WEAPONS]) assets.weapons[mINING_WEAPONS].mining = true;
  for (const specialistShip of SPECIALISTS)
    if (!assets.ships[specialistShip.id])
      assets.ships[specialistShip.id] = {
        ...specialistShip,
        img: `ships/${specialistShip.id}_yard.png`,
      }; // specialty ships
  for (const ship23Hull of SHIPS23)
    if (!assets.ships[ship23Hull.id]) assets.ships[ship23Hull.id] = { ...ship23Hull }; // new common Quantum hulls
  for (const shipHullAsset of Object.values(assets.ships))
    shipHullAsset.role = roleOf(shipHullAsset, assets.weapons) as RoleId; // class triangle roles
  for (const message of [MK2_OF, MK3_OF])
    for (const [secondValue, makeElement] of Object.entries(message))
      if (assets.ships[secondValue] && assets.ships[makeElement])
        assets.ships[makeElement].role = assets.ships[secondValue].role; // refits keep their role
  for (const identifier of [...Object.values(MK2_OF), ...Object.values(MK3_OF), ...ARMADA_HULLS])
    if (assets.ships[identifier]) assets.ships[identifier].npcOnly = true; // enemy ships only
  for (const [identifier, spriteSheetConfig] of Object.entries(SPRITES))
    if (assets.ships[identifier]) assets.ships[identifier].spr = spriteSheetConfig; // sharper sheets with banking
  return assets;
}

/**
 * Returns a dictionary of all outfits, merging base outfits with Rift custom extensions.
 * @param assets - Game assets object.
 * @returns Merged map of all outfits.
 */
export function allOutfits(assets: GameAssets): Record<string | number, OutfitAsset> {
  const options = { ...assets.outfits };
  for (const outfit of EXTRA_OUTFITS) options[outfit.id] = outfit;
  return options;
}

/**
 * Player ship loadout data structure.
 * ShipLoadout fields:
 * [industrial]: Saved hull-owned industrial work/heat.
 * [uid]: Stable saved hull identity assigned by docks.
 * hull: - Hull ID.
 * outfits: - Map of outfit ID to equipped quantity.
 * ammo: - Map of weapon ID to current ammunition count.
 * fixed: - Built-in non-swappable weapon slots.
 * bonusSpace: - Extra outfit space refunded from built-in weapon conversion.
 * name: - Ship name.
 */

/**
 * Generates an initial loadout for a newly purchased ship hull, converting standard built-in weapons into modular outfits.
 * @param assets - Game assets collection.
 * @param hull - Hull identifier.
 * @param name - Display name for the ship.
 * @returns Initialized loadout object.
 */
// A player's new ship: the hull's built-in weapons become ordinary outfits (so they can be sold or swapped) where an
// outfit exists for them; anything else (fighter bays, special guns) stays fixed. Their mass is refunded as space.
export function makeLoadout(assets: GameAssets, hull: number | string, name?: string): ShipLoadout {
  const allOutfits2 = allOutfits(assets),
    shipHullAsset = assets.ships[hull],
    byWeapon: Record<string, OutfitAsset> = {};
  for (const outfit of Object.values(allOutfits2))
    if (outfit.eff && outfit.eff.weapon && !(outfit.eff.weapon in byWeapon))
      byWeapon[outfit.eff.weapon] = outfit;
  const shipLoadout: ShipLoadout = {
    hull,
    outfits: {},
    ammo: {},
    fixed: [],
    bonusSpace: 0,
    name: name || 'Rift Runner',
  };
  for (const [width, count, firstValue] of shipHullAsset.weapons) {
    const outfitAsset = byWeapon[width];
    if (outfitAsset) {
      shipLoadout.outfits[outfitAsset.id] = (shipLoadout.outfits[outfitAsset.id] || 0) + count;
      shipLoadout.bonusSpace += (outfitAsset.mass || 0) * count;
    } else shipLoadout.fixed.push([width, count, firstValue]);
    if (firstValue) shipLoadout.ammo[width] = (shipLoadout.ammo[width] || 0) + firstValue;
  }
  shipLoadout.stockOutfits = { ...shipLoadout.outfits };
  return shipLoadout;
}

// A factory weapon bank is refittable even where its authored count exceeds a generic shop limit.
/**
 * Resolves maximum purchasable/mountable limit for an outfit on a ship.
 * @param assets - Game assets.
 * @param ship - Ship loadout.
 * @param identifier - Outfit ID.
 * @returns Maximum allowed outfit count.
 */
export function stockOutfitLimit(
  assets: GameAssets,
  ship: ShipLoadout,
  identifier: string | number,
): number {
  const outfit = allOutfits(assets)[identifier];
  return Math.max(
    outfit?.max || 1,
    outfit?.eff?.weapon ? makeLoadout(assets, ship.hull).outfits[identifier] || 0 : 0,
  );
}

// Factory equipment is included in the hull price, not a second retail purchase.
// Reserve at most half that price for removable stock gear; the rest is chassis.
/**
 * Calculates stock outfits, chassis value, and equipment price scale for a hull.
 * @param assets - Game assets.
 * @param hull - Hull ID.
 */
export function loadoutBasis(
  assets: GameAssets,
  hull: number | string,
): { stock: Record<string, number>; chassis: number; scale: number } {
  const stock = makeLoadout(assets, hull),
    allOutfits2 = allOutfits(assets);
  const retail = Object.entries(stock.outfits).reduce(
    (value, [identifier, count]) => value + (allOutfits2[identifier]?.cost || 0) * count,
    0,
  );
  const gear = Math.min(retail, Math.max(0, assets.ships[hull]?.cost || 0) * 0.5);
  return {
    stock: stock.outfits,
    chassis: Math.max(0, (assets.ships[hull]?.cost || 0) - gear),
    scale: retail ? gear / retail : 0,
  };
}

// Named hull prices are recruitment fees; rush repairs use actual factory kit replacement value.
/**
 * Calculates repair cost basis for hull and factory kit.
 * @param assets - Game assets.
 * @param hull - Hull ID.
 * @returns Repair base cost.
 */
export function repairBasis(assets: GameAssets, hull: number | string): number {
  const cost = assets.ships[hull]?.cost || 0;
  if (!(WINGMATES as readonly (number | string)[]).includes(hull)) return cost;
  const allOutfits2 = allOutfits(assets),
    stock = makeLoadout(assets, hull);
  return Math.max(
    cost,
    Object.entries(stock.outfits).reduce(
      (value, [identifier, count]) => value + (allOutfits2[identifier]?.cost || 0) * count,
      0,
    ),
  );
}

// Old saves predate provenance: count only equipment still present, up to the factory kit.
// Initialize before buying/removing equipment so subsequent paid replacements remain retail-valued.
/**
 * Ensures a ship loadout records its original factory equipment.
 * @param assets - Game assets.
 * @param ship - Ship loadout.
 * @returns Normalized stock outfits record.
 */
export function ensureStockOutfits(assets: GameAssets, ship: ShipLoadout): Record<string, number> {
  const { stock } = loadoutBasis(assets, ship.hull);
  if (!ship.stockOutfits || typeof ship.stockOutfits !== 'object') ship.stockOutfits = { ...stock };
  for (const identifier of Object.keys(ship.stockOutfits)) {
    const count = Math.max(
      0,
      Math.min(
        Math.floor(ship.stockOutfits[identifier]) || 0,
        stock[identifier] || 0,
        ship.outfits?.[identifier] || 0,
      ),
    );
    if (count) ship.stockOutfits[identifier] = count;
    else delete ship.stockOutfits[identifier];
  }
  return ship.stockOutfits;
}

/**
 * Calculates trade-in resale value of a ship and its installed outfits.
 * @param assets - Game assets.
 * @param ship - Ship loadout.
 * @returns Net credit trade-in value.
 */
export function loadoutValue(assets: GameAssets, ship: ShipLoadout): number {
  const { stock, chassis, scale } = loadoutBasis(assets, ship.hull),
    allOutfits2 = allOutfits(assets);
  let value = chassis;
  for (const [identifier, count] of Object.entries(ship.outfits || {})) {
    const original = Math.max(
      0,
      Math.min(
        count,
        stock[identifier] || 0,
        ship.stockOutfits ? ship.stockOutfits[identifier] || 0 : stock[identifier] || 0,
      ),
    );
    value += (allOutfits2[identifier]?.cost || 0) * (count - original + original * scale);
  }
  return Math.round(value * 0.5);
}

// Call before decrementing outfits. Stock is sold first; paid additions retain normal resale.
/**
 * Calculates refund value when selling an installed outfit from a ship.
 * @param assets - Game assets.
 * @param ship - Ship loadout.
 * @param identifier - Outfit ID.
 * @param count - Quantity being sold.
 * @returns Credit refund value.
 */
export function outfitSaleValue(
  assets: GameAssets,
  ship: ShipLoadout,
  identifier: string | number,
  count: number,
): number {
  const originals = ensureStockOutfits(assets, ship),
    { scale } = loadoutBasis(assets, ship.hull);
  const count2 = Math.max(0, Math.min(count, ship.outfits?.[identifier] || 0));
  const original = Math.min(count2, originals[identifier] || 0),
    outfit = allOutfits(assets)[identifier];
  originals[identifier] = (originals[identifier] || 0) - original;
  if (!originals[identifier]) delete originals[identifier];
  return Math.round((outfit?.cost || 0) * (count2 - original + original * scale) * 0.5);
}

/**
 * Percentage and flat stat bonuses affecting ship performance.
 * ShipStatsBonus fields:
 * [shieldPct]: - Shield capacity bonus percent.
 * [armorPct]: - Armor hit point bonus percent.
 * [speedPct]: - Top speed bonus percent.
 * [turnPct]: - Turning rate bonus percent.
 * [accelPct]: - Acceleration bonus percent.
 * [cargoPct]: - Cargo capacity bonus percent.
 * [shieldRePct]: - Shield recharge rate bonus percent.
 * [fuelRe]: - Fuel regeneration rate addition.
 * [fuel]: - Flat additional jump fuel capacity.
 * [jumpFast]: - Whether fast jump drive spools are enabled.
 * [damagePct]: - Weapon damage bonus percent.
 */

/**
 * Live calculated flight, combat, and capacity attributes for an equipped ship.
 * ComputedShipStats fields:
 * towRig: - Installed industrial towing capability.
 * hull: - Hull identifier.
 * name: - Ship model name.
 * size: - Visual sprite size.
 * mass: - Total mass.
 * maxSpeed: - Max flight speed in Rift units.
 * accel: - Acceleration rate in Rift units.
 * turn: - Turn rate in radians per second.
 * shield: - Max shield capacity.
 * armor: - Max armor hit points.
 * shieldRe: - Shield recharge per second in Rift units.
 * armorRe: - Armor repair per second in Rift units.
 * fuel: - Maximum jump fuel.
 * fuelRe: - Fuel regen rate per second.
 * cargo: - Cargo capacity in tons.
 * space: - Total outfit space available.
 * used: - Outfit space occupied by installed equipment.
 * free: - Remaining outfit space available.
 * guns: - Number of active fixed guns.
 * turrets: - Number of active turrets.
 * maxGuns: - Maximum gun mounts on the hull.
 * maxTurrets: - Maximum turret mounts on the hull.
 * afterburner: - Afterburner boost tier / capability.
 * cloak: - Cloaking device enabled flag (0 or 1).
 * multiJump: - Consecutive hyperdrive jump range.
 * jumpFast: - Fast jump drive spool flag (0 or 1).
 * weapons: - Map of weapon ID to mounted count.
 * damageMul: - Final outgoing damage multiplier.
 */

/**
 * Computes live operational flight, combat, and cargo stats from hull, fitted outfits, and captain bonuses.
 * @param assets - Game assets collection.
 * @param ship - Player ship state or loadout.
 * @param bonus - Research and crew stat bonuses.
 * @returns Live computed ship statistics, or null if hull not found.
 */
// The ship a player is flying: hull + bought outfits (+ research bonuses) -> live stats.
export function shipStats(
  assets: GameAssets,
  ship: ShipStatsLoadout,
  bonus: ShipStatsBonus = {},
): ComputedShipStats | null {
  const shipHullAsset = assets.ships[ship.hull];
  if (!shipHullAsset) return null;
  const allOutfits2 = allOutfits(assets);
  let shield = shipHullAsset.shield,
    armor = shipHullAsset.armor,
    accel2 = shipHullAsset.accel,
    speed = shipHullAsset.speed,
    turn = shipHullAsset.turn,
    cargo = shipHullAsset.cargo,
    fuel = shipHullAsset.fuel,
    shieldRe = shipHullAsset.shieldRe,
    armorRe = shipHullAsset.armorRe,
    fuelRe = shipHullAsset.fuelRe,
    used = 0,
    guns = 0,
    turrets = 0,
    afterburner = 0,
    cloak = 0,
    multiJump = 1,
    jumpFast = shipHullAsset.fastJump ? 1 : 0;
  const weapons: Record<string, number> = {}; // weapon id -> count
  const builtIn = ship.fixed !== undefined ? ship.fixed : shipHullAsset.weapons;
  for (const [width, count] of builtIn) weapons[width] = (weapons[width] || 0) + count;
  for (const [identifier, count] of Object.entries(ship.outfits || {})) {
    const outfit = allOutfits2[identifier];
    if (!outfit || !count) continue;
    used += (outfit.mass || 0) * count;
    const event = outfit.eff || {};
    if (event.weapon) {
      weapons[event.weapon] = (weapons[event.weapon] || 0) + count;
      if (outfit.turret) turrets += count;
      else guns += count;
    }
    shield += (event.shield || 0) * count;
    armor += (event.armor || 0) * count;
    accel2 += (event.accel || 0) * count;
    speed += (event.speed || 0) * count;
    turn += (event.turn || 0) * count;
    cargo += (event.cargo || 0) * count;
    fuel += (event.fuel || 0) * count;
    shieldRe += (event.shieldRe || 0) * count;
    armorRe += (event.armorRe || 0) * count;
    fuelRe += (event.fuelRe || 0) * count;
    afterburner = Math.max(afterburner, event.afterburner || 0);
    if (event.cloak) cloak = 1;
    if (event.multiJump) multiJump = Math.max(multiJump, event.multiJump);
    if (event.jumpSpeed) jumpFast = 1;
  }
  shield *= 1 + (bonus.shieldPct || 0) / 100;
  armor *= 1 + (bonus.armorPct || 0) / 100;
  speed *= 1 + (bonus.speedPct || 0) / 100;
  turn *= 1 + (bonus.turnPct || 0) / 100;
  accel2 *= 1 + (bonus.accelPct || 0) / 100;
  cargo = Math.round(cargo * (1 + (bonus.cargoPct || 0) / 100));
  shieldRe *= 1 + (bonus.shieldRePct || 0) / 100;
  fuelRe += (bonus.fuelRe || 0) * 30;
  fuel += bonus.fuel || 0;
  if (bonus.jumpFast) jumpFast = 1;
  return {
    towRig:
      Number(shipHullAsset.id) === 815 ||
      (cargo >= 60 &&
        !['fighter', 'interceptor'].includes(shipHullAsset.role!) &&
        Object.entries(ship.outfits || {}).some(
          ([identifier, count]) => count > 0 && !!allOutfits2[identifier]?.eff?.towRig,
        )),
    hull: shipHullAsset.id,
    name: shipHullAsset.name,
    size: shipHullAsset.size,
    mass: shipHullAsset.mass,
    maxSpeed: speed * physicsConstants.speed,
    accel: accel2 * physicsConstants.accel,
    turn: (turn * physicsConstants.turn * Math.PI) / 180,
    shield: Math.round(shield),
    armor: Math.round(armor),
    shieldRe: Math.max(0.5, shieldRe * physicsConstants.shieldRe),
    armorRe: armorRe * physicsConstants.armorRe,
    fuel,
    fuelRe: fuelRe / 30,
    cargo,
    passengerSeats: passengerSeats(shipHullAsset, ship),
    space: shipHullAsset.space + (ship.bonusSpace || 0),
    used,
    free: shipHullAsset.space + (ship.bonusSpace || 0) - used,
    guns,
    turrets,
    maxGuns: shipHullAsset.guns,
    maxTurrets: shipHullAsset.turrets,
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
 * StationState fields:
 * [ops]: - Station operations tier.
 * [done]: - List of completed research technology IDs.
 * [queue]: - In-progress research jobs.
 */

/**
 * Aggregates all completed station research project stat bonuses.
 * @param station - Personal station state object containing `done` research ID list.
 * @returns Aggregated stat bonuses.
 */
export function researchBonus(station: StationState | null | undefined): Record<string, number> {
  const secondValue: Record<string, number> = {};
  for (const researchNode of RESEARCH)
    if (station && station.done && station.done.includes(researchNode.id))
      for (const [entryKey, value] of Object.entries(researchNode.bonus))
        secondValue[entryKey] = (secondValue[entryKey] || 0) + value;
  return secondValue;
}

/**
 * Officer data record structure.
 * OfficerRecord fields:
 * id: - Unique officer ID.
 * role: - Officer division / role (e.g. 'tactical', 'helm').
 * rarity: - Rarity tier (e.g. 'common', 'rare', 'epic').
 * lv: - Level of the officer (starts at 1).
 * rank: - Rank index (1.2 rank multiplier).
 * [race]: - Alien or human race identifier.
 * [traits]: - Special innate traits.
 */

/**
 * Calculates a single officer's individual stat contributions based on role, level, rarity, and rank.
 * @param officer - Officer state record.
 * @returns Map of stat names to bonus values.
 */
// one officer's stat values: base x rarity, +10% per level above 1
export function officerStats(officer: OfficerRecord): Record<string, number> {
  const result: Record<string, number> = {},
    officerRole = ROLES[officer.role],
    multiplier =
      RARITY[officer.rarity].mult * (1 + 0.1 * (officer.lv - 1)) * RANK_MULT(officer.rank); // rank adds 12% each
  for (const stat of officerRole.stats)
    result[stat] = Math.round(STAT_BASE[stat] * multiplier * 10) / 10;
  return result;
}

/**
 * Computes combined stat bonuses from all officers assigned to bridge stations,
 * including captain multiplier (1.25x), officer traits, and racial synergy bonuses.
 * @param officers - Hired officers roster.
 * @param bridge - Bridge slot map of slot name to officer ID.
 * @returns Cumulative bridge stat bonuses.
 */
// bridge officers (captain slot counts 1.25x) plus race synergy when two or more of a race share the bridge
export function officerBonus(
  officers: OfficerRecord[] | null | undefined,
  bridge: Record<string, string | number | null> | null | undefined,
): Record<string, number> {
  const secondValue: Record<string, number> = {},
    races: Record<string, number> = {};
  if (!officers || !bridge) return secondValue;
  for (const slot of BRIDGE_SLOTS) {
    const officer = officers.find((officerRecord) => officerRecord.id === bridge[slot]);
    if (!officer) continue;
    const entryKey = slot === 'captain' ? 1.25 : 1;
    for (const [state, value] of Object.entries(officerStats(officer)))
      secondValue[state] = (secondValue[state] || 0) + value * entryKey;
    for (const time of officer.traits || [])
      if (TRAITS[time])
        for (const [state, value] of Object.entries(TRAITS[time].bonus))
          secondValue[state] = (secondValue[state] || 0) + value; // traits
    races[officer.race!] = (races[officer.race!] || 0) + 1;
  }
  for (const [radius, count] of Object.entries(races))
    if (count >= 2 && SYNERGY[radius])
      for (const [state, value] of Object.entries(SYNERGY[radius]))
        secondValue[state] = (secondValue[state] || 0) + value;
  return secondValue;
}

/**
 * Aggregates all active player modifications: station research, bridge officers, and lower-deck crew.
 * @param playerData - Full player save state.
 * @returns Total unified stat bonuses.
 */
// everything that modifies a captain's ship: research + bridge crew
export function captainBonus(playerData: PlayerData): Record<string, number> {
  const researchBonus2 = researchBonus(playerData.station),
    officerBonus2 = officerBonus(playerData.officers, playerData.bridge);
  for (const [entryKey, value] of Object.entries(officerBonus2))
    researchBonus2[entryKey] = (researchBonus2[entryKey] || 0) + value;
  for (const component of playerData.lower || [])
    if (LOWER_DECK[component!])
      for (const [entryKey, value] of Object.entries(LOWER_DECK[component!].bonus))
        researchBonus2[entryKey] = (researchBonus2[entryKey] || 0) + value; // lower-deck crew
  return researchBonus2;
}

/**
 * Resolved operational weapon parameters in Rift simulation units.
 * WeaponConfig fields:
 * beam: - Whether weapon is an instant beam weapon.
 * speed: - Projectile travel speed.
 * life: - Projectile lifetime in seconds.
 * range: - Effective maximum firing range.
 * reload: - Cooldown reload delay between shots in seconds.
 * turret: - Whether weapon is mounted on a turret.
 * arc: - Turret firing arc limit in radians (0 for 360 degree).
 * homing: - Whether projectile homes on targeted ship.
 * pd: - Whether weapon acts as point-defense against munitions.
 * bay: - Whether weapon is a fighter launch bay.
 * rocket: - Whether weapon fires unguided rockets.
 * inacc: - Inaccuracy spread angle in radians.
 * dmgA: - Armor damage dealt per hit or second.
 * dmgS: - Shield damage dealt per hit or second.
 * continuous: - Whether beam fires continuously without cycling.
 * color: - Hex color code for rendering projectile or beam.
 * look: - Projectile visual graphic style.
 * blast: - Area-of-effect blast radius.
 * ion: - Ion damage disabling ship systems.
 */

/**
 * Converts raw weapon asset definitions into live physics and combat parameters.
 * @param weaponAsset - Raw weapon definition from asset registry.
 * @returns Configured weapon parameters.
 */
// Weapon parameters in Rift units
export function weaponParams(weaponAsset: WeaponAsset): WeaponConfig {
  const beam =
    weaponAsset.type === 'beam' ||
    weaponAsset.type === 'turretbeam' ||
    weaponAsset.type === 'pdbeam';
  const speed = Math.max(200, (weaponAsset.speed || 1000) * physicsConstants.shot);
  const life = Math.max(0.4, ((weaponAsset.duration || 30) / 30) * 1.4);
  return {
    beam,
    speed,
    life,
    range: beam ? weaponAsset.beamLen || 360 : speed * life,
    reload: Math.max(1, weaponAsset.reload || 1) / 30,
    turret:
      weaponAsset.type === 'turret' ||
      weaponAsset.type === 'turretbeam' ||
      weaponAsset.type === 'pd' ||
      weaponAsset.type === 'pdbeam',
    arc:
      weaponAsset.type === 'frontturret'
        ? Math.PI / 6
        : weaponAsset.type === 'rearturret'
          ? Math.PI / 6
          : 0,
    homing: weaponAsset.type === 'homing',
    pd: weaponAsset.type === 'pd' || weaponAsset.type === 'pdbeam',
    bay: weaponAsset.type === 'bay',
    rocket: weaponAsset.type === 'rocket',
    inacc: ((weaponAsset.inacc || 0) * Math.PI) / 180,
    dmgA: Math.max(0, weaponAsset.dmgA || 0),
    dmgS: Math.max(0, weaponAsset.dmgS || 0),
    continuous: beam && !(weaponAsset.reload > 0),
    color: weaponColor(weaponAsset),
    look: weaponLook(weaponAsset),
    blast: weaponAsset.blast || 0,
    ion: weaponAsset.ion || 0,
  };
}

/**
 * Default beam colors indexed by weapon ID.
 */
export const BEAM_COLORS: Record<number, string> = {
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
 * @param weaponAsset - Weapon asset definition.
 * @returns Sound effect resource ID.
 */
// Stable sound references for weapon effects, with a nearest-match fallback.
export function weaponSound(weaponAsset: WeaponAsset): number {
  if (weaponAsset.sound! >= 36) return 200 + weaponAsset.sound!;
  const weapon = weaponParams(weaponAsset);
  if (weapon.homing) return 238;
  if (weapon.beam) return 240;
  if (weapon.pd) return 236;
  if (weapon.bay) return 239;
  return weaponAsset.dmgA + weaponAsset.dmgS > 40 ? 241 : 236;
}

/**
 * Physics entity moving in 2D space.
 * FlightEntity fields:
 * x: - Current X position coordinate.
 * y: - Current Y position coordinate.
 * vx: - Current velocity vector X component.
 * vy: - Current velocity vector Y component.
 * a: - Heading angle in radians (0 = up, clockwise).
 * fuel: - Current remaining fuel.
 * [towCap]: Hard attached velocity cap.
 */

/**
 * Flight control inputs for a single simulation step.
 * FlightInput fields:
 * [thrust]: - Forward main thruster active.
 * [turn]: - Turning control input (-1 left, 0 neutral, 1 right).
 * [ab]: - Afterburner boost active.
 * [rev]: - Reverse thrusters / face retrograde active.
 * [navigation]: - Automatic navigation controls.
 */

/**
 * Advances flight physics for an entity by one simulation time step.
 * @param flightEntity - Ship entity state modified in place.
 * @param computedShipStats - Ship performance attributes.
 * @param flightInput - Flight control inputs.
 * @param deltaTime - Step duration in seconds.
 */
// Flight: one fixed step. input: {thrust: 0/1, turn: -1/0/1, ab: 0/1, rev: 0/1}
export function step(
  flightEntity: FlightEntity,
  computedShipStats: ComputedShipStats,
  flightInput: FlightInput,
  deltaTime: number = tickDuration,
): void {
  const navigationBrake = flightInput.navigation && flightInput.rev,
    drift = navigationBrake ? Math.hypot(flightEntity.vx, flightEntity.vy) : 0,
    navigationSettled =
      navigationBrake && drift <= Math.max(2, computedShipStats.accel * deltaTime * 0.55);
  if (flightInput.rev) {
    if (!navigationSettled) {
      // turn to face against the direction of travel
      const want = wrap(Math.atan2(flightEntity.vx, -flightEntity.vy) + Math.PI);
      let angDiff2 = angDiff(want, flightEntity.a);
      const time = computedShipStats.turn * deltaTime;
      flightEntity.a += Math.abs(angDiff2) < time ? angDiff2 : Math.sign(angDiff2) * time;
    }
  } else flightEntity.a += (flightInput.turn || 0) * computedShipStats.turn * deltaTime;
  flightEntity.a = wrap(flightEntity.a);
  let account = flightInput.thrust ? computedShipStats.accel : 0,
    maxSpeed2 = computedShipStats.maxSpeed;
  if (flightInput.ab && computedShipStats.afterburner && flightEntity.fuel > 0) {
    account *= 1.8;
    maxSpeed2 *= 1.4;
    flightEntity.fuel -= 0.3;
  }
  if (navigationSettled) account = 0;
  // Delayed navigation input can remain held after the final braking pulse.
  // Once aligned, stop at zero rather than reverse drift and chase it through
  // another half-turn. Manual retrograde/thrust retains its existing physics.
  if (
    navigationBrake &&
    account * deltaTime >= drift &&
    (drift < 1e-8 ||
      Math.abs(
        angDiff(wrap(Math.atan2(flightEntity.vx, -flightEntity.vy) + Math.PI), flightEntity.a),
      ) < 1e-8)
  ) {
    flightEntity.vx = flightEntity.vy = 0;
    account = 0;
  }
  if (account) {
    flightEntity.vx += Math.sin(flightEntity.a) * account * deltaTime;
    flightEntity.vy -= Math.cos(flightEntity.a) * account * deltaTime;
  }
  const space = Math.hypot(flightEntity.vx, flightEntity.vy);
  if (space > maxSpeed2) {
    const entryKey = Math.max(maxSpeed2 / space, 1 - 2 * deltaTime);
    flightEntity.vx *= entryKey;
    flightEntity.vy *= entryKey;
  }
  // Tow is a hard physical limit after all acceleration/afterburner/catchup, before displacement.
  if (Number.isFinite(flightEntity.towCap) && flightEntity.towCap! > 0) {
    const speed = Math.hypot(flightEntity.vx, flightEntity.vy);
    if (speed > flightEntity.towCap!) {
      flightEntity.vx *= flightEntity.towCap! / speed;
      flightEntity.vy *= flightEntity.towCap! / speed;
    }
  }
  flightEntity.x += flightEntity.vx * deltaTime;
  flightEntity.y += flightEntity.vy * deltaTime;
}

/**
 * Wraps an angle in radians into the interval (-PI, PI].
 * @param firstValue - Angle in radians.
 * @returns Normalized angle in radians.
 */
export function wrap(firstValue: number): number {
  while (firstValue > Math.PI) firstValue -= 2 * Math.PI;
  while (firstValue < -Math.PI) firstValue += 2 * Math.PI;
  return firstValue;
}

/**
 * Computes the signed shortest angular difference between two angles in radians.
 * @param firstValue - First angle.
 * @param secondValue - Second angle.
 * @returns Angular difference between (-PI, PI].
 */
export function angDiff(firstValue: number, secondValue: number): number {
  return wrap(firstValue - secondValue);
}

/**
 * Computes heading angle in radians from an origin entity to a destination coordinate (0 = up, clockwise).
 * @param event - Origin entity coordinates.
 * @param positionX - Target X coordinate.
 * @param positionY - Target Y coordinate.
 * @returns Angle in radians.
 */
export function angleTo(
  event: { x: number; y: number },
  positionX: number,
  positionY: number,
): number {
  return Math.atan2(positionX - event.x, -(positionY - event.y));
} // 0 = up, clockwise

/**
 * Calculates current market trading price for a commodity at a stellar station or planet, including time drift.
 * @param stellar - Stellar object with market prices map.
 * @param captainId - Commodity identifier.
 * @param time - Timestamp for deterministic market price drift.
 * @returns Current trade price in credits, or null if commodity not traded.
 */
// Prices at a stellar for a commodity (level -1 / 0 / 1), with a slow drift by time so markets move
export function price(
  stellar: { id: string; prices?: Record<string, number> },
  captainId: string,
  time: number = Date.now(),
): number | null {
  const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === captainId);
  const level = stellar.prices && stellar.prices[captainId];
  if (level === undefined || !commodityDef) return null;
  const drift = 1 + 0.06 * Math.sin(time / 3.6e6 + captainId.length * 1.7 + stellar.id.length);
  return Math.round(commodityDef.base * (1 + 0.28 * level) * drift);
}

/**
 * Determines whether two faction identifiers are mutually hostile.
 * @param firstValue - First faction ID.
 * @param secondValue - Second faction ID.
 * @returns True if either faction considers the other an enemy.
 */
export function hostileFactions(
  firstValue: string | null | undefined,
  secondValue: string | null | undefined,
): boolean {
  if (!firstValue || !secondValue || firstValue === secondValue) return false;
  return (
    (FACTIONS[firstValue] && FACTIONS[firstValue].hostile.includes(secondValue)) ||
    (FACTIONS[secondValue] && FACTIONS[secondValue].hostile.includes(firstValue))
  );
}

/**
 * Returns descriptive standing tier label corresponding to a numerical reputation score.
 * @param value2 - Reputation value.
 * @returns Reputation label.
 */
export function repLabel(
  value: number,
): 'Exalted' | 'Honored' | 'Friendly' | 'Neutral' | 'Wanted' | 'Hunted' {
  return value >= EXALTED_STANDING
    ? 'Exalted'
    : value >= 50
      ? 'Honored'
      : value >= 20
        ? 'Friendly'
        : value > -20
          ? 'Neutral'
          : value > -50
            ? 'Wanted'
            : 'Hunted';
}

/**
 * Formats a credit amount into a human-readable display string (e.g. "1.25M" or "25,000").
 * @param count2 - Credit balance.
 * @returns Formatted credits string.
 */
export function credits(count: number): string {
  count = Math.round(count || 0);
  return count >= 1e6
    ? (count / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
    : count.toLocaleString('en-US');
}

/**
 * Checks whether a given color hex string represents unset / black color.
 * @param component - Color hex string.
 * @returns True if color is null, empty, or black.
 */
// Legacy projectile records can use black as an unset colour; supply a visible fallback.
const isBlack = (component: string | null | undefined) =>
  !component || /^#?0{3}(0{3})?$/i.test(component);

/**
 * Determines the display render color for a weapon projectile or beam.
 * @param weaponAsset - Weapon asset definition.
 * @returns Hex color string.
 */
export function weaponColor(weaponAsset: WeaponAsset): string {
  if (!weaponAsset) return '#ffd27a';
  if (!isBlack(weaponAsset.color)) return weaponAsset.color!;
  const beam =
    weaponAsset.type === 'beam' ||
    weaponAsset.type === 'turretbeam' ||
    weaponAsset.type === 'pdbeam';
  return BEAM_COLORS[weaponAsset.id] || (beam ? '#ff6a4a' : '#ffd27a');
}

/**
 * Mapping of weapon IDs to their projectile visual sprite or rendering style.
 */
// How a projectile is drawn: bolt, rail, pulse, missile, rocket, torp, sing, mine, flak, pd, shard, spit, magma
export const WEAPON_LOOKS: Record<number, string> = {
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
 * @param weaponAsset - Weapon asset definition.
 * @returns Projectile visual style name.
 */
export function weaponLook(weaponAsset: WeaponAsset): string {
  if (!weaponAsset) return 'bolt';
  if (WEAPON_LOOKS[weaponAsset.id]) return WEAPON_LOOKS[weaponAsset.id];
  if (weaponAsset.look) return weaponAsset.look;
  if (weaponAsset.type === 'homing')
    return weaponAsset.dmgA + weaponAsset.dmgS > 150 ? 'torp' : 'missile';
  if (weaponAsset.type === 'rocket') return 'rocket';
  if (weaponAsset.type === 'pd') return 'pd';
  return 'bolt';
}

/**
 * A* pathfinding algorithm computing the shortest and safest hyperspace jump route between two star systems.
 * @param starSystem - Star systems dictionary keyed by system ID.
 * @param from - Origin system ID.
 * @param destination - Destination system ID.
 * @returns Ordered array of system IDs to jump through (excluding origin).
 */
// A* route between systems: fewest jumps, preferring safer systems when two routes are the same length
export function route(
  starSystem: Record<
    string,
    { x: number; y: number; danger: number; links: string[]; gate?: string }
  >,
  from: string,
  destination: string,
): string[] {
  if (!starSystem[from] || !starSystem[destination]) return [];
  const height = (identifier: string) =>
    Math.hypot(
      starSystem[identifier].x - starSystem[destination].x,
      starSystem[identifier].y - starSystem[destination].y,
    ) / 240;
  const game = { [from]: 0 },
    previous: Record<string, string | null> = { [from]: null },
    open = new Set([from]);
  while (open.size) {
    let current: string | null = null,
      infinity = Infinity;
    for (const open2 of open) {
      const factionId = game[open2] + height(open2);
      if (factionId < infinity) {
        infinity = factionId;
        current = open2;
      }
    }
    if (current === destination) break;
    open.delete(current!);
    for (const length of starSystem[current!].gate
      ? [...starSystem[current!].links, starSystem[current!].gate!]
      : starSystem[current!].links) {
      const component = game[current!] + 1 + starSystem[length].danger * 0.08;
      if (component < (game[length] ?? Infinity)) {
        game[length] = component;
        previous[length] = current;
        open.add(length);
      }
    }
  }
  if (!(destination in previous)) return [];
  const radius = [];
  let destination2: string | null = destination;
  while (destination2 && destination2 !== from) {
    radius.unshift(destination2);
    destination2 = previous[destination2];
  }
  return radius;
}
