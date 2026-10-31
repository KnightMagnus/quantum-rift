import { createFrontierState, type FrontierState } from './frontier-state.ts';
import type { IndexCapabilities } from './index-worksite.ts';
import { IndexFleetOperations } from './index-fleet.ts';
import type { IndexFleetCapabilities } from './index-fleet.ts';
import type { NhalCapabilities } from './nhal.ts';
import { NhalOperations } from './nhal.ts';
import { IndexOperations } from './index-worksite.ts';
import type { InvasionBoss } from '../shared/fronts.ts';
import type { Entity, Space } from './space.ts';
import type { CoopOperations } from './coop-contracts.ts';

import type { CombatSession } from './combat-assist.ts';
import type { BoundOperations } from './feature-service.ts';
import type { Game, StellarBody } from './game.ts';
import type { IndustrialCapabilities } from './industrial-contracts.ts';
import type { MiningCapabilities } from './mining-contracts.ts';
import type { PressureCapabilities } from './mining-pressure-contracts.ts';
import type { RefineryCapabilities, RefineryPlayer } from './refinery-contracts.ts';
import type { TowCapabilities } from './towing-contracts.ts';
/** Infrastructure references are late-bound reads, not feature replacement hooks. */
type FeatureCore = Omit<Game, 'db' | 'sessions' | 'spaces'> &
  Readonly<Pick<Game, 'db' | 'sessions' | 'spaces'>>;

export type FeatureServices = {
  index: BoundOperations<typeof IndexOperations>;
  nhal: BoundOperations<typeof NhalOperations>;
  indexFleet: BoundOperations<typeof IndexFleetOperations>;
  towing: BoundOperations<typeof TowingOperations>;
  industrial: BoundOperations<typeof IndustrialOperations>;
  mining: BoundOperations<typeof MiningOperations>;
  refinery: BoundOperations<typeof RefineryOperations>;
  pressure: BoundOperations<typeof MiningPressureOperations>;
  hangar: BoundOperations<typeof HangarOperations>;
  fronts: BoundOperations<typeof FrontsOperations>;
  frontier: BoundOperations<typeof FrontierOperations>;
  specialists: BoundOperations<typeof SpecialistOperations>;
  hostile: BoundOperations<typeof HostileOperations>;
  story: BoundOperations<typeof StoryOperations>;
  rivals: BoundOperations<typeof RivalsOperations>;
  hail: BoundOperations<typeof HailOperations>;
  fleetcmd: BoundOperations<typeof FleetCmdOperations>;
  syndicate: BoundOperations<typeof SyndicateOperations>;
  arcs: BoundOperations<typeof ArcsOperations>;
  docks: BoundOperations<typeof DocksOperations>;
  living: BoundOperations<typeof LivingOperations>;
  quests: BoundOperations<typeof QuestOperations>;
  coop: BoundOperations<typeof CoopImplementation>;
  bonuses: Pick<BoundOperations<typeof SpecialistOperations>, 'bonus'>;
  shipStats: Pick<BoundOperations<typeof FrontsOperations>, 'stats'>;
  world: Pick<BoundOperations<typeof FrontierOperations>, 'worldPayload'>;
  sessions: Pick<BoundOperations<typeof CoopImplementation>, 'sessionOf'>;
};
export type HangarCapabilities = Pick<
  FeatureCore,
  | 'A'
  | 'holdUsed'
  | 'db'
  | 'hasMats'
  | 'landed'
  | 'live'
  | 'log'
  | 'ownSite'
  | 'spaces'
  | 'takeMats'
  | 'toast'
  | 'tut'
  | 'you'
> &
  Pick<BoundOperations<ArcsOperations>, 'arcProgress'> &
  Pick<
    BoundOperations<HangarOperations>,
    | 'barOffers'
    | 'bays'
    | 'dockSlots'
    | 'officerXp'
    | 'researchChain'
    | 'resolveShuttle'
    | 'shuttleBoard'
    | 'shuttleChance'
    | 'shuttleReward'
    | 'shuttleTraffic'
    | 'startQueued'
    | 'storedValue'
    | 'uid'
  > &
  Pick<BoundOperations<SpecialistOperations>, 'bonus' | 'flying' | 'power' | 'specOnBoard'> &
  Pick<BoundOperations<DocksOperations>, 'docksOp' | 'shipUid' | 'unassign' | 'unwingOfficer'> &
  Pick<BoundOperations<FrontsOperations>, 'goal' | 'mods' | 'stats'> &
  Pick<BoundOperations<FrontierOperations>, 'notify'> &
  Pick<BoundOperations<CoopOperations>, 'rescueBoard'> &
  Pick<BoundOperations<StoryOperations>, 'storyProgress'> &
  Pick<BoundOperations<SyndicateOperations>, 'synGain'>;
