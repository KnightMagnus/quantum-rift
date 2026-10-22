// @ts-check
import {
  MINING,
  seedOf,
  randomOf,
  stageCount,
  rollGrades,
  contactTime,
} from '../shared/mining-rules.js';
import { INDUSTRIAL } from '../shared/industrial-rules.js';
import { splitLots } from '../shared/cargo-lots.js';

/** @import { Session } from './game.js' */
/** @import { NetworkMessage } from './message-registry.js' */
/** @import { MiningContact, MiningPrivateWire, MiningRocksWire, SavedMiningLoot } from './mining-contracts.js' */
/** @import { LootItem, Rock } from './space.js' */
/** @typedef {import('./mining-contracts.js').SavedRockGeneration} Generation */
/** @typedef {import('./mining-contracts.js').MiningCapabilities} Capabilities */
/** @typedef {import('./mining-contracts.js').SavedMiningWorld} World */
/** @typedef {import('./mining-contracts.js').MiningSpace} Space */
/** @typedef {import('./mining-contracts.js').MiningParcel} Parcel */
/** @param {Capabilities} capabilities @returns {World} */
function world(capabilities) {
  const miningWorld = capabilities.db.world.mining;
  if (!miningWorld) throw new Error('Mining not initialized');
  return miningWorld;
}
/** Validate persisted JSON before exposing any rocks or changing world. No repair/minting.
 * @param {World} miningWorld */
