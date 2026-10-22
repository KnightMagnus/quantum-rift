import type { QuestChain, QuestReward } from '../shared/quests.ts';
import type { StellarBody } from '../shared/galaxy.ts';
import type { SavedQuests } from './save-contracts.ts';
export interface QuestOperations {
  questInit(this: QuestsCapabilities, playerData: PlayerData): SavedQuests;
  contactAt(
    this: QuestsCapabilities,
    position: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
      outlaw?: boolean;
    } | null,
  ): Record<string, string> | null;
  questsPayload(this: QuestsCapabilities, playerData: PlayerData): QuestChain;
  questOffers(
    this: QuestsCapabilities,
    position: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
    } | null,
    playerData: PlayerData,
  ): Array<Mission>;
  contactStory(
    this: QuestsCapabilities,
    position: { system: string; id: string },
    playerData: PlayerData,
    component: Record<string, string>,
  ): { X: QuestChain; plan: Record<string, string> } | null;
  chainReward(
    this: QuestsCapabilities,
    positionX: { steps: Array<QuestStep> },
    level: number,
  ): QuestReward;
  questRewardText(this: QuestsCapabilities, questReward: QuestReward): string;
  questPlan(
    this: QuestsCapabilities,
    position: { id: string; system: string },
    playerData: PlayerData,
    questChain: QuestChain,
    component: Record<string, string>,
    radius: () => number,
  ): Record<string, string> | null;
  fill(this: QuestsCapabilities, time: string, position: Record<string, string>): string;
  questStart(
    this: QuestsCapabilities,
    session: Session,
    options: { side?: string; story?: string },
  ): void;
  questStepJob(
    this: QuestsCapabilities,
    playerData: PlayerData,
    quest: QuestRecord,
    index: number,
  ): Mission;
  questPush(this: QuestsCapabilities, session: Session, quest: QuestRecord, first?: boolean): void;
  questAdvance(this: QuestsCapabilities, session: Session, mission: Mission): void;
  questFinish(this: QuestsCapabilities, session: Session, quest: QuestRecord): void;
  questFail(this: QuestsCapabilities, session: Session, questId: string, reason: string): void;
  questSweep(this: QuestsCapabilities, session: Session): void;
  barTalk(
    this: QuestsCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
  ): Record<string, string> | null;
  questSalvageIdle(this: QuestsCapabilities, session: Session): void;
  questLoot(this: QuestsCapabilities, session: Session, item: { salvage?: string }): boolean;
}
import type { QuestsCapabilities } from './features.ts';
import type { QuestRecord, QuestStep } from '../shared/quests.ts';
import type { Mission, PlayerData, Session } from './game.ts';

import { mulberry32 as randomGenerator, fnv1a } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { grantRadio } from './radio-discovery.ts';
import { RADIO_STATIONS, SCIENTIST_STORY } from '../shared/radio-stations.ts';
import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: questlines. Contacts at spaceport bars offer multi-step jobs that tell a small story, and seven
// handcrafted side stories wait at particular worlds. Each step is an ordinary job tagged with `m.quest`; finishing it
// tells the next part of the story and posts the next step. Owned by game.features.quests.
import {
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  TRAFFIC,
} from '../shared/galaxy.ts';
import { CHAINS, SIDE_STORIES, CONTACT_TITLES } from '../shared/quests.ts';
import { OFFICER_NAMES, RACE_ROLES, ROLES } from '../shared/hangar.ts';
import { SPECIALISTS } from '../shared/specialty.ts';
import { credits } from '../shared/rules.ts';
import { occupiedPassengerSeats } from '../shared/passengers.ts';

/** @import { QuestRecord, QuestStep } from '../shared/quests.ts' */
/** @import { Mission, PlayerData, Session } from './game.ts' */

/**
 * 32-bit FNV-1a string hash function.
 * @param {string | number} text - Input key to hash.
 * @returns {number} 32-bit unsigned integer hash.
 */
const hash = (text: string | number): number => fnv1a(String(text));

/**
 * Pick a random item from an array.
 * @template T
 * @param {() => number} radius - Random generator function returning [0, 1).
 * @param {T[]} firstValue - Array of items.
 * @returns {T} Selected element.
 */
const pick = <ValueType>(radius: () => number, firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(radius() * firstValue.length)];

/** @type {number} Maximum number of active quests permitted simultaneously. */
export const QUEST_MAX: number = 3; // quests in progress at once

/** @type {number} Cooldown in minutes before a bar contact offers a new story chain. */
export const CONTACT_COOL_MIN: number = 15; // a contact needs this long before offering the next story

/** @type {string[]} Standing tier labels by relationship level. */
export const STANDING: string[] = ['Stranger', 'Acquaintance', 'Trusted', 'Friend', 'Old Friend'];

/** @type {string[]} Pool of civilian and quest ship names. */
const SHIP_NAMES: string[] = [
  'Marigold',
  'Fair Exchange',
  'Iron Psalm',
  'Tessaly',
  'Quiet Harbour',
  'Penny Royal',
  'Lark Ascending',
  'Ninefold',
  'Brass Hope',
  'Westering',
  'Small Mercy',
  'Old Reliable',
];

/** @type {string[]} Pool of outlaw and antagonist villain names. */
const VILLAINS: string[] = [
  '"Grin" Haskell',
  'Vessa the Hook',
  'Captain Ashmore',
  'the Tallow Knight',
  'Corvin Blackwake',
  'Mother Ninegraves',
  'Sallow Jack',
  'the Widow Fenn',
];

