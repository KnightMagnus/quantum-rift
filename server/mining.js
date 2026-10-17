// @ts-check
import {
  MINING,
  seedOf,
  randomOf,
  stageCount,
  rollGrades,
  contactTime,
} from '../shared/mining-rules.js';
import { splitLots } from '../shared/cargo-lots.js';
/** @typedef {import('./mining-contracts.js').SavedRockGeneration} Generation */
/** @typedef {import('./mining-contracts.js').MiningCapabilities} Capabilities */
/** @typedef {import('./mining-contracts.js').SavedMiningWorld} World */
/** @typedef {import('./mining-contracts.js').MiningSpace} Space */
/** @typedef {import('./mining-contracts.js').MiningParcel} Parcel */
/** @param {Capabilities} c @returns {World} */
function world(c) {
  const w = c.db.world.mining;
  if (!w) throw new Error('Mining not initialized');
  return w;
}
/** Validate persisted JSON before exposing any rocks or changing world. No repair/minting.
 * @param {World} w */
function validate(w) {
  if (
    w.version !== 1 ||
    !Number.isFinite(w.clock) ||
    w.clock < 0 ||
    !Number.isSafeInteger(w.nextId) ||
    w.nextId >= 0 ||
    !w.systems ||
    typeof w.systems !== 'object'
  )
    throw new Error('Invalid mining save/version');
  const ids = new Set();
  for (const f of Object.values(w.systems)) {
    if (
      typeof f.config !== 'string' ||
      !Array.isArray(f.rocks) ||
      !Array.isArray(f.parcels) ||
      !Array.isArray(f.history)
    )
      throw new Error('Invalid mining field');
    for (const r of [...f.rocks, ...f.history]) {
      if (!Number.isSafeInteger(r.id) || r.id >= 0 || r.id <= w.nextId || ids.has(r.id))
        throw new Error('Invalid mining identity');
      ids.add(r.id);
      for (const n of [
        r.generation,
        r.stage,
        r.stages,
        r.seed,
        r.baseBudget,
        r.pending,
        r.accepted,
        r.expired,
        r.discarded,
        r.emitted,
      ])
        if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid mining count');
      for (const n of [
        r.x,
        r.y,
        r.r,
        r.max,
        r.hp,
        r.heat,
        r.work,
        r.updated,
        r.down,
        r.seam,
        r.releaseAt,
        r.releaseHeat,
      ])
        if (!Number.isFinite(n)) throw new Error('Invalid mining geometry/state');
      if (
        r.stage > r.stages ||
        r.stages < 1 ||
        r.stages > 3 ||
        r.heat < 0 ||
        r.heat > 100 ||
        r.work < 0 ||
        r.updated < 0 ||
        r.updated > w.clock ||
        r.releaseAt < 0 ||
        r.releaseHeat < 0 ||
        r.releaseHeat > 100 ||
        ![r.ready, r.penalty, r.penaltyApplied].every((v) => typeof v === 'boolean') ||
        r.hp < 0 ||
        r.hp > r.max ||
        r.max <= 0 ||
        !Array.isArray(r.tokens) ||
        !r.tokens.every((x) => typeof x === 'boolean') ||
        !Array.isArray(r.leases) ||
        !r.leases.every(
          (l) =>
            Number.isFinite(l.from) &&
            Number.isFinite(l.to) &&
            l.from >= 0 &&
            l.to >= l.from &&
            l.to - l.from <= 1.000001 &&
            typeof l.seam === 'boolean',
        ) ||
        !r.seen ||
        typeof r.seen !== 'object' ||
        !Object.values(r.seen).every((t) => Number.isFinite(t) && t >= 0 && t <= w.clock) ||
        typeof r.key !== 'string' ||
        !['ore', 'gas', 'shards'].includes(r.ore)
      )
        throw new Error('Invalid mining generation');
      if (
        r.budget !== -1 &&
        (!Number.isSafeInteger(r.budget) ||
          r.budget < 0 ||
          r.accepted + r.expired + r.discarded + r.pending > r.budget)
      )
        throw new Error('Invalid mining budget');
    }
    for (const p of f.parcels) {
      if (!Number.isSafeInteger(p.id) || p.id >= 0 || p.id <= w.nextId || ids.has(p.id))
        throw new Error('Invalid mining parcel identity');
      ids.add(p.id);
      const g = p.it.remainingLots;
      if (
        !g ||
        !(
          /** @type {const} */ (['common', 'rich', 'pure']).every(
            (k) => Number.isSafeInteger(g[k]) && g[k] >= 0,
          )
        ) ||
        typeof p.it.generationKey !== 'string' ||
        ![...f.rocks, ...f.history].some(
          (r) => r.key === p.it.generationKey && r.ore === p.it.ore,
        ) ||
        !Array.isArray(p.it.progressionTokens) ||
        !p.it.progressionTokens.every(
          (t) =>
            Number.isSafeInteger(t) &&
            t >= 0 &&
            [...f.rocks, ...f.history].some(
              (r) => r.key === p.it.generationKey && t < r.tokens.length,
            ),
        ) ||
        !Number.isFinite(p.expires)
      )
        throw new Error('Invalid mining parcel');
    }
    for (const r of [...f.rocks, ...f.history])
      if (r.budget >= 0) {
        const floating = f.parcels
          .filter((p) => p.it.generationKey === r.key)
          .reduce((n, p) => n + quantity(p.it), 0);
        if (r.accepted + floating + r.pending + r.expired + r.discarded !== r.budget)
          throw new Error('Mining conservation failure');
      }
  }
}
/** @param {Parcel} p */
function quantity(p) {
  return p.remainingLots.common + p.remainingLots.rich + p.remainingLots.pure;
}
/** @param {World} w @param {Space} sp @param {number} fi @param {number} i @param {{x:number,y:number,r:number,ore:string,rich:number}} f @param {number} generation @returns {Generation} */
function generate(w, sp, fi, i, f, generation) {
  const key = `${sp.id}:${fi}:${i}:${generation}`,
    seed = seedOf(key),
    random = randomOf(seed),
    a = random() * Math.PI * 2,
    d = Math.sqrt(random()) * f.r,
    r = Math.round(16 + random() * 30),
    max = Math.round(
      (r * (f.ore === 'gas' ? 6 : f.ore === 'shards' ? 12 : 9) * (1 + f.rich * 0.5)) /
        stageCount(r),
    ),
    n = Math.max(1, Math.round(r / 14)) + (f.rich - 1);
  let baseBudget = 0;
  for (let j = 0; j < n; j++) baseBudget += f.rich + (random() < 0.4 ? 1 : 0);
  return {
    id: w.nextId--,
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
    updated: w.clock,
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
/** @param {Capabilities} c @param {Space} sp @param {Generation} r @param {boolean} clean */
function emit(c, sp, r, clean) {
  const w = world(c),
    f = w.systems[sp.id];
  r.lastCut = r.heat >= 100 ? 'overheat' : clean ? 'clean' : 'ordinary';
  if (r.budget < 0) {
    const account = r.captain ? c.db.get(r.captain) : null;
    const raw =
      r.baseBudget *
      (1 + (account ? c.bonus(account).miningPct || 0 : 0) / 100) *
      c.mods(sp.id).mining;
    const rng = randomOf(r.seed ^ 123456);
    r.budget = Math.floor(raw) + (rng() < raw % 1 ? 1 : 0);
    r.pending = r.budget;
  }
  if ((r.heat >= MINING.overheat || r.penalty) && !r.penaltyApplied) {
    r.penalty = true;
    r.penaltyApplied = true;
    const keep = Math.floor(r.pending * 0.75);
    r.discarded += r.pending - keep;
    r.pending = keep;
  }
  const remainingStages = r.stages - r.stage,
    n = remainingStages === 1 ? r.pending : Math.floor(r.pending / remainingStages),
    random = randomOf(r.seed ^ ((r.stage + 1) * 17293)),
    lots = rollGrades(n, clean, random),
    clusters = Math.min(n, 2 + Math.floor(random() * 3));
  const tokenIds = r.tokens.map((_, i) => i).filter((i) => i % r.stages === r.stage);
  for (let j = 0; j < clusters; j++) {
    const q = Math.ceil((lots.common + lots.rich + lots.pure) / (clusters - j)),
      part = splitLots(lots, q);
    for (const k of /** @type {const} */ (['common', 'rich', 'pure'])) lots[k] -= part[k];
    const parcel = {
      id: w.nextId--,
      x: r.x + (random() - 0.5) * r.r,
      y: r.y + (random() - 0.5) * r.r,
      vx: (random() - 0.5) * 30,
      vy: (random() - 0.5) * 30,
      t: sp.t,
      kind: { ore: 2, gas: 3, shards: 4 }[r.ore] || 2,
      expires: w.clock + MINING.parcelTTL,
      it: {
        ore: r.ore,
        rich: r.rich,
        n: q,
        remainingLots: part,
        generationKey: r.key,
        parcelKey: `${r.key}:${r.stage}:${j}`,
        progressionTokens: tokenIds.filter((_, i) => i % clusters === j),
      },
    };
    f.parcels.push(parcel);
    sp.loot.push(parcel);
  }
  r.pending -= n;
  r.emitted += n;
  r.stage++;
  r.ready = false;
  r.work = 0;
  r.leases = [];
  r.releaseAt = 0;
  if (r.stage >= r.stages) {
    r.down = w.clock + (100 + random() * 60) / (c.mods(sp.id).regrow || 1);
    r.hp = r.max;
    sp.events.push(['rock', r.id, 0], ['boom', r.x, r.y, r.r * 1.2]);
  } else {
    r.hp = r.max;
    sp.events.push(['rock', r.id, 100], ['boom', r.x, r.y, r.r * 0.6]);
  }
  c.db.touch();
}
/** @param {Capabilities} c @param {Space} sp @param {Generation} r @param {number} [now] */
function update(c, sp, r, now = world(c).clock) {
  if (now < r.updated) throw new Error('Mining clock moved backwards');
  if (r.down) return;
  // Integrate each contact/cooling segment in time order. Quiet systems can observe
  // both a threshold crossing and trailing cooling in the same update.
  const points = [r.updated, now];
  for (const l of r.leases)
    if (l.to > r.updated && l.from < now)
      points.push(Math.max(r.updated, l.from), Math.min(now, l.to));
  points.sort((a, b) => a - b);
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1],
      to = points[i];
    if (to <= from) continue;
    const { seconds, seamSeconds } = contactTime(r.leases, from, to);
    if (seconds > 0) {
      const heated = r.heat + seconds * MINING.heatRate;
      const crosses = heated >= MINING.overheat - 1e-9;
      const useful =
        crosses && r.ready ? Math.max(0, (MINING.overheat - r.heat) / MINING.heatRate) : seconds;
      r.work += useful * (1 + (seamSeconds > 0 ? 0.25 : 0));
      r.heat = crosses ? MINING.overheat : heated;
      r.releaseHeat = r.heat;
      r.releaseAt = to + MINING.grace;
      if (crosses) {
        r.penalty = true; // Latched even if not ready, including across trailing cooling.
        if (r.ready) {
          emit(c, sp, r, false);
          // Emission ends this stage's leases at the crossing, not at observation.
          r.heat = Math.max(0, r.heat - (now - from - useful) * MINING.cooling);
          break;
        }
      }
    } else r.heat = Math.max(0, r.heat - (to - from) * MINING.cooling);
  }
  r.updated = now;
  if (
    r.ready &&
    r.releaseAt &&
    now > r.releaseAt &&
    r.leases.every((l) => l.to < now - MINING.grace)
  )
    emit(
      c,
      sp,
      r,
      r.work >= MINING.cleanWork &&
        r.work >= MINING.acquire &&
        r.releaseHeat >= 60 &&
        r.releaseHeat <= 80,
    );
  r.leases = r.leases.filter((l) => l.to > now - 1);
  for (const [key, t] of Object.entries(r.seen)) if (t < now - 10) delete r.seen[key];
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
        for (const r of [...f.rocks, ...f.history]) r.leases = [];
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
  /** @this {Capabilities} @param {Space} sp */
  openSpace(sp) {
    const w = world(this),
      config = JSON.stringify(sp.sys.fields || []);
    let f = w.systems[sp.id];
    if (f && f.config !== config)
      throw new Error(`Mining field config changed in ${sp.id}; explicit migration required`);
    if (!f) {
      f = { config, rocks: [], parcels: [], history: [] };
      for (const [fi, field] of (sp.sys.fields || []).entries())
        for (let i = 0; i < field.rocks; i++) f.rocks.push(generate(w, sp, fi, i, field, 0));
      w.systems[sp.id] = f;
      this.db.touch();
    }
    sp.rocks = f.rocks;
    sp.loot.push(...f.parcels);
    this.endTick(sp);
  },
  /** @this {Capabilities} @param {Space} sp @param {import('./space.js').Rock} rock @param {import('./mining-contracts.js').MiningContact} hit */
  contact(sp, rock, hit) {
    const r = world(this).systems[sp.id]?.rocks.find((r) => r === rock);
    if (!r || r.down || !Number.isFinite(hit.damage) || hit.damage < 0) return;
    const now = world(this).clock,
      key = hit.source.contactId;
    if (Object.hasOwn(r.seen, key)) return;
    // A later arrival cannot extend an already expired ready-stage deadline.
    // Beams cover the preceding frame; compare against contact start so a
    // contiguous beam is not mistakenly cooled before its frame is admitted.
    const from = hit.projectile ? now : Math.max(0, now - 1 / 30),
      previousEnd = Math.max(
        r.releaseAt ? r.releaseAt - MINING.grace : 0,
        ...r.leases.map((l) => l.to),
      );
    if (r.ready && previousEnd && previousEnd + MINING.grace < from) {
      // Settle only through incoming contact start. Advancing to observation
      // now would consume a retrospective beam's first frame as cooling.
      update(this, sp, r, Math.max(r.updated, from));
      if (r.down) return;
    }
    r.seen[key] = now;
    r.captain = hit.source.captain;
    const angle = Math.atan2(hit.y - r.y, hit.x - r.x),
      delta = Math.abs(Math.atan2(Math.sin(angle - r.seam), Math.cos(angle - r.seam))),
      seam = delta < MINING.seamWidth;
    r.leases.push({
      from: hit.projectile ? now : Math.max(0, now - 1 / 30),
      to: hit.projectile ? now + Math.min(1, Math.max(1 / 30, hit.source.cadence)) : now,
      seam,
    });
    r.hp = Math.max(0, r.hp - hit.damage * 6 * (seam ? 1.25 : 1));
    if (!r.hp) r.ready = true;
    this.db.touch();
  },
  /** @this {Capabilities} @param {Space} sp @param {import('./space.js').Rock} rock @param {number} damage @param {string|null} [captain] */
  ordinary(sp, rock, damage, captain = null) {
    const r = world(this).systems[sp.id]?.rocks.find((r) => r === rock);
    if (!r || r.down || !Number.isFinite(damage) || damage <= 0) return;
    r.hp = Math.max(0, r.hp - damage);
    if (!r.hp) {
      r.captain = captain;
      emit(this, sp, r, false);
    }
    this.db.touch();
  },
  /** @this {Capabilities} @param {Space} sp */
  endTick(sp) {
    const w = world(this),
      f = w.systems[sp.id];
    if (!f) return;
    for (let i = 0; i < f.rocks.length; i++) {
      const r = f.rocks[i];
      if (r.down && w.clock >= r.down) {
        f.history.push(r);
        const [sys, fi, ri] = r.key.split(':');
        f.rocks[i] = generate(
          w,
          sp,
          Number(fi),
          Number(ri),
          (sp.sys.fields || [])[Number(fi)],
          r.generation + 1,
        );
        sp.events.push(['rock', r.id, 0]);
        this.db.touch();
      } else update(this, sp, r);
    }
    sp.rocks = f.rocks;
    for (const p of f.parcels) {
      if (p.expires <= w.clock && quantity(p.it) > 0) {
        const r = [...f.rocks, ...f.history].find((r) => r.key === p.it.generationKey);
        if (r) {
          r.expired += quantity(p.it);
          p.it.remainingLots = { common: 0, rich: 0, pure: 0 };
        }
        p.taken = true;
        this.db.touch();
      }
    }
    f.parcels = f.parcels.filter((p) => !p.taken && quantity(p.it) > 0);
    sp.loot = sp.loot.filter(
      (p) =>
        !('generationKey' in p.it) ||
        f.parcels.includes(/** @type {import('./mining-contracts.js').SavedMiningLoot} */ (p)),
    );
    // No settled history is retained. Live parcels pin their original ledger until
    // accepted/expired; unsettled or inconsistent records remain for validation.
    const live = new Set(f.parcels.map((p) => p.it.generationKey));
    const history = f.history.filter(
      (r) =>
        live.has(r.key) ||
        r.budget < 0 ||
        r.pending > 0 ||
        r.accepted + r.expired + r.discarded !== r.budget,
    );
    if (history.length !== f.history.length) {
      f.history = history;
      this.db.touch();
    }
  },
  /** @this {Capabilities} @param {Space} sp */
  suspendSpace(sp) {
    this.endTick(sp);
    this.db.touch();
  },
  /** @this {Capabilities} @param {import('./game.js').Session} s @param {import('./message-registry.js').NetworkMessage & {op?:string}} request */
  survey(s, request) {
    const e = s.ent,
      w = world(this);
    if (request.op !== 'survey' || Object.keys(request).some((k) => !['t', 'op'].includes(k)))
      return false;
    if (
      !s.data ||
      !e ||
      e.dead ||
      e.disabled ||
      e.state !== 'fly' ||
      s.data.stellar ||
      this.paused()
    )
      return false;
    const old = s.data.miningSurvey;
    if (old && (!Number.isFinite(old.cooldownUntil) || old.version !== 1)) return false;
    if (old && w.clock < old.cooldownUntil) return false;
    s.data.miningSurvey = {
      version: 1,
      cooldownUntil: w.clock + 10,
      revealUntil: w.clock + 6,
      sys: s.data.sys,
      x: e.x,
      y: e.y,
    };
    this.db.touch();
    return true;
  },
  /** @this {Capabilities} @param {Space} sp @returns {import('./mining-contracts.js').MiningRocksWire} */
  rocksPayload(sp) {
    this.endTick(sp);
    return {
      version: 1,
      now: world(this).clock,
      rocks: (world(this).systems[sp.id]?.rocks || []).map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        r: r.r,
        ore: r.ore,
        generation: r.generation,
        stage: r.stage,
        stages: r.stages,
        hp: r.down ? 0 : Math.round((r.hp / r.max) * 100),
        heat: r.heat,
        work: r.work,
        ready: r.ready,
        lastCut: r.lastCut,
        acquired: r.work >= 0.6,
        down: !!r.down,
        gas: r.ore === 'gas',
      })),
    };
  },
  /** @this {Capabilities} @param {import('./game.js').Session} s @param {Space} sp @returns {import('./mining-contracts.js').MiningPrivateWire} */
  payload(s, sp) {
    const now = world(this).clock,
      v = s.data.miningSurvey;
    return {
      version: 1,
      now,
      cooldownUntil: v?.cooldownUntil || 0,
      revealUntil: v?.revealUntil || 0,
      revealed:
        v && v.version === 1 && v.sys === sp.id && v.revealUntil > now
          ? (world(this).systems[sp.id]?.rocks || [])
              .filter((r) => !r.down && Math.hypot(r.x - v.x, r.y - v.y) <= MINING.radius)
              .map((r) => ({
                id: r.id,
                generation: r.generation,
                seam: r.seam,
                potential: 'common / rich / pure',
                hazard: 'none',
              }))
          : [],
    };
  },
  /** @this {Capabilities} @param {import('./game.js').Session} s @param {import('./space.js').LootItem} item @param {number} n */
  collected(s, item, n) {
    if (!item.generationKey) return;
    const w = world(this);
    for (const f of Object.values(w.systems)) {
      const r = [...f.rocks, ...f.history].find((r) => r.key === item.generationKey);
      if (!r) continue;
      r.accepted += n;
      for (const token of item.progressionTokens || [])
        if (!r.tokens[token]) {
          r.tokens[token] = true;
          this.specOnMine(s, item);
        }
      this.db.touch();
      return;
    }
    throw new Error('Unknown mining generation');
  },
};
