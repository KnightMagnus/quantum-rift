// @ts-check
import { PRESSURE as P } from '../shared/mining-pressure-rules.js';

/** @import { Session } from './game.js' */
/** @import { MiningSpace, SavedRockGeneration } from './mining-contracts.js' */
/** @import { PressureWire } from './mining-pressure-contracts.js' */
/** @import { Entity } from './space.js' */
/** @typedef {import('./mining-pressure-contracts.js').PressureCapabilities} C */
/** @typedef {import('./mining-pressure-contracts.js').PressureSpace} Space */
/** @typedef {import('./mining-pressure-contracts.js').SavedMiningPressure} W */
/** @param {C} c @returns {W} */
function state(c) {
  const w = c.db.world.miningPressure;
  if (!w) throw Error('Mining pressure unavailable');
  return w;
}
/** @param {C} c */
function now(c) {
  return c.db.world.mining?.clock || 0;
}
/** @param {C} c @param {string} owner @param {string} sys */
function captain(c, owner, sys) {
  const w = state(c),
    clock = now(c);
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
/** @param {C} c @param {string} owner @param {string} sys */
function online(c, owner, sys) {
  return [...c.sessions()].find(
    (s) => s.data && c.db.key(s.data.name) === owner && s.data.sys === sys && s.ent && !s.ent.dead,
  );
}
/** @param {C} c @param {string} owner @param {string} sys */
function scope(c, owner, sys) {
  const own = online(c, owner, sys);
  if (!own) return [];
  const consent = state(c).consent.find(
    (x) =>
      x.owner === owner &&
      x.session === own.id &&
      x.entity === own.ent?.id &&
      x.sys === sys &&
      x.until > now(c) &&
      x.group === String(own.data.armada),
  );
  return [
    own,
    ...[...c.sessions()].filter(
      (s) =>
        s !== own &&
        s.data &&
        s.ent &&
        s.data.sys === sys &&
        !!(
          consent &&
          state(c).consent.some(
            (x) =>
              x.owner === c.db.key(s.data.name) &&
              x.session === s.id &&
              x.entity === s.ent?.id &&
              x.sys === sys &&
              x.group === consent.group &&
              x.group === String(s.data.armada) &&
              x.until > now(c),
          )
        ),
    ),
  ];
}
/** @param {C} c @param {Space} sp @param {string[]} owners @param {number[]} sessions @param {Entity} e */
function eligible(c, sp, owners, sessions, e) {
  if (!e.player || e.dead) return false;
  const s = e.player.s,
    key = c.db.key(s.data.name),
    i = owners.indexOf(key);
  if (i < 0 || sessions[i] !== s.id || s.ent !== e || (!sp.sys.farside && c.newcomer(s.data)))
    return false;
  // The owner is index0. Other captains must retain separate live opt-in.
  const owner = online(c, owners[0], sp.id),
    ownerConsent =
      owner &&
      state(c).consent.find(
        (x) =>
          x.owner === owners[0] &&
          x.session === owner.id &&
          x.entity === owner.ent?.id &&
          x.sys === sp.id &&
          x.group === String(owner.data.armada) &&
          x.until > now(c),
      );
  return (
    i === 0 ||
    !!(
      ownerConsent &&
      state(c).consent.some(
        (x) =>
          x.owner === key &&
          x.session === s.id &&
          x.entity === s.ent?.id &&
          x.sys === sp.id &&
          x.group === ownerConsent.group &&
          x.group === String(s.data.armada) &&
          x.until > now(c),
      )
    )
  );
}
/** @param {C} c @param {Pick<Space,'id'>} sp @param {string} key */
function field(c, sp, key) {
  const w = state(c),
    clock = now(c);
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
  init() {
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
  /** @this {C} @param {MiningSpace} sp @param {SavedRockGeneration} rock @param {number} seconds @param {readonly string[]} [captains] */
  work(sp, rock, seconds, captains = rock.captain ? [rock.captain] : []) {
    const owner = captains[0];
    if (!owner || seconds <= 0) return;
    const w = state(this);
    for (const account of captains) {
      const p = captain(this, account, sp.id),
        s = online(this, account, sp.id);
      p.noise = Math.min(100, p.noise + (seconds * P.noisePerSecond) / captains.length);
      if (p.noise >= P.warn && !p.warned) {
        p.warned = true;
        if (s)
          this.toast(
            s,
            'MINING PRESSURE 70/100 — leave the field to cool; extraction can attract a bounded encounter.',
          );
      }
    }
    const f = field(this, sp, rock.key.split(':').slice(0, 2).join(':'));
    f.recovery = Math.min(P.fieldMax, f.recovery + seconds * P.fieldWorkRecovery);
    if ((rock.ore === 'gas' || rock.seed % 7 === 0) && !w.hazards.some((h) => h.id === rock.key)) {
      const participants = scope(this, owner, sp.id);
      w.hazards.push({
        id: rock.key,
        sys: sp.id,
        owner,
        participants: participants.map((s) => this.db.key(s.data.name)),
        sessions: participants.map((s) => s.id),
        entities: participants.map((s) => s.ent?.id || 0),
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
  /** @this {C} @param {MiningSpace} sp @param {SavedRockGeneration} rock */
  regrow(sp, rock) {
    const f = field(this, sp, rock.key.split(':').slice(0, 2).join(':'));
    return (1 + f.recovery / 100) * (this.rush(sp.id) ? 0.85 : 1);
  },
  /** Public bounded field evolution reuses the existing recovery owner, not a second ledger.
   * @this {C} @param {string} sys @param {number} index */
  fieldState(sys, index) {
    const f = field(this, { id: sys }, `${sys}:${index}`);
    return {
      recovery: f.recovery,
      label: f.recovery >= 20 ? 'RECOVERING' : f.recovery >= 5 ? 'STEADY' : 'RICH OPPORTUNITY',
      factor: (1 + f.recovery / 100) * (this.rush(sys) ? 0.85 : 1),
    };
  },
  /** @this {C} @param {Space} sp */
  pressureTick(sp) {
    const w = state(this),
      clock = now(this);
    for (const h of w.hazards)
      if (h.sys === sp.id && !h.resolved && clock >= h.detonateAt) {
        h.resolved = true;
        for (const e of sp.ships.values()) {
          const participant =
              h.entities[h.participants.indexOf(this.db.key(e.player?.s.data.name || ''))] ===
                e.id && eligible(this, sp, h.participants, h.sessions, e),
            enrolled =
              !!e.miningEncounter &&
              w.encounters.some(
                (g) =>
                  g.id === e.miningEncounter && g.active && g.sys === sp.id && g.owner === h.owner,
              );
          if ((participant || enrolled) && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius)
            sp.damage(e, P.blast, P.blast, null);
        }
        sp.events.push(['blast', Math.round(h.x), Math.round(h.y), h.radius]);
        this.db.touch();
      }
    for (const group of w.encounters)
      if (group.sys === sp.id && group.active) {
        const alive = group.ids.filter((id) => {
          const e = sp.ships.get(id);
          return e && !e.dead;
        });
        if (!alive.length || clock - group.at >= P.encounterLife) {
          group.active = false;
          for (const id of alive) {
            const e = sp.ships.get(id);
            if (e) {
              e.ai = 'leave';
              e.target = null;
              e.life = 0;
            }
          }
          this.db.touch();
        }
      }
    if (w.encounters.some((e) => e.sys === sp.id && e.active)) return;
    for (const s of this.sessions()) {
      if (!s.data || !s.ent || s.data.sys !== sp.id || (!sp.sys.farside && this.newcomer(s.data)))
        continue;
      const owner = this.db.key(s.data.name),
        p = captain(this, owner, sp.id);
      if (p.noise < P.threshold || clock - p.lastEncounter < P.cooldown) continue;
      const participants = scope(this, owner, sp.id).filter(
        (x) => sp.sys.farside || !this.newcomer(x.data),
      );
      if (
        participants.some(
          (x) => clock - captain(this, this.db.key(x.data.name), sp.id).lastEncounter < P.cooldown,
        )
      )
        continue;
      const group = {
        id: `enc${w.nextId++}`,
        sys: sp.id,
        owner,
        participants: participants.map((x) => this.db.key(x.data.name)),
        sessions: participants.map((x) => x.id),
        ids: /** @type {number[]} */ ([]),
        at: clock,
        active: true,
      };
      w.encounters.push(group);
      for (const x of participants)
        captain(this, this.db.key(x.data.name), sp.id).lastEncounter = clock;
      // Reserve before spawning; bounded hulls and fixed offsets away from ports/neutral traffic.
      for (let i = 0; i < P.encounterShips; i++) {
        let x = s.ent.x + 1400 + i * 100,
          y = s.ent.y + 900;
        const crowded = () =>
          [...sp.ships.values()].some(
            (e) => !group.ids.includes(e.id) && Math.hypot(e.x - x, e.y - y) < 700,
          ) || sp.sys.stellars.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 1000);
        for (let k = 0; k < 16 && crowded(); k++) {
          x += 700;
          y += 400;
        }
        if (crowded()) continue;
        const e = sp.makeShip({
          hull: 704,
          faction: 'umbral',
          x,
          y,
          a: 0,
          ai: 'raid',
          name: 'Mining-noise raider',
        });
        e.miningEncounter = group.id;
        group.ids.push(e.id);
      }
      this.toast(
        s,
        'MINING PRESSURE100/100 — two raiders tracked your field. Uninvolved captains are excluded.',
      );
      this.db.touch();
      break;
    }
    // Keep generation hazard receipts only while that generation remains live/retired.
    const keys = new Set(
      [
        ...(this.db.world.mining?.systems[sp.id]?.rocks || []),
        ...(this.db.world.mining?.systems[sp.id]?.history || []),
      ].map((r) => r.key),
    );
    w.hazards = w.hazards.filter((h) => h.sys !== sp.id || !h.resolved || keys.has(h.id));
    w.encounters = w.encounters.filter((e) => e.active || clock - e.at < P.cooldown);
  },
  /** A scoped encounter is hostile only to its current consenting captain hulls.
   * @this {C} @param {Space} sp @param {Entity} a @param {Entity} b @returns {boolean|null} */
  allow(sp, a, b) {
    const id = a.miningEncounter || b.miningEncounter;
    if (!id) return null;
    if (a.miningEncounter && b.miningEncounter) return false;
    const g = state(this).encounters.find((g) => g.id === id && g.active && g.sys === sp.id);
    if (!g) return false;
    const other = a.miningEncounter ? b : a,
      root = sp.root(other);
    if (!root?.player) return false;
    if (a.miningEncounter && other !== root) return false; // Never punish friendly wingmates for captain noise.
    return eligible(this, sp, g.participants, g.sessions, root);
  },
  /** @this {C} @param {Space} sp @param {string|undefined} id @param {Entity} target */
  shotAllowed(sp, id, target) {
    if (!id) return true;
    const g = state(this).encounters.find((g) => g.id === id && g.active && g.sys === sp.id);
    return !!g && eligible(this, sp, g.participants, g.sessions, target);
  },
  /** @this {C} @param {Session} s @param {number} tonnes */
  extracted(s, tonnes) {
    if (tonnes <= 0) return;
    const p = captain(this, this.db.key(s.data.name), s.data.sys);
    p.noise = Math.min(100, p.noise + tonnes * P.noisePerTonne);
    if (p.noise >= P.warn && !p.warned) {
      p.warned = true;
      this.toast(s, 'MINING PRESSURE70/100 — extraction adds noise; leave the field to cool.');
    }
    this.db.touch();
  },
  /** @this {C} @param {Session} s @returns {PressureWire} */
  payload(s) {
    const p = captain(this, this.db.key(s.data.name), s.data.sys);
    return {
      noise: p.noise,
      warn: p.noise >= P.warn,
      groupConsent: state(this).consent.some(
        (x) =>
          x.owner === p.owner &&
          x.session === s.id &&
          x.entity === s.ent?.id &&
          x.sys === s.data.sys &&
          x.group === String(s.data.armada) &&
          x.until > now(this),
      ),
      cooldown: Math.max(0, P.cooldown - (now(this) - p.lastEncounter)),
    };
  },
  /** @this {C} @param {string} sys */
  hazards(sys) {
    return state(this)
      .hazards.filter((h) => h.sys === sys && !h.resolved)
      .map((h) => ({ id: h.id, x: h.x, y: h.y, radius: h.radius, detonateAt: h.detonateAt }));
  },
  /** @this {C} @param {Session} s @param {{op?:string}} m */
  consent(s, m) {
    if (
      !s.ent ||
      Object.keys(m).some((k) => !['t', 'op'].includes(k)) ||
      !['join', 'leave'].includes(m.op || '')
    )
      return;
    if (m.op === 'join' && !s.data.armada) {
      this.toast(
        s,
        'Join an Armada before opting in to group mining. Solo mining remains your own scope.',
      );
      return;
    }
    const w = state(this),
      owner = this.db.key(s.data.name);
    w.consent = w.consent.filter((x) => x.owner !== owner);
    if (m.op === 'join' && s.data.armada)
      w.consent.push({
        owner,
        session: s.id,
        entity: s.ent.id,
        sys: s.data.sys,
        group: String(s.data.armada),
        until: now(this) + P.consent,
      });
    this.db.touch();
    this.toast(
      s,
      m.op === 'join'
        ? 'Group mining hazards/pressure: opted in for this flight.'
        : 'Group mining: opted out.',
    );
  },
};
