import type { Session } from './game.ts';
import type { NetworkMessage } from './message-registry.ts';
import type { MiningContact, SavedMiningLoot } from './mining-contracts.ts';
import type { LootItem, Rock } from './space.ts';
export type Generation = import('./mining-contracts.ts').SavedRockGeneration;
export type Capabilities = import('./mining-contracts.ts').MiningCapabilities;
export type World = import('./mining-contracts.ts').SavedMiningWorld;
export type Space = import('./mining-contracts.ts').MiningSpace;
export type Parcel = import('./mining-contracts.ts').MiningParcel;

// @ts-check
import {
  MINING,
  seedOf,
  randomOf,
  stageCount,
  rollGrades,
  contactTime,
} from '../shared/mining-rules.ts';
import { INDUSTRIAL } from '../shared/industrial-rules.ts';
import { splitLots } from '../shared/cargo-lots.ts';

/** @import { Session } from './game.ts' */
/** @import { NetworkMessage } from './message-registry.ts' */
/** @import { MiningContact, SavedMiningLoot } from './mining-contracts.ts' */
/** @import { LootItem, Rock } from './space.ts' */
/** @typedef {import('./mining-contracts.ts').SavedRockGeneration} Generation */
/** @typedef {import('./mining-contracts.ts').MiningCapabilities} Capabilities */
/** @typedef {import('./mining-contracts.ts').SavedMiningWorld} World */
/** @typedef {import('./mining-contracts.ts').MiningSpace} Space */
/** @typedef {import('./mining-contracts.ts').MiningParcel} Parcel */
/** @param {Capabilities} capabilities @returns {World} */
function world(capabilities: Capabilities): World {
  const miningWorld = capabilities.db.world.mining;
  if (!miningWorld) throw new Error('Mining not initialized');
  return miningWorld;
}
/** Validate persisted JSON before exposing any rocks or changing world. No repair/minting.
 * @param {World} miningWorld */
