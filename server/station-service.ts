import type { PlayerData, Session, StellarBody } from './game.ts';
import type { NetworkMessage } from './message-registry.ts';
import type { FeatureServices } from './features.ts';
import {
  STELLARS,
  SYS as systemsById,
  COMMODITIES,
  MATERIALS,
  GRADES,
  OPS as operationLevels,
  RESEARCH,
  ORE_PROCESS,
  RELOCATE,
  relocateCost,
} from '../shared/galaxy.ts';
import { credits, researchBonus } from '../shared/rules.ts';
import { TIER3_TRUCE } from '../shared/hostile.ts';
import { planTake, applyTake } from '../shared/cargo-lots.ts';

/** Only station claims and dirty marking are exposed from the live database. */
export interface StationClaimStorage {
  /** The current shared claim map; never copied into the service. */
  world: { sites: Record<string, string> };
  /** Normalize the captain's claim identity using the current store. */
  key: (name: string) => string;
  /** Mark the existing account/world checkpoint dirty. */
  touch: () => void;
}

/** Station action dependencies, resolved through the composition root's live callbacks. */
export interface StationServiceCapabilities {
  /** Current authority store; replacing Game.db must be observed. */
  readonly db: StationClaimStorage;
  /** Current Solo setting controls only the existing relocation announcement. */
  readonly solo: boolean | undefined;
  /** Advance station timers before action checks. */
  checkStation: (player: PlayerData) => void;
  /** Resolve current claim ownership. */
  siteOwner: (site: string) => PlayerData | null;
  /** Existing personal-site authorization check. */
  ownSite: (player: PlayerData, site: Pick<StellarBody, 'id' | 'site'>) => boolean;
  /** Current protection policy evaluated before a tier change. */
  newcomer: (player: PlayerData) => boolean;
  /** Check materials without mutating them. */
  hasMats: (player: PlayerData, materials: Array<[string, number, number]>) => boolean;
  /** Consume materials through the existing inventory owner. */
  takeMats: (player: PlayerData, materials: Array<[string, number, number]>) => void;
  /** Append a captain log entry. */
  log: (player: PlayerData, text: string) => void;
  /** Send a private action outcome. */
  toast: (session: Session, text: string) => void;
  /** Send the existing public station announcement. */
  broadcast: (message: object) => void;
  /** Publish current claim projections. */
  pushSites: () => void;
  /** Refresh this captain's player payload after settlement. */
  you: (session: Session) => void;
  /** Refresh the existing landed payload after player refresh. */
  landed: (session: Session) => void;
  /** Current hangar owner handles queued research. */
  queueResearch: FeatureServices['hangar']['queueResearch'];
  /** Current frontier owner handles defense construction. */
  defenseUpgrade: FeatureServices['frontier']['defenseUpgrade'];
  /** Current hangar owner handles refinery improvements. */
  refineUp: FeatureServices['hangar']['refineUp'];
  /** Cancel an active trade before the station moves or spends relocation resources. */
  tradeCancel: FeatureServices['coop']['tradeCancel'];
}

/** Station mutation owner; schedules no clock and introduces no persistence boundary. */
export interface StationService {
  /** Preserve station authorization, settlement, dirty marking and payload order. */
  operate: (session: Session, message: NetworkMessage) => void;
}