export type FrontsCapabilities = {
  /** Read the Fronts-owned six-hour anomaly cache without exposing cache state. */
  readonly readAnomalies: () => Record<string, string>;
  /** Last invasion window considered by this Fronts service. */
  lastInvWin: number;
  /** Current live encounter owned by this Fronts service; never persisted. */
  invasion:
    | {
        /** System containing the encounter. */
        sys: string;
        /** Catalog definition used for presentation and rewards. */
        boss: InvasionBoss;
        /** Wall-clock expiry in milliseconds. */
        until: number;
        /** Boss identity tracked by damage and removal handlers. */
        ent: Entity;
        /** Live space pinned until the encounter ends. */
        sp: Space;
      }
    | null
    | undefined;
} & Pick<
  FeatureCore,
  | 'ownSite'
  | 'outfitInstallProblem'
  | 'A'
  | 'platform'
  | 'broadcast'
  | 'db'
  | 'log'
  | 'sessions'
  | 'spaces'
  | 'toast'
  | 'you'
> &
  Pick<
    BoundOperations<FrontsOperations>,
    | 'anomalies'
    | 'event'
    | 'goal'
    | 'goalsFor'
    | 'pushWorld'
    | 'startInvasion'
    | 'storeFor'
    | 'token'
  > &
  Pick<BoundOperations<CoopOperations>, 'armadaBonus' | 'refreshPlayer'> &
  Pick<BoundOperations<SpecialistOperations>, 'bonus'> &
  Pick<BoundOperations<HangarOperations>, 'officerXp' | 'uid'> &
  Pick<BoundOperations<LivingOperations>, 'statesPayload'> &
  Pick<BoundOperations<FrontierOperations>, 'worldPayload'>;
export type FrontierCapabilities = { readonly frontierState: FrontierState } & Pick<
  FeatureCore,
  | 'A'
  | 'holdUsed'
  | 'broadcast'
  | 'db'
  | 'hasMats'
  | 'landed'
  | 'live'
  | 'log'
  | 'send'
  | 'sessions'
  | 'spaces'
  | 'spawnPlayer'
  | 'takeMats'
  | 'toast'
  | 'you'
> &
  Pick<
    BoundOperations<FrontierOperations>,
    | 'accrue'
    | 'arenaCheck'
    | 'arenaExit'
    | 'coloniesOf'
    | 'colonizable'
    | 'colonyBuffs'
    | 'colonyMax'
    | 'defenseRating'
    | 'deliver'
    | 'itemName'
    | 'matchOrder'
    | 'notify'
    | 'pay'
    | 'raidStrength'
    | 'refundOrder'
    | 'resolveRaid'
    | 'sameItem'
    | 'startWave'
    | 'tryMatch'
  > &
  Pick<BoundOperations<SpecialistOperations>, 'flying' | 'specOnRaid'> &
  Pick<BoundOperations<FrontsOperations>, 'pushWorld' | 'stats'> &
  Pick<BoundOperations<RivalsOperations>, 'rivalBoard'> &
  Pick<BoundOperations<CoopOperations>, 'sessionOf'> & {
    frontsBonus: OmitThisParameter<typeof FrontsOperations.bonus>;
    frontsWorldPayload: () => import('./fronts.ts').WorldPayload;
  };
export type SpecialistsCapabilities = Pick<
  FeatureCore,
  | 'A'
  | 'fitsJobs'
  | 'holdUsed'
  | 'broadcast'
  | 'db'
  | 'hasMats'
  | 'landed'
  | 'log'
  | 'ownSite'
  | 'takeMats'
  | 'toast'
  | 'tradeIn'
  | 'you'
> &
  Pick<BoundOperations<FrontsOperations>, 'anomalies'> &
  Pick<
    BoundOperations<SpecialistOperations>,
    'flying' | 'power' | 'specGain' | 'specInit' | 'specOf'
  > &
  Pick<BoundOperations<DocksOperations>, 'wingHulls'> & {
    frontierBonus: OmitThisParameter<typeof FrontierOperations.bonus>;
  };