function validate(miningWorld) {
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
  const ids = new Set();
  for (const f of Object.values(miningWorld.systems)) {
    if (
      typeof f.config !== 'string' ||
      !Array.isArray(f.rocks) ||
      !Array.isArray(f.parcels) ||
      !Array.isArray(f.history)
    )
      throw new Error('Invalid mining field');
    for (const generation of [...f.rocks, ...f.history]) {
      if (
        !Number.isSafeInteger(generation.id) ||
        generation.id >= 0 ||
        generation.id <= miningWorld.nextId ||
        ids.has(generation.id)
      )
        throw new Error('Invalid mining identity');
      ids.add(generation.id);
      for (const n of [
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
        if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid mining count');
      for (const n of [
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
        if (!Number.isFinite(n)) throw new Error('Invalid mining geometry/state');
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
            ([name, n]) =>
              name.length > 0 && name.length <= 64 && Number.isFinite(n) && n >= 0 && n <= 1.5,
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
          (v) => typeof v === 'boolean',
        ) ||
        generation.hp < 0 ||
        generation.hp > generation.max ||
        generation.max <= 0 ||
        !Array.isArray(generation.tokens) ||
        !generation.tokens.every((x) => typeof x === 'boolean') ||
        !Array.isArray(generation.leases) ||
        !generation.leases.every(
          (l) =>
            Number.isFinite(l.from) &&
            Number.isFinite(l.to) &&
            l.from >= 0 &&
            l.to >= l.from &&
            l.to - l.from <= 1.000001 &&
            typeof l.seam === 'boolean' &&
            (l.captain === undefined || l.captain === null || typeof l.captain === 'string'),
        ) ||
        !generation.seen ||
        typeof generation.seen !== 'object' ||
        !Object.values(generation.seen).every(
          (t) => Number.isFinite(t) && t >= 0 && t <= miningWorld.clock,
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
    for (const miningLoot of f.parcels) {
      if (
        !Number.isSafeInteger(miningLoot.id) ||
        miningLoot.id >= 0 ||
        miningLoot.id <= miningWorld.nextId ||
        ids.has(miningLoot.id)
      )
        throw new Error('Invalid mining parcel identity');
      ids.add(miningLoot.id);
      const gradeLots = miningLoot.it.remainingLots;
      if (
        !gradeLots ||
        !(
          /** @type {const} */ (['common', 'rich', 'pure']).every(
            (k) => Number.isSafeInteger(gradeLots[k]) && gradeLots[k] >= 0,
          )
        ) ||
        typeof miningLoot.it.generationKey !== 'string' ||
        ![...f.rocks, ...f.history].some(
          (generation) =>
            generation.key === miningLoot.it.generationKey && generation.ore === miningLoot.it.ore,
        ) ||
        !Array.isArray(miningLoot.it.progressionTokens) ||
        !miningLoot.it.progressionTokens.every(
          (t) =>
            Number.isSafeInteger(t) &&
            t >= 0 &&
            [...f.rocks, ...f.history].some(
              (generation) =>
                generation.key === miningLoot.it.generationKey && t < generation.tokens.length,
            ),
        ) ||
        !Number.isFinite(miningLoot.expires)
      )
        throw new Error('Invalid mining parcel');
    }
    for (const generation of [...f.rocks, ...f.history])
      if (generation.budget >= 0) {
        const floating = f.parcels
          .filter((miningLoot) => miningLoot.it.generationKey === generation.key)
          .reduce((n, miningLoot) => n + quantity(miningLoot.it), 0);
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
function quantity(parcel) {
  return parcel.remainingLots.common + parcel.remainingLots.rich + parcel.remainingLots.pure;
}
/** @param {World} miningWorld @param {Space} space @param {number} fi @param {number} i @param {{x:number,y:number,r:number,ore:string,rich:number,minor?:boolean}} f @param {number} generation @returns {Generation} */
function generate(miningWorld, space, fi, i, f, generation) {
  const key = `${space.id}:${fi}:${i}:${generation}`,
    seed = seedOf(key),
    random = randomOf(seed),
    a = random() * Math.PI * 2,
    d = Math.sqrt(random()) * f.r,
    r = Math.round(16 + random() * (f.minor ? 7 : 30)),
    max = Math.round(
      (r * (f.ore === 'gas' ? 6 : f.ore === 'shards' ? 12 : 9) * (1 + f.rich * 0.5)) /
        stageCount(r),
    ),
    n = Math.max(1, Math.round(r / 14)) + (f.rich - 1);
  let baseBudget = 0;
  for (let j = 0; j < n; j++) baseBudget += f.rich + (random() < 0.4 ? 1 : 0);
  return {
    id: miningWorld.nextId--,
    x: Math.round(f.x + Math.cos(a) * d),
    y: Math.round(f.y + Math.sin(a) * d),
    r,
    ore: f.ore,
    rich: f.rich,
    hp: max,
    max,
    down: 0,
    evT: 0,
    key,
    generation,
    seed,
    stage: 0,
    stages: stageCount(r),
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
    tokens: Array(n).fill(false),
    leases: [],
    seen: {},
    captain: null,
    lastCut: null,
    seam: random() * Math.PI * 2,
  };
}
/** @param {Capabilities} capabilities @param {Space} space @param {Generation} generation @param {boolean} clean */
function emit(capabilities, space, generation, clean) {
  const miningWorld = world(capabilities),
    f = miningWorld.systems[space.id];
  // One generation opportunity: qualifying useful-contact contributor, never last damage.
  // Cap each of the first 64 participants at the 1.5s threshold; ties use account order.
  const contributor = Object.entries(generation.dredgeContributors || {})
    .filter(([, seconds]) => seconds >= 1.5 - 1e-9)
    .map(([name]) => name)
    .sort()[0];
  if (!generation.dredgeToken && generation.stages > 1 && contributor) {
    const d = capabilities.db.get(contributor);
    if (d) {
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
    const raw =
      generation.baseBudget *
      (1 + (account ? capabilities.bonus(account).miningPct || 0 : 0) / 100) *
      capabilities.mods(space.id).mining;
    const rng = randomOf(generation.seed ^ 123456);
    generation.budget = Math.floor(raw) + (rng() < raw % 1 ? 1 : 0);
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
    n =
      remainingStages === 1 ? generation.pending : Math.floor(generation.pending / remainingStages),
    random = randomOf(generation.seed ^ ((generation.stage + 1) * 17293)),
    lots = generation.sweepCut ? sweepGrades(n, random) : rollGrades(n, clean, random),
    clusters = Math.min(n, 2 + Math.floor(random() * 3));
  const tokenIds = generation.tokens
    .map((_, i) => i)
    .filter((i) => i % generation.stages === generation.stage);
  for (let j = 0; j < clusters; j++) {
    const q = Math.ceil((lots.common + lots.rich + lots.pure) / (clusters - j)),
      part = splitLots(lots, q);
    for (const k of /** @type {const} */ (['common', 'rich', 'pure'])) lots[k] -= part[k];
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
        n: q,
        remainingLots: part,
        generationKey: generation.key,
        parcelKey: `${generation.key}:${generation.stage}:${j}`,
        progressionTokens: tokenIds.filter((_, i) => i % clusters === j),
      },
    };
    f.parcels.push(parcel);
    space.loot.push(parcel);
  }
  generation.pending -= n;
  generation.emitted += n;
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
/** @param {Capabilities} capabilities @param {Space} space @param {Generation} generation @param {number} [now] */
function update(capabilities, space, generation, now = world(capabilities).clock) {
  if (now < generation.updated) throw new Error('Mining clock moved backwards');
  if (generation.down) return;
  // Integrate each contact/cooling segment in time order. Quiet systems can observe
  // both a threshold crossing and trailing cooling in the same update.
  const points = [generation.updated, now];
  for (const l of generation.leases)
    if (l.to > generation.updated && l.from < now)
      points.push(Math.max(generation.updated, l.from), Math.min(now, l.to));
  points.sort((a, b) => a - b);
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1],
      to = points[i];
    if (to <= from) continue;
    const { seconds, seamSeconds } = contactTime(generation.leases, from, to);
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
            .filter((l) => l.from < to && l.to > from && l.captain)
            .map((l) => /** @type {string} */ (l.captain)),
        ),
      ];
      const contributions = (generation.dredgeContributors ||= Object.create(null));
      for (const name of captains) {
        if (!Object.hasOwn(contributions, name) && Object.keys(contributions).length >= 64)
          continue;
        const own = contactTime(
          generation.leases.filter((l) => l.captain === name),
          from,
          to,
        ).seconds;
        Object.defineProperty(contributions, name, {
          value: Math.min(
            1.5,
            (Object.hasOwn(contributions, name) ? contributions[name] : 0) +
              (own * useful) / seconds,
          ),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      capabilities.pressureWork(space, generation, useful, captains);
      generation.heat = crosses ? MINING.overheat : heated;
      generation.releaseHeat = generation.heat;
      generation.releaseAt = to + MINING.grace;
      if (crosses) {
        generation.penalty = true; // Latched even if not ready, including across trailing cooling.
        if (generation.ready) {
          emit(capabilities, space, generation, false);
          // Emission ends this stage's leases at the crossing, not at observation.
          generation.heat = Math.max(0, generation.heat - (now - from - useful) * MINING.cooling);
          break;
        }
      }
    } else generation.heat = Math.max(0, generation.heat - (to - from) * MINING.cooling);
  }
  generation.updated = now;
  if (
    generation.ready &&
    generation.releaseAt &&
    now > generation.releaseAt &&
    generation.leases.every((l) => l.to < now - MINING.grace)
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
  generation.leases = generation.leases.filter((l) => l.to > now - 1);
  for (const [key, t] of Object.entries(generation.seen))
    if (t < now - 10) delete generation.seen[key];
}
/** @param {number} n @param {()=>number} random */
function sweepGrades(n, random) {
  const lots = { common: 0, rich: 0, pure: 0 };
  for (let i = 0; i < n; i++) lots[random() < 0.03 ? 'rich' : 'common']++;
  return lots;
}
export const MiningOperations = {
  /** Stable across restart/sleep; a fresh projectile cannot alias a saved consumed shot.
   * @this {Capabilities} @returns {number} */
  shotId() {
    const id = world(this).nextId--;
    this.db.touch();
    return id;
  },
  /** @this {Capabilities} */
  init() {
    if (this.db.world.mining) {
      validate(this.db.world.mining); // No offline work from stale saved collision leases.
      for (const f of Object.values(this.db.world.mining.systems))
        for (const generation of [...f.rocks, ...f.history]) {
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
  /** @this {Capabilities} @param {number} dt */
  advanceClock(dt) {
    if (!Number.isFinite(dt) || dt < 0 || dt > 1) throw new Error('Invalid mining timestep');
    if (this.paused()) return;
    world(this).clock += dt;
    this.db.touch();
  },
  /** @this {Capabilities} @param {Space} space */
  openSpace(space) {
    const miningWorld = world(this),
      config = JSON.stringify(space.sys.fields || []);
    let f = miningWorld.systems[space.id];
    if (f && f.config !== config) {
      const previous = JSON.parse(f.config),
        next = space.sys.fields || [];
      // Only reviewed append-only industrial fields migrate. Old geometry, stable keys,
      // unspent mass and outstanding original parcels are never regenerated or reminted.
      if (
        !Array.isArray(previous) ||
        next.length < previous.length ||
        JSON.stringify(next.slice(0, previous.length)) !== f.config ||
        !next.slice(previous.length).every((x) => x.industrial === true && x.minor === true)
      )
        throw new Error(`Mining field config changed in ${space.id}; explicit migration required`);
      for (let fi = previous.length; fi < next.length; fi++)
        for (let i = 0; i < next[fi].rocks; i++)
          f.rocks.push(generate(miningWorld, space, fi, i, next[fi], 0));
      f.config = config;
      this.db.touch();
    }
    if (!f) {
      f = { config, rocks: [], parcels: [], history: [] };
      for (const [fi, field] of (space.sys.fields || []).entries())
        for (let i = 0; i < field.rocks; i++)
          f.rocks.push(generate(miningWorld, space, fi, i, field, 0));
      miningWorld.systems[space.id] = f;
      this.db.touch();
    }
    space.rocks = f.rocks;
    space.loot.push(...f.parcels);
    this.endTick(space);
  },
  /** @this {Capabilities} @param {Space} space @param {Rock} rock @param {MiningContact} hit */
  contact(space, rock, hit) {
    const generation = world(this).systems[space.id]?.rocks.find((r) => r === rock);
    if (!generation || generation.down || !Number.isFinite(hit.damage) || hit.damage < 0) return;
    const now = world(this).clock,
      key = hit.source.contactId;
    if (Object.hasOwn(generation.seen, key)) return;
    // A later arrival cannot extend an already expired ready-stage deadline.
    // Beams cover the preceding frame; compare against contact start so a
    // contiguous beam is not mistakenly cooled before its frame is admitted.
    const from = hit.projectile ? now : Math.max(0, now - 1 / 30),
      previousEnd = Math.max(
        generation.releaseAt ? generation.releaseAt - MINING.grace : 0,
        ...generation.leases.map((l) => l.to),
      );
    if (generation.ready && previousEnd && previousEnd + MINING.grace < from) {
      // Settle only through incoming contact start. Advancing to observation
      // now would consume a retrospective beam's first frame as cooling.
      update(this, space, generation, Math.max(generation.updated, from));
      if (generation.down) return;
    }
    generation.lastActivity = now;
    generation.seen[key] = now;
    generation.captain = hit.source.captain;
    const angle = Math.atan2(hit.y - generation.y, hit.x - generation.x),
      delta = Math.abs(
        Math.atan2(Math.sin(angle - generation.seam), Math.cos(angle - generation.seam)),
      ),
      seam = delta < MINING.seamWidth;
    generation.leases.push({
      from: hit.projectile ? now : Math.max(0, now - 1 / 30),
      to: hit.projectile ? now + Math.min(1, Math.max(1 / 30, hit.source.cadence)) : now,
      seam,
      captain: hit.source.captain,
    });
    generation.hp = Math.max(0, generation.hp - hit.damage * 6 * (seam ? 1.25 : 1));
    if (!generation.hp) generation.ready = true;
    this.db.touch();
  },
  /** Sweep never finishes a clean-ready or multistage rock; same finite root budget.
   * @this {Capabilities} @param {Space} space @param {Rock} rock @param {number} damage @param {string} captain */
  sweep(space, rock, damage, captain) {
    const generation = world(this).systems[space.id]?.rocks.find((x) => x === rock);
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
  ordinary(space, rock, damage, captain = null) {
    const generation = world(this).systems[space.id]?.rocks.find((r) => r === rock);
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
  endTick(space) {
    const miningWorld = world(this),
      f = miningWorld.systems[space.id];
    if (!f) return;
    for (let i = 0; i < f.rocks.length; i++) {
      const generation = f.rocks[i];
      update(this, space, generation);
      const abandoned =
        !generation.down &&
        (generation.hp < generation.max ||
          generation.stage > 0 ||
          generation.work > 0 ||
          generation.ready) &&
        miningWorld.clock - (generation.lastActivity ?? generation.updated) >= MINING.idleRenewal &&
        !generation.ready &&
        generation.leases.every((l) => l.to + MINING.grace < miningWorld.clock);
      if ((generation.down && miningWorld.clock >= generation.down) || abandoned) {
        // Retire, never reset, a generation: original parcels retain their ledger,
        // while unextracted material is explicitly discarded before natural renewal.
        // Unissued generations have no escrow/progression to retain in history.
        if (generation.budget >= 0) {
          generation.discarded += generation.pending;
          generation.pending = 0;
          f.history.push(generation);
        }
        const [sys, fi, ri] = generation.key.split(':');
        f.rocks[i] = generate(
          miningWorld,
          space,
          Number(fi),
          Number(ri),
          (space.sys.fields || [])[Number(fi)],
          generation.generation + 1,
        );
        space.events.push(['rock', generation.id, 0]);
        this.db.touch();
      }
    }
    space.rocks = f.rocks;
    for (const miningLoot of f.parcels) {
      if (miningLoot.expires <= miningWorld.clock && quantity(miningLoot.it) > 0) {
        const generation = [...f.rocks, ...f.history].find(
          (r) => r.key === miningLoot.it.generationKey,
        );
        if (generation) {
          generation.expired += quantity(miningLoot.it);
          miningLoot.it.remainingLots = { common: 0, rich: 0, pure: 0 };
        }
        miningLoot.taken = true;
        this.db.touch();
      }
    }
    f.parcels = f.parcels.filter((miningLoot) => !miningLoot.taken && quantity(miningLoot.it) > 0);
    space.loot = space.loot.filter(
      (p) => !('generationKey' in p.it) || f.parcels.includes(/** @type {SavedMiningLoot} */ (p)),
    );
    // No settled history is retained. Live parcels pin their original ledger until
    // accepted/expired; unsettled or inconsistent records remain for validation.
    const live = new Set(f.parcels.map((miningLoot) => miningLoot.it.generationKey));
    const history = f.history.filter(
      (generation) =>
        live.has(generation.key) ||
        generation.budget < 0 ||
        generation.pending > 0 ||
        generation.accepted + generation.expired + generation.discarded !== generation.budget,
    );
    if (history.length !== f.history.length) {
      f.history = history;
      this.db.touch();
    }
  },
  /** @this {Capabilities} @param {Space} space */
  suspendSpace(space) {
    this.endTick(space);
    this.db.touch();
  },
  /** @this {Capabilities} @param {Session} session @param {NetworkMessage & {op?:string}} request */
  survey(session, request) {
    const entity = session.ent,
      miningWorld = world(this);
    if (request.op !== 'survey' || Object.keys(request).some((k) => !['t', 'op'].includes(k)))
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
    const old = session.data.miningSurvey;
    if (old && (!Number.isFinite(old.cooldownUntil) || old.version !== 1)) return false;
    if (old && miningWorld.clock < old.cooldownUntil) return false;
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
  rocksPayload(space) {
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
  payload(session, space) {
    const now = world(this).clock,
      survey = session.data.miningSurvey;
    return {
      version: 1,
      now,
      cooldownUntil: survey?.cooldownUntil || 0,
      revealUntil: survey?.revealUntil || 0,
      revealed:
        survey && survey.version === 1 && survey.sys === space.id && survey.revealUntil > now
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
  /** @this {Capabilities} @param {Session} session @param {LootItem} item @param {number} n */
  collected(session, item, n) {
    if (!item.generationKey) return;
    const miningWorld = world(this);
    for (const f of Object.values(miningWorld.systems)) {
      const generation = [...f.rocks, ...f.history].find((r) => r.key === item.generationKey);
      if (!generation) continue;
      generation.accepted += n;
      this.pressureExtract(session, n);
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
