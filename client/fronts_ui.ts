import type { FactionDef } from '../shared/galaxy.ts';
import type { ClientGameState } from './main.ts';
export type GoalEntry = { type: string; n: number; got: number; claimed?: boolean };
export type WorldEvent = { name: string; desc: string; until?: number };
export type WorldInvasion = { name: string; sys: string; until: number };
export type ArmadaMember = { name: string; online: boolean; sys?: string };
export type ArmadaState = { name: string; leader: string; members: ArmadaMember[] };
export type CalendarEvent = { name: string; start: number; end: number };

import { escapeHtml as esc } from './html.ts';
// Quantum Rift: interface pieces: the OPS companion tab (event, invasion, anomaly, goals, Armada), and the faction STORE menu.
import { SYS, FACTIONS, GRADES } from '../shared/galaxy.ts';
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
 * @param {number} t Future timestamp in ms
 * @returns {string} Formatted duration (e.g. '2d 5h', '3h 12m', or '45m')
 */
const left = (t: number): string => {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  return m >= 1440
    ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
    : m >= 60
      ? `${Math.floor(m / 60)}h ${m % 60}m`
      : `${m}m`;
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
      (g, i) =>
        `<div class="goal ${g.claimed ? 'claimed' : ''}"><div class="kv"><span>${esc(GOAL_TYPES[g.type].text(g.n))}</span><span class="small">${g.claimed ? '✓ claimed' : g.got >= g.n ? `<button class="btn sm" data-act="goal" data-p="${period}" data-i="${i}">CLAIM</button>` : `${g.type === 'trade' ? credits(g.got) : g.got} / ${g.type === 'trade' ? credits(g.n) : g.n}`}</span></div><div class="xpbar"><i style="width:${Math.min(100, (100 * g.got) / g.n)}%"></i></div></div>`,
    )
    .join('');
}

