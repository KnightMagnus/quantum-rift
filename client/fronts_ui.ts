import { legacyHtml } from './eta-runtime.ts';
import {
  renderFrontsUiGoalRowsFragment001,
  renderFrontsUiGoalRowsFragment002,
  renderFrontsUiOpsHtmlFragment003,
  renderFrontsUiOpsHtmlFragment004,
  renderFrontsUiOpsHtmlFragment005,
  renderFrontsUiOpsHtmlFragment006,
  renderFrontsUiOpsHtmlFragment007,
  renderFrontsUiOpsHtmlFragment008,
  renderFrontsUiOpsHtmlFragment009,
  renderFrontsUiOpsHtmlFragment010,
  renderFrontsUiOpsHtmlFragment011,
  renderFrontsUiOpsHtmlFragment012,
  renderFrontsUiOpsHtmlFragment013,
  renderFrontsUiOpsHtmlFragment014,
  renderFrontsUiOpsHtmlFragment015,
  renderFrontsUiOpsHtmlFragment016,
  renderFrontsUiOpsHtmlFragment017,
  renderFrontsUiOpsHtmlFragment018,
  renderFrontsUiOpsHtmlFragment019,
  renderFrontsUiOpsHtmlFragment020,
  renderFrontsUiOpsHtmlFragment021,
  renderFrontsUiOpsHtmlFragment022,
  renderFrontsUiOpsHtmlFragment023,
  renderFrontsUiOpsHtmlFragment024,
  renderFrontsUiStoreMenuHtmlFragment025,
  renderFrontsUiStoreMenuHtmlFragment026,
  renderFrontsUiStoreHtmlFragment027,
  renderFrontsUiStoreHtmlFragment028,
  renderFrontsUiStoreHtmlFragment029,
} from './eta-templates.ts';
import type { FactionDef } from '../shared/galaxy.ts';
import type { ClientGameState } from './main.ts';
export type GoalEntry = {
  /** Goal type key */
  type: string;
  /** Required count or target amount */
  n: number;
  /** Current progress count or amount */
  got: number;
  /** Whether reward has been claimed */
  claimed?: boolean;
};
export type WorldEvent = {
  /** Event name */
  name: string;
  /** Event description */
  desc: string;
  /** End timestamp */
  until?: number;
};
export type WorldInvasion = {
  /** Boss / fleet name */
  name: string;
  /** System identifier */
  sys: string;
  /** Expiration timestamp */
  until: number;
};
export type ArmadaMember = {
  /** Member captain name */
  name: string;
  /** Online status */
  online: boolean;
  /** Current system name */
  sys?: string;
};
export type ArmadaState = {
  /** Armada group name */
  name: string;
  /** Group leader captain name */
  leader: string;
  /** Member roster */
  members: ArmadaMember[];
};
export type CalendarEvent = {
  /** Event title */
  name: string;
  /** Start timestamp */
  start: number;
  /** End timestamp */
  end: number;
};

// Quantum Rift: interface pieces: the OPS companion tab (event, invasion, anomaly, goals, Armada), and the faction STORE menu.
import { SYS as systemsById, FACTIONS, GRADES } from '../shared/galaxy.ts';
import {
  ANOMALIES,
  GOAL_TYPES,
  GOAL_REWARD,
  STORE_ITEMS,
  STORE_TIERS,
  STORE_MAT,
} from '../shared/fronts.ts';
import { credits, route } from '../shared/rules.ts';
import { STATES } from '../shared/living.ts';

/**
 * Formats time remaining until a timestamp into days, hours, or minutes.
 * @param time Future timestamp in ms
 * @returns Formatted duration (e.g. '2d 5h', '3h 12m', or '45m')
 */
const left = (time: number): string => {
  const message = Math.max(0, Math.round((time - Date.now()) / 60000));
  return message >= 1440
    ? `${Math.floor(message / 1440)}d ${Math.floor((message % 1440) / 60)}h`
    : message >= 60
      ? `${Math.floor(message / 60)}h ${message % 60}m`
      : `${message}m`;
};

/**
 * Renders daily or weekly goal progression cards and claim buttons.
 * @param list List of goal items
 * @param period Period identifier
 * @returns HTML markup
 */
