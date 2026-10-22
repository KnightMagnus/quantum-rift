import type { ClientGameState } from './main.ts';
export type DockShip = {
  /** Unique identifier of the ship instance */
  uid?: string;

  /** Custom ship name */
  name?: string;

  /** Hull type identifier */
  hull: string | number;

  /** Timestamp when repair completes */
  repairT?: number;

  /** Whether the ship is currently deployed/flying */
  flying?: boolean;

  /** Whether restricted to wingmate slot only */
  wingOnly?: boolean;

  /** Dock assignment label (e.g. 'A', 'B') */
  at?: string | null;

  /** Assigned captain officer ID */
  cap?: number | string | null;

  /** Assigned crew officer ID */
  crew?: number | string | null;
};
export type DockBay = {
  /** Dock letter identifier (A, B, C, D) */
  letter: string;
  /** Lead ship assigned to this dock */
  lead: DockShip | null;
  /** Wingmate ships assigned to this dock */
  wings: Array<DockShip | null>;
};
export type DocksState = {
  /** Total number of unlocked docks */
  count: number;

  /** Index of currently active dock */
  active: number;

  /** Maximum hangar storage berth capacity */
  cap: number;

  /** List of dock bays */
  list: DockBay[];

  /** List of ships stored in hangar */
  stored: DockShip[];
};

import { escapeHtml as escapeHtml2 } from './html.ts';
import { artworkUrl } from './artwork.ts';
// Docks: the DOCKS screen at your Personal Station, the dock switcher by the DEPART button, and the sidebar line.
import { ROLES, RARITY } from '../shared/hangar.ts';
import { WING_REPAIR_COST, WING_REPAIR_MIN, NEXT_DOCK_OPS } from '../shared/docks.ts';
import { credits, repairBasis } from '../shared/rules.ts';

/**
 * Returns remaining time in minutes until the specified timestamp.
 * @param time Completion timestamp in ms
 * @returns Remaining whole minutes (at least 1)
 */
const minutes = (time: number): number => Math.max(1, Math.ceil((time - Date.now()) / 60000));

/**
 * Renders a visual slot card for a lead or wingmate ship.
 * @param clientGameState Game state object
 * @param dockShip Ship data
 * @param empty Placeholder text when slot is empty
 * @returns HTML markup
 */
function shipBox(
  clientGameState: ClientGameState,
  dockShip: DockShip | null,
  empty: string,
): string {
  if (!dockShip)
    return `<div class="dslot empty"><div class="dimg"></div><div class="dsn dim">${empty}</div></div>`;
  const shipHullAsset = clientGameState.A!.ships[dockShip.hull] || {};
  return `<div class="dslot${dockShip.repairT ? ' repair' : ''}"><img class="dimg" src="${artworkUrl(shipHullAsset.img!)}"><div class="dsn"><b>${escapeHtml2(shipHullAsset.name)}</b><div class="dim small">"${escapeHtml2(dockShip.name)}"${dockShip.flying ? ' · flying' : ''}${dockShip.repairT ? ` · <span class="rep">repairs ${minutes(dockShip.repairT)} min</span>` : ''}</div></div></div>`;
}

/**
 * Renders a drop-down selector of stored ships for an individual dock slot.
 * @param clientGameState Game state object
 * @param docksState Docks state
 * @param entryKey Dock index
 * @param slot Slot identifier ('lead' or wingmate index)
 * @param dockShip Currently assigned ship
 * @param interactive Whether controls are interactive
 * @returns HTML markup
 */
function shipPick(
  clientGameState: ClientGameState,
  docksState: DocksState,
  entryKey: number,
  slot: string | number,
  dockShip: DockShip | null,
  interactive?: boolean,
): string {
  const label = (ship: DockShip) => {
    const hull = (clientGameState.A!.ships[ship.hull] || {}).name;
    const custom = ship.name?.trim();
    return escapeHtml2(hull) + (custom && custom !== hull ? ` "${escapeHtml2(ship.name)}"` : '');
  };
  if (!interactive) return '';
  const join2 = docksState.stored
    .filter((dockShip) => slot !== 'lead' || !dockShip.wingOnly)
    .map((dockShip2) => {
      return `<option value="${escapeHtml2(dockShip2.uid)}"${dockShip && dockShip.uid === dockShip2.uid ? ' selected' : ''}>${label(dockShip2)}${dockShip2.at ? ` (${escapeHtml2(dockShip2.at)})` : ''}</option>`;
    })
    .join('');
  const curOpt =
    dockShip && dockShip.flying
      ? `<option value="${escapeHtml2(dockShip.uid)}" selected>${label(dockShip)} (flying)</option>`
      : '';
  return `<select class="dpick" data-dk="${entryKey}" data-slot="${slot}"><option value="">${dockShip ? '— empty this slot —' : '— choose a stored ship —'}</option>${curOpt}${join2}</select>`;
}

