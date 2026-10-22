import type { ClientGameState } from './main.ts';
export type SpecialistComponent = { name: string; bonus: Record<string, number> };
export type SpecialistDef = {
  id: string;
  name: string;
  sub: string;
  role: string;
  res: string;
  ability: string;
  loop: string;
  cost: number;
};
export type SpecialistProgress = { tier: number; comp: Record<string, number>; upT?: number };

import { escapeHtml as esc } from './html.ts';
import { artworkUrl } from './artwork.ts';
// Quantum Rift: interface: the Specialists section of the station (blueprints, building, parts, components, tier-ups).
import { GRADES } from '../shared/galaxy.ts';
import {
  SPECIALISTS,
  SPEC,
  SPEC_RES,
  BP_NEED,
  BUILD,
  PART_RATE,
  COMPONENTS,
  TIER_MAX,
  COMP_COST,
  TIER_UP_MIN,
  specPower,
  specialistResource,
  DREDGE_COMPONENT_NAMES,
} from '../shared/specialty.ts';
import { ROLES_INFO } from '../shared/roles.ts';
import { credits } from '../shared/rules.ts';

/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {Object} SpecialistComponent
 * @property {string} name Display name of component
 * @property {Record<string, number>} bonus Stat bonuses
 */

/**
 * @typedef {Object} SpecialistDef
 * @property {string} id Unique hull identifier
 * @property {string} name Ship name
 * @property {string} sub Ship subtitle / designation
 * @property {string} role Ship role identifier
 * @property {string} res Unique specialist resource key
 * @property {string} ability Description of special ability
 * @property {string} loop Primary gameplay loop description
 * @property {number} cost Credit cost to build
 */

/**
 * @typedef {Object} SpecialistProgress
 * @property {number} tier Current specialist tier (1..5)
 * @property {Record<string, number>} comp Current component upgrade levels
 * @property {number} [upT] Timestamp when tier-up in drydock completes
 */

/**
 * Formats duration in milliseconds to a human-readable minutes and hours string.
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted duration (e.g. '15m' or '2h 10m')
 */
const mins = (ms: number): string => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/**
 * Formats a specialist resource icon, amount, and name with faction color.
 * @param {string} k Resource identifier
 * @param {number} n Resource quantity
 * @returns {string} HTML markup
 */
const res = (k: string, n: number): string =>
  `<span style="color:${SPEC_RES[k].color}">${k === 'plasma' ? '<img alt="Plasma" width="20" height="20" src="/assets/icons/dredge-plasma.png">' : SPEC_RES[k].icon} ${n} ${esc(SPEC_RES[k].name)}</span>`;

/**
 * Renders the full Specialists screen at the Personal Station or docked view.
 * @param {ClientGameState} G Game state object
 * @param {boolean} [interactive] Whether interactive buttons are enabled
 * @returns {string} HTML markup
 */