function goalRows(list: GoalEntry[], period: 'daily' | 'weekly'): string {
  return list
    .map((goalEntry, index) =>
      renderFrontsUiGoalRowsFragment001({
        goalEntryClaimed: legacyHtml(goalEntry.claimed ? 'claimed' : ''),
        GOAL_TYPES: GOAL_TYPES[goalEntry.type].text(goalEntry.n),
        goalEntryClaimed2: legacyHtml(
          goalEntry.claimed
            ? '✓ claimed'
            : goalEntry.got >= goalEntry.n
              ? renderFrontsUiGoalRowsFragment002({
                  period: legacyHtml(period),
                  index: legacyHtml(index),
                })
              : `${goalEntry.type === 'trade' ? credits(goalEntry.got) : goalEntry.got} / ${goalEntry.type === 'trade' ? credits(goalEntry.n) : goalEntry.n}`,
        ),
        MathMin: legacyHtml(Math.min(100, (100 * goalEntry.got) / goalEntry.n)),
      }),
    )
    .join('');
}

/**
 * Renders the OPS companion tab (server events, invasions, system anomalies, goals, Armada summary, and calendar).
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function opsHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    width: Partial<NonNullable<ClientGameState['world']>> = clientGameState.world || {},
    serverEvent = width.event,
    _here = systemsById[clientGameState.sys!];
  let height = renderFrontsUiOpsHtmlFragment003();
  const story2 = playerPayload.story;
  if (story2 && (story2.active || story2.next))
    height += renderFrontsUiOpsHtmlFragment004({
      story2Step: legacyHtml(story2.step + 1),
      story2Total: legacyHtml(story2.total),
      story2Active: story2.active ? story2.active.title : story2.next!.title,
      story2Active2: story2.active
        ? story2.active.ready
          ? 'Done: return to collect.'
          : story2.active.brief
        : 'Waiting for you at ' + story2.next!.at + '.',
    });
  if (serverEvent)
    height += renderFrontsUiOpsHtmlFragment005({
      clientGameStateSolo: legacyHtml(clientGameState.solo ? 'EVENT' : 'SERVER EVENT'),
      serverEventName: serverEvent.name,
      serverEventDesc: serverEvent.desc,
    });
  if (width.invasion) {
    const starSystem = systemsById[width.invasion.sys];
    height += renderFrontsUiOpsHtmlFragment006({
      left: legacyHtml(left(width.invasion.until)),
      widthInvasionName: width.invasion.name,
      starSystemId: legacyHtml(starSystem.id),
      starSystemName: starSystem.name,
    });
  }
  const angle = width.anomalies && width.anomalies[clientGameState.sys!];
  if (angle)
    height += renderFrontsUiOpsHtmlFragment007({
      ANOMALIES: legacyHtml(ANOMALIES[angle].color),
      ANOMALIES2: legacyHtml(ANOMALIES[angle].color),
      ANOMALIES3: legacyHtml(ANOMALIES[angle].icon),
      ANOMALIES4: ANOMALIES[angle].name,
      ANOMALIES5: ANOMALIES[angle].desc,
    });
  {
    const near = Object.entries(width.states || {})
      .filter(
        ([starSystem, livingPayloadState]) =>
          systemsById[starSystem] &&
          STATES[livingPayloadState.k] &&
          livingPayloadState.until > Date.now(),
      )
      .map(([starSystem, livingPayloadState]): [string, typeof livingPayloadState, number] => [
        starSystem,
        livingPayloadState,
        starSystem === clientGameState.sys
          ? 0
          : (route(systemsById, clientGameState.sys!, starSystem) || []).length || 99,
      ])
      .filter((positionX) => positionX[2] <= 8)
      .sort((firstValue, secondValue) => firstValue[2] - secondValue[2])
      .slice(0, 8); // the Rift today
    if (near.length)
      height +=
        renderFrontsUiOpsHtmlFragment008() +
        near
          .map(([starSystem, livingPayloadState, innerIndex]) => {
            const systemState = STATES[livingPayloadState.k];
            return renderFrontsUiOpsHtmlFragment009({
              systemStateColor: legacyHtml(systemState.color),
              systemStateIcon: legacyHtml(systemState.icon),
              systemStateName: legacyHtml(systemState.name),
              systemsById: systemsById[starSystem].name,
              livingPayloadStateNeed: legacyHtml(
                livingPayloadState.need
                  ? renderFrontsUiOpsHtmlFragment010({
                      livingPayloadStateGot: legacyHtml(livingPayloadState.got),
                      livingPayloadStateNeed: legacyHtml(livingPayloadState.need),
                    })
                  : '',
              ),
              innerIndex: legacyHtml(
                innerIndex ? innerIndex + ' jump' + (innerIndex > 1 ? 's' : '') : 'here',
              ),
              starSystem: legacyHtml(starSystem),
            });
          })
          .join('');
  }
  {
    if (playerPayload.holdout && playerPayload.holdout.active)
      height += renderFrontsUiOpsHtmlFragment011({
        playerPayloadHoldoutWave: legacyHtml(playerPayload.holdout.wave),
      });
  }
  if (playerPayload.goals) {
    height +=
      renderFrontsUiOpsHtmlFragment012({
        credits: legacyHtml(credits(GOAL_REWARD.daily.credits)),
        GOAL_REWARDDailyTokens: legacyHtml(GOAL_REWARD.daily.tokens),
      }) + goalRows(playerPayload.goals.daily!, 'daily');
    height +=
      renderFrontsUiOpsHtmlFragment013({
        credits: legacyHtml(credits(GOAL_REWARD.weekly.credits)),
        GOAL_REWARDWeeklyTokens: legacyHtml(GOAL_REWARD.weekly.tokens),
      }) + goalRows(playerPayload.goals.weekly!, 'weekly');
  }
  // the Armada at a glance (full controls in the ALLIES tab); multiplayer only
  const armada2 = playerPayload.armada;
  if (!clientGameState.solo) {
    height += renderFrontsUiOpsHtmlFragment014();
    if (!armada2) height += renderFrontsUiOpsHtmlFragment015();
    else
      height +=
        renderFrontsUiOpsHtmlFragment016({
          armada2Name: armada2.name,
          armada2Members: legacyHtml(armada2.members!.filter((message) => message.online).length),
          armada2Members2: legacyHtml(armada2.members!.length),
        }) +
        armada2
          .members!.map((message) =>
            renderFrontsUiOpsHtmlFragment017({
              messageOnline: legacyHtml(
                message.online
                  ? renderFrontsUiOpsHtmlFragment018()
                  : renderFrontsUiOpsHtmlFragment019(),
              ),
              messageName: message.name,
              messageName2: legacyHtml(
                message.name === armada2.leader ? renderFrontsUiOpsHtmlFragment020() : '',
              ),
              messageSys: message.sys || '',
            }),
          )
          .join('');
  }
  if (width.calendar)
    height +=
      renderFrontsUiOpsHtmlFragment021() +
      width.calendar
        .map((scheduledEvent, index) =>
          renderFrontsUiOpsHtmlFragment022({
            index: legacyHtml(index === 0 ? renderFrontsUiOpsHtmlFragment023() : ''),
            scheduledEventName: scheduledEvent.name,
            index2: legacyHtml(index === 0 ? renderFrontsUiOpsHtmlFragment024() : ''),
            index3: legacyHtml(
              index === 0
                ? 'ends in ' + left(scheduledEvent.end)
                : new Date(scheduledEvent.start).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }),
            ),
          }),
        )
        .join('');
  return height;
}

/**
 * Returns array of eligible faction keys that offer Quartermaster stores.
 * @param FACTIONS_ Faction definitions dictionary
 * @returns Faction keys
 */
