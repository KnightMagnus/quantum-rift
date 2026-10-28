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

import { escapeHtml as escapeHtml2 } from './html.ts';
// Quantum Rift: interface pieces: the OPS companion tab (event, invasion, anomaly, goals, Armada), and the faction STORE menu.
import { SYS as systemsById, FACTIONS, GRADES } from '../shared/galaxy.ts';
import { ANOMALIES, GOAL_TYPES, GOAL_REWARD, STORE_TIERS, STORE_MAT } from '../shared/fronts.ts';
import { credits, route } from '../shared/rules.ts';
import { STATES } from '../shared/living.ts';
import { factionStoreListings } from '../shared/faction-store-catalog.ts';
import { FACTION_STORE_OUTFITS } from '../shared/faction-outfits.ts';
import { chartSystems } from '../shared/map-knowledge.ts';

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
    .map(
      (goalEntry, index) =>
        `<div class="goal ${goalEntry.claimed ? 'claimed' : ''}"><div class="kv"><span>${escapeHtml2(GOAL_TYPES[goalEntry.type].text(goalEntry.n))}</span><span class="small">${goalEntry.claimed ? '✓ claimed' : goalEntry.got >= goalEntry.n ? `<button class="btn sm" data-act="goal" data-p="${period}" data-i="${index}">CLAIM</button>` : `${goalEntry.type === 'trade' ? credits(goalEntry.got) : goalEntry.got} / ${goalEntry.type === 'trade' ? credits(goalEntry.n) : goalEntry.n}`}</span></div><div class="xpbar"><i style="width:${Math.min(100, (100 * goalEntry.got) / goalEntry.n)}%"></i></div></div>`,
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
  let height = '';
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
 * @param FACTIONS_ Faction definitions dictionary
 * @returns Faction keys
 */
export const STORE_FACS = (FACTIONS_: Record<string, FactionDef>): string[] =>
  Object.entries(FACTIONS_)
    .filter(
      ([entryKey, factionDef]) => !factionDef.region && !factionDef.hidden && entryKey !== 'umbral',
    )
    .map(([entryKey]) => entryKey);

/** Stores authorized by the current landing payload; only an owned station offers all factions. */
export function availableStoreFactions(
  state: ClientGameState,
  factions: Record<string, FactionDef>,
): string[] {
  if (!state.you || !state.landed || state.you.stellar !== state.landed.stellar) return [];
  const available = STORE_FACS(factions);
  if (state.landed.site?.own) return available;
  const local = state.landed.store;
  return local && available.includes(local) ? [local] : [];
}

/**
 * Renders the stores authorized at the current landing.
 * @param clientGameState Current player and landing payloads.
 * @param FACTIONS_ Faction definitions.
 * @returns Store dialog markup, or an empty string when unavailable.
 */
export function storeMenuHtml(
  clientGameState: ClientGameState,
  FACTIONS_: Record<string, FactionDef>,
): string {
  const playerPayload = clientGameState.you!,
    factions = availableStoreFactions(clientGameState, FACTIONS_),
    faction =
      clientGameState.storeFac && factions.includes(clientGameState.storeFac)
        ? clientGameState.storeFac
        : factions[0];
  if (!faction) return '';
  clientGameState.storeFac = faction;
  const side = factions
    .map((entryKey) => {
      const factionDef = FACTIONS_[entryKey],
        reputation = playerPayload.rep[entryKey] || 0,
        token = (playerPayload.tokens && playerPayload.tokens[entryKey]) || 0;
      return `<div class="sfac ${entryKey === faction ? 'on' : ''}" data-act="sfac" data-f="${entryKey}"><b style="color:${factionDef.color}">${escapeHtml2(factionDef.short)}</b><span class="dim small">${reputation} · ${token} tokens</span></div>`;
    })
    .join('');
  return `<div class="store-heading"><div class="faction-screen"><img id="faction-insignia" src="assets/factions/${faction}.svg" alt="${escapeHtml2(FACTIONS_[faction].name)} insignia" data-faction="${faction}" width="112" height="112"></div><h2>${clientGameState.landed?.site?.own ? 'FACTION STORES' : 'FACTION STORE'} <span class="dim small">Rift scrip: ${(playerPayload.tokens && playerPayload.tokens.any) || 0} · purchases are delivered to you here</span></h2></div><div id="store-standing" class="kv" data-faction="${faction}" data-standing="${playerPayload.rep[faction] || 0}"><span>Your standing with ${escapeHtml2(FACTIONS_[faction].name)}</span><b>${playerPayload.rep[faction] || 0}</b></div><div class="sgrid"><div class="sfacs">${side}</div><div class="sbody well">${storeHtml(clientGameState, faction)}</div></div><button class="btn sm" data-act="sclose">CLOSE (Esc)</button>`;
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
  let height = `<div class="sect" style="margin-top:0">${escapeHtml2(factionDef.name.toUpperCase())} QUARTERMASTER</div><div class="kv"><span>Your standing</span><span style="color:${factionDef.color}">${reputation} ${tier ? '· ' + tier.name : ''}</span></div>
    <div class="kv"><span>${factionDef.short} tokens</span><span>${token}</span></div><div class="kv"><span>Rift scrip <span class="dim small">(any store)</span></span><span>${scrip}</span></div>
    <div class="dim small">Earn ${factionDef.short} tokens by finishing jobs in ${factionDef.short} space and their commissions. Daily and weekly goals pay Rift scrip, which any store accepts.</div><table class="tbl"><tr><th>ITEM</th><th>STANDING</th><th>TOKENS</th><th>CREDITS</th><th></th></tr>`;
  const charted = new Set(playerPayload.charted || []);
  for (const factionStoreItem of factionStoreListings(faction)) {
    const name2 = factionStoreItem.give.crate
      ? `${STORE_MAT[faction]} crate (grade ${GRADES[factionStoreItem.give.crate as number]})`
      : factionStoreItem.name;
    const storeOutfit = FACTION_STORE_OUTFITS.find(
      (outfit) => outfit.id === factionStoreItem.give.outfit,
    );
    const chartOwned =
      !!factionStoreItem.give.chart &&
      chartSystems(systemsById, faction).every((id) => charted.has(id));
    const detail = storeOutfit
      ? `<div class="dim small">${escapeHtml2(storeOutfit.desc || '')} Installs on your current ship.</div>`
      : factionStoreItem.give.chart
        ? `<div class="dim small">${chartOwned ? 'Already on your map.' : `Reveals every ${escapeHtml2(factionDef.short)} system, lane and market on your map.`}</div>`
        : '';
    const allowed =
      landed &&
      !chartOwned &&
      reputation >= factionStoreItem.rep &&
      token + scrip >= factionStoreItem.tokens &&
      playerPayload.credits >= factionStoreItem.credits;
    height += `<tr><td>${escapeHtml2(name2)}${detail}</td><td style="color:${reputation >= factionStoreItem.rep ? '#8ff0ad' : '#ff9a8a'}">${factionStoreItem.rep}</td><td>${factionStoreItem.tokens}</td><td>${factionStoreItem.credits ? credits(factionStoreItem.credits) : '-'}</td><td style="text-align:right"><button class="btn sm" data-act="buystore" data-f="${faction}" data-id="${factionStoreItem.id}" ${allowed ? '' : 'disabled'}>BUY</button></td></tr>`;
  }
  return height + '</table>';
}
