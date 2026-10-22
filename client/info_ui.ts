import { legacyHtml } from './eta-runtime.ts';
import {
  renderInfoUiInfoHtmlFragment001,
  renderInfoUiInfoHtmlFragment002,
  renderInfoUiInfoHtmlFragment003,
  renderInfoUiInfoHtmlFragment004,
  renderInfoUiInfoHtmlFragment005,
  renderInfoUiInfoHtmlFragment006,
  renderInfoUiInfoHtmlFragment007,
  renderInfoUiInfoHtmlFragment008,
  renderInfoUiInfoHtmlFragment009,
  renderInfoUiInfoHtmlFragment010,
  renderInfoUiInfoHtmlFragment011,
  renderInfoUiInfoHtmlFragment012,
  renderInfoUiInfoHtmlFragment013,
  renderInfoUiInfoHtmlFragment014,
  renderInfoUiInfoHtmlFragment015,
  renderInfoUiInfoHtmlFragment016,
  renderInfoUiInfoHtmlFragment017,
  renderInfoUiInfoHtmlFragment018,
  renderInfoUiInfoHtmlFragment019,
  renderInfoUiInfoHtmlFragment020,
  renderInfoUiInfoHtmlFragment021,
  renderInfoUiInfoHtmlFragment022,
  renderInfoUiCareerHtmlFragment023,
  renderInfoUiCareerHtmlFragment024,
  renderInfoUiCareerHtmlFragment025,
  renderInfoUiCareerHtmlFragment026,
  renderInfoUiCareerHtmlFragment027,
  renderInfoUiCareerHtmlFragment028,
  renderInfoUiCareerHtmlFragment029,
  renderInfoUiCareerHtmlFragment030,
  renderInfoUiCareerHtmlFragment031,
  renderInfoUiCareerHtmlFragment032,
  renderInfoUiCareerHtmlFragment033,
  renderInfoUiCareerHtmlFragment034,
  renderInfoUiCareerHtmlFragment035,
  renderInfoUiCareerHtmlFragment036,
  renderInfoUiCareerHtmlFragment037,
  renderInfoUiCareerHtmlFragment038,
  renderInfoUiCareerHtmlFragment039,
  renderInfoUiCareerHtmlFragment040,
  renderInfoUiCareerHtmlFragment041,
} from './eta-templates.ts';
import type { StellarBody } from '../server/game.ts';
import type { ClientGameState } from './main.ts';
export type InfoTab = 'ship' | 'career' | 'fleet' | 'captains';
export type BestSaleResult = {
  /** Stellar body object */
  p: StellarBody;
  /** Commodity price per ton */
  price: number;
  /** Jumps distance */
  jumps: number;
};
export type RivalCaptain = {
  /** Captain name */
  name: string;

  /** Career type */
  kind: string;

  /** Faction identifier */
  fac: string;

  /** Ship hull name */
  ship: string;

  /** Current system ID */
  sys?: string | null;

  /** Standing category */
  mood: 'nemesis' | 'rival' | 'neutral' | 'friendly' | 'ally';

  /** Standing relationship score */
  rel: number;
};
export type ShipStats = {
  /** Shield strength */
  shield: number;

  /** Armor strength */
  armor: number;

  /** Maximum forward speed */
  maxSpeed: number;

  /** Turn rate */
  turn: number;

  /** Cargo capacity in tons */
  cargo: number;

  /** Total outfit space */
  space: number;

  /** Available free outfit space */
  free: number;

  /** Equipped gun count */
  guns: number;

  /** Maximum gun mounts */
  maxGuns: number;

  /** Equipped turret count */
  turrets: number;

  /** Maximum turret mounts */
  maxTurrets: number;
};

import { escapeDoubleQuotedHtml as escapeHtml } from './html.ts';
import { artworkUrl } from './artwork.ts';
// the ship and captain panel (I), the player information view: your ship, cargo (with jettison), combat
// rating, fleet orders, and the rival captains of the Rift with how they feel about you.
import {
  SYS as systemsById,
  SYSTEMS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
} from '../shared/galaxy.ts';
import { SPEC, BP_NEED } from '../shared/specialty.ts';
import { RARITY } from '../shared/hangar.ts';
import { RANKS } from '../shared/rivals.ts';
import { synBadge } from './syn_ui.ts';
import { price } from '../shared/rules.ts';

/**
 * Formats a number to rounded, localized string.
 * @param count Input number
 * @returns Formatted number string
 */
