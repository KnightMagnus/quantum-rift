// @ts-check
// Explicit feature composition. No method is installed on Game or another feature.
import { IndustrialOperations } from './industrial.js';
import { MiningOperations } from './mining.js';
import { RefineryOperations } from './refinery.js';
import { MiningPressureOperations } from './mining-pressure.js';
import { SYS, STELLARS, SITE_PRICES, COMMODITIES } from '../shared/galaxy.js';
import { price } from '../shared/rules.js';
import { purchaseUnit, saleValue } from './trade-pricing.js';
import { bindOperations } from './feature-service.js';
import { HangarOperations } from './hangar.js';
import { FrontsOperations } from './fronts.js';
import { FrontierOperations } from './frontier.js';
import { SpecialistOperations } from './specialists.js';
import { HostileOperations } from './hostile.js';
import { StoryOperations } from './story.js';
import { RivalsOperations } from './rivals.js';
import { HailOperations } from './hail.js';
import { FleetCmdOperations } from './fleetcmd.js';
import { SyndicateOperations } from './syndicate.js';
import { ArcsOperations } from './arcs.js';
import { DocksOperations } from './docks.js';
import { LivingOperations } from './living.js';
import { QuestOperations } from './quests.js';
import { CoopOperations } from './coop.js';

/**
 * @typedef {object} FeatureServices
 * @property {import("./feature-service.js").BoundOperations<typeof IndustrialOperations>} industrial
 * @property {import("./feature-service.js").BoundOperations<typeof MiningOperations>} mining
 * @property {import("./feature-service.js").BoundOperations<typeof RefineryOperations>} refinery
 * @property {import("./feature-service.js").BoundOperations<typeof MiningPressureOperations>} pressure
 * @property {import('./feature-service.js').BoundOperations<typeof HangarOperations>} hangar
 * @property {import('./feature-service.js').BoundOperations<typeof FrontsOperations>} fronts
 * @property {import('./feature-service.js').BoundOperations<typeof FrontierOperations>} frontier
 * @property {import('./feature-service.js').BoundOperations<typeof SpecialistOperations>} specialists
 * @property {import('./feature-service.js').BoundOperations<typeof HostileOperations>} hostile
 * @property {import('./feature-service.js').BoundOperations<typeof StoryOperations>} story
 * @property {import('./feature-service.js').BoundOperations<typeof RivalsOperations>} rivals
 * @property {import('./feature-service.js').BoundOperations<typeof HailOperations>} hail
 * @property {import('./feature-service.js').BoundOperations<typeof FleetCmdOperations>} fleetcmd
 * @property {import('./feature-service.js').BoundOperations<typeof SyndicateOperations>} syndicate
 * @property {import('./feature-service.js').BoundOperations<typeof ArcsOperations>} arcs
 * @property {import('./feature-service.js').BoundOperations<typeof DocksOperations>} docks
 * @property {import('./feature-service.js').BoundOperations<typeof LivingOperations>} living
 * @property {import('./feature-service.js').BoundOperations<typeof QuestOperations>} quests
 * @property {import('./feature-service.js').BoundOperations<typeof CoopOperations>} coop
 * @property {Pick<typeof SpecialistOperations, 'bonus' >} bonuses
 * @property {Pick<typeof FrontsOperations, 'stats' >} shipStats
 * @property {Pick<typeof FrontierOperations, 'worldPayload' >} world
 * @property {Pick<typeof CoopOperations, 'sessionOf' >} sessions
 */

