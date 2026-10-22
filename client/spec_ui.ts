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

import { escapeHtml as escapeHtml2 } from './html.ts';
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
 * @param {number} milliseconds Duration in milliseconds
 * @returns {string} Formatted duration (e.g. '15m' or '2h 10m')
 */
const minutes = (milliseconds: number): string => {
  const message = Math.max(0, Math.ceil(milliseconds / 60000));
  return message >= 60 ? `${Math.floor(message / 60)}h ${message % 60}m` : `${message}m`;
};

/**
 * Formats a specialist resource icon, amount, and name with faction color.
 * @param {string} entryKey Resource identifier
 * @param {number} count Resource quantity
 * @returns {string} HTML markup
 */
const response = (entryKey: string, count: number): string =>
  `<span style="color:${SPEC_RES[entryKey].color}">${entryKey === 'plasma' ? '<img alt="Plasma" width="20" height="20" src="/assets/icons/dredge-plasma.png">' : SPEC_RES[entryKey].icon} ${count} ${escapeHtml2(SPEC_RES[entryKey].name)}</span>`;

/**
 * Renders the full Specialists screen at the Personal Station or docked view.
 * @param {ClientGameState} clientGameState Game state object
 * @param {boolean} [interactive] Whether interactive buttons are enabled
 * @returns {string} HTML markup
 */
