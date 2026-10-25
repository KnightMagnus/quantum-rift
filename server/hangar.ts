import type { StoredShip } from './save-contracts.ts';
import type { SavedShuttle, ShuttleJob, ShuttleReward } from './save-contracts.ts';
type ResearchNode = (typeof RESEARCH)[number];
export type BarOfficer = OfficerRecord & { id: string; cost: number; race: string };
export interface HangarOperations {
  hangarInit(this: HangarCapabilities, playerData: PlayerData): void;
  uid(this: HangarCapabilities, playerData: PlayerData): number;
  bays(this: HangarCapabilities, playerData: PlayerData): number;
  dockSlots(this: HangarCapabilities, playerData: PlayerData): number;
  barOffers(
    this: HangarCapabilities,
    position: {
      id: string;
      svc: string;
      system: string;
      tech?: number;
      site?: boolean | Record<string, string | number>;
    },
    playerData: PlayerData,
  ): Array<BarOfficer>;
  officerOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; id?: string; oid?: number; slot?: string },
  ): void;
  officerXp(this: HangarCapabilities, session: Session, amount: number, only?: OfficerRecord): void;
  shuttleBoard(this: HangarCapabilities, playerData: PlayerData): ShuttleJob[];
  shuttleReward(
    this: HangarCapabilities,
    missionJob: { kind: string; jumps: number; danger: number; sys: string },
    radius: () => number,
  ): {
    credits: number;
    chart?: boolean;
    mats?: Array<[string, number, number]>;
    rep?: [string, number];
  };
  shuttleChance(
    this: HangarCapabilities,
    playerData: PlayerData,
    ship: { kind: string },
    missionJob: { kind: string; danger: number },
    crew: OfficerRecord | null | undefined,
  ): number;
  shuttleOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; kind?: string; sid?: number; oid?: number; job?: string },
  ): void;
  resolveShuttle(this: HangarCapabilities, session: Session, savedShuttle: SavedShuttle): void;
  shuttleTraffic(
    this: HangarCapabilities,
    playerData: PlayerData,
    ship: { kind: string },
    direction: 'out' | 'in',
  ): void;
  researchChain(this: HangarCapabilities, state: { done: string[] }, identifier: string): string[];
  queueResearch(this: HangarCapabilities, session: Session, identifier: string): void;
  startQueued(this: HangarCapabilities, playerData: PlayerData): void;
  refineUp(
    this: HangarCapabilities,
    session: Session,
    material: string,
    game: number,
    count: number,
  ): void;
  storedValue(this: HangarCapabilities, storedShip: StoredShip): number;
  dockOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; i?: number; uid?: string },
  ): void;
  board(
    this: HangarCapabilities,
    session: Session,
    message: { id: number; act: 'plunder' | 'capture' | 'rescue' },
  ): void;
}
import type { HangarCapabilities } from './features.ts';
import type { OfficerRecord } from '../shared/rules.ts';
import type { PlayerData, Session } from './game.ts';

import {
  signedXorshift32 as randomGenerator,
  fnv1a as hash,
} from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { assertLots, addLots, commonLots } from '../shared/cargo-lots.ts';
import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: server feature operations: shuttles, officers, the research queue,
// refining crates up a grade, the drydock, and boarding disabled ships.
import {
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  RESEARCH,
} from '../shared/galaxy.ts';
import {
  SHUTTLES,
  SHUTTLE_JOBS,
  BAYS_BY_OPS,
  SHUTTLE_REPAIR,
  JOB_WINDOW_H,
  ROLES,
  RARITY,
  RACE_ROLES,
  OFFICER_NAMES,
  BRIDGE_SLOTS,
  ROSTER_MAX,
  XP_LEVEL,
  MAX_LEVEL,
  RESEARCH_QUEUE_MAX,
  REFINE_UP,
  CAPTURE_SELL,
} from '../shared/hangar.ts';
import { HANGAR_BY_OPS } from '../shared/docks.ts';
import {
  researchBonus,
  captainBonus,
  makeLoadout,
  loadoutValue,
  credits,
} from '../shared/rules.ts';

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param value - Value to clamp.
 * @param firstValue - Lower bound.
 * @param secondValue - Upper bound.
 * @returns Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Pick a random element from an array using a random generator function.
 * @param radius - Random generator function returning [0, 1).
 * @param firstValue - Array of items to choose from.
 * @returns Selected element.
 */
const pick = <ValueType>(radius: () => number, firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(radius() * firstValue.length)];

/**
 * Cache of shortest jump distance maps by starting system ID.
 */
const DIST: Record<string, Record<string, number>> = {};

const galaxyGraph = new GalaxyGraph(systemsById);

function jumps(from: string): Record<string, number> {
  return DIST[from] || (DIST[from] = galaxyGraph.distances(from));
}

/**
 * List of playable and NPC race identifiers.
 */
const RACES: string[] = Object.keys(RACE_ROLES);

