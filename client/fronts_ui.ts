import type { FactionDef } from '../shared/galaxy.ts';
import type { ClientGameState } from './main.ts';
export type GoalEntry = { type: string; n: number; got: number; claimed?: boolean };
export type WorldEvent = { name: string; desc: string; until?: number };
export type WorldInvasion = { name: string; sys: string; until: number };
export type ArmadaMember = { name: string; online: boolean; sys?: string };
export type ArmadaState = { name: string; leader: string; members: ArmadaMember[] };
export type CalendarEvent = { name: string; start: number; end: number };

import { escapeHtml as escapeHtml2 } from './html.ts';
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

/** @import { FactionDef } from '../shared/galaxy.ts' */
/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {Object} GoalEntry
 * @property {string} type Goal type key
 * @property {number} n Required count or target amount
 * @property {number} got Current progress count or amount
 * @property {boolean} [claimed] Whether reward has been claimed
 */

/**
 * @typedef {Object} WorldEvent
 * @property {string} name Event name
 * @property {string} desc Event description
 * @property {number} [until] End timestamp
 */

/**
 * @typedef {Object} WorldInvasion
 * @property {string} name Boss / fleet name
 * @property {string} sys System identifier
 * @property {number} until Expiration timestamp
 */

/**
 * @typedef {Object} ArmadaMember
 * @property {string} name Member captain name
 * @property {boolean} online Online status
 * @property {string} [sys] Current system name
 */

/**
 * @typedef {Object} ArmadaState
 * @property {string} name Armada group name
 * @property {string} leader Group leader captain name
 * @property {ArmadaMember[]} members Member roster
 */

/**
 * @typedef {Object} CalendarEvent
 * @property {string} name Event title
 * @property {number} start Start timestamp
 * @property {number} end End timestamp
 */

/**
 * Formats time remaining until a timestamp into days, hours, or minutes.
 * @param {number} time Future timestamp in ms
 * @returns {string} Formatted duration (e.g. '2d 5h', '3h 12m', or '45m')
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
 * @param {GoalEntry[]} list List of goal items
 * @param {'daily'|'weekly'} period Period identifier
 * @returns {string} HTML markup
 */
function goalRows(list: GoalEntry[], period: 'daily' | 'weekly'): string {
  return list
    .map(
      (goalEntry, index) =>
        `<div class="goal ${goalEntry.claimed ? 'claimed' : ''}"><div class="kv"><span>${escapeHtml2(GOAL_TYPES[goalEntry.type].text(goalEntry.n))}</span><span class="small">${goalEntry.claimed ? '✓ claimed' : goalEntry.got >= goalEntry.n ? `<button class="btn sm" data-act="goal" data-p="${period}" data-i="${index}">CLAIM</button>` : `${goalEntry.type === 'trade' ? credits(goalEntry.got) : goalEntry.got} / ${goalEntry.type === 'trade' ? credits(goalEntry.n) : goalEntry.n}`}</span></div><div class="xpbar"><i style="width:${Math.min(100, (100 * goalEntry.got) / goalEntry.n)}%"></i></div></div>`,
    )
    .join('');
}