const credits2 = (count: number): string => Math.round(count).toLocaleString();
const order2 = [
  ['gather', 'Form up', 'G'],
  ['attack', 'Attack my target', 'K'],
  ['hold', 'Hold position', 'H'],
  ['holdfire', 'Hold fire', 'Y'],
  ['loot', 'Collect loot', 'U'],
];
const MOODC = {
  nemesis: '#ff5a4a',
  rival: '#ff9a6a',
  neutral: '#aab',
  friendly: '#9fd0ff',
  ally: '#6aff9a',
};

/**
 * Renders the Info panel (I key) including ship stats, cargo jettison, career ledger, wingmate orders, and rival captains.
 * @param clientGameState Game state object
 * @param activeTab Sub-tab to render ('ship', 'career', 'fleet', or 'captains')
 * @returns HTML markup
 */
export function infoHtml(clientGameState: ClientGameState, activeTab?: string): string {
  const playerPayload = clientGameState.you!;
  if (!playerPayload) return '';
  const computedShipStats = playerPayload.shipStats!,
    shipHullAsset = clientGameState.A!.ships[playerPayload.ship.hull],
    rank = playerPayload.rank || { name: 'Harmless', score: 0, next: 400, i: 0 };
  if (activeTab === 'ship') {
    const cargo = Object.entries(playerPayload.cargo || {}).filter(([, count]) => count > 0),
      inSpace = !!clientGameState.view && !clientGameState.landed;
    const progressBar = rank.next
      ? Math.min(100, (100 * (rank.score - RANKS[rank.i][0])) / (rank.next - RANKS[rank.i][0]))
      : 100;
    return renderInfoUiInfoHtmlFragment001({
      playerPayloadShipless: legacyHtml(
        playerPayload.shipless
          ? renderInfoUiInfoHtmlFragment002()
          : renderInfoUiInfoHtmlFragment003({
              artworkUrl: legacyHtml(artworkUrl(shipHullAsset.img!)),
              shipHullAssetName: shipHullAsset.name,
              playerPayloadShipName: playerPayload.ship.name,
              credits2: legacyHtml(credits2(computedShipStats.shield)),
              credits22: legacyHtml(credits2(computedShipStats.armor)),
              credits23: legacyHtml(credits2(computedShipStats.maxSpeed / 0.45)),
              credits24: legacyHtml(credits2((computedShipStats.turn * 57.3) / 3)),
              playerPayloadCargoUsed: legacyHtml(playerPayload.cargoUsed),
              computedShipStatsCargo: legacyHtml(computedShipStats.cargo),
              playerPayloadMissions: legacyHtml(
                (playerPayload.missions || [])
                  .filter((mission) => mission.type === 'passenger')
                  .reduce((sumValues, mission) => sumValues + (mission.pax || 0), 0),
              ),
              computedShipStatsPassengerSeats: legacyHtml(computedShipStats.passengerSeats),
              computedShipStatsFree: legacyHtml(computedShipStats.free),
              computedShipStatsSpace: legacyHtml(computedShipStats.space),
              computedShipStatsGuns: legacyHtml(computedShipStats.guns),
              computedShipStatsMaxGuns: legacyHtml(computedShipStats.maxGuns),
              computedShipStatsTurrets: legacyHtml(computedShipStats.turrets),
              computedShipStatsMaxTurrets: legacyHtml(computedShipStats.maxTurrets),
              MathFloor: legacyHtml(
                Math.floor(
                  ((clientGameState.view && clientGameState.view.fuel) ?? playerPayload.fuel) / 100,
                ),
              ),
            }),
      ),
      rankName: rank.name,
      credits2: legacyHtml(credits2(rank.score)),
      rankNext: legacyHtml(rank.next ? ` / ${credits2(rank.next)}` : ''),
      progressBar: legacyHtml(progressBar),
      synBadge: legacyHtml(synBadge(playerPayload)),
      playerPayloadShards: legacyHtml(playerPayload.shards || 0),
      playerPayloadCredit: legacyHtml(playerPayload.credit || 600),
      playerPayloadLoan: legacyHtml(
        playerPayload.loan ? ` · loan ${credits2(playerPayload.loan.bal)} cr` : '',
      ),
      playerPayloadArcs: legacyHtml(
        (playerPayload.arcs || []).filter((firstValue) => firstValue.done).length,
      ),
      playerPayloadArcs2: legacyHtml((playerPayload.arcs || []).length),
      playerPayloadExpd: legacyHtml((playerPayload.expd && playerPayload.expd.n) || 0),
      cargoLength: legacyHtml(
        cargo.length
          ? cargo
              .map(([component, count]) => {
                const commodityDef = COMMODITIES.find(
                  (commodityDef) => commodityDef.id === component,
                );
                const bestSaleResult = bestSale(clientGameState, component);
                const grades = Object.entries(playerPayload.cargoLots?.byCommodity[component] || {})
                  .filter(([, quantity]) => quantity > 0)
                  .map(([game, quantity]) =>
                    renderInfoUiInfoHtmlFragment004({
                      game: legacyHtml(game),
                      quantity: legacyHtml(quantity),
                      inSpace: legacyHtml(
                        inSpace
                          ? renderInfoUiInfoHtmlFragment005({
                              component: legacyHtml(component),
                              game: legacyHtml(game),
                              MathMin: legacyHtml(Math.min(5, quantity)),
                              MathMin2: legacyHtml(Math.min(5, quantity)),
                              component2: legacyHtml(component),
                              game2: legacyHtml(game),
                              quantity: legacyHtml(quantity),
                              gameToUpperCase: legacyHtml(game.toUpperCase()),
                            })
                          : '',
                      ),
                    }),
                  )
                  .join('');
                return renderInfoUiInfoHtmlFragment006({
                  commodityDef: commodityDef ? commodityDef.name : component,
                  bestSaleResult: legacyHtml(
                    bestSaleResult
                      ? renderInfoUiInfoHtmlFragment007({
                          credits2: legacyHtml(credits2(bestSaleResult.price)),
                          bestSaleResultPName: bestSaleResult.p.name,
                          bestSaleResultJumps: legacyHtml(
                            bestSaleResult.jumps
                              ? ` (${bestSaleResult.jumps} jump${bestSaleResult.jumps > 1 ? 's' : ''})`
                              : ' (this system)',
                          ),
                          playerPayloadPaid: legacyHtml(
                            playerPayload.paid && playerPayload.paid[component]
                              ? ` · you paid ${credits2(playerPayload.paid[component])}`
                              : '',
                          ),
                          bestSaleResultJumps2: legacyHtml(
                            bestSaleResult.jumps
                              ? renderInfoUiInfoHtmlFragment008({
                                  bestSaleResultPSystem: legacyHtml(bestSaleResult.p.system),
                                })
                              : '',
                          ),
                        })
                      : renderInfoUiInfoHtmlFragment009(),
                  ),
                  count: legacyHtml(count),
                  inSpace: legacyHtml(
                    inSpace
                      ? renderInfoUiInfoHtmlFragment010({
                          component: legacyHtml(component),
                          MathMin: legacyHtml(Math.min(5, count)),
                          component2: legacyHtml(component),
                        })
                      : '',
                  ),
                  grades: legacyHtml(grades),
                });
              })
              .join('')
          : renderInfoUiInfoHtmlFragment011(),
      ),
      cargoLength2: legacyHtml(
        cargo.length
          ? renderInfoUiInfoHtmlFragment012({
              inSpace: legacyHtml(
                inSpace
                  ? 'Jettisoned cargo floats free. Raiders chasing you often go for it instead.'
                  : 'You can jettison cargo in space.',
              ),
            })
          : '',
      ),
      playerPayloadMissions: legacyHtml(
        (playerPayload.missions || [])
          .filter((mission) => mission.qty)
          .map((mission) =>
            renderInfoUiInfoHtmlFragment013({
              missionTitle: mission.title,
              missionQty: legacyHtml(mission.qty),
            }),
          )
          .join('') || renderInfoUiInfoHtmlFragment014(),
      ),
    });
  }
  if (activeTab === 'career') return careerHtml(clientGameState); // 2.4
  if (activeTab === 'fleet') {
    const order3 = clientGameState.order || 'gather';
    return renderInfoUiInfoHtmlFragment015({
      order2Map: legacyHtml(
        order2
          .map(([entryKey, count, entryKey2]) =>
            renderInfoUiInfoHtmlFragment016({
              order3: legacyHtml(order3 === entryKey ? 'on' : ''),
              entryKey: legacyHtml(entryKey),
              count: legacyHtml(count),
              entryKey2: legacyHtml(entryKey2),
            }),
          )
          .join(''),
      ),
      playerPayloadDocks: legacyHtml(
        playerPayload.docks
          ? ` · DOCK ${playerPayload.docks.list[playerPayload.docks.active].letter}`
          : '',
      ),
      constValue: legacyHtml(
        (() => {
          const entryKey =
              playerPayload.docks && playerPayload.docks.list[playerPayload.docks.active],
            webSocket = entryKey ? entryKey.wings.filter(Boolean) : [];
          return webSocket.length
            ? webSocket
                .map((dockShipPayload) => {
                  const shipHullAsset = clientGameState.A!.ships[dockShipPayload!.hull] || {};
                  return renderInfoUiInfoHtmlFragment017({
                    artworkUrl: legacyHtml(artworkUrl(shipHullAsset.img!)),
                    dockShipPayload: dockShipPayload!.name,
                    dockShipPayload2: legacyHtml(
                      dockShipPayload!.repairT ? 'under repair' : escapeHtml(shipHullAsset.name),
                    ),
                  });
                })
                .join('')
            : renderInfoUiInfoHtmlFragment018();
        })(),
      ),
    });
  }
  // captains
  const list = (clientGameState.rivals || [])
      .slice()
      .sort((firstValue, secondValue) => secondValue.rel - firstValue.rel),
    seen = new Set(playerPayload.explored || []);
  return renderInfoUiInfoHtmlFragment019({
    list: legacyHtml(
      list
        .map((radius) =>
          renderInfoUiInfoHtmlFragment020({
            radiusName: radius.name,
            radiusKind: radius.kind,
            FACTIONS: legacyHtml(FACTIONS[radius.fac] ? FACTIONS[radius.fac].color : '#aaa'),
            FACTIONS2: FACTIONS[radius.fac] ? FACTIONS[radius.fac].short : radius.fac,
            radiusShip: radius.ship,
            radiusSys: legacyHtml(
              radius.sys
                ? seen.has(radius.sys)
                  ? escapeHtml(systemsById[radius.sys].name)
                  : renderInfoUiInfoHtmlFragment021()
                : renderInfoUiInfoHtmlFragment022(),
            ),
            MOODC: legacyHtml(MOODC[radius.mood]),
            radiusMood: legacyHtml(radius.mood[0].toUpperCase() + radius.mood.slice(1)),
            radiusRel: legacyHtml(radius.rel),
          }),
        )
        .join(''),
    ),
  });
}