export type HostileCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'depart' | 'live' | 'log' | 'ownSite' | 'spaces' | 'toast' | 'tut' | 'you'
> &
  Pick<BoundOperations<SpecialistOperations>, 'bonus' | 'specInit'> &
  Pick<BoundOperations<CoopOperations>, 'holdoutAnnounce' | 'holdoutHelpers' | 'holdoutReward'> &
  Pick<BoundOperations<HostileOperations>, 'holdoutEnd' | 'hostInit' | 'myPower'> &
  Pick<BoundOperations<FrontsOperations>, 'mods'> &
  Pick<BoundOperations<FrontierOperations>, 'notify'> &
  Pick<BoundOperations<DocksOperations>, 'activeWings' | 'wingBonus'>;
export type StoryCapabilities = Pick<
  FeatureCore,
  | 'A'
  | 'broadcast'
  | 'db'
  | 'landed'
  | 'depart'
  | 'beginTableDeparture'
  | 'canBeginTableDeparture'
  | 'log'
  | 'send'
  | 'toast'
  | 'tradeIn'
  | 'you'
> &
  Pick<BoundOperations<HangarOperations>, 'dockSlots'> &
  Pick<BoundOperations<DocksOperations>, 'leadChanged'> &
  Pick<
    BoundOperations<StoryOperations>,
    'storyComplete' | 'storyDone' | 'storyGift' | 'storyInit' | 'storyOffer'
  > &
  Pick<BoundOperations<QuestOperations>, 'questReconcile'> & {
    nhal: FeatureServices['nhal'];
  } & Pick<BoundOperations<FrontsOperations>, 'stats'>;
export type RivalsCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'live' | 'log' | 'rivalEnts' | 'sessions' | 'spaces' | 'toast'
> &
  Pick<
    BoundOperations<RivalsOperations>,
    'news' | 'relOf' | 'rivalRel' | 'rivalState' | 'spawnHunters'
  >;
export type HailCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'hails' | 'log' | 'send' | 'spaces' | 'toast' | 'you'
> &
  Pick<
    BoundOperations<HailOperations>,
    'bribeCost' | 'hailPlanet' | 'hailPlanetOpt' | 'hailTarget'
  > & { index: FeatureServices['index']; indexFleet: FeatureServices['indexFleet'] } & Pick<
    BoundOperations<HostileOperations>,
    'myPower'
  > &
  Pick<BoundOperations<RivalsOperations>, 'relOf' | 'rivalRel'>;
export type FleetCommandsCapabilities = import('./contracts.ts').FleetCommandsCapabilities;
export type SyndicateCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'landed' | 'log' | 'toast' | 'you'
> &
  Pick<BoundOperations<SyndicateOperations>, 'bankAt' | 'bankInfo' | 'blackMarketAt' | 'synInit'> &
  Pick<BoundOperations<FrontierOperations>, 'notify'>;
export type ArcsCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'landed' | 'log' | 'send' | 'toast' | 'you'
> &
  Pick<
    BoundOperations<ArcsOperations>,
    'arcComplete' | 'arcOffer' | 'arcOffersAt' | 'arcState' | 'arcsInit' | 'expeditionNext'
  >;
export type DocksCapabilities = Pick<
  FeatureCore,
  | 'A'
  | 'db'
  | 'fitsJobs'
  | 'jobCargo'
  | 'landed'
  | 'log'
  | 'ownSite'
  | 'outfitter'
  | 'sessions'
  | 'toast'
  | 'yard'
  | 'you'
> &
  Pick<
    BoundOperations<DocksOperations>,
    | 'activeWings'
    | 'cleanBridge'
    | 'dockCount'
    | 'docksInit'
    | 'shipUid'
    | 'slotOf'
    | 'stored'
    | 'unassign'
    | 'unwingOfficer'
    | 'wingMax'
    | 'wingOfficerAt'
    | 'wingRepair'
  > &
  Pick<BoundOperations<HangarOperations>, 'dockSlots' | 'hangarInit' | 'uid'>;