/**
 * Retrieve landable spaceports in a star system.
 * @param {string} starSystem - System ID.
 * @returns {Array<{id: string, name: string, system: string}>} List of stellar port objects.
 */
const portsOf = (starSystem: string): Array<(typeof systemsById)[string]['stellars'][number]> =>
  systemsById[starSystem].stellars.filter(
    (rawStellarBody) => rawStellarBody.svc!.includes('L') && !rawStellarBody.site,
  );

/** @type {Record<string, Record<string, number>>} Jump distance cache by system ID. */
const JCACHE: Record<string, Record<string, number>> = {};

const galaxyGraph = new GalaxyGraph(systemsById);

/** @param {string} from @returns {Record<string, number>} */
const jumpsFrom = (from: string): Record<string, number> =>
  JCACHE[from] || (JCACHE[from] = galaxyGraph.distances(from));

/**
 * Map faction identifier to playable/officer race key.
 * @param {string} faction - Faction identifier.
 * @returns {string} Corresponding race key.
 */
const raceOf = (faction: string): string => (RACE_ROLES[faction] ? faction : 'quantum');

// the most hold space and bunks any step of a story will ask for, so the job board can warn before you take it on
/**
 * Compute the maximum cargo hold and passenger bunks required across all steps of a quest chain.
 * @param {Array<QuestStep>} steps - Quest chain steps.
 * @returns {{hold: number, pax: number}} Peak required hold and passenger capacity.
 */
export const needsOf = (steps: Array<QuestStep>): { hold: number; pax: number } => ({
  hold: Math.max(
    0,
    ...steps.map((questStep) =>
      questStep.type === 'cargo'
        ? questStep.qty || 4
        : questStep.type === 'smuggle'
          ? questStep.qty || 3
          : questStep.type === 'supply'
            ? questStep.qty || 0
            : 0,
    ),
  ),
  pax: Math.max(
    0,
    ...steps.map((questStep) => (questStep.type === 'passenger' ? questStep.pax || 1 : 0)),
  ),
});

