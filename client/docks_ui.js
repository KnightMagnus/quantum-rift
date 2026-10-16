// 2.1 Docks: the DOCKS screen at your Personal Station, the dock switcher by the DEPART button, and the sidebar line.
import { ROLES, RARITY } from '/shared/hangar.js';
import { WING_REPAIR_COST, NEXT_DOCK_OPS } from '/shared/docks.js';
import { credits, repairBasis } from '/shared/rules.js';

/**
 * @typedef {Object} DockShip
 * @property {string} [uid] Unique identifier of the ship instance
 * @property {string} [name] Custom ship name
 * @property {string} hull Hull type identifier
 * @property {number} [repairT] Timestamp when repair completes
 * @property {boolean} [flying] Whether the ship is currently deployed/flying
 * @property {boolean} [wingOnly] Whether restricted to wingmate slot only
 * @property {string} [at] Dock assignment label (e.g. 'A', 'B')
 * @property {number|string} [cap] Assigned captain officer ID
 * @property {number|string} [crew] Assigned crew officer ID
 */

/**
 * @typedef {Object} DockBay
 * @property {string} letter Dock letter identifier (A, B, C, D)
 * @property {DockShip|null} lead Lead ship assigned to this dock
 * @property {Array<DockShip|null>} wings Wingmate ships assigned to this dock
 */

/**
 * @typedef {Object} DocksState
 * @property {number} count Total number of unlocked docks
 * @property {number} active Index of currently active dock
 * @property {number} cap Maximum hangar storage berth capacity
 * @property {DockBay[]} list List of dock bays
 * @property {DockShip[]} stored List of ships stored in hangar
 */

/**
 * HTML-escapes a string safely for insertion into template strings.
 * @param {any} s Input value
 * @returns {string} Escaped HTML string
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/**
 * Returns remaining time in minutes until the specified timestamp.
 * @param {number} t Completion timestamp in ms
 * @returns {number} Remaining whole minutes (at least 1)
 */
const mins = (t) => Math.max(1, Math.ceil((t - Date.now()) / 60000));

/**
 * Renders a visual slot card for a lead or wingmate ship.
 * @param {any} G Game state object
 * @param {DockShip|null} s Ship data
 * @param {string} empty Placeholder text when slot is empty
 * @returns {string} HTML markup
 */
function shipBox(G, s, empty) {
  if (!s)
    return `<div class="dslot empty"><div class="dimg"></div><div class="dsn dim">${empty}</div></div>`;
  const H = G.A.ships[s.hull] || {};
  return `<div class="dslot${s.repairT ? ' repair' : ''}"><img class="dimg" src="assets/${H.img}"><div class="dsn"><b>${esc(H.name)}</b><div class="dim small">"${esc(s.name)}"${s.flying ? ' · flying' : ''}${s.repairT ? ` · <span class="rep">repairs ${mins(s.repairT)} min</span>` : ''}</div></div></div>`;
}

/**
 * Renders a drop-down selector of stored ships for an individual dock slot.
 * @param {any} G Game state object
 * @param {DocksState} D Docks state
 * @param {number} k Dock index
 * @param {string|number} slot Slot identifier ('lead' or wingmate index)
 * @param {DockShip|null} cur Currently assigned ship
 * @param {boolean} interactive Whether controls are interactive
 * @returns {string} HTML markup
 */
function shipPick(G, D, k, slot, cur, interactive) {
  if (!interactive) return '';
  const opts = D.stored
    .filter((x) => slot !== 'lead' || !x.wingOnly)
    .map((x) => {
      const H = G.A.ships[x.hull] || {};
      return `<option value="${x.uid}"${cur && cur.uid === x.uid ? ' selected' : ''}>${esc(H.name)} "${esc(x.name)}"${x.at ? ` (${x.at})` : ''}</option>`;
    })
    .join('');
  const curOpt =
    cur && cur.flying
      ? `<option value="${cur.uid}" selected>${esc((G.A.ships[cur.hull] || {}).name)} "${esc(cur.name)}" (flying)</option>`
      : '';
  return `<select class="dpick" data-dk="${k}" data-slot="${slot}"><option value="">${cur ? '— empty this slot —' : '— choose a stored ship —'}</option>${curOpt}${opts}</select>`;
}

/**
 * Renders an officer assignment selector for a wingmate captain or crew role.
 * @param {any} G Game state object
 * @param {number} k Dock index
 * @param {number} w Wing slot index
 * @param {'cap'|'crew'} role Officer assignment role
 * @param {number|string|null} oid Assigned officer ID
 * @param {boolean} interactive Whether controls are interactive
 * @returns {string} HTML markup
 */
function crewPick(G, k, w, role, oid, interactive) {
  const y = G.you,
    o = y.officers.find((x) => x.id === oid);
  if (!interactive)
    return `<span class="dim small">${role === 'cap' ? 'Captain' : 'Crew'}: ${o ? esc(o.name) : 'none'}</span>`;
  const opts = y.officers
    .map(
      (x) =>
        `<option value="${x.id}"${x.id === oid ? ' selected' : ''}>${esc(x.name)} · ${RARITY[x.rarity].name} ${ROLES[x.role].name} Lv ${x.lv}</option>`,
    )
    .join('');
  return `<label class="dcrew"><span>${role === 'cap' ? 'CAPTAIN' : 'CREW'}</span><select data-dk="${k}" data-w="${w}" data-role="${role}"><option value="">none</option>${opts}</select></label>`;
}

