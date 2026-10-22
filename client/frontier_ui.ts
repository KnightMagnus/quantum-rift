import type { PlayerPayload as PlayerData } from './main.ts';
import type { ClientGameState } from './main.ts';
export type ColonyData = {
  open?: boolean;
  own?: boolean;
  name: string;
  owner?: string;
  lv: number;
  buildings: string[];
  store: Record<string, number>;
};
export type ExchangeOrder = {
  id: string;
  side: 'buy' | 'sell';
  item: { id: string; name: string; cost: number };
  qty: number;
  price: number;
};
export type ExchangeBookEntry = {
  item: { id: string; name: string; cost: number };
  bid?: number;
  bids: number;
  ask?: number;
  asks: number;
};
export type CaptainProfile = {
  name: string;
  online: boolean;
  ship: string;
  shipName: string;
  site?: string;
  ops?: number;
  colonies: string[];
  kills: number;
  jumps: number;
  mined: number;
  earned: number;
  arena?: { rating: number; w: number; l: number };
  mastery?: { ship: string; tier: number };
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

/** @import { PlayerData } from '../server/game.ts' */
/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {Object} ColonyData
 * @property {boolean} [open] Whether world is unsettled
 * @property {boolean} [own] Whether settled by player
 * @property {string} name Colony name
 * @property {string} [owner] Owner captain name
 * @property {number} lv Colony level
 * @property {string[]} buildings Installed building types
 * @property {Record<string, number>} store Stockpile resource amounts
 */

/**
 * @typedef {Object} ExchangeOrder
 * @property {string} id Order ID
 * @property {'buy'|'sell'} side Order side
 * @property {{id: string, name: string, cost: number}} item Order item specification
 * @property {number} qty Quantity
 * @property {number} price Unit price
 */

/**
 * @typedef {Object} ExchangeBookEntry
 * @property {{id: string, name: string, cost: number}} item Item spec
 * @property {number} [bid] Best bid price
 * @property {number} bids Number of bids
 * @property {number} [ask] Best ask price
 * @property {number} asks Number of asks
 */

/**
 * @typedef {Object} CaptainProfile
 * @property {string} name Captain name
 * @property {boolean} online Online status
 * @property {string} ship Current ship hull name
 * @property {string} shipName Custom ship name
 * @property {string} [site] Personal station site name
 * @property {number} [ops] Station Tier
 * @property {string[]} colonies List of settled colony names
 * @property {number} kills Total kills
 * @property {number} jumps Total jumps
 * @property {number} mined Total ore mined in tons
 * @property {number} earned Total credits earned
 * @property {{ rating: number, w: number, l: number }} [arena] Arena stats
 * @property {{ ship: string, tier: number }} [mastery] Best ship mastery
 * @property {number} officers Total officers
 */

/**
 * Formats a list of required material tuples with availability coloring.
 * @param {PlayerData} positionY Player state object
 * @param {Array<[string, number, number]>} list Array of [material, grade, quantity] tuples
 * @returns {string} HTML markup
 */
const mats = (playerPayload: PlayerData, list: Array<[string, number, number]>): string =>
  list
    .map(
      ([message, game, count]) =>
        `<span style="color:${playerPayload.mats[message][game] >= count ? '#8ff0ad' : '#ff9a8a'}">${count > 1 ? count + ' ' : ''}${message} ${GRADES[game]}</span>`,
    )
    .join(', ');

/**
 * Returns commodity display name by ID or 'credits'.
 * @param {string} identifier Commodity ID or 'credits'
 * @returns {string} Display name
 */
const commodityName = (identifier: string): string =>
  identifier === 'credits'
    ? 'credits'
    : (COMMODITIES.find((commodityDef) => commodityDef.id === identifier) || { name: identifier })
        .name;

/**
 * Formats buff percentage bonus properties into readable summary text.
 * @param {Record<string, number>} secondValue Buff definition object
 * @returns {string} Formatted bonus text
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
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function colonyHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length2 = clientGameState.landed!,
    component = length2.colony!,
    stellarBody = STELLARS[length2.stellar];
  if (component.open)
    return `<div class="sect" style="margin-top:0">UNSETTLED WORLD</div><p>${escapeHtml2(stellarBody.name)} has no flag. Settle it to build farms, mines, habitats and permanent-buff installations that work while you are away.</p>
    <div class="kv"><span>Charter</span><span>${credits(COLONY.cost)} cr + ${mats(playerPayload, COLONY.mats)}</span></div><div class="kv"><span>Your colonies</span><span>${playerPayload.colonies.length} of ${playerPayload.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max}</span></div>
    <button class="btn" data-act="col" data-op="found">FOUND A COLONY</button>`;
  if (!component.own)
    return `<div class="sect" style="margin-top:0">${escapeHtml2(component.name)}</div><p>Settled by Captain ${escapeHtml2(component.owner)} (level ${component.lv}).</p>`;
  const colonyLevelInfo = COLONY_LEVELS[component.lv]!,
    next = COLONY_LEVELS[component.lv + 1];
  let height = `<div class="sect" style="margin-top:0">${escapeHtml2(component.name.toUpperCase())} · LEVEL ${component.lv}</div><div class="kv"><span>Building slots</span><span>${component.buildings.length} / ${colonyLevelInfo.slots}</span></div><div class="kv"><span>Production</span><span>x${colonyLevelInfo.mult}</span></div>`;
  if (next)
    height += `<div class="kv"><span>Upgrade to level ${component.lv + 1}</span><span>${credits(next.cost!)} + ${mats(playerPayload, next.mats!)} <button class="btn sm" data-act="col" data-op="upgrade">UPGRADE</button></span></div>`;
  const store = Object.entries(component.store).filter(([, value]) => value >= 1);
  height += `<div class="sect">STOCKPILE</div>${store.length ? store.map(([entryKey, value]) => `<div class="kv"><span>${escapeHtml2(commodityName(entryKey))}</span><span>${entryKey === 'credits' ? credits(value) : value + ' t'}</span></div>`).join('') + '<button class="btn sm" data-act="col" data-op="collect">COLLECT</button>' : '<p class="dim small">Nothing yet. Stockpiles hold a day of production.</p>'}`;
  height +=
    '<div class="sect">BUILDINGS</div>' +
    (component.buildings
      .map(
        (secondValue, index) =>
          `<div class="kv"><span><b>${escapeHtml2(BUILDINGS[secondValue].name)}</b> <span class="dim small">${
            BUILDINGS[secondValue].produce
              ? Object.entries(BUILDINGS[secondValue].produce)
                  .map(
                    ([entryKey, value]) =>
                      `${entryKey === 'credits' ? credits(value * colonyLevelInfo.mult) + ' cr' : (value * colonyLevelInfo.mult).toFixed(1) + ' t ' + commodityName(entryKey)}/h`,
                  )
                  .join(', ')
              : buffText(BUILDINGS[secondValue].buff!)
          }</span></span><span><button class="btn sm" data-act="col" data-op="demolish" data-i="${index}">DEMOLISH</button></span></div>`,
      )
      .join('') || '<p class="dim small">No buildings.</p>');
  if (component.buildings.length < colonyLevelInfo.slots)
    height +=
      '<div class="sect">BUILD</div>' +
      Object.entries(BUILDINGS)
        .filter(
          ([entryKey, colonyBuilding]) =>
            !(colonyBuilding.buff && component.buildings.includes(entryKey)),
        )
        .map(
          ([entryKey, colonyBuilding]) =>
            `<div class="kv"><span><b>${escapeHtml2(colonyBuilding.name)}</b> <span class="dim small">${escapeHtml2(colonyBuilding.desc)}</span></span><span>${credits(colonyBuilding.cost)} <button class="btn sm" data-act="col" data-op="build" data-kind="${entryKey}">BUILD</button></span></div>`,
        )
        .join('');
  height +=
    '<div style="margin-top:8px"><button class="btn sm" data-act="col" data-op="abandon">ABANDON COLONY</button></div>';
  return height;
}

// ------------------------------------------------------------------ station defense (inside the station dashboard)

/**
 * Renders the Station Defense rating, turret upgrades, and Station Holdout wave defense interface.
 * @param {ClientGameState} clientGameState Game state object
 * @param {boolean} [interactive] Whether interactive actions are enabled
 * @returns {string} HTML markup
 */
export function defenseHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    stationState = playerPayload.station;
  if (stationState.ops < DEFENSE.minOps) return '';
  const level = stationState.defense || 0,
    next = DEFENSE.levels[level + 1];
  let height = `<div class="sect">DEFENSE</div><div class="kv"><span>Defense rating</span><span><b>${playerPayload.defense}</b> <span class="dim small">(turrets level ${level})</span></span></div><div class="dim small">Raiders hit Personal Stations every ${DEFENSE.everyH} hours. If you are in the system they attack live and you can fight them off; otherwise the turrets decide it. A lost raid loots the refinery and some low-grade crates.</div>`;
  const height2: { best: number; lastT: number; active?: boolean; wave?: number } =
      playerPayload.holdout || {
        best: 0,
        lastT: 0,
      },
    wait = (height2.lastT || 0) + 2 * 3600000 - Date.now();
  height += `<div class="sect">STATION HOLDOUT</div><div class="dim small">Defend your Personal Station through ten escalating waves, with your ship, your wingmates and ${1 + Math.min(5, level)} defense platforms (more with turret levels). The rewards grow with every wave: credits, crates, Bulwark blueprints, and a grade V crate for beating all ten. You can start one every 2 hours.${clientGameState.solo ? '' : ' Your Armada is called when it starts: every member who flies in adds hostiles to each wave and shares the rewards.'}</div>
    <div class="kv"><span>Best: wave ${height2.best || 0} of 10</span><span>${height2.active ? `<b style="color:#ff8a70">in progress: wave ${height2.wave}</b>` : wait > 0 ? `<span class="dim">ready in ${Math.ceil(wait / 60000)} min</span>` : interactive ? '<button class="btn sm" data-act="holdout">START HOLDOUT</button>' : '<span class="dim">land at your station to start</span>'}</span></div>`;
  if (next)
    height += `<div class="kv"><span>Turrets level ${level + 1} (+${next.rating - DEFENSE.levels[level].rating})</span><span>${credits(next.cost!)} + ${mats(playerPayload, next.mats!)}${interactive ? ' <button class="btn sm" data-act="st" data-op="defense">UPGRADE</button>' : ''}</span></div>`;
  return height;
}

