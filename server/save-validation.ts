import type { GameAssets } from '../shared/rules.ts';
import { allOutfits } from '../shared/rules.ts';
import { SYS, STELLARS, MATERIALS, COMMODITIES, GRADES } from '../shared/galaxy.ts';
import type { PlayerAccount } from './db.ts';
import { validateTutorialSave } from './save-migrations.ts';

type SavedRecord = Record<string, unknown>;
const maximumCollectionEntries = 100000;

function reject(): never {
  // Do not include save values, captain identities or parser excerpts in diagnostics.
  throw new Error('Invalid feature save');
}
function record(value: unknown): SavedRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  const result = value as SavedRecord;
  if (Object.keys(result).length > maximumCollectionEntries) reject();
  return result;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > maximumCollectionEntries) reject();
  return value;
}
function finite(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) reject();
}
function count(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) reject();
}
function text(value: unknown) {
  if (typeof value !== 'string') reject();
}
function boolean(value: unknown) {
  if (typeof value !== 'boolean') reject();
}
function optional(fields: SavedRecord, key: string, check: (value: unknown) => unknown) {
  if (fields[key] != null) check(fields[key]);
}
function numbers(value: unknown) {
  for (const amount of Object.values(record(value))) count(amount);
}
function strings(value: unknown) {
  for (const item of list(value)) text(item);
}
function progress(value: unknown) {
  const saved = record(value);
  optional(saved, 'step', count);
  optional(saved, 'done', boolean);
  optional(saved, 'active', (active) => {
    const entry = record(active);
    optional(entry, 'got', count);
    optional(entry, 'ready', boolean);
  });
}

/** Validate money, time and continuous progress without rejecting ordinary fractions. */
function boundedNumber(value: unknown, minimum = 0): void {
  finite(value);
  if ((value as number) < minimum || (value as number) > Number.MAX_SAFE_INTEGER) reject();
}