/**
 * Renders the full Personal Station Docks interface including bays, wingmates, and stored ships.
 * @param {any} G Game state object
 * @param {boolean} [interactive] Whether interactive buttons and select elements are enabled
 * @returns {string} HTML markup
 */
export function docksHtml(G, interactive) {
  const y = G.you,
    D = y.docks;
  if (!D) return '';
  let h = `<div class="sect" style="margin-top:4px">DOCKS (${D.count} of 4)</div><div class="dim small">Each dock holds a lead ship and up to two wingmates, chosen from your stored ships. You fly the lead of your <b>active</b> dock, and its wingmates fly in formation with you. Officers you assign as a wingmate's captain and crew boost that ship. More docks open as your station's Ops level rises.</div>`;
  h +=
    `<div class="docks">` +
    D.list
      .map((k, i) => {
        const act = i === D.active;
        return `<div class="dock${act ? ' on' : ''}"><div class="dhead"><span class="dletter">DOCK ${k.letter}</span>${act ? '<span class="dact">ACTIVE</span>' : interactive && k.lead ? `<button class="btn sm" data-act="dockgo" data-k="${i}">FLY WITH DOCK ${k.letter}</button>` : ''}</div>
      <div class="drole">LEAD SHIP</div>${shipBox(G, k.lead, 'No lead ship')}${shipPick(G, D, i, 'lead', k.lead, interactive)}
      ${k.wings
        .map(
          (
            w,
            j,
          ) => `<div class="drole">WINGMATE ${j + 1}</div>${shipBox(G, w, 'Empty wing slot')}${shipPick(G, D, i, j, w, interactive)}
        ${w ? `<div class="dcrews">${crewPick(G, i, j, 'cap', w.cap, interactive)}${crewPick(G, i, j, 'crew', w.crew, interactive)}</div>${w.repairT ? `<button class="btn sm" data-act="wingrep" data-uid="${w.uid}">RUSH REPAIRS ${credits(Math.round(repairBasis(G.A, w.hull) * WING_REPAIR_COST))}</button>` : ''}` : ''}`,
        )
        .join('')}
    </div>`;
      })
      .join('') +
    `</div>`;
  if (D.count < 4)
    h += `<div class="dim small" style="margin-top:6px">Next dock opens at Ops ${NEXT_DOCK_OPS[D.count]}.</div>`;
  h += `<div class="sect">STORED SHIPS (${D.stored.length} / ${D.cap} berths)</div>`;
  if (!D.cap)
    h +=
      '<p class="dim">Your hangar opens at Ops 1. Ships you buy can then be sent straight to it (BUY TO HANGAR in any shipyard).</p>';
  h +=
    D.stored
      .map((x) => {
        const H = G.A.ships[x.hull] || {};
        return `<div class="it dstore"><img src="assets/${H.img}"><div style="flex:1"><b>${esc(H.name)}</b> <span class="dim">"${esc(x.name)}"</span><div class="dim small">${x.at ? `Dock ${esc(x.at)}` : 'Unassigned'}${x.wingOnly ? ' · wingmate only' : ''}${x.repairT ? ` · <span class="rep">repairs ${mins(x.repairT)} min</span>` : ''}</div></div>${interactive ? `<button class="btn sm" data-act="dock" data-op="sell" data-uid="${x.uid}">SELL</button>` : ''}</div>`;
      })
      .join('') ||
    (D.cap
      ? '<p class="dim small">No stored ships. Buy ships into your hangar at any shipyard, or capture them by boarding.</p>'
      : '');
  if (y.shipless)
    h += `<div class="dim small" style="color:#ff8a7a;margin-top:6px">You have no active ship: choose a lead ship for your active dock, or fly with another dock.</div>`;
  return h;
}

/**
 * Renders the dock switcher chips beside the DEPART button on landing screens.
 * @param {any} G Game state object
 * @param {boolean} atHome Whether landed at personal station
 * @returns {string} HTML markup
 */
export function dockChips(G, atHome) {
  const D = G.you && G.you.docks;
  if (!D || D.count < 2) return '';
  return `<span class="dchips"><span class="dim small">DOCK</span>${D.list.map((k, i) => `<button class="btn sm dchip${i === D.active ? ' on' : ''}" ${atHome && i !== D.active && k.lead ? `data-act="dockgo" data-k="${i}"` : 'disabled'} title="${k.lead ? esc((G.A.ships[k.lead.hull] || {}).name) + ` + ${k.wings.filter(Boolean).length} wingmate(s)` : 'No lead ship'}">${k.letter}</button>`).join('')}</span>`;
}

/**
 * Renders the compact sidebar status line for active dock and wingmate health.
 * @param {any} G Game state object
 * @returns {string} HTML markup or empty string
 */
export function dockLine(G) {
  const D = G.you && G.you.docks;
  if (!D) return '';
  const k = D.list[D.active];
  if (!k) return '';
  const ws = k.wings.filter(Boolean);
  if (!ws.length && D.count < 2) return '';
  return (
    `DOCK ${k.letter}` +
    (ws.length
      ? ' · ' +
        ws
          .map(
            (w) =>
              `<span class="${w.repairT ? 'rep' : 'wok'}" title="${esc(w.name)}${w.repairT ? ': under repair' : ''}">◆</span>`,
          )
          .join('') +
        ` ${ws.filter((w) => !w.repairT).length} wingmate${ws.filter((w) => !w.repairT).length === 1 ? '' : 's'}`
      : ' · no wingmates')
  );
}