// ------------------------------------------------------------------ mastery (overview)

/**
 * Renders the ship mastery overview tier stars, XP progress bar, and active hull bonuses.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function masteryHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    experience = (playerPayload.mastery || {})[playerPayload.ship.hull as number] || 0,
    masteryTier2 = masteryTier(experience),
    tier = MASTERY.tiers[masteryTier2];
  const stars = '★'.repeat(masteryTier2) + '☆'.repeat(5 - masteryTier2);
  return `<div class="sect">SHIP MASTERY</div><div class="kv"><span><span style="color:#ffd27a">${stars}</span> Tier ${masteryTier2}</span><span class="small">${tier !== undefined ? `${Math.floor(experience)} / ${tier} xp` : 'mastered'}</span></div>${tier !== undefined ? `<div class="xpbar"><i style="width:${Math.min(100, (100 * (experience - MASTERY.tiers[masteryTier2 - 1])) / (tier - MASTERY.tiers[masteryTier2 - 1]))}%"></i></div>` : ''}<div class="dim small">${buffText(MASTERY.bonus[masteryTier2]) || 'Fly this hull to unlock bonuses.'}${masteryTier2 >= 5 ? ' · gold trim' : ''}</div>`;
}

// ------------------------------------------------------------------ ARENA tab

/**
 * Renders the Crucible arena queue, current matchmaking rating, and record.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function arenaHtml(clientGameState: ClientGameState): string {
  const firstValue = clientGameState.you!.arena || { rating: ARENA.start, w: 0, l: 0, sizes: {} };
  let height = `<div class="sect" style="margin-top:0">THE CRUCIBLE</div><p>Rated team fights in an instanced arena, away from the open galaxy. You fly your current ship without wingmates or escorts. Losing costs no insurance, and the arena crew repair you for free. The last team flying wins. If time runs out, the team with the most hull and shields left wins.</p>
    <div class="kv"><span>Your rating</span><span><b>${firstValue.rating}</b> <span class="dim small">${firstValue.w} W · ${firstValue.l} L</span></span></div>`;
  for (const [mode, count] of Object.entries(ARENA.modes))
    height += `<div class="kv"><span><b>${mode}</b> <span class="dim small">${(firstValue.sizes || {})[mode] || 0} queued, ${count * 2} needed</span></span><span>${firstValue.queued === mode ? '<button class="btn sm" data-act="arena" data-op="leave">LEAVE QUEUE</button>' : `<button class="btn sm" data-act="arena" data-op="queue" data-mode="${mode}">QUEUE</button>`}</span></div>`;
  height += `<div class="dim small">Winners earn ${credits(15000)} credits per team member slot. Rating moves with each result (Elo).</div>`;
  return height;
}

// ------------------------------------------------------------------ EXCHANGE tab

/**
 * Renders the player-to-player market exchange order book, active orders, and storage hold.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function exchangeHtml(clientGameState: ClientGameState): string {
  const _positionY = clientGameState.you!,
    positionX = clientGameState.landed!.exchange!;
  const options =
    MATERIALS.flatMap((message) =>
      GRADES.map(
        (game, index) =>
          `<option value="mat:${message}:${index}">${message} ${game} crate</option>`,
      ),
    ).join('') +
    COMMODITIES.map(
      (commodityDef) =>
        `<option value="com:${commodityDef.id}">${escapeHtml2(commodityDef.name)}</option>`,
    ).join('');
  let height = `<div class="sect" style="margin-top:0">THE EXCHANGE</div><div class="dim small">Player-to-player orders shared across every market in the Rift. Sell orders hold your goods in escrow, and buy orders hold your credits. Crossing orders fill at the resting price, and sellers pay a ${EXCHANGE.fee * 100}% fee. Bought commodities wait in exchange storage, and crates go straight to your stock.</div>
    <div class="rrow"><select id="xitem">${options}</select><select id="xside"><option value="sell">SELL</option><option value="buy">BUY</option></select><input id="xqty" type="number" min="1" value="1" style="width:70px" title="quantity"><input id="xprice" type="number" min="1" placeholder="price each" style="width:110px"><button class="btn sm" data-act="xplace">PLACE</button></div>`;
  const name = (exchangeItem: import('../server/world-contracts.ts').ExchangeItem) =>
    exchangeItem.kind === 'mat'
      ? `${exchangeItem.mat} ${GRADES[exchangeItem.grade]}`
      : commodityName(exchangeItem.cid);
  height +=
    '<div class="sect">ORDER BOOK</div>' +
    (positionX.book.length
      ? `<table class="tbl"><tr><th>ITEM</th><th>BEST BID</th><th>BIDS</th><th>BEST ASK</th><th>ASKS</th></tr>${positionX.book.map((secondValue) => `<tr><td>${escapeHtml2(name(secondValue.item))}</td><td class="lo">${secondValue.bid ? credits(secondValue.bid) : '-'}</td><td>${secondValue.bids}</td><td class="hi">${secondValue.ask ? credits(secondValue.ask) : '-'}</td><td>${secondValue.asks}</td></tr>`).join('')}</table>`
      : '<p class="dim">No orders yet.</p>');
  height +=
    `<div class="sect">YOUR ORDERS (${positionX.mine.length}/${EXCHANGE.maxOrders})</div>` +
    (positionX.mine
      .map(
        (exchangeOrder) =>
          `<div class="kv"><span>${exchangeOrder.side.toUpperCase()} ${exchangeOrder.qty} ${escapeHtml2(name(exchangeOrder.item))} @ ${credits(exchangeOrder.price)}</span><span><button class="btn sm" data-act="xcancel" data-id="${exchangeOrder.id}">CANCEL</button></span></div>`,
      )
      .join('') || '<p class="dim small">None.</p>');
  const state = Object.entries(positionX.storage || {});
  if (state.length)
    height +=
      '<div class="sect">EXCHANGE STORAGE</div>' +
      state
        .map(
          ([entryKey, value]) =>
            `<div class="kv"><span>${escapeHtml2(commodityName(entryKey))}</span><span>${value} t</span></div>`,
        )
        .join('') +
      '<button class="btn sm" data-act="xcollect">LOAD INTO HOLD</button>';
  height += `<div class="sect">SEND CREDITS</div><div class="rrow"><input id="xto" placeholder="captain name" maxlength="20"><input id="xamt" type="number" min="1000" placeholder="credits" style="width:120px"><button class="btn sm" data-act="xsend">SEND</button></div>`;
  return height;
}

// ------------------------------------------------------------------ leaderboards + profile (community tab)

/**
 * Renders the galactic community leaderboards and captain profile lookup.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function boardsHtml(clientGameState: ClientGameState): string {
  const category = clientGameState.boardCat || 'earned',
    secondValue = clientGameState.boards && clientGameState.boards[category];
  let height = `<div class="sect">LEADERBOARDS</div><div class="chips">${Object.entries(BOARDS)
    .map(
      ([entryKey, leaderboardCategory]) =>
        `<span class="chip ${entryKey === category ? 'on' : ''}" data-act="board" data-cat="${entryKey}">${leaderboardCategory.name}</span>`,
    )
    .join('')}</div>`;
  height += secondValue
    ? `<table class="tbl"><tr><th>#</th><th>CAPTAIN</th><th>${escapeHtml2(BOARDS[category].name.toUpperCase())}</th></tr>${secondValue.map((radius, index) => `<tr><td>${index + 1}</td><td><a href="#" data-act="prof" data-n="${escapeHtml2(radius.name)}">${radius.fleet ? `[${escapeHtml2(radius.fleet)}] ` : ''}${escapeHtml2(radius.name)}</a>${radius.ai ? ' <span class="aitag">captain</span>' : ''}</td><td>${category === 'earned' ? credits(radius.v) : radius.v.toLocaleString()}</td></tr>`).join('')}</table>`
    : '<p class="dim small">Loading...</p>';
  height += `<div class="rrow"><input id="profq" placeholder="Look up a captain"><button class="btn sm" data-act="profgo">PROFILE</button></div>`;
  const captainProfile = clientGameState.prof;
  if (captainProfile)
    height += `<div class="ocard"><div class="oname"><b style="font-size:15px">${escapeHtml2(captainProfile.name)}</b> ${captainProfile.online ? '<span style="color:var(--ok)">● online</span>' : '<span class="dim">offline</span>'}</div>
    <div class="kv"><span>Flies</span><span>${escapeHtml2(captainProfile.ship)} "${escapeHtml2(captainProfile.shipName)}"</span></div><div class="kv"><span>Station</span><span>${captainProfile.site ? `${escapeHtml2(captainProfile.site)} · Station Tier ${captainProfile.ops}` : 'none'}</span></div>
    <div class="kv"><span>Colonies</span><span>${captainProfile.colonies.map(escapeHtml2).join(', ') || 'none'}</span></div><div class="kv"><span>Record</span><span>${captainProfile.kills} kills · ${captainProfile.jumps} jumps · ${captainProfile.mined} t mined · ${credits(captainProfile.earned)} earned</span></div>
    <div class="kv"><span>Arena</span><span>${captainProfile.arena ? `${captainProfile.arena.rating} (${captainProfile.arena.w}-${captainProfile.arena.l})` : 'unrated'}</span></div>${captainProfile.mastery ? `<div class="kv"><span>Best mastery</span><span>${escapeHtml2(captainProfile.mastery.ship)} · Tier ${captainProfile.mastery.tier}</span></div>` : ''}<div class="kv"><span>Officers</span><span>${captainProfile.officers}</span></div></div>`;
  return height;
}