/**
 * Renders an officer assignment selector for a wingmate captain or crew role.
 * @param clientGameState Game state object
 * @param entryKey Dock index
 * @param width Wing slot index
 * @param role Officer assignment role
 * @param officerId Assigned officer ID
 * @param interactive Whether controls are interactive
 * @returns HTML markup
 */
function crewPick(
  clientGameState: ClientGameState,
  entryKey: number,
  width: number,
  role: 'cap' | 'crew',
  officerId: number | string | null | undefined,
  interactive?: boolean,
): string {
  const playerPayload = clientGameState.you!,
    officer = playerPayload.officers.find((officerRecord) => officerRecord.id === officerId);
  if (!interactive)
    return `<span class="dim small">${role === 'cap' ? 'Captain' : 'Crew'}: ${officer ? escapeHtml2(officer.name) : 'none'}</span>`;
  const join2 = playerPayload.officers
    .map(
      (officerRecord) =>
        `<option value="${officerRecord.id}"${officerRecord.id === officerId ? ' selected' : ''}>${escapeHtml2(officerRecord.name)} · ${RARITY[officerRecord.rarity].name} ${ROLES[officerRecord.role].name} Lv ${officerRecord.lv}</option>`,
    )
    .join('');
  return `<label class="dcrew"><span>${role === 'cap' ? 'CAPTAIN' : 'CREW'}</span><select data-dk="${entryKey}" data-w="${width}" data-role="${role}"><option value="">none</option>${join2}</select></label>`;
}

/**
 * Renders the full Personal Station Docks interface including bays, wingmates, and stored ships.
 * @param clientGameState Game state object
 * @param interactive Whether interactive buttons and select elements are enabled
 * @returns HTML markup
 */
export function docksHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    docksPayload = playerPayload.docks;
  if (!docksPayload) return '';
  let height = `<div class="sect" style="margin-top:4px">DOCKS (${docksPayload.count} of 4)</div><div class="dim small">Each dock holds a lead ship and up to two wingmates, chosen from your stored ships. You fly the lead of your <b>active</b> dock, and its wingmates fly in formation with you. Officers you assign as a wingmate's captain and crew boost that ship. More docks open as your station's Station Tier rises.</div>`;
  height +=
    `<div class="docks">` +
    docksPayload.list
      .map((entryKey, index) => {
        const action = index === docksPayload.active;
        return `<div class="dock${action ? ' on' : ''}"><div class="dhead"><span class="dletter">DOCK ${entryKey.letter}</span>${action ? '<span class="dact">ACTIVE</span>' : interactive && entryKey.lead ? `<button class="btn sm" data-act="dockgo" data-k="${index}">FLY WITH DOCK ${entryKey.letter}</button>` : ''}</div>
      <div class="drole">LEAD SHIP</div>${shipBox(clientGameState, entryKey.lead, 'No lead ship')}${shipPick(clientGameState, docksPayload, index, 'lead', entryKey.lead, interactive)}
      ${entryKey.wings
        .map(
          (
            dockShipPayload,
            innerIndex,
          ) => `<div class="drole">WINGMATE ${innerIndex + 1}</div>${shipBox(clientGameState, dockShipPayload, 'Empty wing slot')}${shipPick(clientGameState, docksPayload, index, innerIndex, dockShipPayload, interactive)}
        ${dockShipPayload ? `<div class="dcrews">${crewPick(clientGameState, index, innerIndex, 'cap', dockShipPayload.cap, interactive)}${crewPick(clientGameState, index, innerIndex, 'crew', dockShipPayload.crew, interactive)}</div>${dockShipPayload.repairT ? `<button class="btn sm" data-act="wingrep" data-uid="${dockShipPayload.uid}">RUSH REPAIRS ${credits(Math.round(repairBasis(clientGameState.A!, dockShipPayload.hull) * WING_REPAIR_COST))}</button>` : ''}` : ''}`,
        )
        .join('')}
    </div>`;
      })
      .join('') +
    `</div>`;
  if (docksPayload.count < 4)
    height += `<div class="dim small" style="margin-top:6px">Next dock opens at Station Tier ${NEXT_DOCK_OPS[docksPayload.count]}.</div>`;
  height += `<div class="sect">STORED SHIPS (${docksPayload.stored.length} / ${docksPayload.cap} berths)</div>`;
  if (!docksPayload.cap)
    height +=
      '<p class="dim">Your hangar opens at Station Tier 1. Ships you buy can then be sent straight to it (BUY TO HANGAR in any shipyard).</p>';
  height +=
    docksPayload.stored
      .map((dockShipPayload) => {
        const shipHullAsset = clientGameState.A!.ships[dockShipPayload.hull] || {};
        return `<div class="it dstore"><img src="${artworkUrl(shipHullAsset.img!)}"><div style="flex:1"><b>${escapeHtml2(shipHullAsset.name)}</b> <span class="dim">"${escapeHtml2(dockShipPayload.name)}"</span><div class="dim small">${dockShipPayload.at ? `Dock ${escapeHtml2(dockShipPayload.at)}` : 'Unassigned'}${dockShipPayload.wingOnly ? ' · wingmate only' : ''}${dockShipPayload.repairT ? ` · <span class="rep">repairs ${minutes(dockShipPayload.repairT)} min</span>` : ''}</div></div>${interactive ? `<button class="btn sm" data-act="dock" data-op="sell" data-uid="${dockShipPayload.uid}">SELL</button>` : ''}</div>`;
      })
      .join('') ||
    (docksPayload.cap
      ? '<p class="dim small">No stored ships. Buy ships into your hangar at any shipyard, or capture them by boarding.</p>'
      : '');
  if (playerPayload.shipless)
    height += `<div class="dim small" style="color:#ff8a7a;margin-top:6px">You have no active ship: choose a lead ship for your active dock, or fly with another dock.</div>`;
  return height;
}

