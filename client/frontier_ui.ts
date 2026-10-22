import { legacyHtml } from './eta-runtime.ts';
import {
  renderFrontierUiViewFragment001,
  renderFrontierUiColonyHtmlFragment002,
  renderFrontierUiColonyHtmlFragment003,
  renderFrontierUiColonyHtmlFragment004,
  renderFrontierUiColonyHtmlFragment005,
  renderFrontierUiColonyHtmlFragment006,
  renderFrontierUiColonyHtmlFragment007,
  renderFrontierUiColonyHtmlFragment008,
  renderFrontierUiColonyHtmlFragment009,
  renderFrontierUiColonyHtmlFragment010,
  renderFrontierUiColonyHtmlFragment011,
  renderFrontierUiColonyHtmlFragment012,
  renderFrontierUiColonyHtmlFragment013,
  renderFrontierUiColonyHtmlFragment014,
  renderFrontierUiColonyHtmlFragment015,
  renderFrontierUiDefenseHtmlFragment016,
  renderFrontierUiDefenseHtmlFragment017,
  renderFrontierUiDefenseHtmlFragment018,
  renderFrontierUiDefenseHtmlFragment019,
  renderFrontierUiDefenseHtmlFragment020,
  renderFrontierUiDefenseHtmlFragment021,
  renderFrontierUiDefenseHtmlFragment022,
  renderFrontierUiDefenseHtmlFragment023,
  renderFrontierUiMasteryHtmlFragment024,
  renderFrontierUiMasteryHtmlFragment025,
  renderFrontierUiArenaHtmlFragment026,
  renderFrontierUiArenaHtmlFragment027,
  renderFrontierUiArenaHtmlFragment028,
  renderFrontierUiArenaHtmlFragment029,
  renderFrontierUiArenaHtmlFragment030,
  renderFrontierUiExchangeHtmlFragment031,
  renderFrontierUiExchangeHtmlFragment032,
  renderFrontierUiExchangeHtmlFragment033,
  renderFrontierUiExchangeHtmlFragment034,
  renderFrontierUiExchangeHtmlFragment035,
  renderFrontierUiExchangeHtmlFragment036,
  renderFrontierUiExchangeHtmlFragment037,
  renderFrontierUiExchangeHtmlFragment038,
  renderFrontierUiExchangeHtmlFragment039,
  renderFrontierUiExchangeHtmlFragment040,
  renderFrontierUiExchangeHtmlFragment041,
  renderFrontierUiExchangeHtmlFragment042,
  renderFrontierUiExchangeHtmlFragment043,
  renderFrontierUiExchangeHtmlFragment044,
  renderFrontierUiBoardsHtmlFragment045,
  renderFrontierUiBoardsHtmlFragment046,
  renderFrontierUiBoardsHtmlFragment047,
  renderFrontierUiBoardsHtmlFragment048,
  renderFrontierUiBoardsHtmlFragment049,
  renderFrontierUiBoardsHtmlFragment050,
  renderFrontierUiBoardsHtmlFragment051,
  renderFrontierUiBoardsHtmlFragment052,
  renderFrontierUiBoardsHtmlFragment053,
  renderFrontierUiBoardsHtmlFragment054,
  renderFrontierUiBoardsHtmlFragment055,
} from './eta-templates.ts';
import type { PlayerPayload as PlayerData } from './main.ts';
import type { ClientGameState } from './main.ts';
export type ColonyData = {
  /** Whether world is unsettled */
  open?: boolean;

  /** Whether settled by player */
  own?: boolean;

  /** Colony name */
  name: string;

  /** Owner captain name */
  owner?: string;

  /** Colony level */
  lv: number;

  /** Installed building types */
  buildings: string[];

  /** Stockpile resource amounts */
  store: Record<string, number>;
};
export type ExchangeOrder = {
  /** Order ID */
  id: string;

  /** Order side */
  side: 'buy' | 'sell';

  /** Order item specification */
  item: { id: string; name: string; cost: number };

  /** Quantity */
  qty: number;

  /** Unit price */
  price: number;
};
export type ExchangeBookEntry = {
  /** Item spec */
  item: { id: string; name: string; cost: number };

  /** Best bid price */
  bid?: number;

  /** Number of bids */
  bids: number;

  /** Best ask price */
  ask?: number;

  /** Number of asks */
  asks: number;
};
export type CaptainProfile = {
  /** Captain name */
  name: string;

  /** Online status */
  online: boolean;

  /** Current ship hull name */
  ship: string;

  /** Custom ship name */
  shipName: string;

  /** Personal station site name */
  site?: string;

  /** Station Tier */
  ops?: number;

  /** List of settled colony names */
  colonies: string[];

  /** Total kills */
  kills: number;

  /** Total jumps */
  jumps: number;

  /** Total ore mined in tons */
  mined: number;

  /** Total credits earned */
  earned: number;

  /** Arena stats */
  arena?: { rating: number; w: number; l: number };

  /** Best ship mastery */
  mastery?: { ship: string; tier: number };

  /** Total officers */
  officers: number;
};

