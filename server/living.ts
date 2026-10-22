import type { LivingState, LivingPayloadState } from './world-contracts.ts';
export interface LivingOperations {
  livingInit(this: LivingCapabilities): void;
  marketSystems(this: LivingCapabilities): string[];
  stateOf(this: LivingCapabilities, systemId: string): LivingState | null;
  warEnemy(this: LivingCapabilities, system: SpaceSystem): string | null;
  livingTick(this: LivingCapabilities): void;
  statesPayload(this: LivingCapabilities): Record<string, LivingPayloadState>;
  impact(this: LivingCapabilities, sessionId: string, captainId: string): number;
  addImpact(this: LivingCapabilities, sessionId: string, captainId: string, tons: number): void;
  livingMult(this: LivingCapabilities, stellarBody: StellarBody, captainId: string): number;
  stateProgress(
    this: LivingCapabilities,
    session: Session,
    starSystem: string,
    what: string,
    count: number,
  ): void;
  resolveState(this: LivingCapabilities, session: Session, starSystem: string): void;
  stateOnKill(this: LivingCapabilities, session: Session, entity: Entity, space: Space): void;
  stateOffers(
    this: LivingCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
  ): Array<Mission>;
  supplyReady(this: LivingCapabilities, playerData: PlayerData, mission: Mission): boolean;
}
import type { LivingCapabilities } from './features.ts';
import type { Mission, PlayerData, Session, SpaceSystem, StellarBody } from './game.ts';
import type { Entity, Space } from './space.ts';

import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: system states that come and go, a market that remembers what captains sold, and
// supply jobs that pay you to bring what a troubled system needs. Owned by game.features.living.
import { SYSTEMS, SYS as systemsById, FACTIONS, COMMODITIES } from '../shared/galaxy.ts';
import { STATES, STATE_SHARE, STATE_MIN, TRADE_IMPACT } from '../shared/living.ts';
import { credits } from '../shared/rules.ts';

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param value - Value to clamp.
 * @param firstValue - Minimum value.
 * @param secondValue - Maximum value.
 * @returns Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Pick a random item from an array.
 * @param firstValue - Array of items.
 * @returns Chosen item.
 */
const pick = <ValueType>(firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(Math.random() * firstValue.length)];

/**
 * Headline generators for system events.
 */

const START_NEWS: Record<
  string,
  (system: SpaceSystem | Record<string, string | number>, state?: LivingState) => string
> = {
  famine: (state) => `Famine grips ${state.name}: food prices have doubled and relief is needed.`,
  plague: (state) => `A fever spreads through ${state.name}. Medical supplies are urgently needed.`,
  boom: (state) => `${state.name} is booming: luxuries and equipment are selling high.`,
  war: (state, livingState) =>
    `War in ${state.name}: ${FACTIONS[livingState!.enemy!].name} ships are attacking the ${FACTIONS[state.faction].short}.`,
  pirates: (state) => `Raiders have the lanes in ${state.name}. Bounties there pay half again.`,
  festival: (state) => `A festival fills the spaceports of ${state.name}.`,
  rush: (state) =>
    `A mining rush in ${state.name}: refineries posted finite sourcing orders and fields are recovering faster.`,
  refugees: (state) =>
    `Refugees are pouring into ${state.name}. Food, medicine and passage are scarce.`,
};

