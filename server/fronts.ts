import { EXPEDITION_HULK } from '../shared/expeditions.ts';
import type { SavedGoal } from './save-contracts.ts';
import type { ServerEvent, ScheduledEvent } from '../shared/fronts.ts';
import type { LivingPayloadState } from './world-contracts.ts';
export interface WorldPayload {
  t: string;
  invasion: { sys: string; name: string; until: number } | null;
  anomalies: Record<string, string>;
  event: ServerEvent | undefined;
  calendar: ScheduledEvent[];
  states: Record<string, LivingPayloadState>;
  colonies?: Record<string, string>;
}
export interface FrontsOperations {
  frontsInit(this: FrontsCapabilities): void;
  anomalies(this: FrontsCapabilities): Record<string, string>;
  event(this: FrontsCapabilities): WorldEvent | undefined;
  mods(this: FrontsCapabilities, systemId?: string): Record<string, number>;
  bonus(this: FrontsCapabilities, playerData: PlayerData): Record<string, number>;
  stats(this: FrontsCapabilities, playerData: PlayerData): ComputedShipStats | null;
  worldPayload(this: FrontsCapabilities): WorldPayload;
  pushWorld(this: FrontsCapabilities): void;
  invasionTick(this: FrontsCapabilities): void;
  startInvasion(this: FrontsCapabilities, window: number, systemId?: string): Entity;
  onBossDamage(
    this: FrontsCapabilities,
    entity: Entity,
    entity2: Entity | null,
    damage: number,
  ): void;
  onBossKilled(this: FrontsCapabilities, entity: Entity, space: Space): void;
  goalsFor(
    this: FrontsCapabilities,
    playerData: PlayerData,
  ): { daily: SavedGoal[]; weekly: SavedGoal[] };
  goal(this: FrontsCapabilities, session: Session, type: string, count?: number): void;
  claimGoal(
    this: FrontsCapabilities,
    session: Session,
    message: { period: 'daily' | 'weekly'; i: number },
  ): void;
  token(this: FrontsCapabilities, playerData: PlayerData, faction: string, count: number): void;
  storeFor(
    this: FrontsCapabilities,
    position: {
      system: string;
      svc: string;
      site?: boolean | Record<string, string | number>;
    } | null,
  ): string | null;
  storeBuy(this: FrontsCapabilities, session: Session, message: { fac: string; id: string }): void;
  missionArrive(this: FrontsCapabilities, session: Session, space: Space): void;
  onConvoyLanded(this: FrontsCapabilities, entity: Entity): void;
  onConvoyLost(this: FrontsCapabilities, entity: Entity): void;
  missionIdle(this: FrontsCapabilities, session: Session): void;
  moreOffers(
    this: FrontsCapabilities,
    position: { id: string; system: string },
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
  ): Array<Mission>;
  jobDone(
    this: FrontsCapabilities,
    session: Session,
    mission: Mission,
    position: { system: string },
  ): void;
}
import type { FrontsCapabilities } from './features.ts';
type WorldEvent = ServerEvent;
import type { ComputedShipStats } from '../shared/rules.ts';
import type { Mission, PlayerData, Session } from './game.ts';
import type { Entity, Space } from './space.ts';

import {
  signedXorshift32 as randomGenerator,
  fnv1a as hash,
} from '../shared/deterministic-random.ts';
import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: server feature operations: invasions,
// anomalies and server events, daily and weekly goals, faction stores, and the expanded job types.
// Armada operations are defined in server/coop.js.
import {
  SYSTEMS,
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  MATERIALS,
  GRADES,
} from '../shared/galaxy.ts';
import {
  BOSSES,
  INVASION,
  ANOMALIES,
  GOAL_TYPES,
  GOAL_REWARD,
  STORE_ITEMS,
  STORE_MAT,
  SCAN,
  CHAIN_STEPS,
  anomaliesAt,
  eventAt,
  eventCalendar,
  dayKey,
  weekKey,
} from '../shared/fronts.ts';
import { ROLES, RARITY, RACE_ROLES, OFFICER_NAMES, ROSTER_MAX } from '../shared/hangar.ts';
import { captainBonus, shipStats, credits } from '../shared/rules.ts';

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param value - Value to clamp.
 * @param firstValue - Lower bound.
 * @param secondValue - Upper bound.
 * @returns Clamped value.
 */
const _clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Pick a random element from an array using a random generator function.
 * @param radius - Random generator function returning [0, 1).
 * @param firstValue - Array of items to choose from.
 * @returns Selected element.
 */
const pick = <ValueType>(radius: () => number, firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(radius() * firstValue.length)];