function validate(miningWorld: World) {
  if (
    miningWorld.version !== 1 ||
    !Number.isFinite(miningWorld.clock) ||
    miningWorld.clock < 0 ||
    !Number.isSafeInteger(miningWorld.nextId) ||
    miningWorld.nextId >= 0 ||
    !miningWorld.systems ||
    typeof miningWorld.systems !== 'object'
  )
    throw new Error('Invalid mining save/version');
  const identifiers = new Set();
  for (const savedField of Object.values(miningWorld.systems)) {
    if (
      typeof savedField.config !== 'string' ||
      !Array.isArray(savedField.rocks) ||
      !Array.isArray(savedField.parcels) ||
      !Array.isArray(savedField.history)
    )
      throw new Error('Invalid mining field');
    for (const generation of [...savedField.rocks, ...savedField.history]) {
      if (
        !Number.isSafeInteger(generation.id) ||
        generation.id >= 0 ||
        generation.id <= miningWorld.nextId ||
        identifiers.has(generation.id)
      )
        throw new Error('Invalid mining identity');
      identifiers.add(generation.id);
      for (const count of [
        generation.generation,
        generation.stage,
        generation.stages,
        generation.seed,
        generation.baseBudget,
        generation.pending,
        generation.accepted,
        generation.expired,
        generation.discarded,
        generation.emitted,
      ])
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid mining count');
      for (const count of [
        generation.x,
        generation.y,
        generation.r,
        generation.max,
        generation.hp,
        generation.heat,
        generation.work,
        generation.updated,
        generation.down,
        generation.seam,
        generation.releaseAt,
        generation.releaseHeat,
      ])
        if (!Number.isFinite(count)) throw new Error('Invalid mining geometry/state');
      if (
        generation.lastActivity !== undefined &&
        (!Number.isFinite(generation.lastActivity) ||
          generation.lastActivity < 0 ||
          generation.lastActivity > miningWorld.clock)
      )
        throw new Error('Invalid mining activity clock');
      if (
        (generation.dredgeToken !== undefined && typeof generation.dredgeToken !== 'boolean') ||
        (generation.sweepCut !== undefined && typeof generation.sweepCut !== 'boolean') ||
        (generation.dredgeWork !== undefined &&
          (!Number.isFinite(generation.dredgeWork) || generation.dredgeWork < 0))
      )
        throw Error('Invalid industrial mining provenance');
      if (
        generation.dredgeContributors !== undefined &&
        (!generation.dredgeContributors ||
          typeof generation.dredgeContributors !== 'object' ||
          Array.isArray(generation.dredgeContributors) ||
          Object.keys(generation.dredgeContributors).length > 64 ||
          !Object.entries(generation.dredgeContributors).every(
            ([name, count]) =>
              name.length > 0 &&
              name.length <= 64 &&
              Number.isFinite(count) &&
              count >= 0 &&
              count <= 1.5,
          ))
      )
        throw Error('Invalid industrial mining contributors');
      if (
        generation.stage > generation.stages ||
        generation.stages < 1 ||
        generation.stages > 3 ||
        generation.heat < 0 ||
        generation.heat > 100 ||
        generation.work < 0 ||
        generation.updated < 0 ||
        generation.updated > miningWorld.clock ||
        generation.releaseAt < 0 ||
        generation.releaseHeat < 0 ||
        generation.releaseHeat > 100 ||
        ![generation.ready, generation.penalty, generation.penaltyApplied].every(
          (value) => typeof value === 'boolean',
        ) ||
        generation.hp < 0 ||
        generation.hp > generation.max ||
        generation.max <= 0 ||
        !Array.isArray(generation.tokens) ||
        !generation.tokens.every((positionX) => typeof positionX === 'boolean') ||
        !Array.isArray(generation.leases) ||
        !generation.leases.every(
          (miningLease) =>
            Number.isFinite(miningLease.from) &&
            Number.isFinite(miningLease.to) &&
            miningLease.from >= 0 &&
            miningLease.to >= miningLease.from &&
            miningLease.to - miningLease.from <= 1.000001 &&
            typeof miningLease.seam === 'boolean' &&
            (miningLease.captain === undefined ||
              miningLease.captain === null ||
              typeof miningLease.captain === 'string'),
        ) ||
        !generation.seen ||
        typeof generation.seen !== 'object' ||
        !Object.values(generation.seen).every(
          (time) => Number.isFinite(time) && time >= 0 && time <= miningWorld.clock,
        ) ||
        typeof generation.key !== 'string' ||
        !['ore', 'gas', 'shards'].includes(generation.ore)
      )
        throw new Error('Invalid mining generation');
      if (
        generation.budget !== -1 &&
        (!Number.isSafeInteger(generation.budget) ||
          generation.budget < 0 ||
          generation.accepted + generation.expired + generation.discarded + generation.pending >
            generation.budget)
      )
        throw new Error('Invalid mining budget');
    }
    for (const miningLoot of savedField.parcels) {
      if (
        !Number.isSafeInteger(miningLoot.id) ||
        miningLoot.id >= 0 ||
        miningLoot.id <= miningWorld.nextId ||
        identifiers.has(miningLoot.id)
      )
        throw new Error('Invalid mining parcel identity');
      identifiers.add(miningLoot.id);
      const gradeLots = miningLoot.it.remainingLots;
      if (
        !gradeLots ||
        !(
          /** @type {const} */ ((['common', 'rich', 'pure'] as const)).every(
            (entryKey) => Number.isSafeInteger(gradeLots[entryKey]) && gradeLots[entryKey] >= 0,
          )
        ) ||
        typeof miningLoot.it.generationKey !== 'string' ||
        ![...savedField.rocks, ...savedField.history].some(
          (generation) =>
            generation.key === miningLoot.it.generationKey && generation.ore === miningLoot.it.ore,
        ) ||
        !Array.isArray(miningLoot.it.progressionTokens) ||
        !miningLoot.it.progressionTokens.every(
          (time) =>
            Number.isSafeInteger(time) &&
            time >= 0 &&
            [...savedField.rocks, ...savedField.history].some(
              (generation) =>
                generation.key === miningLoot.it.generationKey && time < generation.tokens.length,
            ),
        ) ||
        !Number.isFinite(miningLoot.expires)
      )
        throw new Error('Invalid mining parcel');
    }
    for (const generation of [...savedField.rocks, ...savedField.history])
      if (generation.budget >= 0) {
        const floating = savedField.parcels
          .filter((miningLoot) => miningLoot.it.generationKey === generation.key)
          .reduce((count, miningLoot) => count + quantity(miningLoot.it), 0);
        if (
          generation.accepted +
            floating +
            generation.pending +
            generation.expired +
            generation.discarded !==
          generation.budget
        )
          throw new Error('Mining conservation failure');
      }
  }
}
/** @param {Parcel} parcel */
function quantity(parcel: Parcel) {
  return parcel.remainingLots.common + parcel.remainingLots.rich + parcel.remainingLots.pure;
}
/** @param {World} miningWorld @param {Space} space @param {number} factionIndex @param {number} index @param {{x:number,y:number,r:number,ore:string,rich:number,minor?:boolean}} factionId @param {number} generation @returns {Generation} */
function generate(
  miningWorld: World,
  space: Space,
  factionIndex: number,
  index: number,
  factionId: { x: number; y: number; r: number; ore: string; rich: number; minor?: boolean },
  generation: number,
): Generation {
  const entryKey = `${space.id}:${factionIndex}:${index}:${generation}`,
    seed = seedOf(entryKey),
    random = randomOf(seed),
    firstValue = random() * Math.PI * 2,
    distance = Math.sqrt(random()) * factionId.r,
    radius = Math.round(16 + random() * (factionId.minor ? 7 : 30)),
    maximum = Math.round(
      (radius *
        (factionId.ore === 'gas' ? 6 : factionId.ore === 'shards' ? 12 : 9) *
        (1 + factionId.rich * 0.5)) /
        stageCount(radius),
    ),
    count = Math.max(1, Math.round(radius / 14)) + (factionId.rich - 1);
  let baseBudget = 0;
  for (let innerIndex = 0; innerIndex < count; innerIndex++)
    baseBudget += factionId.rich + (random() < 0.4 ? 1 : 0);
  return {
    id: miningWorld.nextId--,
    x: Math.round(factionId.x + Math.cos(firstValue) * distance),
    y: Math.round(factionId.y + Math.sin(firstValue) * distance),
    r: radius,
    ore: factionId.ore,
    rich: factionId.rich,
    hp: maximum,
    max: maximum,
    down: 0,
    evT: 0,
    key: entryKey,
    generation,
    seed,
    stage: 0,
    stages: stageCount(radius),
    heat: 0,
    work: 0,
    updated: miningWorld.clock,
    lastActivity: miningWorld.clock,
    releaseAt: 0,
    releaseHeat: 0,
    ready: false,
    penalty: false,
    penaltyApplied: false,
    baseBudget,
    budget: -1,
    pending: 0,
    accepted: 0,
    expired: 0,
    discarded: 0,
    emitted: 0,
    tokens: Array(count).fill(false),
    leases: [],
    seen: {},
    captain: null,
    lastCut: null,
    seam: random() * Math.PI * 2,
  };
}
/** @param {Capabilities} capabilities @param {Space} space @param {Generation} generation @param {boolean} clean */
function emit(capabilities: Capabilities, space: Space, generation: Generation, clean: boolean) {
  const miningWorld = world(capabilities),
    savedField = miningWorld.systems[space.id];
  // One generation opportunity: qualifying useful-contact contributor, never last damage.
  // Cap each of the first 64 participants at the 1.5s threshold; ties use account order.
  const contributor = Object.entries(generation.dredgeContributors || {})
    .filter(([, seconds]) => seconds >= 1.5 - 1e-9)
    .map(([name]) => name)
    .sort()[0];
  if (!generation.dredgeToken && generation.stages > 1 && contributor) {
    const playerAccount = capabilities.db.get(contributor);
    if (playerAccount) {
      generation.dredgeToken = true;
      capabilities.dredgeBlueprint(contributor, INDUSTRIAL.blueprintChance);
    }
  }
  generation.lastCut = generation.sweepCut
    ? 'sweep'
    : generation.heat >= 100
      ? 'overheat'
      : clean
        ? 'clean'
        : 'ordinary';
  if (generation.budget < 0) {
    const account = generation.captain ? capabilities.db.get(generation.captain) : null;
    const rawData =
      generation.baseBudget *
      (1 + (account ? capabilities.bonus(account).miningPct || 0 : 0) / 100) *
      capabilities.mods(space.id).mining;
    const randomOf2 = randomOf(generation.seed ^ 123456);
    generation.budget = Math.floor(rawData) + (randomOf2() < rawData % 1 ? 1 : 0);
    generation.pending = generation.budget;
  }
  if ((generation.heat >= MINING.overheat || generation.penalty) && !generation.penaltyApplied) {
    generation.penalty = true;
    generation.penaltyApplied = true;
    const keep = Math.floor(generation.pending * 0.75);
    generation.discarded += generation.pending - keep;
    generation.pending = keep;
  }
  const remainingStages = generation.stages - generation.stage,
    count =
      remainingStages === 1 ? generation.pending : Math.floor(generation.pending / remainingStages),
    random = randomOf(generation.seed ^ ((generation.stage + 1) * 17293)),
    lots = generation.sweepCut ? sweepGrades(count, random) : rollGrades(count, clean, random),
    clusters = Math.min(count, 2 + Math.floor(random() * 3));
  const tokenIds = generation.tokens
    .map((unused, index) => index)
    .filter((index) => index % generation.stages === generation.stage);
  for (let innerIndex = 0; innerIndex < clusters; innerIndex++) {
    const quantity = Math.ceil((lots.common + lots.rich + lots.pure) / (clusters - innerIndex)),
      part = splitLots(lots, quantity);
    for (const entryKey of /** @type {const} */ (['common', 'rich', 'pure'] as const))
      lots[entryKey] -= part[entryKey];
    const parcel = {
      id: miningWorld.nextId--,
      x: generation.x + (random() - 0.5) * generation.r,
      y: generation.y + (random() - 0.5) * generation.r,
      vx: (random() - 0.5) * 30,
      vy: (random() - 0.5) * 30,
      t: space.t,
      kind: { ore: 2, gas: 3, shards: 4 }[generation.ore] || 2,
      expires: miningWorld.clock + MINING.parcelTTL,
      it: {
        ore: generation.ore,
        rich: generation.rich,
        n: quantity,
        remainingLots: part,
        generationKey: generation.key,
        parcelKey: `${generation.key}:${generation.stage}:${innerIndex}`,
        progressionTokens: tokenIds.filter((unused, index) => index % clusters === innerIndex),
      },
    };
    savedField.parcels.push(parcel);
    space.loot.push(parcel);
  }
  generation.pending -= count;
  generation.emitted += count;
  generation.stage++;
  generation.ready = false;
  generation.work = 0;
  generation.leases = [];
  generation.releaseAt = 0;
  if (generation.stage >= generation.stages) {
    generation.down =
      miningWorld.clock +
      ((100 + random() * 60) / (capabilities.mods(space.id).regrow || 1)) *
        capabilities.pressureRegrow(space, generation);
    generation.hp = generation.max;
    space.events.push(
      ['rock', generation.id, 0],
      ['boom', generation.x, generation.y, generation.r * 1.2],
    );
  } else {
    generation.hp = generation.max;
    space.events.push(
      ['rock', generation.id, 100],
      ['boom', generation.x, generation.y, generation.r * 0.6],
    );
  }
  capabilities.db.touch();
}
/** @param {Capabilities} capabilities @param {Space} space @param {Generation} generation @param {number} [clock2] */
function update(
  capabilities: Capabilities,
  space: Space,
  generation: Generation,
  clock2: number = world(capabilities).clock,
) {
  if (clock2 < generation.updated) throw new Error('Mining clock moved backwards');
  if (generation.down) return;
  // Integrate each contact/cooling segment in time order. Quiet systems can observe
  // both a threshold crossing and trailing cooling in the same update.
  const points = [generation.updated, clock2];
  for (const miningLease of generation.leases)
    if (miningLease.to > generation.updated && miningLease.from < clock2)
      points.push(Math.max(generation.updated, miningLease.from), Math.min(clock2, miningLease.to));
  points.sort((firstValue, secondValue) => firstValue - secondValue);
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1],
      point = points[index];
    if (point <= from) continue;
    const { seconds, seamSeconds } = contactTime(generation.leases, from, point);
    if (seconds > 0) {
      const heated = generation.heat + seconds * MINING.heatRate;
      const crosses = heated >= MINING.overheat - 1e-9;
      const useful =
        crosses && generation.ready
          ? Math.max(0, (MINING.overheat - generation.heat) / MINING.heatRate)
          : seconds;
      generation.dredgeWork = (generation.dredgeWork || 0) + useful;
      generation.work += useful * (1 + (seamSeconds > 0 ? 0.25 : 0));
      const captains = [
        ...new Set(
          generation.leases
            .filter(
              (miningLease) =>
                miningLease.from < point && miningLease.to > from && miningLease.captain,
            )
            .map((miningLease) => /** @type {string} */ (miningLease.captain as string)),
        ),
      ];
      const contributions = (generation.dredgeContributors ||= Object.create(null));
      for (const name of captains) {
        if (!Object.hasOwn(contributions, name) && Object.keys(contributions).length >= 64)
          continue;
        const seconds2 = contactTime(
          generation.leases.filter((miningLease) => miningLease.captain === name),
          from,
          point,
        ).seconds;
        Object.defineProperty(contributions, name, {
          value: Math.min(
            1.5,
            (Object.hasOwn(contributions, name) ? contributions[name] : 0) +
              (seconds2 * useful) / seconds,
          ),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      capabilities.pressureWork(space, generation, useful, captains);
      generation.heat = crosses ? MINING.overheat : heated;
      generation.releaseHeat = generation.heat;
      generation.releaseAt = point + MINING.grace;
      if (crosses) {
        generation.penalty = true; // Latched even if not ready, including across trailing cooling.
        if (generation.ready) {
          emit(capabilities, space, generation, false);
          // Emission ends this stage's leases at the crossing, not at observation.
          generation.heat = Math.max(
            0,
            generation.heat - (clock2 - from - useful) * MINING.cooling,
          );
          break;
        }
      }
    } else generation.heat = Math.max(0, generation.heat - (point - from) * MINING.cooling);
  }
  generation.updated = clock2;
  if (
    generation.ready &&
    generation.releaseAt &&
    clock2 > generation.releaseAt &&
    generation.leases.every((miningLease) => miningLease.to < clock2 - MINING.grace)
  )
    emit(
      capabilities,
      space,
      generation,
      generation.work >= MINING.cleanWork &&
        generation.work >= MINING.acquire &&
        generation.releaseHeat >= 60 &&
        generation.releaseHeat <= 80,
    );
  generation.leases = generation.leases.filter((miningLease) => miningLease.to > clock2 - 1);
  for (const [entryKey, time] of Object.entries(generation.seen))
    if (time < clock2 - 10) delete generation.seen[entryKey];
}
/** @param {number} count @param {()=>number} random */
function sweepGrades(count: number, random: () => number) {
  const lots = { common: 0, rich: 0, pure: 0 };
  for (let index = 0; index < count; index++) lots[random() < 0.03 ? 'rich' : 'common']++;
  return lots;
}
export const MiningOperations = {
  /** Stable across restart/sleep; a fresh projectile cannot alias a saved consumed shot.
   * @this {Capabilities} @returns {number} */
  shotId(this: Capabilities) {
    const identifier = world(this).nextId--;
    this.db.touch();
    return identifier;
  },
  /** @this {Capabilities} */
  init(this: Capabilities) {
    if (this.db.world.mining) {
      validate(this.db.world.mining); // No offline work from stale saved collision leases.
      for (const savedField of Object.values(this.db.world.mining.systems))
        for (const generation of [...savedField.rocks, ...savedField.history]) {
          generation.leases = [];
          // Legacy saves have no reliable last-hit time: grant a full quiet interval.
          generation.lastActivity ??= this.db.world.mining.clock;
        }
      this.db.touch();
    } else {
      this.db.world.mining = { version: 1, clock: 0, nextId: -1, systems: {} };
      this.db.touch();
    }
  },
  /** @this {Capabilities} @param {number} deltaTime */
  advanceClock(this: Capabilities, deltaTime: number) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0 || deltaTime > 1)
      throw new Error('Invalid mining timestep');
    if (this.paused()) return;
    world(this).clock += deltaTime;
    this.db.touch();
  },
  /** @this {Capabilities} @param {Space} space */
  openSpace(this: Capabilities, space: Space) {
    const miningWorld = world(this),
      config = JSON.stringify(space.sys.fields || []);
    let savedField = miningWorld.systems[space.id];
    if (savedField && savedField.config !== config) {
      const previous = JSON.parse(savedField.config),
        next = space.sys.fields || [];
      // Only reviewed append-only industrial fields migrate. Old geometry, stable keys,
      // unspent mass and outstanding original parcels are never regenerated or reminted.
      if (
        !Array.isArray(previous) ||
        next.length < previous.length ||
        JSON.stringify(next.slice(0, previous.length)) !== savedField.config ||
        !next
          .slice(previous.length)
          .every((positionX) => positionX.industrial === true && positionX.minor === true)
      )
        throw new Error(`Mining field config changed in ${space.id}; explicit migration required`);
      for (let length2 = previous.length; length2 < next.length; length2++)
        for (let index = 0; index < next[length2].rocks; index++)
          savedField.rocks.push(generate(miningWorld, space, length2, index, next[length2], 0));
      savedField.config = config;
      this.db.touch();
    }
    if (!savedField) {
      savedField = { config, rocks: [], parcels: [], history: [] };
      for (const [factionIndex, field] of (space.sys.fields || []).entries())
        for (let index = 0; index < field.rocks; index++)
          savedField.rocks.push(generate(miningWorld, space, factionIndex, index, field, 0));
      miningWorld.systems[space.id] = savedField;
      this.db.touch();
    }
    space.rocks = savedField.rocks;
    space.loot.push(...savedField.parcels);
    this.endTick(space);
  },
  /** @this {Capabilities} @param {Space} space @param {Rock} rock @param {MiningContact} miningContact */
  contact(this: Capabilities, space: Space, rock: Rock, miningContact: MiningContact) {
    const generation = world(this).systems[space.id]?.rocks.find(
      (savedRockGeneration) => savedRockGeneration === rock,
    );
    if (
      !generation ||
      generation.down ||
      !Number.isFinite(miningContact.damage) ||
      miningContact.damage < 0
    )
      return;
    const clock2 = world(this).clock,
      contactId2 = miningContact.source.contactId;
    if (Object.hasOwn(generation.seen, contactId2)) return;
    // A later arrival cannot extend an already expired ready-stage deadline.
    // Beams cover the preceding frame; compare against contact start so a
    // contiguous beam is not mistakenly cooled before its frame is admitted.
    const from = miningContact.projectile ? clock2 : Math.max(0, clock2 - 1 / 30),
      previousEnd = Math.max(
        generation.releaseAt ? generation.releaseAt - MINING.grace : 0,
        ...generation.leases.map((miningLease) => miningLease.to),
      );
    if (generation.ready && previousEnd && previousEnd + MINING.grace < from) {
      // Settle only through incoming contact start. Advancing to observation
      // now would consume a retrospective beam's first frame as cooling.
      update(this, space, generation, Math.max(generation.updated, from));
      if (generation.down) return;
    }
    generation.lastActivity = clock2;
    generation.seen[contactId2] = clock2;
    generation.captain = miningContact.source.captain;
    const angle = Math.atan2(miningContact.y - generation.y, miningContact.x - generation.x),
      delta = Math.abs(
        Math.atan2(Math.sin(angle - generation.seam), Math.cos(angle - generation.seam)),
      ),
      seam = delta < MINING.seamWidth;
    generation.leases.push({
      from: miningContact.projectile ? clock2 : Math.max(0, clock2 - 1 / 30),
      to: miningContact.projectile
        ? clock2 + Math.min(1, Math.max(1 / 30, miningContact.source.cadence))
        : clock2,
      seam,
      captain: miningContact.source.captain,
    });
    generation.hp = Math.max(0, generation.hp - miningContact.damage * 6 * (seam ? 1.25 : 1));
    if (!generation.hp) generation.ready = true;
    this.db.touch();
  },
  /** Sweep never finishes a clean-ready or multistage rock; same finite root budget.
   * @this {Capabilities} @param {Space} space @param {Rock} rock @param {number} damage @param {string} captain */
  sweep(this: Capabilities, space: Space, rock: Rock, damage: number, captain: string) {
    const generation = world(this).systems[space.id]?.rocks.find(
      (savedRockGeneration) => savedRockGeneration === rock,
    );
    if (
      !generation ||
      generation.down ||
      generation.stages !== 1 ||
      generation.ready ||
      generation.work > 0 ||
      !Number.isFinite(damage) ||
      damage <= 0
    )
      return 0;
    generation.lastActivity = world(this).clock;
    const spent = Math.min(generation.hp, damage);
    generation.hp -= spent;
    generation.captain = captain;
    if (generation.hp <= 0) {
      generation.sweepCut = true;
      emit(this, space, generation, false);
    }
    this.db.touch();
    return spent;
  },
  /** @this {Capabilities} @param {Space} space @param {Rock} rock @param {number} damage @param {string|null} [captain] */
  ordinary(
    this: Capabilities,
    space: Space,
    rock: Rock,
    damage: number,
    captain: string | null = null,
  ) {
    const generation = world(this).systems[space.id]?.rocks.find(
      (savedRockGeneration) => savedRockGeneration === rock,
    );
    if (!generation || generation.down || !Number.isFinite(damage) || damage <= 0) return;
    generation.lastActivity = world(this).clock;
    generation.hp = Math.max(0, generation.hp - damage);
    if (!generation.hp) {
      generation.captain = captain;
      emit(this, space, generation, false);
    }
    this.db.touch();
  },
  /** @this {Capabilities} @param {Space} space */
  endTick(this: Capabilities, space: Space) {
    const miningWorld = world(this),
      savedField = miningWorld.systems[space.id];
    if (!savedField) return;
    for (let index = 0; index < savedField.rocks.length; index++) {
      const generation = savedField.rocks[index];
      update(this, space, generation);
      const abandoned =
        !generation.down &&
        (generation.hp < generation.max ||
          generation.stage > 0 ||
          generation.work > 0 ||
          generation.ready) &&
        miningWorld.clock - (generation.lastActivity ?? generation.updated) >= MINING.idleRenewal &&
        !generation.ready &&
        generation.leases.every((miningLease) => miningLease.to + MINING.grace < miningWorld.clock);
      if ((generation.down && miningWorld.clock >= generation.down) || abandoned) {
        // Retire, never reset, a generation: original parcels retain their ledger,
        // while unextracted material is explicitly discarded before natural renewal.
        // Unissued generations have no escrow/progression to retain in history.
        if (generation.budget >= 0) {
          generation.discarded += generation.pending;
          generation.pending = 0;
          savedField.history.push(generation);
        }
        const [_unusedSystem, factionIndex, rowIndex] = generation.key.split(':');
        savedField.rocks[index] = generate(
          miningWorld,
          space,
          Number(factionIndex),
          Number(rowIndex),
          (space.sys.fields || [])[Number(factionIndex)],
          generation.generation + 1,
        );
        space.events.push(['rock', generation.id, 0]);
        this.db.touch();
      }
    }
    space.rocks = savedField.rocks;
    for (const miningLoot of savedField.parcels) {
      if (miningLoot.expires <= miningWorld.clock && quantity(miningLoot.it) > 0) {
        const generation = [...savedField.rocks, ...savedField.history].find(
          (savedRockGeneration) => savedRockGeneration.key === miningLoot.it.generationKey,
        );
        if (generation) {
          generation.expired += quantity(miningLoot.it);
          miningLoot.it.remainingLots = { common: 0, rich: 0, pure: 0 };
        }
        miningLoot.taken = true;
        this.db.touch();
      }
    }
    savedField.parcels = savedField.parcels.filter(
      (miningLoot) => !miningLoot.taken && quantity(miningLoot.it) > 0,
    );
    space.loot = space.loot.filter(
      (floatingLoot) =>
        !('generationKey' in floatingLoot.it) ||
        savedField.parcels.includes(
          /** @type {SavedMiningLoot} */ (floatingLoot as SavedMiningLoot),
        ),
    );
    // No settled history is retained. Live parcels pin their original ledger until
    // accepted/expired; unsettled or inconsistent records remain for validation.
    const live = new Set(savedField.parcels.map((miningLoot) => miningLoot.it.generationKey));
    const history = savedField.history.filter(
      (generation) =>
        live.has(generation.key) ||
        generation.budget < 0 ||
        generation.pending > 0 ||
        generation.accepted + generation.expired + generation.discarded !== generation.budget,
    );
    if (history.length !== savedField.history.length) {
      savedField.history = history;
      this.db.touch();
    }
  },
  /** @this {Capabilities} @param {Space} space */
  suspendSpace(this: Capabilities, space: Space) {
    this.endTick(space);
    this.db.touch();
  },
  /** @this {Capabilities} @param {Session} session @param {NetworkMessage & {op?:string}} request */
  survey(this: Capabilities, session: Session, request: NetworkMessage & { op?: string }) {
    const entity = session.ent,
      miningWorld = world(this);
    if (
      request.op !== 'survey' ||
      Object.keys(request).some((entryKey) => !['t', 'op'].includes(entryKey))
    )
      return false;
    if (
      !session.data ||
      !entity ||
      entity.dead ||
      entity.disabled ||
      entity.state !== 'fly' ||
      session.data.stellar ||
      this.paused()
    )
      return false;
    const savedSurvey = session.data.miningSurvey;
    if (savedSurvey && (!Number.isFinite(savedSurvey.cooldownUntil) || savedSurvey.version !== 1))
      return false;
    if (savedSurvey && miningWorld.clock < savedSurvey.cooldownUntil) return false;
    session.data.miningSurvey = {
      version: 1,
      cooldownUntil: miningWorld.clock + 10,
      revealUntil: miningWorld.clock + 6,
      sys: session.data.sys,
      x: entity.x,
      y: entity.y,
    };
    this.db.touch();
    return true;
  },
  /** @this {Capabilities} @param {Space} space @returns {MiningRocksWire} */
  rocksPayload(this: Capabilities, space: Space) {
    this.endTick(space);
    return {
      version: 1,
      now: world(this).clock,
      rocks: (world(this).systems[space.id]?.rocks || []).map((generation) => ({
        id: generation.id,
        x: generation.x,
        y: generation.y,
        r: generation.r,
        ore: generation.ore,
        generation: generation.generation,
        stage: generation.stage,
        stages: generation.stages,
        hp: generation.down ? 0 : Math.round((generation.hp / generation.max) * 100),
        heat: generation.heat,
        work: generation.work,
        ready: generation.ready,
        lastCut: generation.lastCut,
        acquired: generation.work >= 0.6,
        down: !!generation.down,
        gas: generation.ore === 'gas',
      })),
    };
  },
  /** @this {Capabilities} @param {Session} session @param {Space} space @returns {MiningPrivateWire} */
  payload(this: Capabilities, session: Session, space: Space) {
    const clock2 = world(this).clock,
      survey = session.data.miningSurvey;
    return {
      version: 1,
      now: clock2,
      cooldownUntil: survey?.cooldownUntil || 0,
      revealUntil: survey?.revealUntil || 0,
      revealed:
        survey && survey.version === 1 && survey.sys === space.id && survey.revealUntil > clock2
          ? (world(this).systems[space.id]?.rocks || [])
              .filter(
                (generation) =>
                  !generation.down &&
                  Math.hypot(generation.x - survey.x, generation.y - survey.y) <= MINING.radius,
              )
              .map((generation) => ({
                id: generation.id,
                generation: generation.generation,
                seam: generation.seam,
                potential: 'common / rich / pure',
                hazard: generation.ore === 'gas' || generation.seed % 7 === 0 ? 'volatile' : 'none',
              }))
          : [],
    };
  },
  /** @this {Capabilities} @param {Session} session @param {LootItem} item @param {number} count */
  collected(this: Capabilities, session: Session, item: LootItem, count: number) {
    if (!item.generationKey) return;
    const miningWorld = world(this);
    for (const savedField of Object.values(miningWorld.systems)) {
      const generation = [...savedField.rocks, ...savedField.history].find(
        (savedRockGeneration) => savedRockGeneration.key === item.generationKey,
      );
      if (!generation) continue;
      generation.accepted += count;
      this.pressureExtract(session, count);
      for (const token of item.progressionTokens || [])
        if (!generation.tokens[token]) {
          generation.tokens[token] = true;
          this.specOnMine(session, item);
        }
      this.db.touch();
      return;
    }
    throw new Error('Unknown mining generation');
  },
};
