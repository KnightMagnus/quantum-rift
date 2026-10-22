import type { Session } from './game.ts';
import type { MiningSpace, SavedRockGeneration } from './mining-contracts.ts';
import type { Entity } from './space.ts';
export type C = import('./mining-pressure-contracts.ts').PressureCapabilities;
export type Space = import('./mining-pressure-contracts.ts').PressureSpace;
export type W = import('./mining-pressure-contracts.ts').SavedMiningPressure;

// @ts-check
import { PRESSURE as P } from '../shared/mining-pressure-rules.ts';

/** @import { Session } from './game.ts' */
/** @import { MiningSpace, SavedRockGeneration } from './mining-contracts.ts' */
/** @import { PressureWire } from './mining-pressure-contracts.ts' */
/** @import { Entity } from './space.ts' */
/** @typedef {import('./mining-pressure-contracts.ts').PressureCapabilities} C */
/** @typedef {import('./mining-pressure-contracts.ts').PressureSpace} Space */
/** @typedef {import('./mining-pressure-contracts.ts').SavedMiningPressure} W */
/** @param {C} capabilities @returns {W} */
function state(capabilities: C): W {
  const w = capabilities.db.world.miningPressure;
  if (!w) throw Error('Mining pressure unavailable');
  return w;
}
/** @param {C} capabilities */
function now(capabilities: C) {
  return capabilities.db.world.mining?.clock || 0;
}
/** @param {C} capabilities @param {string} owner @param {string} sys */
function captain(capabilities: C, owner: string, sys: string) {
  const w = state(capabilities),
    clock = now(capabilities);
  let p = w.captains.find((p) => p.owner === owner && p.sys === sys);
  if (!p) {
    p = { owner, sys, noise: 0, updated: clock, lastEncounter: -P.cooldown, warned: false };
    w.captains.push(p);
  }
  // Every visit decays against one persisted logical clock; reconnect cannot reset.
  p.noise = Math.max(0, p.noise - Math.max(0, clock - p.updated) * P.decay);
  p.updated = clock;
  if (p.noise < P.warn) p.warned = false;
  return p;
}
/** @param {C} capabilities @param {string} owner @param {string} sys */
function online(capabilities: C, owner: string, sys: string) {
  return [...capabilities.sessions()].find(
    (session) =>
      session.data &&
      capabilities.db.key(session.data.name) === owner &&
      session.data.sys === sys &&
      session.ent &&
      !session.ent.dead,
  );
}
/** @param {C} capabilities @param {string} owner @param {string} sys */
function scope(capabilities: C, owner: string, sys: string) {
  const own = online(capabilities, owner, sys);
  if (!own) return [];
  const consent = state(capabilities).consent.find(
    (x) =>
      x.owner === owner &&
      x.session === own.id &&
      x.entity === own.ent?.id &&
      x.sys === sys &&
      x.until > now(capabilities) &&
      x.group === String(own.data.armada),
  );
  return [
    own,
    ...[...capabilities.sessions()].filter(
      (session) =>
        session !== own &&
        session.data &&
        session.ent &&
        session.data.sys === sys &&
        !!(
          consent &&
          state(capabilities).consent.some(
            (x) =>
              x.owner === capabilities.db.key(session.data.name) &&
              x.session === session.id &&
              x.entity === session.ent?.id &&
              x.sys === sys &&
              x.group === consent.group &&
              x.group === String(session.data.armada) &&
              x.until > now(capabilities),
          )
        ),
    ),
  ];
}
/** @param {C} capabilities @param {Space} space @param {string[]} owners @param {number[]} sessions @param {Entity} entity */
function eligible(
  capabilities: C,
  space: Space,
  owners: string[],
  sessions: number[],
  entity: Entity,
) {
  if (!entity.player || entity.dead) return false;
  const session = entity.player.s,
    key = capabilities.db.key(session.data.name),
    i = owners.indexOf(key);
  if (
    i < 0 ||
    sessions[i] !== session.id ||
    session.ent !== entity ||
    (!space.sys.farside && capabilities.newcomer(session.data))
  )
    return false;
  // The owner is index 0. Other captains must retain separate live opt-in.
  const owner = online(capabilities, owners[0], space.id),
    ownerConsent =
      owner &&
      state(capabilities).consent.find(
        (x) =>
          x.owner === owners[0] &&
          x.session === owner.id &&
          x.entity === owner.ent?.id &&
          x.sys === space.id &&
          x.group === String(owner.data.armada) &&
          x.until > now(capabilities),
      );
  return (
    i === 0 ||
    !!(
      ownerConsent &&
      state(capabilities).consent.some(
        (x) =>
          x.owner === key &&
          x.session === session.id &&
          x.entity === session.ent?.id &&
          x.sys === space.id &&
          x.group === ownerConsent.group &&
          x.group === String(session.data.armada) &&
          x.until > now(capabilities),
      )
    )
  );
}
/** @param {C} capabilities @param {Pick<Space,'id'>} sp @param {string} key */
function field(capabilities: C, sp: Pick<Space, 'id'>, key: string) {
  const w = state(capabilities),
    clock = now(capabilities);
  let f = w.fields.find((x) => x.key === key);
  if (!f) {
    f = { key, recovery: 0, updated: clock };
    w.fields.push(f);
  }
  f.recovery = Math.max(0, f.recovery - (clock - f.updated) * P.fieldDecay);
  f.updated = clock;
  return f;
}
export const MiningPressureOperations = {
  /** @this {C} */
  init(this: C) {
    const w = this.db.world.miningPressure;
    if (!w) {
      this.db.world.miningPressure = {
        version: 1,
        nextId: 1,
        captains: [],
        hazards: [],
        encounters: [],
        consent: [],
        fields: [],
      };
      this.db.touch();
      return;
    }
    if (
      w.version !== 1 ||
      !Number.isSafeInteger(w.nextId) ||
      ![w.captains, w.hazards, w.encounters, w.consent, w.fields].every(Array.isArray)
    )
      throw Error('Invalid mining pressure save');
    for (const p of w.captains)
      if (
        !Number.isFinite(p.noise) ||
        p.noise < 0 ||
        p.noise > 100 ||
        !Number.isFinite(p.updated) ||
        !Number.isFinite(p.lastEncounter)
      )
        throw Error('Invalid captain pressure');
    for (const h of w.hazards)
      if (
        !Number.isFinite(h.detonateAt) ||
        h.detonateAt < h.triggerAt + P.telegraph ||
        typeof h.resolved !== 'boolean'
      )
        throw Error('Invalid hazard');
    for (const f of w.fields)
      if (
        !Number.isFinite(f.recovery) ||
        f.recovery < 0 ||
        f.recovery > P.fieldMax ||
        !Number.isFinite(f.updated)
      )
        throw Error('Invalid field recovery');
    for (const e of w.encounters)
      if (
        !Array.isArray(e.ids) ||
        e.ids.length > 2 ||
        e.sessions.length !== e.participants.length ||
        !Number.isFinite(e.at) ||
        typeof e.active !== 'boolean'
      )
        throw Error('Invalid mining encounter');
    for (const h of w.hazards)
      if (
        h.sessions.length !== h.participants.length ||
        !Array.isArray(h.entities) ||
        h.entities.length !== h.participants.length ||
        !Number.isFinite(h.radius) ||
        h.radius <= 0 ||
        !Number.isFinite(h.x) ||
        !Number.isFinite(h.y)
      )
        throw Error('Invalid mining hazard scope');
    // Saved entity/session identities are process-local: retire old effects, never replay against arrivals.
    for (const h of w.hazards) h.resolved = true;
    for (const e of w.encounters) e.active = false;
    w.consent = [];
    this.db.touch();
  },
  /** @this {C} @param {MiningSpace} space @param {SavedRockGeneration} rock @param {number} seconds @param {readonly string[]} [captains] */
  work(
    this: C,
    space: MiningSpace,
    rock: SavedRockGeneration,
    seconds: number,
    captains: readonly string[] = rock.captain ? [rock.captain] : [],
  ) {
    const owner = captains[0];
    if (!owner || seconds <= 0) return;
    const w = state(this);
    for (const account of captains) {
      const p = captain(this, account, space.id),
        session = online(this, account, space.id);
      p.noise = Math.min(100, p.noise + (seconds * P.noisePerSecond) / captains.length);
      if (p.noise >= P.warn && !p.warned) {
        p.warned = true;
        if (session)
          this.toast(
            session,
            'MINING PRESSURE 70/100 — leave the field to cool; extraction can attract a bounded encounter.',
          );
      }
    }
    const f = field(this, space, rock.key.split(':').slice(0, 2).join(':'));
    f.recovery = Math.min(P.fieldMax, f.recovery + seconds * P.fieldWorkRecovery);
    if ((rock.ore === 'gas' || rock.seed % 7 === 0) && !w.hazards.some((h) => h.id === rock.key)) {
      const participants = scope(this, owner, space.id);
      w.hazards.push({
        id: rock.key,
        sys: space.id,
        owner,
        participants: participants.map((session) => this.db.key(session.data.name)),
        sessions: participants.map((session) => session.id),
        entities: participants.map((session) => session.ent?.id || 0),
        x: rock.x,
        y: rock.y,
        radius: P.radius,
        triggerAt: now(this),
        detonateAt: Math.ceil(now(this) * 1000) / 1000 + P.telegraph + 0.001,
        resolved: false,
      });
    }
    this.db.touch();
  },
  /** @this {C} @param {MiningSpace} space @param {SavedRockGeneration} rock */
  regrow(this: C, space: MiningSpace, rock: SavedRockGeneration) {
    const f = field(this, space, rock.key.split(':').slice(0, 2).join(':'));
    return (1 + f.recovery / 100) * (this.rush(space.id) ? 0.85 : 1);
  },
  /** Public bounded field evolution reuses the existing recovery owner, not a second ledger.
   * @this {C} @param {string} sys @param {number} index */
  fieldState(this: C, sys: string, index: number) {
    const f = field(this, { id: sys }, `${sys}:${index}`);
    return {
      recovery: f.recovery,
      label: f.recovery >= 20 ? 'RECOVERING' : f.recovery >= 5 ? 'STEADY' : 'RICH OPPORTUNITY',
      factor: (1 + f.recovery / 100) * (this.rush(sys) ? 0.85 : 1),
    };
  },
  /** @this {C} @param {Space} space */
  pressureTick(this: C, space: Space) {
    const w = state(this),
      clock = now(this);
    for (const h of w.hazards)
      if (h.sys === space.id && !h.resolved && clock >= h.detonateAt) {
        h.resolved = true;
        for (const e of space.ships.values()) {
          const participant =
              h.entities[h.participants.indexOf(this.db.key(e.player?.s.data.name || ''))] ===
                e.id && eligible(this, space, h.participants, h.sessions, e),
            enrolled =
              !!e.miningEncounter &&
              w.encounters.some(
                (g) =>
                  g.id === e.miningEncounter &&
                  g.active &&
                  g.sys === space.id &&
                  g.owner === h.owner,
              );
          if ((participant || enrolled) && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius)
            space.damage(e, P.blast, P.blast, null);
        }
        space.events.push(['blast', Math.round(h.x), Math.round(h.y), h.radius]);
        this.db.touch();
      }
    for (const group of w.encounters)
      if (group.sys === space.id && group.active) {
        const alive = group.ids.filter((id) => {
          const e = space.ships.get(id);
          return e && !e.dead;
        });
        if (!alive.length || clock - group.at >= P.encounterLife) {
          group.active = false;
          for (const id of alive) {
            const e = space.ships.get(id);
            if (e) {
              e.ai = 'leave';
              e.target = null;
              e.life = 0;
            }
          }
          this.db.touch();
        }
      }
    if (w.encounters.some((e) => e.sys === space.id && e.active)) return;
    for (const session of this.sessions()) {
      if (
        !session.data ||
        !session.ent ||
        session.data.sys !== space.id ||
        (!space.sys.farside && this.newcomer(session.data))
      )
        continue;
      const owner = this.db.key(session.data.name),
        p = captain(this, owner, space.id);
      if (p.noise < P.threshold || clock - p.lastEncounter < P.cooldown) continue;
      const participants = scope(this, owner, space.id).filter(
        (x) => space.sys.farside || !this.newcomer(x.data),
      );
      if (
        participants.some(
          (x) =>
            clock - captain(this, this.db.key(x.data.name), space.id).lastEncounter < P.cooldown,
        )
      )
        continue;
      const group = {
        id: `enc${w.nextId++}`,
        sys: space.id,
        owner,
        participants: participants.map((x) => this.db.key(x.data.name)),
        sessions: participants.map((x) => x.id),
        ids: /** @type {number[]} */ ([] as number[]),
        at: clock,
        active: true,
      };
      w.encounters.push(group);
      for (const x of participants)
        captain(this, this.db.key(x.data.name), space.id).lastEncounter = clock;
      // Reserve before spawning; bounded hulls and fixed offsets away from ports/neutral traffic.
      for (let i = 0; i < P.encounterShips; i++) {
        let x = session.ent.x + 1400 + i * 100,
          y = session.ent.y + 900;
        const crowded = () =>
          [...space.ships.values()].some(
            (e) => !group.ids.includes(e.id) && Math.hypot(e.x - x, e.y - y) < 700,
          ) ||
          space.sys.stellars.some(
            (stellarBody) =>
              Math.hypot(stellarBody.x - x, stellarBody.y - y) < stellarBody.r + 1000,
          );
        for (let k = 0; k < 16 && crowded(); k++) {
          x += 700;
          y += 400;
        }
        if (crowded()) continue;
        const entity = space.makeShip({
          hull: 704,
          faction: 'umbral',
          x,
          y,
          a: 0,
          ai: 'raid',
          name: 'Mining-noise raider',
        });
        entity.miningEncounter = group.id;
        group.ids.push(entity.id);
      }
      this.toast(
        session,
        'MINING PRESSURE100/100 — two raiders tracked your field. Uninvolved captains are excluded.',
      );
      this.db.touch();
      break;
    }
    // Keep generation hazard receipts only while that generation remains live/retired.
    const keys = new Set(
      [
        ...(this.db.world.mining?.systems[space.id]?.rocks || []),
        ...(this.db.world.mining?.systems[space.id]?.history || []),
      ].map((generation) => generation.key),
    );
    w.hazards = w.hazards.filter((h) => h.sys !== space.id || !h.resolved || keys.has(h.id));
    w.encounters = w.encounters.filter((e) => e.active || clock - e.at < P.cooldown);
  },
  /** A scoped encounter is hostile only to its current consenting captain hulls.
   * @this {C} @param {Space} space @param {Entity} leftEntity @param {Entity} rightEntity @returns {boolean|null} */
  allow(this: C, space: Space, leftEntity: Entity, rightEntity: Entity) {
    const id = leftEntity.miningEncounter || rightEntity.miningEncounter;
    if (!id) return null;
    if (leftEntity.miningEncounter && rightEntity.miningEncounter) return false;
    const g = state(this).encounters.find((g) => g.id === id && g.active && g.sys === space.id);
    if (!g) return false;
    const other = leftEntity.miningEncounter ? rightEntity : leftEntity,
      root = space.root(other);
    if (!root?.player) return false;
    if (leftEntity.miningEncounter && other !== root) return false; // Never punish friendly wingmates for captain noise.
    return eligible(this, space, g.participants, g.sessions, root);
  },
  /** @this {C} @param {Space} space @param {string|undefined} id @param {Entity} target */
  shotAllowed(this: C, space: Space, id: string | undefined, target: Entity) {
    if (!id) return true;
    const g = state(this).encounters.find((g) => g.id === id && g.active && g.sys === space.id);
    return !!g && eligible(this, space, g.participants, g.sessions, target);
  },
  /** @this {C} @param {Session} session @param {number} tonnes */
  extracted(this: C, session: Session, tonnes: number) {
    if (tonnes <= 0) return;
    const p = captain(this, this.db.key(session.data.name), session.data.sys);
    p.noise = Math.min(100, p.noise + tonnes * P.noisePerTonne);
    if (p.noise >= P.warn && !p.warned) {
      p.warned = true;
      this.toast(
        session,
        'MINING PRESSURE70/100 — extraction adds noise; leave the field to cool.',
      );
    }
    this.db.touch();
  },
  /** @this {C} @param {Session} session @returns {PressureWire} */
  payload(this: C, session: Session) {
    const p = captain(this, this.db.key(session.data.name), session.data.sys);
    return {
      noise: p.noise,
      warn: p.noise >= P.warn,
      groupConsent: state(this).consent.some(
        (x) =>
          x.owner === p.owner &&
          x.session === session.id &&
          x.entity === session.ent?.id &&
          x.sys === session.data.sys &&
          x.group === String(session.data.armada) &&
          x.until > now(this),
      ),
      cooldown: Math.max(0, P.cooldown - (now(this) - p.lastEncounter)),
    };
  },
  /** @this {C} @param {string} sys */
  hazards(this: C, sys: string) {
    return state(this)
      .hazards.filter((h) => h.sys === sys && !h.resolved)
      .map((h) => ({ id: h.id, x: h.x, y: h.y, radius: h.radius, detonateAt: h.detonateAt }));
  },
  /** @this {C} @param {Session} session @param {{op?:string}} m */
  consent(this: C, session: Session, m: { op?: string }) {
    if (
      !session.ent ||
      Object.keys(m).some((k) => !['t', 'op'].includes(k)) ||
      !['join', 'leave'].includes(m.op || '')
    )
      return;
    if (m.op === 'join' && !session.data.armada) {
      this.toast(
        session,
        'Join an Armada before opting in to group mining. Solo mining remains your own scope.',
      );
      return;
    }
    const w = state(this),
      owner = this.db.key(session.data.name);
    w.consent = w.consent.filter((x) => x.owner !== owner);
    if (m.op === 'join' && session.data.armada)
      w.consent.push({
        owner,
        session: session.id,
        entity: session.ent.id,
        sys: session.data.sys,
        group: String(session.data.armada),
        until: now(this) + P.consent,
      });
    this.db.touch();
    this.toast(
      session,
      m.op === 'join'
        ? 'Group mining hazards/pressure: opted in for this flight.'
        : 'Group mining: opted out.',
    );
  },
};