export const LivingOperations = {
  /**
   * Initialize living world state containers in the database.
   */
  livingInit(this: LivingCapabilities) {
    const worldData = this.db.world;
    worldData.states = worldData.states || {};
    worldData.stateCool = worldData.stateCool || {};
    worldData.tradeImpact = worldData.tradeImpact || {};
  },
  /**
   * Get all non-arena systems with active trade ports.
   * @returns List of system IDs.
   */
  marketSystems(this: LivingCapabilities) {
    return (
      this._mkt ||
      (this._mkt = SYSTEMS.filter(
        (starSystem) =>
          !starSystem.arena &&
          starSystem.stellars.some(
            (stellarBody) => stellarBody.svc && stellarBody.svc.includes('T') && !stellarBody.site,
          ),
      ).map((starSystem) => starSystem.id))
    );
  },
  /**
   * Look up the currently active event state for a system.
   * @param systemId - System ID.
   * @returns System state object or null if none active.
   */
  stateOf(this: LivingCapabilities, systemId: string) {
    const livingState = this.db.world.states && this.db.world.states[systemId];
    return livingState && livingState.until > Date.now() ? livingState : null;
  },
  // a war needs an enemy: a power hostile to the system's owner, preferably one next door
  /**
   * Select a hostile enemy faction for a system entering a war state.
   * @param system - System metadata.
   * @returns Hostile enemy faction key or null.
   */
  warEnemy(this: LivingCapabilities, system: SpaceSystem) {
    const factionDef = FACTIONS[system.faction];
    if (!factionDef || factionDef.region || factionDef.pirate || system.faction === 'umbral')
      return null;
    const next = new Set(
      system.links
        .map((length) => systemsById[length].faction)
        .filter(
          (factionId) =>
            factionId !== system.faction &&
            FACTIONS[factionId] &&
            !FACTIONS[factionId].region &&
            factionDef.hostile.includes(factionId),
        ),
    );
    const pool = next.size
      ? [...next]
      : factionDef.hostile.filter(
          (factionId) =>
            FACTIONS[factionId] && !FACTIONS[factionId].region && factionId !== 'umbral',
        );
    return pool.length ? pick(pool) : null;
  },
  /**
   * Advance the living galaxy simulation tick, updating system states and generating news.
   */
  livingTick(this: LivingCapabilities) {
    this.livingInit();
    const worldData = this.db.world,
      currentTime = Date.now();
    let changed = false;
    for (const [starSystem, livingState] of Object.entries(worldData.states))
      if (livingState.until <= currentTime) {
        delete worldData.states[starSystem];
        worldData.stateCool[starSystem] = currentTime + 20 * 60000;
        this.news(
          STATES[livingState.kind].end
            .replace('{sys}', systemsById[starSystem].name)
            .replace('{fac}', FACTIONS[systemsById[starSystem].faction].name),
        );
        changed = true;
      }
    const want = Math.round(this.marketSystems().length * STATE_SHARE);
    for (
      let tries = 0, limit = this._livingStarted ? 6 : want * 3;
      Object.keys(worldData.states).length < want && tries < limit;
      tries++
    ) {
      const pick2 = pick(this.marketSystems()),
        starSystem = systemsById[pick2];
      if (worldData.states[pick2] || (worldData.stateCool[pick2] || 0) > currentTime) continue;
      const kinds = Object.entries(STATES).filter(
        ([entryKey]) =>
          !(
            (entryKey === 'war' || entryKey === 'pirates') &&
            starSystem.stellars.some((rawStellarBody) => rawStellarBody.hub)
          ) &&
          (entryKey !== 'war' || this.warEnemy(starSystem)) &&
          (entryKey !== 'rush' || (starSystem.fields || []).length) &&
          (entryKey !== 'pirates' || !FACTIONS[starSystem.faction].pirate),
      );
      let total = kinds.reduce((firstValue, [, systemState]) => firstValue + systemState.weight, 0),
        roll = Math.random() * total,
        kind = kinds[0][0];
      for (const [entryKey, systemState] of kinds) {
        roll -= systemState.weight;
        if (roll <= 0) {
          kind = entryKey;
          break;
        }
      }
      const systemState2 = STATES[kind],
        livingState: LivingState = {
          kind,
          start: currentTime,
          until:
            currentTime + (STATE_MIN[0] + Math.random() * (STATE_MIN[1] - STATE_MIN[0])) * 60000,
          got: 0,
          need: systemState2.need ? systemState2.need!.qty : 0,
        };
      if (kind === 'war') livingState!.enemy = this.warEnemy(starSystem);
      worldData.states[pick2] = livingState;
      this.news(START_NEWS[kind](starSystem, livingState));
      changed = true;
    }
    this._livingStarted = true;
    if (changed) {
      this.db.touch();
      this.worldKey = null;
    }
  },
  /**
   * Compile a summary payload of all active system states for client sync.
   * @returns Active system states map.
   */
  statesPayload(this: LivingCapabilities) {
    const result: Record<string, LivingPayloadState> = {};
    for (const [starSystem, livingState] of Object.entries(this.db.world.states || {}))
      if (livingState.until > Date.now())
        result[starSystem] = {
          k: livingState.kind,
          got: livingState.got,
          need: livingState.need,
          until: livingState.until,
          enemy: livingState!.enemy || null,
        };
    return result;
  },
  // ---- prices: the system's state and what captains have been selling or buying at this world
  /**
   * Calculate decayed trade impact factor on prices for a commodity at a stellar port.
   * @param sessionId - Stellar port ID.
   * @param captainId - Commodity ID.
   * @returns Fractional impact on price.
   */
  impact(this: LivingCapabilities, sessionId: string, captainId: string) {
    const time = (this.db.world.tradeImpact || {})[sessionId];
    const positionX = time && time[captainId];
    if (!positionX) return 0;
    const value =
      positionX.v * Math.pow(0.5, (Date.now() - positionX.t) / (TRADE_IMPACT.halfLifeMin * 60000));
    if (Math.abs(value) < 0.004) {
      delete time[captainId];
      return 0;
    }
    return value;
  },
  /**
   * Record trade volume and apply price impact for a commodity at a stellar port.
   * @param sessionId - Stellar port ID.
   * @param captainId - Commodity ID.
   * @param tons - Traded volume (positive for sales, negative for purchases).
   */
  addImpact(this: LivingCapabilities, sessionId: string, captainId: string, tons: number) {
    // tons > 0: sold here (the price falls); < 0: bought here (the price rises)
    const worldData = this.db.world;
    worldData.tradeImpact = worldData.tradeImpact || {};
    const time = (worldData.tradeImpact[sessionId] = worldData.tradeImpact[sessionId] || {});
    time[captainId] = {
      v: clamp(
        this.impact(sessionId, captainId) + tons * TRADE_IMPACT.perTon,
        -TRADE_IMPACT.max,
        TRADE_IMPACT.max,
      ),
      t: Date.now(),
    };
  },
  /**
   * Calculate effective price multiplier from active system event and player trade impact.
   * @param stellarBody - Stellar body object.
   * @param captainId - Commodity ID.
   * @returns Price multiplier.
   */
  livingMult(this: LivingCapabilities, stellarBody: StellarBody, captainId: string) {
    const livingState = this.stateOf(stellarBody.system),
      stationMarket = livingState ? STATES[livingState.kind].prices[captainId] || 1 : 1;
    return stationMarket * (1 - this.impact(stellarBody.id, captainId));
  },
  // ---- captains ending states early
  /**
   * Contribute progress towards resolving an active troubled system event.
   * @param session - Player session.
   * @param starSystem - System ID.
   * @param what - Progress category key (e.g. 'cid:food', 'kill:pirate').
   * @param count - Amount of progress units.
   */
  stateProgress(
    this: LivingCapabilities,
    session: Session,
    starSystem: string,
    what: string,
    count: number,
  ) {
    const livingState = this.stateOf(starSystem);
    if (!livingState || !livingState.need) return;
    const systemState = STATES[livingState.kind];
    const counts =
      (systemState.need!.cid && what === 'cid:' + systemState.need!.cid) ||
      (systemState.need!.kills === 'pirate' && what === 'kill:pirate') ||
      (systemState.need!.kills === 'enemy' && what === 'kill:' + livingState!.enemy);
    if (!counts) return;
    session.data.stats.stateHelp = (session.data.stats.stateHelp || 0) + 1; // the career step
    const before = livingState.got;
    livingState.got = Math.min(livingState.need, livingState.got + count);
    this.db.touch();
    if (livingState.got >= livingState.need) return this.resolveState(session, starSystem);
    if (
      Math.floor(before / (livingState.need / 4)) !==
      Math.floor(livingState.got / (livingState.need / 4))
    )
      this.toast(
        session,
        `${systemState.name} in ${systemsById[starSystem].name}: ${livingState.got} / ${livingState.need} ${systemState.need!.cid ? 't delivered' : 'destroyed'}.`,
      );
  },
  /**
   * Conclude an active system state early due to player contribution, distributing rewards.
   * @param session - Player session that triggered resolution.
   * @param starSystem - System ID.
   */
  resolveState(this: LivingCapabilities, session: Session, starSystem: string) {
    const worldData = this.db.world,
      livingState = worldData.states[starSystem],
      systemState = STATES[livingState.kind],
      starSystem2 = systemsById[starSystem],
      playerData = session.data;
    delete worldData.states[starSystem];
    worldData.stateCool[starSystem] = Date.now() + 30 * 60000;
    this.worldKey = null;
    const reward = 15000 + livingState.need * 120;
    playerData.credits += reward;
    playerData.stats.earned += reward;
    playerData.rep[starSystem2.faction] = clampStanding(
      (playerData.rep[starSystem2.faction] || 0) + 6,
    );
    this.news(
      `${systemState.end.replace('{sys}', starSystem2.name).replace('{fac}', FACTIONS[starSystem2.faction].name)} ${playerData.name} led the effort.`,
    );
    this.toast(
      session,
      `You ended the ${systemState.name.toLowerCase()} in ${starSystem2.name}! The ${FACTIONS[starSystem2.faction].short} pay you ${credits(reward)} credits (+6 standing).`,
    );
    this.log(playerData, `Ended the ${systemState.name.toLowerCase()} in ${starSystem2.name}.`);
    this.db.touch();
    this.you(session);
  },
  /**
   * Check killed NPC to progress pirate or war crisis states in the system.
   * @param session - Player session scoring the kill.
   * @param entity - Killed NPC entity.
   * @param space - Space instance where the kill occurred.
   */
  stateOnKill(this: LivingCapabilities, session: Session, entity: Entity, space: Space) {
    const factionDef = FACTIONS[entity.faction] || {};
    if (factionDef.pirate || entity.faction === 'hollow')
      this.stateProgress(session, space.id, 'kill:pirate', 1);
    this.stateProgress(session, space.id, 'kill:' + entity.faction, 1);
  },
  // ---- the jobs a troubled system posts (merged into nearby job boards)
  /**
   * Generate emergency relief, patrol, or evacuation jobs for nearby troubled systems.
   * @param stellarBody - Landed stellar body.
   * @param playerData - Saved player data.
   * @param radius - Seeded RNG function.
   * @param near - Array of [systemId, jumps] tuples.
   * @param window - Time window seed.
   * @returns Generated mission objects.
   */
  stateOffers(
    this: LivingCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
  ) {
    const result = [],
      here: Array<[string, number]> = [[stellarBody.system, 0], ...near];
    for (const [starSystem, jumps] of here) {
      const livingState = this.stateOf(starSystem);
      if (!livingState) continue;
      const starSystem2 = systemsById[starSystem],
        systemState = STATES[livingState.kind];
      const ports = starSystem2.stellars.filter(
        (rawStellarBody) =>
          rawStellarBody.id !== stellarBody.id &&
          rawStellarBody.svc &&
          rawStellarBody.svc.includes('T') &&
          !rawStellarBody.site,
      );
      if (!ports.length) continue;
      const rawStellarBody = ports[Math.floor(radius() * ports.length)],
        identifier = `${stellarBody.id}-${window}-st-${starSystem}`;
      const supply = {
        famine: 'food',
        refugees: 'food',
        plague: 'medical',
        rush: null,
        war: 'equipment',
        boom: 'luxury',
        festival: 'luxury',
      }[livingState.kind];
      if (supply) {
        const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === supply)!,
          quantity = 8 + Math.floor(radius() * 18);
        result.push({
          id: identifier,
          type: 'supply',
          state: livingState.kind,
          cid: supply,
          qty: quantity,
          sys: starSystem,
          dest: rawStellarBody.id,
          reward: Math.round(
            (commodityDef.base * quantity * 1.6 + 3000 + jumps * 1200) *
              (systemState.need ? 1.25 : 1),
          ),
          title: `${systemState.icon} ${systemState.name}: bring ${quantity} t of ${commodityDef.name.toLowerCase()} to ${rawStellarBody.name}`,
          text: `${systemState.desc} Buy ${quantity} tons of ${commodityDef.name.toLowerCase()} wherever it is cheap and deliver it from your own hold to ${rawStellarBody.name} in ${starSystem2.name} (${jumps ? jumps + ' jump' + (jumps > 1 ? 's' : '') : 'this system'}). Pays well above market.`,
        });
      }
      if (livingState.kind === 'pirates' || livingState.kind === 'war') {
        const need = 3 + Math.floor(radius() * 3);
        result.push({
          id: identifier + 'p',
          type: 'patrol',
          state: livingState.kind,
          sys: starSystem,
          need,
          got: 0,
          reward: Math.round((4000 + need * 2400 + starSystem2.danger * 1800) * 1.4),
          title:
            livingState.kind === 'war'
              ? `⚔ Hold the line in ${starSystem2.name}`
              : `☠ Clear the lanes of ${starSystem2.name}`,
          text:
            livingState.kind === 'war'
              ? `Destroy ${need} ${FACTIONS[livingState!.enemy!].name} warships in ${starSystem2.name}, then land anywhere to be paid.`
              : `Destroy ${need} raiders in ${starSystem2.name}, then land anywhere to be paid. Every kill helps break the scourge.`,
        });
      }
      if (systemState.passengers) {
        const other = near.filter(([secondState]) => secondState !== starSystem)[
          Math.floor(radius() * Math.max(1, near.length - 1))
        ];
        const rawStellarBody =
          other &&
          systemsById[other[0]].stellars.find(
            (rawStellarBody3) =>
              rawStellarBody3.svc && rawStellarBody3.svc.includes('L') && !rawStellarBody3.site,
          );
        if (rawStellarBody) {
          const passengers2 = 2 + (Math.floor(radius() * 4) * systemState.passengers) / 2;
          result.push({
            id: identifier + 'x',
            type: 'passenger',
            state: livingState.kind,
            sys: other[0],
            dest: rawStellarBody.id,
            pax: Math.round(passengers2),
            reward: Math.round(2500 + other[1] * 1600 + passengers2 * 1300),
            title: `${systemState.icon} Passage for ${Math.round(passengers2)} from ${starSystem2.name} to ${rawStellarBody.name}`,
            text: `${livingState.kind === 'refugees' ? 'Refugees' : 'Festival-goers'} need passage to ${rawStellarBody.name}. Each passenger needs a bunk.`,
          });
        }
      }
    }
    return result;
  },
  // a supply job completes when you land at its destination with the goods in your hold
  /**
   * Check whether player currently carries sufficient cargo to complete a supply relief mission.
   * @param playerData - Saved player data.
   * @param mission - Mission object.
   * @returns True if required goods are in cargo.
   */
  supplyReady(this: LivingCapabilities, playerData: PlayerData, mission: Mission) {
    return mission.type === 'supply' && (playerData.cargo[mission.cid!] || 0) >= mission.qty!;
  },
};