// everything you own and everything you have done, on one page

/**
 * Renders the career overview ledger (holdings, net worth, story progress, exploration record).
 * @param clientGameState Game state object
 * @returns HTML markup
 */
function careerHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    assets = clientGameState.A!,
    shipVal = (ship: { hull: string | number } | null | undefined) =>
      ship && assets.ships[ship.hull] ? assets.ships[ship.hull].cost || 0 : 0;
  const stored = (playerPayload.dock || []).map((storedShip) => storedShip.ship).filter(Boolean),
    cargoVal = Object.entries(playerPayload.cargo || {}).reduce(
      (firstValue, [component, count]) =>
        firstValue +
        (COMMODITIES.find((commodityDef) => commodityDef.id === component) || { base: 0 }).base *
          count,
      0,
    );
  const crates = MATERIALS.reduce(
    (firstValue, message) =>
      firstValue +
      (playerPayload.mats[message] || []).reduce((secondValue, count) => secondValue + count, 0),
    0,
  );
  const worth =
    playerPayload.credits +
    (playerPayload.shipless ? 0 : shipVal(playerPayload.ship)) +
    stored.reduce((firstValue, loadout) => firstValue + shipVal(loadout), 0) +
    cargoVal -
    (playerPayload.loan ? playerPayload.loan.bal : 0);
  const keyValueRow = (entryKey: string, value: string | number) =>
    renderInfoUiCareerHtmlFragment023({ entryKey: legacyHtml(entryKey), value: legacyHtml(value) });
  const stationState = playerPayload.station || {},
    site = stationState.site && STELLARS[stationState.site],
    state = playerPayload.stats || {},
    quantity = playerPayload.quests || { done: [], active: [] },
    screenY = playerPayload.story || {};
  const officers2 = (playerPayload.officers || []).reduce(
    (firstValue, officer) => (
      (firstValue[officer.rarity] = (firstValue[officer.rarity] || 0) + 1),
      firstValue
    ),
    {} as Record<number, number>,
  );
  const join2 = Object.entries(playerPayload.bp || {})
    .filter(([identifier, count]) => count > 0 && SPEC[identifier])
    .map(([identifier, count]) =>
      renderInfoUiCareerHtmlFragment024({
        SPEC: SPEC[identifier].name,
        MathMin: legacyHtml(Math.min(count, BP_NEED)),
        BP_NEED: legacyHtml(BP_NEED),
        count: legacyHtml(count >= BP_NEED ? renderInfoUiCareerHtmlFragment025() : ''),
      }),
    )
    .join('');
  const docks = playerPayload.docks
    ? playerPayload.docks.list
        .map((entryKey) =>
          renderInfoUiCareerHtmlFragment026({
            entryKeyLetter: legacyHtml(entryKey.letter),
            entryKeyLetter2: legacyHtml(
              entryKey.letter === playerPayload.docks.list[playerPayload.docks.active].letter
                ? renderInfoUiCareerHtmlFragment027()
                : '',
            ),
            entryKeyLead: legacyHtml(
              entryKey.lead && assets.ships[entryKey.lead.hull]
                ? escapeHtml(assets.ships[entryKey.lead.hull].name)
                : renderInfoUiCareerHtmlFragment028(),
            ),
            entryKeyWingsFilter: legacyHtml(
              entryKey.wings.filter(Boolean).length
                ? ` + ${entryKey.wings.filter(Boolean).length} wing`
                : '',
            ),
          }),
        )
        .join('')
    : '';
  return renderInfoUiCareerHtmlFragment029({
    keyValueRow: legacyHtml(
      keyValueRow(
        renderInfoUiCareerHtmlFragment030(),
        renderInfoUiCareerHtmlFragment031({ credits2: legacyHtml(credits2(worth)) }),
      ),
    ),
    keyValueRow2: legacyHtml(keyValueRow('Credits', credits2(playerPayload.credits))),
    playerPayloadLoan: legacyHtml(
      playerPayload.loan ? keyValueRow('Loan', `−${credits2(playerPayload.loan.bal)}`) : '',
    ),
    keyValueRow3: legacyHtml(
      keyValueRow(
        'Ships',
        renderInfoUiCareerHtmlFragment032({
          playerPayloadShipless: legacyHtml((playerPayload.shipless ? 0 : 1) + stored.length),
          credits2: legacyHtml(
            credits2(
              (playerPayload.shipless ? 0 : shipVal(playerPayload.ship)) +
                stored.reduce((firstValue, loadout) => firstValue + shipVal(loadout), 0),
            ),
          ),
        }),
      ),
    ),
    docks: legacyHtml(docks),
    keyValueRow4: legacyHtml(
      keyValueRow(
        'Personal Station',
        site
          ? `Station Tier ${stationState.ops} · ${escapeHtml(systemsById[site.system].name)}`
          : renderInfoUiCareerHtmlFragment033(),
      ),
    ),
    keyValueRow5: legacyHtml(
      keyValueRow(
        'Colonies',
        (playerPayload.colonies || []).length
          ? playerPayload.colonies
              .map((component) => `${escapeHtml(component.name)} (Lv ${component.lv})`)
              .join(', ')
          : renderInfoUiCareerHtmlFragment034(),
      ),
    ),
    keyValueRow6: legacyHtml(
      keyValueRow(
        'Officers',
        (playerPayload.officers || []).length
          ? Object.entries(officers2)
              .sort((firstValue, secondValue) => Number(secondValue[0]) - Number(firstValue[0]))
              .map(([radius, count]) =>
                renderInfoUiCareerHtmlFragment035({
                  RARITY: legacyHtml(RARITY[Number(radius)].color),
                  count: legacyHtml(count),
                  RARITY2: legacyHtml(RARITY[Number(radius)].name),
                }),
              )
              .join(', ')
          : renderInfoUiCareerHtmlFragment036(),
      ),
    ),
    keyValueRow7: legacyHtml(keyValueRow('Material crates', crates)),
    keyValueRow8: legacyHtml(
      keyValueRow(
        'Cargo',
        renderInfoUiCareerHtmlFragment037({
          playerPayloadCargoUsed: legacyHtml(playerPayload.cargoUsed || 0),
          credits2: legacyHtml(credits2(cargoVal)),
        }),
      ),
    ),
    join2: legacyHtml(join2 ? renderInfoUiCareerHtmlFragment038({ join2: legacyHtml(join2) }) : ''),
    keyValueRow9: legacyHtml(
      keyValueRow(
        'Main story',
        screenY.pass
          ? 'complete'
          : `chapter ${Math.min((screenY.step || 0) + 1, screenY.total || 1)} of ${screenY.total || '?'}`,
      ),
    ),
    keyValueRow10: legacyHtml(
      keyValueRow(
        'Side stories',
        `${quantity.done.filter((positionX) => positionX.side).length} of 6`,
      ),
    ),
    keyValueRow11: legacyHtml(
      keyValueRow(
        'Contact stories',
        `${quantity.done.filter((positionX) => !positionX.side).length} finished · ${Object.values(quantity.contacts || {}).filter((component) => component.n >= 2).length} trusted contacts`,
      ),
    ),
    keyValueRow12: legacyHtml(
      keyValueRow(
        'Faction stories',
        `${(playerPayload.arcs || []).filter((firstValue) => firstValue.done).length} of ${(playerPayload.arcs || []).length}`,
      ),
    ),
    keyValueRow13: legacyHtml(
      keyValueRow('Farside expeditions', (playerPayload.expd && playerPayload.expd.n) || 0),
    ),
    keyValueRow14: legacyHtml(
      keyValueRow(
        'Combat rating',
        renderInfoUiCareerHtmlFragment039({
          playerPayloadRank: (playerPayload.rank || {}).name || 'Harmless',
        }),
      ),
    ),
    keyValueRow15: legacyHtml(keyValueRow('Ships destroyed', credits2(state.kills || 0))),
    keyValueRow16: legacyHtml(
      keyValueRow(
        'Systems explored',
        `${(playerPayload.explored || []).length} of ${SYSTEMS.filter((starSystem) => !starSystem.arena).length}`,
      ),
    ),
    keyValueRow17: legacyHtml(keyValueRow('Jumps made', credits2(state.jumps || 0))),
    keyValueRow18: legacyHtml(keyValueRow('Credits earned', credits2(state.earned || 0))),
    stateMined: legacyHtml(
      state.mined ? keyValueRow('Ore mined', `${credits2(state.mined)} t`) : '',
    ),
    quantityActive: legacyHtml(
      (quantity.active || []).length
        ? renderInfoUiCareerHtmlFragment040({
            quantityActiveMap: legacyHtml(
              quantity.active
                .map((firstValue) =>
                  renderInfoUiCareerHtmlFragment041({
                    firstValueSide: legacyHtml(firstValue.side ? '★' : '✦'),
                    firstValueName: firstValue.name,
                    firstValueStep: legacyHtml(firstValue.step + 1),
                    firstValueOf: legacyHtml(firstValue.of),
                  }),
                )
                .join(''),
            ),
          })
        : '',
    ),
  });
}

