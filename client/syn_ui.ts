import type { PlayerPayload as PlayerData } from './main.ts';
import type { ClientGameState } from './main.ts';
export type SyndicateStanding = { name: string; pts: number; i: number; next?: number };
export type BlackMarketItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  locked?: string;
};
export type BankState = { credit?: number; rate: number; period: number; max: number; pay: number };
export type Officer = {
  id: number | string;
  name: string;
  rank?: number;
  lv: number;
  traits?: string[];
};
export type ArcCard = { fac: string; arc: string; title: string; brief: string; locked?: string };
export type PassengerMissionOffer = { type?: string; pax?: number };

import { escapeDoubleQuotedHtml as escapeHtml } from './html.ts';
// Screens: black market, bank, officer ranks and traits, lower decks, and faction-arc cards.
import { occupiedPassengerSeats } from '../shared/passengers.ts';
import { FACTIONS } from '../shared/galaxy.ts';
import { RANKS_OFF, PROMOTE, TRAITS, LOWER_DECK, LOWER_SLOTS, bunks } from '../shared/syndicate.ts';

/** @import { PlayerData } from '../server/game.ts' */
/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {Object} SyndicateStanding
 * @property {string} name Tier name
 * @property {number} pts Current reputation points
 * @property {number} i Tier index
 * @property {number} [next] Points required for next tier
 */

/**
 * @typedef {Object} BlackMarketItem
 * @property {string} id Unique item key
 * @property {string} name Display item name
 * @property {string} desc Description
 * @property {number} price Price in credits
 * @property {string} [locked] Requirement text if locked
 */

/**
 * @typedef {Object} BankState
 * @property {number} [credit] Current player credit score
 * @property {number} rate Interest rate per cycle
 * @property {number} period Billing interval in minutes
 * @property {number} max Maximum loan capacity
 * @property {number} pay Estimated periodic payment
 */

/**
 * @typedef {Object} Officer
 * @property {number|string} id Officer unique ID
 * @property {string} name Officer name
 * @property {number} [rank] Promotion rank index
 * @property {number} lv Current level
 * @property {string[]} [traits] Acquired trait keys
 */

/**
 * @typedef {Object} ArcCard
 * @property {string} fac Faction identifier
 * @property {string} arc Arc name
 * @property {string} title Arc headline
 * @property {string} brief Narrative summary
 * @property {string} [locked] Lock condition text
 */

/**
 * @typedef {Object} PassengerMissionOffer
 * @property {string} [type] Mission type
 * @property {number} [pax] Number of passengers to carry
 */

/**
 * Formats a number to rounded, localized string.
 * @param {number} count Input number
 * @returns {string}
 */
const credits2 = (count: number): string => Math.round(count).toLocaleString();

/**
 * Renders the Syndicate standing badge showing current rank and points progress.
 * @param {PlayerData} positionY Player state object
 * @returns {string} HTML markup
 */
export function synBadge(playerPayload: PlayerData): string {
  const syndicateTierInfo = playerPayload.syn || { name: 'Unknown', pts: 0, i: 0 };
  return `<div class="kv"><span>Syndicate standing</span><span><b style="color:#d88aff">${escapeHtml(syndicateTierInfo.name)}</b> <span class="dim">${credits2(syndicateTierInfo.pts)}${syndicateTierInfo.next ? ` / ${credits2(syndicateTierInfo.next)}` : ''}</span></span></div>`;
}