/** Inventory dictionaries cannot address object internals during later migrations. */
function dictionary(value: unknown): SavedRecord {
  const fields = record(value);
  if (Object.keys(fields).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
    reject();
  return fields;
}

function inventory(value: unknown): void {
  for (const amount of Object.values(dictionary(value))) count(amount);
}

function shipFields(value: unknown, assets?: GameAssets): void {
  const ship = record(value);
  if (typeof ship.hull !== 'string' && typeof ship.hull !== 'number') reject();
  if (typeof ship.hull === 'number') count(ship.hull);
  if (assets && !Object.hasOwn(assets.ships, ship.hull as string)) reject();
  for (const key of ['outfits', 'stockOutfits', 'ammo']) optional(ship, key, inventory);
  optional(ship, 'name', text);
  optional(ship, 'uid', text);
  optional(ship, 'bonusSpace', boundedNumber);
  optional(ship, 'fixed', (value) => {
    for (const bank of list(value)) {
      const fields = list(bank);
      if (fields.length < 2 || fields.length > 3) reject();
      if (typeof fields[0] !== 'number' && typeof fields[0] !== 'string') reject();
      count(fields[1]);
      if (fields[2] !== undefined) count(fields[2]);
      if (assets && !Object.hasOwn(assets.weapons, fields[0] as string)) reject();
    }
  });
  if (assets) {
    inventory(ship.outfits);
    inventory(ship.ammo);
    const outfits = allOutfits(assets);
    for (const key of Object.keys((ship.outfits || {}) as SavedRecord))
      if (!Object.hasOwn(outfits, key)) reject();
    for (const key of Object.keys((ship.ammo || {}) as SavedRecord))
      if (!Object.hasOwn(assets.weapons, key)) reject();
  }
}

/** Present core fields are checked before writes as well as before compatibility owners run. */
function coreFields(saved: SavedRecord): void {
  optional(saved, 'credits', boundedNumber);
  optional(saved, 'ship', shipFields);
  for (const key of ['cargo', 'storage', 'tokens']) optional(saved, key, inventory);
  optional(saved, 'mats', (value) => {
    for (const amounts of Object.values(dictionary(value))) {
      const grades = list(amounts);
      if (grades.length !== GRADES.length) reject();
      for (const amount of grades) count(amount);
    }
  });
  optional(saved, 'rep', (value) => {
    for (const reputation of Object.values(dictionary(value)))
      boundedNumber(reputation, -Number.MAX_SAFE_INTEGER);
  });
  optional(saved, 'stats', (value) => {
    for (const amount of Object.values(dictionary(value))) boundedNumber(amount);
  });
  for (const key of ['fuel', 'shieldNow', 'armorNow', 'created', 'saveTime'])
    optional(saved, key, boundedNumber);
  for (const key of ['sys', 'lastStellar']) optional(saved, key, text);
  if (saved.stellar !== null) optional(saved, 'stellar', text);
  optional(saved, 'missions', (value) => {
    for (const mission of list(value)) {
      const fields = record(mission);
      for (const key of ['id', 'type', 'title', 'sys', 'dest', 'cid', 'text'])
        optional(fields, key, text);
      for (const key of ['qty', 'pax', 'need', 'got', 'reward', 'poolReward'])
        optional(fields, key, boundedNumber);
      for (const key of ['done', 'paid', 'failed', 'lost', 'boarded'])
        optional(fields, key, boolean);
    }
  });
  optional(saved, 'station', (value) => {
    const station = record(value);
    optional(station, 'claimed', boolean);
    optional(station, 'site', text);
    optional(station, 'ops', (value) => {
      count(value);
      if ((value as number) > 5) reject();
    });
    for (const key of ['refUnits', 'refT']) optional(station, key, boundedNumber);
    for (const key of ['done', 'queue']) optional(station, key, strings);
    optional(station, 'active', (value) => {
      const active = record(value);
      text(active.id);
      boundedNumber(active.ends);
      optional(active, 'from', boundedNumber);
    });
  });
}

/**
 * Import requires the original core save fields, not later feature defaults.
 * Existing feature markers and cargo-ledger versions retain their migration owners.
 * Unknown append-only feature fields are preserved; catalog references used at login
 * must resolve before replacing a Solo slot.
 */
export function validateImportedPlayerSave(value: unknown, assets: GameAssets): void {
  validateFeaturePlayerSave(value);
  const saved = record(value);
  for (const key of [
    'credits',
    'sys',
    'ship',
    'cargo',
    'mats',
    'rep',
    'missions',
    'station',
    'stats',
  ])
    if (saved[key] === undefined || saved[key] === null) reject();
  if (typeof saved.sys !== 'string' || !Object.hasOwn(SYS, saved.sys)) reject();
  if (
    saved.stellar !== null &&
    (typeof saved.stellar !== 'string' ||
      !Object.hasOwn(STELLARS, saved.stellar) ||
      STELLARS[saved.stellar].system !== saved.sys)
  )
    reject();
  shipFields(saved.ship, assets);
  const stats = record(saved.stats);
  for (const key of ['kills', 'jumps', 'earned']) boundedNumber(stats[key]);
  const station = record(saved.station);
  for (const key of ['claimed', 'ops', 'refUnits', 'refT', 'done'])
    if (station[key] === undefined || station[key] === null) reject();
  if (station.claimed && (typeof station.site !== 'string' || !STELLARS[station.site]?.site))
    throw new Error('Unknown station location in the save.');
  for (const [key, values] of Object.entries(dictionary(saved.mats))) {
    if (!MATERIALS.includes(key) || list(values).length !== GRADES.length) reject();
  }
  for (const material of MATERIALS)
    if (!Object.hasOwn(saved.mats as SavedRecord, material)) reject();
  for (const key of ['cargo', 'storage'])
    for (const commodity of Object.keys((saved[key] || {}) as SavedRecord))
      if (!COMMODITIES.some(({ id }) => id === commodity)) reject();
  for (const value of list(saved.missions)) {
    const mission = record(value);
    if (
      typeof mission.id !== 'string' ||
      !mission.id ||
      typeof mission.type !== 'string' ||
      !mission.type
    )
      reject();
    if (
      mission.sys !== undefined &&
      (typeof mission.sys !== 'string' || !Object.hasOwn(SYS, mission.sys))
    )
      reject();
    if (mission.cid !== undefined && !COMMODITIES.some(({ id }) => id === mission.cid)) reject();
  }
  for (const entry of saved.dock ? list(saved.dock) : []) shipFields(record(entry).ship, assets);
}

/**
 * Validate present compatibility fields before any default/refund owner mutates them.
 * Missing/null legacy default fields remain the owner's responsibility. Unknown
 * append-only fields are retained; this is not a closed schema for the whole game.
 */
export function validateFeaturePlayerSave(value: unknown): void {
  const saved = record(value);
  coreFields(saved);
  for (const key of ['credits', 'syn', 'credit', 'shards']) if (key in saved) finite(saved[key]);
  optional(saved, 'v26', boolean);
  optional(saved, 'tradeLoss', count);
  optional(saved, 'mastery', (value) => {
    for (const amount of Object.values(record(value))) {
      finite(amount);
      if ((amount as number) < 0) reject();
    }
  });
  optional(saved, 'nextUid', count);
  validateTutorialSave(saved as Pick<PlayerAccount, 'tut' | 'tutV'>);
  for (const key of ['directives', 'parts', 'spec', 'bp']) optional(saved, key, numbers);
  for (const key of ['friends', 'freqIn', 'freqOut', 'blocks', 'explored', 'charted'])
    optional(saved, key, strings);
  optional(saved, 'lower', (value) => {
    for (const member of list(value)) if (member !== null) text(member);
  });
  for (const key of ['shuttles', 'officers', 'mail', 'log'])
    optional(saved, key, (value) => {
      for (const entry of list(value)) record(entry);
    });
  optional(saved, 'bridge', record);
  optional(saved, 'station', (value) => {
    const station = record(value);
    optional(station, 'queue', list);
  });
  optional(saved, 'dock', (value) => {
    for (const stored of list(value)) {
      const entry = record(stored);
      record(entry.ship);
      optional(entry, 'bridge', record);
      optional(entry, 'escorts', (value) => {
        for (const escort of list(value)) {
          if (typeof escort === 'number') count(escort);
          else record(record(escort).ship);
        }
      });
    }
  });
  optional(saved, 'docks', (value) => {
    for (const dock of list(value)) {
      const entry = record(dock);
      if (entry.lead !== null) text(entry.lead);
      for (const wing of list(entry.wings)) if (wing !== null) text(record(wing).uid);
    }
  });
  optional(saved, 'activeDock', count);
  optional(saved, 'holdout', (value) => {
    const holdout = record(value);
    optional(holdout, 'best', count);
    optional(holdout, 'lastT', finite);
    optional(holdout, 'active', record);
  });
  optional(saved, 'story', (value) => {
    const story = record(value);
    optional(story, 'step', count);
    optional(story, 'done', strings);
    optional(story, 'flags', record);
    optional(story, 'pass', boolean);
    optional(story, 'active', (value) => {
      const active = record(value);
      text(active.id);
      optional(active, 'got', count);
      optional(active, 'spawned', boolean);
      optional(active, 'ready', boolean);
    });
  });
  optional(saved, 'arcs', (value) => {
    for (const arc of Object.values(record(value))) progress(arc);
  });
  optional(saved, 'specState', (value) => {
    for (const state of Object.values(record(value))) {
      const specialist = record(state);
      count(specialist.tier);
      numbers(specialist.comp);
      optional(specialist, 'upT', finite);
    }
  });
}

/** Validate compatibility containers before Game can initialize or pay legacy refunds. */
export function validateFeatureWorldSave(value: unknown): void {
  const saved = record(value);
  for (const key of ['armadas', 'colonies', 'rivals', 'states', 'stateCool', 'tradeImpact'])
    optional(saved, key, record);
  for (const key of ['orders', 'news', 'flash']) optional(saved, key, list);
  optional(saved, 'nextOrder', count);
  optional(saved, 'fleets', (value) => {
    for (const fleet of Object.values(record(value))) {
      const entry = record(fleet);
      if ('bank' in entry) count(entry.bank);
      optional(entry, 'members', strings);
      text(entry.leader);
    }
  });
  // Detailed version-1 validation remains with the existing world feature owner.
  for (const key of ['mining', 'refinery', 'industrial', 'towing'])
    if (key in saved && record(saved[key]).version !== 1) reject();
}

/** Read-only boundary check shared by local journals and native checkpoint loads. */
export function validateFeatureSnapshots(players: unknown, world: unknown) {
  for (const account of Object.values(record(players))) validateFeaturePlayerSave(account);
  validateFeatureWorldSave(world);
}