export function specialistsHtml(G: ClientGameState, interactive?: boolean): string {
  const y = G.you!,
    bp = y.bp || {},
    _spec = y.spec || {},
    parts = y.parts || {},
    ss = y.specState || {},
    cur = SPEC[y.ship.hull];
  let h = `<div class="dim small">${SPECIALISTS.length} one-of-a-kind ships, each built for a single job. Each job drops that ship's <b>blueprints</b>, whatever you fly. Flying the specialist itself earns its unique resource, which the station refines into <b>parts</b> (${PART_RATE} to 1). Parts upgrade her five components, and a full set unlocks a timed <b>tier-up</b> in the drydock, up to Tier ${TIER_MAX}.</div>`;
  if (cur) {
    // the specialist you are flying
    const st = ss[cur.id] || { tier: 1, comp: {} },
      pw = specPower(st),
      cost = COMP_COST(st.tier),
      full = Object.keys(COMPONENTS).every((c) => (st.comp[c] || 0) >= st.tier);
    h += `<div class="ocard" style="border-color:#c9a24a88;margin-top:6px"><div class="oname"><img src="${artworkUrl(G.A!.ships[cur.id].img!)}" style="width:84px;height:64px;object-fit:contain;float:left;margin-right:8px"><b style="font-size:15px;color:#fff">${esc(cur.name)}</b> <span class="dim">${esc(cur.sub)}</span> <span style="color:${ROLES_INFO[cur.role].color}">${ROLES_INFO[cur.role].icon} ${ROLES_INFO[cur.role].name}</span>
      <div style="color:#ffd27a">${'★'.repeat(st.tier)}${'☆'.repeat(TIER_MAX - st.tier)} Tier ${st.tier} · specialty ${Math.round(pw * 100)}%</div><div class="small">${esc(cur.ability)}</div></div>
      <div class="kv" style="clear:both"><span>${res(cur.res, specialistResource(y, cur))}</span><span>${cur.key === 'star_dredge' ? '<img alt="Industrial part" width="20" height="20" src="/assets/icons/dredge-part.png">' : ''}${parts[cur.id] || 0} parts ${interactive && specialistResource(y, cur) >= PART_RATE ? `<button class="btn sm" data-act="spec" data-op="parts" data-id="${cur.id}">REFINE ${Math.floor(specialistResource(y, cur) / PART_RATE)}</button>` : ''}</span></div>`;
    if (st.upT && st.upT > Date.now())
      h += `<div class="kv"><span style="color:#7ad0ff">In the drydock for Tier ${st.tier + 1}</span><span>${mins(st.upT - Date.now())} left</span></div>`;
    else {
      h +=
        '<table class="tbl"><tr><th>COMPONENT</th><th>LEVEL</th><th>EACH LEVEL</th><th></th></tr>' +
        Object.entries(COMPONENTS)
          .map(([c, C]) => {
            const lv = st.comp[c] || 0,
              can = lv < st.tier;
            return `<tr><td>${cur.key === 'star_dredge' ? DREDGE_COMPONENT_NAMES[c] : C.name}</td><td>${lv} / ${st.tier}</td><td class="dim small">${Object.entries(
              C.bonus,
            )
              .map(([k, v]) =>
                k === 'ability'
                  ? cur.key === 'star_dredge'
                    ? '−1% active heat demand (cap20%; no output/rate gain)'
                    : `+${v}% specialty`
                  : `+${v}% ${k.replace('Pct', '')}`,
              )
              .join(
                ', ',
              )}</td><td style="text-align:right">${can ? (interactive ? `<button class="btn sm" data-act="spec" data-op="comp" data-c="${c}">${cost.parts} parts + ${credits(cost.credits)}</button>` : `<span class="dim small">${cost.parts} parts</span>`) : '<span style="color:var(--ok)">✓</span>'}</td></tr>`;
          })
          .join('') +
        '</table>';
      if (st.tier < TIER_MAX)
        h += full
          ? interactive
            ? `<button class="btn sm" data-act="spec" data-op="tierup">TIER UP TO ${st.tier + 1} (${TIER_UP_MIN[st.tier]} min in drydock)</button>`
            : `<div class="dim small">Ready for Tier ${st.tier + 1}. Tier her up at your station.</div>`
          : `<div class="dim small">Upgrade every component to unlock Tier ${st.tier + 1}.</div>`;
    }
    h += '</div>';
  }
  h +=
    '<div class="sect">THE SPECIALISTS</div><div class="ogrid">' +
    SPECIALISTS.map((sp) => {
      const n = bp[sp.id] || 0,
        R = ROLES_INFO[sp.role],
        st = ss[sp.id];
      const btn = interactive
        ? y.station.ops < BUILD.ops
          ? `<span class="dim small">Station Tier ${BUILD.ops}</span>`
          : n >= BP_NEED
            ? `<button class="btn sm" data-act="spec" data-op="build" data-id="${sp.id}">BUILD · ${credits(sp.cost)}</button>`
            : ''
        : '';
      return `<div class="ocard"><div class="oname"><img src="${artworkUrl(G.A!.ships[sp.id].img!)}" style="width:64px;height:48px;object-fit:contain;float:left;margin-right:6px"><b>${esc(sp.name)}</b> <span class="small" style="color:${R.color}">${R.icon} ${R.name}</span>${st ? ` <span style="color:#ffd27a" class="small">T${st.tier}</span>` : ''}<div class="dim small">${esc(sp.sub)}</div></div>
      <div class="small" style="clear:both">${esc(sp.ability)}</div><div class="dim small">Loop: ${esc(sp.loop)}</div>
      <div class="kv"><span class="small">${sp.key === 'star_dredge' ? '<img alt="Blueprint" width="24" height="24" src="/assets/icons/dredge-blueprint.png">' : ''} Blueprints ${Math.min(n, BP_NEED)}/${BP_NEED}</span><span class="small">${res(sp.res, specialistResource(y, sp))} · ${parts[sp.id] || 0} parts</span></div><div class="xpbar"><i style="width:${Math.min(100, (100 * n) / BP_NEED)}%;background:#c9a24a"></i></div>${btn}</div>`;
    }).join('') +
    '</div>';
  if (interactive)
    h += `<div class="dim small">Building a specialist also takes ${BUILD.mats.map(([m, g, n]) => `${n} ${m} ${GRADES[g]}`).join(', ')}. Your current ship is traded in, or store it in the drydock first.</div>`;
  return h;
}