/**
 * Renders the Black Market screen at a Syndicate-affiliated spaceport.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function blackMarketHtml(clientGameState: ClientGameState): string {
  const blackmarket2 = clientGameState.landed!.blackmarket,
    playerPayload = clientGameState.you!;
  if (!blackmarket2) return '';
  return `<div class="bmhead"><div><div class="sect" style="margin-top:0">THE BLACK MARKET</div><div class="dim small">A back room behind the bar. The fence sells to the Syndicate's own, and stock opens up as your standing grows. Smuggling, plunder, capture and Syndicate contracts raise it.</div></div>
    <div class="bmtier">${synBadge(playerPayload)}<div class="kv"><span>Commendations</span><span>${playerPayload.shards || 0}</span></div></div></div>
    <table class="tbl"><tr><th>ITEM</th><th>DETAILS</th><th>PRICE</th><th></th></tr>${blackmarket2.items
      .map(
        (
          positionX,
        ) => `<tr class="${positionX.locked ? 'locked' : ''}"><td><b>${escapeHtml(positionX.name)}</b></td><td class="dim small">${escapeHtml(positionX.desc)}</td><td class="cr">${credits2(positionX.price)}</td>
      <td style="text-align:right">${positionX.locked ? `<span class="dim small">${escapeHtml(positionX.locked)} only</span>` : `<button class="btn sm" data-act="bm" data-id="${positionX.id}"${playerPayload.credits < positionX.price ? ' disabled title="Not enough credits"' : ''}>BUY</button>`}</td></tr>`,
      )
      .join('')}</table>`;
}

/**
 * Renders the Bank of the Rift loan and repayment screen.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function bankHtml(clientGameState: ClientGameState): string {
  const bank2 = clientGameState.landed!.bank,
    playerPayload = clientGameState.you!;
  if (!bank2) return '';
  const balance = playerPayload.loan ? playerPayload.loan.bal : 0,
    minutes = playerPayload.loan
      ? Math.max(0, Math.ceil((playerPayload.loan.next - Date.now()) / 60000))
      : 0,
    room = Math.max(0, bank2.max - balance);
  return `<div class="igrid"><div><div class="sect" style="margin-top:0">THE BANK OF THE RIFT</div>
      <div class="kv"><span>Credit rating</span><span><b>${playerPayload.credit || bank2.credit}</b> <span class="dim small">(300 to 850)</span></span></div>
      <div class="kv"><span>Interest</span><span>${(bank2.rate * 100).toFixed(2)}% every ${bank2.period} minutes of play</span></div>
      <div class="kv"><span>You can borrow up to</span><span class="cr">${credits2(bank2.max)}</span></div>
      <p class="dim small">Payments are taken automatically every ${bank2.period} minutes while you play. Paying on time raises your rating and lowers your interest; missing one adds interest and drops your rating. Bigger earnings unlock bigger loans.</p>
    </div><div><div class="sect" style="margin-top:0">YOUR LOAN</div>
      ${balance ? `<div class="kv"><span>Balance</span><span class="cr">${credits2(balance)}</span></div><div class="kv"><span>Next payment</span><span>about ${credits2(bank2.pay)} in ${minutes} min</span></div>` : '<p class="dim">No loan.</p>'}
      <div class="rrow"><input id="bankamt" type="number" min="1000" step="1000" placeholder="Amount" value="${Math.min(room, 50000)}"><button class="btn sm" data-act="bank" data-op="borrow"${room < 1000 ? ' disabled' : ''}>BORROW</button>${balance ? `<button class="btn sm" data-act="bank" data-op="pay">PAY</button><button class="btn sm" data-act="bank" data-op="payall">PAY ALL</button>` : ''}</div>
    </div></div>`;
}

// officer rank, traits and the promote button (added to each officer card in the CREW tab)

/**
 * Renders the rank, traits badges, and promotion button for an officer card.
 * @param {ClientGameState} clientGameState Game state object
 * @param {Officer} officer Officer instance
 * @param {boolean} [interactive] Whether promotion button is active
 * @returns {string} HTML markup
 */
export function rankLine(
  clientGameState: ClientGameState,
  officer: Officer,
  interactive?: boolean,
): string {
  const radius = officer.rank || 0,
    officerPromotionCost = PROMOTE[radius + 1],
    playerPayload = clientGameState.you!;
  const traits = (officer.traits || [])
    .map((time) =>
      TRAITS[time]
        ? `<span class="trait" title="${escapeHtml(
            Object.entries(TRAITS[time].bonus)
              .map(([entryKey, value]) => `${entryKey} +${value}`)
              .join(', '),
          )}">${escapeHtml(TRAITS[time].name)}</span>`
        : '',
    )
    .join('');
  const button =
    interactive &&
    officerPromotionCost &&
    typeof officer.id !== 'undefined' &&
    playerPayload.officers.some((officerRecord) => officerRecord.id === officer.id)
      ? `<button class="btn sm" data-act="promote" data-id="${escapeHtml(officer.id)}"${officer.lv < officerPromotionCost.lv || (playerPayload.shards || 0) < officerPromotionCost.shards || playerPayload.credits < officerPromotionCost.credits ? ` disabled title="Needs level ${officerPromotionCost.lv}, ${officerPromotionCost.shards} commendations and ${credits2(officerPromotionCost.credits)} credits"` : ''}>PROMOTE</button>`
      : '';
  return `<div class="rankrow"><span class="rank">${RANKS_OFF[radius]}</span>${traits}${button}</div>`;
}