/**
 * Renders the OPS companion tab (server events, invasions, system anomalies, goals, Armada summary, and calendar).
 * @param {ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function opsHtml(G: ClientGameState): string {
  const y = G.you!,
    W: Partial<NonNullable<ClientGameState['world']>> = G.world || {},
    ev = W.event,
    _here = SYS[G.sys!];
  let h =
    '<button class="btn sm" data-act="stores" style="margin-bottom:6px">FACTION STORES</button>';
  const SY = y.story;
  if (SY && (SY.active || SY.next))
    h += `<div class="evbox" style="border-color:#c9a24a"><div class="small" style="color:#c9a24a;letter-spacing:2px">MAIN STORY ${SY.step + 1}/${SY.total}</div><b style="color:#ffe2a0">${esc(SY.active ? SY.active.title : SY.next!.title)}</b><div class="small">${esc(SY.active ? (SY.active.ready ? 'Done: return to collect.' : SY.active.brief) : 'Waiting for you at ' + SY.next!.at + '.')}</div></div>`;
  if (ev)
    h += `<div class="evbox"><div class="dim small">${G.solo ? 'EVENT' : 'SERVER EVENT'}</div><b>${esc(ev.name)}</b><div class="small">${esc(ev.desc)}</div></div>`;
  if (W.invasion) {
    const S = SYS[W.invasion.sys];
    h += `<div class="evbox inv"><div class="small" style="color:#ff8a70">INVASION · ${left(W.invasion.until)} left</div><b>${esc(W.invasion.name)}</b> in <a href="#" data-act="plotto" data-sys="${S.id}">${esc(S.name)}</a><div class="dim small">Everyone who damages it shares the bounty.</div></div>`;
  }
  const an = W.anomalies && W.anomalies[G.sys!];
  if (an)
    h += `<div class="evbox" style="border-color:${ANOMALIES[an].color}66"><b style="color:${ANOMALIES[an].color}">${ANOMALIES[an].icon} ${esc(ANOMALIES[an].name)}</b> in this system<div class="small">${esc(ANOMALIES[an].desc)}</div></div>`;
  {
    const near = Object.entries(W.states || {})
      .filter(([sys, st]) => SYS[sys] && STATES[st.k] && st.until > Date.now())
      .map(([sys, st]): [string, typeof st, number] => [
        sys,
        st,
        sys === G.sys ? 0 : (route(SYS, G.sys!, sys) || []).length || 99,
      ])
      .filter((x) => x[2] <= 8)
      .sort((a, b) => a[2] - b[2])
      .slice(0, 8); // the Rift today
    if (near.length)
      h +=
        `<div class="sect">THE RIFT TODAY <span class="dim small">troubled systems near you</span></div>` +
        near
          .map(([sys, st, j]) => {
            const X = STATES[st.k];
            return `<div class="kv"><span><span style="color:${X.color}">${X.icon} ${X.name}</span> · ${esc(SYS[sys].name)}${st.need ? ` <span class="dim small">${st.got}/${st.need}</span>` : ''}</span><span class="small dim">${j ? j + ' jump' + (j > 1 ? 's' : '') : 'here'} <button class="btn sm" data-plot="${sys}">PLOT</button></span></div>`;
          })
          .join('');
  }
  {
    if (y.holdout && y.holdout.active)
      h += `<div class="evbox inv"><b>HOLDOUT</b> · wave ${y.holdout.wave} of 10 · stay in your station's system</div>`;
  }
  if (y.goals) {
    h +=
      `<div class="sect">DAILY GOALS <span class="dim small">${credits(GOAL_REWARD.daily.credits)} cr + ${GOAL_REWARD.daily.tokens} scrip each</span></div>` +
      goalRows(y.goals.daily!, 'daily');
    h +=
      `<div class="sect">WEEKLY GOALS <span class="dim small">${credits(GOAL_REWARD.weekly.credits)} cr + ${GOAL_REWARD.weekly.tokens} scrip each</span></div>` +
      goalRows(y.goals.weekly!, 'weekly');
  }
  // the Armada at a glance (full controls in the ALLIES tab); multiplayer only
  const A = y.armada;
  if (!G.solo) {
    h += `<div class="sect">ARMADA</div>`;
    if (!A)
      h +=
        '<p class="dim small">You are not in an Armada. Form one, or accept an invite, from the ALLIES tab.</p>';
    else
      h +=
        `<div class="kv"><span><b>${esc(A.name)}</b></span><span class="small">${A.members!.filter((m) => m.online).length}/${A.members!.length} online</span></div>` +
        A.members!.map(
          (m) =>
            `<div class="kv"><span>${m.online ? '<b style="color:var(--ok)">●</b>' : '<span class="dim">○</span>'} ${esc(m.name)}${m.name === A.leader ? ' <span class="dim small">leader</span>' : ''}</span><span class="dim small">${esc(m.sys || '')}</span></div>`,
        ).join('');
  }
  if (W.calendar)
    h +=
      '<div class="sect">EVENT CALENDAR</div>' +
      W.calendar
        .map(
          (e, i) =>
            `<div class="kv"><span>${i === 0 ? '<b>' : ''}${esc(e.name)}${i === 0 ? '</b>' : ''}</span><span class="dim small">${i === 0 ? 'ends in ' + left(e.end) : new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>`,
        )
        .join('');
  return h;
}

/**
 * Returns array of eligible faction keys that offer Quartermaster stores.
 * @param {Record<string, FactionDef>} FACTIONS_ Faction definitions dictionary
 * @returns {string[]} Faction keys
 */
export const STORE_FACS = (FACTIONS_: Record<string, FactionDef>): string[] =>
  Object.entries(FACTIONS_)
    .filter(([k, F]) => !F.region && !F.hidden && k !== 'umbral')
    .map(([k]) => k);