export const QuestOperations = {
  /**
   * Initialize quest tracking structures on player data.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, QuestRecord>} Initialized quests dictionary.
   */
  questInit(this: QuestsCapabilities, playerData: PlayerData) {
    const savedQuests = (playerData.quests = playerData.quests || {});
    savedQuests.active = savedQuests.active || {};
    savedQuests.done = savedQuests.done || [];
    savedQuests.contacts = savedQuests.contacts || {};
    savedQuests.sides = savedQuests.sides || {};
    return savedQuests;
  },
  // every bar has a contact; who they are depends only on the world
  /**
   * Determine the unique bar contact stationed at a stellar body.
   * @param {{id: string, site?: boolean | Record<string, string>, svc: string, system: string, outlaw?: boolean} | null} position - Stellar body.
   * @returns {Record<string, string> | null} Contact descriptor or null if no bar available.
   */
  contactAt(
    this: QuestsCapabilities,
    position: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
      outlaw?: boolean;
    } | null,
  ) {
    if (!position || position.site || !position.svc.includes('B')) return null;
    const radius = randomGenerator(hash('contact:' + position.id)),
      starSystem = systemsById[position.system],
      factionDef = FACTIONS[starSystem.faction] || {};
    const kind =
      position.outlaw || factionDef.pirate
        ? 'shady'
        : starSystem.danger >= 3 || starSystem.farside || factionDef.region
          ? 'wild'
          : 'lawful';
    const race = raceOf(
        radius() < 0.75 ? starSystem.faction : pick(radius, Object.keys(RACE_ROLES)),
      ),
      count = OFFICER_NAMES[race];
    return {
      id: 'c:' + position.id,
      at: position.id,
      kind,
      race,
      name: pick(radius, count[0]) + ' ' + pick(radius, count[1]),
      title: pick(radius, CONTACT_TITLES[kind]),
    };
  },
  /**
   * Build network telemetry payload describing active quests, completed quests, and contact standings.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {QuestChain} Quests telemetry payload.
   */
  questsPayload(this: QuestsCapabilities, playerData: PlayerData) {
    const savedQuests = this.questInit(playerData);
    return {
      active: Object.values(savedQuests.active).map((questRecord) => ({
        qid: questRecord.qid,
        name: questRecord.name,
        giver: questRecord.giver,
        at: questRecord.at,
        step: questRecord.step,
        of: questRecord.steps.length,
        side: !!questRecord.side,
        ...(questRecord.awaitingSeats ? { awaitingSeats: { ...questRecord.awaitingSeats } } : {}),
      })),
      done: savedQuests.done.slice(-30),
      contacts: Object.fromEntries(
        Object.entries(savedQuests.contacts).map(([entryKey, component]) => [
          entryKey,
          { n: component.n || 0 },
        ]),
      ),
    };
  },
  // ---- what a bar offers you: a side story that starts here, or this contact's next story
  /**
   * Generate available quest offerings at a stellar bar (side stories and procedural contact chains).
   * @param {{id: string, site?: boolean | Record<string, string>, svc: string, system: string} | null} position - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<Mission>} List of quest offers.
   */
  questOffers(
    this: QuestsCapabilities,
    position: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
    } | null,
    playerData: PlayerData,
  ) {
    const savedQuests = this.questInit(playerData),
      missions: Mission[] = [];
    if (!position || !position.svc.includes('B') || position.site) return missions;
    const full = Object.keys(savedQuests.active).length >= QUEST_MAX;
    for (const sideStory of SIDE_STORIES)
      if (
        sideStory.at === position.id &&
        !savedQuests.sides[sideStory.id] &&
        !savedQuests.active['s:' + sideStory.id]
      )
        missions.push({
          id: 'q:s:' + sideStory.id,
          type: 'quest',
          side: sideStory.id,
          title: `★ ${sideStory.name}`,
          giver: sideStory.giver,
          sys: STELLARS[sideStory.steps[0].sys!]
            ? STELLARS[sideStory.steps[0].sys!].system
            : sideStory.steps[0].sys!,
          steps: sideStory.steps.length,
          reward: sideStory.reward.credits,
          full,
          text: sideStory.intro,
          rewardText: this.questRewardText(sideStory.reward),
          needs: needsOf(sideStory.steps),
        });
    const contactAt2 = this.contactAt(position);
    if (!contactAt2) return missions;
    const cargoSpace = savedQuests.contacts[contactAt2!.id] || {},
      busy = Object.values(savedQuests.active).some(
        (questRecord) => questRecord.contact === contactAt2.id,
      );
    if (busy || (cargoSpace.cool || 0) > Date.now()) return missions;
    const contactStory2 = this.contactStory(position, playerData, contactAt2);
    if (!contactStory2) return missions;
    const { X: questChain, plan } = contactStory2;
    const level = Math.min(STANDING.length - 1, cargoSpace.n || 0),
      reward = this.chainReward(questChain, level);
    missions.push({
      id: 'q:c:' + contactAt2.id + ':' + questChain.id + ':' + (cargoSpace.n || 0),
      type: 'quest',
      story: questChain.id,
      title: `✦ ${questChain.name}`,
      giver: `${contactAt2.name}, ${contactAt2.title}`,
      standing: STANDING[level],
      sys: plan.A,
      steps: questChain.steps.length,
      reward: reward.credits,
      full,
      text: this.fill(questChain.intro, plan),
      rewardText: this.questRewardText(reward),
      needs: needsOf(questChain.steps),
    });
    return missions;
  },
  // which story this contact has for you next, and where it happens (the same every time you ask, until you finish one)
  /**
   * Determine next story chain and plan locations offered by a specific contact.
   * @param {{system: string, id: string}} position - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {Record<string, string>} component - Bar contact descriptor.
   * @returns {{X: QuestChain, plan: Record<string, string>} | null} Selected chain and route plan, or null.
   */
  contactStory(
    this: QuestsCapabilities,
    position: { system: string; id: string },
    playerData: PlayerData,
    component: Record<string, string>,
  ) {
    const cargoSpace = this.questInit(playerData).contacts[component.id] || {},
      pool = CHAINS.filter(
        (questChain) => questChain.kind === 'any' || questChain.kind === component.kind,
      );
    const radius = randomGenerator(hash(playerData.name + component.id + (cargoSpace.n || 0))),
      fresh = pool.filter((questChain) => !(cargoSpace.last || []).includes(questChain.id));
    const questChain = (fresh.length ? fresh : pool)[
        Math.floor(radius() * (fresh.length || pool.length))
      ],
      plan = this.questPlan(position, playerData, questChain, component, radius);
    return plan ? { X: questChain, plan } : null;
  },
  /**
   * Calculate credit and item rewards for completing a quest chain at a given standing level.
   * @param {{steps: Array<QuestStep>}} positionX - Story chain template.
   * @param {number} level - Contact standing level (0-4).
   * @returns {QuestReward} Reward descriptor.
   */
  chainReward(
    this: QuestsCapabilities,
    positionX: { steps: Array<QuestStep> },
    level: number,
  ): QuestReward {
    const length2 = positionX.steps.length;
    return {
      credits: Math.round((14000 + length2 * 7000) * (1 + 0.2 * level)),
      crate: [null, Math.min(4, 1 + Math.floor(level / 2) + (length2 >= 4 ? 1 : 0))],
      officer: level >= 2 && level % 2 === 0 ? 'any' : null,
      bp: level >= 3 ? 3 + level : 0,
    };
  },
  /**
   * Format a textual summary of quest rewards for UI presentation.
   * @param {QuestReward} questReward - Reward descriptor.
   * @returns {string} Comma-separated reward description text.
   */
  questRewardText(this: QuestsCapabilities, questReward: QuestReward) {
    const firstValue = questReward.credits ? [`${credits(questReward.credits)} credits`] : [];
    if (questReward.radio)
      firstValue.push(
        `radio station: ${RADIO_STATIONS.find((state) => state.id === questReward.radio)?.name || questReward.radio}`,
      );
    if (questReward.crate)
      firstValue.push(
        `a ${questReward.crate[0] || 'material'} ${GRADES[questReward.crate[1]]} crate`,
      );
    if (questReward.officer) firstValue.push('a new officer');
    if (questReward.bp) firstValue.push(`${questReward.bp} specialist blueprints`);
    return firstValue.join(', ');
  },
  // the places a generated story happens: A is close (1-2 jumps), B a little further and different from A
  /**
   * Select candidate stellar worlds, ships, and targets for a procedural quest chain.
   * @param {{id: string, system: string}} position - Starting stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {QuestChain} questChain - Quest chain template.
   * @param {Record<string, string>} component - Contact descriptor.
   * @param {() => number} radius - Random generator function.
   * @returns {Record<string, string> | null} Spatial and narrative plan variables, or null.
   */
  questPlan(
    this: QuestsCapabilities,
    position: { id: string; system: string },
    playerData: PlayerData,
    questChain: QuestChain,
    component: Record<string, string>,
    radius: () => number,
  ) {
    const allEntries = Object.entries(jumpsFrom(position.system)).filter(
      ([state, count]) =>
        count >= 1 &&
        count <= 4 &&
        portsOf(state).length &&
        systemsById[state].faction !== 'umbral' &&
        !systemsById[state].arena,
    );
    const capacity = Math.max(2, (systemsById[position.system].danger || 0) + 1),
      calm = allEntries.filter(([state]) => (systemsById[state].danger || 0) <= capacity); // stories stay about as dangerous as where they start
    const near = calm.filter(([, count]) => count <= 2).length ? calm : allEntries;
    const firstValue = near.filter(([, count]) => count <= 2),
      secondValue = near.filter(([_state, count]) => count >= 2);
    if (!firstValue.length) return null;
    const pick2 = pick(radius, firstValue)[0],
      blueprint = secondValue.filter(([state]) => state !== pick2),
      secondValue2 = blueprint.length
        ? pick(radius, blueprint)[0]
        : (near.find(([state]) => state !== pick2) || [pick2])[0];
    const rawStellarBody = pick(radius, portsOf(pick2)),
      rawStellarBody2 = pick(radius, portsOf(secondValue2));
    return {
      W: position.id,
      Wsys: position.system,
      A: pick2,
      B: secondValue2,
      X: rawStellarBody.id,
      Y: rawStellarBody2.id,
      ship: pick(radius, SHIP_NAMES),
      target: pick(radius, VILLAINS),
      contact: component ? component.name : '',
    };
  },
  /**
   * Substitute template placeholders with concrete planetary and narrative variables.
   * @param {string} time - Template text with {placeholders}.
   * @param {Record<string, string>} position - Quest plan parameters.
   * @returns {string} Interpolated narrative text.
   */
  fill(this: QuestsCapabilities, time: string, position: Record<string, string>) {
    const name2 = (identifier: string) =>
      STELLARS[identifier] ? STELLARS[identifier].name : identifier;
    return String(time).replace(/\{(\w+)\}/g, (message, entryKey) =>
      entryKey === 'W' || entryKey === 'X' || entryKey === 'Y'
        ? name2(position[entryKey])
        : entryKey === 'Wsys' || entryKey === 'A' || entryKey === 'B'
          ? systemsById[position[entryKey]]
            ? systemsById[position[entryKey]].name
            : ''
          : position[entryKey] != null
            ? position[entryKey]
            : message,
    );
  },
  // ---- accepting
  /**
   * Accept and start an active side story or procedural contact quest.
   * @param {Session} session - Player session.
   * @param {{side?: string, story?: string}} options - Quest offer descriptor.
   * @returns {void}
   */
  questStart(
    this: QuestsCapabilities,
    session: Session,
    options: { side?: string; story?: string },
  ) {
    const playerData = session.data,
      savedQuests = this.questInit(playerData),
      stellarBody = STELLARS[playerData.stellar!];
    if (Object.keys(savedQuests.active).length >= QUEST_MAX)
      return this.toast(
        session,
        `You can follow at most ${QUEST_MAX} stories at once. Finish or abandon one first.`,
      );
    if (playerData.missions.length >= 6) return this.toast(session, 'You already have six jobs.');
    let questRecord: QuestRecord;
    if (options.side) {
      const sideStory = SIDE_STORIES.find((sideStory) => sideStory.id === options.side);
      if (
        !sideStory ||
        sideStory.at !== stellarBody?.id ||
        savedQuests.sides[sideStory.id] ||
        savedQuests.active['s:' + sideStory.id]
      )
        return;
      if (
        sideStory.id === SCIENTIST_STORY &&
        this.stats(playerData)!.cargo - this.holdUsed(playerData) < needsOf(sideStory.steps).hold
      )
        return this.toast(session, 'Free two tonnes of hold space for the repair kit first.');
      questRecord = {
        qid: 's:' + sideStory.id,
        side: sideStory.id,
        name: sideStory.name,
        giver: sideStory.giver,
        at: sideStory.at,
        plan: { W: sideStory.at, Wsys: STELLARS[sideStory.at].system, contact: sideStory.giver },
        steps: sideStory.steps.map((sideStoryStep) => ({ ...sideStoryStep })),
        step: 0,
        started: Date.now(),
        tries: 0,
      };
    } else {
      const contactAt2 = this.contactAt(stellarBody),
        current = contactAt2 && this.contactStory(stellarBody, playerData, contactAt2);
      if (!current || current.X.id !== options.story) return;
      const cargoSpace = savedQuests.contacts[contactAt2!.id] || {},
        questChain = current.X,
        plan = current.plan;
      questRecord = {
        qid: 'c:' + contactAt2.id.slice(2) + ':' + questChain.id,
        chain: questChain.id,
        contact: contactAt2.id,
        name: questChain.name,
        giver: `${contactAt2.name}, ${contactAt2.title}`,
        at: stellarBody.id,
        plan,
        steps: questChain.steps.map((questChainStep) => ({ ...questChainStep })),
        step: 0,
        started: Date.now(),
        tries: 0,
        lvl: Math.min(STANDING.length - 1, cargoSpace.n || 0),
      };
    }
    savedQuests.active[questRecord.qid] = questRecord;
    this.log(playerData, `Story begun: ${questRecord.name} (${questRecord.giver}).`);
    this.questPush(session, questRecord, true);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // turn a step into a concrete job
  /**
   * Instantiate a concrete mission job object for a given quest step.
   * @param {PlayerData} playerData - Saved player data.
   * @param {QuestRecord} quest - Active quest state.
   * @param {number} index - Step index.
   * @returns {Mission} Concrete mission specification.
   */
  questStepJob(
    this: QuestsCapabilities,
    playerData: PlayerData,
    quest: QuestRecord,
    index: number,
  ): Mission {
    const questStep = quest.steps[index],
      questPlan = quest.plan,
      radius = randomGenerator(hash(quest.qid + index + quest.started));
    const starSystem =
      questStep.sys ||
      (questStep.where === 'W'
        ? questPlan.Wsys
        : questStep.where === 'B'
          ? questPlan.B
          : questPlan.A);
    const port = questStep.sys
      ? portsOf(questStep.sys)[0].id
      : questStep.where === 'W'
        ? questPlan.W
        : questStep.where === 'B'
          ? questPlan.Y
          : questPlan.X;
    const starSystem2 = systemsById[starSystem],
      jumps = 2,
      dangerMultiplier = starSystem2.danger || 1;
    const factionId = (time: string) =>
      this.fill(time, { ...questPlan, target: questStep.target || questPlan.target });
    const mission = {
      id: `${quest.qid}#${index}`,
      quest: { qid: quest.qid, step: index, of: quest.steps.length, name: quest.name },
      type: questStep.type,
      sys: starSystem,
      title: factionId(questStep.title),
      text: factionId(questStep.brief),
      taken: Date.now(),
      owner: null,
    } as Mission;
    switch (questStep.type) {
      case 'cargo':
        Object.assign(mission, {
          dest: questStep.dest || port,
          cid: questStep.cid || 'equipment',
          qty: questStep.qty || 4,
          reward: Math.round(1500 + jumps * 1200 + (questStep.qty || 4) * 90),
        });
        if (questStep.rush) {
          mission.rush = questStep.rush;
          mission.deadline = Date.now() + questStep.rush * 60000;
        }
        break;
      case 'smuggle':
        Object.assign(mission, {
          dest: questStep.dest || port,
          qty: questStep.qty || 3,
          reward: Math.round(8000 + (questStep.qty || 3) * 600),
        });
        break;
      case 'passenger':
        Object.assign(mission, {
          dest: questStep.dest || port,
          pax: questStep.pax || 1,
          reward: Math.round(2500 + (questStep.pax || 1) * 1200),
        });
        break;
      case 'supply':
        Object.assign(mission, {
          dest: questStep.dest || port,
          cid: questStep.cid,
          qty: questStep.qty,
          reward: Math.round(
            (COMMODITIES.find((commodityDef) => commodityDef.id === questStep.cid) || { base: 100 })
              .base *
              questStep.qty! *
              1.5 +
              3000,
          ),
        });
        break;
      case 'survey': {
        const points2 = starSystem2.stellars
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
        Object.assign(mission, {
          points: points2,
          reward: Math.round(4000 + dangerMultiplier * 1200),
        });
        break;
      }
      case 'salvage': {
        const firstValue = radius() * 6.28,
          distanceSquared = 1200 + radius() * 900;
        Object.assign(mission, {
          point: [
            Math.round(Math.cos(firstValue) * distanceSquared),
            Math.round(Math.sin(firstValue) * distanceSquared),
          ],
          reward: Math.round(4500 + dangerMultiplier * 1200),
        });
        break;
      }
      case 'rescue':
        Object.assign(mission, {
          hull: pick(radius, [704, 705, 707]),
          faction: 'spacer',
          wreckName: questPlan.ship || pick(radius, SHIP_NAMES),
          reward: Math.round(5000 + dangerMultiplier * 1500),
        });
        break;
      case 'bounty': {
        const faction2 = questStep.hostile || 'hollow',
          pool = TRAFFIC[faction2].war
            .filter((height) => this.A.ships[height])
            .sort(
              (firstValue, secondValue) =>
                (this.A.ships[firstValue].strength || 0) -
                (this.A.ships[secondValue].strength || 0),
            );
        const hull =
            pool[
              Math.min(
                pool.length - 1,
                Math.floor(pool.length * (0.25 + 0.15 * Math.min(4, dangerMultiplier))),
              )
            ],
          name = questStep.target || questPlan.target;
        Object.assign(mission, {
          hull,
          faction: faction2,
          targetName: name,
          reward: Math.round(5000 + (this.A.ships[hull].strength || 20) * 60),
        });
        break;
      }
      case 'assassinate': {
        const faction3 = questStep.hostile || 'hollow';
        Object.assign(mission, {
          hull: faction3 === 'umbral' ? 763 : 717,
          guard: faction3 === 'umbral' ? 761 : 711,
          faction: faction3,
          targetName: questStep.target || questPlan.target,
          reward: Math.round(22000 + dangerMultiplier * 5000),
        });
        break;
      }
      case 'convoy': {
        const rawStellarBody = pick(radius, portsOf(starSystem));
        Object.assign(mission, {
          dest: rawStellarBody.id,
          hull: pick(radius, [704, 706, 712]),
          faction: 'spacer',
          convoyName: quest.side === 'caravan' ? 'Clockwork' : pick(radius, SHIP_NAMES),
          raiders: 2 + Math.min(2, dangerMultiplier >> 1),
          raiderHull: pick(radius, [705, 708, 711]),
          reward: Math.round(6000 + dangerMultiplier * 2500),
        });
        mission.text = `${mission.text} She is bound for ${rawStellarBody.name}.`;
        break;
      }
      case 'patrol':
        Object.assign(mission, {
          need: questStep.need || 3,
          got: 0,
          reward: Math.round(3000 + (questStep.need || 3) * 2000 + dangerMultiplier * 1500),
        });
        break;
    }
    if (quest.side) mission.reward = Math.round(mission.reward * 1.25);
    return mission;
  },
  /**
   * Push current step's job onto the player's active mission list.
   * @param {Session} session - Player session.
   * @param {QuestRecord} quest - Active quest state.
   * @param {boolean} [first] - True if first step initiation.
   * @returns {void}
   */
  questPush(this: QuestsCapabilities, session: Session, quest: QuestRecord, first?: boolean) {
    const playerData = session.data,
      mission = this.questStepJob(playerData, quest, quest.step);
    mission.owner = session.id;
    if (mission.type === 'passenger') {
      const waiting = quest.awaitingSeats,
        location = waiting?.at || playerData.stellar || playerData.lastStellar || quest.at,
        others = playerData.missions.filter(
          (mission2) => mission2.id !== mission.id && !mission2.paid,
        ),
        free =
          (playerData.shipless ? 0 : this.stats(playerData)!.passengerSeats || 0) -
          occupiedPassengerSeats(others);
      if (waiting && (session.ent || playerData.stellar !== location)) return false;
      if (free < mission.pax! || others.length >= 6) {
        quest.awaitingSeats = {
          at: location,
          pax: mission.pax!,
          title: mission.title,
          text: mission.text,
        };
        if (!waiting)
          this.toast(
            session,
            `${quest.name}: passengers are waiting at ${STELLARS[location]?.name || location}. Free ${mission.pax} passenger seats and a mission slot, then board here.`,
          );
        return false;
      }
      delete quest.awaitingSeats;
    }
    playerData.missions = playerData.missions.filter((mission2) => mission2.id !== mission.id);
    playerData.missions.push(mission);
    if (mission.type === 'cargo' || mission.type === 'smuggle') {
      const free = this.stats(playerData)!.cargo - this.holdUsed(playerData);
      if (free < 0)
        this.toast(
          session,
          `${quest.name}: this step needs ${mission.qty} t of hold space. Clear some room.`,
        );
    }
    if (!first)
      this.toast(
        session,
        `${quest.name}, step ${quest.step + 1} of ${quest.steps.length}: ${mission.title}.`,
      );
    return true;
  },
  // a step was paid (called from completeOnLanding)
  /**
   * Advance an active quest chain to its next step after completing the current step's job.
   * @param {Session} session - Player session.
   * @param {Mission} mission - Completed mission record.
   * @returns {void}
   */
  questAdvance(this: QuestsCapabilities, session: Session, mission: Mission) {
    const playerData = session.data,
      savedQuests = this.questInit(playerData),
      quest = savedQuests.active[mission.quest!.qid];
    if (!quest || quest.step !== mission.quest!.step) return;
    const questStep = quest.steps[quest.step],
      position = { ...quest.plan, target: questStep.target || quest.plan.target };
    quest.step++;
    quest.tries = 0;
    if (quest.step >= quest.steps.length) return this.questFinish(session, quest);
    const next = this.questStepJob(playerData, quest, quest.step);
    this.send(session, {
      t: 'story',
      tag: `${quest.side ? 'SIDE STORY' : 'QUEST'} · ${quest.name.toUpperCase()}`,
      title: mission.title,
      done: true,
      text: `${this.fill(questStep.beat || '', position)}\n\nNext (step ${quest.step + 1} of ${quest.steps.length}): ${next.title}. ${next.text}`,
    });
    this.questPush(session, quest, true);
    this.db.touch();
  },
  /**
   * Complete a quest chain, awarding credits, crates, blueprints, officers, and standing.
   * @param {Session} session - Player session.
   * @param {QuestRecord} quest - Completed quest structure.
   * @returns {void}
   */
  questFinish(this: QuestsCapabilities, session: Session, quest: QuestRecord) {
    const playerData = session.data,
      savedQuests = this.questInit(playerData);
    if (savedQuests.active[quest.qid] !== quest) return;
    delete savedQuests.active[quest.qid];
    let radius, endText, positionX;
    if (quest.side) {
      positionX = SIDE_STORIES.find((sideStory) => sideStory.id === quest.side)!;
      radius = positionX.reward;
      savedQuests.sides[quest.side] = Date.now();
      endText = positionX.end;
    } else {
      positionX = CHAINS.find((questChain) => questChain.id === quest.chain)!;
      radius = this.chainReward(positionX, quest.lvl || 0);
      endText = this.fill(positionX.end, quest.plan);
      const cargoSpace = (savedQuests.contacts[quest.contact!] =
        savedQuests.contacts[quest.contact!] || {});
      cargoSpace.n = (cargoSpace.n || 0) + 1;
      cargoSpace.cool = Date.now() + CONTACT_COOL_MIN * 60000;
      cargoSpace.last = [quest.chain, ...(cargoSpace.last || [])].slice(0, 3);
    }
    const received = radius.credits ? [`${credits(radius.credits)} credits`] : [];
    if (radius.radio && grantRadio(this, session, radius.radio))
      received.push(
        `radio station: ${RADIO_STATIONS.find((state) => state.id === radius.radio)!.name}`,
      );
    playerData.credits += radius.credits;
    playerData.stats.earned += radius.credits;
    if (radius.crate) {
      const materialType =
          radius.crate[0] || MATERIALS[Math.floor(Math.random() * MATERIALS.length)],
        crate2 = radius.crate[1];
      playerData.mats[materialType][crate2] = (playerData.mats[materialType][crate2] || 0) + 1;
      received.push(`a ${materialType} ${GRADES[crate2]} crate`);
    }
    if (radius.bp) {
      const specialistShip = SPECIALISTS[Math.abs(hash(quest.qid)) % SPECIALISTS.length];
      playerData.bp = playerData.bp || {};
      playerData.bp[specialistShip.id] = (playerData.bp[specialistShip.id] || 0) + radius.bp;
      received.push(`${radius.bp} ${specialistShip.name} blueprints`);
    }
    if (radius.officer) {
      playerData.officers = playerData.officers || [];
      if (playerData.officers.length < 24) {
        const race =
            radius.officer === 'any'
              ? raceOf(systemsById[STELLARS[quest.at].system].faction)
              : radius.officer,
          roles = RACE_ROLES[race] || ['engineer'],
          count = OFFICER_NAMES[race];
        const options = {
          id: this.uid(playerData),
          name:
            count[0][Math.floor(Math.random() * count[0].length)] +
            ' ' +
            count[1][Math.floor(Math.random() * count[1].length)],
          race,
          role: roles[Math.floor(Math.random() * roles.length)],
          rarity: 2,
          lv: 3,
          xp: 0,
        };
        playerData.officers.push(options);
        received.push(
          `${options.name} joins your crew (Rare ${ROLES[options.role] ? ROLES[options.role].name.toLowerCase() : options.role})`,
        );
      } else received.push('(no room on your roster for the officer who offered to join)');
    }
    const faction2 = systemsById[STELLARS[quest.at].system].faction;
    if (FACTIONS[faction2] && !FACTIONS[faction2].pirate)
      playerData.rep[faction2] = clampStanding(
        (playerData.rep[faction2] || 0) + (quest.side ? 8 : 4),
      );
    savedQuests.done.push({
      id: quest.qid,
      name: quest.name,
      giver: quest.giver,
      side: !!quest.side,
      t: Date.now(),
    });
    this.log(playerData, `Story complete: ${quest.name}.`);
    this.send(session, {
      t: 'story',
      tag: `${quest.side ? 'SIDE STORY' : 'QUEST'} COMPLETE · ${quest.name.toUpperCase()}`,
      title: quest.name,
      done: true,
      text: `${endText}\n\nRewards: ${received.join(', ')}.`,
    });
    this.db.touch();
    this.you(session);
  },
  /**
   * Terminate and fail an active quest chain.
   * @param {Session} session - Player session.
   * @param {string} questId - Quest ID string.
   * @param {string} reason - Explanation of failure.
   * @returns {void}
   */
  questFail(this: QuestsCapabilities, session: Session, questId: string, reason: string) {
    const playerData = session.data,
      savedQuests = this.questInit(playerData),
      quest = savedQuests.active[questId];
    if (!quest) return;
    delete savedQuests.active[questId];
    playerData.missions = playerData.missions.filter(
      (mission) => !(mission.quest && mission.quest.qid === questId),
    );
    if (quest.contact) {
      const cargoSpace = (savedQuests.contacts[quest.contact!] =
        savedQuests.contacts[quest.contact!] || {});
      cargoSpace.cool = Date.now() + CONTACT_COOL_MIN * 60000;
    }
    this.toast(
      session,
      `Story ended: ${quest.name} (${reason}).${quest.side ? ' You can start it again where it began.' : ''}`,
    );
    this.log(playerData, `Story ended: ${quest.name} (${reason}).`);
    this.db.touch();
  },
  // every two seconds: a step lost with your ship, a missed deadline or a destroyed convoy gets one more chance
  /**
   * Periodic check on active quest steps to allow second chance or mark failure.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  questSweep(this: QuestsCapabilities, session: Session) {
    const playerData = session.data,
      savedQuests = playerData.quests;
    if (!savedQuests || !savedQuests.active) return;
    for (const questRecord of Object.values(savedQuests.active)) {
      if (questRecord.awaitingSeats) {
        if (
          !session.ent &&
          playerData.stellar === questRecord.awaitingSeats.at &&
          this.questPush(session, questRecord, true)
        ) {
          this.toast(session, `${questRecord.name}: your waiting passengers have boarded.`);
          this.db.touch();
          this.you(session);
          this.landed(session);
        }
        // Waiting for a suitable ship is not a lost mission and consumes no retry.
        continue;
      }
      if (
        playerData.missions.some(
          (mission) => mission.quest && mission.quest.qid === questRecord.qid,
        )
      )
        continue;
      if (questRecord.tries >= 1) {
        this.questFail(session, questRecord.qid, 'the job failed twice');
        this.you(session);
        continue;
      }
      questRecord.tries++;
      this.questPush(session, questRecord, true);
      this.toast(
        session,
        `${questRecord.name}: the step failed, but the story isn't over. Try again: ${questRecord.steps[questRecord.step] ? this.fill(questRecord.steps[questRecord.step].title, questRecord.plan) : ''}.`,
      );
      this.db.touch();
      this.you(session);
    }
  },
  // ---- the contact's talk at the bar: a greeting that knows you, and a rumour worth acting on
  /**
   * Retrieve dynamic conversation dialogue and trade/system rumors from a bar contact.
   * @param {{id: string, system: string}} stellarBody2 - Landed stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string> | null} Bar dialogue descriptor, or null.
   */
  barTalk(this: QuestsCapabilities, stellarBody2: StellarBody, playerData: PlayerData) {
    const contactAt2 = this.contactAt(stellarBody2);
    if (!contactAt2) return null;
    const savedQuests = this.questInit(playerData),
      count = (savedQuests.contacts[contactAt2.id] || {}).n || 0,
      level = Math.min(STANDING.length - 1, count),
      window = Math.floor(Date.now() / 600000),
      radius = randomGenerator(hash(contactAt2.id + window));
    const hello = [
      [
        `"Haven't seen you in here before, Captain."`,
        `"New face. Pull up a stool."`,
        `"Buy a drink and I might have work for you."`,
      ],
      [
        `"Back again? Good. I remember a reliable pilot."`,
        `"Captain ${playerData.name}. Your usual?"`,
      ],
      [`"There's my favourite captain. Sit, sit."`, `"I was hoping you'd come by."`],
      [
        `"${playerData.name}! The drinks are on me tonight."`,
        `"I tell everyone about you, you know."`,
      ],
      [`"Old friend. Whatever you need, it's yours."`],
    ][level];
    const rumors = [],
      near = Object.entries(jumpsFrom(stellarBody2.system)).filter(
        ([, innerIndex]) => innerIndex >= 1 && innerIndex <= 4,
      );
    for (const [starSystem, innerIndex] of near) {
      const livingState = this.stateOf(starSystem);
      if (!livingState) continue;
      const starSystem2 = systemsById[starSystem];
      const want = {
        famine: 'food',
        refugees: 'food',
        plague: 'medical',
        rush: 'ore',
        war: 'equipment',
        boom: 'luxury',
        festival: 'luxury',
      }[livingState.kind];
      rumors.push(
        `"Word is ${starSystem2.name} has troubles: ${{ famine: 'a famine', plague: 'a fever', boom: 'a boom on', war: 'a war on', pirates: 'pirates thick as flies', festival: 'a festival on', rush: 'a mining rush', refugees: 'refugees everywhere' }[livingState.kind]}. ${innerIndex} jump${innerIndex > 1 ? 's' : ''} from here.${want ? ` A hold full of ${COMMODITIES.find((commodityDef) => commodityDef.id === want)!.name.toLowerCase()} would sell for a fortune.` : livingState.kind === 'pirates' ? ' The bounties there pay extra.' : ''}"`,
      );
    }
    const marketItems = this.market(stellarBody2);
    let tooltip = null;
    if (marketItems) {
      const ports = near
        .filter(([, innerIndex]) => innerIndex <= 2)
        .flatMap(([starSystem]) =>
          portsOf(starSystem)
            .filter((rawStellarBody) => rawStellarBody.svc!.includes('T'))
            .map((rawStellarBody) => STELLARS[rawStellarBody.id]),
        );
      let best = null;
      for (const marketItem of marketItems)
        for (const stellarBody of ports) {
          const marketItems = this.market(stellarBody);
          const marketItem2 =
            marketItems && marketItems.find((marketItem3) => marketItem3.id === marketItem.id);
          if (
            marketItem2 &&
            marketItem2.price! - marketItem.price! > (best ? best.gain : marketItem.price! * 0.15)
          )
            best = { c: marketItem, o: stellarBody, gain: marketItem2.price! - marketItem.price! };
        }
      if (best)
        tooltip = `"Smart money buys ${best.c.name.toLowerCase()} here and sells at ${best.o.name}. ${credits(best.gain)} a ton, last I heard."`;
    }
    const flavour = {
      lawful: [
        `"The Concord Watch has been busier than usual. Keep your papers in order."`,
        `"Insurance rates are up again. Fly careful."`,
      ],
      shady: [
        `"Patrols scan less in the outer lanes. Just saying."`,
        `"Everybody's selling something. The trick is knowing who's buying."`,
      ],
      wild: [
        `"Out here, the only law is fuel and nerve."`,
        `"Found a rock last week with shards in it the size of my fist. Gone now, of course."`,
      ],
    }[contactAt2.kind];
    const roll = radius(),
      rumor =
        tooltip && roll < 0.4
          ? tooltip
          : rumors.length && roll < 0.85
            ? pick(radius, rumors)
            : tooltip || pick(radius, flavour!);
    return {
      name: contactAt2.name,
      title: contactAt2.title,
      race: contactAt2.race,
      standing: STANDING[level],
      hello: pick(radius, hello),
      rumor,
    };
  },
  // ---- salvage steps: a crate appears at the marked point when you come close
  /**
   * Spawn a floating salvage container when player ship nears marked quest coordinates.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  questSalvageIdle(this: QuestsCapabilities, session: Session) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    const space = this.spaces[playerData.sys];
    if (!space) return;
    for (const mission of playerData.missions) {
      if (
        mission.type !== 'salvage' ||
        mission.sys !== playerData.sys ||
        mission.done ||
        !mission.point
      )
        continue;
      if (Math.hypot(mission.point[0] - entity.x, mission.point[1] - entity.y) > 1500) continue;
      if (
        space.loot.some(
          (floatingLoot) => !floatingLoot.taken && floatingLoot.it.salvage === mission.id,
        )
      )
        continue;
      space.loot.push({
        id: space.nextLootId(),
        x: mission.point[0],
        y: mission.point[1],
        vx: 0,
        vy: 0,
        it: { salvage: mission.id, owner: session.id },
        t: space.t + 600,
        kind: 5,
      });
      this.toast(session, 'Salvage on your scanner: fly over the marked crate to scoop it up.');
    }
  },
  /**
   * Handle collecting a quest salvage floating loot entity.
   * @param {Session} session - Player session.
   * @param {{salvage: string}} item - Collected loot cargo item.
   * @returns {boolean} True if matching salvage quest was completed.
   */
  questLoot(this: QuestsCapabilities, session: Session, item: { salvage?: string }) {
    const playerData = session.data,
      mission = playerData.missions.find((mission) => mission.id === item.salvage && !mission.done);
    if (!mission) return false;
    mission.done = true;
    this.toast(session, `Recovered: ${mission.title}. Land anywhere to continue.`);
    this.db.touch();
    this.you(session);
    return true;
  },
};