export const STORE_FACS = (FACTIONS_: Record<string, FactionDef>): string[] =>
  Object.entries(FACTIONS_)
    .filter(
      ([entryKey, factionDef]) => !factionDef.region && !factionDef.hidden && entryKey !== 'umbral',
    )
    .map(([entryKey]) => entryKey);

/**
 * Renders the modal Faction Stores quartermaster dialog with faction selector tabs.
 * @param clientGameState Game state object
 * @param FACTIONS_ Faction definitions
 * @returns HTML markup
 */
export function storeMenuHtml(
  clientGameState: ClientGameState,
  FACTIONS_: Record<string, FactionDef>,
): string {
  const playerPayload = clientGameState.you!,
    factions = STORE_FACS(FACTIONS_),
    faction =
      clientGameState.storeFac && factions.includes(clientGameState.storeFac)
        ? clientGameState.storeFac
        : (clientGameState.landed && clientGameState.landed!.store) || 'quantum';
  clientGameState.storeFac = faction;
  const side = factions
    .map((entryKey) => {
      const factionDef = FACTIONS_[entryKey],
        reputation = playerPayload.rep[entryKey] || 0,
        token = (playerPayload.tokens && playerPayload.tokens[entryKey]) || 0;
      return renderFrontsUiStoreMenuHtmlFragment025({
        entryKey: legacyHtml(entryKey === faction ? 'on' : ''),
        entryKey2: legacyHtml(entryKey),
        factionDefColor: legacyHtml(factionDef.color),
        factionDefShort: factionDef.short,
        reputation: legacyHtml(reputation),
        token: legacyHtml(token),
      });
    })
    .join('');
  return renderFrontsUiStoreMenuHtmlFragment026({
    faction: legacyHtml(faction),
    FACTIONS_: FACTIONS_[faction].name,
    faction2: legacyHtml(faction),
    playerPayloadTokens: legacyHtml((playerPayload.tokens && playerPayload.tokens.any) || 0),
    clientGameStateLanded: legacyHtml(
      clientGameState.landed ? 'purchases are delivered to you here' : 'land anywhere to buy',
    ),
    side: legacyHtml(side),
    storeHtml: legacyHtml(storeHtml(clientGameState, faction)),
  });
}