export const HangarOperations = {
  // ------------------------------------------------------------------ save upgrades
  /**
   * Initialize hangar, officer, bridge, dock, and station queue data on player record.
   * @param playerData - Saved player data.
   */
  hangarInit(this: HangarCapabilities, playerData: PlayerData) {
    playerData.shuttles = playerData.shuttles || [];
    playerData.officers = playerData.officers || [];
    playerData.bridge = playerData.bridge || {};
    playerData.dock = playerData.dock || [];
    playerData.station.queue = playerData.station.queue || [];
    playerData.nextUid = playerData.nextUid || 1;
  },
  /**
   * Allocate a monotonically increasing unique identifier for player entities.
   * @param playerData - Saved player data.
   * @returns Newly allocated unique ID.
   */
  uid(this: HangarCapabilities, playerData: PlayerData) {
    return (playerData.nextUid = (playerData.nextUid || 1) + 1) - 1;
  },
  /**
   * Calculate total shuttle bay capacity based on Station Tier and research bonuses.
   * @param playerData - Saved player data.
   * @returns Total available shuttle bays.
   */
  bays(this: HangarCapabilities, playerData: PlayerData) {
    const researchBonus2 = researchBonus(playerData.station);
    return playerData.station.site
      ? BAYS_BY_OPS[playerData.station.ops] + (researchBonus2.bays || 0)
      : 0;
  },
  /**
   * Calculate total stored-ship dock slots based on Station Tier and research bonuses.
   * @param playerData - Saved player data.
   * @returns Total stored-ship berths.
   */
  dockSlots(this: HangarCapabilities, playerData: PlayerData) {
    const researchBonus2 = researchBonus(playerData.station);
    return playerData.station.site
      ? HANGAR_BY_OPS[playerData.station.ops] + (researchBonus2.dockSlots || 0)
      : 0;
  }, // stored-ship berths

  // ------------------------------------------------------------------ officers
  // a bar on any inhabited world with a job board posts three officers of the local race each hour
  /**
   * Generate three candidate officers for hire at an inhabited world with a bar service.
   * @param position - Current stellar body.
   * @param playerData - Saved player data.
   * @returns List of generated officer offers.
   */
  barOffers(
    this: HangarCapabilities,
    position: {
      id: string;
      svc: string;
      system: string;
      tech?: number;
      site?: boolean | Record<string, string | number>;
    },
    playerData: PlayerData,
  ): BarOfficer[] {
    if (!position || !position.svc.includes('B') || position.site) return [];
    const faction2 = systemsById[position.system].faction,
      hour = Math.floor(Date.now() / 3600000),
      radius = randomGenerator(hash('bar' + position.id + hour)),
      result = [];
    for (let index = 0; index < 3; index++) {
      const race = RACE_ROLES[faction2] ? faction2 : pick(radius, RACES);
      const role =
        radius() < 0.7 ? pick(radius, RACE_ROLES[race]) : pick(radius, Object.keys(ROLES));
      const radiusRatio =
          radius() + (position.tech || 2) * 0.02 + (this.mods ? this.mods().rarity : 0),
        rarity = radiusRatio > 0.985 ? 3 : radiusRatio > 0.88 ? 2 : radiusRatio > 0.6 ? 1 : 0;
      const level = 1 + Math.floor(radius() * (2 + rarity));
      const count = OFFICER_NAMES[race],
        name = pick(radius, count[0]) + ' ' + pick(radius, count[1]);
      const identifier = `${position.id}-${hour}-${index}`;
      if (playerData && playerData.officers.some((officer) => officer.src === identifier)) continue;
      result.push({
        id: identifier,
        name,
        race,
        role,
        rarity,
        lv: level,
        xp: 0,
        cost: Math.round(RARITY[rarity].cost * (1 + (level - 1) * 0.25)),
      });
    }
    return result;
  },
  /**
   * Handle officer operations including hiring from bars, assigning to bridge/shuttles, and dismissing.
   * @param session - Player session.
   * @param message - Officer action payload.
   */
  officerOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; id?: string; oid?: number; slot?: string },
  ) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    switch (message.op) {
      case 'hire': {
        if (!stellarBody || session.ent) return;
        const officer = this.barOffers(stellarBody, playerData).find(
          (barOfficer) => barOfficer.id === message.id,
        );
        if (!officer) return;
        if (playerData.officers.length >= ROSTER_MAX)
          return this.toast(session, `Your roster is full (${ROSTER_MAX} officers).`);
        if (playerData.credits < officer.cost) return this.toast(session, 'Not enough credits.');
        playerData.credits -= officer.cost;
        playerData.officers.push({
          id: this.uid(playerData),
          src: officer.id,
          name: officer.name,
          race: officer.race,
          role: officer.role,
          rarity: officer.rarity,
          lv: officer.lv,
          xp: 0,
        });
        this.log(
          playerData,
          `Signed ${RARITY[officer.rarity].name.toLowerCase()} ${ROLES[officer.role].name.toLowerCase()} ${officer.name} (${FACTIONS[officer.race].short}).`,
        );
        this.toast(
          session,
          `${officer.name} joins your crew. Assign them to the bridge or a shuttle.`,
        );
        break;
      }
      case 'assign': {
        // slot: captain | bridge1 | bridge2 | '' (unassign)
        const officer = playerData.officers.find(
          (officerRecord) => officerRecord.id === message.oid,
        );
        if (!officer) return;
        if (
          playerData.shuttles.some(
            (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state === 'out',
          )
        )
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
          if (playerData.bridge[bRIDGE_SLOTS] === officer.id)
            delete playerData.bridge[bRIDGE_SLOTS];
        for (const savedShuttle of playerData.shuttles)
          if (savedShuttle.crew === officer.id) savedShuttle.crew = null;
        if (this.unwingOfficer) this.unwingOfficer(playerData, officer.id); // one post at a time
        if (BRIDGE_SLOTS.includes(message.slot!)) playerData.bridge[message.slot!] = officer.id;
        break;
      }
      case 'dismiss': {
        const officer = playerData.officers.find(
          (officerRecord) => officerRecord.id === message.oid,
        );
        if (!officer) return;
        if (
          playerData.shuttles.some(
            (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state === 'out',
          )
        )
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
          if (playerData.bridge[bRIDGE_SLOTS] === officer.id)
            delete playerData.bridge[bRIDGE_SLOTS];
        for (const savedShuttle of playerData.shuttles)
          if (savedShuttle.crew === officer.id) savedShuttle.crew = null;
        if (this.unwingOfficer) this.unwingOfficer(playerData, officer.id);
        playerData.officers = playerData.officers.filter(
          (officerRecord) => officerRecord !== officer,
        );
        this.log(playerData, `${officer.name} left your crew.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // experience for the bridge crew (kills, jumps, jobs) or one officer (shuttle runs)
  /**
   * Award experience points to all active bridge officers or a single designated officer.
   * @param session - Player session.
   * @param amount - Base XP amount.
   * @param only - Specific officer to award XP to (optional).
   */
  officerXp(this: HangarCapabilities, session: Session, amount: number, only?: OfficerRecord) {
    const playerData = session.data,
      secondValue = this.bonus ? this.bonus(playerData) : researchBonus(playerData.station),
      entryKey = (1 + (secondValue.officerXp || 0) / 100) * (this.mods ? this.mods().xp : 1);
    const list = only
      ? [only]
      : BRIDGE_SLOTS.map((slot) =>
          playerData.officers.find((officer) => officer.id === playerData.bridge[slot]),
        ).filter((officer): officer is OfficerRecord => Boolean(officer));
    for (const officer of list) {
      if (officer.lv >= MAX_LEVEL) continue;
      officer.xp! += Math.round(amount * entryKey);
      while (officer.lv < MAX_LEVEL && officer.xp! >= XP_LEVEL(officer.lv)) {
        officer.xp! -= XP_LEVEL(officer.lv);
        officer.lv++;
        this.toast(session, `${officer.name} reached level ${officer.lv}.`);
        this.log(playerData, `${officer.name} reached level ${officer.lv}.`);
      }
    }
  },

  // ------------------------------------------------------------------ shuttles
  /**
   * Generate available shuttle mission offerings from the player's personal station.
   * @param playerData - Saved player data.
   * @returns List of active shuttle job offers.
   */
  shuttleBoard(this: HangarCapabilities, playerData: PlayerData) {
    if (!playerData.station.site) return [];
    const home = STELLARS[playerData.station.site].system,
      window = Math.floor(Date.now() / (JOB_WINDOW_H * 3600000));
    const radius = randomGenerator(hash('sh' + playerData.name + window)),
      jumps2 = jumps(home),
      result = [];
    const candidate = Object.entries(jumps2).filter(
      ([_unusedSessionId, count]) => count >= 1 && count <= 7,
    );
    const kinds = Object.keys(SHUTTLE_JOBS);
    for (let index = 0; index < 6 && candidate.length; index++) {
      const kind =
          kinds[index % kinds.length === index ? index : Math.floor(radius() * kinds.length)],
        shuttleJobType = SHUTTLE_JOBS[kind];
      const [starSystem, count] = pick(radius, candidate),
        starSystem2 = systemsById[starSystem],
        _factionDef = FACTIONS[starSystem2.faction];
      const identifier = `sj-${window}-${index}`;
      if (
        playerData.shuttles.some(
          (savedShuttle) => savedShuttle.job && savedShuttle.job.id === identifier,
        )
      )
        continue;
      const minutes = clamp(
        Math.round(10 + count * 28 + starSystem2.danger * 6 + radius() * 20),
        15,
        480,
      );
      const shuttleJob: ShuttleJob = {
        id: identifier,
        kind,
        sys: starSystem,
        jumps: count,
        danger: starSystem2.danger,
        minutes,
        title: `${pick(radius, shuttleJobType.verbs)} ${starSystem2.name}`,
      };
      shuttleJob.reward = this.shuttleReward(shuttleJob, radius);
      result.push(shuttleJob);
    }
    return result;
  },
  /**
   * Determine credit and item rewards for a generated shuttle job.
   * @param missionJob - Shuttle job specification.
   * @param radius - Random generator function.
   * @returns Reward descriptor.
   */
  shuttleReward(
    this: HangarCapabilities,
    missionJob: { kind: string; jumps: number; danger: number; sys: string },
    radius: () => number,
  ) {
    const jumps2 = missionJob.jumps,
      danger2 = missionJob.danger,
      shuttleReward: ShuttleReward = { credits: 0 };
    const clamp2 = clamp(Math.floor((danger2 + jumps2) / 3), 0, 4);
    switch (missionJob.kind) {
      case 'delivery':
        shuttleReward.credits = Math.round(2500 + jumps2 * 2600 * (1 + danger2 * 0.25));
        break;
      case 'survey':
        shuttleReward.credits = Math.round(1500 + jumps2 * 1500 * (1 + danger2 * 0.2));
        shuttleReward.chart = true;
        break;
      case 'salvage':
        shuttleReward.credits = Math.round(800 + jumps2 * 700);
        shuttleReward.mats = [
          [MATERIALS[Math.floor(radius() * 3)], clamp2, 1 + (danger2 >= 3 ? 1 : 0)],
        ];
        break;
      case 'envoy':
        shuttleReward.credits = Math.round(1000 + jumps2 * 900);
        shuttleReward.rep = [systemsById[missionJob.sys].faction, 3 + Math.min(7, jumps2)];
        break;
      case 'prospect':
        shuttleReward.mats = [[MATERIALS[Math.floor(radius() * 3)], clamp(clamp2 + 1, 1, 4), 1]];
        shuttleReward.credits = Math.round(500 + jumps2 * 400);
        break;
    }
    if (shuttleReward.rep && FACTIONS[shuttleReward.rep[0]].region) {
      shuttleReward.credits += 4000;
      delete shuttleReward.rep;
    }
    return shuttleReward;
  },
  /**
   * Calculate probability of success for a shuttle mission.
   * @param playerData - Saved player data.
   * @param ship - Shuttle state.
   * @param missionJob - Shuttle job details.
   * @param crew - Assigned officer, if any.
   * @returns Success chance probability in [0.15, 0.97].
   */
  shuttleChance(
    this: HangarCapabilities,
    playerData: PlayerData,
    ship: { kind: string },
    missionJob: { kind: string; danger: number },
    crew: OfficerRecord | null | undefined,
  ) {
    const researchBonus2 = researchBonus(playerData.station),
      shuttleJobType = SHUTTLE_JOBS[missionJob.kind];
    let component =
      shuttleJobType.base -
      missionJob.danger * 0.07 +
      (shuttleJobType.fit === ship.kind ? 0.15 : -0.05) +
      (researchBonus2.shuttlePct || 0) / 100;
    if (crew) {
      const officerSensorBonus =
        (crew.role === 'scout' ? 1 : 0.5) *
        (6 * RARITY[crew.rarity].mult * (1 + 0.1 * (crew.lv - 1)));
      component += officerSensorBonus / 100 + 0.03;
    }
    return clamp(component, 0.15, 0.97);
  },
  /**
   * Handle shuttle construction, crew assignment, dispatch, return claiming, repair, and scrapping.
   * @param session - Player session.
   * @param message - Shuttle operation payload.
   */
  shuttleOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; kind?: string; sid?: number; oid?: number; job?: string },
  ) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!],
      stationState = playerData.station;
    const atHome = stellarBody && this.ownSite(playerData, stellarBody) && !session.ent;
    switch (message.op) {
      case 'build': {
        if (!atHome) return this.toast(session, 'Shuttles are built at your Personal Station.');
        const shuttleCraft = SHUTTLES[message.kind!];
        if (!shuttleCraft) return;
        if (stationState.ops < shuttleCraft.ops)
          return this.toast(
            session,
            `The ${shuttleCraft.name} needs Station Tier ${shuttleCraft.ops}.`,
          );
        if (playerData.shuttles.length >= this.bays(playerData))
          return this.toast(
            session,
            'Every hangar bay is full. Build Station Tiers or research bay extensions.',
          );
        if (playerData.credits < shuttleCraft.cost || !this.hasMats(playerData, shuttleCraft.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= shuttleCraft.cost;
        this.takeMats(playerData, shuttleCraft.mats);
        playerData.shuttles.push({
          id: this.uid(playerData),
          kind: message.kind!,
          state: 'idle',
          crew: null,
          runs: 0,
        });
        this.log(playerData, `Built a ${shuttleCraft.name}.`);
        this.toast(session, `The ${shuttleCraft.name} is ready in its bay.`);
        break;
      }
      case 'crew': {
        const savedShuttle = playerData.shuttles.find(
          (savedShuttle) => savedShuttle.id === message.sid,
        );
        if (!savedShuttle || savedShuttle.state === 'out') return;
        const officer = message.oid
          ? playerData.officers.find((officerRecord) => officerRecord.id === message.oid)
          : null;
        if (officer) {
          if (
            playerData.shuttles.some(
              (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state === 'out',
            )
          )
            return this.toast(session, `${officer.name} is already out.`);
          for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
            if (playerData.bridge[bRIDGE_SLOTS] === officer.id)
              delete playerData.bridge[bRIDGE_SLOTS];
          for (const savedShuttle of playerData.shuttles)
            if (savedShuttle.crew === officer.id) savedShuttle.crew = null;
        }
        savedShuttle.crew = officer ? officer.id : null;
        break;
      }
      case 'send': {
        // dispatching works from anywhere: the hangar crew launch on your order
        const savedShuttle = playerData.shuttles.find(
          (savedShuttle4) => savedShuttle4.id === message.sid,
        );
        if (!savedShuttle || savedShuttle.state !== 'idle')
          return this.toast(session, 'That shuttle is not ready.');
        const shuttleJob2 = this.shuttleBoard(playerData).find(
          (shuttleJob) => shuttleJob.id === message.job,
        );
        if (!shuttleJob2) return this.toast(session, 'That job is no longer posted.');
        const researchBonus2 = researchBonus(playerData.station),
          shuttleCraft = SHUTTLES[savedShuttle.kind],
          crew = savedShuttle.crew
            ? playerData.officers.find((officer) => officer.id === savedShuttle.crew)
            : null;
        const chance = this.shuttleChance(playerData, savedShuttle, shuttleJob2, crew),
          roll = Math.random();
        const minutes = Math.max(
          5,
          Math.round(
            shuttleJob2.minutes /
              shuttleCraft.speed /
              (1 + (researchBonus2.shuttleSpeed || 0) / 100) /
              (this.mods ? this.mods().shuttleSpeed : 1),
          ),
        );
        let outcome = roll < chance ? 'success' : 'fail';
        if (outcome === 'fail') {
          const risk =
            ((0.25 + shuttleJob2.danger * 0.1) / shuttleCraft.armor) *
            (1 - (researchBonus2.shuttleSafe || 0) / 100);
          outcome =
            Math.random() < risk && shuttleJob2.danger >= 3
              ? 'lost'
              : Math.random() < 0.6
                ? 'damaged'
                : 'fail';
        }
        savedShuttle.state = 'out';
        savedShuttle.job = shuttleJob2;
        savedShuttle.ends = Date.now() + minutes * 60000;
        savedShuttle.outcome = outcome;
        savedShuttle.chance = chance;
        this.log(
          playerData,
          `${shuttleCraft.name} launched: ${shuttleJob2.title} (${minutes} min).`,
        );
        this.toast(session, `${shuttleCraft.name} launched. Back in ${minutes} minutes.`);
        this.shuttleTraffic(playerData, savedShuttle, 'out');
        break;
      }
      case 'claim': {
        // collect every shuttle that has come back
        const currentTime = Date.now();
        let count = 0;
        for (const savedShuttle of playerData.shuttles.filter(
          (savedShuttle5) => savedShuttle5.state === 'out' && currentTime >= savedShuttle5.ends!,
        )) {
          this.resolveShuttle(session, savedShuttle);
          count++;
        }
        if (!count) return this.toast(session, 'No shuttles have returned yet.');
        playerData.shuttles = playerData.shuttles.filter(
          (savedShuttle) => savedShuttle.state !== 'gone',
        );
        break;
      }
      case 'repair': {
        if (!atHome) return this.toast(session, 'Repairs happen at your Personal Station.');
        const savedShuttle = playerData.shuttles.find(
          (savedShuttle6) => savedShuttle6.id === message.sid,
        );
        if (!savedShuttle || savedShuttle.state !== 'damaged') return;
        const cost = Math.round(SHUTTLES[savedShuttle.kind].cost * SHUTTLE_REPAIR);
        if (playerData.credits < cost) return this.toast(session, 'Not enough credits.');
        playerData.credits -= cost;
        savedShuttle.state = 'idle';
        this.toast(
          session,
          `${SHUTTLES[savedShuttle.kind].name} repaired for ${credits(cost)} credits.`,
        );
        break;
      }
      case 'scrap': {
        if (!atHome) return;
        const savedShuttle = playerData.shuttles.find(
          (savedShuttle7) => savedShuttle7.id === message.sid,
        );
        if (!savedShuttle || savedShuttle.state === 'out') return;
        const back = Math.round(SHUTTLES[savedShuttle.kind].cost * 0.3);
        playerData.credits += back;
        playerData.shuttles = playerData.shuttles.filter(
          (savedShuttle7) => savedShuttle7 !== savedShuttle,
        );
        this.toast(session, `Scrapped for ${credits(back)} credits.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Resolve an accomplished or failed shuttle mission and grant rewards or report losses.
   * @param session - Player session.
   * @param savedShuttle - Completed shuttle state.
   */
  resolveShuttle(this: HangarCapabilities, session: Session, savedShuttle: SavedShuttle) {
    const playerData = session.data,
      shuttleCraft = SHUTTLES[savedShuttle.kind],
      shuttleJob = savedShuttle.job!,
      researchBonus2 = researchBonus(playerData.station),
      crew = savedShuttle.crew
        ? playerData.officers.find((officer) => officer.id === savedShuttle.crew)
        : null;
    const entryKey =
      (1 + (researchBonus2.shuttleYield || 0) / 100) * (this.mods ? this.mods().shuttleYield : 1);
    savedShuttle.runs++;
    if (savedShuttle.outcome === 'success') {
      const shuttleReward = shuttleJob.reward!,
        received = [];
      if (shuttleReward.credits) {
        const component = Math.round(shuttleReward.credits * entryKey);
        playerData.credits += component;
        playerData.stats.earned += component;
        received.push(`${credits(component)} cr`);
      }
      if (shuttleReward.mats)
        for (const [materialType, game, count] of shuttleReward.mats) {
          const quantity = count + (Math.random() < entryKey - 1 ? 1 : 0);
          playerData.mats[materialType][game] += quantity;
          received.push(`${quantity} ${materialType} ${GRADES[game]}`);
        }
      if (shuttleReward.rep) {
        playerData.rep[shuttleReward.rep[0]] = clampStanding(
          (playerData.rep[shuttleReward.rep[0]] || 0) + shuttleReward.rep[1],
        );
        received.push(`+${shuttleReward.rep[1]} ${FACTIONS[shuttleReward.rep[0]].short} standing`);
      }
      if (shuttleReward.chart && !playerData.explored.includes(shuttleJob.sys)) {
        playerData.explored.push(shuttleJob.sys);
        received.push(`charted ${systemsById[shuttleJob.sys].name}`);
      }
      if (Math.random() < 0.08 + shuttleJob.danger * 0.02) {
        const materials = MATERIALS[Math.floor(Math.random() * 3)],
          clamp2 = clamp(Math.floor(shuttleJob.danger / 2) + 1, 1, 4);
        playerData.mats[materials][clamp2]++;
        received.push(`rare find: ${materials} ${GRADES[clamp2]}`);
      }
      this.toast(
        session,
        `${shuttleCraft.name} back from "${shuttleJob.title}": ${received.join(', ')}.`,
      );
      if (this.notify)
        this.notify(session, 'Shuttle home', `${shuttleCraft.name}: ${received.join(', ')}`);
      this.log(
        playerData,
        `${shuttleCraft.name} succeeded: ${shuttleJob.title}. ${received.join(', ')}.`,
      );
      if (crew) this.officerXp(session, 30 + shuttleJob.jumps * 12, crew);
      if (this.goal) this.goal(session, 'shuttles');
      savedShuttle.state = 'idle';
    } else if (savedShuttle.outcome === 'lost') {
      this.toast(
        session,
        `${shuttleCraft.name} was lost on "${shuttleJob.title}".${crew ? ` ${crew.name} made it home in an escape pod.` : ''}`,
      );
      this.log(playerData, `${shuttleCraft.name} lost in ${systemsById[shuttleJob.sys].name}.`);
      savedShuttle.state = 'gone';
    } else {
      const damage = savedShuttle.outcome === 'damaged';
      this.toast(
        session,
        `${shuttleCraft.name} came back empty-handed from "${shuttleJob.title}"${damage ? ' and needs repairs' : ''}.`,
      );
      this.log(
        playerData,
        `${shuttleCraft.name} failed: ${shuttleJob.title}${damage ? ' (damaged)' : ''}.`,
      );
      if (crew) this.officerXp(session, 10, crew);
      savedShuttle.state = damage ? 'damaged' : 'idle';
    }
    savedShuttle.job = null;
    savedShuttle.outcome = null;
    savedShuttle.ends = null;
    if (savedShuttle.state !== 'gone') this.shuttleTraffic(playerData, savedShuttle, 'in');
  },
  // shuttles visibly launch from (and return to) the Personal Station when its system is live
  /**
   * Spawn ambient space entity representing shuttle departure or arrival at personal station.
   * @param playerData - Saved player data.
   * @param ship - Shuttle state.
   * @param direction - Traffic direction ('out' or 'in').
   */
  shuttleTraffic(
    this: HangarCapabilities,
    playerData: PlayerData,
    ship: { kind: string },
    direction: 'out' | 'in',
  ) {
    if (!playerData.station.site) return;
    const site = STELLARS[playerData.station.site],
      space = this.live[site.system];
    if (!space) return;
    const shuttleCraft = SHUTTLES[ship.kind],
      angle = Math.random() * Math.PI * 2;
    if (direction === 'out') {
      const entity = space.makeShip({
        hull: shuttleCraft.hull,
        faction: 'quantum',
        x: site.x + Math.sin(angle) * 40,
        y: site.y - Math.cos(angle) * 40,
        a: angle,
        vx: Math.sin(angle) * 60,
        vy: -Math.cos(angle) * 60,
        ai: 'leave',
        name: `${playerData.name}'s ${shuttleCraft.name}`,
      });
      entity.civil = true;
    } else {
      const entity = space.makeShip({
        hull: shuttleCraft.hull,
        faction: 'quantum',
        x: site.x + Math.sin(angle) * 2400,
        y: site.y - Math.cos(angle) * 2400,
        a: angle + Math.PI,
        ai: 'trade',
        name: `${playerData.name}'s ${shuttleCraft.name}`,
      });
      entity.dest = { ...site, r: site.r };
      entity.civil = true;
      space.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
    }
  },

  // ------------------------------------------------------------------ research queue (prerequisites are queued first)
  /**
   * Resolve prerequisite chain for a research project.
   * @param state - Player station state.
   * @param identifier - Research project ID.
   * @returns Ordered list of research IDs needed.
   */
  researchChain(this: HangarCapabilities, state: { done: string[] }, identifier: string) {
    const chain = [];
    let researchNode: ResearchNode | undefined | null = RESEARCH.find(
      (researchNode) => researchNode.id === identifier,
    );
    while (researchNode && !state.done.includes(researchNode.id)) {
      chain.unshift(researchNode.id);
      researchNode = researchNode.needs
        ? RESEARCH.find((researchNode2) => researchNode2.id === researchNode!.needs)
        : null;
    }
    return chain;
  },
  /**
   * Queue a research project along with any unfulfilled prerequisites.
   * @param session - Player session.
   * @param identifier - Research project ID.
   */
  queueResearch(this: HangarCapabilities, session: Session, identifier: string) {
    const playerData = session.data,
      stationState = playerData.station;
    const chain = this.researchChain(stationState, identifier).filter(
      (positionX) =>
        positionX !== (stationState.active && stationState.active.id) &&
        !stationState.queue!.includes(positionX),
    );
    if (!chain.length) return this.toast(session, 'Already researched or queued.');
    if (
      chain.some(
        (positionX) =>
          RESEARCH.find((researchNode) => researchNode.id === positionX)!.ops > stationState.ops,
      )
    )
      return this.toast(session, 'That needs a higher Station Tier.');
    if (stationState.queue!.length + chain.length > RESEARCH_QUEUE_MAX)
      return this.toast(session, `The lab queue holds ${RESEARCH_QUEUE_MAX} projects.`);
    stationState.queue!.push(...chain);
    this.toast(
      session,
      chain.length > 1
        ? `Queued ${chain.length} projects (prerequisites first).`
        : 'Research queued.',
    );
    this.startQueued(playerData);
  },
  // start the next queued project if the lab is free and the captain can pay for it (called on every station check)
  /**
   * Start the next research project in queue if station lab is idle and funds/materials allow.
   * @param playerData - Saved player data.
   */
  startQueued(this: HangarCapabilities, playerData: PlayerData) {
    const stationState = playerData.station;
    if (stationState.active || !stationState.queue!.length) return;
    const researchNode = RESEARCH.find(
      (researchNode) => researchNode.id === stationState.queue![0],
    );
    if (!researchNode) {
      stationState.queue!.shift();
      return;
    }
    if (stationState.done.includes(researchNode.id)) {
      stationState.queue!.shift();
      return this.startQueued(playerData);
    }
    if (
      stationState.ops < researchNode.ops ||
      (researchNode.needs && !stationState.done.includes(researchNode.needs))
    )
      return;
    if (playerData.credits < researchNode.cost || !this.hasMats(playerData, researchNode.mats)) {
      stationState.waiting = true;
      return;
    }
    stationState.waiting = false;
    stationState.queue!.shift();
    playerData.credits -= researchNode.cost;
    this.takeMats(playerData, researchNode.mats);
    stationState.active = {
      id: researchNode.id,
      ends: Date.now() + researchNode.minutes * 60000,
      from:
        stationState.activeDoneT && stationState.activeDoneT > Date.now() - 1000
          ? stationState.activeDoneT
          : Date.now(),
    };
  },

  // ------------------------------------------------------------------ refining: three crates make one of the next grade
  /**
   * Refine multiple material crates of grade g into grade g+1.
   * @param session - Player session.
   * @param material - Material identifier ('alloy', 'crystal', 'isotope').
   * @param game - Current grade level (0 to 3).
   * @param count - Number of refining operations to execute.
   */
  refineUp(
    this: HangarCapabilities,
    session: Session,
    material: string,
    game: number,
    count: number,
  ) {
    const playerData = session.data;
    if (!MATERIALS.includes(material) || !(game >= 0 && game < 4)) return;
    count = Math.max(
      1,
      Math.min(
        count | 0 || 1,
        Math.floor(playerData.mats[material][game] / REFINE_UP.need),
        Math.floor(playerData.credits / REFINE_UP.cost[game]),
      ),
    );
    if (
      playerData.mats[material][game] < REFINE_UP.need ||
      playerData.credits < REFINE_UP.cost[game]
    )
      return this.toast(
        session,
        `You need ${REFINE_UP.need} ${material} ${GRADES[game]} crates and ${credits(REFINE_UP.cost[game])} credits per refine.`,
      );
    playerData.mats[material][game] -= count * REFINE_UP.need;
    playerData.mats[material][game + 1] += count;
    playerData.credits -= count * REFINE_UP.cost[game];
    this.toast(
      session,
      `Refined ${count * REFINE_UP.need} ${material} ${GRADES[game]} into ${count} ${material} ${GRADES[game + 1]}.`,
    );
  },

  // ------------------------------------------------------------------ drydock: stored ships keep their escorts and bridge crew (fleet presets)
  /**
   * Calculate scrap/resale value of a stored ship (half hull cost + half outfit costs).
   * @param storedShip - Stored ship structure.
   * @returns Credit value.
   */
  storedValue(this: HangarCapabilities, storedShip: StoredShip) {
    return loadoutValue(this.A, storedShip.ship);
  },
  /**
   * Handle drydock operations including storing and selling stored ships.
   * @param session - Player session.
   * @param message - Drydock operation payload.
   */
  dockOp(
    this: HangarCapabilities,
    session: Session,
    message: { op: string; i?: number; uid?: string },
  ) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    if (!stellarBody || session.ent || !this.ownSite(playerData, stellarBody))
      return this.toast(session, 'The drydock is at your Personal Station.');
    switch (message.op) {
      case 'store': {
        // 2.1: kept for older clients: FLY THIS = make it the active dock's lead; no index = store the ship you fly
        const storedShip =
          message.i === undefined || message.i === null || message.i < 0
            ? null
            : playerData.dock[message.i! | 0];
        if (message.i! >= 0 && !storedShip) return;
        if (!storedShip && playerData.shipless)
          return this.toast(session, 'You have no active ship to store.');
        return this.docksOp(session, {
          op: 'assign',
          k: playerData.activeDock,
          slot: 'lead',
          uid: storedShip ? storedShip.ship.uid! : null,
        });
      }
      case 'sell': {
        const storedShip = message.uid
          ? playerData.dock.find((storedShip3) => storedShip3.ship.uid === message.uid)
          : playerData.dock[message.i! | 0];
        if (!storedShip) return;
        const storedValue2 = this.storedValue(storedShip);
        playerData.credits += storedValue2;
        playerData.dock = playerData.dock.filter((storedShip3) => storedShip3 !== storedShip);
        this.unassign(playerData, storedShip.ship.uid!);
        this.toast(
          session,
          `Sold the ${this.A.ships[storedShip.ship.hull].name} for ${credits(storedValue2)} credits.`,
        );
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },

  // ------------------------------------------------------------------ boarding
  /**
   * Handle boarding interactions with disabled ships or downed Armada captains (plunder, capture, rescue).
   * @param session - Player session.
   * @param message - Boarding action payload.
   */
  board(
    this: HangarCapabilities,
    session: Session,
    message: { id: number; act: 'plunder' | 'capture' | 'rescue' },
  ) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly') return;
    const space = this.spaces[playerData.sys],
      entity2 = space.ships.get(message.id);
    if (entity2 && entity2.player && entity2.rescueT && this.rescueBoard)
      return this.rescueBoard(session, entity2); // patch up a downed Armada captain
    if (!entity2 || !entity2.disabled || entity2.player || entity2.boarded)
      return this.toast(session, 'Only disabled ships can be boarded.');
    const distance = Math.hypot(entity2.x - entity.x, entity2.y - entity.y),
      relative = Math.hypot(entity2.vx - entity.vx, entity2.vy - entity.vy);
    if (distance > Math.max(120, (entity2.st.size + entity.st.size) * 0.5))
      return this.toast(session, 'Move alongside to board.');
    if (relative > 90) return this.toast(session, 'Match speed to board.');
    if ((entity2.faction === 'nhal' || entity2.faction === 'index') && message.act !== 'rescue')
      return this.toast(session, 'These hulls cannot be captured or plundered.');
    const shipHullAsset = this.A.ships[entity2.hull],
      factionDef = FACTIONS[entity2.faction],
      lawful = factionDef && !factionDef.pirate && entity2.faction !== 'umbral',
      captainBonus2 = captainBonus(playerData);
    const repHit = (count: number) => {
      if (lawful && !entity2.mission && (playerData.rep[entity2.faction] || 0) > -100) {
        playerData.rep[entity2.faction] = clampStanding(
          (playerData.rep[entity2.faction] || 0) - count,
        );
        return ` ${factionDef.short} standing -${count}.`;
      }
      return '';
    };
    const done = () => {
      if (this.specOnBoard) this.specOnBoard(session);
      entity2.boarded = true;
      space.remove(entity2, 'jump');
      this.tut(session, 'board');
      if (this.goal) this.goal(session, 'boarded');
      this.db.touch();
      this.you(session);
    };
    switch (message.act) {
      case 'plunder': {
        assertLots(playerData.cargo, playerData.cargoLots);
        const credits2 = Math.round(
          (entity2.strength || 10) *
            (20 + Math.random() * 40) *
            (1 + (captainBonus2.lootPct || 0) / 100) *
            (this.flying && this.flying(playerData, 'corsair') ? 2 * this.power(playerData) : 1),
        );
        playerData.credits += credits2;
        playerData.stats.earned += credits2;
        const received = [`${credits(credits2)} credits`];
        const computedShipStats = this.stats(playerData),
          used = this.holdUsed(playerData),
          room = computedShipStats!.cargo - used;
        if (room > 0) {
          const commodityDef = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)],
            quantity = Math.min(room, 2 + Math.floor(Math.random() * 9));
          addLots(
            playerData.cargo,
            playerData.cargoLots,
            commonLots(commodityDef.id, quantity),
            Math.max(0, room),
          );
          received.push(`${quantity} t ${commodityDef.name}`);
        }
        if (Math.random() < 0.3) {
          const materials = MATERIALS[Math.floor(Math.random() * 3)],
            clamp2 = clamp(Math.floor((entity2.strength || 10) / 400), 0, 3);
          playerData.mats[materials][clamp2]++;
          received.push(`${materials} ${GRADES[clamp2]}`);
        }
        this.toast(
          session,
          `Plundered the ${shipHullAsset.name}: ${received.join(', ')}.${repHit(8)}`,
        );
        this.log(
          playerData,
          `Boarded and plundered a ${shipHullAsset.name} in ${systemsById[playerData.sys].name}.`,
        );
        this.officerXp(session, 15);
        if (this.synGain) this.synGain(session, 'plunder');
        return done();
      }
      case 'capture': {
        const length2 = BRIDGE_SLOTS.filter((entryKey) => playerData.bridge[entryKey]).length;
        if (!length2)
          return this.toast(
            session,
            'You need at least one officer on the bridge to lead a prize crew.',
          );
        const owner = this.A.ships[playerData.ship.hull].strength || 10;
        const chance = clamp(
          0.3 +
            length2 * 0.15 -
            (entity2.strength || 10) / Math.max(40, owner * 3) +
            (this.flying && this.flying(playerData, 'corsair') ? 0.25 * this.power(playerData) : 0),
          0.08,
          0.95,
        );
        if (Math.random() > chance) {
          space.events.push([
            'boom',
            Math.round(entity2.x),
            Math.round(entity2.y),
            entity2.st.size,
          ]);
          entity.armor = Math.max(1, entity.armor - entity.st.armor * 0.1);
          this.toast(
            session,
            `The ${shipHullAsset.name}'s crew scuttled her before your prize crew could take the bridge.${repHit(10)}`,
          );
          this.log(playerData, `A capture attempt on a ${shipHullAsset.name} failed: scuttled.`);
          return done();
        }
        const loadout = makeLoadout(
          this.A,
          entity2.hull,
          `Prize ${shipHullAsset.name.split(' ')[0]}`,
        );
        if (playerData.dock.length < this.dockSlots(playerData)) {
          loadout.uid = this.shipUid(playerData);
          playerData.dock.push({ ship: loadout, bridge: {} });
          this.toast(
            session,
            `Captured the ${shipHullAsset.name}! A prize crew takes her to your drydock.${repHit(15)}`,
          );
        } else {
          const value = Math.round((shipHullAsset.cost || 0) * CAPTURE_SELL);
          playerData.credits += value;
          this.toast(
            session,
            `Captured the ${shipHullAsset.name}. With no free berth she was sold at the nearest yard for ${credits(value)} credits.${repHit(15)}`,
          );
        }
        this.log(
          playerData,
          `Captured a ${shipHullAsset.name} in ${systemsById[playerData.sys].name}.`,
        );
        this.officerXp(session, 40);
        if (this.synGain) this.synGain(session, 'capture');
        return done();
      }
      case 'rescue': {
        if (entity2.hull === 903 && entity2.rescueOf) {
          const mission = playerData.missions.find(
            (job) => job.id === entity2.rescueOf!.id && job.quest?.qid === 's:nhal-ossuary',
          );
          if (mission) {
            mission.done = true;
            this.toast(
              session,
              'Pod records secured. These are unchosen lives, not prisoners or passengers.',
            );
            return done();
          }
        }
        if (entity2.storyBoard && this.storyProgress) this.storyProgress(session, entity2);
        if (entity2.arcOf && this.arcProgress) this.arcProgress(session, entity2);
        if (entity2.rescueOf) {
          const mission = playerData.missions.find(
            (mission3) => mission3.id === entity2.rescueOf!.id,
          );
          if (mission) {
            mission.done = true;
            this.toast(
              session,
              `The ${entity2.name}'s crew are safe aboard. Land anywhere to be paid.`,
            );
          }
        }
        if (lawful) {
          playerData.rep[entity2.faction] = clampStanding(
            (playerData.rep[entity2.faction] || 0) + 6,
          );
          const credits3 = 500 + Math.round((entity2.strength || 10) * 5);
          playerData.credits += credits3;
          this.toast(
            session,
            `Rescued the ${shipHullAsset.name}'s crew. ${factionDef.short} standing +6, and a ${credits(credits3)} credit reward.`,
          );
        } else {
          const credits4 = Math.round(
            ((entity2.strength || 10) * 25 + 500) * 0.8 * (1 + (captainBonus2.lootPct || 0) / 100),
          );
          playerData.credits += credits4;
          playerData.stats.earned += credits4;
          playerData.rep.quantum = clampStanding(playerData.rep.quantum + 2);
          this.toast(
            session,
            `Arrested the ${shipHullAsset.name}'s crew for the Concord. Reward: ${credits(credits4)} credits.`,
          );
          for (const mission3 of playerData.missions)
            if (
              mission3.type === 'bounty' &&
              entity2.mission &&
              entity2.mission.id === mission3.id
            ) {
              mission3.done = true;
              this.toast(session, 'Bounty complete: land anywhere to collect.');
            }
        }
        this.log(playerData, `Rescued the crew of a ${shipHullAsset.name}.`);
        this.officerXp(session, 20);
        return done();
      }
    }
  },
};