/**
 * Renders the modal Faction Stores quartermaster dialog with faction selector tabs.
 * @param {ClientGameState} G Game state object
 * @param {Record<string, FactionDef>} FACTIONS_ Faction definitions
 * @returns {string} HTML markup
 */
export function storeMenuHtml(G: ClientGameState, FACTIONS_: Record<string, FactionDef>): string {
  const y = G.you!,
    facs = STORE_FACS(FACTIONS_),
    fac =
      G.storeFac && facs.includes(G.storeFac)
        ? G.storeFac
        : (G.landed && G.landed!.store) || 'quantum';
  G.storeFac = fac;
  const side = facs
    .map((k) => {
      const F = FACTIONS_[k],
        rep = y.rep[k] || 0,
        tok = (y.tokens && y.tokens[k]) || 0;
      return `<div class="sfac ${k === fac ? 'on' : ''}" data-act="sfac" data-f="${k}"><b style="color:${F.color}">${esc(F.short)}</b><span class="dim small">${rep} · ${tok} tokens</span></div>`;
    })
    .join('');
  return `<div class="store-heading"><div class="faction-screen"><img id="faction-insignia" src="assets/factions/${fac}.svg" alt="${esc(FACTIONS_[fac].name)} insignia" data-faction="${fac}" width="112" height="112"></div><h2>FACTION STORES <span class="dim small">Rift scrip: ${(y.tokens && y.tokens.any) || 0} · ${G.landed ? 'purchases are delivered to you here' : 'land anywhere to buy'}</span></h2></div><div class="sgrid"><div class="sfacs">${side}</div><div class="sbody well">${storeHtml(G, fac)}</div></div><button class="btn sm" data-act="sclose">CLOSE (Esc)</button>`;
}

/**
 * Renders the items and standing table for a specific faction store.
 * @param {ClientGameState} G Game state object
 * @param {string} [facArg] Faction key to display
 * @returns {string} HTML markup
 */
export function storeHtml(G: ClientGameState, facArg?: string): string {
  const y = G.you!,
    fac = (facArg || G.landed!.store)!,
    F = FACTIONS[fac],
    rep = y.rep[fac] || 0,
    tok = (y.tokens && y.tokens[fac]) || 0,
    scrip = (y.tokens && y.tokens.any) || 0,
    landed = !!G.landed;
  const tier = [...STORE_TIERS].reverse().find((t) => rep >= t.rep);
  let h = `<div class="sect" style="margin-top:0">${esc(F.name.toUpperCase())} QUARTERMASTER</div><div class="kv"><span>Your standing</span><span style="color:${F.color}">${rep} ${tier ? '· ' + tier.name : ''}</span></div>
    <div class="kv"><span>${F.short} tokens</span><span>${tok}</span></div><div class="kv"><span>Rift scrip <span class="dim small">(any store)</span></span><span>${scrip}</span></div>
    <div class="dim small">Earn ${F.short} tokens by finishing jobs in ${F.short} space and their commissions. Daily and weekly goals pay Rift scrip, which any store accepts.</div><table class="tbl"><tr><th>ITEM</th><th>STANDING</th><th>TOKENS</th><th>CREDITS</th><th></th></tr>`;
  for (const it of STORE_ITEMS) {
    const nm = it.give.crate
      ? `${STORE_MAT[fac]} crate (grade ${GRADES[it.give.crate as number]})`
      : it.name;
    const can = landed && rep >= it.rep && tok + scrip >= it.tokens && y.credits >= it.credits;
    h += `<tr><td>${esc(nm)}</td><td style="color:${rep >= it.rep ? '#8ff0ad' : '#ff9a8a'}">${it.rep}</td><td>${it.tokens}</td><td>${it.credits ? credits(it.credits) : '-'}</td><td style="text-align:right"><button class="btn sm" data-act="buystore" data-f="${fac}" data-id="${it.id}" ${can ? '' : 'disabled'}>BUY</button></td></tr>`;
  }
  return h + '</table>';
}