export function specialistsHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    blueprint = playerPayload.bp || {},
    _unusedSpecialist = playerPayload.spec || {},
    parts = playerPayload.parts || {},
    sessionState = playerPayload.specState || {},
    specialistShip = SPEC[playerPayload.ship.hull];
  let height = `<div class="dim small">${SPECIALISTS.length} one-of-a-kind ships, each built for a single job. Each job drops that ship's <b>blueprints</b>, whatever you fly. Flying the specialist itself earns its unique resource, which the station refines into <b>parts</b> (${PART_RATE} to 1). Parts upgrade her five components, and a full set unlocks a timed <b>tier-up</b> in the drydock, up to Tier ${TIER_MAX}.</div>`;
  if (specialistShip) {
    // the specialist you are flying
    const savedSpecialist = sessionState[specialistShip.id] || { tier: 1, comp: {} },
      specPower2 = specPower(savedSpecialist),
      cost = COMP_COST(savedSpecialist.tier),
      full = Object.keys(COMPONENTS).every(
        (component) => (savedSpecialist.comp[component] || 0) >= savedSpecialist.tier,
      );
    height += `<div class="ocard" style="border-color:#c9a24a88;margin-top:6px"><div class="oname"><img src="${artworkUrl(clientGameState.A!.ships[specialistShip.id].img!)}" style="width:84px;height:64px;object-fit:contain;float:left;margin-right:8px"><b style="font-size:15px;color:#fff">${escapeHtml2(specialistShip.name)}</b> <span class="dim">${escapeHtml2(specialistShip.sub)}</span> <span style="color:${ROLES_INFO[specialistShip.role].color}">${ROLES_INFO[specialistShip.role].icon} ${ROLES_INFO[specialistShip.role].name}</span>
      <div style="color:#ffd27a">${'★'.repeat(savedSpecialist.tier)}${'☆'.repeat(TIER_MAX - savedSpecialist.tier)} Tier ${savedSpecialist.tier} · specialty ${Math.round(specPower2 * 100)}%</div><div class="small">${escapeHtml2(specialistShip.ability)}</div></div>
      <div class="kv" style="clear:both"><span>${response(specialistShip.res, specialistResource(playerPayload, specialistShip))}</span><span>${specialistShip.key === 'star_dredge' ? '<img alt="Industrial part" width="20" height="20" src="/assets/icons/dredge-part.png">' : ''}${parts[specialistShip.id] || 0} parts ${interactive && specialistResource(playerPayload, specialistShip) >= PART_RATE ? `<button class="btn sm" data-act="spec" data-op="parts" data-id="${specialistShip.id}">REFINE ${Math.floor(specialistResource(playerPayload, specialistShip) / PART_RATE)}</button>` : ''}</span></div>`;
    if (savedSpecialist.upT && savedSpecialist.upT > Date.now())
      height += `<div class="kv"><span style="color:#7ad0ff">In the drydock for Tier ${savedSpecialist.tier + 1}</span><span>${minutes(savedSpecialist.upT - Date.now())} left</span></div>`;
    else {
      height +=
        '<table class="tbl"><tr><th>COMPONENT</th><th>LEVEL</th><th>EACH LEVEL</th><th></th></tr>' +
        Object.entries(COMPONENTS)
          .map(([component, specialistComponent]) => {
            const level = savedSpecialist.comp[component] || 0,
              allowed = level < savedSpecialist.tier;
            return `<tr><td>${specialistShip.key === 'star_dredge' ? DREDGE_COMPONENT_NAMES[component] : specialistComponent.name}</td><td>${level} / ${savedSpecialist.tier}</td><td class="dim small">${Object.entries(
              specialistComponent.bonus,
            )
              .map(([entryKey, value]) =>
                entryKey === 'ability'
                  ? specialistShip.key === 'star_dredge'
                    ? '−1% active heat demand (cap20%; no output/rate gain)'
                    : `+${value}% specialty`
                  : `+${value}% ${entryKey.replace('Pct', '')}`,
              )
              .join(
                ', ',
              )}</td><td style="text-align:right">${allowed ? (interactive ? `<button class="btn sm" data-act="spec" data-op="comp" data-c="${component}">${cost.parts} parts + ${credits(cost.credits)}</button>` : `<span class="dim small">${cost.parts} parts</span>`) : '<span style="color:var(--ok)">✓</span>'}</td></tr>`;
          })
          .join('') +
        '</table>';
      if (savedSpecialist.tier < TIER_MAX)
        height += full
          ? interactive
            ? `<button class="btn sm" data-act="spec" data-op="tierup">TIER UP TO ${savedSpecialist.tier + 1} (${TIER_UP_MIN[savedSpecialist.tier]} min in drydock)</button>`
            : `<div class="dim small">Ready for Tier ${savedSpecialist.tier + 1}. Tier her up at your station.</div>`
          : `<div class="dim small">Upgrade every component to unlock Tier ${savedSpecialist.tier + 1}.</div>`;
    }
    height += '</div>';
  }
  height +=
    '<div class="sect">THE SPECIALISTS</div><div class="ogrid">' +
    SPECIALISTS.map((specialistShip) => {
      const count = blueprint[specialistShip.id] || 0,
        roleInfo = ROLES_INFO[specialistShip.role],
        savedSpecialist = sessionState[specialistShip.id];
      const button = interactive
        ? playerPayload.station.ops < BUILD.ops
          ? `<span class="dim small">Station Tier ${BUILD.ops}</span>`
          : count >= BP_NEED
            ? `<button class="btn sm" data-act="spec" data-op="build" data-id="${specialistShip.id}">BUILD · ${credits(specialistShip.cost)}</button>`
            : ''
        : '';
      return `<div class="ocard"><div class="oname"><img src="${artworkUrl(clientGameState.A!.ships[specialistShip.id].img!)}" style="width:64px;height:48px;object-fit:contain;float:left;margin-right:6px"><b>${escapeHtml2(specialistShip.name)}</b> <span class="small" style="color:${roleInfo.color}">${roleInfo.icon} ${roleInfo.name}</span>${savedSpecialist ? ` <span style="color:#ffd27a" class="small">T${savedSpecialist.tier}</span>` : ''}<div class="dim small">${escapeHtml2(specialistShip.sub)}</div></div>
      <div class="small" style="clear:both">${escapeHtml2(specialistShip.ability)}</div><div class="dim small">Loop: ${escapeHtml2(specialistShip.loop)}</div>
      <div class="kv"><span class="small">${specialistShip.key === 'star_dredge' ? '<img alt="Blueprint" width="24" height="24" src="/assets/icons/dredge-blueprint.png">' : ''} Blueprints ${Math.min(count, BP_NEED)}/${BP_NEED}</span><span class="small">${response(specialistShip.res, specialistResource(playerPayload, specialistShip))} · ${parts[specialistShip.id] || 0} parts</span></div><div class="xpbar"><i style="width:${Math.min(100, (100 * count) / BP_NEED)}%;background:#c9a24a"></i></div>${button}</div>`;
    }).join('') +
    '</div>';
  if (interactive)
    height += `<div class="dim small">Building a specialist also takes ${BUILD.mats.map(([message, game, count]) => `${count} ${message} ${GRADES[game]}`).join(', ')}. Your current ship is traded in, or store it in the drydock first.</div>`;
  return height;
}
