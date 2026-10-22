import type { Session } from './game.ts';
import type { MiningSpace, SavedRockGeneration } from './mining-contracts.ts';
import type { Entity } from './space.ts';
import type {
  PressureCapabilities,
  PressureSpace,
  SavedMiningPressure,
} from './mining-pressure-contracts.ts';
export type { PressureCapabilities as C };
export type Space = PressureSpace;
export type { SavedMiningPressure as W };
import { PRESSURE as pressureRules } from '../shared/mining-pressure-rules.ts';

function state(capabilities: PressureCapabilities): SavedMiningPressure {
  const savedMiningPressure = capabilities.db.world.miningPressure;
  if (!savedMiningPressure) throw Error('Mining pressure unavailable');
  return savedMiningPressure;
}

function currentTime(capabilities: PressureCapabilities) {
  return capabilities.db.world.mining?.clock || 0;
}

function captain(capabilities: PressureCapabilities, owner: string, starSystem: string) {
  const savedMiningPressure = state(capabilities),
    clock = currentTime(capabilities);
  let captainPressure = savedMiningPressure.captains.find(
    (captainPressure) => captainPressure.owner === owner && captainPressure.sys === starSystem,
  );
  if (!captainPressure) {
    captainPressure = {
      owner,
      sys: starSystem,
      noise: 0,
      updated: clock,
      lastEncounter: -pressureRules.cooldown,
      warned: false,
    };
    savedMiningPressure.captains.push(captainPressure);
  }
  // Every visit decays against one persisted logical clock; reconnect cannot reset.
  captainPressure.noise = Math.max(
    0,
    captainPressure.noise - Math.max(0, clock - captainPressure.updated) * pressureRules.decay,
  );
  captainPressure.updated = clock;
  if (captainPressure.noise < pressureRules.warn) captainPressure.warned = false;
  return captainPressure;
}

function online(capabilities: PressureCapabilities, owner: string, starSystem: string) {
  return [...capabilities.sessions()].find(
    (session) =>
      session.data &&
      capabilities.db.key(session.data.name) === owner &&
      session.data.sys === starSystem &&
      session.ent &&
      !session.ent.dead,
  );
}

function scope(capabilities: PressureCapabilities, owner: string, starSystem: string) {
  const session2 = online(capabilities, owner, starSystem);
  if (!session2) return [];
  const consent = state(capabilities).consent.find(
    (miningConsent) =>
      miningConsent.owner === owner &&
      miningConsent.session === session2.id &&
      miningConsent.entity === session2.ent?.id &&
      miningConsent.sys === starSystem &&
      miningConsent.until > currentTime(capabilities) &&
      miningConsent.group === String(session2.data.armada),
  );
  return [
    session2,
    ...[...capabilities.sessions()].filter(
      (session) =>
        session !== session2 &&
        session.data &&
        session.ent &&
        session.data.sys === starSystem &&
        !!(
          consent &&
          state(capabilities).consent.some(
            (miningConsent) =>
              miningConsent.owner === capabilities.db.key(session.data.name) &&
              miningConsent.session === session.id &&
              miningConsent.entity === session.ent?.id &&
              miningConsent.sys === starSystem &&
              miningConsent.group === consent.group &&
              miningConsent.group === String(session.data.armada) &&
              miningConsent.until > currentTime(capabilities),
          )
        ),
    ),
  ];
}

function eligible(
  capabilities: PressureCapabilities,
  space: Space,
  owners: string[],
  sessions: number[],
  entity: Entity,
) {
  if (!entity.player || entity.dead) return false;
  const session = entity.player.s,
    entryKey = capabilities.db.key(session.data.name),
    indexOf2 = owners.indexOf(entryKey);
  if (
    indexOf2 < 0 ||
    sessions[indexOf2] !== session.id ||
    session.ent !== entity ||
    (!space.sys.farside && capabilities.newcomer(session.data))
  )
    return false;
  // The owner is index 0. Other captains must retain separate live opt-in.
  const owner = online(capabilities, owners[0], space.id),
    ownerConsent =
      owner &&
      state(capabilities).consent.find(
        (miningConsent) =>
          miningConsent.owner === owners[0] &&
          miningConsent.session === owner.id &&
          miningConsent.entity === owner.ent?.id &&
          miningConsent.sys === space.id &&
          miningConsent.group === String(owner.data.armada) &&
          miningConsent.until > currentTime(capabilities),
      );
  return (
    indexOf2 === 0 ||
    !!(
      ownerConsent &&
      state(capabilities).consent.some(
        (miningConsent) =>
          miningConsent.owner === entryKey &&
          miningConsent.session === session.id &&
          miningConsent.entity === session.ent?.id &&
          miningConsent.sys === space.id &&
          miningConsent.group === ownerConsent.group &&
          miningConsent.group === String(session.data.armada) &&
          miningConsent.until > currentTime(capabilities),
      )
    )
  );
}