import { escapeHtml as escapeHtml2 } from './html.ts';
// Quantum Rift: interface pieces: colonies, station defense, mastery, the arena, the exchange, leaderboards and profiles.
import { STELLARS, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.ts';
import {
  COLONY,
  COLONY_LEVELS,
  BUILDINGS,
  DEFENSE,
  MASTERY,
  masteryTier,
  ARENA,
  EXCHANGE,
  BOARDS,
} from '../shared/frontier.ts';
import { credits } from '../shared/rules.ts';

/**
 * Formats a list of required material tuples with availability coloring.
 * @param positionY Player state object
 * @param list Array of [material, grade, quantity] tuples
 * @returns HTML markup
 */
const mats = (playerPayload: PlayerData, list: Array<[string, number, number]>): string =>
  list
    .map(([message, game, count]) =>
      renderFrontierUiViewFragment001({
        playerPayloadMats: legacyHtml(
          playerPayload.mats[message][game] >= count ? '#8ff0ad' : '#ff9a8a',
        ),
        count: legacyHtml(count > 1 ? count + ' ' : ''),
        message: legacyHtml(message),
        GRADES: legacyHtml(GRADES[game]),
      }),
    )
    .join(', ');

/**
 * Returns commodity display name by ID or 'credits'.
 * @param identifier Commodity ID or 'credits'
 * @returns Display name
 */
const commodityName = (identifier: string): string =>
  identifier === 'credits'
    ? 'credits'
    : (COMMODITIES.find((commodityDef) => commodityDef.id === identifier) || { name: identifier })
        .name;

/**
 * Formats buff percentage bonus properties into readable summary text.
 * @param secondValue Buff definition object
 * @returns Formatted bonus text
 */
const buffText = (secondValue: Record<string, number>): string =>
  Object.entries(secondValue)
    .map(
      ([entryKey, value]) =>
        `+${value}${entryKey === 'fuel' ? '' : '%'} ${entryKey.replace('Pct', '')}`,
    )
    .join(', ');

// ------------------------------------------------------------------ COLONY tab

/**
 * Renders the COLONY landed tab for founding, managing, stockpiling, and constructing buildings.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function colonyHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length2 = clientGameState.landed!,
    component = length2.colony!,
    stellarBody = STELLARS[length2.stellar];
  if (component.open)
    return renderFrontierUiColonyHtmlFragment002({
      stellarBodyName: stellarBody.name,
      credits: legacyHtml(credits(COLONY.cost)),
      mats: legacyHtml(mats(playerPayload, COLONY.mats)),
      playerPayloadColoniesLength: legacyHtml(playerPayload.colonies.length),
      playerPayloadStationOps: legacyHtml(
        playerPayload.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max,
      ),
    });
  if (!component.own)
    return renderFrontierUiColonyHtmlFragment003({
      componentName: component.name,
      componentOwner: component.owner,
      componentLv: legacyHtml(component.lv),
    });
  const colonyLevelInfo = COLONY_LEVELS[component.lv]!,
    next = COLONY_LEVELS[component.lv + 1];
  let height = renderFrontierUiColonyHtmlFragment004({
    componentNameToUpperCase: component.name.toUpperCase(),
    componentLv: legacyHtml(component.lv),
    componentBuildingsLength: legacyHtml(component.buildings.length),
    colonyLevelInfoSlots: legacyHtml(colonyLevelInfo.slots),
    colonyLevelInfoMult: legacyHtml(colonyLevelInfo.mult),
  });
  if (next)
    height += renderFrontierUiColonyHtmlFragment005({
      componentLv: legacyHtml(component.lv + 1),
      credits: legacyHtml(credits(next.cost!)),
      mats: legacyHtml(mats(playerPayload, next.mats!)),
    });
  const store = Object.entries(component.store).filter(([, value]) => value >= 1);
  height += renderFrontierUiColonyHtmlFragment006({
    storeLength: legacyHtml(
      store.length
        ? store
            .map(([entryKey, value]) =>
              renderFrontierUiColonyHtmlFragment007({
                commodityName: commodityName(entryKey),
                entryKey: legacyHtml(entryKey === 'credits' ? credits(value) : value + ' t'),
              }),
            )
            .join('') + renderFrontierUiColonyHtmlFragment008()
        : renderFrontierUiColonyHtmlFragment009(),
    ),
  });
  height +=
    renderFrontierUiColonyHtmlFragment010() +
    (component.buildings
      .map((secondValue, index) =>
        renderFrontierUiColonyHtmlFragment011({
          BUILDINGS: BUILDINGS[secondValue].name,
          BUILDINGS2: legacyHtml(
            BUILDINGS[secondValue].produce
              ? Object.entries(BUILDINGS[secondValue].produce)
                  .map(
                    ([entryKey, value]) =>
                      `${entryKey === 'credits' ? credits(value * colonyLevelInfo.mult) + ' cr' : (value * colonyLevelInfo.mult).toFixed(1) + ' t ' + commodityName(entryKey)}/h`,
                  )
                  .join(', ')
              : buffText(BUILDINGS[secondValue].buff!),
          ),
          index: legacyHtml(index),
        }),
      )
      .join('') || renderFrontierUiColonyHtmlFragment012());
  if (component.buildings.length < colonyLevelInfo.slots)
    height +=
      renderFrontierUiColonyHtmlFragment013() +
      Object.entries(BUILDINGS)
        .filter(
          ([entryKey, colonyBuilding]) =>
            !(colonyBuilding.buff && component.buildings.includes(entryKey)),
        )
        .map(([entryKey, colonyBuilding]) =>
          renderFrontierUiColonyHtmlFragment014({
            colonyBuildingName: colonyBuilding.name,
            colonyBuildingDesc: colonyBuilding.desc,
            credits: legacyHtml(credits(colonyBuilding.cost)),
            entryKey: legacyHtml(entryKey),
          }),
        )
        .join('');
  height += renderFrontierUiColonyHtmlFragment015();
  return height;
}

// ------------------------------------------------------------------ station defense (inside the station dashboard)

/**
 * Renders the Station Defense rating, turret upgrades, and Station Holdout wave defense interface.
 * @param clientGameState Game state object
 * @param interactive Whether interactive actions are enabled
 * @returns HTML markup
 */
export function defenseHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    stationState = playerPayload.station;
  if (stationState.ops < DEFENSE.minOps) return '';
  const level = stationState.defense || 0,
    next = DEFENSE.levels[level + 1];
  let height = renderFrontierUiDefenseHtmlFragment016({
    playerPayloadDefense: legacyHtml(playerPayload.defense),
    level: legacyHtml(level),
    DEFENSEEveryH: legacyHtml(DEFENSE.everyH),
  });
  const height2: { best: number; lastT: number; active?: boolean; wave?: number } =
      playerPayload.holdout || {
        best: 0,
        lastT: 0,
      },
    wait = (height2.lastT || 0) + 2 * 3600000 - Date.now();
  height += renderFrontierUiDefenseHtmlFragment017({
    MathMin: legacyHtml(1 + Math.min(5, level)),
    clientGameStateSolo: legacyHtml(
      clientGameState.solo
        ? ''
        : ' Your Armada is called when it starts: every member who flies in adds hostiles to each wave and shares the rewards.',
    ),
    height2Best: legacyHtml(height2.best || 0),
    height2Active: legacyHtml(
      height2.active
        ? renderFrontierUiDefenseHtmlFragment018({ height2Wave: legacyHtml(height2.wave) })
        : wait > 0
          ? renderFrontierUiDefenseHtmlFragment019({
              MathCeil: legacyHtml(Math.ceil(wait / 60000)),
            })
          : interactive
            ? renderFrontierUiDefenseHtmlFragment020()
            : renderFrontierUiDefenseHtmlFragment021(),
    ),
  });
  if (next)
    height += renderFrontierUiDefenseHtmlFragment022({
      level: legacyHtml(level + 1),
      nextRating: legacyHtml(next.rating - DEFENSE.levels[level].rating),
      credits: legacyHtml(credits(next.cost!)),
      mats: legacyHtml(mats(playerPayload, next.mats!)),
      interactive: legacyHtml(interactive ? renderFrontierUiDefenseHtmlFragment023() : ''),
    });
  return height;
}