export type LivingCapabilities = {
  /** Whether this service has completed its initial population tick. */
  _livingStarted: boolean | undefined;
  /** Read the service-owned trade-port cache without exposing its storage. */
  readonly readMarketSystems: () => string[];
} & Pick<FeatureCore, 'db' | 'log' | 'toast' | 'worldKey' | 'you'> &
  Pick<
    BoundOperations<LivingOperations>,
    | 'impact'
    | 'livingInit'
    | 'marketSystems'
    | 'resolveState'
    | 'stateOf'
    | 'stateProgress'
    | 'warEnemy'
  > &
  Pick<BoundOperations<RivalsOperations>, 'news'>;
export type QuestsCapabilities = Pick<
  FeatureCore,
  'A' | 'db' | 'holdUsed' | 'landed' | 'log' | 'market' | 'send' | 'spaces' | 'toast' | 'you'
> &
  Pick<
    BoundOperations<QuestOperations>,
    | 'chainReward'
    | 'contactAt'
    | 'contactStory'
    | 'fill'
    | 'questFail'
    | 'questReconcile'
    | 'questFinish'
    | 'questInit'
    | 'questPlan'
    | 'questPush'
    | 'questRewardText'
    | 'questStepJob'
  > &
  Pick<BoundOperations<LivingOperations>, 'stateOf'> &
  Pick<BoundOperations<FrontsOperations>, 'stats'> &
  Pick<BoundOperations<HangarOperations>, 'uid'>;
export type CoopCapabilities = Pick<
  FeatureCore,
  | 'A'
  | 'platform'
  | 'broadcast'
  | 'db'
  | 'duels'
  | 'holdUsed'
  | 'landed'
  | 'live'
  | 'log'
  | 'nextCoopId'
  | 'ownSite'
  | 'send'
  | 'sessions'
  | 'solo'
  | 'spaces'
  | 'toast'
  | 'trades'
  | 'you'
> &
  Pick<
    BoundOperations<CoopOperations>,
    | 'armadaChat'
    | 'armadaLeave'
    | 'armadaNear'
    | 'armadaOf'
    | 'armadaPayload'
    | 'armadaPush'
    | 'armadaRefresh'
    | 'atOwnStation'
    | 'blocked'
    | 'dm'
    | 'drop'
    | 'duelEnd'
    | 'duelOf'
    | 'duelOut'
    | 'duelSay'
    | 'duelSide'
    | 'duelTick'
    | 'dueling'
    | 'has'
    | 'presence'
    | 'pushSocial'
    | 'rescueTick'
    | 'sessionOf'
    | 'socialInit'
    | 'socialOp'
    | 'socialPayload'
    | 'statusOf'
    | 'tradeCancel'
    | 'tradeClean'
    | 'tradeDo'
    | 'tradePush'
  > &
  Pick<BoundOperations<FrontsOperations>, 'goal' | 'mods' | 'stats'> &
  Pick<BoundOperations<FrontierOperations>, 'notify'> &
  Pick<BoundOperations<HangarOperations>, 'officerXp'>;
// Explicit feature composition. No method is installed on Game or another feature.
import { TowingOperations } from './towing.ts';
import { IndustrialOperations } from './industrial.ts';
import { MiningOperations } from './mining.ts';
import { RefineryOperations } from './refinery.ts';
import { MiningPressureOperations } from './mining-pressure.ts';
import { SYS as systemsById, STELLARS, SITE_PRICES, COMMODITIES } from '../shared/galaxy.ts';
import { price } from '../shared/rules.ts';
import { landingRefused } from '../shared/reputation.ts';
import { purchaseUnit, saleValue } from './trade-pricing.ts';
import { bindOperations } from './feature-service.ts';
import { HangarOperations } from './hangar.ts';
import { createAnomalyReader, FrontsOperations } from './fronts.ts';
import { FrontierOperations } from './frontier.ts';
import { SpecialistOperations } from './specialists.ts';
import { HostileOperations } from './hostile.ts';
import { StoryOperations } from './story.ts';
import { RivalsOperations } from './rivals.ts';
import { HailOperations } from './hail.ts';
import { FleetCmdOperations } from './fleetcmd.ts';
import { SyndicateOperations } from './syndicate.ts';
import { ArcsOperations } from './arcs.ts';
import { DocksOperations } from './docks.ts';
import { LivingOperations, createMarketSystemReader } from './living.ts';
import { QuestOperations } from './quests.ts';
import { CoopOperations as CoopImplementation } from './coop.ts';