// where a good in your hold sells best, among the markets you have visited within four jumps

/**
 * Finds the nearby explored trade port within four jumps offering the best sale price for a commodity.
 * @param clientGameState Game state object
 * @param captainId Commodity identifier
 * @returns Best sale location, price, and jumps distance or null
 */
export function bestSale(
  clientGameState: ClientGameState,
  captainId: string,
): BestSaleResult | null {
  const playerPayload = clientGameState.you!,
    seen = new Set(playerPayload.explored || []),
    distance: Record<string, number> = { [clientGameState.sys!]: 0 },
    quantity = [clientGameState.sys!],
    currentTime = Date.now();
  let best = null;
  while (quantity.length) {
    const state = quantity.shift()!;
    if (distance[state] >= 4) continue;
    for (const length of systemsById[state] ? systemsById[state].links : [])
      if (distance[length] === undefined) {
        distance[length] = distance[state] + 1;
        quantity.push(length);
      }
  }
  for (const [sessionId, innerIndex] of Object.entries(distance)) {
    if (!seen.has(sessionId) && sessionId !== clientGameState.sys) continue;
    for (const rawStellarBody of systemsById[sessionId].stellars) {
      const stellarBody = STELLARS[rawStellarBody.id];
      if (!stellarBody || stellarBody.site || !(stellarBody.svc || '').includes('T')) continue;
      const price2 = price(stellarBody, captainId, currentTime);
      if (price2 === null) continue;
      if (!best || price2 - innerIndex * 6 > best.price - best.jumps * 6)
        best = { p: stellarBody, price: price2, jumps: innerIndex };
    }
  }
  return best;
}