// ------------------------------------------------------------------ mastery (overview)

/**
 * Renders the ship mastery overview tier stars, XP progress bar, and active hull bonuses.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function masteryHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    experience = (playerPayload.mastery || {})[playerPayload.ship.hull as number] || 0,
    masteryTier2 = masteryTier(experience),
    tier = MASTERY.tiers[masteryTier2];
  const stars = '★'.repeat(masteryTier2) + '☆'.repeat(5 - masteryTier2);
  return renderFrontierUiMasteryHtmlFragment024({
    stars: legacyHtml(stars),
    masteryTier2: legacyHtml(masteryTier2),
    tier: legacyHtml(tier !== undefined ? `${Math.floor(experience)} / ${tier} xp` : 'mastered'),
    tier2: legacyHtml(
      tier !== undefined
        ? renderFrontierUiMasteryHtmlFragment025({
            MathMin: legacyHtml(
              Math.min(
                100,
                (100 * (experience - MASTERY.tiers[masteryTier2 - 1])) /
                  (tier - MASTERY.tiers[masteryTier2 - 1]),
              ),
            ),
          })
        : '',
    ),
    buffText: legacyHtml(
      buffText(MASTERY.bonus[masteryTier2]) || 'Fly this hull to unlock bonuses.',
    ),
    masteryTier22: legacyHtml(masteryTier2 >= 5 ? ' · gold trim' : ''),
  });
}

// ------------------------------------------------------------------ ARENA tab

/**
 * Renders the Crucible arena queue, current matchmaking rating, and record.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function arenaHtml(clientGameState: ClientGameState): string {
  const firstValue = clientGameState.you!.arena || { rating: ARENA.start, w: 0, l: 0, sizes: {} };
  let height = renderFrontierUiArenaHtmlFragment026({
    firstValueRating: legacyHtml(firstValue.rating),
    firstValueW: legacyHtml(firstValue.w),
    firstValueL: legacyHtml(firstValue.l),
  });
  for (const [mode, count] of Object.entries(ARENA.modes))
    height += renderFrontierUiArenaHtmlFragment027({
      mode: legacyHtml(mode),
      firstValueSizes: legacyHtml((firstValue.sizes || {})[mode] || 0),
      count: legacyHtml(count * 2),
      firstValueQueued: legacyHtml(
        firstValue.queued === mode
          ? renderFrontierUiArenaHtmlFragment028()
          : renderFrontierUiArenaHtmlFragment029({ mode: legacyHtml(mode) }),
      ),
    });
  height += renderFrontierUiArenaHtmlFragment030({ credits: legacyHtml(credits(15000)) });
  return height;
}

// ------------------------------------------------------------------ EXCHANGE tab

/**
 * Renders the player-to-player market exchange order book, active orders, and storage hold.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function exchangeHtml(clientGameState: ClientGameState): string {
  const _positionY = clientGameState.you!,
    positionX = clientGameState.landed!.exchange!;
  const options =
    MATERIALS.flatMap((message) =>
      GRADES.map((game, index) =>
        renderFrontierUiExchangeHtmlFragment031({
          message: legacyHtml(message),
          index: legacyHtml(index),
          message2: legacyHtml(message),
          game: legacyHtml(game),
        }),
      ),
    ).join('') +
    COMMODITIES.map((commodityDef) =>
      renderFrontierUiExchangeHtmlFragment032({
        commodityDefId: legacyHtml(commodityDef.id),
        commodityDefName: commodityDef.name,
      }),
    ).join('');
  let height = renderFrontierUiExchangeHtmlFragment033({
    EXCHANGEFee: legacyHtml(EXCHANGE.fee * 100),
    options: legacyHtml(options),
  });
  const name = (exchangeItem: import('../server/world-contracts.ts').ExchangeItem) =>
    exchangeItem.kind === 'mat'
      ? `${exchangeItem.mat} ${GRADES[exchangeItem.grade]}`
      : commodityName(exchangeItem.cid);
  height +=
    renderFrontierUiExchangeHtmlFragment034() +
    (positionX.book.length
      ? renderFrontierUiExchangeHtmlFragment035({
          positionXBookMap: legacyHtml(
            positionX.book
              .map((secondValue) =>
                renderFrontierUiExchangeHtmlFragment036({
                  name: name(secondValue.item),
                  secondValueBid: legacyHtml(secondValue.bid ? credits(secondValue.bid) : '-'),
                  secondValueBids: legacyHtml(secondValue.bids),
                  secondValueAsk: legacyHtml(secondValue.ask ? credits(secondValue.ask) : '-'),
                  secondValueAsks: legacyHtml(secondValue.asks),
                }),
              )
              .join(''),
          ),
        })
      : renderFrontierUiExchangeHtmlFragment037());
  height +=
    renderFrontierUiExchangeHtmlFragment038({
      positionXMineLength: legacyHtml(positionX.mine.length),
      EXCHANGEMaxOrders: legacyHtml(EXCHANGE.maxOrders),
    }) +
    (positionX.mine
      .map((exchangeOrder) =>
        renderFrontierUiExchangeHtmlFragment039({
          exchangeOrderSideToUpperCase: legacyHtml(exchangeOrder.side.toUpperCase()),
          exchangeOrderQty: legacyHtml(exchangeOrder.qty),
          name: name(exchangeOrder.item),
          credits: legacyHtml(credits(exchangeOrder.price)),
          exchangeOrderId: legacyHtml(exchangeOrder.id),
        }),
      )
      .join('') || renderFrontierUiExchangeHtmlFragment040());
  const state = Object.entries(positionX.storage || {});
  if (state.length)
    height +=
      renderFrontierUiExchangeHtmlFragment041() +
      state
        .map(([entryKey, value]) =>
          renderFrontierUiExchangeHtmlFragment042({
            commodityName: commodityName(entryKey),
            value: legacyHtml(value),
          }),
        )
        .join('') +
      renderFrontierUiExchangeHtmlFragment043();
  height += renderFrontierUiExchangeHtmlFragment044();
  return height;
}

// ------------------------------------------------------------------ leaderboards + profile (community tab)

/**
 * Renders the galactic community leaderboards and captain profile lookup.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function boardsHtml(clientGameState: ClientGameState): string {
  const category = clientGameState.boardCat || 'earned',
    secondValue = clientGameState.boards && clientGameState.boards[category];
  let height = renderFrontierUiBoardsHtmlFragment045({
    ObjectEntries: legacyHtml(
      Object.entries(BOARDS)
        .map(([entryKey, leaderboardCategory]) =>
          renderFrontierUiBoardsHtmlFragment046({
            entryKey: legacyHtml(entryKey === category ? 'on' : ''),
            entryKey2: legacyHtml(entryKey),
            leaderboardCategoryName: legacyHtml(leaderboardCategory.name),
          }),
        )
        .join(''),
    ),
  });
  height += secondValue
    ? renderFrontierUiBoardsHtmlFragment047({
        BOARDS: BOARDS[category].name.toUpperCase(),
        secondValueMap: legacyHtml(
          secondValue
            .map((radius, index) =>
              renderFrontierUiBoardsHtmlFragment048({
                index: legacyHtml(index + 1),
                radiusName: radius.name,
                radiusFleet: legacyHtml(radius.fleet ? `[${escapeHtml2(radius.fleet)}] ` : ''),
                radiusName2: radius.name,
                radiusAi: legacyHtml(radius.ai ? renderFrontierUiBoardsHtmlFragment049() : ''),
                category: legacyHtml(
                  category === 'earned' ? credits(radius.v) : radius.v.toLocaleString(),
                ),
              }),
            )
            .join(''),
        ),
      })
    : renderFrontierUiBoardsHtmlFragment050();
  height += renderFrontierUiBoardsHtmlFragment051();
  const captainProfile = clientGameState.prof;
  if (captainProfile)
    height += renderFrontierUiBoardsHtmlFragment052({
      captainProfileName: captainProfile.name,
      captainProfileOnline: legacyHtml(
        captainProfile.online
          ? renderFrontierUiBoardsHtmlFragment053()
          : renderFrontierUiBoardsHtmlFragment054(),
      ),
      captainProfileShip: captainProfile.ship,
      captainProfileShipName: captainProfile.shipName,
      captainProfileSite: legacyHtml(
        captainProfile.site
          ? `${escapeHtml2(captainProfile.site)} · Station Tier ${captainProfile.ops}`
          : 'none',
      ),
      captainProfileColoniesMap: legacyHtml(
        captainProfile.colonies.map(escapeHtml2).join(', ') || 'none',
      ),
      captainProfileKills: legacyHtml(captainProfile.kills),
      captainProfileJumps: legacyHtml(captainProfile.jumps),
      captainProfileMined: legacyHtml(captainProfile.mined),
      credits: legacyHtml(credits(captainProfile.earned)),
      captainProfileArena: legacyHtml(
        captainProfile.arena
          ? `${captainProfile.arena.rating} (${captainProfile.arena.w}-${captainProfile.arena.l})`
          : 'unrated',
      ),
      captainProfileMastery: legacyHtml(
        captainProfile.mastery
          ? renderFrontierUiBoardsHtmlFragment055({
              captainProfileMasteryShip: captainProfile.mastery.ship,
              captainProfileMasteryTier: legacyHtml(captainProfile.mastery.tier),
            })
          : '',
      ),
      captainProfileOfficers: legacyHtml(captainProfile.officers),
    });
  return height;
}