/**
 * Renders the OPS companion tab (server events, invasions, system anomalies, goals, Armada summary, and calendar).
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function opsHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    width: Partial<NonNullable<ClientGameState['world']>> = clientGameState.world || {},
    serverEvent = width.event,
    _here = systemsById[clientGameState.sys!];
  let height =
    '<button class="btn sm" data-act="stores" style="margin-bottom:6px">FACTION STORES</button>';
  const story2 = playerPayload.story;
  if (story2 && (story2.active || story2.next))
    height += `<div class="evbox" style="border-color:#c9a24a"><div class="small" style="color:#c9a24a;letter-spacing:2px">MAIN STORY ${story2.step + 1}/${story2.total}</div><b style="color:#ffe2a0">${escapeHtml2(story2.active ? story2.active.title : story2.next!.title)}</b><div class="small">${escapeHtml2(story2.active ? (story2.active.ready ? 'Done: return to collect.' : story2.active.brief) : 'Waiting for you at ' + story2.next!.at + '.')}</div></div>`;
  if (serverEvent)
    height += `<div class="evbox"><div class="dim small">${clientGameState.solo ? 'EVENT' : 'SERVER EVENT'}</div><b>${escapeHtml2(serverEvent.name)}</b><div class="small">${escapeHtml2(serverEvent.desc)}</div></div>`;
  if (width.invasion) {
    const starSystem = systemsById[width.invasion.sys];
    height += `<div class="evbox inv"><div class="small" style="color:#ff8a70">INVASION · ${left(width.invasion.until)} left</div><b>${escapeHtml2(width.invasion.name)}</b> in <a href="#" data-act="plotto" data-sys="${starSystem.id}">${escapeHtml2(starSystem.name)}</a><div class="dim small">Everyone who damages it shares the bounty.</div></div>`;
  }
  const angle = width.anomalies && width.anomalies[clientGameState.sys!];
  if (angle)
    height += `<div class="evbox" style="border-color:${ANOMALIES[angle].color}66"><b style="color:${ANOMALIES[angle].color}">${ANOMALIES[angle].icon} ${escapeHtml2(ANOMALIES[angle].name)}</b> in this system<div class="small">${escapeHtml2(ANOMALIES[angle].desc)}</div></div>`;
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
        `<div class="sect">THE RIFT TODAY <span class="dim small">troubled systems near you</span></div>` +
        near
          .map(([starSystem, livingPayloadState, innerIndex]) => {
            const systemState = STATES[livingPayloadState.k];
            return `<div class="kv"><span><span style="color:${systemState.color}">${systemState.icon} ${systemState.name}</span> · ${escapeHtml2(systemsById[starSystem].name)}${livingPayloadState.need ? ` <span class="dim small">${livingPayloadState.got}/${livingPayloadState.need}</span>` : ''}</span><span class="small dim">${innerIndex ? innerIndex + ' jump' + (innerIndex > 1 ? 's' : '') : 'here'} <button class="btn sm" data-plot="${starSystem}">PLOT</button></span></div>`;
          })
          .join('');
  }
  {
    if (playerPayload.holdout && playerPayload.holdout.active)
      height += `<div class="evbox inv"><b>HOLDOUT</b> · wave ${playerPayload.holdout.wave} of 10 · stay in your station's system</div>`;
  }
  if (playerPayload.goals) {
    height +=
      `<div class="sect">DAILY GOALS <span class="dim small">${credits(GOAL_REWARD.daily.credits)} cr + ${GOAL_REWARD.daily.tokens} scrip each</span></div>` +
      goalRows(playerPayload.goals.daily!, 'daily');
    height +=
      `<div class="sect">WEEKLY GOALS <span class="dim small">${credits(GOAL_REWARD.weekly.credits)} cr + ${GOAL_REWARD.weekly.tokens} scrip each</span></div>` +
      goalRows(playerPayload.goals.weekly!, 'weekly');
  }
  // the Armada at a glance (full controls in the ALLIES tab); multiplayer only
  const armada2 = playerPayload.armada;
  if (!clientGameState.solo) {
    height += `<div class="sect">ARMADA</div>`;
    if (!armada2)
      height +=
        '<p class="dim small">You are not in an Armada. Form one, or accept an invite, from the ALLIES tab.</p>';
    else
      height +=
        `<div class="kv"><span><b>${escapeHtml2(armada2.name)}</b></span><span class="small">${armada2.members!.filter((message) => message.online).length}/${armada2.members!.length} online</span></div>` +
        armada2
          .members!.map(
            (message) =>
              `<div class="kv"><span>${message.online ? '<b style="color:var(--ok)">●</b>' : '<span class="dim">○</span>'} ${escapeHtml2(message.name)}${message.name === armada2.leader ? ' <span class="dim small">leader</span>' : ''}</span><span class="dim small">${escapeHtml2(message.sys || '')}</span></div>`,
          )
          .join('');
  }
  if (width.calendar)
    height +=
      '<div class="sect">EVENT CALENDAR</div>' +
      width.calendar
        .map(
          (scheduledEvent, index) =>
            `<div class="kv"><span>${index === 0 ? '<b>' : ''}${escapeHtml2(scheduledEvent.name)}${index === 0 ? '</b>' : ''}</span><span class="dim small">${index === 0 ? 'ends in ' + left(scheduledEvent.end) : new Date(scheduledEvent.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>`,
        )
        .join('');
  return height;
}

/**
 * Returns array of eligible faction keys that offer Quartermaster stores.
 * @param {Record<string, FactionDef>} FACTIONS_ Faction definitions dictionary
 * @returns {string[]} Faction keys
 */
