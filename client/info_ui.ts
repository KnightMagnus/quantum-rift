import { captainLogHtml } from './captain-log.ts';
import { FACTION_STORE_OUTFITS } from '../shared/faction-outfits.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import type { StellarBody } from '../server/game.ts';
import type { ClientGameState } from './main.ts';
export type InfoTab = 'ship' | 'career' | 'fleet' | 'captains' | 'log';
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
// Ship details (I) and Captain (O) share the information window.
import {
  SYS as systemsById,
  SYSTEMS,
  PERSONAL_SYSTEMS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
} from '../shared/galaxy.ts';
import { SPEC, BP_NEED } from '../shared/specialty.ts';
import { RARITY } from '../shared/hangar.ts';
import { RANKS } from '../shared/rivals.ts';
import { synBadge } from './syn_ui.ts';
import {
  price,
  allOutfits,
  outfitSaleValue,
  fixedWeaponSaleValue,
  weaponParams,
  makeLoadout,
} from '../shared/rules.ts';

/** Equipped gear previews and authoritative outfitter sale requests. */
function equippedOutfitsHtml(state: ClientGameState): string {
  const ship = state.you!.ship;
  if (state.you!.shipless) return '';
  const assets = state.A!;
  const catalog = allOutfits(assets);
  const atOutfitter = !!state.landed?.outfitter;
  const entries = Object.entries(ship.outfits || {})
    .filter(([, count]) => count > 0)
    .map(([identifier, count]) => {
      const outfit = catalog[identifier];
      if (!outfit) return '';
      const weapon = outfit.eff?.weapon && assets.weapons[outfit.eff.weapon];
      const stock = makeLoadout(assets, ship.hull).outfits[identifier] || 0;
      const factory = Math.min(
        count,
        ship.stockOutfits ? ship.stockOutfits[identifier] || 0 : stock,
      );
      const refund = outfitSaleValue(
        assets,
        {
          ...ship,
          stockOutfits: ship.stockOutfits ? { ...ship.stockOutfits } : undefined,
        },
        identifier,
        1,
      );
      const tradeable = Number(identifier) !== 9021;
      return equipmentCard(
        identifier,
        outfit.name,
        count,
        outfit.icon,
        [
          weapon ? (weapon.mining ? 'Mining weapon' : 'Weapon') : 'Outfit',
          factory ? `${factory} factory fitted` : '',
          `${outfit.mass || 0} t each`,
        ]
          .filter(Boolean)
          .join(' · '),
        outfit.desc || '',
        refund,
        false,
        tradeable,
      );
    });
  for (const [identifier, count] of ship.fixed ?? assets.ships[ship.hull].weapons) {
    if (count <= 0) continue;
    const weapon = assets.weapons[identifier];
    if (!weapon) continue;
    const matching = Object.values(catalog).find(
      (outfit) => outfit.eff?.weapon === Number(identifier),
    );
    const detail =
      weapon.type === 'bay'
        ? 'Fighter bay'
        : `${Math.round((weapon.dmgA || 0) + (weapon.dmgS || 0))} damage · ${Math.round(weaponParams(weapon).range)} range`;
    entries.push(
      equipmentCard(
        String(identifier),
        weapon.name,
        count,
        matching?.icon,
        `Built-in · ${detail}`,
        'Built-in weapons are not stocked separately. Selling removes one from this ship.',
        fixedWeaponSaleValue(assets, ship, identifier),
        true,
        true,
      ),
    );
  }
  return `<section class="equipped-outfits" aria-label="Equipped outfits"><div class="sect" style="margin-top:0">EQUIPPED OUTFITS</div>
    <p class="dim small">${atOutfitter ? 'Sell removes one fitted item.' : 'Land at an outfitter to sell equipment.'}</p>
    <div class="equipment-list">${entries.join('') || '<p class="dim">No equipment fitted.</p>'}</div></section>`;

  function equipmentCard(
    identifier: string,
    name: string,
    count: number,
    icon: string | undefined,
    detail: string,
    description: string,
    refund: number,
    fixed: boolean,
    tradeable: boolean,
  ) {
    return `<article class="equipment-card" data-equipped="${escapeHtml(identifier)}"${fixed ? ' data-built-in="true"' : ''}>
      ${icon ? `<img src="${artworkUrl(icon)}" alt="" loading="lazy">` : '<span class="equipment-fallback" aria-hidden="true">⚙</span>'}
      <div class="equipment-detail"><b>${escapeHtml(name)} ×${count}</b><div class="dim small">${escapeHtml(detail)}</div>${description ? `<div class="small">${escapeHtml(description)}</div>` : ''}${!fixed && FACTION_STORE_OUTFITS.some((outfit) => String(outfit.id) === identifier) ? '<div class="dim small">Selling refunds credits only. Store tokens are not refunded.</div>' : ''}</div>
      ${tradeable ? `<button class="btn sm" data-sell-outfit="${escapeHtml(identifier)}"${fixed ? ' data-fixed-weapon="true"' : ''} aria-label="Sell one ${escapeHtml(name)} for ${credits2(refund)} credits"${atOutfitter ? '' : ' disabled title="Land at an outfitter to sell"'}>SELL 1<span class="dim small">${credits2(refund)} cr</span></button>` : '<span class="dim small">Not for sale</span>'}
    </article>`;
  }
}

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
 * Renders ship equipment, stats and cargo, or the selected Captain tab.
 * @param clientGameState Game state object
 * @param activeTab Sub-tab to render ('ship', 'career', 'fleet', or 'captains')
 * @returns HTML markup
 */
export function infoHtml(clientGameState: ClientGameState, activeTab?: string): string {
  const playerPayload = clientGameState.you!;
  if (!playerPayload) return '';
  if (activeTab === 'log') return captainLogHtml(clientGameState);
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
      ${equippedOutfitsHtml(clientGameState)}
      <div class="sect">CARGO</div>
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
    ${playerPayload.story?.flags?.title ? keyValueRow('Title', escapeHtml(playerPayload.story.flags.title)) : ''}${keyValueRow('Combat rating', `<b style="color:#ffd27a">${escapeHtml((playerPayload.rank || {}).name || 'Harmless')}</b>`)}${keyValueRow('Ships destroyed', credits2(state.kills || 0))}
    ${keyValueRow('Systems explored', `${(playerPayload.explored || []).filter((id) => id !== 'founding-vigil' && storySystemVisible(playerPayload.story?.flags, id)).length} of ${[...SYSTEMS, ...PERSONAL_SYSTEMS].filter((starSystem) => !starSystem.arena && starSystem.id !== 'founding-vigil' && storySystemVisible(playerPayload.story?.flags, starSystem.id)).length}`)}${keyValueRow('Jumps made', credits2(state.jumps || 0))}
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