/**
 * Renders the items and standing table for a specific faction store.
 * @param clientGameState Game state object
 * @param facArg Faction key to display
 * @returns HTML markup
 */
export function storeHtml(clientGameState: ClientGameState, facArg?: string): string {
  const playerPayload = clientGameState.you!,
    faction = (facArg || clientGameState.landed!.store)!,
    factionDef = FACTIONS[faction],
    reputation = playerPayload.rep[faction] || 0,
    token = (playerPayload.tokens && playerPayload.tokens[faction]) || 0,
    scrip = (playerPayload.tokens && playerPayload.tokens.any) || 0,
    landed = !!clientGameState.landed;
  const tier = [...STORE_TIERS]
    .reverse()
    .find((factionStoreTier) => reputation >= factionStoreTier.rep);
  let height = renderFrontsUiStoreHtmlFragment027({
    factionDefNameToUpperCase: factionDef.name.toUpperCase(),
    factionDefColor: legacyHtml(factionDef.color),
    reputation: legacyHtml(reputation),
    tier: legacyHtml(tier ? '· ' + tier.name : ''),
    factionDefShort: legacyHtml(factionDef.short),
    token: legacyHtml(token),
    scrip: legacyHtml(scrip),
    factionDefShort2: legacyHtml(factionDef.short),
    factionDefShort3: legacyHtml(factionDef.short),
  });
  for (const factionStoreItem of STORE_ITEMS) {
    const name2 = factionStoreItem.give.crate
      ? `${STORE_MAT[faction]} crate (grade ${GRADES[factionStoreItem.give.crate as number]})`
      : factionStoreItem.name;
    const allowed =
      landed &&
      reputation >= factionStoreItem.rep &&
      token + scrip >= factionStoreItem.tokens &&
      playerPayload.credits >= factionStoreItem.credits;
    height += renderFrontsUiStoreHtmlFragment028({
      name2: name2,
      reputation: legacyHtml(reputation >= factionStoreItem.rep ? '#8ff0ad' : '#ff9a8a'),
      factionStoreItemRep: legacyHtml(factionStoreItem.rep),
      factionStoreItemTokens: legacyHtml(factionStoreItem.tokens),
      factionStoreItemCredits: legacyHtml(
        factionStoreItem.credits ? credits(factionStoreItem.credits) : '-',
      ),
      faction: legacyHtml(faction),
      factionStoreItemId: legacyHtml(factionStoreItem.id),
      allowed: legacyHtml(allowed ? '' : 'disabled'),
    });
  }
  return height + renderFrontsUiStoreHtmlFragment029();
}