/**
 * Renders the dock switcher chips beside the DEPART button on landing screens.
 * @param clientGameState Game state object
 * @param atHome Whether landed at personal station
 * @returns HTML markup
 */
export function dockChips(clientGameState: ClientGameState, atHome: boolean): string {
  const docksPayload = clientGameState.you && clientGameState.you!.docks;
  if (!docksPayload || docksPayload.count < 2) return '';
  return `<span class="dchips"><span class="dim small">DOCK</span>${docksPayload.list.map((entryKey, index) => `<button class="btn sm dchip${index === docksPayload.active ? ' on' : ''}" ${atHome && index !== docksPayload.active && entryKey.lead ? `data-act="dockgo" data-k="${index}"` : 'disabled'} title="${entryKey.lead ? escapeHtml2((clientGameState.A!.ships[entryKey.lead.hull] || {}).name) + ` + ${entryKey.wings.filter((ship): ship is NonNullable<typeof ship> => Boolean(ship)).length} wingmate(s)` : 'No lead ship'}">${entryKey.letter}</button>`).join('')}</span>`;
}

/**
 * Renders the compact sidebar status line for active dock and wingmate health.
 * @param clientGameState Game state object
 * @returns HTML markup or empty string
 */
export function dockLine(clientGameState: ClientGameState): string {
  const docksPayload = clientGameState.you && clientGameState.you!.docks;
  if (!docksPayload) return '';
  const list2 = docksPayload.list[docksPayload.active];
  if (!list2) return '';
  const dockShipPayloads = list2.wings.filter((ship): ship is NonNullable<typeof ship> =>
    Boolean(ship),
  );
  if (!dockShipPayloads.length && docksPayload.count < 2) return '';
  return (
    `DOCK ${list2.letter}` +
    (dockShipPayloads.length
      ? ' · ' +
        dockShipPayloads
          .map(
            (dockShipPayload) =>
              `<span class="${dockShipPayload.repairT ? 'rep' : 'wok'}" title="${escapeHtml2(dockShipPayload.name)}${dockShipPayload.repairT ? ': under repair' : ''}">◆</span>`,
          )
          .join('') +
        ` ${dockShipPayloads.filter((dockShipPayload) => !dockShipPayload.repairT).length} wingmate${dockShipPayloads.filter((dockShipPayload) => !dockShipPayload.repairT).length === 1 ? '' : 's'}`
      : ' · no wingmates')
  );
}

/**
 * Quoted rush repairs at landed outfitter ports. Uses the same stored ships and fee as DOCKS.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function outfitterRepairsHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    disabled = (playerPayload.docks?.stored || []).filter(
      (dockShipPayload) => dockShipPayload.repairT > Date.now(),
    );
  return `<div class="sect">WINGMATE REPAIRS</div><p class="dim small">Disabled wingmates repair automatically for free after ${WING_REPAIR_MIN} minutes. Pay the quoted fee to finish repairs now; the ship remains in your hangar until launch.</p>${
    disabled.length
      ? disabled
          .map((dockShipPayload) => {
            const cost = Math.round(
              repairBasis(clientGameState.A!, dockShipPayload.hull) * WING_REPAIR_COST,
            );
            return `<div class="kv"><span><b>${escapeHtml2(dockShipPayload.name)}</b> · ${escapeHtml2(clientGameState.A!.ships[dockShipPayload.hull].name)} <span class="dim small">· ${minutes(dockShipPayload.repairT)} min remaining</span></span><button class="btn sm" data-act="outfitterrep" data-uid="${escapeHtml2(dockShipPayload.uid)}"${playerPayload.credits < cost ? ' disabled title="Not enough credits"' : ''}>RUSH REPAIRS ${credits(cost)}</button></div>`;
          })
          .join('')
      : '<p class="dim small">No disabled wingmates awaiting repairs.</p>'
  }`;
}