/**
 * Renders the Lower Deck berths section with passive crew assignment and hiring.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function lowerDeckHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length = playerPayload.lower || [],
    docked = !!clientGameState.landed;
  let height = `<div class="sect">LOWER DECK <span class="dim small">· two crew slots with small passive bonuses</span></div><div class="lower">`;
  for (let index = 0; index < LOWER_SLOTS; index++) {
    const length22 = length[index],
      component = length22 && LOWER_DECK[length22];
    height += `<div class="lslot">${
      component
        ? `<b>${escapeHtml(component.name)}</b><div class="dim small">${escapeHtml(component.desc)}</div><button class="btn sm" data-act="lower" data-op="dismiss" data-i="${index}">DISMISS</button>`
        : `<div class="dim small">Empty berth</div>${
            docked
              ? `<select data-lowersel="${index}">${Object.entries(LOWER_DECK)
                  .filter(([entryKey]) => !length.includes(entryKey))
                  .map(
                    ([entryKey, lowerDeckRole]) =>
                      `<option value="${entryKey}">${escapeHtml(lowerDeckRole.name)} · ${escapeHtml(lowerDeckRole.desc)} · ${credits2(lowerDeckRole.cost)} cr</option>`,
                  )
                  .join(
                    '',
                  )}</select><button class="btn sm" data-act="lower" data-op="hire" data-i="${index}">HIRE</button>`
              : '<div class="dim small">Hire crew when docked.</div>'
          }`
    }</div>`;
  }
  return (
    height +
    `</div><div class="dim small">Commendations for promotions: <b>${playerPayload.shards || 0}</b>. Find them in loot chests and on the black market.</div>`
  );
}

/**
 * Renders faction arc cards available at the current landing location.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function arcCardsHtml(clientGameState: ClientGameState): string {
  const length2 = clientGameState.landed!;
  if (!length2 || !length2.arcs || !length2.arcs.length) return '';
  return length2.arcs
    .map(
      (options) =>
        `<div class="card story arc" style="cursor:default"><div class="storytag">${escapeHtml(FACTIONS[options.fac].name.toUpperCase())} · ${escapeHtml(options.arc)}</div><div class="t">${escapeHtml(options.title)}</div><div>${escapeHtml(options.brief)}</div>${options.locked ? `<div class="dim small">${escapeHtml(options.locked)}</div>` : `<div><button class="btn sm" data-act="arcopen" data-f="${options.fac}">READ</button></div>`}</div>`,
    )
    .join('');
}

/**
 * Computes bunk availability warning for passenger missions.
 * @param {ClientGameState} clientGameState Game state object
 * @param {PassengerMissionOffer} passengerMissionOffer Mission offer data
 * @returns {string} Warning text if insufficient bunks, else empty string
 */
export function bunkInfo(
  clientGameState: ClientGameState,
  passengerMissionOffer: PassengerMissionOffer,
): string {
  if (passengerMissionOffer.type !== 'passenger') return '';
  const playerPayload = clientGameState.you!,
    bunks2 = bunks(clientGameState.A!.ships[playerPayload.ship.hull], playerPayload.ship),
    used = occupiedPassengerSeats(playerPayload.missions);
  return passengerMissionOffer.pax! > bunks2 - used
    ? `Needs ${passengerMissionOffer.pax} passenger seats; your ship has ${Math.max(0, bunks2 - used)} free.`
    : '';
}