/** @typedef {Pick<import('./game.js').Game, 'A' | 'holdUsed' | 'db' | 'hasMats' | 'landed' | 'live' | 'log' | 'ownSite' | 'spaces' | 'takeMats' | 'toast' | 'tut' | 'you'> & Pick<typeof ArcsOperations, 'arcProgress'> & Pick<typeof HangarOperations, 'barOffers' | 'bays' | 'dockSlots' | 'officerXp' | 'researchChain' | 'resolveShuttle' | 'shuttleBoard' | 'shuttleChance' | 'shuttleReward' | 'shuttleTraffic' | 'startQueued' | 'storedValue' | 'uid'> & Pick<typeof SpecialistOperations, 'bonus' | 'flying' | 'power' | 'specOnBoard'> & Pick<typeof DocksOperations, 'docksOp' | 'shipUid' | 'unassign' | 'unwingOfficer'> & Pick<typeof FrontsOperations, 'goal' | 'mods' | 'stats'> & Pick<typeof FrontierOperations, 'notify'> & Pick<typeof CoopOperations, 'rescueBoard'> & Pick<typeof StoryOperations, 'storyProgress'> & Pick<typeof SyndicateOperations, 'synGain'>} HangarCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | '_an' | '_anW' | 'broadcast' | 'db' | 'invasion' | 'lastInvWin' | 'log' | 'sessions' | 'spaces' | 'toast' | 'you'> & Pick<typeof FrontsOperations, 'anomalies' | 'event' | 'goal' | 'goalsFor' | 'pushWorld' | 'startInvasion' | 'storeFor' | 'token'> & Pick<typeof CoopOperations, 'armadaBonus' | 'refreshPlayer'> & Pick<typeof SpecialistOperations, 'bonus'> & Pick<typeof HangarOperations, 'officerXp' | 'uid'> & Pick<typeof LivingOperations, 'statesPayload'> & Pick<typeof FrontierOperations, 'worldPayload'>} FrontsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'holdUsed' | 'arenaQ' | 'broadcast' | 'db' | 'hasMats' | 'landed' | 'live' | 'log' | 'matches' | 'nextMatch' | 'send' | 'sessions' | 'spaces' | 'spawnPlayer' | 'takeMats' | 'toast' | 'waves' | 'you'> & Pick<typeof FrontierOperations, 'accrue' | 'arenaCheck' | 'arenaExit' | 'coloniesOf' | 'colonizable' | 'colonyBuffs' | 'colonyMax' | 'defenseRating' | 'deliver' | 'itemName' | 'matchOrder' | 'notify' | 'pay' | 'raidStrength' | 'refundOrder' | 'resolveRaid' | 'sameItem' | 'startWave' | 'tryMatch'> & Pick<typeof SpecialistOperations, 'flying' | 'specOnRaid'> & Pick<typeof FrontsOperations, 'pushWorld' | 'stats'> & Pick<typeof RivalsOperations, 'rivalBoard'> & Pick<typeof CoopOperations, 'sessionOf'> & {frontsBonus: typeof FrontsOperations.bonus, frontsWorldPayload: typeof FrontsOperations.worldPayload}} FrontierCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'fitsJobs' | 'holdUsed' | 'broadcast' | 'db' | 'hasMats' | 'landed' | 'log' | 'ownSite' | 'takeMats' | 'toast' | 'tradeIn' | 'you'> & Pick<typeof FrontsOperations, 'anomalies'> & Pick<typeof SpecialistOperations, 'flying' | 'power' | 'specGain' | 'specInit' | 'specOf'> & Pick<typeof DocksOperations, 'wingHulls'> & {frontierBonus: typeof FrontierOperations.bonus}} SpecialistsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'depart' | 'live' | 'log' | 'ownSite' | 'spaces' | 'toast' | 'tut' | 'you'> & Pick<typeof SpecialistOperations, 'bonus' | 'specInit'> & Pick<typeof CoopOperations, 'holdoutAnnounce' | 'holdoutHelpers' | 'holdoutReward'> & Pick<typeof HostileOperations, 'holdoutEnd' | 'hostInit' | 'myPower'> & Pick<typeof FrontsOperations, 'mods'> & Pick<typeof FrontierOperations, 'notify'> & Pick<typeof DocksOperations, 'wingHulls'>} HostileCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'broadcast' | 'db' | 'landed' | 'log' | 'send' | 'toast' | 'tradeIn' | 'you'> & Pick<typeof HangarOperations, 'dockSlots'> & Pick<typeof DocksOperations, 'leadChanged'> & Pick<typeof StoryOperations, 'storyComplete' | 'storyDone' | 'storyGift' | 'storyInit' | 'storyOffer'>} StoryCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'live' | 'log' | 'rivalEnts' | 'sessions' | 'spaces' | 'toast'> & Pick<typeof RivalsOperations, 'news' | 'relOf' | 'rivalRel' | 'rivalState' | 'spawnHunters'>} RivalsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'hails' | 'log' | 'send' | 'spaces' | 'toast' | 'you'> & Pick<typeof HailOperations, 'bribeCost' | 'hailPlanet' | 'hailPlanetOpt' | 'hailTarget'> & Pick<typeof HostileOperations, 'myPower'> & Pick<typeof RivalsOperations, 'relOf' | 'rivalRel'>} HailCapabilities */
/** @typedef {import('./contracts.js').FleetCommandsCapabilities} FleetCommandsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'landed' | 'log' | 'toast' | 'you'> & Pick<typeof SyndicateOperations, 'bankAt' | 'bankInfo' | 'blackMarketAt' | 'synInit'> & Pick<typeof FrontierOperations, 'notify'>} SyndicateCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'landed' | 'log' | 'send' | 'toast' | 'you'> & Pick<typeof ArcsOperations, 'arcComplete' | 'arcOffer' | 'arcOffersAt' | 'arcState' | 'arcsInit' | 'expeditionNext'>} ArcsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'fitsJobs' | 'jobCargo' | 'landed' | 'log' | 'ownSite' | 'outfitter' | 'sessions' | 'toast' | 'yard' | 'you'> & Pick<typeof DocksOperations, 'activeWings' | 'cleanBridge' | 'dockCount' | 'docksInit' | 'shipUid' | 'slotOf' | 'stored' | 'unassign' | 'unwingOfficer' | 'wingMax' | 'wingOfficerAt' | 'wingRepair'> & Pick<typeof HangarOperations, 'dockSlots' | 'hangarInit' | 'uid'>} DocksCapabilities */
/** @typedef {Pick<import('./game.js').Game, '_livingStarted' | '_mkt' | 'db' | 'log' | 'toast' | 'worldKey' | 'you'> & Pick<typeof LivingOperations, 'impact' | 'livingInit' | 'marketSystems' | 'resolveState' | 'stateOf' | 'stateProgress' | 'warEnemy'> & Pick<typeof RivalsOperations, 'news'>} LivingCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'db' | 'holdUsed' | 'landed' | 'log' | 'market' | 'send' | 'spaces' | 'toast' | 'you'> & Pick<typeof QuestOperations, 'chainReward' | 'contactAt' | 'contactStory' | 'fill' | 'questFail' | 'questFinish' | 'questInit' | 'questPlan' | 'questPush' | 'questRewardText' | 'questStepJob'> & Pick<typeof LivingOperations, 'stateOf'> & Pick<typeof FrontsOperations, 'stats'> & Pick<typeof HangarOperations, 'uid'>} QuestsCapabilities */
/** @typedef {Pick<import('./game.js').Game, 'A' | 'broadcast' | 'db' | 'duels' | 'holdUsed' | 'landed' | 'live' | 'log' | 'nextCoopId' | 'ownSite' | 'send' | 'sessions' | 'solo' | 'spaces' | 'toast' | 'trades' | 'you'> & Pick<typeof CoopOperations, 'armadaChat' | 'armadaLeave' | 'armadaNear' | 'armadaOf' | 'armadaPayload' | 'armadaPush' | 'armadaRefresh' | 'atOwnStation' | 'blocked' | 'dm' | 'drop' | 'duelEnd' | 'duelOf' | 'duelOut' | 'duelSay' | 'duelSide' | 'duelTick' | 'dueling' | 'has' | 'presence' | 'pushSocial' | 'rescueTick' | 'sessionOf' | 'socialInit' | 'socialOp' | 'socialPayload' | 'statusOf' | 'tradeCancel' | 'tradeClean' | 'tradeDo' | 'tradePush'> & Pick<typeof FrontsOperations, 'goal' | 'mods' | 'stats'> & Pick<typeof FrontierOperations, 'notify'> & Pick<typeof HangarOperations, 'officerXp'>} CoopCapabilities */