export const STORE_FACS = (FACTIONS_: Record<string, FactionDef>): string[] =>
  Object.entries(FACTIONS_)
    .filter(
      ([entryKey, factionDef]) => !factionDef.region && !factionDef.hidden && entryKey !== 'umbral',
    )
    .map(([entryKey]) => entryKey);

/**
 * Renders the modal Faction Stores quartermaster dialog with faction selector tabs.
 * @param {ClientGameState} clientGameState Game state object
 * @param {Record<string, FactionDef>} FACTIONS_ Faction definitions
 * @returns {string} HTML markup
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
      return `<div class="sfac ${entryKey === faction ? 'on' : ''}" data-act="sfac" data-f="${entryKey}"><b style="color:${factionDef.color}">${escapeHtml2(factionDef.short)}</b><span class="dim small">${reputation} · ${token} tokens</span></div>`;
    })
    .join('');
  return `<div class="store-heading"><div class="faction-screen"><img id="faction-insignia" src="assets/factions/${faction}.svg" alt="${escapeHtml2(FACTIONS_[faction].name)} insignia" data-faction="${faction}" width="112" height="112"></div><h2>FACTION STORES <span class="dim small">Rift scrip: ${(playerPayload.tokens && playerPayload.tokens.any) || 0} · ${clientGameState.landed ? 'purchases are delivered to you here' : 'land anywhere to buy'}</span></h2></div><div class="sgrid"><div class="sfacs">${side}</div><div class="sbody well">${storeHtml(clientGameState, faction)}</div></div><button class="btn sm" data-act="sclose">CLOSE (Esc)</button>`;
}

/**
 * Renders the items and standing table for a specific faction store.
 * @param {ClientGameState} clientGameState Game state object
 * @param {string} [facArg] Faction key to display
 * @returns {string} HTML markup
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
  let height = `<div class="sect" style="margin-top:0">${escapeHtml2(factionDef.name.toUpperCase())} QUARTERMASTER</div><div class="kv"><span>Your standing</span><span style="color:${factionDef.color}">${reputation} ${tier ? '· ' + tier.name : ''}</span></div>
    <div class="kv"><span>${factionDef.short} tokens</span><span>${token}</span></div><div class="kv"><span>Rift scrip <span class="dim small">(any store)</span></span><span>${scrip}</span></div>
    <div class="dim small">Earn ${factionDef.short} tokens by finishing jobs in ${factionDef.short} space and their commissions. Daily and weekly goals pay Rift scrip, which any store accepts.</div><table class="tbl"><tr><th>ITEM</th><th>STANDING</th><th>TOKENS</th><th>CREDITS</th><th></th></tr>`;
  for (const factionStoreItem of STORE_ITEMS) {
    const name2 = factionStoreItem.give.crate
      ? `${STORE_MAT[faction]} crate (grade ${GRADES[factionStoreItem.give.crate as number]})`
      : factionStoreItem.name;
    const allowed =
      landed &&
      reputation >= factionStoreItem.rep &&
      token + scrip >= factionStoreItem.tokens &&
      playerPayload.credits >= factionStoreItem.credits;
    height += `<tr><td>${escapeHtml2(name2)}</td><td style="color:${reputation >= factionStoreItem.rep ? '#8ff0ad' : '#ff9a8a'}">${factionStoreItem.rep}</td><td>${factionStoreItem.tokens}</td><td>${factionStoreItem.credits ? credits(factionStoreItem.credits) : '-'}</td><td style="text-align:right"><button class="btn sm" data-act="buystore" data-f="${faction}" data-id="${factionStoreItem.id}" ${allowed ? '' : 'disabled'}>BUY</button></td></tr>`;
  }
  return height + '</table>';
}