export function createFeatures(core: Game): FeatureServices {
  const features: FeatureServices = {} as FeatureServices;
  const indexCapabilities: IndexCapabilities = {
    extract: (space, rock, damage) => features.mining.ordinary(space, rock, damage, null),
    get db() {
      return core.db;
    },
    sessions: () => core.sessions.values(),
    toast: core.toast.bind(core),
  };
  features.index = bindOperations(IndexOperations, indexCapabilities);
  const indexFleetCapabilities: IndexFleetCapabilities = {
    fleets: () => (core.db.world.indexFleets ||= {}),
    clock: () => core.db.world.mining?.clock || 0,
    key: (entity) => (entity.player ? core.db.key(entity.player.s.data.name) : null),
    provoked: (space, visitor) =>
      visitor.player?.s.data.story?.flags?.index_ending === 'silence' ||
      (space.id === 'glasswake' &&
        !!visitor.player &&
        (core.db.world.indexWorksite?.offenders[core.db.key(visitor.player.s.data.name)]?.until ||
          0) > (core.db.world.mining?.clock || 0)),
    extract: (space, rock, damage) => features.mining.ordinary(space, rock, damage, null),
    virginRock: (space, site) =>
      core.db.world.mining?.systems[space.id]?.rocks.find(
        (rock) =>
          !rock.down &&
          !rock.dredgeToken &&
          !rock.work &&
          rock.hp === rock.max &&
          rock.stage === 0 &&
          !rock.heat &&
          !Object.keys(rock.seen).length &&
          !rock.leases.length &&
          Math.hypot(rock.x - site.x, rock.y - site.y) < 800,
      ) || null,
    touch: () => core.db.touch(),
    toast: core.toast.bind(core),
  };
  features.indexFleet = bindOperations(IndexFleetOperations, indexFleetCapabilities);
  const nhalCapabilities: NhalCapabilities = {
    populations: () => (core.db.world.nhal ||= {}),
    clock: () => core.db.world.mining?.clock || 0,
    touch: () => core.db.touch(),
    toast: core.toast.bind(core),
  };
  features.nhal = bindOperations(NhalOperations, nhalCapabilities);

  const hangarCapabilities: HangarCapabilities = {
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

  const readAnomalies = createAnomalyReader();
  let lastInvWin: number;
  let invasion: FrontsCapabilities['invasion'];
  const frontsCapabilities: FrontsCapabilities = {
    ownSite: core.ownSite.bind(core),
    outfitInstallProblem: core.outfitInstallProblem.bind(core),
    get platform() {
      return core.platform;
    },
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get readAnomalies() {
      return readAnomalies;
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
      return invasion;
    },
    set invasion(value) {
      invasion = value;
    },
    get lastInvWin() {
      return lastInvWin;
    },
    set lastInvWin(value) {
      lastInvWin = value;
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
    get spaces() {
      return core.spaces;
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

  const frontierState = createFrontierState();
  const frontierCapabilities: FrontierCapabilities = {
    get frontierState() {
      return frontierState;
    },
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
    get spaces() {
      return core.spaces;
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

    you: core.you.bind(core),
  };
  features.frontier = bindOperations(FrontierOperations, frontierCapabilities);

  const specialistsCapabilities: SpecialistsCapabilities = {
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

  const hostileCapabilities: HostileCapabilities = {
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
    get specInit() {
      return features.specialists.specInit;
    },
    toast: core.toast.bind(core),
    tut: core.tut.bind(core),
    get activeWings() {
      return features.docks.activeWings;
    },
    get wingBonus() {
      return features.docks.wingBonus;
    },
    you: core.you.bind(core),
  };
  features.hostile = bindOperations(HostileOperations, hostileCapabilities);

  const storyCapabilities: StoryCapabilities = {
    get questReconcile() {
      return features.quests.questReconcile;
    },
    get stats() {
      return features.fronts.stats;
    },
    depart: core.depart.bind(core),
    beginTableDeparture: core.beginTableDeparture.bind(core),
    canBeginTableDeparture: core.canBeginTableDeparture.bind(core),
    get nhal() {
      return features.nhal;
    },
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

  const rivalsCapabilities: RivalsCapabilities = {
    get A() {
      return core.A;
    },
    set A(value) {
      core.A = value;
    },
    get db() {
      return core.db;
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
    get spaces() {
      return core.spaces;
    },
    get spawnHunters() {
      return features.rivals.spawnHunters;
    },
    toast: core.toast.bind(core),
  };
  features.rivals = bindOperations(RivalsOperations, rivalsCapabilities);

  const hailCapabilities: HailCapabilities = {
    get index() {
      return features.index;
    },
    get indexFleet() {
      return features.indexFleet;
    },
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
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.hail = bindOperations(HailOperations, hailCapabilities);

  const fleetcmdCapabilities: FleetCommandsCapabilities = {
    holdUsed: core.holdUsed.bind(core),
    send: core.send.bind(core),
    get spaces() {
      return core.spaces;
    },
    get stats() {
      return features.shipStats.stats;
    },
    toast: core.toast.bind(core),
    you: core.you.bind(core),
  };
  features.fleetcmd = bindOperations(FleetCmdOperations, fleetcmdCapabilities);

  const syndicateCapabilities: SyndicateCapabilities = {
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

  const arcsCapabilities: ArcsCapabilities = {
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

  const docksCapabilities: DocksCapabilities = {
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

  let livingStarted: boolean | undefined;
  const readMarketSystems = createMarketSystemReader();
  const livingCapabilities: LivingCapabilities = {
    get readMarketSystems() {
      return readMarketSystems;
    },
    get _livingStarted() {
      return livingStarted;
    },
    set _livingStarted(value) {
      livingStarted = value;
    },
    get db() {
      return core.db;
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

  const questsCapabilities: QuestsCapabilities = {
    get questReconcile() {
      return features.quests.questReconcile;
    },
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

  const coopCapabilities: CoopCapabilities = {
    get platform() {
      return core.platform;
    },
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
  features.coop = bindOperations(CoopImplementation, coopCapabilities);
  features.bonuses = { bonus: features.specialists.bonus };
  features.shipStats = { stats: features.fronts.stats };
  features.world = { worldPayload: features.frontier.worldPayload };
  features.sessions = { sessionOf: features.coop.sessionOf };

  const miningCapabilities: MiningCapabilities = {
    indexMining: (system, rock, captain) => {
      if (system === 'glasswake') features.index.mining(system, rock, captain);
      const session = [...core.sessions.values()].find(
        (candidate) => candidate.ent && core.db.key(candidate.data.name) === captain,
      );
      if (session?.ent) features.indexFleet.mining(core.spaces[system], rock, session.ent);
    },
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
      const session = features.sessions.sessionOf(captain);
      if (session) features.specialists.specGain(session, 'star_dredge', 0, chance);
      else {
        const playerAccount = core.db.get(captain);
        if (playerAccount && Math.random() < chance) {
          playerAccount.bp ??= {};
          playerAccount.bp[815] = (playerAccount.bp[815] || 0) + 1;
          core.db.touch();
        }
      }
    },
    get specOnMine() {
      return features.specialists.specOnMine;
    },
  };
  features.mining = bindOperations(MiningOperations, miningCapabilities);

  const refineryCapabilities: RefineryCapabilities = {
    get db() {
      return core.db;
    },
    now: () => Date.now(),
    paused: () => !!core.paused,
    room: (playerData) =>
      Math.max(0, (features.shipStats.stats(playerData)?.cargo || 0) - core.holdUsed(playerData)),
    fuelCapacity: (playerData) => features.shipStats.stats(playerData)?.fuel || 0,
    access(playerData, port) {
      const stellarBody = STELLARS[port] as StellarBody,
        entity = features.sessions.sessionOf(playerData.name)?.ent;
      if (!stellarBody) return { available: false, home: false, faction: '', near: false };
      const home = !!(
          stellarBody.site &&
          core.ownSite(playerData, stellarBody) &&
          (playerData.station?.ops || 0) >= 1
        ),
        faction = stellarBody.outlaw ? 'outlaw' : systemsById[stellarBody.system].faction,
        eligible =
          home ||
          (!stellarBody.site && stellarBody.svc.includes('T') && stellarBody.svc.includes('O')),
        allowed = !landingRefused({
          standing: playerData.rep?.[faction] || 0,
          outlawPort: !!stellarBody.outlaw,
          ownStation: core.ownSite(playerData, stellarBody),
          passExpires: playerData.landPass?.[port] || 0,
          now: Date.now(),
        }),
        near =
          stellarBody.system === playerData.sys &&
          (playerData.stellar === port ||
            !!(
              entity &&
              Math.hypot(entity.x - stellarBody.x, entity.y - stellarBody.y) <= stellarBody.r + 500
            ));
      return { available: !!(eligible && allowed), home, faction, near };
    },
    pricing(playerData, port, captainId, currentTime) {
      const stellarBody = STELLARS[port] as StellarBody;
      if (!stellarBody) throw Error('Unknown port.');
      const price2 = price(
          stellarBody.site ? { ...stellarBody, prices: SITE_PRICES } : stellarBody,
          captainId,
          currentTime,
        ),
        fallback = COMMODITIES.find((commodityDef) => commodityDef.id === captainId)?.base;
      if (price2 === null && !fallback) throw Error('Unknown commodity.');
      const flash = stellarBody.site ? 1 : features.rivals.flashMult(stellarBody.id, captainId),
        living = stellarBody.site ? 1 : features.living.livingMult(stellarBody, captainId),
        impact = stellarBody.site ? 0 : features.living.impact(stellarBody.id, captainId),
        price3 = ((price2 ?? fallback ?? 0) * flash * living) / (1 - impact),
        bonus = features.bonuses.bonus(playerData).tradePct || 0,
        sell = features.fronts.mods(stellarBody.system).sell;
      return {
        ask: purchaseUnit(price3, 1, bonus, !!stellarBody.site, sell, impact),
        bid: saleValue(
          price3,
          { common: 1, rich: 0, pure: 0 },
          bonus,
          !!stellarBody.site,
          sell,
          impact,
        ),
        fingerprint: JSON.stringify([price3, bonus, sell, flash, living, price2 === null]),
      };
    },
    rushProgress(refinerySession, event, delivered) {
      const livingState = features.living.stateOf(refinerySession.data.sys);
      if (!livingState || livingState.kind !== 'rush' || String(livingState.until) !== event)
        return;
      const previousValue = Number(livingState.miningOrderGot) || 0;
      if (delivered <= previousValue) return;
      livingState.miningOrderGot = delivered;
      features.living.stateProgress(
        refinerySession,
        refinerySession.data.sys,
        'cid:ore',
        delivered - previousValue,
      );
      try {
        core.db.flush();
      } catch (event) {
        core.db.economicFrozen = true;
        throw event;
      }
    },
    rush(starSystem) {
      const livingState = features.living.stateOf(starSystem);
      return livingState?.kind === 'rush'
        ? { id: String(livingState.until), until: Number(livingState.until) }
        : null;
    },
    get payload() {
      return features.refinery.payload;
    },
    refresh(refinerySession) {
      core.you(refinerySession);
      if (refinerySession.data.stellar) core.landed(refinerySession);
    },
    send: core.send.bind(core),
    toast: core.toast.bind(core),
  };
  features.refinery = bindOperations(RefineryOperations, refineryCapabilities);

  const pressureCapabilities: PressureCapabilities = {
    get db() {
      return core.db;
    },
    sessions: () => core.sessions.values(),
    newcomer: (playerData) => !!core.newcomer(playerData),
    rush: (starSystem) => features.living.stateOf(starSystem)?.kind === 'rush',
    toast: core.toast.bind(core),
  };
  features.pressure = bindOperations(MiningPressureOperations, pressureCapabilities);

  const industrialCapabilities: IndustrialCapabilities = {
    get db() {
      return core.db;
    },
    paused: () => !!core.paused,
    room: (playerData) =>
      Math.max(0, (features.shipStats.stats(playerData)?.cargo || 0) - core.holdUsed(playerData)),
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

  const towingCapabilities: TowCapabilities = {
    get db() {
      return core.db;
    },
    paused: () => !!core.paused,
    sessions: () => core.sessions.values(),
    refresh: core.you.bind(core),
    toast: core.toast.bind(core),
    stopCombat: (session) => {
      if (session.ent)
        core.combatAssist?.stop(session as CombatSession, 'Towing: manual flight required');
    },
    room: (playerData) =>
      Math.max(
        0,
        (features.shipStats.stats(playerData)?.cargo || 0) -
          core.holdUsed(playerData as RefineryPlayer),
      ),
    stats: (playerData) => features.shipStats.stats(playerData),
    field: (starSystem, field) => features.pressure.fieldState(starSystem, field),
  };
  features.towing = bindOperations(TowingOperations, towingCapabilities);
  return Object.freeze(features);
}