/** Use the same player/station objects; feature providers remain replaceable at the root. */
export function createStationService(capabilities: StationServiceCapabilities): StationService {
  return {
    operate(session: Session, message: NetworkMessage): void {
      const playerData = session.data,
        stellarBody2 = STELLARS[playerData.stellar!],
        stationState = playerData.station;
      if (!stellarBody2 || session.ent) return;
      capabilities.checkStation(playerData);
      if (message.op === 'claim') {
        if (!stellarBody2.site)
          return capabilities.toast(
            session,
            'Find a derelict station hull to claim. They drift in systems across the galaxy.',
          );
        if (capabilities.siteOwner(stellarBody2.id))
          return capabilities.toast(session, 'Another captain has already claimed this hull.');
        if (stationState.site)
          return capabilities.toast(
            session,
            `You already have a Personal Station in ${systemsById[STELLARS[stationState.site!].system].name}.`,
          );
        const first = !stationState.claimed;
        stationState.site = stellarBody2.id;
        stationState.claimed = true;
        stationState.refT = Date.now();
        capabilities.db.world.sites[stellarBody2.id] = capabilities.db.key(playerData.name);
        if (first) playerData.mats.alloy[0] += 1;
        capabilities.log(
          playerData,
          `Claimed a derelict station hull in ${systemsById[stellarBody2.system].name}.${first ? ' Its last crew left an Alloy I crate aboard.' : ' Your station progress moved with you.'}`,
        );
        capabilities.toast(session, 'This hull is yours. Start Station Tier 1 when ready.');
        capabilities.broadcast({
          t: 'chat',
          from: '',
          msg: `${session.name} claimed a station hull in ${systemsById[stellarBody2.system].name}.`,
        });
        capabilities.db.touch();
        capabilities.pushSites();
        capabilities.you(session);
        capabilities.landed(session);
        return;
      }
      if (!capabilities.ownSite(playerData, stellarBody2))
        return capabilities.toast(session, 'Land at your Personal Station for that.');
      switch (message.op) {
        case 'upgrade': {
          const opsLevelDef = operationLevels[stationState.ops];
          if (!stationState.claimed || !opsLevelDef) break;
          if (
            playerData.credits < opsLevelDef.cost ||
            !capabilities.hasMats(playerData, opsLevelDef.mats)
          )
            return capabilities.toast(session, 'You need the credits and materials listed.');
          playerData.credits -= opsLevelDef.cost;
          capabilities.takeMats(playerData, opsLevelDef.mats);
          const wasNewcomer = capabilities.newcomer(playerData);
          stationState.ops++;
          stationState.refT = Date.now();
          capabilities.log(
            playerData,
            `Quantum Station reached Station Tier ${stationState.ops}: ${opsLevelDef.title}.`,
          );
          capabilities.toast(
            session,
            `Station Tier ${stationState.ops} complete: ${opsLevelDef.unlock}.`,
          );
          if (stationState.ops === 3 && wasNewcomer) {
            stationState.truceEnds = {
              kills: (playerData.stats.kills || 0) + TIER3_TRUCE.kills,
              jumps: (playerData.stats.jumps || 0) + TIER3_TRUCE.jumps,
            };
            capabilities.toast(
              session,
              `Newcomer protection now winds down: it ends after ${TIER3_TRUCE.kills} kills, ${TIER3_TRUCE.jumps} jumps or once your ship reaches ${TIER3_TRUCE.power} power, whichever comes first.`,
            );
          }
          capabilities.broadcast({
            t: 'chat',
            from: '',
            msg: `${session.name}'s Personal Station reached Station Tier ${stationState.ops}.`,
          });
          capabilities.pushSites();
          break;
        }
        case 'process': {
          // ore -> material crates
          if (stationState.ops < 1)
            return capabilities.toast(session, 'Build Station Tier 1 first.');
          const oreCommodity = message.id as string,
            material = ORE_PROCESS.to[oreCommodity];
          if (!material) break;
          const have = playerData.cargo[oreCommodity] || 0,
            count = Math.min(
              Math.floor(have / ORE_PROCESS.per),
              Math.floor(playerData.credits / ORE_PROCESS.cost),
              message.all ? 99 : 1,
            );
          if (count <= 0)
            return capabilities.toast(
              session,
              `You need ${ORE_PROCESS.per} t of ${COMMODITIES.find((commodityDef) => commodityDef.id === oreCommodity)!.name} and ${credits(ORE_PROCESS.cost)} credits per crate.`,
            );
          const game = Math.min(
            4,
            ORE_PROCESS.grade[stationState.ops] + (researchBonus(stationState).processGrade || 0),
          );
          let take;
          try {
            take = planTake(
              playerData.cargo,
              playerData.cargoLots,
              oreCommodity,
              count * ORE_PROCESS.per,
              message.lots,
            );
          } catch {
            return capabilities.toast(session, 'Those cargo grades are unavailable.');
          }
          applyTake(playerData.cargo, playerData.cargoLots, take);
          playerData.credits -= count * ORE_PROCESS.cost;
          playerData.mats[material][game] += count;
          capabilities.toast(
            session,
            `Processed ${count * ORE_PROCESS.per} t into ${count} ${material} ${GRADES[game]} crate${count > 1 ? 's' : ''}.`,
          );
          break;
        }
        case 'collect': {
          if (!stationState.refUnits)
            return capabilities.toast(session, 'The Workshop has nothing ready.');
          const refUnits2 = stationState.refUnits,
            credits2 = refUnits2 * (2500 + stationState.ops * 1500);
          playerData.credits += credits2;
          stationState.refUnits = 0;
          stationState.refT = Date.now();
          const received = [];
          for (let index = 0; index < refUnits2; index++) {
            const materials = MATERIALS[Math.floor(Math.random() * 3)],
              game = Math.min(
                4,
                Math.floor(
                  Math.random() * (stationState.ops >= 4 ? 4 : stationState.ops >= 2 ? 3 : 2),
                ) + (researchBonus(stationState).refineGrade && Math.random() < 0.5 ? 1 : 0),
              );
            playerData.mats[materials][game]++;
            received.push(`${materials} ${GRADES[game]}`);
          }
          capabilities.toast(
            session,
            `Collected ${refUnits2} Workshop unit${refUnits2 > 1 ? 's' : ''}: ${credits(credits2)} credits and ${received.join(', ')}.`,
          );
          break;
        }
        case 'research': {
          if (
            stationState.active ||
            ((RESEARCH.find((researchNode) => researchNode.id === message.id) || {}).needs &&
              !stationState.done.includes(
                RESEARCH.find((researchNode) => researchNode.id === message.id)!.needs!,
              ))
          ) {
            capabilities.queueResearch(session, message.id as string);
            break;
          }
          const researchNode = RESEARCH.find((researchNode) => researchNode.id === message.id);
          if (
            !researchNode ||
            stationState.done.includes(researchNode.id) ||
            stationState.ops < researchNode.ops
          )
            break;
          if (
            playerData.credits < researchNode.cost ||
            !capabilities.hasMats(playerData, researchNode.mats)
          )
            return capabilities.toast(session, 'You need the credits and materials listed.');
          playerData.credits -= researchNode.cost;
          capabilities.takeMats(playerData, researchNode.mats);
          stationState.active = {
            id: researchNode.id,
            ends: Date.now() + researchNode.minutes * 60000,
          };
          capabilities.toast(
            session,
            `Research started: ${researchNode.name} (${researchNode.minutes} minutes).`,
          );
          break;
        }
        case 'hire':
        case 'dismiss':
          return capabilities.toast(
            session,
            'Wingmates are ships now: buy them at your station shipyard and assign them to a dock (STATION, then DOCKS).',
          ); // 2.1
        case 'unqueue':
          stationState.queue = stationState.queue!.filter((positionX) => positionX !== message.id);
          break;
        case 'defense':
          capabilities.defenseUpgrade(session);
          break;
        case 'refine':
          capabilities.refineUp(session, message.mat!, message.g! | 0, message.n! | 0);
          break;
        case 'refit':
          return capabilities.toast(session, 'Refits were retired in 2.6.');
        case 'relocate': {
          // warp the station to another unclaimed hull; you ride along
          const stellarBody = STELLARS[message.site!],
            cost = relocateCost(stationState.ops),
            wait = (stationState.relocT || 0) + RELOCATE.cooldownH * 3600000 - Date.now();
          if (!stellarBody || !stellarBody.site || stellarBody.id === stationState.site)
            return capabilities.toast(session, 'Choose an unclaimed station hull.');
          if (capabilities.siteOwner(stellarBody.id))
            return capabilities.toast(session, 'Another captain has claimed that hull.');
          if (wait > 0)
            return capabilities.toast(
              session,
              `The station's warp core is recharging: ${Math.ceil(wait / 3600000)} h left.`,
            );
          if (playerData.holdout && playerData.holdout.active)
            return capabilities.toast(session, 'Not during a Holdout.');
          if (playerData.credits < cost || !capabilities.hasMats(playerData, RELOCATE.mats))
            return capabilities.toast(
              session,
              `Relocating needs ${credits(cost)} credits and ${RELOCATE.mats.map(([firstValue, game]) => firstValue + ' ' + GRADES[game]).join(', ')}.`,
            );
          if (session.trade)
            capabilities.tradeCancel(session.trade, 'The station is warping away.');
          const from = STELLARS[stationState.site!];
          playerData.credits -= cost;
          capabilities.takeMats(playerData, RELOCATE.mats);
          delete capabilities.db.world.sites[stationState.site!];
          stationState.site = stellarBody.id;
          stationState.relocT = Date.now();
          capabilities.db.world.sites[stellarBody.id] = capabilities.db.key(playerData.name);
          playerData.stellar = stellarBody.id;
          playerData.sys = stellarBody.system;
          if (from.system !== stellarBody.system) session.retaliationVisit = undefined;
          capabilities.log(
            playerData,
            `Warped your Personal Station from ${systemsById[from.system].name} to ${systemsById[stellarBody.system].name}. Everything came along.`,
          );
          capabilities.toast(
            session,
            `Station warp complete: welcome to ${systemsById[stellarBody.system].name}.`,
          );
          if (!capabilities.solo)
            capabilities.broadcast({
              t: 'chat',
              from: '',
              msg: `${playerData.name}'s Personal Station warped from ${systemsById[from.system].name} to ${systemsById[stellarBody.system].name}. The old hull is free to claim.`,
            });
          capabilities.pushSites();
          break;
        }
      }
      capabilities.db.touch();
      capabilities.you(session);
      capabilities.landed(session);
    },
  };
}
