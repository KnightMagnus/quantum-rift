import { legacyHtml } from './eta-runtime.ts';
import {
  renderDocksUiDockChipsAttribute001,
  renderDocksUiOutfitterRepairsHtmlAttribute002,
} from './eta-templates.ts';
import {
  renderDocksUiShipBoxFragment001,
  renderDocksUiShipBoxFragment002,
  renderDocksUiShipBoxFragment003,
  renderDocksUiShipPickFragment004,
  renderDocksUiShipPickFragment005,
  renderDocksUiShipPickFragment006,
  renderDocksUiCrewPickFragment007,
  renderDocksUiCrewPickFragment008,
  renderDocksUiCrewPickFragment009,
  renderDocksUiDocksHtmlFragment010,
  renderDocksUiDocksHtmlFragment011,
  renderDocksUiDocksHtmlFragment012,
  renderDocksUiDocksHtmlFragment013,
  renderDocksUiDocksHtmlFragment014,
  renderDocksUiDocksHtmlFragment015,
  renderDocksUiDocksHtmlFragment016,
  renderDocksUiDocksHtmlFragment017,
  renderDocksUiDocksHtmlFragment018,
  renderDocksUiDocksHtmlFragment019,
  renderDocksUiDocksHtmlFragment020,
  renderDocksUiDocksHtmlFragment021,
  renderDocksUiDocksHtmlFragment022,
  renderDocksUiDocksHtmlFragment023,
  renderDocksUiDocksHtmlFragment024,
  renderDocksUiDocksHtmlFragment025,
  renderDocksUiDocksHtmlFragment026,
  renderDocksUiDockChipsFragment027,
  renderDocksUiDockChipsFragment028,
  renderDocksUiDockLineFragment029,
  renderDocksUiOutfitterRepairsHtmlFragment030,
  renderDocksUiOutfitterRepairsHtmlFragment031,
  renderDocksUiOutfitterRepairsHtmlFragment032,
} from './eta-templates.ts';
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
  if (!dockShip) return renderDocksUiShipBoxFragment001({ empty: legacyHtml(empty) });
  const shipHullAsset = clientGameState.A!.ships[dockShip.hull] || {};
  return renderDocksUiShipBoxFragment002({
    dockShipRepairT: legacyHtml(dockShip.repairT ? ' repair' : ''),
    artworkUrl: legacyHtml(artworkUrl(shipHullAsset.img!)),
    shipHullAssetName: shipHullAsset.name,
    dockShipName: dockShip.name,
    dockShipFlying: legacyHtml(dockShip.flying ? ' · flying' : ''),
    dockShipRepairT2: legacyHtml(
      dockShip.repairT
        ? renderDocksUiShipBoxFragment003({ minutes: legacyHtml(minutes(dockShip.repairT)) })
        : '',
    ),
  });
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
      return renderDocksUiShipPickFragment004({
        dockShip2Uid: dockShip2.uid,
        dockShip: legacyHtml(dockShip && dockShip.uid === dockShip2.uid ? ' selected' : ''),
        label: legacyHtml(label(dockShip2)),
        dockShip2At: legacyHtml(dockShip2.at ? ` (${escapeHtml2(dockShip2.at)})` : ''),
      });
    })
    .join('');
  const curOpt =
    dockShip && dockShip.flying
      ? renderDocksUiShipPickFragment005({
          dockShipUid: dockShip.uid,
          label: legacyHtml(label(dockShip)),
        })
      : '';
  return renderDocksUiShipPickFragment006({
    entryKey: legacyHtml(entryKey),
    slot: legacyHtml(slot),
    dockShip: legacyHtml(dockShip ? '— empty this slot —' : '— choose a stored ship —'),
    curOpt: legacyHtml(curOpt),
    join2: legacyHtml(join2),
  });
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
    return renderDocksUiCrewPickFragment007({
      role: legacyHtml(role === 'cap' ? 'Captain' : 'Crew'),
      officer: legacyHtml(officer ? escapeHtml2(officer.name) : 'none'),
    });
  const join2 = playerPayload.officers
    .map((officerRecord) =>
      renderDocksUiCrewPickFragment008({
        officerRecordId: legacyHtml(officerRecord.id),
        officerRecordId2: legacyHtml(officerRecord.id === officerId ? ' selected' : ''),
        officerRecordName: officerRecord.name,
        RARITY: legacyHtml(RARITY[officerRecord.rarity].name),
        ROLES: legacyHtml(ROLES[officerRecord.role].name),
        officerRecordLv: legacyHtml(officerRecord.lv),
      }),
    )
    .join('');
  return renderDocksUiCrewPickFragment009({
    role: legacyHtml(role === 'cap' ? 'CAPTAIN' : 'CREW'),
    entryKey: legacyHtml(entryKey),
    width: legacyHtml(width),
    role2: legacyHtml(role),
    join2: legacyHtml(join2),
  });
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
  let height = renderDocksUiDocksHtmlFragment010({
    docksPayloadCount: legacyHtml(docksPayload.count),
  });
  height +=
    renderDocksUiDocksHtmlFragment011() +
    docksPayload.list
      .map((entryKey, index) => {
        const action = index === docksPayload.active;
        return renderDocksUiDocksHtmlFragment012({
          action: legacyHtml(action ? ' on' : ''),
          entryKeyLetter: legacyHtml(entryKey.letter),
          action2: legacyHtml(
            action
              ? renderDocksUiDocksHtmlFragment013()
              : interactive && entryKey.lead
                ? renderDocksUiDocksHtmlFragment014({
                    index: legacyHtml(index),
                    entryKeyLetter: legacyHtml(entryKey.letter),
                  })
                : '',
          ),
          shipBox: legacyHtml(shipBox(clientGameState, entryKey.lead, 'No lead ship')),
          shipPick: legacyHtml(
            shipPick(clientGameState, docksPayload, index, 'lead', entryKey.lead, interactive),
          ),
          entryKeyWings: legacyHtml(
            entryKey.wings
              .map((dockShipPayload, innerIndex) =>
                renderDocksUiDocksHtmlFragment015({
                  innerIndex: legacyHtml(innerIndex + 1),
                  shipBox: legacyHtml(shipBox(clientGameState, dockShipPayload, 'Empty wing slot')),
                  shipPick: legacyHtml(
                    shipPick(
                      clientGameState,
                      docksPayload,
                      index,
                      innerIndex,
                      dockShipPayload,
                      interactive,
                    ),
                  ),
                  dockShipPayload: legacyHtml(
                    dockShipPayload
                      ? renderDocksUiDocksHtmlFragment016({
                          crewPick: legacyHtml(
                            crewPick(
                              clientGameState,
                              index,
                              innerIndex,
                              'cap',
                              dockShipPayload.cap,
                              interactive,
                            ),
                          ),
                          crewPick2: legacyHtml(
                            crewPick(
                              clientGameState,
                              index,
                              innerIndex,
                              'crew',
                              dockShipPayload.crew,
                              interactive,
                            ),
                          ),
                          dockShipPayloadRepairT: legacyHtml(
                            dockShipPayload.repairT
                              ? renderDocksUiDocksHtmlFragment017({
                                  dockShipPayloadUid: legacyHtml(dockShipPayload.uid),
                                  credits: legacyHtml(
                                    credits(
                                      Math.round(
                                        repairBasis(clientGameState.A!, dockShipPayload.hull) *
                                          WING_REPAIR_COST,
                                      ),
                                    ),
                                  ),
                                })
                              : '',
                          ),
                        })
                      : '',
                  ),
                }),
              )
              .join(''),
          ),
        });
      })
      .join('') +
    renderDocksUiDocksHtmlFragment018();
  if (docksPayload.count < 4)
    height += renderDocksUiDocksHtmlFragment019({
      NEXT_DOCK_OPS: legacyHtml(NEXT_DOCK_OPS[docksPayload.count]),
    });
  height += renderDocksUiDocksHtmlFragment020({
    docksPayloadStoredLength: legacyHtml(docksPayload.stored.length),
    docksPayloadCap: legacyHtml(docksPayload.cap),
  });
  if (!docksPayload.cap) height += renderDocksUiDocksHtmlFragment021();
  height +=
    docksPayload.stored
      .map((dockShipPayload) => {
        const shipHullAsset = clientGameState.A!.ships[dockShipPayload.hull] || {};
        return renderDocksUiDocksHtmlFragment022({
          artworkUrl: legacyHtml(artworkUrl(shipHullAsset.img!)),
          shipHullAssetName: shipHullAsset.name,
          dockShipPayloadName: dockShipPayload.name,
          dockShipPayloadAt: legacyHtml(
            dockShipPayload.at ? `Dock ${escapeHtml2(dockShipPayload.at)}` : 'Unassigned',
          ),
          dockShipPayloadWingOnly: legacyHtml(dockShipPayload.wingOnly ? ' · wingmate only' : ''),
          dockShipPayloadRepairT: legacyHtml(
            dockShipPayload.repairT
              ? renderDocksUiDocksHtmlFragment023({
                  minutes: legacyHtml(minutes(dockShipPayload.repairT)),
                })
              : '',
          ),
          interactive: legacyHtml(
            interactive
              ? renderDocksUiDocksHtmlFragment024({
                  dockShipPayloadUid: legacyHtml(dockShipPayload.uid),
                })
              : '',
          ),
        });
      })
      .join('') || (docksPayload.cap ? renderDocksUiDocksHtmlFragment025() : '');
  if (playerPayload.shipless) height += renderDocksUiDocksHtmlFragment026();
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
  return renderDocksUiDockChipsFragment027({
    docksPayloadListMap: legacyHtml(
      docksPayload.list
        .map((entryKey, index) =>
          renderDocksUiDockChipsFragment028({
            index: legacyHtml(index === docksPayload.active ? ' on' : ''),
            atHome: legacyHtml(
              atHome && index !== docksPayload.active && entryKey.lead
                ? renderDocksUiDockChipsAttribute001({ index: legacyHtml(index) })
                : 'disabled',
            ),
            entryKeyLead: legacyHtml(
              entryKey.lead
                ? escapeHtml2((clientGameState.A!.ships[entryKey.lead.hull] || {}).name) +
                    ` + ${entryKey.wings.filter((ship): ship is NonNullable<typeof ship> => Boolean(ship)).length} wingmate(s)`
                : 'No lead ship',
            ),
            entryKeyLetter: legacyHtml(entryKey.letter),
          }),
        )
        .join(''),
    ),
  });
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
          .map((dockShipPayload) =>
            renderDocksUiDockLineFragment029({
              dockShipPayloadRepairT: legacyHtml(dockShipPayload.repairT ? 'rep' : 'wok'),
              dockShipPayloadName: dockShipPayload.name,
              dockShipPayloadRepairT2: legacyHtml(dockShipPayload.repairT ? ': under repair' : ''),
            }),
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
  return renderDocksUiOutfitterRepairsHtmlFragment030({
    WING_REPAIR_MIN: legacyHtml(WING_REPAIR_MIN),
    disabledLength: legacyHtml(
      disabled.length
        ? disabled
            .map((dockShipPayload) => {
              const cost = Math.round(
                repairBasis(clientGameState.A!, dockShipPayload.hull) * WING_REPAIR_COST,
              );
              return renderDocksUiOutfitterRepairsHtmlFragment031({
                dockShipPayloadName: dockShipPayload.name,
                clientGameStateA: clientGameState.A!.ships[dockShipPayload.hull].name,
                minutes: legacyHtml(minutes(dockShipPayload.repairT)),
                dockShipPayloadUid: dockShipPayload.uid,
                playerPayloadCredits: legacyHtml(
                  playerPayload.credits < cost
                    ? renderDocksUiOutfitterRepairsHtmlAttribute002()
                    : '',
                ),
                credits: legacyHtml(credits(cost)),
              });
            })
            .join('')
        : renderDocksUiOutfitterRepairsHtmlFragment032(),
    ),
  });
}