/** @param {import('./game.js').Game} core @returns {FeatureServices} */
export function createFeatures(core) {
  /** @type {FeatureServices} */
  const features = /** @type {FeatureServices} */ ({});
  /** @type {HangarCapabilities} */
  const hangarCapabilities = {
    holdUsed: core.holdUsed.bind(core),
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get arcProgress() {
      return features.arcs.arcProgress;
    },
    get barOffers() {
      return features.hangar.barOffers;
    },
    get bays() {
      return features.hangar.bays;
    },
    get bonus() {
      return features.bonuses.bonus;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get dockSlots() {
      return features.hangar.dockSlots;
    },
    get docksOp() {
      return features.docks.docksOp;
    },
    get flying() {
      return features.specialists.flying;
    },
    get goal() {
      return features.fronts.goal;
    },
    hasMats: core.hasMats.bind(core),
    landed: core.landed.bind(core),
    get live() {
      return core.live;
    },
    set live(value) {
      core.live = value;
    },
    log: core.log.bind(core),
    get mods() {
      return features.fronts.mods;
    },
    get notify() {
      return features.frontier.notify;
    },
    get officerXp() {
      return features.hangar.officerXp;
    },
    ownSite: core.ownSite.bind(core),
    get power() {
      return features.specialists.power;
    },
    get rescueBoard() {
      return features.coop.rescueBoard;
    },
    get researchChain() {
      return features.hangar.researchChain;
    },
    get resolveShuttle() {
      return features.hangar.resolveShuttle;
    },
    get shipUid() {
      return features.docks.shipUid;
    },
    get shuttleBoard() {
      return features.hangar.shuttleBoard;
    },
    get shuttleChance() {
      return features.hangar.shuttleChance;
    },
    get shuttleReward() {
      return features.hangar.shuttleReward;
    },
    get shuttleTraffic() {
      return features.hangar.shuttleTraffic;
    },
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get specOnBoard() {
      return features.specialists.specOnBoard;
    },
    get startQueued() {
      return features.hangar.startQueued;
    },
    get stats() {
      return features.shipStats.stats;
    },
    get storedValue() {
      return features.hangar.storedValue;
    },
    get storyProgress() {
      return features.story.storyProgress;
    },
    get synGain() {
      return features.syndicate.synGain;
    },
    takeMats: core.takeMats.bind(core),
    toast: core.toast.bind(core),
    tut: core.tut.bind(core),
    get uid() {
      return features.hangar.uid;
    },
    get unassign() {
      return features.docks.unassign;
    },
    get unwingOfficer() {
      return features.docks.unwingOfficer;
    },
    you: core.you.bind(core),
  };
  features.hangar = bindOperations(HangarOperations, hangarCapabilities);
  /** @type {FrontsCapabilities} */
  const frontsCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get _an() {
      return core._an;
    },
    set _an(value) {
      core._an = value;
    },
    get _anW() {
      return core._anW;
    },
    set _anW(value) {
      core._anW = value;
    },
    get anomalies() {
      return features.fronts.anomalies;
    },
    get armadaBonus() {
      return features.coop.armadaBonus;
    },
    get bonus() {
      return features.bonuses.bonus;
    },
    broadcast: core.broadcast.bind(core),
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get event() {
      return features.fronts.event;
    },
    get goal() {
      return features.fronts.goal;
    },
    get goalsFor() {
      return features.fronts.goalsFor;
    },
    get invasion() {
      return core.invasion;
    },
    set invasion(value) {
      core.invasion = value;
    },
    get lastInvWin() {
      return core.lastInvWin;
    },
    set lastInvWin(value) {
      core.lastInvWin = value;
    },
    log: core.log.bind(core),
    get officerXp() {
      return features.hangar.officerXp;
    },
    get pushWorld() {
      return features.fronts.pushWorld;
    },
    get refreshPlayer() {
      return features.coop.refreshPlayer;
    },
    get sessions() {
      return core.sessions;
    },
    set sessions(value) {
      core.sessions = value;
    },
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get startInvasion() {
      return features.fronts.startInvasion;
    },
    get statesPayload() {
      return features.living.statesPayload;
    },
    get storeFor() {
      return features.fronts.storeFor;
    },
    toast: core.toast.bind(core),
    get token() {
      return features.fronts.token;
    },
    get uid() {
      return features.hangar.uid;
    },
    get worldPayload() {
      return features.world.worldPayload;
    },
    you: core.you.bind(core),
  };
  features.fronts = bindOperations(FrontsOperations, frontsCapabilities);
  /** @type {FrontierCapabilities} */
  const frontierCapabilities = {
    holdUsed: core.holdUsed.bind(core),
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get accrue() {
      return features.frontier.accrue;
    },
    get arenaCheck() {
      return features.frontier.arenaCheck;
    },
    get arenaExit() {
      return features.frontier.arenaExit;
    },
    get arenaQ() {
      return core.arenaQ;
    },
    set arenaQ(value) {
      core.arenaQ = value;
    },
    broadcast: core.broadcast.bind(core),
    get coloniesOf() {
      return features.frontier.coloniesOf;
    },
    get colonizable() {
      return features.frontier.colonizable;
    },
    get colonyBuffs() {
      return features.frontier.colonyBuffs;
    },
    get colonyMax() {
      return features.frontier.colonyMax;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get defenseRating() {
      return features.frontier.defenseRating;
    },
    get deliver() {
      return features.frontier.deliver;
    },
    get flying() {
      return features.specialists.flying;
    },
    get frontsBonus() {
      return features.fronts.bonus;
    },
    get frontsWorldPayload() {
      return features.fronts.worldPayload;
    },
    hasMats: core.hasMats.bind(core),
    get itemName() {
      return features.frontier.itemName;
    },
    landed: core.landed.bind(core),
    get live() {
      return core.live;
    },
    set live(value) {
      core.live = value;
    },
    log: core.log.bind(core),
    get matchOrder() {
      return features.frontier.matchOrder;
    },
    get matches() {
      return core.matches;
    },
    set matches(value) {
      core.matches = value;
    },
    get nextMatch() {
      return core.nextMatch;
    },
    set nextMatch(value) {
      core.nextMatch = value;
    },
    get notify() {
      return features.frontier.notify;
    },
    get pay() {
      return features.frontier.pay;
    },
    get pushWorld() {
      return features.fronts.pushWorld;
    },
    get raidStrength() {
      return features.frontier.raidStrength;
    },
    get refundOrder() {
      return features.frontier.refundOrder;
    },
    get resolveRaid() {
      return features.frontier.resolveRaid;
    },
    get rivalBoard() {
      return features.rivals.rivalBoard;
    },
    get sameItem() {
      return features.frontier.sameItem;
    },
    send: core.send.bind(core),
    get sessionOf() {
      return features.sessions.sessionOf;
    },
    get sessions() {
      return core.sessions;
    },
    set sessions(value) {
      core.sessions = value;
    },
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    spawnPlayer: core.spawnPlayer.bind(core),
    get specOnRaid() {
      return features.specialists.specOnRaid;
    },
    get startWave() {
      return features.frontier.startWave;
    },
    get stats() {
      return features.shipStats.stats;
    },
    takeMats: core.takeMats.bind(core),
    toast: core.toast.bind(core),
    get tryMatch() {
      return features.frontier.tryMatch;
    },
    get waves() {
      return core.waves;
    },
    set waves(value) {
      core.waves = value;
    },
    you: core.you.bind(core),
  };
  features.frontier = bindOperations(FrontierOperations, frontierCapabilities);
  /** @type {SpecialistsCapabilities} */
  const specialistsCapabilities = {
    fitsJobs: core.fitsJobs.bind(core),
    holdUsed: core.holdUsed.bind(core),
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get anomalies() {
      return features.fronts.anomalies;
    },
    broadcast: core.broadcast.bind(core),
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get flying() {
      return features.specialists.flying;
    },
    get frontierBonus() {
      return features.frontier.bonus;
    },
    hasMats: core.hasMats.bind(core),
    landed: core.landed.bind(core),
    log: core.log.bind(core),
    ownSite: core.ownSite.bind(core),
    get power() {
      return features.specialists.power;
    },
    get specGain() {
      return features.specialists.specGain;
    },
    get specInit() {
      return features.specialists.specInit;
    },
    get specOf() {
      return features.specialists.specOf;
    },
    takeMats: core.takeMats.bind(core),
    toast: core.toast.bind(core),
    tradeIn: core.tradeIn.bind(core),
    get wingHulls() {
      return features.docks.wingHulls;
    },
    you: core.you.bind(core),
  };
  features.specialists = bindOperations(SpecialistOperations, specialistsCapabilities);
  /** @type {HostileCapabilities} */
  const hostileCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get bonus() {
      return features.bonuses.bonus;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    depart: core.depart.bind(core),
    get holdoutAnnounce() {
      return features.coop.holdoutAnnounce;
    },
    get holdoutEnd() {
      return features.hostile.holdoutEnd;
    },
    get holdoutHelpers() {
      return features.coop.holdoutHelpers;
    },
    get holdoutReward() {
      return features.coop.holdoutReward;
    },
    get hostInit() {
      return features.hostile.hostInit;
    },
    get live() {
      return core.live;
    },
    set live(value) {
      core.live = value;
    },
    log: core.log.bind(core),
    get mods() {
      return features.fronts.mods;
    },
    get myPower() {
      return features.hostile.myPower;
    },
    get notify() {
      return features.frontier.notify;
    },
    ownSite: core.ownSite.bind(core),
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get specInit() {
      return features.specialists.specInit;
    },
    toast: core.toast.bind(core),
    tut: core.tut.bind(core),
    get wingHulls() {
      return features.docks.wingHulls;
    },
    you: core.you.bind(core),
  };
  features.hostile = bindOperations(HostileOperations, hostileCapabilities);
  /** @type {StoryCapabilities} */
  const storyCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    broadcast: core.broadcast.bind(core),
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get dockSlots() {
      return features.hangar.dockSlots;
    },
    landed: core.landed.bind(core),
    get leadChanged() {
      return features.docks.leadChanged;
    },
    log: core.log.bind(core),
    send: core.send.bind(core),
    get storyComplete() {
      return features.story.storyComplete;
    },
    get storyDone() {
      return features.story.storyDone;
    },
    get storyGift() {
      return features.story.storyGift;
    },
    get storyInit() {
      return features.story.storyInit;
    },
    get storyOffer() {
      return features.story.storyOffer;
    },
    toast: core.toast.bind(core),
    tradeIn: core.tradeIn.bind(core),
    you: core.you.bind(core),
  };
  features.story = bindOperations(StoryOperations, storyCapabilities);
  /** @type {RivalsCapabilities} */
  const rivalsCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get live() {
      return core.live;
    },
    set live(value) {
      core.live = value;
    },
    log: core.log.bind(core),
    get news() {
      return features.rivals.news;
    },
    get relOf() {
      return features.rivals.relOf;
    },
    get rivalEnts() {
      return core.rivalEnts;
    },
    set rivalEnts(value) {
      core.rivalEnts = value;
    },
    get rivalRel() {
      return features.rivals.rivalRel;
    },
    get rivalState() {
      return features.rivals.rivalState;
    },
    get sessions() {
      return core.sessions;
    },
    set sessions(value) {
      core.sessions = value;
    },
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get spawnHunters() {
      return features.rivals.spawnHunters;
    },
    toast: core.toast.bind(core),
  };
  features.rivals = bindOperations(RivalsOperations, rivalsCapabilities);
  /** @type {HailCapabilities} */
  const hailCapabilities = {
    get hails() {
      return core.hails;
    },
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get bribeCost() {
      return features.hail.bribeCost;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get hailPlanet() {
      return features.hail.hailPlanet;
    },
    get hailPlanetOpt() {
      return features.hail.hailPlanetOpt;
    },
    get hailTarget() {
      return features.hail.hailTarget;
    },
    log: core.log.bind(core),
    get myPower() {
      return features.hostile.myPower;
    },
    get relOf() {
      return features.rivals.relOf;
    },
    get rivalRel() {
      return features.rivals.rivalRel;
    },
    send: core.send.bind(core),
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.hail = bindOperations(HailOperations, hailCapabilities);
  /** @type {FleetCommandsCapabilities} */
  const fleetcmdCapabilities = {
    holdUsed: core.holdUsed.bind(core),
    send: core.send.bind(core),
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get stats() {
      return features.shipStats.stats;
    },
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.fleetcmd = bindOperations(FleetCmdOperations, fleetcmdCapabilities);
  /** @type {SyndicateCapabilities} */
  const syndicateCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get bankAt() {
      return features.syndicate.bankAt;
    },
    get bankInfo() {
      return features.syndicate.bankInfo;
    },
    get blackMarketAt() {
      return features.syndicate.blackMarketAt;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    landed: core.landed.bind(core),
    log: core.log.bind(core),
    get notify() {
      return features.frontier.notify;
    },
    get synInit() {
      return features.syndicate.synInit;
    },
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.syndicate = bindOperations(SyndicateOperations, syndicateCapabilities);
  /** @type {ArcsCapabilities} */
  const arcsCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get arcComplete() {
      return features.arcs.arcComplete;
    },
    get arcOffer() {
      return features.arcs.arcOffer;
    },
    get arcOffersAt() {
      return features.arcs.arcOffersAt;
    },
    get arcState() {
      return features.arcs.arcState;
    },
    get arcsInit() {
      return features.arcs.arcsInit;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get expeditionNext() {
      return features.arcs.expeditionNext;
    },
    landed: core.landed.bind(core),
    log: core.log.bind(core),
    send: core.send.bind(core),
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.arcs = bindOperations(ArcsOperations, arcsCapabilities);
  /** @type {DocksCapabilities} */
  const docksCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get activeWings() {
      return features.docks.activeWings;
    },
    get cleanBridge() {
      return features.docks.cleanBridge;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get dockCount() {
      return features.docks.dockCount;
    },
    get dockSlots() {
      return features.hangar.dockSlots;
    },
    get docksInit() {
      return features.docks.docksInit;
    },
    fitsJobs: core.fitsJobs.bind(core),
    get hangarInit() {
      return features.hangar.hangarInit;
    },
    jobCargo: core.jobCargo.bind(core),
    landed: core.landed.bind(core),
    log: core.log.bind(core),
    ownSite: core.ownSite.bind(core),
    outfitter: core.outfitter.bind(core),
    get sessions() {
      return core.sessions;
    },
    set sessions(value) {
      core.sessions = value;
    },
    get shipUid() {
      return features.docks.shipUid;
    },
    get slotOf() {
      return features.docks.slotOf;
    },
    get stored() {
      return features.docks.stored;
    },
    toast: core.toast.bind(core),
    get uid() {
      return features.hangar.uid;
    },
    get unassign() {
      return features.docks.unassign;
    },
    get unwingOfficer() {
      return features.docks.unwingOfficer;
    },
    get wingMax() {
      return features.docks.wingMax;
    },
    get wingOfficerAt() {
      return features.docks.wingOfficerAt;
    },
    get wingRepair() {
      return features.docks.wingRepair;
    },
    yard: core.yard.bind(core),
    you: core.you.bind(core),
  };
  features.docks = bindOperations(DocksOperations, docksCapabilities);
  /** @type {LivingCapabilities} */
  const livingCapabilities = {
    get _livingStarted() {
      return core._livingStarted;
    },
    set _livingStarted(value) {
      core._livingStarted = value;
    },
    get _mkt() {
      return core._mkt;
    },
    set _mkt(value) {
      core._mkt = value;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get impact() {
      return features.living.impact;
    },
    get livingInit() {
      return features.living.livingInit;
    },
    log: core.log.bind(core),
    get marketSystems() {
      return features.living.marketSystems;
    },
    get news() {
      return features.rivals.news;
    },
    get resolveState() {
      return features.living.resolveState;
    },
    get stateOf() {
      return features.living.stateOf;
    },
    get stateProgress() {
      return features.living.stateProgress;
    },
    toast: core.toast.bind(core),
    get warEnemy() {
      return features.living.warEnemy;
    },
    get worldKey() {
      return core.worldKey;
    },
    set worldKey(value) {
      core.worldKey = value;
    },
    you: core.you.bind(core),
  };
  features.living = bindOperations(LivingOperations, livingCapabilities);
  /** @type {QuestsCapabilities} */
  const questsCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get chainReward() {
      return features.quests.chainReward;
    },
    get contactAt() {
      return features.quests.contactAt;
    },
    get contactStory() {
      return features.quests.contactStory;
    },
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get fill() {
      return features.quests.fill;
    },
    holdUsed: core.holdUsed.bind(core),
    landed: core.landed.bind(core),
    log: core.log.bind(core),
    market: core.market.bind(core),
    get questFail() {
      return features.quests.questFail;
    },
    get questFinish() {
      return features.quests.questFinish;
    },
    get questInit() {
      return features.quests.questInit;
    },
    get questPlan() {
      return features.quests.questPlan;
    },
    get questPush() {
      return features.quests.questPush;
    },
    get questRewardText() {
      return features.quests.questRewardText;
    },
    get questStepJob() {
      return features.quests.questStepJob;
    },
    send: core.send.bind(core),
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get stateOf() {
      return features.living.stateOf;
    },
    get stats() {
      return features.shipStats.stats;
    },
    toast: core.toast.bind(core),
    get uid() {
      return features.hangar.uid;
    },
    you: core.you.bind(core),
  };
  features.quests = bindOperations(QuestOperations, questsCapabilities);
  /** @type {CoopCapabilities} */
  const coopCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get armadaChat() {
      return features.coop.armadaChat;
    },
    get armadaLeave() {
      return features.coop.armadaLeave;
    },
    get armadaNear() {
      return features.coop.armadaNear;
    },
    get armadaOf() {
      return features.coop.armadaOf;
    },
    get armadaPayload() {
      return features.coop.armadaPayload;
    },
    get armadaPush() {
      return features.coop.armadaPush;
    },
    get armadaRefresh() {
      return features.coop.armadaRefresh;
    },
    get atOwnStation() {
      return features.coop.atOwnStation;
    },
    get blocked() {
      return features.coop.blocked;
    },
    broadcast: core.broadcast.bind(core),
    get db() {
      return core.db;
    },
    set db(value) {
      core.db = value;
    },
    get dm() {
      return features.coop.dm;
    },
    get drop() {
      return features.coop.drop;
    },
    get duelEnd() {
      return features.coop.duelEnd;
    },
    get duelOf() {
      return features.coop.duelOf;
    },
    get duelOut() {
      return features.coop.duelOut;
    },
    get duelSay() {
      return features.coop.duelSay;
    },
    get duelSide() {
      return features.coop.duelSide;
    },
    get duelTick() {
      return features.coop.duelTick;
    },
    get dueling() {
      return features.coop.dueling;
    },
    get duels() {
      return core.duels;
    },
    set duels(value) {
      core.duels = value;
    },
    get goal() {
      return features.fronts.goal;
    },
    get has() {
      return features.coop.has;
    },
    holdUsed: core.holdUsed.bind(core),
    landed: core.landed.bind(core),
    get live() {
      return core.live;
    },
    set live(value) {
      core.live = value;
    },
    log: core.log.bind(core),
    get mods() {
      return features.fronts.mods;
    },
    get nextCoopId() {
      return core.nextCoopId;
    },
    set nextCoopId(value) {
      core.nextCoopId = value;
    },
    get notify() {
      return features.frontier.notify;
    },
    get officerXp() {
      return features.hangar.officerXp;
    },
    ownSite: core.ownSite.bind(core),
    get presence() {
      return features.coop.presence;
    },
    get pushSocial() {
      return features.coop.pushSocial;
    },
    get rescueTick() {
      return features.coop.rescueTick;
    },
    send: core.send.bind(core),
    get sessionOf() {
      return features.sessions.sessionOf;
    },
    get sessions() {
      return core.sessions;
    },
    set sessions(value) {
      core.sessions = value;
    },
    get socialInit() {
      return features.coop.socialInit;
    },
    get socialOp() {
      return features.coop.socialOp;
    },
    get socialPayload() {
      return features.coop.socialPayload;
    },
    get solo() {
      return core.solo;
    },
    set solo(value) {
      core.solo = value;
    },
    get spaces() {
      return core.spaces;
    },
    set spaces(value) {
      core.spaces = value;
    },
    get stats() {
      return features.shipStats.stats;
    },
    get statusOf() {
      return features.coop.statusOf;
    },
    toast: core.toast.bind(core),
    get tradeCancel() {
      return features.coop.tradeCancel;
    },
    get tradeClean() {
      return features.coop.tradeClean;
    },
    get tradeDo() {
      return features.coop.tradeDo;
    },
    get tradePush() {
      return features.coop.tradePush;
    },
    get trades() {
      return core.trades;
    },
    set trades(value) {
      core.trades = value;
    },
    you: core.you.bind(core),
  };
  features.coop = bindOperations(CoopOperations, coopCapabilities);
  features.bonuses = { bonus: features.specialists.bonus };
  features.shipStats = { stats: features.fronts.stats };
  features.world = { worldPayload: features.frontier.worldPayload };
  features.sessions = { sessionOf: features.coop.sessionOf };
  /** @type {import('./mining-contracts.js').MiningCapabilities} */
  const miningCapabilities = {
    get db() {
      return core.db;
    },
    paused() {
      return !!core.paused;
    },
    get endTick() {
      return features.mining.endTick;
    },
    get bonus() {
      return features.bonuses.bonus;
    },
    get mods() {
      return features.fronts.mods;
    },
    get pressureExtract() {
      return features.pressure.extracted;
    },
    get pressureWork() {
      return features.pressure.work;
    },
    get pressureRegrow() {
      return features.pressure.regrow;
    },
    dredgeBlueprint(captain, chance) {
      const s = features.sessions.sessionOf(captain);
      if (s) features.specialists.specGain(s, 'star_dredge', 0, chance);
      else {
        const d = core.db.get(captain);
        if (d && Math.random() < chance) {
          d.bp ??= {};
          d.bp[815] = (d.bp[815] || 0) + 1;
          core.db.touch();
        }
      }
    },
    get specOnMine() {
      return features.specialists.specOnMine;
    },
  };
  features.mining = bindOperations(MiningOperations, miningCapabilities);
  /** @type {import('./refinery-contracts.js').RefineryCapabilities} */
  const refineryCapabilities = {
    get db() {
      return core.db;
    },
    now: () => Date.now(),
    paused: () => !!core.paused,
    room: (d) => Math.max(0, (features.shipStats.stats(d)?.cargo || 0) - core.holdUsed(d)),
    fuelCapacity: (d) => features.shipStats.stats(d)?.fuel || 0,
    access(d, port) {
      const p = /** @type {import('./game.js').StellarBody} */ (STELLARS[port]),
        ent = features.sessions.sessionOf(d.name)?.ent;
      if (!p) return { available: false, home: false, faction: '', near: false };
      const home = !!(p.site && core.ownSite(d, p) && (d.station?.ops || 0) >= 1),
        faction = p.outlaw ? 'outlaw' : SYS[p.system].faction,
        eligible = home || (!p.site && p.svc.includes('T') && p.svc.includes('O')),
        allowed =
          p.outlaw || (d.rep?.[faction] || 0) > -30 || (d.landPass?.[port] || 0) > Date.now(),
        near =
          p.system === d.sys &&
          (d.stellar === port || !!(ent && Math.hypot(ent.x - p.x, ent.y - p.y) <= p.r + 500));
      return { available: !!(eligible && allowed), home, faction, near };
    },
    pricing(d, port, cid, now) {
      const p = /** @type {import('./game.js').StellarBody} */ (STELLARS[port]);
      if (!p) throw Error('Unknown port.');
      const pr0 = price(p.site ? { ...p, prices: SITE_PRICES } : p, cid, now),
        fallback = COMMODITIES.find((c) => c.id === cid)?.base;
      if (pr0 === null && !fallback) throw Error('Unknown commodity.');
      const flash = p.site ? 1 : features.rivals.flashMult(p.id, cid),
        living = p.site ? 1 : features.living.livingMult(p, cid),
        pr = Math.round((pr0 ?? fallback ?? 0) * flash * living),
        bonus = features.bonuses.bonus(d).tradePct || 0,
        sell = features.fronts.mods(p.system).sell;
      return {
        ask: purchaseUnit(pr, 1, bonus, !!p.site),
        bid: saleValue(pr, { common: 1, rich: 0, pure: 0 }, bonus, !!p.site, sell),
        fingerprint: JSON.stringify([pr, bonus, sell, flash, living, pr0 === null]),
      };
    },
    rushProgress(s, event, delivered) {
      const st = features.living.stateOf(s.data.sys);
      if (!st || st.kind !== 'rush' || String(st.until) !== event) return;
      const old = Number(st.miningOrderGot) || 0;
      if (delivered <= old) return;
      st.miningOrderGot = delivered;
      features.living.stateProgress(s, s.data.sys, 'cid:ore', delivered - old);
      try {
        core.db.flush();
      } catch (e) {
        core.db.economicFrozen = true;
        throw e;
      }
    },
    rush(sys) {
      const st = features.living.stateOf(sys);
      return st?.kind === 'rush' ? { id: String(st.until), until: Number(st.until) } : null;
    },
    get payload() {
      return features.refinery.payload;
    },
    refresh(s) {
      core.you(s);
      if (s.data.stellar) core.landed(s);
    },
    send: core.send.bind(core),
    toast: core.toast.bind(core),
  };
  features.refinery = bindOperations(RefineryOperations, refineryCapabilities);
  /** @type {import('./mining-pressure-contracts.js').PressureCapabilities} */
  const pressureCapabilities = {
    get db() {
      return core.db;
    },
    sessions: () => core.sessions.values(),
    newcomer: (d) => !!core.newcomer(d),
    rush: (sys) => features.living.stateOf(sys)?.kind === 'rush',
    toast: core.toast.bind(core),
  };
  features.pressure = bindOperations(MiningPressureOperations, pressureCapabilities);
  /** @type {import('./industrial-contracts.js').IndustrialCapabilities} */
  const industrialCapabilities = {
    get db() {
      return core.db;
    },
    paused: () => !!core.paused,
    room: (d) => Math.max(0, (features.shipStats.stats(d)?.cargo || 0) - core.holdUsed(d)),
    get power() {
      return features.specialists.power;
    },
    get sweep() {
      return features.mining.sweep;
    },
    loot: core.onLoot.bind(core),
    refresh: core.you.bind(core),
    toast: core.toast.bind(core),
  };
  features.industrial = bindOperations(IndustrialOperations, industrialCapabilities);
  return Object.freeze(features);
}
