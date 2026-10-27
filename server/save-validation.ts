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

/**
 * Validate present compatibility fields before any default/refund owner mutates them.
 * Missing/null legacy default fields remain the owner's responsibility. Unknown
 * append-only fields are retained; this is not a closed schema for the whole game.
 */
export function validateFeaturePlayerSave(value: unknown): void {
  const saved = record(value);
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
  for (const key of ['friends', 'freqIn', 'freqOut', 'blocks', 'explored'])
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
