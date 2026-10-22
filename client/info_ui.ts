import type { StellarBody } from '../server/game.ts';
import type { ClientGameState } from './main.ts';
export type InfoTab = 'ship' | 'career' | 'fleet' | 'captains';
export type BestSaleResult = { p: StellarBody; price: number; jumps: number };
export type RivalCaptain = {
  name: string;
  kind: string;
  fac: string;
  ship: string;
  sys?: string | null;
  mood: 'nemesis' | 'rival' | 'neutral' | 'friendly' | 'ally';
  rel: number;
};
export type ShipStats = {
  shield: number;
  armor: number;
  maxSpeed: number;
  turn: number;
  cargo: number;
  space: number;
  free: number;
  guns: number;
  maxGuns: number;
  turrets: number;
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
 * BestSaleResult fields:
 * p: Stellar body object
 * price: Commodity price per ton
 * jumps: Jumps distance
 */

/**
 * RivalCaptain fields:
 * name: Captain name
 * kind: Career type
 * fac: Faction identifier
 * ship: Ship hull name
 * [sys]: Current system ID
 * mood: Standing category
 * rel: Standing relationship score
 */

/**
 * ShipStats fields:
 * shield: Shield strength
 * armor: Armor strength
 * maxSpeed: Maximum forward speed
 * turn: Turn rate
 * cargo: Cargo capacity in tons
 * space: Total outfit space
 * free: Available free outfit space
 * guns: Equipped gun count
 * maxGuns: Maximum gun mounts
 * turrets: Equipped turret count
 * maxTurrets: Maximum turret mounts
 */

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
    return `<div class="igrid"><div>
      <div class="sect" style="margin-top:0">SHIP</div>
      ${
        playerPayload.shipless
          ? '<p class="dim">No active ship.</p>'
          : `<div style="display:flex;gap:10px;align-items:center"><img src="${artworkUrl(shipHullAsset.img!)}" style="width:120px;height:90px;object-fit:contain"><div><b style="color:#fff;font-size:15px">${escapeHtml(shipHullAsset.name)}</b><div class="dim">"${escapeHtml(playerPayload.ship.name)}"</div></div></div>
      <div class="kv"><span>Shield / armor</span><span>${credits2(computedShipStats.shield)} / ${credits2(computedShipStats.armor)}</span></div><div class="kv"><span>Speed / turn</span><span>${credits2(computedShipStats.maxSpeed / 0.45)} / ${credits2((computedShipStats.turn * 57.3) / 3)}</span></div>
      <div class="kv"><span>Cargo</span><span>${playerPayload.cargoUsed} / ${computedShipStats.cargo} t</span></div><div class="kv"><span>Passenger seats</span><span>${(playerPayload.missions || []).filter((mission) => mission.type === 'passenger').reduce((sumValues, mission) => sumValues + (mission.pax || 0), 0)} / ${computedShipStats.passengerSeats} occupied</span></div><div class="kv"><span>Outfit space</span><span>${computedShipStats.free} of ${computedShipStats.space} free</span></div>
      <div class="kv"><span>Guns / turrets</span><span>${computedShipStats.guns}/${computedShipStats.maxGuns} · ${computedShipStats.turrets}/${computedShipStats.maxTurrets}</span></div><div class="kv"><span>Fuel</span><span>${Math.floor(((clientGameState.view && clientGameState.view.fuel) ?? playerPayload.fuel) / 100)} jumps</span></div>`
      }
      <div class="sect">COMBAT RATING</div><div class="kv"><span><b style="color:#ffd27a">${escapeHtml(rank.name)}</b></span><span class="dim">${credits2(rank.score)}${rank.next ? ` / ${credits2(rank.next)}` : ''}</span></div>
      <div class="rbar"><i style="width:${progressBar}%"></i></div><div class="dim small">Destroying ships raises your rating. Competent captains are offered Wanted contracts, and Dangerous ones get elite contracts.</div>
      <div class="sect">RECORD</div>${synBadge(playerPayload)}<div class="kv"><span>Commendations</span><span>${playerPayload.shards || 0}</span></div>
      <div class="kv"><span>Credit rating</span><span>${playerPayload.credit || 600}${playerPayload.loan ? ` · loan ${credits2(playerPayload.loan.bal)} cr` : ''}</span></div>
      <div class="kv"><span>Faction stories</span><span>${(playerPayload.arcs || []).filter((firstValue) => firstValue.done).length} of ${(playerPayload.arcs || []).length} complete</span></div>
      <div class="kv"><span>Farside expeditions</span><span>${(playerPayload.expd && playerPayload.expd.n) || 0} decoded</span></div>
    </div><div>
      <div class="sect" style="margin-top:0">CARGO</div>
      ${
        cargo.length
          ? cargo
              .map(([component, count]) => {
                const commodityDef = COMMODITIES.find(
                  (commodityDef) => commodityDef.id === component,
                );
                const bestSaleResult = bestSale(clientGameState, component);
                const grades = Object.entries(playerPayload.cargoLots?.byCommodity[component] || {})
                  .filter(([, quantity]) => quantity > 0)
                  .map(
                    ([game, quantity]) =>
                      `<div class="kv small"><span>↳ ${game}</span><span>${quantity} t ${inSpace ? `<button class="btn sm" data-jet="${component}" data-grade="${game}" data-n="${Math.min(5, quantity)}">DUMP ${Math.min(5, quantity)}</button> <button class="btn sm" data-jet="${component}" data-grade="${game}" data-n="${quantity}">DUMP ALL ${game.toUpperCase()}</button>` : ''}</span></div>`,
                  )
                  .join('');
                return `<div class="kv"><span>${escapeHtml(commodityDef ? commodityDef.name : component)}${bestSaleResult ? `<div class="small dim">Best nearby: <b style="color:var(--cr)">${credits2(bestSaleResult.price)}</b> at ${escapeHtml(bestSaleResult.p.name)}${bestSaleResult.jumps ? ` (${bestSaleResult.jumps} jump${bestSaleResult.jumps > 1 ? 's' : ''})` : ' (this system)'}${playerPayload.paid && playerPayload.paid[component] ? ` · you paid ${credits2(playerPayload.paid[component])}` : ''} ${bestSaleResult.jumps ? `<button class="btn sm" data-plot="${bestSaleResult.p.system}">PLOT</button>` : ''}</div>` : '<div class="small dim">No market you have visited nearby buys this.</div>'}</span><span>${count} t ${inSpace ? `<button class="btn sm" data-jet="${component}" data-n="${Math.min(5, count)}">DUMP 5</button> <button class="btn sm" data-jet="${component}" data-n="0">DUMP ALL</button>` : ''}</span></div>${grades}`;
              })
              .join('')
          : '<p class="dim">The hold is empty.</p>'
      }
      ${cargo.length ? `<div class="dim small">${inSpace ? 'Jettisoned cargo floats free. Raiders chasing you often go for it instead.' : 'You can jettison cargo in space.'}</div>` : ''}
      <div class="sect">MISSION CARGO</div>${
        (playerPayload.missions || [])
          .filter((mission) => mission.qty)
          .map(
            (mission) =>
              `<div class="kv"><span>${escapeHtml(mission.title)}</span><span>${mission.qty} t</span></div>`,
          )
          .join('') || '<p class="dim">None.</p>'
      }
    </div></div>`;
  }
  if (activeTab === 'career') return careerHtml(clientGameState); // 2.4
  if (activeTab === 'fleet') {
    const order3 = clientGameState.order || 'gather';
    return `<div class="sect" style="margin-top:0">WINGMATE ORDERS</div><div class="dim small" style="margin-bottom:6px">Orders apply to your escorts, wingmates and fighters. Give the same order again to cancel it.</div>
      <div class="ords">${order2.map(([entryKey, count, entryKey2]) => `<button class="btn ${order3 === entryKey ? 'on' : ''}" data-ord="${entryKey}">${count} <span class="dim small">(${entryKey2})</span></button>`).join('')}</div>
      <div class="sect">WINGMATES${playerPayload.docks ? ` · DOCK ${playerPayload.docks.list[playerPayload.docks.active].letter}` : ''}</div>${(() => {
        const entryKey =
            playerPayload.docks && playerPayload.docks.list[playerPayload.docks.active],
          webSocket = entryKey ? entryKey.wings.filter(Boolean) : [];
        return webSocket.length
          ? webSocket
              .map((dockShipPayload) => {
                const shipHullAsset = clientGameState.A!.ships[dockShipPayload!.hull] || {};
                return `<div class="kv"><span><img src="${artworkUrl(shipHullAsset.img!)}" style="width:40px;height:28px;object-fit:contain;vertical-align:middle"> ${escapeHtml(dockShipPayload!.name)}</span><span class="dim">${dockShipPayload!.repairT ? 'under repair' : escapeHtml(shipHullAsset.name)}</span></div>`;
              })
              .join('')
          : '<p class="dim">No wingmates in your active dock. Assign stored ships as wingmates at your Personal Station (STATION, then DOCKS).</p>';
      })()}`;
  }
  // captains
  const list = (clientGameState.rivals || [])
      .slice()
      .sort((firstValue, secondValue) => secondValue.rel - firstValue.rel),
    seen = new Set(playerPayload.explored || []);
  return `<div class="dim small" style="margin-bottom:6px">Thirty captains with careers of their own. Hail them (T) to talk. Help them in a fight and they warm to you; fire on them and they will remember.</div>
    <table class="tbl"><tr><th>CAPTAIN</th><th>CAREER</th><th>FLAG</th><th>SHIP</th><th>LAST SEEN</th><th>STANDING</th></tr>${list
      .map(
        (
          radius,
        ) => `<tr><td><b>${escapeHtml(radius.name)}</b></td><td>${escapeHtml(radius.kind)}</td><td><span style="color:${FACTIONS[radius.fac] ? FACTIONS[radius.fac].color : '#aaa'}">${escapeHtml(FACTIONS[radius.fac] ? FACTIONS[radius.fac].short : radius.fac)}</span></td><td>${escapeHtml(radius.ship)}</td>
      <td>${radius.sys ? (seen.has(radius.sys) ? escapeHtml(systemsById[radius.sys].name) : '<span class="dim">uncharted space</span>') : '<span class="dim">grounded</span>'}</td><td style="color:${MOODC[radius.mood]}">${radius.mood[0].toUpperCase() + radius.mood.slice(1)} (${radius.rel})</td></tr>`,
      )
      .join('')}</table>`;
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
    `<div class="kv"><span>${entryKey}</span><span>${value}</span></div>`;
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
    .map(
      ([identifier, count]) =>
        `<div class="kv small"><span>${escapeHtml(SPEC[identifier].name)}</span><span>${Math.min(count, BP_NEED)} / ${BP_NEED}${count >= BP_NEED ? ' <b style="color:var(--ok)">ready</b>' : ''}</span></div>`,
    )
    .join('');
  const docks = playerPayload.docks
    ? playerPayload.docks.list
        .map(
          (entryKey) =>
            `<div class="kv small"><span>Dock ${entryKey.letter}${entryKey.letter === playerPayload.docks.list[playerPayload.docks.active].letter ? ' <span style="color:var(--ok)">(active)</span>' : ''}</span><span>${entryKey.lead && assets.ships[entryKey.lead.hull] ? escapeHtml(assets.ships[entryKey.lead.hull].name) : '<span class="dim">no lead</span>'}${entryKey.wings.filter(Boolean).length ? ` + ${entryKey.wings.filter(Boolean).length} wing` : ''}</span></div>`,
        )
        .join('')
    : '';
  return `<div class="igrid"><div>
    <div class="sect" style="margin-top:0">HOLDINGS</div>
    ${keyValueRow('<b>Net worth</b>', `<b class="cr">${credits2(worth)} cr</b>`)}${keyValueRow('Credits', credits2(playerPayload.credits))}${playerPayload.loan ? keyValueRow('Loan', `−${credits2(playerPayload.loan.bal)}`) : ''}
    ${keyValueRow('Ships', `${(playerPayload.shipless ? 0 : 1) + stored.length} <span class="dim small">(${credits2((playerPayload.shipless ? 0 : shipVal(playerPayload.ship)) + stored.reduce((firstValue, loadout) => firstValue + shipVal(loadout), 0))} cr)</span>`)}${docks}
    ${keyValueRow('Personal Station', site ? `Station Tier ${stationState.ops} · ${escapeHtml(systemsById[site.system].name)}` : '<span class="dim">none yet</span>')}
    ${keyValueRow('Colonies', (playerPayload.colonies || []).length ? playerPayload.colonies.map((component) => `${escapeHtml(component.name)} (Lv ${component.lv})`).join(', ') : '<span class="dim">none</span>')}
    ${keyValueRow(
      'Officers',
      (playerPayload.officers || []).length
        ? Object.entries(officers2)
            .sort((firstValue, secondValue) => Number(secondValue[0]) - Number(firstValue[0]))
            .map(
              ([radius, count]) =>
                `<span style="color:${RARITY[Number(radius)].color}">${count} ${RARITY[Number(radius)].name}</span>`,
            )
            .join(', ')
        : '<span class="dim">none</span>',
    )}
    ${keyValueRow('Material crates', crates)}${keyValueRow('Cargo', `${playerPayload.cargoUsed || 0} t <span class="dim small">(about ${credits2(cargoVal)} cr)</span>`)}
    ${join2 ? `<div class="sect">BLUEPRINTS</div>${join2}` : ''}
  </div><div>
    <div class="sect" style="margin-top:0">PROGRESS</div>
    ${keyValueRow('Main story', screenY.pass ? 'complete' : `chapter ${Math.min((screenY.step || 0) + 1, screenY.total || 1)} of ${screenY.total || '?'}`)}
    ${keyValueRow('Side stories', `${quantity.done.filter((positionX) => positionX.side).length} of 6`)}${keyValueRow('Contact stories', `${quantity.done.filter((positionX) => !positionX.side).length} finished · ${Object.values(quantity.contacts || {}).filter((component) => component.n >= 2).length} trusted contacts`)}
    ${keyValueRow('Faction stories', `${(playerPayload.arcs || []).filter((firstValue) => firstValue.done).length} of ${(playerPayload.arcs || []).length}`)}${keyValueRow('Farside expeditions', (playerPayload.expd && playerPayload.expd.n) || 0)}
    ${keyValueRow('Combat rating', `<b style="color:#ffd27a">${escapeHtml((playerPayload.rank || {}).name || 'Harmless')}</b>`)}${keyValueRow('Ships destroyed', credits2(state.kills || 0))}
    ${keyValueRow('Systems explored', `${(playerPayload.explored || []).length} of ${SYSTEMS.filter((starSystem) => !starSystem.arena).length}`)}${keyValueRow('Jumps made', credits2(state.jumps || 0))}
    ${keyValueRow('Credits earned', credits2(state.earned || 0))}${state.mined ? keyValueRow('Ore mined', `${credits2(state.mined)} t`) : ''}
    ${(quantity.active || []).length ? `<div class="sect">STORIES UNDER WAY</div>${quantity.active.map((firstValue) => `<div class="kv small"><span>${firstValue.side ? '★' : '✦'} ${escapeHtml(firstValue.name)}</span><span class="dim">step ${firstValue.step + 1} of ${firstValue.of}</span></div>`).join('')}` : ''}
  </div></div>`;
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