function field(capabilities: PressureCapabilities, space: Pick<Space, 'id'>, entryKey: string) {
  const savedMiningPressure = state(capabilities),
    clock = currentTime(capabilities);
  let miningFieldRecovery = savedMiningPressure.fields.find(
    (miningFieldRecovery) => miningFieldRecovery.key === entryKey,
  );
  if (!miningFieldRecovery) {
    miningFieldRecovery = { key: entryKey, recovery: 0, updated: clock };
    savedMiningPressure.fields.push(miningFieldRecovery);
  }
  miningFieldRecovery.recovery = Math.max(
    0,
    miningFieldRecovery.recovery - (clock - miningFieldRecovery.updated) * pressureRules.fieldDecay,
  );
  miningFieldRecovery.updated = clock;
  return miningFieldRecovery;
}
export const MiningPressureOperations = {
  init(this: PressureCapabilities) {
    const savedMiningPressure = this.db.world.miningPressure;
    if (!savedMiningPressure) {
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
      savedMiningPressure.version !== 1 ||
      !Number.isSafeInteger(savedMiningPressure.nextId) ||
      ![
        savedMiningPressure.captains,
        savedMiningPressure.hazards,
        savedMiningPressure.encounters,
        savedMiningPressure.consent,
        savedMiningPressure.fields,
      ].every(Array.isArray)
    )
      throw Error('Invalid mining pressure save');
    for (const captainPressure of savedMiningPressure.captains)
      if (
        !Number.isFinite(captainPressure.noise) ||
        captainPressure.noise < 0 ||
        captainPressure.noise > 100 ||
        !Number.isFinite(captainPressure.updated) ||
        !Number.isFinite(captainPressure.lastEncounter)
      )
        throw Error('Invalid captain pressure');
    for (const miningHazard of savedMiningPressure.hazards)
      if (
        !Number.isFinite(miningHazard.detonateAt) ||
        miningHazard.detonateAt < miningHazard.triggerAt + pressureRules.telegraph ||
        typeof miningHazard.resolved !== 'boolean'
      )
        throw Error('Invalid hazard');
    for (const miningFieldRecovery of savedMiningPressure.fields)
      if (
        !Number.isFinite(miningFieldRecovery.recovery) ||
        miningFieldRecovery.recovery < 0 ||
        miningFieldRecovery.recovery > pressureRules.fieldMax ||
        !Number.isFinite(miningFieldRecovery.updated)
      )
        throw Error('Invalid field recovery');
    for (const miningEncounter of savedMiningPressure.encounters)
      if (
        !Array.isArray(miningEncounter.ids) ||
        miningEncounter.ids.length > 2 ||
        miningEncounter.sessions.length !== miningEncounter.participants.length ||
        !Number.isFinite(miningEncounter.at) ||
        typeof miningEncounter.active !== 'boolean'
      )
        throw Error('Invalid mining encounter');
    for (const miningHazard of savedMiningPressure.hazards)
      if (
        miningHazard.sessions.length !== miningHazard.participants.length ||
        !Array.isArray(miningHazard.entities) ||
        miningHazard.entities.length !== miningHazard.participants.length ||
        !Number.isFinite(miningHazard.radius) ||
        miningHazard.radius <= 0 ||
        !Number.isFinite(miningHazard.x) ||
        !Number.isFinite(miningHazard.y)
      )
        throw Error('Invalid mining hazard scope');
    // Saved entity/session identities are process-local: retire old effects, never replay against arrivals.
    for (const miningHazard of savedMiningPressure.hazards) miningHazard.resolved = true;
    for (const miningEncounter of savedMiningPressure.encounters) miningEncounter.active = false;
    savedMiningPressure.consent = [];
    this.db.touch();
  },

  work(
    this: PressureCapabilities,
    space: MiningSpace,
    rock: SavedRockGeneration,
    seconds: number,
    captains: readonly string[] = rock.captain ? [rock.captain] : [],
  ) {
    const owner = captains[0];
    if (!owner || seconds <= 0) return;
    const savedMiningPressure = state(this);
    for (const account of captains) {
      const captainPressure = captain(this, account, space.id),
        session = online(this, account, space.id);
      captainPressure.noise = Math.min(
        100,
        captainPressure.noise + (seconds * pressureRules.noisePerSecond) / captains.length,
      );
      if (captainPressure.noise >= pressureRules.warn && !captainPressure.warned) {
        captainPressure.warned = true;
        if (session)
          this.toast(
            session,
            'MINING PRESSURE 70/100 — leave the field to cool; extraction can attract a bounded encounter.',
          );
      }
    }
    const miningFieldRecovery = field(this, space, rock.key.split(':').slice(0, 2).join(':'));
    miningFieldRecovery.recovery = Math.min(
      pressureRules.fieldMax,
      miningFieldRecovery.recovery + seconds * pressureRules.fieldWorkRecovery,
    );
    if (
      (rock.ore === 'gas' || rock.seed % 7 === 0) &&
      !savedMiningPressure.hazards.some((miningHazard) => miningHazard.id === rock.key)
    ) {
      const participants = scope(this, owner, space.id);
      savedMiningPressure.hazards.push({
        id: rock.key,
        sys: space.id,
        owner,
        participants: participants.map((session) => this.db.key(session.data.name)),
        sessions: participants.map((session) => session.id),
        entities: participants.map((session) => session.ent?.id || 0),
        x: rock.x,
        y: rock.y,
        radius: pressureRules.radius,
        triggerAt: currentTime(this),
        detonateAt: Math.ceil(currentTime(this) * 1000) / 1000 + pressureRules.telegraph + 0.001,
        resolved: false,
      });
    }
    this.db.touch();
  },

  regrow(this: PressureCapabilities, space: MiningSpace, rock: SavedRockGeneration) {
    const miningFieldRecovery = field(this, space, rock.key.split(':').slice(0, 2).join(':'));
    return (1 + miningFieldRecovery.recovery / 100) * (this.rush(space.id) ? 0.85 : 1);
  },
  /**
   * Public bounded field evolution reuses the existing recovery owner, not a second ledger.
   */
  fieldState(this: PressureCapabilities, starSystem: string, index: number) {
    const miningFieldRecovery = field(this, { id: starSystem }, `${starSystem}:${index}`);
    return {
      recovery: miningFieldRecovery.recovery,
      label:
        miningFieldRecovery.recovery >= 20
          ? 'RECOVERING'
          : miningFieldRecovery.recovery >= 5
            ? 'STEADY'
            : 'RICH OPPORTUNITY',
      factor: (1 + miningFieldRecovery.recovery / 100) * (this.rush(starSystem) ? 0.85 : 1),
    };
  },

  pressureTick(this: PressureCapabilities, space: Space) {
    const savedMiningPressure = state(this),
      clock = currentTime(this);
    for (const miningHazard of savedMiningPressure.hazards)
      if (
        miningHazard.sys === space.id &&
        !miningHazard.resolved &&
        clock >= miningHazard.detonateAt
      ) {
        miningHazard.resolved = true;
        for (const entity of space.ships.values()) {
          const participant =
              miningHazard.entities[
                miningHazard.participants.indexOf(this.db.key(entity.player?.s.data.name || ''))
              ] === entity.id &&
              eligible(this, space, miningHazard.participants, miningHazard.sessions, entity),
            enrolled =
              !!entity.miningEncounter &&
              savedMiningPressure.encounters.some(
                (miningEncounter2) =>
                  miningEncounter2.id === entity.miningEncounter &&
                  miningEncounter2.active &&
                  miningEncounter2.sys === space.id &&
                  miningEncounter2.owner === miningHazard.owner,
              );
          if (
            (participant || enrolled) &&
            Math.hypot(entity.x - miningHazard.x, entity.y - miningHazard.y) <= miningHazard.radius
          )
            space.damage(entity, pressureRules.blast, pressureRules.blast, null);
        }
        space.events.push([
          'blast',
          Math.round(miningHazard.x),
          Math.round(miningHazard.y),
          miningHazard.radius,
        ]);
        this.db.touch();
      }
    for (const group of savedMiningPressure.encounters)
      if (group.sys === space.id && group.active) {
        const alive = group.ids.filter((identifier) => {
          const entity = space.ships.get(identifier);
          return entity && !entity.dead;
        });
        if (!alive.length || clock - group.at >= pressureRules.encounterLife) {
          group.active = false;
          for (const alive2 of alive) {
            const entity = space.ships.get(alive2);
            if (entity) {
              entity.ai = 'leave';
              entity.target = null;
              entity.life = 0;
            }
          }
          this.db.touch();
        }
      }
    if (
      savedMiningPressure.encounters.some(
        (miningEncounter) => miningEncounter.sys === space.id && miningEncounter.active,
      )
    )
      return;
    for (const session of this.sessions()) {
      if (
        !session.data ||
        !session.ent ||
        session.data.sys !== space.id ||
        (!space.sys.farside && this.newcomer(session.data))
      )
        continue;
      const owner = this.db.key(session.data.name),
        captainPressure = captain(this, owner, space.id);
      if (
        captainPressure.noise < pressureRules.threshold ||
        clock - captainPressure.lastEncounter < pressureRules.cooldown
      )
        continue;
      const participants = scope(this, owner, space.id).filter(
        (session) => space.sys.farside || !this.newcomer(session.data),
      );
      if (
        participants.some(
          (session) =>
            clock - captain(this, this.db.key(session.data.name), space.id).lastEncounter <
            pressureRules.cooldown,
        )
      )
        continue;
      const group = {
        id: `enc${savedMiningPressure.nextId++}`,
        sys: space.id,
        owner,
        participants: participants.map((session) => this.db.key(session.data.name)),
        sessions: participants.map((session) => session.id),
        ids: [] as number[],
        at: clock,
        active: true,
      };
      savedMiningPressure.encounters.push(group);
      for (const session of participants)
        captain(this, this.db.key(session.data.name), space.id).lastEncounter = clock;
      // Reserve before spawning; bounded hulls and fixed offsets away from ports/neutral traffic.
      for (let index = 0; index < pressureRules.encounterShips; index++) {
        let positionX = session.ent.x + 1400 + index * 100,
          positionY = session.ent.y + 900;
        const crowded = () =>
          [...space.ships.values()].some(
            (entity) =>
              !group.ids.includes(entity.id) &&
              Math.hypot(entity.x - positionX, entity.y - positionY) < 700,
          ) ||
          space.sys.stellars.some(
            (stellarBody) =>
              Math.hypot(stellarBody.x - positionX, stellarBody.y - positionY) <
              stellarBody.r + 1000,
          );
        for (let entryKey = 0; entryKey < 16 && crowded(); entryKey++) {
          positionX += 700;
          positionY += 400;
        }
        if (crowded()) continue;
        const entity = space.makeShip({
          hull: 704,
          faction: 'umbral',
          x: positionX,
          y: positionY,
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
    savedMiningPressure.hazards = savedMiningPressure.hazards.filter(
      (miningHazard) =>
        miningHazard.sys !== space.id || !miningHazard.resolved || keys.has(miningHazard.id),
    );
    savedMiningPressure.encounters = savedMiningPressure.encounters.filter(
      (miningEncounter) =>
        miningEncounter.active || clock - miningEncounter.at < pressureRules.cooldown,
    );
  },
  /**
   * A scoped encounter is hostile only to its current consenting captain hulls.
   */
  allow(this: PressureCapabilities, space: Space, leftEntity: Entity, rightEntity: Entity) {
    const identifier = leftEntity.miningEncounter || rightEntity.miningEncounter;
    if (!identifier) return null;
    if (leftEntity.miningEncounter && rightEntity.miningEncounter) return false;
    const miningEncounter2 = state(this).encounters.find(
      (miningEncounter) =>
        miningEncounter.id === identifier &&
        miningEncounter.active &&
        miningEncounter.sys === space.id,
    );
    if (!miningEncounter2) return false;
    const other = leftEntity.miningEncounter ? rightEntity : leftEntity,
      root = space.root(other);
    if (!root?.player) return false;
    if (leftEntity.miningEncounter && other !== root) return false; // Never punish friendly wingmates for captain noise.
    return eligible(this, space, miningEncounter2.participants, miningEncounter2.sessions, root);
  },

  shotAllowed(
    this: PressureCapabilities,
    space: Space,
    identifier: string | undefined,
    target: Entity,
  ) {
    if (!identifier) return true;
    const miningEncounter = state(this).encounters.find(
      (miningEncounter) =>
        miningEncounter.id === identifier &&
        miningEncounter.active &&
        miningEncounter.sys === space.id,
    );
    return (
      !!miningEncounter &&
      eligible(this, space, miningEncounter.participants, miningEncounter.sessions, target)
    );
  },

  extracted(this: PressureCapabilities, session: Session, tonnes: number) {
    if (tonnes <= 0) return;
    const captainPressure = captain(this, this.db.key(session.data.name), session.data.sys);
    captainPressure.noise = Math.min(
      100,
      captainPressure.noise + tonnes * pressureRules.noisePerTonne,
    );
    if (captainPressure.noise >= pressureRules.warn && !captainPressure.warned) {
      captainPressure.warned = true;
      this.toast(
        session,
        'MINING PRESSURE70/100 — extraction adds noise; leave the field to cool.',
      );
    }
    this.db.touch();
  },

  payload(this: PressureCapabilities, session: Session) {
    const captainPressure = captain(this, this.db.key(session.data.name), session.data.sys);
    return {
      noise: captainPressure.noise,
      warn: captainPressure.noise >= pressureRules.warn,
      groupConsent: state(this).consent.some(
        (miningConsent) =>
          miningConsent.owner === captainPressure.owner &&
          miningConsent.session === session.id &&
          miningConsent.entity === session.ent?.id &&
          miningConsent.sys === session.data.sys &&
          miningConsent.group === String(session.data.armada) &&
          miningConsent.until > currentTime(this),
      ),
      cooldown: Math.max(
        0,
        pressureRules.cooldown - (currentTime(this) - captainPressure.lastEncounter),
      ),
    };
  },

  hazards(this: PressureCapabilities, starSystem: string) {
    return state(this)
      .hazards.filter((miningHazard) => miningHazard.sys === starSystem && !miningHazard.resolved)
      .map((miningHazard) => ({
        id: miningHazard.id,
        x: miningHazard.x,
        y: miningHazard.y,
        radius: miningHazard.radius,
        detonateAt: miningHazard.detonateAt,
      }));
  },

  consent(this: PressureCapabilities, session: Session, message: { op?: string }) {
    if (
      !session.ent ||
      Object.keys(message).some((entryKey) => !['t', 'op'].includes(entryKey)) ||
      !['join', 'leave'].includes(message.op || '')
    )
      return;
    if (message.op === 'join' && !session.data.armada) {
      this.toast(
        session,
        'Join an Armada before opting in to group mining. Solo mining remains your own scope.',
      );
      return;
    }
    const savedMiningPressure = state(this),
      owner = this.db.key(session.data.name);
    savedMiningPressure.consent = savedMiningPressure.consent.filter(
      (miningConsent) => miningConsent.owner !== owner,
    );
    if (message.op === 'join' && session.data.armada)
      savedMiningPressure.consent.push({
        owner,
        session: session.id,
        entity: session.ent.id,
        sys: session.data.sys,
        group: String(session.data.armada),
        until: currentTime(this) + pressureRules.consent,
      });
    this.db.touch();
    this.toast(
      session,
      message.op === 'join'
        ? 'Group mining hazards/pressure: opted in for this flight.'
        : 'Group mining: opted out.',
    );
  },
};