export const FrontsOperations = {
  /**
   * Initialize invasion scheduling and state.
   */
  frontsInit(this: FrontsCapabilities) {
    this.invasion = null;
    this.lastInvWin = Math.floor(Date.now() / (INVASION.everyMin * 60000));
    if (this.platform.invasionNow)
      this.platform.defer(
        () =>
          this.startInvasion(
            this.lastInvWin,
            systemsById[this.platform.invasionNow!] ? this.platform.invasionNow : undefined,
          ),
        500,
      ); // testing: start one at boot
  },
  // ------------------------------------------------------------------ modifiers from anomalies (per system) and the server event (global)
  /**
   * Get current active system anomalies, refreshing every 6-hour window.
   * @returns Map of system IDs to anomaly keys.
   */
  anomalies(this: FrontsCapabilities) {
    const width = Math.floor(Date.now() / (6 * 3600000));
    if (this._anW !== width) {
      this._anW = width;
      this._an = anomaliesAt(SYSTEMS);
    }
    return this._an!;
  },
  /**
   * Retrieve current active global server event.
   * @returns Current event object or null.
   */
  event(this: FrontsCapabilities) {
    return eventAt();
  },
  /**
   * Compute aggregated modifiers for a system combining local anomaly and server event.
   * @param systemId - Optional system identifier.
   * @returns Aggregated modifier multipliers and additive adjustments.
   */
  mods(this: FrontsCapabilities, systemId?: string) {
    const message: Record<string, number> = {
      shieldRe: 1,
      radar: 1,
      raid: 1,
      beam: 1,
      jumpFuel: 1,
      mining: 1,
      bounty: 1,
      sell: 1,
      regrow: 1,
      xp: 1,
      rarity: 0,
      shuttleSpeed: 1,
      shuttleYield: 1,
      swarm: 1,
      swarmLoot: 1,
      eclipse: 1,
      chest: 1,
      armadaBounty: 1,
      riftore: 1,
    };
    const angle = systemId && this.anomalies()[systemId],
      serverEvent = this.event();
    for (const source of [
      angle ? ANOMALIES[angle].mods : null,
      serverEvent ? serverEvent.mods : null,
    ])
      if (source)
        for (const [entryKey, value] of Object.entries(source))
          message[entryKey] =
            entryKey === 'rarity' ? message[entryKey] + value : message[entryKey] * value;
    return message;
  },
  // everything that modifies a captain's ship: research + bridge crew + the Armada buff while a member shares the system (2.6)
  /**
   * Calculate cumulative ship bonuses from research, bridge crew, and co-op Armada proximity.
   * @param playerData - Saved player data.
   * @returns Cumulative stat bonuses.
   */
  bonus(this: FrontsCapabilities, playerData: PlayerData) {
    const captainBonus2 = captainBonus(playerData);
    if (this.armadaBonus) this.armadaBonus(playerData, captainBonus2);
    return captainBonus2;
  },
  /**
   * Calculate effective ship statistics with all bonuses applied.
   * @param playerData - Saved player data.
   * @returns Effective ship stats.
   */
  stats(this: FrontsCapabilities, playerData: PlayerData) {
    return playerData.ship ? shipStats(this.A, playerData.ship, this.bonus(playerData)) : null;
  },
  /**
   * Build world telemetry payload containing invasion, anomaly, event, and calendar information.
   * @returns World telemetry payload.
   */
  worldPayload(this: FrontsCapabilities) {
    const inventory = this.invasion
      ? { sys: this.invasion.sys, name: this.invasion.boss.name, until: this.invasion.until }
      : null;
    return {
      t: 'world',
      invasion: inventory,
      anomalies: this.anomalies(),
      event: this.event(),
      calendar: eventCalendar(),
      states: this.statesPayload ? this.statesPayload() : {},
    }; // system states
  },
  /**
   * Broadcast updated world status telemetry to all connected sessions.
   */
  pushWorld(this: FrontsCapabilities) {
    this.broadcast(this.worldPayload());
  },

  // ------------------------------------------------------------------ invasions
  /**
   * Periodic tick check to spawn new invasions or withdraw timed-out bosses.
   */
  invasionTick(this: FrontsCapabilities) {
    const currentTime = Date.now(),
      window = Math.floor(currentTime / (INVASION.everyMin * 60000));
    const invasion2 = this.invasion;
    if (invasion2 && (currentTime > invasion2.until || !invasion2.sp.ships.has(invasion2.ent.id))) {
      if (currentTime > invasion2.until && invasion2.sp.ships.has(invasion2.ent.id)) {
        invasion2.sp.remove(invasion2.ent, 'jump');
        // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
        for (const entity of [...invasion2.sp.ships.values()])
          if (entity.owner === invasion2.ent.id) invasion2.sp.remove(entity, 'jump');
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `The ${invasion2.boss.name} withdrew from ${systemsById[invasion2.sys].name}.`,
        });
      }
      invasion2.sp.keep = false;
      this.invasion = null;
      this.pushWorld();
    }
    if (!this.invasion && window !== this.lastInvWin) {
      this.lastInvWin = window;
      this.startInvasion(window);
    }
  },
  /**
   * Spawn an invasion encounter with a world boss and minions in a target system.
   * @param window - Time window index.
   * @param systemId - Optional system ID to spawn in.
   * @returns Spawned boss entity.
   */
  startInvasion(this: FrontsCapabilities, window: number, systemId?: string) {
    const radius = randomGenerator(0xb055 + window * 31),
      pool = SYSTEMS.filter(
        (starSystem) =>
          starSystem.danger >= 2 &&
          starSystem.faction !== 'quantum' &&
          !starSystem.farside &&
          starSystem.stellars.length,
      );
    const starSystem = systemId ? systemsById[systemId] : pick(radius, pool),
      invasionBoss = BOSSES[Math.floor(radius() * BOSSES.length)];
    const space = this.spaces[starSystem.id];
    space.keep = true;
    const entryKey = (invasionBoss.mult - 1) * 100,
      angle = radius() * Math.PI * 2;
    const entity = space.makeShip({
      hull: invasionBoss.hull,
      faction: invasionBoss.faction,
      x: Math.cos(angle) * 1200,
      y: Math.sin(angle) * 1200,
      ai: 'guard',
      name: invasionBoss.name,
      bonus: { shieldPct: entryKey, armorPct: entryKey, damagePct: 60 },
    });
    entity.boss = invasionBoss.id;
    entity.life = 1e9;
    entity.noDisable = true;
    entity.home = { x: entity.x, y: entity.y };
    entity.dmgBy = {};
    for (let index = 0; index < 4; index++) {
      const entity2 = space.makeShip({
        hull: invasionBoss.minions[index % invasionBoss.minions.length],
        faction: invasionBoss.faction,
        x: entity.x + (index - 1.5) * 120,
        y: entity.y + 160,
        ai: 'escort',
        owner: entity.id,
      });
      entity2.life = 1e9;
      entity2.bossMinion = true;
    }
    this.invasion = {
      boss: invasionBoss,
      sys: starSystem.id,
      sp: space,
      ent: entity,
      until: Date.now() + INVASION.lastMin * 60000,
    };
    this.broadcast({
      t: 'notify',
      title: 'Invasion',
      body: `The ${invasionBoss.name} has appeared in ${starSystem.name}.`,
    });
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `INVASION: the ${invasionBoss.name} has appeared in ${starSystem.name} (${FACTIONS[starSystem.faction].name}). Every captain who helps bring it down shares a ${credits(invasionBoss.pool)} credit bounty.`,
    });
    this.pushWorld();
    return entity;
  },
  /**
   * Track damage dealt by player ships to an invasion boss entity.
   * @param entity - Boss ship entity.
   * @param entity2 - Attacking entity.
   * @param damage - Damage dealt amount.
   */
  onBossDamage(this: FrontsCapabilities, entity: Entity, entity2: Entity | null, damage: number) {
    if (!entity2 || !entity2.player) return;
    const name2 = entity2.player.name;
    entity.dmgBy![name2] = (entity.dmgBy![name2] || 0) + damage;
  },
  /**
   * Handle destruction of an invasion boss, distributing rewards to participating captains.
   * @param entity - Destroyed boss entity.
   * @param space - Space simulation instance where the boss died.
   */
  onBossKilled(this: FrontsCapabilities, entity: Entity, space: Space) {
    const invasionBoss = BOSSES.find((invasionBoss) => invasionBoss.id === entity.boss)!,
      total =
        Object.values(entity.dmgBy!).reduce(
          (firstValue, secondValue) => firstValue + secondValue,
          0,
        ) || 1;
    const ranked = Object.entries(entity.dmgBy!).sort(
      (firstValue, secondValue) => secondValue[1] - firstValue[1],
    );
    const names: string[] = [];
    ranked.forEach(([name, damage], index) => {
      const share = damage / total;
      if (share < INVASION.minShare) return;
      const playerAccount = this.db.get(name);
      if (!playerAccount) return;
      const credits2 = Math.round(invasionBoss.pool * share),
        game = index === 0 ? 4 : index < 3 ? 3 : 2,
        materials = MATERIALS[index % 3];
      playerAccount.credits += credits2;
      playerAccount.stats.earned += credits2;
      playerAccount.mats[materials][game]++;
      playerAccount.tokens = playerAccount.tokens || {};
      playerAccount.tokens.any = (playerAccount.tokens.any || 0) + 5;
      this.log(
        playerAccount,
        `Helped destroy the ${invasionBoss.name} (${Math.round(share * 100)}% of the damage): ${credits(credits2)} credits, ${materials} ${GRADES[game]}, 5 Rift scrip.`,
      );
      names.push(`${name} ${Math.round(share * 100)}%`);
      this.refreshPlayer(name);
      for (const session of this.sessions.values())
        if (session.data === playerAccount)
          this.toast(
            session,
            `Invasion reward: ${credits(credits2)} credits, a ${materials} ${GRADES[game]} crate and 5 Rift scrip.`,
          );
    });
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `The ${invasionBoss.name} is destroyed in ${systemsById[space.id].name}! ${names.length ? 'Top guns: ' + names.slice(0, 5).join(', ') : ''}`,
    });
    for (const entity2 of space.ships.values())
      if (entity2.owner === entity.id) entity2.ai = 'leave';
    if (this.invasion && this.invasion.ent === entity) {
      space.keep = false;
      this.invasion = null;
    }
    this.db.touch();
    this.pushWorld();
  },

  // ------------------------------------------------------------------ goals
  /**
   * Retrieve or roll daily and weekly goals for player.
   * @param playerData - Saved player data.
   * @returns Player goals object containing daily and weekly lists.
   */
  goalsFor(this: FrontsCapabilities, playerData: PlayerData) {
    const dayKey2 = dayKey(),
      week = weekKey();
    playerData.goals = playerData.goals || {};
    const make = (period: 'daily' | 'weekly', entryKey: number) => {
      const radius = randomGenerator(hash(playerData.name + period + entryKey)),
        types = Object.keys(GOAL_TYPES).filter(
          (time) => time !== 'shuttles' || playerData.station.ops >= 2,
        ),
        result = [];
      while (result.length < 3 && types.length) {
        const splice2 = types.splice(Math.floor(radius() * types.length), 1)[0],
          [lowerBound, upperBound] = GOAL_TYPES[splice2][period];
        let count = lowerBound + Math.floor(radius() * (upperBound - lowerBound + 1));
        if (splice2 === 'trade') count = Math.round(count / 1000) * 1000;
        result.push({ type: splice2, n: count, got: 0, claimed: false });
      }
      return result;
    };
    if (playerData.goals.day !== dayKey2) {
      playerData.goals.day = dayKey2;
      playerData.goals.daily = make('daily', dayKey2);
    }
    if (playerData.goals.week !== week) {
      playerData.goals.week = week;
      playerData.goals.weekly = make('weekly', week);
    }
    return playerData.goals as {
      day: number;
      week: number;
      daily: SavedGoal[];
      weekly: SavedGoal[];
    };
  },
  /**
   * Advance progress for a player goal category.
   * @param session - Player session.
   * @param type - Goal category key.
   * @param count - Progress increment.
   */
  goal(this: FrontsCapabilities, session: Session, type: string, count: number = 1) {
    const playerData = session.data,
      goalsFor2 = this.goalsFor(playerData);
    for (const savedGoal of [...goalsFor2.daily, ...goalsFor2.weekly])
      if (savedGoal.type === type && savedGoal.got < savedGoal.n) {
        savedGoal.got = Math.min(savedGoal.n, savedGoal.got + count);
        if (savedGoal.got >= savedGoal.n)
          this.toast(
            session,
            `Goal complete: ${GOAL_TYPES[type].text(savedGoal.n)}. Claim it in the Goals tab.`,
          );
      }
  },
  /**
   * Claim rewards for a completed daily or weekly goal.
   * @param session - Player session.
   * @param message - Claim goal payload.
   */
  claimGoal(
    this: FrontsCapabilities,
    session: Session,
    message: { period: 'daily' | 'weekly'; i: number },
  ) {
    const playerData = session.data,
      goalsFor2 = this.goalsFor(playerData),
      list = message.period === 'weekly' ? goalsFor2.weekly : goalsFor2.daily,
      savedGoal = list[message.i | 0];
    if (!savedGoal || savedGoal.claimed || savedGoal.got < savedGoal.n) return;
    const radius = GOAL_REWARD[message.period === 'weekly' ? 'weekly' : 'daily'];
    savedGoal.claimed = true;
    playerData.credits += radius.credits;
    playerData.tokens = playerData.tokens || {};
    playerData.tokens.any = (playerData.tokens.any || 0) + radius.tokens;
    this.toast(
      session,
      `Goal reward: ${credits(radius.credits)} credits and ${radius.tokens} Rift scrip.`,
    );
    if (message.period === 'weekly') {
      const materials = MATERIALS[Math.floor(Math.random() * 3)];
      playerData.mats[materials][2]++;
      this.toast(session, `Weekly goal bonus: a ${materials} III crate.`);
    } // Grade III crate reward.
    if (list.every((savedGoal) => savedGoal.claimed)) {
      const materials = MATERIALS[Math.floor(Math.random() * 3)],
        grade = message.period === 'weekly' ? 3 : 1;
      playerData.mats[materials][grade]++;
      this.toast(
        session,
        `All ${message.period === 'weekly' ? 'weekly' : 'daily'} goals done: bonus ${materials} ${GRADES[grade]} crate.`,
      );
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ faction stores
  /**
   * Award faction reputation tokens to player data.
   * @param playerData - Saved player data.
   * @param faction - Faction identifier.
   * @param count - Number of tokens to grant.
   */
  token(this: FrontsCapabilities, playerData: PlayerData, faction: string, count: number) {
    if (!faction || FACTIONS[faction].region || faction === 'umbral') return;
    playerData.tokens = playerData.tokens || {};
    playerData.tokens[faction] = (playerData.tokens[faction] || 0) + count;
  },
  /**
   * Determine available faction store for a stellar body.
   * @param position - Stellar body descriptor.
   * @returns Faction identifier or null if no store available.
   */
  storeFor(
    this: FrontsCapabilities,
    position: {
      system: string;
      svc: string;
      site?: boolean | Record<string, string | number>;
    } | null,
  ) {
    if (!position || position.site || !position.svc.includes('L')) return null;
    const faction2 = systemsById[position.system].faction;
    return FACTIONS[faction2].region || FACTIONS[faction2].hidden || faction2 === 'umbral'
      ? null
      : faction2;
  },
  /**
   * Purchase an item or contract from a faction store.
   * @param session - Player session.
   * @param message - Purchase operation payload.
   */
  storeBuy(this: FrontsCapabilities, session: Session, message: { fac?: string; id: string }) {
    // Only an owned Personal Station offers stores outside the local faction.
    if (
      (message.fac !== undefined && typeof message.fac !== 'string') ||
      typeof message.id !== 'string'
    )
      return;
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!],
      local = this.storeFor(stellarBody),
      faction = message.fac || local || (this.ownSite(playerData, stellarBody) ? 'quantum' : null),
      factionDef = faction && Object.hasOwn(FACTIONS, faction) ? FACTIONS[faction] : undefined;
    if (!faction || session.ent || !stellarBody)
      return this.toast(session, 'Faction stores deliver to you while you are landed.');
    if (
      !factionDef ||
      factionDef.region ||
      factionDef.hidden ||
      faction === 'umbral' ||
      (!this.ownSite(playerData, stellarBody) && faction !== local)
    )
      return this.toast(
        session,
        'Visit this faction’s system or your Personal Station for that store.',
      );
    const factionStoreItem = STORE_ITEMS.find(
      (factionStoreItem) => factionStoreItem.id === message.id,
    );
    if (!factionStoreItem) return;
    if ((playerData.rep[faction] || 0) < factionStoreItem.rep)
      return this.toast(
        session,
        `${FACTIONS[faction].short} standing ${factionStoreItem.rep} needed.`,
      );
    playerData.tokens = playerData.tokens || {};
    const owner = playerData.tokens[faction] || 0,
      scrip = playerData.tokens.any || 0;
    if (owner + scrip < factionStoreItem.tokens)
      return this.toast(
        session,
        `You need ${factionStoreItem.tokens} ${FACTIONS[faction].short} tokens (Rift scrip makes up the difference).`,
      );
    if (playerData.credits < factionStoreItem.credits)
      return this.toast(session, 'Not enough credits.');
    if (factionStoreItem.give.officer && playerData.officers.length >= ROSTER_MAX)
      return this.toast(session, 'Your roster is full.');
    const useOwn = Math.min(owner, factionStoreItem.tokens);
    playerData.tokens[faction] = owner - useOwn;
    playerData.tokens.any = scrip - (factionStoreItem.tokens - useOwn);
    playerData.credits -= factionStoreItem.credits;
    const game = factionStoreItem.give as {
      crate?: number;
      officer?: number;
      xp?: number;
      rep?: number;
    };
    if (game.crate) {
      const materialType = STORE_MAT[faction] || 'alloy';
      playerData.mats[materialType][game.crate]++;
      this.toast(session, `Bought a ${materialType} ${GRADES[game.crate]} crate.`);
    }
    if (game.officer) {
      const radius = Math.random,
        role = pick(radius, RACE_ROLES[faction] || Object.keys(ROLES)),
        count = OFFICER_NAMES[faction] || OFFICER_NAMES.quantum;
      const options = {
        id: this.uid(playerData),
        name: pick(radius, count[0]) + ' ' + pick(radius, count[1]),
        race: RACE_ROLES[faction] ? faction : 'quantum',
        role,
        rarity: game.officer,
        lv: 1 + Math.floor(radius() * 3),
        xp: 0,
      };
      playerData.officers.push(options);
      this.toast(
        session,
        `${RARITY[options.rarity].name} ${ROLES[role].name.toLowerCase()} ${options.name} signs on.`,
      );
      this.log(playerData, `Signed ${options.name} through a ${FACTIONS[faction].short} contract.`);
    }
    if (game.xp) {
      this.officerXp(session, game.xp);
      this.toast(session, 'Your bridge crew study the manuals.');
    }
    if (game.rep) {
      playerData.rep[faction] = clampStanding((playerData.rep[faction] || 0) + game.rep);
      this.toast(session, `${FACTIONS[faction].short} standing +${game.rep}.`);
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ expanded jobs: convoy, smuggling, rescue, survey, assassination, chains
  // called when a captain arrives in a system (after spawnPlayer)
  /**
   * Spawn mission entities (convoys, wrecks, assassination targets) upon player arrival in system.
   * @param session - Player session.
   * @param space - Current space system instance.
   */
  missionArrive(this: FrontsCapabilities, session: Session, space: Space) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    for (const mission of playerData.missions) {
      if (mission.sys !== playerData.sys || mission.done) continue;
      if (mission.type === 'convoy' && !mission.spawned) {
        const stellarBody = STELLARS[mission.dest!];
        if (!stellarBody) continue;
        mission.spawned = true;
        const entity2 = space.makeShip({
          hull: mission.hull,
          faction: mission.faction,
          x: entity.x + 140,
          y: entity.y + 60,
          a: entity.a,
          ai: 'trade',
          name: mission.convoyName,
        });
        entity2.dest = { ...stellarBody };
        entity2.convoyOf = { id: mission.id, owner: session.id };
        entity2.life = 1e9;
        entity2.noDisable = true;
        for (let index = 0; index < mission.raiders!; index++) {
          const angle = Math.random() * 6.28;
          const entity = space.makeShip({
            hull: mission.raiderHull,
            faction: 'hollow',
            x: stellarBody.x + Math.cos(angle) * 900,
            y: stellarBody.y + Math.sin(angle) * 900,
            ai: 'raid',
          });
          entity.target = entity2;
          entity.life = 1e9;
        }
        this.toast(
          session,
          `Your convoy, the ${mission.convoyName}, is with you. Get it safely to ${stellarBody.name}.`,
        );
      }
      if (mission.type === 'rescue' && !mission.spawned) {
        mission.spawned = true;
        const angle = Math.random() * 6.28;
        const entity = space.makeShip({
          hull: mission.hull,
          faction: mission.faction,
          x:
            mission.exp && space.sys.id === EXPEDITION_HULK.system
              ? EXPEDITION_HULK.x + 1000
              : mission.eventide
                ? mission.rescuePoint![0]
                : Math.cos(angle) * 1300,
          y:
            mission.exp && space.sys.id === EXPEDITION_HULK.system
              ? EXPEDITION_HULK.y
              : mission.eventide
                ? mission.rescuePoint![1]
                : Math.sin(angle) * 1300,
          name: mission.wreckName,
        });
        entity.disabled = true;
        entity.armor = entity.st.armor * 0.1;
        entity.rescueOf = { id: mission.id, owner: session.id };
        entity.life = 1e9;
        entity.wreckT = 1e9;
        this.toast(
          session,
          `Distress beacon: the ${mission.wreckName} is drifting in this system. Board it and choose Rescue.`,
        );
      }
      if (mission.type === 'assassinate' && !mission.spawned) {
        mission.spawned = true;
        const entity = space.spawnMissionTarget({ ...mission, owner: session.id })!;
        for (let index = 0; index < 2; index++) {
          const entity6 = space.makeShip({
            hull: mission.guard,
            faction: mission.faction,
            x: entity.x + (index ? 90 : -90),
            y: entity.y + 80,
            ai: 'escort',
            owner: entity.id,
          });
          entity6.life = 1e9;
        }
        this.toast(session, `${mission.targetName} is here with bodyguards.`);
      }
      if (mission.type === 'survey')
        this.toast(
          session,
          `Survey: pass within 450 km of ${mission.points!.length - (mission.seen! || []).length} marked points (shown on your radar).`,
        );
    }
  },
  /**
   * Complete escort mission when convoy ship successfully lands at destination.
   * @param entity - Landed convoy entity.
   */
  onConvoyLanded(this: FrontsCapabilities, entity: Entity) {
    const session = this.sessions.get(entity.convoyOf!.owner);
    if (!session || !session.data) return;
    const mission = session.data.missions.find((mission) => mission.id === entity.convoyOf!.id);
    if (!mission) return;
    mission.done = true;
    this.toast(session, `The ${mission.convoyName} landed safely. Land anywhere to be paid.`);
    this.you(session);
  },
  /**
   * Fail escort mission when protected convoy ship is destroyed.
   * @param entity - Destroyed convoy entity.
   */
  onConvoyLost(this: FrontsCapabilities, entity: Entity) {
    const session = this.sessions.get(entity.convoyOf!.owner);
    if (!session || !session.data) return;
    const mission = session.data.missions.find((mission) => mission.id === entity.convoyOf!.id);
    if (!mission) return;
    session.data.missions = session.data.missions.filter((mission2) => mission2 !== mission);
    this.toast(session, `The ${mission.convoyName} was destroyed. Job failed.`);
    this.log(session.data, `Failed: ${mission.title} (convoy destroyed).`);
    this.you(session);
  },
  // every two seconds for captains in space: survey points, smuggler scans
  /**
   * Periodic check in space for survey waypoint proximity and police smuggler cargo scans.
   * @param session - Player session.
   */
  missionIdle(this: FrontsCapabilities, session: Session) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    const space = this.spaces[playerData.sys],
      starSystem = systemsById[playerData.sys];
    for (const mission of playerData.missions) {
      if (mission.type === 'survey' && mission.sys === playerData.sys && !mission.done) {
        mission.seen! = mission.seen! || [];
        mission.points!.forEach((position, index) => {
          if (
            !mission.seen!.includes(index) &&
            Math.hypot(position[0] - entity.x, position[1] - entity.y) < 450
          ) {
            mission.seen!.push(index);
            this.toast(
              session,
              `Survey point ${mission.seen!.length}/${mission.points!.length} logged.`,
            );
          }
        });
        if (mission.seen!.length >= mission.points!.length) {
          mission.done = true;
          this.toast(session, 'Survey complete. Land anywhere to be paid.');
        }
        this.you(session);
      }
      if (
        !entity.dead &&
        !entity.disabled &&
        entity.state === 'fly' &&
        mission.type === 'smuggle' &&
        !mission.done &&
        !FACTIONS[starSystem.faction].region &&
        !FACTIONS[starSystem.faction].pirate &&
        starSystem.danger <= 2
      ) {
        const currentTime = Date.now();
        if (currentTime - (mission.scanT || 0) < SCAN.cooldown * 1000) continue;
        const entity2 = [...space.ships.values()].find(
          (entity3) =>
            entity3.ai === 'patrol' &&
            !entity3.dead &&
            !entity3.disabled &&
            entity3.state === 'fly' &&
            entity3.faction === starSystem.faction &&
            Math.hypot(entity3.x - entity.x, entity3.y - entity.y) < SCAN.range,
        );
        if (!entity2) continue;
        mission.scanT = currentTime;
        session.attentionScan = {
          system: playerData.sys,
          entity: entity.id,
          until: currentTime + 3000,
        };
        if (
          Math.random() <
          SCAN.chance *
            (1 - (this.bonus(playerData).lootPct || 0) / 300) *
            (1 - Math.min(80, this.bonus(playerData).scanPct || 0) / 100)
        ) {
          // ghosts and fixers slip past scans
          const fine = Math.round(mission.reward * SCAN.fine);
          playerData.credits = Math.max(0, playerData.credits - fine);
          playerData.rep[starSystem.faction] = clampStanding(
            (playerData.rep[starSystem.faction] || 0) - 5,
          );
          playerData.missions = playerData.missions.filter((mission2) => mission2 !== mission);
          this.toast(
            session,
            `A ${FACTIONS[starSystem.faction].short} patrol scanned your hold and found the contraband. Fined ${credits(fine)} credits; cargo seized.`,
          );
          this.log(playerData, `Caught smuggling in ${starSystem.name}.`);
          this.you(session);
          return;
        }
        this.toast(
          session,
          `A ${FACTIONS[starSystem.faction].short} patrol scanned you and found nothing. Keep moving.`,
        );
      }
    }
  },
  // extra job offers for 0.6 (merged into the job board)
  /**
   * Generate expanded job offerings (convoys, smuggling, rescues, surveys, bounties, faction chains).
   * @param position - Current stellar body.
   * @param playerData - Saved player data.
   * @param radius - Random generator function.
   * @param near - Nearby system IDs and jump distances.
   * @param window - Time window index.
   * @returns List of generated mission offers.
   */
  moreOffers(
    this: FrontsCapabilities,
    position: { id: string; system: string },
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
  ) {
    const result = [],
      faction2 = systemsById[position.system].faction,
      lawful = !FACTIONS[faction2].region && !FACTIONS[faction2].pirate && faction2 !== 'umbral';
    const pickSys = () => near[Math.floor(radius() * near.length)];
    for (let index = 0; index < 3 && near.length; index++) {
      const roll = radius(),
        [starSystem, jumps] = pickSys(),
        starSystem2 = systemsById[starSystem],
        identifier = `${position.id}-${window}-x${index}`;
      const land = starSystem2.stellars.filter(
        (rawStellarBody) => rawStellarBody.svc!.includes('L') && !rawStellarBody.site,
      );
      if (roll < 0.2 && land.length) {
        const rawStellarBody = land[Math.floor(radius() * land.length)],
          hull = pick(radius, [704, 706, 712]),
          pick2 = pick(radius, [
            'Patience',
            'Good Harvest',
            'Long Odds',
            'Slow Mercy',
            'Copper Kettle',
            'Tallyman',
          ]);
        result.push({
          id: identifier,
          type: 'convoy',
          title: `Escort the ${pick2} to ${rawStellarBody.name}`,
          sys: starSystem,
          dest: rawStellarBody.id,
          hull,
          faction: 'spacer',
          convoyName: pick2,
          raiders: 2 + Math.min(2, starSystem2.danger >> 1),
          raiderHull: pick(radius, [705, 708, 711]),
          reward: Math.round(6000 + jumps * 1500 + starSystem2.danger * 2500),
          text: `Meet the freighter ${pick2} in ${starSystem2.name} and keep her alive until she lands at ${rawStellarBody.name}. Hollow raiders are waiting.`,
        });
      } else if (roll < 0.38 && lawful) {
        const quantity = 4 + Math.floor(radius() * 8);
        const rawStellarBody = land.length ? land[Math.floor(radius() * land.length)] : null;
        if (!rawStellarBody) continue;
        result.push({
          id: identifier,
          type: 'smuggle',
          title: `Smuggle ${quantity} t of unmarked crates to ${rawStellarBody.name}`,
          sys: starSystem,
          dest: rawStellarBody.id,
          qty: quantity,
          reward: Math.round(9000 + jumps * 3000 + quantity * 500),
          text: `No questions asked. Carry ${quantity} tons of sealed crates to ${rawStellarBody.name} in ${starSystem2.name}. Patrols in lawful space may scan you: if they do, you are fined and the cargo is seized.`,
        });
      } else if (roll < 0.56) {
        const pick3 = pick(radius, [
          'Wanderer',
          'Bright Promise',
          'Ninth Lantern',
          'Saltwind',
          'Kestrel Nine',
          'Meridian Star',
        ]);
        result.push({
          id: identifier,
          type: 'rescue',
          title: `Rescue the crew of the ${pick3}`,
          sys: starSystem,
          hull: pick(radius, [704, 705, 707]),
          faction: lawful ? faction2 : 'spacer',
          wreckName: pick3,
          reward: Math.round(4000 + jumps * 1200 + starSystem2.danger * 1500),
          text: `The ${pick3} lost power in the ${starSystem2.name} system. Find her, board her and bring the crew home.`,
        });
      } else if (roll < 0.76) {
        const points2: [number, number][] = starSystem2.stellars
          .slice(0, 3)
          .map((rawStellarBody) => [rawStellarBody.x, rawStellarBody.y]);
        while (points2.length < 3) {
          const firstValue = radius() * 6.28,
            distanceSquared = 900 + radius() * 1100;
          points2.push([
            Math.round(Math.cos(firstValue) * distanceSquared),
            Math.round(Math.sin(firstValue) * distanceSquared),
          ]);
        }
        result.push({
          id: identifier,
          type: 'survey',
          title: `Survey the ${starSystem2.name} system`,
          sys: starSystem,
          points: points2,
          reward: Math.round(3500 + jumps * 1300 + starSystem2.danger * 1200),
          text: `Fly a sensor sweep of ${starSystem2.name}: pass close to three marked points, then land anywhere to file the survey.`,
        });
      } else {
        const faction3 = starSystem2.danger >= 4 && !starSystem2.farside ? 'umbral' : 'hollow',
          pick4 = pick(radius, [
            '"Grinning" Vask',
            'the Saltmarsh Butcher',
            'Captain Nine-Fingers',
            'Mother Rust',
            'the Pale Duke',
          ]);
        result.push({
          id: identifier,
          type: 'assassinate',
          title: `Wanted: ${pick4}`,
          sys: starSystem,
          hull: faction3 === 'umbral' ? 763 : 717,
          guard: faction3 === 'umbral' ? 761 : 711,
          faction: faction3,
          targetName: pick4,
          reward: Math.round(25000 + starSystem2.danger * 6000),
          text: `${pick4} commands a raider capital in ${starSystem2.name}, guarded by two escorts. Destroy the flagship.`,
        });
      }
    }
    // faction chains: three steps, each pays more; the next step shows up on any board in that power's space
    if (lawful) {
      const step = (playerData.chains && playerData.chains[faction2]) || 0;
      if (
        step < CHAIN_STEPS &&
        near.length &&
        !playerData.missions.some((mission) => mission.chain && mission.chain.fac === faction2)
      ) {
        const radiusSquared = randomGenerator(hash(playerData.name + faction2 + step)),
          [starSystem, jumps] = near[Math.floor(radiusSquared() * near.length)],
          starSystem4 = systemsById[starSystem],
          factionDef = FACTIONS[faction2];
        const points3: [number, number][] = starSystem4.stellars
          .slice(0, 2)
          .map((rawStellarBody) => [rawStellarBody.x, rawStellarBody.y]);
        while (points3.length < 3) {
          const firstValue = radiusSquared() * 6.28,
            distanceSquared = 800 + radiusSquared() * 1200;
          points3.push([
            Math.round(Math.cos(firstValue) * distanceSquared),
            Math.round(Math.sin(firstValue) * distanceSquared),
          ]);
        }
        const titles = [
          `${factionDef.short} Commission I: Quiet Eyes`,
          `${factionDef.short} Commission II: The Long Watch`,
          `${factionDef.short} Commission III: Seal of the ${factionDef.short}`,
        ];
        result.unshift({
          id: `chain-${faction2}-${step}`,
          type: 'survey',
          chain: { fac: faction2, step },
          title: titles[step],
          sys: starSystem,
          points: points3,
          reward: Math.round((12000 + jumps * 2000) * (1 + step)),
          text: `Step ${step + 1} of ${CHAIN_STEPS} for the ${factionDef.name}: run a quiet sensor sweep of ${starSystem4.name}. ${step === CHAIN_STEPS - 1 ? 'Finishing the commission earns their lasting favour.' : 'Do this well and they will have more work for you.'}`,
        });
      }
    }
    return result;
  },
  // job completion extras: tokens, chains, goals
  /**
   * Handle job completion rewards including tokens, faction commission chains, and goal advancement.
   * @param session - Player session.
   * @param mission - Completed mission record.
   * @param position - Landed stellar body.
   */
  jobDone(
    this: FrontsCapabilities,
    session: Session,
    mission: Mission,
    position: { system: string },
  ) {
    const playerData = session.data,
      faction2 = systemsById[position.system].faction,
      count = 1 + Math.min(2, Math.floor(mission.reward / 12000));
    this.token(playerData, faction2, count);
    this.goal(session, 'jobs');
    if (mission.chain) {
      playerData.chains = playerData.chains || {};
      playerData.chains[mission.chain.fac] = mission.chain.step + 1;
      if (mission.chain.step + 1 >= CHAIN_STEPS) {
        const factionDef = FACTIONS[mission.chain.fac];
        playerData.rep[mission.chain.fac] = clampStanding(
          (playerData.rep[mission.chain.fac] || 0) + 12,
        );
        this.token(playerData, mission.chain.fac, 10);
        this.toast(
          session,
          `Commission complete: the ${factionDef.name} honour you (+12 standing, 10 tokens).`,
        );
        this.log(playerData, `Completed the ${factionDef.short} Commission.`);
      } else
        this.toast(
          session,
          `Commission step ${mission.chain.step + 1} done. The next step waits on any ${FACTIONS[mission.chain.fac].short} job board.`,
        );
    }
  },
};
