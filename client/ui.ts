import { overlays } from './overlay-controller.ts';
import { storySystemVisible, storyDescription } from '../shared/story-world.ts';
import { ui as playInterfaceSound } from './audio.ts';
import { landscapeScene } from '../shared/landscapes.ts';
import type { PlayerPayload, LandedPayload } from './main.ts';
import type { Mission } from '../server/game.ts';
import type { OutfitAsset } from '../shared/rules.ts';
import type { RoleId } from '../shared/roles.ts';
import { elementById } from './dom.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import type { ClientGameState } from './main.ts';
import type { ShipHull } from './render.ts';
export type AskOptions = {
  /** Confirm button label */
  yes?: string;
};
export type RadioStation = {
  /** Unique station identifier */
  id: string;
  /** Station name */
  name: string;
  /** Station subtitle or call letters */
  sub: string;
  /** Station logo image URL */
  img?: string;
};
export type CodexItem = {
  /** Unique codex entry key */
  id: string;

  /** Title of the codex item */
  name: string;

  /** Subtitle or categorization */
  sub?: string;

  /** Category identifier ('factions' | 'ships' | 'outfits' | 'galaxy') */
  cat?: string;

  /** Detailed entry narrative */
  desc?: string;

  /** Associated asset image filename */
  img?: string;
};
export type LandedMarketItem = {
  /** Commodity identifier */
  id: string;

  /** Commodity name */
  name: string;

  /** Current port price */
  price: number;

  /** Base galactic price */
  base: number;

  /** Quantity currently held in player cargo */
  hold?: number;
};
export type LandedMatItem = {
  /** Material identifier */
  id: string;
  /** Material display name */
  name: string;
  /** Owned amount */
  count: number;
  /** Material rarity tier */
  tier?: number;
};
export type LandedOffer = Mission;
export type LandedState = LandedPayload;
export type SystemState = import('../server/world-contracts.ts').LivingPayloadState;
export type JobInfo = {
  /** Destination system and jump-count description. */
  where: string;
  /** Requirements or capacity warning; empty when none. */
  warn: string;
  /** Additional mission advice or threat information; empty when none. */
  note: string;
};

import { escapeHtml as escapeHtml2 } from './html.ts';
import {
  missionDetails,
  missionFactsHtml,
  missionFiltersHtml,
  filterMissions,
} from './mission-details.ts';
import { initCockpitState } from './cockpit-state.ts';
import { tradeEstimateHtml, receiptHtml, initEconomyUI } from './economy-ui.ts';
import { refineryHtml } from './refinery_ui.ts';
import { artworkUrl } from './artwork.ts';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';
import { stationLanding } from './exotic_scenery.ts';
import { passengerSeats, occupiedPassengerSeats } from '../shared/passengers.ts';
// Quantum Rift interface: HUD, landing screens (trade, shipyard, outfitter, jobs, Quantum Station), companion tabs, galaxy map, chat.
import { missionsHtml, missionTargets, pinnedObjectiveHtml } from './missions.ts';
import { playStation, stopRadio, RADIO_STATIONS, setUnlockedStations } from './radio.ts';
import { blackMarketHtml, bankHtml, arcCardsHtml, bunkInfo, synBadge } from './syn_ui.ts';
import {
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  OPS as operationLevels,
  RESEARCH,
  REFINERY,
  ORE_PROCESS,
  FACTION_HULLS,
  SITES,
  RELOCATE,
  relocateCost,
} from '../shared/galaxy.ts';
import {
  researchBonus,
  allOutfits,
  loadoutValue,
  stockOutfitLimit,
  credits,
  repLabel,
  weaponParams,
  K as physicsConstants,
  route,
  price,
} from '../shared/rules.ts';
import { galaxy, mapHit, mapFit, stationDesign } from './render.ts';
import { crewHtml, hangarHtml, researchHtml, materialsHtml } from './hangar_ui.ts';
import { specialistsHtml } from './spec_ui.ts';
import { docksHtml, dockChips, dockLine, outfitterRepairsHtml } from './docks_ui.ts';
import { WING_ONLY } from '../shared/docks.ts';
import { STATES } from '../shared/living.ts';
import { REFINE_UP } from '../shared/hangar.ts';
import { opsHtml, storeMenuHtml, availableStoreFactions } from './fronts_ui.ts';
import { renderCaptains } from './coop_ui.ts';
import {
  colonyHtml,
  defenseHtml,
  masteryHtml,
  arenaHtml,
  exchangeHtml,
  boardsHtml,
} from './frontier_ui.ts';

import { ROLES_INFO, BEATS } from '../shared/roles.ts';
import { levelOf, winOdds } from '../shared/hostile.ts';

// ------------------------------------------------------------------ type definitions

const elementById2 = elementById;
/**
 * Generates an HTML badge element displaying a ship's combat tactical role.
 * @param height2 Ship hull or outfit object with role attribute
 * @returns HTML span tag or empty string
 */
export const roleTag = (height: { role?: RoleId }): string => {
  const roleInfo = ROLES_INFO[(height && height.role)!];
  return roleInfo
    ? `<span class="role" style="color:${roleInfo.color}" title="${roleInfo.desc}">${roleInfo.icon} ${roleInfo.name}</span>`
    : '';
};

let clientGameState: ClientGameState;
let send: (message: NetworkMessage) => void;
/**
 * Binds DOM event listeners and initializes UI state managers with global game state.
 * @param clientGameState2 Global client game state
 * @param sender Network send dispatch function
 */
export function initUI(
  clientGameState2: ClientGameState,
  sender: (networkMessage: NetworkMessage) => void,
): void {
  initEconomyUI(clientGameState2);
  clientGameState2.views = initCockpitState(clientGameState2);
  clientGameState = clientGameState2;
  send = sender;
  try {
    clientGameState.mapLegend = localStorage.getItem('rift.legend') !== '0';
  } catch {}
  elementById2('glegend').classList.toggle('on', clientGameState.mapLegend !== false);
  elementById2('glegend').addEventListener('click', () => {
    clientGameState.mapLegend = clientGameState.mapLegend === false;
    elementById2('glegend').classList.toggle('on', clientGameState.mapLegend);
    try {
      localStorage.setItem('rift.legend', clientGameState.mapLegend ? '1' : '0');
    } catch {}
    drawGMap();
  }); // 2.4
  document
    .querySelectorAll<HTMLElement>('#ctabs button')
    .forEach((htmlElement) => (htmlElement.onclick = () => ctab(htmlElement.dataset.tab!)));
  elementById2('ctabs').addEventListener('keydown', (keyboardEvent) => {
    // Keep native focus traversal and button activation out of the flight hotkeys.
    if (['Tab', 'Enter', ' '].includes(keyboardEvent.key)) keyboardEvent.stopPropagation();
  });
  elementById2('ctabs').addEventListener('focusin', (focusEvent) => {
    requestAnimationFrame(() => {
      const tabs = elementById2('ctabs'),
        bounds = tabs.getBoundingClientRect(),
        target = (focusEvent.target as HTMLInputElement).getBoundingClientRect(),
        scale = bounds.width / tabs.offsetWidth;
      // Native focus scrolling under CSS zoom can leave the last tab clipped.
      if (target.right > bounds.right) tabs.scrollLeft += (target.right - bounds.right) / scale;
      else if (target.left < bounds.left) tabs.scrollLeft -= (bounds.left - target.left) / scale;
    });
  });
  // Ordinary mouse wheels can reach tabs when the user narrows the sidebar.
  elementById2('ctabs').addEventListener(
    'wheel',
    (wheelEvent) => {
      const tabs = elementById2('ctabs');
      if (
        wheelEvent.ctrlKey ||
        tabs.scrollWidth <= tabs.clientWidth ||
        Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY)
      )
        return;
      wheelEvent.preventDefault();
      tabs.scrollLeft +=
        wheelEvent.deltaY *
        (wheelEvent.deltaMode === 1 ? 16 : wheelEvent.deltaMode === 2 ? tabs.clientWidth : 1);
    },
    { passive: false },
  );
  elementById2('depart').onclick = () => send({ t: 'depart' });
  elementById2('chatlog').addEventListener('click', (pointerEvent) => {
    const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>('[data-dm]');
    if (htmlElement) {
      ctab('captains');
      clientGameState.ctabSub = 'dm';
      clientGameState.dmWith = htmlElement.dataset.dm!;
      refreshCompanion();
    }
  }); // 2.6
  elementById2('tg-acts').addEventListener('click', (pointerEvent) => {
    const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-tga]',
    );
    if (!htmlElement) return;
    const count = elementById2('tg-acts').dataset.n!;
    if (!count) return; // invite, duel, message or befriend the captain you targeted
    if (htmlElement.dataset.tga === 'invite') send({ t: 'armada', op: 'invite', name: count });
    else if (htmlElement.dataset.tga === 'friend') send({ t: 'social', op: 'add', name: count });
    else if (htmlElement.dataset.tga === 'duel')
      ask(`Challenge ${count} to a duel? A fight to disabled; nobody loses a ship.`, () =>
        send({ t: 'duel', op: 'challenge', name: count }),
      );
    else if (htmlElement.dataset.tga === 'dm') {
      ctab('captains');
      clientGameState.ctabSub = 'dm';
      clientGameState.dmWith = count;
      refreshCompanion();
    }
  });
  elementById2('storein').addEventListener('click', onAct);

  elementById2('landbody').addEventListener('click', onAct);
  elementById2('landbody').addEventListener('click', (pointerEvent) => {
    const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-plot]',
    );
    if (htmlElement) {
      plot(htmlElement.dataset.plot!);
      toast(
        `Course plotted to ${systemsById[htmlElement.dataset.plot!].name}. Press J in space to jump.`,
      );
    }
  });
  document.addEventListener('change', (event) => {
    const entryKey = (event.target as HTMLInputElement).dataset.missionFilter!;
    if (
      ![
        'jobType',
        'jobFeasible',
        'jobNearby',
        'missionType',
        'missionFeasible',
        'missionNearby',
      ].includes(entryKey)
    )
      return;
    (
      clientGameState as {
        jobType?: string | boolean;
        jobFeasible?: string | boolean;
        jobNearby?: string | boolean;
        missionType?: string | boolean;
        missionFeasible?: string | boolean;
        missionNearby?: string | boolean;
      }
    )[entryKey as 'jobType'] =
      (event.target as HTMLInputElement).type === 'checkbox'
        ? (event.target as HTMLInputElement).checked
        : (event.target as HTMLInputElement).value;
    clientGameState.views.remember();
    if (entryKey.startsWith('job')) renderLanded();
    else drawMini();
  });
  elementById2('landbody').addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement).id === 'ysort') {
      clientGameState.ysort = (event.target as HTMLInputElement).value;
      renderLanded();
    } else if ((event.target as HTMLInputElement).id === 'ofit') {
      clientGameState.ofit = (event.target as HTMLInputElement).checked;
      renderLanded();
    }
  }); // shipyard sort, outfitter filter
  elementById2('landbody').addEventListener('change', (event) => {
    // dock pickers
    const htmlSelectElement = (event.target as HTMLInputElement).closest<HTMLSelectElement>(
      'select.dpick',
    );
    if (htmlSelectElement) {
      send({
        t: 'docks',
        op: 'assign',
        k: +htmlSelectElement.dataset.dk!,
        slot: htmlSelectElement.dataset.slot === 'lead' ? 'lead' : +htmlSelectElement.dataset.slot!,
        uid: htmlSelectElement.value || null,
      });
      return;
    }
    const htmlSelectElement2 = (event.target as HTMLInputElement).closest<HTMLSelectElement>(
      'select[data-role]',
    );
    if (htmlSelectElement2) {
      send({
        t: 'docks',
        op: 'crew',
        k: +htmlSelectElement2.dataset.dk!,
        w: +htmlSelectElement2.dataset.w!,
        role: htmlSelectElement2.dataset.role!,
        oid: htmlSelectElement2.value ? +htmlSelectElement2.value : null,
      });
      return;
    }
    const htmlSelectElement3 = (event.target as HTMLInputElement).closest<HTMLSelectElement>(
      'select[data-crew]',
    );
    if (htmlSelectElement3)
      send({
        t: 'shuttle',
        op: 'crew',
        sid: +htmlSelectElement3.dataset.crew!,
        oid: htmlSelectElement3.value ? +htmlSelectElement3.value : null,
      });
  });
  elementById2('t-missions').addEventListener('click', (pointerEvent) => {
    const action = (pointerEvent.target as HTMLInputElement).closest<HTMLButtonElement>(
      '[data-contract]',
    );
    if (action && !action.disabled && clientGameState.contractPlan) {
      send({
        t: 'armada',
        op: action.dataset.contract!,
        id: clientGameState.contractPlan.id,
        revision: clientGameState.contractPlan.revision,
      });
      return;
    }
    const htmlElement3 = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-pin]',
    );
    if (htmlElement3) {
      clientGameState.pinnedObjective =
        clientGameState.pinnedObjective === htmlElement3.dataset.pin!
          ? ''
          : htmlElement3.dataset.pin!;
      clientGameState.views.remember();
      drawMini();
      return;
    }
    const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-plot]',
    );
    if (htmlElement) {
      plot(htmlElement.dataset.plot!);
      openMap(htmlElement.dataset.plot!);
    }
    const pending = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-questdrop]',
    );
    if (pending) {
      ask('Abandon this story and its waiting passenger booking?', () =>
        send({ t: 'questdrop', qid: pending.dataset.questdrop! }),
      );
      return;
    }
    const htmlElement2 = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-abandon]',
    );
    if (htmlElement2) {
      const mission = (clientGameState.you!.missions || []).find(
        (mission) => mission.id === htmlElement2.dataset.abandon!,
      );
      if (mission)
        ask(
          mission.quest
            ? `Abandon "${mission.title}"? That ends the story "${mission.quest.name}".`
            : `Abandon "${mission.title}"? You won't be paid for it.`,
          () => send({ t: 'abandon', id: mission.id }),
        );
    }
  }); // 2.0.3
  // galaxy map: drag to pan, wheel to zoom around the cursor, click a system to plot a course
  const htmlCanvasElement = elementById2('gcanvas'),
    missionProgress = (mouseEvent: MouseEvent) => {
      const domRect = htmlCanvasElement.getBoundingClientRect();
      return [
        ((mouseEvent.clientX - domRect.left) * htmlCanvasElement.width) / domRect.width,
        ((mouseEvent.clientY - domRect.top) * htmlCanvasElement.height) / domRect.height,
      ];
    };
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  htmlCanvasElement.onmousedown = (mouseEvent) => {
    const [positionX, positionY] = missionProgress(mouseEvent);
    drag = {
      x: positionX,
      y: positionY,
      cx: clientGameState.mapView!.cx,
      cy: clientGameState.mapView!.cy,
      moved: false,
    };
  };
  window.addEventListener('mouseup', (mouseEvent) => {
    if (!drag) return;
    const drag2 = drag;
    drag = null;
    if (!drag2.moved && (mouseEvent.target as HTMLElement) === htmlCanvasElement) {
      const [positionX, positionY] = missionProgress(mouseEvent);
      const mapHit2 = mapHit(clientGameState, positionX, positionY);
      if (mapHit2) plot(mapHit2);
    }
  });
  htmlCanvasElement.onmousemove = (mouseEvent) => {
    const [positionX, positionY] = missionProgress(mouseEvent);
    if (drag) {
      if (Math.hypot(positionX - drag.x, positionY - drag.y) > 4) drag.moved = true;
      if (drag.moved) {
        clientGameState.mapView!.cx = drag.cx - (positionX - drag.x) / clientGameState.mapView!.k;
        clientGameState.mapView!.cy = drag.cy - (positionY - drag.y) / clientGameState.mapView!.k;
      }
    }
    clientGameState.hoverSys = mapHit(clientGameState, positionX, positionY);
    drawGMap();
  };
  htmlCanvasElement.addEventListener(
    'wheel',
    (wheelEvent) => {
      wheelEvent.preventDefault();
      const value = clientGameState.mapView!,
        [positionX, positionY] = missionProgress(wheelEvent),
        worldX = value.cx + (positionX - value.W / 2) / value.k,
        worldY = value.cy + (positionY - value.H / 2) / value.k;
      value.k = Math.max(
        value.fit * 0.8,
        Math.min(value.fit * 8, value.k * (wheelEvent.deltaY < 0 ? 1.18 : 1 / 1.18)),
      );
      value.cx = worldX - (positionX - value.W / 2) / value.k;
      value.cy = worldY - (positionY - value.H / 2) / value.k;
      drawGMap();
    },
    { passive: false },
  );
  elementById2('gfit').onclick = () => {
    const mapFit2 = mapFit(htmlCanvasElement.width, htmlCanvasElement.height);
    Object.assign(clientGameState.mapView!, mapFit2);
    drawGMap();
  };
  elementById2('ghere').onclick = () => centerOn(clientGameState.sys!, 3);
  elementById2('ghome').onclick = () => {
    const stationState = clientGameState.you && clientGameState.you!.station,
      position =
        stationState && stationState.claimed && stationState.site && STELLARS[stationState.site];
    if (position) {
      centerOn(position.system, 3);
      clientGameState.hoverSys = position.system;
      drawGMap();
    } else
      toast(
        'You have no Personal Station yet. Claim a derelict station hull (the purple diamonds) to build one.',
      );
  }; // 2.5.2
  elementById2('gsearch').oninput = searchMap;
  elementById2('gsearch').onkeydown = (keyboardEvent) => {
    keyboardEvent.stopPropagation();
    if (keyboardEvent.key === 'Enter') {
      const htmlElement = elementById2('gresults').querySelector<HTMLElement>('[data-sys]');
      if (htmlElement) htmlElement.click();
    }
    if (keyboardEvent.key === 'Escape') {
      elementById2('gsearch').blur();
    }
  };
  elementById2('gresults').onclick = (pointerEvent) => {
    const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
      '[data-sys]',
    );
    if (!htmlElement) return;
    centerOn(htmlElement.dataset.sys!, 3.5);
    plot(htmlElement.dataset.sys!);
    elementById2('gresults').innerHTML = '';
    elementById2('gsearch').value = '';
  };
  elementById2('deadok').onclick = () => elementById2('deadbox').classList.add('hidden');
  // radio
  elementById2('rgo').onclick = radioSearch;
  elementById2('rq').onkeydown = (keyboardEvent) => {
    if (keyboardEvent.key === 'Enter') radioSearch();
    keyboardEvent.stopPropagation();
  };
  elementById2('rfav').onclick = () => {
    clientGameState.radioTab = 'fav';
    renderRadio();
  };
  elementById2('rres').onclick = () => {
    clientGameState.radioTab = 'res';
    elementById2('rq').value = '';
    renderRadio();
  };
  elementById2('rstop').onclick = () => stopRadio(elementById2('rnow'));
  elementById2('cq').oninput = () => {
    clientGameState.codexQuery = elementById2('cq').value;
    renderCodex();
  };
  elementById2('cq').onkeydown = (keyboardEvent) => keyboardEvent.stopPropagation();
  elementById2('lgo').onclick = () => {
    const trim2 = elementById2('lq').value.trim();
    if (trim2) {
      send({ t: 'note', text: trim2 });
      elementById2('lq').value = '';
    }
  };
  elementById2('lq').onkeydown = (keyboardEvent) => {
    keyboardEvent.stopPropagation();
    if (keyboardEvent.key === 'Enter') (elementById2('lgo').onclick as () => void)();
  };
  renderRadio();
}
// toasts pick a sound from what they say
const TOAST_SND: Array<[RegExp, string]> = [
  [/hired guns|raid|invasion|closing in|under attack|price on your head|ambush/i, 'alert'],
  [
    /reached level|promoted|takes notice|is now your ally|career guide complete|joins your crew/i,
    'levelup',
  ],
  [/complete|collected|delivered|paid off|job done|bounty:|rewards?/i, 'complete'],
  [
    /not enough|can't|cannot|refuses|too far|no room|denied|only at|only in|needs |you need|missed/i,
    'error',
  ],
];
// a styled confirmation dialog in place of the browser's own confirm box
let finishAsk: ((confirmed: boolean) => void) | null = null;
overlays.register({
  id: 'askbox',
  priority: 210,
  dismiss: () => finishAsk?.(false),
  initialFocus: () => elementById('askno'),
  reset: () => {
    finishAsk = null;
    elementById('askyes').onclick = elementById('askno').onclick = null;
  },
});
/**
 * Displays a styled confirmation modal dialog with confirm/cancel action handlers.
 * @param message2 Confirmation message prompt
 * @param confirmed Callback function executed when confirmed
 * @param askOptions Optional configuration including button labels
 */
export function ask(message: string, confirmed: () => void, askOptions: AskOptions = {}): void {
  elementById('askx').textContent = message;
  elementById('askyes').textContent = askOptions.yes || 'CONFIRM';
  const done = (isValid: boolean) => {
    if (finishAsk !== done) return;
    finishAsk = null;
    elementById('askyes').onclick = elementById('askno').onclick = null;
    overlays.close('askbox');
    if (isValid) confirmed();
  };
  finishAsk = done;
  elementById('askyes').onclick = () => done(true);
  elementById('askno').onclick = () => done(false);
  overlays.open('askbox');
}
/**
 * Renders a transient notification toast banner on screen with an audio sting.
 * @param message2 Notification message text
 */
export function toast(message: string): void {
  const entryKey = TOAST_SND.find(([regExp]) => regExp.test(message)),
    kind = entryKey ? entryKey[1] : 'toast';
  window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: kind }));
  clientGameState._toastKind = kind;
  const htmlDivElement = document.createElement('div');
  htmlDivElement.textContent = message;
  htmlDivElement.className = 't-' + kind;
  const newcomer = message.startsWith('Newcomer protection:');
  if (newcomer) htmlDivElement.classList.add('newcomer-protection');
  elementById2('toasts').appendChild(htmlDivElement);
  setTimeout(() => htmlDivElement.remove(), newcomer ? 10000 : 5200);
  // Preserve the introduction's reading time during bursts of ordinary notices.
  while (elementById2('toasts').children.length > 4) {
    const oldest = elementById2('toasts').querySelector(':scope > div:not(.newcomer-protection)');
    if (!oldest) break;
    oldest.remove();
  }
}
/**
 * Appends a message entry or system notification to the in-game chat log.
 * @param message2 Chat message payload
 */
export function chatLine(message: { msg: string; from?: string; ch?: string }): void {
  const htmlDivElement = document.createElement('div');
  if (!message.from) {
    htmlDivElement.className = 'sys';
    htmlDivElement.textContent = message.msg;
  } else
    htmlDivElement.innerHTML = `<b${message.ch === 'armada' ? ' class="armada"' : ''}${!clientGameState.solo && message.from !== clientGameState.myName ? ` data-dm="${escapeHtml2(message.from)}" title="Message ${escapeHtml2(message.from)}"` : ''}>${message.ch === 'armada' ? '[Armada] ' : ''}${escapeHtml2(message.from)}${message.ch === 'sys' ? ' (system)' : ''}:</b> ${escapeHtml2(message.msg)}`; // click a name to message them
  const cachedElement = elementById2('chatlog');
  const atBottom =
    cachedElement.scrollHeight - cachedElement.clientHeight - cachedElement.scrollTop < 4;
  cachedElement.appendChild(htmlDivElement);
  while (cachedElement.children.length > 40) cachedElement.firstChild!.remove();
  if (atBottom) cachedElement.scrollTop = cachedElement.scrollHeight;
}

// ------------------------------------------------------------------ HUD (every frame)
/** Clear the collapsed readout until another authoritative snapshot arrives. */
export function clearFlightStatus(): void {
  const status = elementById2('flightstatus');
  status.replaceChildren();
  delete status.dataset.readout;
  status.dataset.disconnected = 'true';
  status.classList.add('hidden');
}
/**
 * Updates primary HUD elements: shield/armor/fuel meters, speed, target card, and nav waypoint.
 */
export function hud(): void {
  if (!clientGameState) return;
  const clientView = clientGameState.view,
    playerPayload = clientGameState.you!;
  if (!playerPayload) {
    document.documentElement.style.removeProperty('--red');
    document.documentElement.style.removeProperty('--red2');
    elementById2('flightstatus').replaceChildren();
    delete elementById2('flightstatus').dataset.readout;
    return;
  }
  const storyFlags = playerPayload.story?.flags;
  const accent =
    storyFlags?.main_ending === 'unsettling' && storyFlags.unsettled_with
      ? FACTIONS[storyFlags.unsettled_with]?.color
      : null;
  for (const variable of ['--red', '--red2']) {
    if (accent) document.documentElement.style.setProperty(variable, accent);
    else document.documentElement.style.removeProperty(variable);
  }
  const computedShipStats = playerPayload.shipStats;
  const ship2 = clientView ? clientView.shield : computedShipStats!.shield,
    armor2 = clientView ? clientView.armor : computedShipStats!.armor,
    fuel2 = clientView ? clientView.fuel : playerPayload.fuel;
  elementById2('v-sh').textContent =
    `${Math.round(ship2)} / ${Math.round(computedShipStats!.shield)}`;
  elementById2('v-ar').textContent =
    `${Math.round(armor2)} / ${Math.round(computedShipStats!.armor)}`; // 2.0
  elementById2('b-sh').style.width = (100 * ship2) / Math.max(1, computedShipStats!.shield) + '%';
  elementById2('b-ar').style.width = (100 * armor2) / Math.max(1, computedShipStats!.armor) + '%';
  elementById2('b-fu').style.width = (100 * fuel2) / Math.max(1, computedShipStats!.fuel) + '%';
  elementById2('jumps').textContent = Math.floor(fuel2 / physicsConstants.jumpFuel) + 'j';
  if (clientGameState._crSeen != null && playerPayload.credits !== clientGameState._crSeen) {
    const delta = playerPayload.credits - clientGameState._crSeen,
      htmlDivElement = document.createElement('div');
    htmlDivElement.className = 'crfloat ' + (delta > 0 ? 'up' : 'dn');
    htmlDivElement.textContent = (delta > 0 ? '+' : '−') + credits(Math.abs(delta));
    elementById2('cr').parentElement!.appendChild(htmlDivElement);
    setTimeout(() => htmlDivElement.remove(), 1600);
  } // 2.0
  clientGameState._crSeen = playerPayload.credits;
  elementById2('spd').textContent = clientView
    ? `SPD ${Math.round(Math.hypot(clientView.vx, clientView.vy) / 0.45)} / ${Math.round(computedShipStats!.maxSpeed / 0.45)}`
    : '';
  elementById2('spd').title = 'Speed: current / top';
  {
    const starSystem = systemsById[clientGameState.sys!],
      enabled = !!(
        playerPayload.newcomer &&
        starSystem &&
        !starSystem.farside &&
        !starSystem.arena
      ),
      cachedElement = elementById2('prot'); // 2.0.3 newcomer protection badge
    {
      const dockLine2 = dockLine(clientGameState),
        cachedElement = elementById2('dockrow');
      if (cachedElement) {
        cachedElement.classList.toggle('hidden', !dockLine2);
        if (dockLine2 !== cachedElement._h) {
          cachedElement._h = dockLine2;
          cachedElement.innerHTML = dockLine2;
        }
      }
    } // 2.1
    if (cachedElement) {
      cachedElement.classList.toggle(
        'hidden',
        !playerPayload.newcomer || !!(starSystem && starSystem.arena),
      ); // meaningless in the Crucible
      cachedElement.classList.toggle('off', !enabled);
      cachedElement.textContent = enabled
        ? '🛡 NEWCOMER TRUCE · PRE T-3'
        : '🛡 NO NEWCOMER TRUCE: FARSIDE';
    }
  }
  elementById2('cr').textContent = credits(playerPayload.credits) + ' cr';
  elementById2('shipnm').textContent = playerPayload.shipless
    ? 'No active ship'
    : `${computedShipStats!.name} "${playerPayload.ship.name}"`;
  const flightStatus = elementById2('flightstatus');
  const readout = [
    elementById2('shipnm').textContent,
    String(ship2),
    String(computedShipStats!.shield),
    String(armor2),
    String(computedShipStats!.armor),
    String(fuel2),
    String(computedShipStats!.fuel),
    elementById2('cr').textContent,
  ];
  if (!flightStatus.dataset.disconnected && flightStatus.dataset.readout !== readout.join('|')) {
    flightStatus.dataset.readout = readout.join('|');
    const name = document.createElement('div');
    name.textContent = readout[0];
    const gauges = [
      { label: 'SHIELD', value: ship2, maximum: computedShipStats!.shield, style: '' },
      { label: 'ARMOR', value: armor2, maximum: computedShipStats!.armor, style: 'ar' },
      { label: 'FUEL', value: fuel2, maximum: computedShipStats!.fuel, style: 'fu' },
    ].map(({ label, value, maximum, style }) => {
      const row = document.createElement('div');
      row.className = 'row';
      const caption = document.createElement('span');
      caption.className = 'lbl';
      caption.textContent = label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-label', label);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(Math.max(1, maximum)));
      bar.setAttribute('aria-valuenow', String(Math.max(0, Math.min(maximum, value))));
      const fill = document.createElement('i');
      fill.className = style;
      fill.style.width = Math.max(0, Math.min(100, (100 * value) / Math.max(1, maximum))) + '%';
      const text = document.createElement('b');
      text.className = 'bv';
      text.textContent = Math.round(value) + ' / ' + Math.round(maximum);
      bar.append(fill, text);
      row.append(caption, bar);
      return row;
    });
    const creditsLine = document.createElement('div');
    creditsLine.textContent = readout.at(-1)!;
    flightStatus.replaceChildren(name, ...gauges, creditsLine);
  }
  elementById2('sysname').textContent =
    (systemsById[clientGameState.sys!]
      ? systemsById[clientGameState.sys!].name.toUpperCase()
      : '') +
    (systemsById[clientGameState.sys!]
      ? ' · ' + FACTIONS[systemsById[clientGameState.sys!].faction].short
      : '') +
    (() => {
      const livingPayloadState = stateOfSys(clientGameState.sys);
      return livingPayloadState
        ? ' · ' +
            STATES[livingPayloadState.k].icon +
            ' ' +
            STATES[livingPayloadState.k].name.toUpperCase()
        : '';
    })(); // 2.4
  const renderEntity = clientGameState.target
    ? clientGameState.ents.get(clientGameState.target)
    : null;
  if (renderEntity) {
    const shipHullAsset = clientGameState.A!.ships[renderEntity.hull];
    if ((elementById2('tg-img').dataset.h as string | number) != renderEntity.hull) {
      elementById2('tg-img').innerHTML = `<img src="${artworkUrl(shipHullAsset.img!)}" alt="">`;
      elementById2('tg-img').dataset.h = String(renderEntity.hull);
    }
    elementById2('tg-name').textContent = renderEntity.name || shipHullAsset.name;
    elementById2('tg-sub').textContent =
      (ROLES_INFO[shipHullAsset.role!]
        ? ROLES_INFO[shipHullAsset.role!].icon + ' ' + ROLES_INFO[shipHullAsset.role!].short + ' · '
        : '') +
      (renderEntity.fl & 16 ? 'Captain · ' : '') +
      shipHullAsset.name +
      ' · ' +
      (FACTIONS[clientGameState.FAC[renderEntity.fac as unknown as number]]
        ? FACTIONS[clientGameState.FAC[renderEntity.fac as unknown as number]].short
        : '') +
      (clientGameState.hostile(renderEntity) ? ' · HOSTILE' : '') +
      (renderEntity.fl & 4 ? ' · DISABLED: B to board' : '') +
      (() => {
        const roleId = clientGameState.A!.ships[clientGameState.you!.ship.hull].role;
        return BEATS[roleId!] === shipHullAsset.role
          ? ' · YOU COUNTER IT'
          : BEATS[shipHullAsset.role!] === roleId
            ? ' · IT COUNTERS YOU'
            : '';
      })();
    elementById2('tg-sh').style.width = renderEntity.sh + '%';
    elementById2('tg-ar').style.width = renderEntity.ar + '%';
    {
      const winOdds2 = winOdds(
          (clientGameState.combat ? clientGameState.combat.power : clientGameState.you!.power) ||
            10,
          renderEntity.pw || 10,
        ),
        column = winOdds2 >= 0.6 ? '#8ff0ad' : winOdds2 >= 0.4 ? '#ffd27a' : '#ff8a7a';
      elementById2('tg-dist').innerHTML =
        (clientView
          ? Math.round(
              Math.hypot(renderEntity.rx - clientView.rx, renderEntity.ry - clientView.ry),
            ) + ' km · '
          : '') +
        `Lv ${levelOf(renderEntity.pw || 10)} · <span style="color:${column}">${Math.round(winOdds2 * 100)}% estimated odds</span>`;
    }
    elementById2('tg-bars').style.visibility = 'visible';
    {
      const capacity =
          renderEntity.fl & 16 &&
          !clientGameState.solo &&
          !(systemsById[clientGameState.sys!] && systemsById[clientGameState.sys!].arena) &&
          renderEntity.name &&
          renderEntity.name !== clientGameState.myName,
        ally = capacity && clientGameState.isAlly && clientGameState.isAlly(renderEntity),
        entryKey = capacity ? renderEntity.name + '|' + ally : ''; // act on a captain you can see
      const cachedElement = elementById2('tg-acts');
      if (cachedElement._k !== entryKey) {
        cachedElement._k = entryKey;
        cachedElement.classList.toggle('hidden', !capacity);
        cachedElement.innerHTML = capacity
          ? `${ally ? '' : `<button class="btn sm" data-tga="invite">INVITE</button><button class="btn sm" data-tga="duel">DUEL</button>`}<button class="btn sm" data-tga="dm">✉</button>${clientGameState.social && clientGameState.social.friends.some((friendEntry) => friendEntry.name === renderEntity.name) ? '' : '<button class="btn sm" data-tga="friend">+ FRIEND</button>'}`
          : '';
        cachedElement.dataset.n = capacity ? renderEntity.name : '';
      }
    }
  } else if (elementById2('tg-img').dataset.h! !== '') {
    elementById2('tg-img').innerHTML = '';
    elementById2('tg-img').dataset.h = '';
    elementById2('tg-name').textContent = 'No target';
    elementById2('tg-sub').textContent = 'Tab: next ship · R: nearest hostile';
    elementById2('tg-acts').classList.add('hidden');
    elementById2('tg-acts')._k = '';
    elementById2('tg-dist').textContent = '';
    elementById2('tg-bars').style.visibility = 'hidden';
  }
  const fuelJumps = Math.floor(
      ((clientGameState.view && clientGameState.view.fuel) ?? playerPayload.fuel ?? 0) / 100,
    ),
    shortFuel = clientGameState.route && clientGameState.route.length > fuelJumps; // warn when the route is longer than your fuel
  elementById2('navto').classList.toggle('warnf', !!shortFuel);
  elementById2('navto').textContent =
    clientGameState.route && clientGameState.route.length
      ? `${systemsById[clientGameState.route[clientGameState.route.length - 1]].name} (${clientGameState.route.length} jump${clientGameState.route.length > 1 ? 's' : ''}, J to jump)${shortFuel ? ` · fuel for ${fuelJumps}: refuel on the way` : ''}`
      : clientGameState.navStellar && STELLARS[clientGameState.navStellar]
        ? STELLARS[clientGameState.navStellar].name + ' (L to land)'
        : 'None (press M)';
  const hasFleet =
    !!(
      playerPayload.docks &&
      playerPayload.docks.list[playerPayload.docks.active] &&
      playerPayload.docks.list[playerPayload.docks.active].wings.some(Boolean)
    ) ||
    (clientGameState.order && clientGameState.order !== 'gather'); // current fleet order
  elementById2('fleetrow').classList.toggle('hidden', !hasFleet);
  if (hasFleet)
    elementById2('fleetord').textContent = {
      gather: 'Formation',
      attack: 'Attacking your target',
      hold: 'Holding position',
      holdfire: 'Holding fire',
      loot: 'Collecting loot',
    }[clientGameState.order || 'gather']!;
  const weaponAssets = Object.keys(computedShipStats!.weapons)
    .map((width) => clientGameState.A!.weapons[width])
    .filter((weaponAsset) => weaponAsset && ['homing', 'rocket', 'bay'].includes(weaponAsset.type));
  elementById2('secw').textContent = weaponAssets.length
    ? weaponAssets
        .map(
          (weaponAsset) => `${weaponAsset.name} (${clientGameState.ammo[weaponAsset.id] ?? '?'})`,
        )
        .join(', ')
    : 'None';
}

// ------------------------------------------------------------------ companion tabs
/**
 * Switches the active sidebar companion tab panel by name.
 * @param name Tab key ('radio' | 'codex' | 'missions' | 'station' | 'ops' | 'captains' | 'log')
 */
export function ctab(name: string, reveal = true): void {
  if (reveal && elementById2('hud').inert) elementById2('traytoggle').click();
  clientGameState.views.capture(elementById2('clist'));
  clientGameState.views.capture(elementById2('mlist'));
  clientGameState.views.capture(elementById2('stview'));
  clientGameState.views.capture(elementById2('opsview'));
  clientGameState.views.capture(elementById2('capview'));
  clientGameState.ctab = name;
  document
    .querySelectorAll<HTMLElement>('#ctabs button')
    .forEach((htmlElement) => htmlElement.classList.toggle('on', htmlElement.dataset.tab === name));
  document
    .querySelectorAll<HTMLElement>('#cpanel .tab')
    .forEach((htmlElement) => htmlElement.classList.toggle('on', htmlElement.id === 't-' + name));
  refreshCompanion();
  clientGameState.views.remember();
}
/**
 * Triggers a DOM re-render of whichever companion tab is currently active.
 */
export function refreshCompanion(): void {
  if (clientGameState.ctab === 'radio') renderRadio();
  else if (clientGameState.ctab === 'codex') renderCodex();
  else if (clientGameState.ctab === 'station') renderStationTab();
  else if (clientGameState.ctab === 'ops') {
    if (clientGameState.you!)
      clientGameState.views.replace(elementById2('opsview'), opsHtml(clientGameState), 'ops');
  } else if (clientGameState.ctab === 'log') renderLog();
  else if (clientGameState.ctab === 'missions') drawMini();
  else if (clientGameState.ctab === 'captains') renderCaptains();
}
/**
 * Re-renders the mission contracts list inside the missions companion tab.
 */
export function drawMini(): void {
  if (clientGameState.ctab === 'missions' && clientGameState.you!) {
    const targets = missionTargets(clientGameState);
    if (
      clientGameState.pinnedObjective &&
      !targets.some((missionTarget) => missionTarget.key === clientGameState.pinnedObjective)
    ) {
      clientGameState.pinnedObjective = '';
      toast('Pinned objective cleared. See Missions for current work.');
      clientGameState.views.remember();
    }
    const pinned = pinnedObjectiveHtml(clientGameState);
    const panel = elementById2('pinned-objective');
    if (panel.innerHTML !== pinned) {
      const topOffset = panel.dataset.key === clientGameState.pinnedObjective ? panel.scrollTop : 0;
      panel.innerHTML = pinned;
      panel.dataset.key = clientGameState.pinnedObjective || '';
      panel.scrollTop = topOffset;
    }
    elementById2('pinned-objective').hidden = !pinned;
    const missionsHtml2 = missionsHtml(clientGameState);
    if (missionsHtml2 !== clientGameState._mhtml) {
      clientGameState._mhtml = missionsHtml2;
      clientGameState.views.replace(elementById2('mlist'), missionsHtml2, 'missions');
    }
  }
} // the MISSIONS tab replaced the minimap
// Discovered stations only; old provider favorites remain stored untouched.
/**
 * Loads favorite radio stations from localStorage.
 * @returns Stored favorite radio stations
 */
function availableRadio(): RadioStation[] {
  const identifiers = clientGameState.you?.radioStations || [RADIO_STATIONS[0].id];
  return RADIO_STATIONS.filter((state) => identifiers.includes(state.id));
}
function favKey() {
  return 'rift.radio-favs.' + (clientGameState.you?.name || '').toLowerCase();
}
function favs() {
  try {
    const parse2 = JSON.parse(localStorage.getItem(favKey()) || '[]');
    return availableRadio().filter((radioStation) => parse2.includes(radioStation.id));
  } catch {
    return [];
  }
}
function setFavs(stations: RadioStation[]) {
  try {
    localStorage.setItem(favKey(), JSON.stringify(stations.map((radioStation) => radioStation.id)));
  } catch {}
}
function radioSearch() {
  clientGameState.radioTab = 'res';
  renderRadio();
}
function renderRadio() {
  elementById2('rfav').classList.toggle('on', clientGameState.radioTab === 'fav');
  elementById2('rres').classList.toggle('on', clientGameState.radioTab !== 'fav');
  const toLowerCase2 = elementById2('rq').value.trim().toLowerCase();
  const list =
    clientGameState.radioTab === 'fav'
      ? favs()
      : availableRadio().filter((radioStation) =>
          (radioStation.name + ' ' + radioStation.sub).toLowerCase().includes(toLowerCase2),
        );
  const favorites = favs();
  setUnlockedStations(clientGameState.you?.radioStations);
  elementById2('rlist').innerHTML = list.length
    ? list
        .map(
          (radioStation, index) =>
            `<div class="it" data-i="${index}" role="button" tabindex="0" aria-label="Play ${escapeHtml2(radioStation.name)}"><div class="n"><div>${escapeHtml2(radioStation.name)}</div><div class="s">${escapeHtml2(radioStation.sub)}</div></div><span class="star" role="button" tabindex="0" aria-label="Favorite ${escapeHtml2(radioStation.name)}" data-star="${index}" style="color:${favorites.some((radioStation2) => radioStation2.id === radioStation.id) ? '#e6b84a' : '#555'};font-size:15px">★</span></div>`,
        )
        .join('')
    : '<div class="dim small" style="padding:8px">' +
      (clientGameState.radioTab === 'fav'
        ? 'No favorites yet. Choose STATIONS, then use a star to save one.'
        : 'No stations match. Explore to discover more broadcasts.') +
      '</div>';
  for (const htmlElement of elementById2('rlist').querySelectorAll<HTMLElement>('[role=button]'))
    htmlElement.onkeydown = (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        htmlElement.click();
      }
    };
  for (const htmlElement of elementById2('rlist').querySelectorAll<HTMLElement>('.it'))
    htmlElement.onclick = (pointerEvent) => {
      const station = list[+htmlElement.dataset.i!];
      if ((pointerEvent.target as HTMLInputElement).dataset.star! !== undefined) {
        const radioStations = favs(),
          index = radioStations.findIndex((radioStation) => radioStation.id === station.id);
        if (index >= 0) radioStations.splice(index, 1);
        else radioStations.push(station);
        setFavs(radioStations);
        renderRadio();
        return;
      }
      void playStation(station, elementById2('rnow'));
    };
}
// codex
let codexCat = 'Ships';
/**
 * Lists the short names of factions whose shipyards offer a specific ship hull.
 * @param height2 Ship hull ID
 * @returns Faction short names array
 */
function factionsSelling(height: number): string[] {
  return Object.entries(FACTION_HULLS)
    .filter(([_factionId, hullStats]) => hullStats.includes(height))
    .map(([factionId]) => FACTIONS[factionId].short);
}
/**
 * Renders the filtered list of ships, outfits, or weapons in the codex companion tab.
 */
function renderCodex(): void {
  codexCat = ['Ships', 'Outfits', 'Weapons'].includes(clientGameState.codexCat!)
    ? clientGameState.codexCat!
    : 'Ships';
  if (document.activeElement !== elementById2('cq'))
    elementById2('cq').value = clientGameState.codexQuery || '';
  const toLowerCase2 = elementById2('cq').value.trim().toLowerCase(),
    allOutfits2 = allOutfits(clientGameState.A!);
  const categories = ['Ships', 'Outfits', 'Weapons'];
  elementById2('cchips').innerHTML = categories
    .map(
      (component) =>
        `<span class="chip ${component === codexCat ? 'on' : ''}" data-c="${component}">${component}</span>`,
    )
    .join('');
  elementById2('cchips')
    .querySelectorAll<HTMLElement>('.chip')
    .forEach(
      (htmlElement) =>
        (htmlElement.onclick = () => {
          codexCat = clientGameState.codexCat = htmlElement.dataset.c!;
          renderCodex();
        }),
    );
  let items;
  if (codexCat === 'Ships')
    items = Object.values(clientGameState.A!.ships)
      .filter((shipHullAsset) => !shipHullAsset.npcOnly)
      .filter(
        (shipHullAsset) =>
          shipHullAsset.id !== 744 ||
          (clientGameState.you &&
            clientGameState.you!.story &&
            clientGameState.you!.story.done.includes('qv5')),
      )
      .sort((shipHullAsset, shipHullAsset2) => shipHullAsset.cost - shipHullAsset2.cost)
      .map((shipHullAsset) => ({
        img: artworkUrl(shipHullAsset.img!),
        name: shipHullAsset.name,
        sub: `${shipHullAsset.sub} · ${shipHullAsset.cat}`,
        cost: shipHullAsset.kind === 'wingmate' ? 'hire' : credits(shipHullAsset.cost),
        key: 's' + shipHullAsset.id,
      }));
  else
    items = Object.values(allOutfits2)
      .filter((outfitAsset) => !outfitAsset.eff?.riftHarness)
      .filter((outfitAsset) =>
        codexCat === 'Weapons'
          ? outfitAsset.eff!.weapon || outfitAsset.eff!.ammo
          : !(outfitAsset.eff!.weapon || outfitAsset.eff!.ammo),
      )
      .sort((outfitAsset, outfitAsset2) => outfitAsset.cost - outfitAsset2.cost)
      .map((outfitAsset) => ({
        img: outfitAsset.icon ? artworkUrl(outfitAsset.icon) : '',
        name: outfitAsset.name,
        sub: Object.entries(outfitAsset.eff!)
          .map(([entryKey, value]) =>
            entryKey === 'weapon' || entryKey === 'ammo'
              ? clientGameState.A!.weapons[value]
                ? clientGameState.A!.weapons[value].type
                : ''
              : `${entryKey} ${value > 0 ? '+' : ''}${value}`,
          )
          .join(', '),
        cost: credits(outfitAsset.cost),
        key: 'o' + outfitAsset.id,
      }));
  if (toLowerCase2)
    items = items.filter((index) =>
      (index.name + ' ' + index.sub).toLowerCase().includes(toLowerCase2),
    );
  const html = items
    .map(
      (index) =>
        `<div class="it" data-k="${index.key}">${index.img ? `<img src="${index.img}" alt="">` : '<span style="width:40px"></span>'}<div class="n"><div>${escapeHtml2(index.name)}</div><div class="s">${escapeHtml2(index.sub)}</div></div><span class="cr small">${index.cost}</span></div>`,
    )
    .join('');
  clientGameState.views.replace(
    elementById2('clist'),
    html,
    'codex:' + codexCat + ':' + toLowerCase2,
  );
  elementById2('clist')
    .querySelectorAll<HTMLElement>('.it')
    .forEach((htmlElement) => {
      htmlElement.tabIndex = 0;
      htmlElement.setAttribute('role', 'button');
      htmlElement.onclick = () => codexDetail(htmlElement.dataset.k!);
      htmlElement.onkeydown = (keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          codexDetail(htmlElement.dataset.k!);
        }
      };
    });
}
/**
 * Renders the detail view for an individual ship or outfit item within the codex tab.
 * @param entryKey Item key prefix + ID (e.g. 's701' for ship, 'o50' for outfit)
 */
function codexDetail(entryKey: string): void {
  // Story equipment is not a discoverable catalog entry, even through a stale row.
  if (entryKey[0] !== 's' && allOutfits(clientGameState.A!)[+entryKey.slice(1)]?.eff?.riftHarness) {
    renderCodex();
    return;
  }
  clientGameState.views.capture(elementById2('clist'));
  delete elementById2('clist').dataset.viewKey;
  const identifier = +entryKey.slice(1);
  if (entryKey[0] === 's') {
    const shipHullAsset = clientGameState.A!.ships[identifier],
      where =
        shipHullAsset.kind === 'specialist'
          ? `Build at your Personal Station (Station Tier 3) with 40 blueprints. Loop: ${shipHullAsset.loop}`
          : shipHullAsset.kind === 'wingmate'
            ? 'Hire at Quantum Station (Station Tier 4)'
            : shipHullAsset.faction === 'exotic'
              ? 'Quantum Station shipyard (Station Tier 5)'
              : shipHullAsset.faction === 'umbral'
                ? 'Not for sale: Umbral only'
                : [735, 736].includes(identifier)
                  ? 'Quantum Station shipyard'
                  : 'Shipyards of: ' + (factionsSelling(identifier).join(', ') || 'none');
    elementById2('clist').innerHTML =
      `<div style="padding:6px"><a href="#" id="cback" style="color:#d88">&lsaquo; back</a><div style="text-align:center"><img src="${artworkUrl(shipHullAsset.img!)}" style="max-width:100%;max-height:150px"></div>
      <b style="color:#fff;font-size:14px">${escapeHtml2(shipHullAsset.name)}</b> <span class="cr" style="float:right">${shipHullAsset.kind === 'wingmate' ? 'hire' : credits(shipHullAsset.cost) + ' cr'}</span><div class="dim">${escapeHtml2(shipHullAsset.sub)} · ${roleTag(shipHullAsset)}</div><div class="dim small">${escapeHtml2((ROLES_INFO[shipHullAsset.role!] || {}).desc || '')}</div>
      ${statLines(shipHullAsset)}<div class="sect">WHERE TO GET IT</div><div style="color:#bfe0ff">${escapeHtml2(where)}</div>
      ${shipHullAsset.pilot ? `<div class="sect">PILOT</div><div style="white-space:pre-wrap;line-height:1.4">${escapeHtml2(shipHullAsset.pilot)}</div>` : ''}<div class="sect">DESCRIPTION</div><div style="white-space:pre-wrap;line-height:1.4">${escapeHtml2(shipHullAsset.desc)}</div></div>`;
  } else {
    const outfitAsset = allOutfits(clientGameState.A!)[identifier];
    elementById2('clist').innerHTML =
      `<div style="padding:6px"><a href="#" id="cback" style="color:#d88">&lsaquo; back</a><div style="text-align:center">${outfitAsset.icon ? `<img src="${artworkUrl(outfitAsset.icon)}">` : ''}</div>
      <b style="color:#fff;font-size:14px">${escapeHtml2(outfitAsset.name)}</b> <span class="cr" style="float:right">${credits(outfitAsset.cost)} cr</span>
      <div class="kv"><span>Mass</span><span>${outfitAsset.mass || 0} t</span></div><div class="kv"><span>Max</span><span>${outfitAsset.max || 1}</span></div>${weaponLines(outfitAsset)}
      <div class="sect">DESCRIPTION</div><div style="white-space:pre-wrap;line-height:1.4">${escapeHtml2(outfitAsset.desc)}</div></div>`;
  }
  elementById2('cback').onclick = (pointerEvent) => {
    pointerEvent.preventDefault();
    renderCodex();
    elementById2('clist')
      .querySelector<HTMLElement>('[data-k="' + CSS.escape(entryKey) + '"]')
      ?.focus({ preventScroll: true });
  };
  elementById2('clist').scrollTop = 0;
  elementById2('cback').focus({ preventScroll: true });
}
const STATMAX = {
  shield: 4500,
  armor: 9000,
  speed: 900,
  accel: 1200,
  turn: 90,
  cargo: 1800,
  fuel: 4000,
  space: 320,
};
/**
 * Generates HTML stat bar lines comparing ship statistics.
 * @param shipHullAsset Ship hull definition
 * @param shipHullAsset2 Comparison hull definition to show deltas
 * @returns Rendered HTML string of stat comparison bars
 */
function statLines(shipHullAsset: ShipHull, shipHullAsset2?: ShipHull | null): string {
  // cmp = the hull you fly, to show the difference
  const format = (entryKey: keyof typeof STATMAX, value: number | undefined) =>
    entryKey === 'fuel' ? Math.floor(value! / 100) + 'j' : value;
  const delta = (entryKey: keyof typeof STATMAX) => {
    if (!shipHullAsset2 || shipHullAsset2 === shipHullAsset) return '';
    const firstValue =
      entryKey === 'fuel'
        ? Math.floor((shipHullAsset[entryKey] || 0) / 100) -
          Math.floor((shipHullAsset2[entryKey] || 0) / 100)
        : Math.round((shipHullAsset[entryKey] || 0) - (shipHullAsset2[entryKey] || 0));
    return firstValue
      ? `<span class="dlt ${firstValue > 0 ? 'up' : 'dn'}">${firstValue > 0 ? '+' : ''}${firstValue}</span>`
      : '<span class="dlt">=</span>';
  };
  return (
    (['shield', 'armor', 'speed', 'accel', 'turn', 'cargo', 'fuel', 'space'] as const)
      .map(
        (entryKey) =>
          `<div class="stat"><span>${entryKey[0].toUpperCase() + entryKey.slice(1)}</span><div class="bar"><i style="width:${Math.min(100, 100 * Math.sqrt((shipHullAsset[entryKey] || 0) / STATMAX[entryKey]))}%"></i>${shipHullAsset2 && shipHullAsset2 !== shipHullAsset ? `<b class="was" style="left:${Math.min(100, 100 * Math.sqrt((shipHullAsset2[entryKey] || 0) / STATMAX[entryKey]))}%"></b>` : ''}</div><span style="width:44px;text-align:right">${format(entryKey, shipHullAsset[entryKey])}</span>${shipHullAsset2 && shipHullAsset2 !== shipHullAsset ? delta(entryKey) : ''}</div>`,
      )
      .join('') +
    (shipHullAsset2 && shipHullAsset2 !== shipHullAsset
      ? `<div class="dim small">Compared with your ${escapeHtml2(shipHullAsset2.name)} (the white tick on each bar).</div>`
      : '') +
    `<div class="kv"><span>Passenger seats</span><span>${passengerSeats(shipHullAsset)} dedicated${shipHullAsset2 && shipHullAsset2 !== shipHullAsset ? ` (your stock hull: ${passengerSeats(shipHullAsset2)})` : ''}</span></div><div class="kv"><span>Hardpoints</span><span>${shipHullAsset.guns} guns · ${shipHullAsset.turrets} turrets</span></div><div class="kv"><span>Armament</span><span style="text-align:right">${shipHullAsset.weapons.map(([width, count]) => `${clientGameState.A!.weapons[width] ? clientGameState.A!.weapons[width].name : width} ×${count}`).join(', ') || 'none'}</span></div>`
  );
}
/**
 * Renders weapon summary lines for an outfit item.
 * @param outfitAsset Outfit item definition
 * @returns Rendered HTML string of weapon attributes or empty string
 */
function weaponLines(outfitAsset: OutfitAsset): string {
  const weaponAsset = outfitAsset.eff!.weapon
    ? clientGameState.A!.weapons[outfitAsset.eff!.weapon]
    : null;
  if (!weaponAsset) return '';
  const weaponConfig = weaponParams(weaponAsset);
  return `<div class="kv"><span>Type</span><span>${weaponAsset.type}</span></div><div class="kv"><span>Damage</span><span>${weaponAsset.dmgS} shield · ${weaponAsset.dmgA} armor${weaponConfig.continuous ? ' per tick' : ''}</span></div><div class="kv"><span>Range</span><span>${Math.round(weaponConfig.range)}</span></div>`;
}
// station dashboard
/**
 * Generates an HTML list of systems with unclaimed derelict station hulls.
 * @returns HTML string displaying unclaimed hulls
 */
function unclaimedList(): string {
  const free = SITES.filter(
    (stellarBody) => !(clientGameState.sites && clientGameState.sites[stellarBody.id]),
  );
  return free.length
    ? `<div class="sect">UNCLAIMED HULLS (${free.length})</div>` +
        free
          .map(
            (stellarBody) =>
              `<div class="kv"><span>${escapeHtml2(systemsById[stellarBody.system].name)}</span><span class="dim">${escapeHtml2(FACTIONS[systemsById[stellarBody.system].faction].short)} space</span></div>`,
          )
          .join('')
    : '<p class="dim">Every hull has been claimed.</p>';
}
// the station screen: one button per department, like rooms of the station
const STATION_SECTIONS: Array<[string, string, number]> = [
  ['ops', 'STATION TIER', 0],
  ['docks', 'DOCKS', 0],
  ['refinery', 'REFINERY', 1],
  ['research', 'RESEARCH LAB', 2],
  ['hangar', 'SHUTTLES', 2],
  ['defense', 'DEFENSE', 2],
  ['specialists', 'SPECIALISTS', 0],
];
/**
 * Generates the full HTML markup for the personal station overview and department tabs.
 * @param interactive Whether interactive management controls are enabled
 * @returns HTML string of station UI
 */
function stationHtml(interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    stationState = playerPayload.station,
    currentTime = Date.now(),
    length2 = clientGameState.landed!,
    here = length2 && length2.site;
  if (!stationState.site) {
    const canClaim = here && !here.owner;
    return `<p>Derelict Concord station hulls drift in systems across the Rift. Land on one and claim it, and it becomes your Personal Station: build it up through five Station Tiers for a refinery that works while you fly, a research lab, wingmates and Exotic ships.</p>
      ${stationState.claimed ? `<p style="color:var(--cr)">Your station progress (Station Tier ${stationState.ops}) is kept and moves to the hull you claim.</p>` : ''}
      ${canClaim ? '<button class="btn big" data-act="st" data-op="claim">CLAIM THIS HULL</button>' : '<p class="dim">Fly to an unclaimed hull (shown on your radar in grey-violet) and land on it.</p>'}${unclaimedList()}
      <div class="sect">SPECIALISTS</div>${specialistsHtml(clientGameState, false)}`;
  }
  interactive = (interactive && here && here.own) as boolean;
  const where = STELLARS[stationState.site],
    seconds = (clientGameState.stab = STATION_SECTIONS.some(
      ([entryKey]) => entryKey === clientGameState.stab,
    )
      ? clientGameState.stab
      : 'ops');
  let height = `<div class="stnav">${STATION_SECTIONS.map(([entryKey, count, operations]) => `<button class="btn sm ${entryKey === seconds ? 'on' : ''}" data-act="stab" data-k="${entryKey}" ${stationState.ops < operations ? 'disabled title="Opens at Station Tier ' + operations + '"' : ''}>${count}</button>`).join('')}</div>`;
  if (!interactive)
    height += `<div class="dim small" style="margin:4px 0">Your Personal Station is in ${escapeHtml2(systemsById[where.system].name)}. Land there to manage it.</div>`;
  const capacity = REFINERY.silo + (researchBonus(stationState).silo || 0),
    perUnit = REFINERY.minutes[stationState.ops] * 60000;
  switch (seconds) {
    case 'ops': {
      const next = operationLevels[stationState.ops];
      height += `<div class="kv"><span>Location</span><span>${escapeHtml2(systemsById[where.system].name)}</span></div><div class="ops">${[1, 2, 3, 4, 5].map((entryKey) => `<div class="${stationState.ops >= entryKey ? 'on' : ''}">T-${entryKey}</div>`).join('')}</div>`;
      if (next)
        height +=
          `<div class="kv"><span>Next: Station Tier ${next.lv}</span><span>${escapeHtml2(next.title)}</span></div><div class="kv"><span>Cost</span><span>${credits(next.cost)} cr + ${next.mats.map(([message, game, count]) => `<span style="color:${playerPayload.mats[message][game] >= count ? '#8ff0ad' : '#ff9a8a'}">${message} ${GRADES[game]}</span>`).join(', ')}</span></div><div class="dim small">Unlocks: ${escapeHtml2(next.unlock)}</div>` +
          (interactive
            ? `<button class="btn sm" data-act="st" data-op="upgrade">BUILD T-${next.lv}</button>`
            : '');
      else
        height +=
          '<div class="kv"><span>Status</span><span style="color:var(--ok)">Fully built</span></div>';
      height += '<div class="sect">AT A GLANCE</div>';
      if (stationState.ops >= 1)
        height += `<div class="kv"><span>Refinery</span><span>${stationState.refUnits} / ${capacity} units${stationState.refUnits >= capacity ? ' · <b>full</b>' : ''}</span></div>`;
      if (stationState.ops >= 2)
        height += `<div class="kv"><span>Research</span><span>${stationState.active ? escapeHtml2(RESEARCH.find((researchNode) => researchNode.id === stationState.active!.id)!.name) + ' · ' + Math.max(0, Math.ceil((stationState.active.ends - currentTime) / 60000)) + ' min' : 'idle'}${stationState.queue && stationState.queue.length ? ` (+${stationState.queue.length} queued)` : ''}</span></div>`;
      if (playerPayload.shuttles.length)
        height += `<div class="kv"><span>Hangar</span><span>${playerPayload.shuttles.filter((savedShuttle) => savedShuttle.state === 'out').length} of ${playerPayload.shuttles.length} shuttles out</span></div>`;
      if (stationState.ops >= 2)
        height += `<div class="kv"><span>Defense rating</span><span>${playerPayload.defense}</span></div>`;
      if (playerPayload.dock.length)
        height += `<div class="kv"><span>Docks</span><span>${playerPayload.docks ? `${playerPayload.docks.count} docks · ${playerPayload.dock.length} stored ship${playerPayload.dock.length === 1 ? '' : 's'}` : playerPayload.dock.length + ' stored'}</span></div>`;
      height += materialsHtml(clientGameState, false);
      if (interactive && stationState.site && here && here.own) {
        // warp the station to another hull
        const free = SITES.filter(
            (stellarBody) =>
              !(clientGameState.sites && clientGameState.sites[stellarBody.id]) &&
              stellarBody.id !== stationState.site,
          ),
          cost = relocateCost(stationState.ops),
          wait = (stationState.relocT || 0) + RELOCATE.cooldownH * 3600000 - currentTime;
        height += `<div class="sect">RELOCATE STATION</div><div class="dim small">Warp your Personal Station to any unclaimed hull. Everything comes with it: Station Tier, research, refinery, docks and stored ships. The old hull is left for someone else to claim. Costs ${credits(cost)} cr + ${RELOCATE.mats.map(([message, game]) => message + ' ' + GRADES[game]).join(', ')}; once every ${RELOCATE.cooldownH} hours.</div>`;
        height +=
          wait > 0
            ? `<p class="dim small">Warp core recharging: ${Math.ceil(wait / 3600000)} h.</p>`
            : free.length
              ? `<div class="rrow"><select id="relsite">${free.map((stellarBody) => `<option value="${stellarBody.id}">${escapeHtml2(systemsById[stellarBody.system].name)} · ${escapeHtml2(FACTIONS[systemsById[stellarBody.system].faction].short)} space · danger ${systemsById[stellarBody.system].danger}</option>`).join('')}</select><button class="btn sm" data-act="relocate">WARP STATION</button></div>`
              : '<p class="dim small">No unclaimed hulls right now.</p>';
      }
      break;
    }
    case 'refinery': {
      const estimatedTime =
        stationState.refUnits < capacity && perUnit
          ? Math.max(0, Math.ceil((perUnit - (currentTime - stationState.refT)) / 60000))
          : 0;
      height += `<div class="sect" style="margin-top:4px">REFINERY</div><div class="meter">${Array.from({ length: capacity }, (unused, index) => `<i class="${index < stationState.refUnits ? 'on' : ''}"></i>`).join('')}</div>
        <div class="kv"><span>${stationState.refUnits} of ${capacity} units</span><span>${stationState.refUnits >= capacity ? 'Silos full' : `next in ~${estimatedTime} min`}</span></div>${interactive && stationState.refUnits ? '<button class="btn sm" data-act="st" data-op="collect">COLLECT</button>' : ''}`;
      const game = Math.min(
        4,
        ORE_PROCESS.grade[stationState.ops] + (researchBonus(stationState).processGrade || 0),
      );
      height += `<div class="sect">ORE PROCESSING</div><div class="dim small">${ORE_PROCESS.per} t of mined ore + ${credits(ORE_PROCESS.cost)} cr make one grade ${GRADES[game]} crate. Higher Station Tiers refine better grades.</div>`;
      for (const [oreCommodity, material] of Object.entries(ORE_PROCESS.to)) {
        const have = (playerPayload.cargo && playerPayload.cargo[oreCommodity]) || 0,
          count = Math.floor(have / ORE_PROCESS.per),
          name2 = COMMODITIES.find((commodityDef) => commodityDef.id === oreCommodity)!.name;
        height += `<div class="kv"><span>${escapeHtml2(name2)} <span class="dim">(${have} t)</span> → ${material} ${GRADES[game]}</span><span>${interactive && count ? `<button class="btn sm" data-act="st" data-op="process" data-id="${oreCommodity}">1 CRATE</button> <button class="btn sm" data-act="st" data-op="process" data-id="${oreCommodity}" data-all="1">ALL ${count}</button>` : `<span class="dim">${count ? count + ' ready' : 'need ' + ORE_PROCESS.per + ' t'}</span>`}</span></div>`;
      }
      height += materialsHtml(clientGameState, interactive);
      break;
    }
    case 'research':
      height += researchHtml(clientGameState, interactive);
      break;
    case 'docks':
      height += docksHtml(clientGameState, interactive);
      break; // 2.1
    case 'hangar':
      height += hangarHtml(clientGameState, interactive);
      break;
    case 'defense':
      height += defenseHtml(clientGameState, interactive);
      break;
    case 'specialists':
      height += specialistsHtml(clientGameState, interactive);
      break;
  }
  return height;
}
/**
 * Renders the personal station management companion tab.
 */
function renderStationTab(): void {
  if (!clientGameState.you!) return;
  const html = stationHtml(true);
  clientGameState.views.replace(
    elementById2('stview'),
    html,
    'station:' + (clientGameState.stab || 'ops'),
  );
}
/**
 * Renders the player event log history in the companion log tab.
 */
function renderLog(): void {
  const playerPayload = clientGameState.you!;
  if (!playerPayload) return;
  elementById2('llist').innerHTML =
    playerPayload.log
      .slice()
      .reverse()
      .map(
        (event) =>
          `<div class="logentry"><div class="d">${new Date(event.t).toLocaleString()}</div>${escapeHtml2(event.text)}</div>`,
      )
      .join('') || '<div class="dim small">Your log is empty.</div>';
}

// ------------------------------------------------------------------ landing screen
const TABS = [
  ['overview', 'OVERVIEW'],
  ['community', 'COMMUNITY'],
  ['trade', 'TRADE'],
  ['refinery', 'REFINERY'],
  ['yard', 'SHIPYARD'],
  ['outfit', 'OUTFITTER'],
  ['jobs', 'JOBS'],
  ['crew', 'CREW'],
  ['exchange', 'EXCHANGE'],
  ['colony', 'COLONY'],
  ['arena', 'ARENA'],
  ['station', 'STATION'],
  ['blackmarket', 'BLACK MARKET'],
  ['bank', 'BANK'],
];
/**
 * Opens and populates the landed view for the current stellar body or personal station.
 */
export function showLanded(): void {
  clientGameState.views.capture(elementById2('landbody'));
  const length2 = clientGameState.landed!,
    stellarBody = STELLARS[length2.stellar];
  elementById2('land').classList.remove('hidden');
  const site = length2.site;
  const storeSlot = elementById2('storebuttonslot');
  storeSlot.replaceChildren();
  if (availableStoreFactions(clientGameState, FACTIONS).length) {
    const button = document.createElement('button');
    button.id = 'storesbtn';
    button.className = 'btn';
    button.textContent = site?.own ? 'FACTION STORES' : 'FACTION STORE';
    button.onclick = () => openStores();
    storeSlot.appendChild(button);
  }
  refreshStores();
  elementById2('landname').textContent = site
    ? site.owner
      ? `${site.owner}'s Personal Station`
      : 'Derelict Station Hull'
    : stellarBody.name;
  elementById2('landfac').textContent =
    `${systemsById[stellarBody.system].name} system · ${site ? (site.owner ? `Personal Station · Station Tier ${site.ops}` : 'unclaimed') : FACTIONS[systemsById[stellarBody.system].faction].name}`;
  const landingDescription = (
    site
      ? site.own
        ? 'Your Personal Station. Build it up through Station Tier 1-5: refinery, research lab, drydock, wingmates and the station shipyard.'
        : site.owner
          ? `A Personal Station claimed and run by Captain ${site.owner}. Visitors may refuel and trade here.`
          : stellarBody.desc
      : stellarBody.desc || ''
  )!;
  elementById2('landdesc').textContent = storyDescription(
    clientGameState.you?.story?.flags,
    stellarBody.id,
    landingDescription,
  );
  const station = stellarBody.hub || stellarBody.site || stellarBody.kind === 'station';
  // Keep a neutral backdrop while matching artwork loads, never an unrelated
  // legacy stock station or Personal Station photograph.
  elementById2('landpic').style.backgroundImage = station
    ? `radial-gradient(circle at 40% 40%, ${stellarBody.color}, #000 75%)`
    : `url(${artworkUrl(`land/${landscapeScene(stellarBody)}.jpg`)}), radial-gradient(circle at 40% 40%, ${stellarBody.color}, #000 75%)`;
  if (station) {
    const landing = length2;
    void stationLanding(
      stellarBody,
      systemsById[stellarBody.system],
      stationDesign(stellarBody),
      site,
    ).then((targetUrl) => {
      if (targetUrl && clientGameState.landed === landing)
        elementById2('landpic').style.backgroundImage = `url("${targetUrl}")`;
    });
  }
  const available2 = TABS.filter(
    ([entryKey]) =>
      (entryKey === 'refinery' && length2.refinery?.available) ||
      (entryKey === 'blackmarket' && length2.blackmarket) ||
      (entryKey === 'bank' && length2.bank) ||
      entryKey === 'overview' ||
      (entryKey === 'community' && length2.community) ||
      (entryKey === 'trade' && (length2.market || length2.mats.length)) ||
      (entryKey === 'yard' && length2.yard) ||
      (entryKey === 'outfit' && length2.outfitter) ||
      (entryKey === 'jobs' &&
        (length2.offers.length ||
          length2.story ||
          (length2.arcs && length2.arcs.length) ||
          (clientGameState.you &&
            (clientGameState.you!.missions.length ||
              (clientGameState.you!.story && clientGameState.you!.story.active))))) ||
      (entryKey === 'station' && site && (site.own || !site.owner)) ||
      entryKey === 'crew' ||
      (!clientGameState.solo &&
        (entryKey === 'arena' || (entryKey === 'exchange' && length2.exchange))) || // multiplayer tabs hidden in solo
      (entryKey === 'colony' && length2.colony),
  );
  clientGameState.lastTab = clientGameState.lastTab || {};
  if (clientGameState._landedAt !== length2.stellar) {
    clientGameState._landedAt = length2.stellar;
    if (
      clientGameState.lastTab[length2.stellar] &&
      available2.some(([entryKey]) => entryKey === clientGameState.lastTab[length2.stellar])
    )
      clientGameState.ltab = clientGameState.lastTab[length2.stellar];
  } // each world remembers your last tab
  if (!available2.some(([entryKey]) => entryKey === clientGameState.ltab))
    clientGameState.ltab =
      site && (site.own || !site.owner) ? 'station' : length2.community ? 'community' : 'overview';
  clientGameState.lastTab[length2.stellar] = clientGameState.ltab!;
  clientGameState._ltabs = available2.map(([entryKey]) => entryKey);
  elementById2('ltabs').innerHTML = available2
    .map(
      ([entryKey, count], index) =>
        `<button class="btn sm ${entryKey === clientGameState.ltab ? 'on' : ''}" data-lt="${entryKey}" title="${index < 9 ? 'Key ' + (index + 1) : ''}">${count}</button>`,
    )
    .join('');
  elementById2('ltabs')
    .querySelectorAll<HTMLElement>('button')
    .forEach(
      (htmlElement) =>
        (htmlElement.onclick = () => {
          clientGameState.ltab = htmlElement.dataset.lt!;
          clientGameState.sel = null;
          showLanded();
        }),
    );
  renderLanded();
}
/**
 * Opens the faction storehouse / item storage dialog.
 */
export function openStores(): void {
  if (!clientGameState.you || !availableStoreFactions(clientGameState, FACTIONS).length) return;
  elementById2('storein').innerHTML = storeMenuHtml(clientGameState, FACTIONS);
  elementById2('storebox').classList.remove('hidden');
}
/**
 * Refreshes the faction storehouse UI if it is currently open.
 */
export function refreshStores(): void {
  if (!availableStoreFactions(clientGameState, FACTIONS).length) {
    elementById2('storebox').classList.add('hidden');
    elementById2('storein').replaceChildren();
    clientGameState.storeFac = undefined;
    return;
  }
  if (!elementById2('storebox').classList.contains('hidden'))
    elementById2('storein').innerHTML = storeMenuHtml(clientGameState, FACTIONS);
}
/**
 * Hides the landed screen dialog.
 */
export function hideLanded(): void {
  clientGameState.views.capture(elementById2('landbody'));
  clientGameState.views.remember();
  elementById2('land').classList.add('hidden');
}
/**
 * Renders the contents of the currently active landing tab (overview, shipyard, trade, jobs, etc.).
 */
export function renderLanded(): void {
  if (!clientGameState.landed || !clientGameState.you!) return;
  const length2 = clientGameState.landed!,
    playerPayload = clientGameState.you!,
    stellarBody = STELLARS[length2.stellar],
    body = elementById2('landbody'),
    computedShipStats = playerPayload.shipStats;
  // Live market/rivals updates must not erase a quantity while the captain types.
  const amounts = new Map(
    [...body.querySelectorAll<HTMLInputElement>('.trade-amount')].map((input) => [
      input.dataset.c!,
      input.value,
    ]),
  );
  const focusedAmount = document.activeElement?.matches('.trade-amount')
    ? (document.activeElement as HTMLElement).dataset.c!
    : null;
  const focusedRefinery = document.activeElement?.matches(
    '.refinery-form input, .refinery-form select',
  )
    ? document.activeElement.id
    : null;
  elementById2('dockchips').innerHTML = dockChips(
    clientGameState,
    !!(clientGameState.landed && clientGameState.landed!.site && clientGameState.landed!.site.own),
  ); // 2.1
  elementById2('landcr').textContent = credits(playerPayload.credits) + ' credits';
  elementById2('landcargo').textContent = playerPayload.shipless
    ? 'No active ship: choose one to depart'
    : `Cargo ${playerPayload.cargoUsed + (playerPayload.jobCargo || 0)}/${computedShipStats!.cargo} t${playerPayload.jobCargo ? ` (${playerPayload.jobCargo} t for jobs)` : ''} · Passengers ${occupiedPassengerSeats(playerPayload.missions)}/${passengerSeats(clientGameState.A!.ships[playerPayload.ship.hull], playerPayload.ship)} seats · Outfit space ${computedShipStats!.free} t free`;
  elementById2('depart').disabled = !!playerPayload.shipless;
  elementById2('depart').title = playerPayload.shipless
    ? 'Choose a ship first: a lead ship for your active dock (STATION, then DOCKS), or buy one at a shipyard'
    : '';
  let height = '';
  switch (clientGameState.ltab) {
    case 'refinery':
      height += refineryHtml(clientGameState);
      break;
    case 'overview': {
      const _faction = systemsById[stellarBody.system].faction;
      height += stateCard(stellarBody.system); // 2.4
      height += barCard(length2); // the contact at the bar, and what this world trades in
      if (length2.news && length2.news.length)
        height += `<div class="newsbox"><div class="sect" style="margin-top:0">SPACEPORT NEWS</div>${length2.news
          .slice(0, 4)
          .map((count) => `<div class="newsit">${escapeHtml2(count)}</div>`)
          .join('')}</div>`; // 1.1
      if (playerPayload.shipless)
        height += `<div class="noship"><b>NO ACTIVE SHIP</b><div>You can't depart until you choose a ship. ${playerPayload.dock && playerPayload.dock.length ? 'Open STATION, then DOCKS, and choose a lead ship for your active dock.' : 'Buy one at a SHIPYARD.'}</div><div>${playerPayload.dock && playerPayload.dock.length ? '<button class="btn sm" data-act="gotodock">OPEN DRYDOCK</button> ' : ''}${length2.yard ? '<button class="btn sm" data-act="ltab" data-t="yard">SHIPYARD</button>' : ''}</div></div>`;
      if (!playerPayload.shipless)
        height += `<div class="detail"><img src="${artworkUrl(clientGameState.A!.ships[playerPayload.ship.hull].img!)}"><div><div class="sect" style="margin-top:0">YOUR SHIP</div><b style="font-size:15px;color:#fff">${escapeHtml2(computedShipStats!.name)}</b> <span class="dim">"${escapeHtml2(playerPayload.ship.name)}"</span> ${roleTag(clientGameState.A!.ships[playerPayload.ship.hull])}
        <div class="kv"><span>Shield / Armor</span><span>${computedShipStats!.shield} / ${computedShipStats!.armor}</span></div><div class="kv"><span>Speed</span><span>${Math.round(computedShipStats!.maxSpeed)}</span></div><div class="kv"><span>Fuel</span><span>${Math.floor(computedShipStats!.fuel / 100)} jumps (refuelled)</span></div>
        <div class="kv"><span>Cargo</span><span>${
          Object.entries(playerPayload.cargo)
            .map(
              ([component, count]) =>
                `${count}t ${COMMODITIES.find((commodityDef) => commodityDef.id === component)!.name}`,
            )
            .join(', ') || 'empty'
        }</span></div>
        ${masteryHtml(clientGameState)}${synBadge(playerPayload)}<div class="sect">STANDING</div>${Object.entries(
          FACTIONS,
        )
          .filter(([, factionDef]) => !factionDef.hidden && !factionDef.region)
          .map(
            ([factionId, factionDef]) =>
              `<span class="small" style="display:inline-block;width:49%"><span style="color:${factionDef.color}">${factionDef.short}</span> <span class="dim">${repLabel(playerPayload.rep[factionId] || 0)} (${playerPayload.rep[factionId] || 0})</span></span>`,
          )
          .join('')}
        <div class="sect">RENAME SHIP</div><div class="rrow"><input id="rename" value="${escapeHtml2(playerPayload.ship.name)}" maxlength="28"><button class="btn sm" data-act="rename">RENAME</button></div></div></div>`;
      break;
    }
    case 'trade': {
      height += receiptHtml(clientGameState);
      if (length2.market)
        height += `<table class="tbl"><tr><th>COMMODITY</th><th>PRICE</th><th>HOLD</th><th></th></tr>${length2.market
          .map((marketItem) => {
            const base = COMMODITIES.find(
              (commodityDef) => commodityDef.id === marketItem.id,
            )!.base;
            const gradeRows = Object.entries(
              playerPayload.cargoLots?.byCommodity[marketItem.id] || {},
            )
              .filter(([, count]) => count > 0)
              .map(
                ([grade, count]) =>
                  `<tr class="small"><td>↳ ${grade}</td><td>${grade === 'pure' ? '1.6' : grade === 'rich' ? '1.3' : '1'}× raw sale value</td><td>${count} t</td><td style="text-align:right"><button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-grade="${grade}" data-q="-1">SELL 1</button> <button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-grade="${grade}" data-q="${-count}">SELL ${grade.toUpperCase()}</button></td></tr>`,
              )
              .join('');
            return `<tr><td>${escapeHtml2(marketItem.name)}${marketItem.sellCap !== undefined ? ` <span class="dim small">buyer: ${marketItem.sellCap}t left today</span>` : ''}${marketItem.flash ? ` <span class="flashtag ${marketItem.price! > base ? 'up' : 'dn'}">${marketItem.price! > base ? 'SHORTAGE' : 'GLUT'}</span>` : ''}</td><td class="${marketItem.price! < base * 0.9 ? 'lo' : marketItem.price! > base * 1.1 ? 'hi' : ''}">${credits(marketItem.price!)}${marketItem.moved ? `<span class="mv ${marketItem.moved > 0 ? 'up' : 'dn'}" title="Moved by this system's state and by what captains have traded here">${marketItem.moved > 0 ? '▲' : '▼'}${Math.abs(marketItem.moved)}%</span>` : ''}</td><td>${playerPayload.cargo[marketItem.id] || 0}${playerPayload.cargo[marketItem.id] && playerPayload.paid && playerPayload.paid[marketItem.id] ? ` <span class="small ${marketItem.price! >= playerPayload.paid[marketItem.id] ? 'pgain' : 'ploss'}" title="What you paid per ton, on average">paid ${credits(playerPayload.paid[marketItem.id])}</span>` : ''}</td>
        <td style="text-align:right"><button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-q="1"${holdFree(playerPayload) > 0 ? '' : ' disabled title="Hold full"'}>BUY</button> <button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-q="10"${holdFree(playerPayload) > 0 ? '' : ' disabled title="Hold full"'}>+10</button> <button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-q="${Math.max(0, Math.min(holdFree(playerPayload), Math.floor(playerPayload.credits / marketItem.price!)))}" title="Fill your hold with what you can afford"${Math.min(holdFree(playerPayload), Math.floor(playerPayload.credits / marketItem.price!)) > 0 ? '' : ' disabled'}>MAX</button> <button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-q="-1">SELL</button> <button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-q="-999">ALL</button><div class="trade-custom"><label>Amount <input class="trade-amount" data-c="${marketItem.id}" type="number" required min="1" max="2147483647" step="1" inputmode="numeric" aria-label="${escapeHtml2(marketItem.name)} trade amount in tons" value="${escapeHtml2(amounts.get(marketItem.id) ?? '1')}"></label><button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-custom="buy">BUY AMOUNT</button><button class="btn sm" data-act="trade" data-c="${marketItem.id}" data-custom="sell">SELL AMOUNT</button></div><div class="trade-estimate small" data-trade-estimate="${escapeHtml2(marketItem.id)}">${tradeEstimateHtml(clientGameState, marketItem, amounts.get(marketItem.id) ?? '1')}</div></td></tr>${gradeRows}`;
          })
          .join(
            '',
          )}</table><div class="tradefoot"><span class="dim small">Estimates include cargo grade, your perks and the size of the order. There is no separate trading fee. Prices can change before you click; a price here does not promise the same price elsewhere. Green is cheap here, red is high. Hold: ${playerPayload.cargoUsed + (playerPayload.jobCargo || 0)} / ${computedShipStats!.cargo} t${playerPayload.jobCargo ? ` (${playerPayload.jobCargo} t is job cargo)` : ''}.</span>${holdFree(playerPayload) <= 0 ? '<span class="jwarn">Hold full. Sell cargo or finish a delivery to make room.</span>' : ''}${length2.market.some((marketItem) => playerPayload.cargo[marketItem.id]) ? `<button class="btn sm" data-act="sellall">SELL ALL CARGO</button>` : ''}</div>`;
      if (length2.mats.length)
        height += `<div class="sect">STATION MATERIALS</div><table class="tbl"><tr><th>CRATE</th><th>PRICE</th><th>HELD</th><th></th></tr>${length2.mats.map((message) => `<tr><td>${message.mat} ${GRADES[message.grade]}</td><td>${credits(message.price)}</td><td>${playerPayload.mats[message.mat][message.grade]}</td><td style="text-align:right"><button class="btn sm" data-act="mat" data-m="${message.mat}" data-g="${message.grade}" data-q="1">BUY</button> <button class="btn sm" data-act="mat" data-m="${message.mat}" data-g="${message.grade}" data-q="-1">SELL</button></td></tr>`).join('')}</table>`;
      break;
    }
    case 'yard': {
      const selected =
        clientGameState.sel && length2.yard!.includes(clientGameState.sel)
          ? clientGameState.sel
          : length2.yard![0];
      const shipHullAsset = clientGameState.A!.ships[selected],
        trade = tradeIn(playerPayload);
      height = `<div class="detail"><img src="${artworkUrl(shipHullAsset.img!)}"><div><b style="font-size:16px;color:#fff">${escapeHtml2(shipHullAsset.name)}</b> <span class="dim">${escapeHtml2(shipHullAsset.sub)}</span> ${roleTag(shipHullAsset)}${shipHullAsset.cargo ? '' : ' <span class="nocargo">NO CARGO HOLD</span>'}${statLines(shipHullAsset, playerPayload.shipless ? null : clientGameState.A!.ships[playerPayload.ship.hull])}
        <div class="kv"><span>Price</span><span class="cr">${credits(shipHullAsset.cost)}</span></div>${
          WING_ONLY.includes(shipHullAsset.id) ||
          (!playerPayload.shipless && shipHullAsset.id === playerPayload.ship.hull) ||
          playerPayload.shipless
            ? ''
            : `<div class="kv"><span>Trade-in of your ${escapeHtml2(computedShipStats!.name)}</span><span>-${credits(trade)}</span></div>
        <div class="kv"><span>You pay to fly her</span><span class="cr">${credits(Math.max(0, shipHullAsset.cost - trade))}</span></div>`
        }${(() => {
          const docksPayload = playerPayload.docks,
            room = docksPayload && docksPayload.cap > docksPayload.stored.length,
            includes2 = WING_ONLY.includes(shipHullAsset.id); // buy to fly, or buy into your hangar
          const hangarButton =
            playerPayload.station && playerPayload.station.site
              ? `<button class="btn" data-act="buyhangar" data-h="${shipHullAsset.id}"${room ? '' : ' disabled title="Your hangar is full"'}>BUY TO HANGAR${docksPayload ? ` (${docksPayload.stored.length}/${docksPayload.cap})` : ''}</button>`
              : '';
          if (includes2)
            return `<p class="dim small">Flies only as a wingmate: it goes to your hangar, then assign it to a dock.</p>${hangarButton}`;
          return (
            (!playerPayload.shipless && shipHullAsset.id === playerPayload.ship.hull
              ? '<p class="dim">You fly this ship.</p>'
              : `<button class="btn" data-act="buyship" data-h="${shipHullAsset.id}">BUY AND FLY</button>`) +
            ' ' +
            hangarButton
          );
        })()}
        <p style="white-space:pre-wrap;line-height:1.4;color:#ccc">${escapeHtml2(shipHullAsset.desc)}</p></div></div><div class="ysort small">Sort by <select id="ysort">${[
          ['cost', 'price'],
          ['cargo', 'cargo'],
          ['speed', 'speed'],
          ['strength', 'fighting strength'],
          ['shield', 'shields'],
        ]
          .map(
            ([entryKey, count]) =>
              `<option value="${entryKey}"${(clientGameState.ysort || 'cost') === entryKey ? ' selected' : ''}>${count}</option>`,
          )
          .join('')}</select></div><div class="cards">${yardSorted(length2.yard)
          .map((height3) => {
            const shipHullAsset = clientGameState.A!.ships[height3];
            return `<div class="card ${height3 === selected ? 'sel' : ''}" data-act="sel" data-h="${height3}"><img src="${artworkUrl(shipHullAsset.img!)}"><div class="t">${escapeHtml2(shipHullAsset.name)}</div><div class="dim small">${escapeHtml2(shipHullAsset.sub)}</div><div class="small">${roleTag(shipHullAsset)}${shipHullAsset.cargo ? '' : ' <span class="nocargo">NO CARGO HOLD</span>'}</div><div class="p">${credits(shipHullAsset.cost)}</div></div>`;
          })
          .join('')}</div>`;
      break;
    }
    case 'outfit': {
      const allOutfits2 = allOutfits(clientGameState.A!);
      const category = clientGameState.ocat || 'all',
        categories = [
          ['all', 'ALL'],
          ['weapons', 'WEAPONS'],
          ['ammo', 'AMMO'],
          ['defense', 'DEFENSE'],
          ['engines', 'ENGINES'],
          ['utility', 'UTILITY'],
        ]; // outfitter categories
      const fits = (outfitAsset: OutfitAsset) => {
        if (
          outfitAsset.eff!.towRig &&
          (computedShipStats!.cargo < 60 ||
            ['fighter', 'interceptor'].includes(
              clientGameState.A!.ships[playerPayload.ship.hull].role!,
            ))
        )
          return false;
        if (outfitAsset.eff!.ammo)
          return (
            !!(computedShipStats!.weapons && computedShipStats!.weapons[outfitAsset.eff!.ammo]) ||
            Object.keys(playerPayload.ship.outfits).some(
              (entryKey) =>
                allOutfits2[entryKey] &&
                allOutfits2[entryKey].eff!.weapon === outfitAsset.eff!.ammo,
            )
          );
        if ((outfitAsset.mass || 0) > computedShipStats!.free) return false;
        if (outfitAsset.eff!.weapon)
          return outfitAsset.turret
            ? computedShipStats!.turrets < computedShipStats!.maxTurrets
            : computedShipStats!.guns < computedShipStats!.maxGuns;
        return true;
      }; // 2.5.2
      const list = length2.outfitter!.filter(
        (identifier) =>
          (category === 'all' || outfitCat(allOutfits2[identifier]) === category) &&
          (!clientGameState.ofit || fits(allOutfits2[identifier])),
      );
      height = `<div class="ocats"><label class="small ofit"><input type="checkbox" id="ofit"${clientGameState.ofit ? ' checked' : ''}> only what fits</label>${categories
        .filter(
          ([entryKey]) =>
            entryKey === 'all' ||
            length2.outfitter!.some(
              (identifier) => outfitCat(allOutfits2[identifier]) === entryKey,
            ),
        )
        .map(
          ([entryKey, count]) =>
            `<button class="btn sm${entryKey === category ? ' on' : ''}" data-act="ocat" data-k="${entryKey}">${count}</button>`,
        )
        .join(
          '',
        )}</div><p class="dim small">Outfit space ${computedShipStats!.free} t free · guns ${computedShipStats!.guns}/${computedShipStats!.maxGuns} · turrets ${computedShipStats!.turrets}/${computedShipStats!.maxTurrets} · passenger seats ${occupiedPassengerSeats(playerPayload.missions)}/${passengerSeats(clientGameState.A!.ships[playerPayload.ship.hull], playerPayload.ship)}</p><p class="dim small">Factory equipment is included in the hull price and sells at its factory value. Separately purchased equipment sells for half its retail price.</p><table class="tbl"><tr><th></th><th>OUTFIT</th><th>EFFECT</th><th>MASS</th><th>PRICE</th><th>OWNED</th><th></th></tr>${list
        .map((identifier) => {
          const outfitAsset = allOutfits2[identifier],
            owner = outfitAsset.eff!.ammo
              ? (clientGameState.ammo[outfitAsset.eff!.ammo] ??
                playerPayload.ship.ammo[outfitAsset.eff!.ammo] ??
                0)
              : playerPayload.ship.outfits[identifier] || 0;
          const width =
              outfitAsset.eff!.weapon && clientGameState.A!.weapons[outfitAsset.eff!.weapon],
            weaponConfig = width ? weaponParams(width) : null; // guns show damage and range; ammo says if you have a launcher
          const hasLauncher =
            outfitAsset.eff!.ammo &&
            ((computedShipStats!.weapons && computedShipStats!.weapons[outfitAsset.eff!.ammo]) ||
              Object.keys(playerPayload.ship.outfits).some(
                (entryKey) =>
                  allOutfits2[entryKey] &&
                  allOutfits2[entryKey].eff!.weapon === outfitAsset.eff!.ammo,
              )); // fixed launchers count too
          const effect = width
            ? `${width.type}${outfitAsset.turret ? ' turret' : ''} · ${Math.round((width.dmgA || 0) + (width.dmgS || 0))} dmg · ${Math.round(weaponConfig!.range)} range`
            : outfitAsset.eff!.ammo
              ? hasLauncher
                ? 'ammunition'
                : 'ammunition · needs its launcher'
              : Object.entries(outfitAsset.eff!)
                  .map(
                    ([entryKey, value]) =>
                      `${entryKey === 'passengerSeats' ? 'Passenger seats' : entryKey} ${value > 0 ? '+' : ''}${value}`,
                  )
                  .join(', ');
          const count = outfitAsset.eff!.ammo ? 10 : 1,
            reason =
              !outfitAsset.eff!.ammo &&
              owner >= stockOutfitLimit(clientGameState.A!, playerPayload.ship, identifier)
                ? `Maximum fitted: ${stockOutfitLimit(clientGameState.A!, playerPayload.ship, identifier)}`
                : outfitAsset.eff!.ammo && !hasLauncher
                  ? 'You have nothing that fires this'
                  : playerPayload.credits < outfitAsset.cost * count
                    ? 'Not enough credits'
                    : !outfitAsset.eff!.ammo && (outfitAsset.mass || 0) > computedShipStats!.free
                      ? 'Not enough outfit space'
                      : width &&
                          (outfitAsset.turret
                            ? computedShipStats!.turrets >= computedShipStats!.maxTurrets
                            : computedShipStats!.guns >= computedShipStats!.maxGuns)
                        ? `No free ${outfitAsset.turret ? 'turret' : 'gun'} mounts`
                        : '';
          return `<tr><td>${outfitAsset.icon ? `<img src="${artworkUrl(outfitAsset.icon)}" style="width:32px;height:32px">` : ''}</td><td title="${escapeHtml2(outfitAsset.desc)}">${escapeHtml2(outfitAsset.name)}</td><td class="dim small">${escapeHtml2(effect)}</td><td>${outfitAsset.mass || 0}</td><td class="cr">${credits(outfitAsset.cost)}</td><td>${owner}</td>
          <td style="text-align:right"><button class="btn sm" data-act="outfit" data-id="${identifier}" data-n="${count}"${reason ? ` disabled title="${reason}"` : ''}>BUY${outfitAsset.eff!.ammo ? ' 10' : ''}</button>${outfitAsset.eff!.ammo ? '' : ` <button class="btn sm" data-act="outfit" data-id="${identifier}" data-n="-1"${owner ? '' : ' disabled'}>SELL</button>`}</td></tr>`;
        })
        .join('')}</table>`;
      const owned = Object.entries(playerPayload.ship.outfits).filter(
        ([identifier]) => !length2.outfitter!.includes(+identifier),
      );
      if (owned.length)
        height += `<div class="sect">FITTED ELSEWHERE</div>${owned.map(([identifier, count]) => `<div class="kv"><span>${escapeHtml2(allOutfits2[identifier].name)} ×${count}</span><span><button class="btn sm" data-act="outfit" data-id="${identifier}" data-n="-1">SELL</button></span></div>`).join('')}`;
      height = outfitterRepairsHtml(clientGameState) + height;
      break;
    }
    case 'jobs': {
      const story2 = length2.story,
        activeStory = playerPayload.story && playerPayload.story.active;
      height = `<div class="dim small">Passenger seats: ${occupiedPassengerSeats(playerPayload.missions)} occupied / ${passengerSeats(clientGameState.A!.ships[playerPayload.ship.hull], playerPayload.ship)} total. Bridge officers and working crew have separate accommodation.</div>`;
      if (story2)
        height += `<div class="card story" style="cursor:default"><div class="storytag">MAIN STORY</div><div class="t">${escapeHtml2(story2.title)}</div><div>${escapeHtml2(story2.brief)}</div>${story2.locked ? `<div class="dim small">${escapeHtml2(story2.locked)}</div>` : `<div><button class="btn sm" data-act="storyopen">READ</button></div>`}</div>`;
      height += arcCardsHtml(clientGameState); // 1.2 faction arcs
      if (activeStory)
        height += `<div class="card story" style="cursor:default"><div class="storytag">MAIN STORY · IN PROGRESS</div><div class="t">${escapeHtml2(activeStory.title)}</div><div>${escapeHtml2(activeStory.brief)}</div>${activeStory.ready ? '<div style="color:var(--ok)">Done: return to collect.</div>' : activeStory.got ? `<div class="dim small">${activeStory.got} so far</div>` : ''}</div>`;
      height +=
        `<div class="sect" style="margin-top:0">JOBS ON OFFER</div>` +
        missionFiltersHtml(clientGameState) +
        (filterMissions(clientGameState, length2.offers).length
          ? filterMissions(clientGameState, length2.offers)
              .map((mission) => {
                if (mission.type === 'quest') return questCard(mission);
                const jobInfo2 = jobInfo(mission, playerPayload);
                return `<div class="card" data-offer-type="${escapeHtml2(mission.type)}" style="cursor:default"><div class="t">${escapeHtml2(mission.title)}</div><div>${escapeHtml2(mission.text)}</div>${missionFactsHtml(clientGameState, mission)}${jobInfo2.warn ? `<div class="jwarn">${jobInfo2.warn}</div>` : ''}${jobInfo2.note ? `<div class="jwarn" style="color:#ffb070">⚠ ${escapeHtml2(jobInfo2.note)}</div>` : ''}<div><button class="btn sm" data-act="accept" data-id="${mission.id}"${jobInfo2.warn ? ' disabled' : ''}>${mission.type === 'warband' ? 'PLAN TEAM CONTRACT' : 'ACCEPT'}</button>${mission.sys && mission.sys !== clientGameState.sys ? ` <button class="btn sm" data-plot="${mission.sys}">PLOT</button>` : ''}</div></div>`;
              })
              .join('')
          : '<p class="dim">No jobs match these filters right now. Choose All types or turn off a filter to see the rest. Boards refresh every ten minutes.</p>');
      height +=
        `<div class="sect">YOUR JOBS (${playerPayload.missions.length}/6)</div>` +
        (playerPayload.missions.length
          ? playerPayload.missions
              .map(
                (mission) =>
                  `<div class="kv"><span>${mission.quest ? `<span class="qtag">${escapeHtml2(mission.quest.name)} ${mission.quest.step + 1}/${mission.quest.of}</span> ` : ''}${escapeHtml2(mission.title)}${mission.type === 'patrol' ? ` (${mission.got}/${mission.need})` : ''}${mission.done ? ' <b style="color:var(--ok)">done: land to collect</b>' : ''}</span><span>${credits(mission.reward)} <button class="btn sm" data-act="abandon" data-id="${mission.id}">ABANDON</button></span></div>`,
              )
              .join('')
          : '<p class="dim">None.</p>');
      break;
    }
    case 'station':
      height = stationHtml(true);
      break;
    case 'crew':
      height = crewHtml(clientGameState);
      break;
    case 'blackmarket':
      height = blackMarketHtml(clientGameState);
      break; // 1.2
    case 'bank':
      height = bankHtml(clientGameState);
      break;
    case 'colony':
      height = colonyHtml(clientGameState);
      break;
    case 'exchange':
      height = exchangeHtml(clientGameState);
      break;
    case 'arena':
      height = arenaHtml(clientGameState);
      break;
    case 'community': {
      if (
        !clientGameState.boards ||
        !clientGameState.boards[clientGameState.boardCat || 'earned']
      ) {
        clientGameState.boards = clientGameState.boards || {};
        clientGameState.boards[clientGameState.boardCat || 'earned'] = null;
        send({ t: 'boards', cat: clientGameState.boardCat || 'earned' });
      }
      const communityPayload = length2.community;
      height = `<div class="detail" style="grid-template-columns:1fr 1fr"><div>${clientGameState.solo ? '' : `<div class="sect" style="margin-top:0">CAPTAINS ONLINE (${communityPayload!.online.length})</div>`}${clientGameState.solo ? '' : communityPayload!.online.map((options) => `<div class="kv"><span>${escapeHtml2(options.name)}${options.name !== clientGameState.myName ? ` <button class="btn sm" data-act="ainvite" data-n="${escapeHtml2(options.name)}">INVITE</button>` : ''}${options.name !== clientGameState.myName && !(clientGameState.social && clientGameState.social.friends.some((friendEntry) => friendEntry.name === options.name)) ? ` <button class="btn sm" data-act="addfriend" data-n="${escapeHtml2(options.name)}">+ FRIEND</button>` : ''}</span><span>${escapeHtml2(options.sys)}</span></div>`).join('')}
        ${clientGameState.solo ? '' : `<div class="sect">DOCKED HERE</div><div>${communityPayload!.docked.map((count) => `<span class="pill on">${escapeHtml2(count)}</span>`).join('') || '<span class="dim">Nobody else right now.</span>'}</div>`}
        <div class="sect"${clientGameState.solo ? ' style="margin-top:0"' : ''}>STATION REGISTRY</div>${communityPayload!.stations.map((state) => `<div class="kv"><span>${escapeHtml2(state.system)}</span><span>${state.owner ? `${escapeHtml2(state.owner)} · Station Tier ${state.ops}` : '<span class="dim">unclaimed hull</span>'}</span></div>`).join('')}</div>
        <div><div class="sect" style="margin-top:0">TOP CAPTAINS (credits earned)</div><table class="tbl"><tr><th>#</th><th>CAPTAIN</th><th>SHIP</th><th>EARNED</th><th>KILLS</th></tr>${communityPayload!.top.map((time, index) => `<tr><td>${index + 1}</td><td>${escapeHtml2(time.name)}${time.ai ? ' <span class="aitag">captain</span>' : ''}</td><td class="dim">${escapeHtml2(time.ship)}</td><td class="cr">${credits(time.earned)}</td><td>${time.kills}</td></tr>`).join('')}</table>
        ${boardsHtml(clientGameState)}<p class="dim">Quantum Station is the Rift's meeting place. Claim one of the derelict station hulls listed in the registry to build your Personal Station.</p></div></div>`;
      break;
    }
  }
  clientGameState.views.replace(
    body,
    height,
    'land:' + length2.stellar + ':' + clientGameState.ltab,
  );
  if (focusedRefinery) elementById(focusedRefinery)?.focus({ preventScroll: true });
  if (focusedAmount)
    [...body.querySelectorAll<HTMLInputElement>('.trade-amount')]
      .find((input) => input.dataset.c === focusedAmount)
      ?.focus({ preventScroll: true });
}
// // 2.4: a system's state as a line of text, and as a card
/**
 * Retrieves the currently active economic or military state of a star system.
 * @param starSystem System ID
 * @returns Active system state or null
 */
export function stateOfSys(starSystem: number | string | null): SystemState | null {
  const livingPayloadState =
    clientGameState.world &&
    clientGameState.world.states &&
    clientGameState.world.states[starSystem!];
  return livingPayloadState && livingPayloadState.until > Date.now() && STATES[livingPayloadState.k]
    ? livingPayloadState
    : null;
}
/**
 * Formats a short colored text summary line of a system's active state.
 * @param starSystem System ID
 * @returns Rendered HTML string of system state
 */
function stateLine(starSystem: number | string | null): string {
  const livingPayloadState = stateOfSys(starSystem);
  if (!livingPayloadState) return '';
  const systemState = STATES[livingPayloadState.k];
  return `<span style="color:${systemState.color}">${systemState.icon} ${systemState.name}${livingPayloadState.k === 'war' && livingPayloadState.enemy ? ` with the ${escapeHtml2(FACTIONS[livingPayloadState.enemy!].short)}` : ''}</span>${livingPayloadState.need ? ` <span class="dim">(${livingPayloadState.got}/${livingPayloadState.need})</span>` : ''}`;
}
/**
 * Renders an informational card showing system state details, price shifts, and goals.
 * @param starSystem System ID
 * @returns Rendered HTML string of state card
 */
function stateCard(starSystem: number | string | null): string {
  const livingPayloadState = stateOfSys(starSystem);
  if (!livingPayloadState) return '';
  const systemState = STATES[livingPayloadState.k],
    left = Math.max(1, Math.round((livingPayloadState.until - Date.now()) / 60000));
  const prices = Object.entries(systemState.prices)
    .map(
      ([component, message]) =>
        `${COMMODITIES.find((commodityDef) => commodityDef.id === component)!.name} ${message >= 1 ? '▲' : '▼'}${Math.round(Math.abs(message - 1) * 100)}%`,
    )
    .join(' · ');
  const goal = systemState.need
    ? systemState.need.cid
      ? `Sell ${systemState.need.qty} t of ${systemState.need.cid} at markets here (or deliver supply jobs) to end it.`
      : `Destroy ${systemState.need.qty} ${systemState.need.kills === 'pirate' ? 'raiders' : escapeHtml2(FACTIONS[livingPayloadState.enemy!].name) + ' ships'} here to end it.`
    : '';
  return `<div class="statecard" style="border-color:${systemState.color}"><div><b style="color:${systemState.color}">${systemState.icon} ${systemState.name.toUpperCase()}</b> <span class="dim small">· about ${left} min left</span></div><div class="small">${escapeHtml2(systemState.desc)}</div><div class="small dim">${prices}</div>${goal ? `<div class="small">${goal}${livingPayloadState.need ? ` <b>${livingPayloadState.got} / ${livingPayloadState.need}</b>` : ''}</div><div class="sbar"><i style="width:${Math.round((100 * livingPayloadState.got) / Math.max(1, livingPayloadState.need))}%;background:${systemState.color}"></i></div>` : ''}</div>`;
}
// how far a job is and whether its cargo fits your hold
/**
 * Calculates remaining available cargo capacity accounting for active cargo missions.
 * @param playerPayload Player state object
 * @returns Free cargo capacity in tons
 */
function holdFree(playerPayload: PlayerPayload): number {
  return new ShipCapacity(
    playerPayload.shipStats!.cargo,
    playerPayload.cargoUsed,
    reservedCargoTonnes(playerPayload.missions),
  ).remaining;
}
// the bar contact's greeting and rumour, and the world's trade specialties
/**
 * Renders the bar contact and trade export/import highlights on the landed overview screen.
 * @param length2 Current landed state
 * @returns Rendered HTML string of bar card
 */
function barCard(length2: LandedState): string {
  let height = '';
  if (length2.contact) {
    const contact2 = length2.contact,
      story = (length2.offers || []).find((mission) => mission.type === 'quest');
    height += `<div class="barcard"><div class="sect" style="margin-top:0">AT THE BAR</div><div><b>${escapeHtml2(contact2.name)}</b> <span class="dim">· ${escapeHtml2(contact2.title)} · ${escapeHtml2(contact2.standing)}</span></div><div class="qintro">${escapeHtml2(contact2.hello)}</div><div class="rumor">${escapeHtml2(contact2.rumor)}</div>${story ? `<div class="small" style="margin-top:4px">Has a story for you: <b style="color:#ffe2a0">${escapeHtml2(story.title)}</b> <button class="btn sm" data-act="ltab" data-t="jobs">SEE JOBS</button></div>` : ''}</div>`;
  }
  if (length2.market && length2.market.length) {
    const sort2 = length2.market
      .map((marketItem) => ({
        c: marketItem,
        k:
          marketItem.price! /
          COMMODITIES.find((commodityDef) => commodityDef.id === marketItem.id)!.base,
      }))
      .sort((firstValue, secondValue) => firstValue.k - secondValue.k);
    const cheap = sort2.filter((positionX) => positionX.k < 0.9).slice(0, 2),
      dear = sort2
        .filter((positionX) => positionX.k > 1.12)
        .slice(-2)
        .reverse();
    if (cheap.length || dear.length)
      height += `<div class="small spec">${cheap.length ? `<span>Exports: <b style="color:var(--ok)">${cheap.map((positionX) => escapeHtml2(positionX.c.name)).join(', ')}</b> (cheap here)</span>` : ''}${cheap.length && dear.length ? ' · ' : ''}${dear.length ? `<span>Wants: <b style="color:#ffb070">${dear.map((positionX) => escapeHtml2(positionX.c.name)).join(', ')}</b> (pays well)</span>` : ''}</div>`;
  }
  return height;
}
// warn when a story will ask for more hold space or bunks than the ship you fly
/**
 * Generates warning HTML if a quest or story mission requires more hold or bunk capacity than current ship has.
 * @param mission Job or quest offer
 * @returns Rendered HTML warning string or empty string
 */
function questNeeds(mission: LandedOffer): string {
  const playerPayload = clientGameState.you!,
    needs2 = mission.needs;
  if (!needs2 || playerPayload.shipless) return '';
  const width = [];
  if (needs2.hold && (playerPayload.shipStats!.cargo || 0) < needs2.hold)
    width.push(
      `one step needs ${needs2.hold} t of hold space and your ship has ${playerPayload.shipStats!.cargo || 0} t`,
    );
  if (needs2.pax && bunkInfo(clientGameState, { type: 'passenger', pax: needs2.pax }))
    width.push(`one step carries ${needs2.pax} passenger${needs2.pax > 1 ? 's' : ''}`);
  return width.length
    ? `<div class="jwarn" style="color:#ffb070">⚠ ${escapeHtml2(width.join('; '))}. You can take it on and switch ships for that step.</div>`
    : '';
}
// a contact's story or a side story on the job board
/**
 * Renders the HTML card for an available story or quest mission offer.
 * @param mission Story/quest offer definition
 * @returns Rendered HTML string of quest card
 */
function questCard(mission: LandedOffer): string {
  const count =
    mission.sys === clientGameState.sys
      ? 0
      : (route(systemsById, clientGameState.sys!, mission.sys) || []).length;
  return `<div class="card story quest" style="cursor:default"><div class="storytag">${mission.side ? 'SIDE STORY' : 'CONTACT'} · ${escapeHtml2(mission.giver)}${mission.standing ? ` · <span class="dim">${escapeHtml2(mission.standing)}</span>` : ''}</div><div class="t">${escapeHtml2(mission.title)}</div><div class="qintro">${escapeHtml2(mission.text)}</div>
    <div class="p">${mission.steps} steps, starting in ${systemsById[mission.sys] ? escapeHtml2(systemsById[mission.sys].name) : 'nearby'}${count ? ` (${count} jump${count > 1 ? 's' : ''})` : ''} · each step pays, and finishing earns <span class="cr">${escapeHtml2(mission.rewardText)}</span></div>
    ${mission.full ? '<div class="jwarn">You are already following three stories.</div>' : ''}${clientGameState.you!.missions.length >= 6 ? '<div class="jwarn">All six job slots are full. Finish or abandon a job first.</div>' : ''}${questNeeds(mission)}<div><button class="btn sm" data-act="accept" data-id="${escapeHtml2(mission.id)}"${mission.full || clientGameState.you!.missions.length >= 6 ? ' disabled' : ''}>TAKE IT ON</button>${mission.sys && mission.sys !== clientGameState.sys ? ` <button class="btn sm" data-plot="${mission.sys}">PLOT</button>` : ''}</div></div>`;
}
/**
 * Sorts shipyard hull IDs by the current sort criterion (cost, cargo, speed, strength, shield).
 * @param list Array of ship hull IDs
 * @returns Sorted copy of hull IDs array
 */
function yardSorted(list: number[] | null): number[] {
  const entryKey = (clientGameState.ysort || 'cost') as
      | 'cost'
      | 'shield'
      | 'armor'
      | 'cargo'
      | 'speed',
    ships2 = clientGameState.A!.ships;
  return list!
    .slice()
    .sort((firstValue, secondValue) =>
      entryKey === 'cost'
        ? (ships2[firstValue].cost || 0) - (ships2[secondValue].cost || 0)
        : (ships2[secondValue][entryKey] || 0) - (ships2[firstValue][entryKey] || 0),
    );
} // 2.5.2
/**
 * Determines the category of an outfit for outfitter filtering.
 * @param outfitAsset Outfit item definition
 * @returns Category name ('weapons', 'ammo', 'defense', 'engines', or 'utility')
 */
function outfitCat(outfitAsset: OutfitAsset): string {
  if (!outfitAsset) return 'utility';
  const event = outfitAsset.eff || {};
  if (event.weapon) return 'weapons';
  if (event.ammo) return 'ammo';
  if (
    ['shield', 'armor', 'shieldRe', 'armorRe', 'shieldPct', 'armorPct', 'pd'].some(
      (entryKey) => entryKey in event,
    )
  )
    return 'defense';
  if (
    [
      'speed',
      'accel',
      'turn',
      'afterburner',
      'fuel',
      'fuelRe',
      'jump',
      'multiJump',
      'jumpFast',
      'jumpSpeed',
    ].some((entryKey) => entryKey in event)
  )
    return 'engines';
  return 'utility';
}
/**
 * Evaluates route distance, cargo/bunk space warnings, and threat notes for a job offer.
 * @param mission Job offer definition
 * @param playerPayload Player state object
 * @returns Evaluated location description, warning, and note strings
 */

/** Route distance is expressed in hyperspace hops. */
function jobInfo(mission: LandedOffer, playerPayload: PlayerPayload): JobInfo {
  const /** Number of hyperspace hops required */
    count =
      mission.sys === clientGameState.sys
        ? 0
        : (route(systemsById, clientGameState.sys!, mission.sys) || []).length;
  const where = `${systemsById[mission.sys] ? systemsById[mission.sys].name : ''}${count ? ` · ${count} jump${count > 1 ? 's' : ''}` : ' · this system'}`;
  let warn = bunkInfo(clientGameState, mission),
    note = '';
  const details = missionDetails(clientGameState, mission);
  if (details.reasons.length) warn = details.reasons.join(' ');
  if (mission.type === 'warband')
    note =
      'Each captain chooses whether to join. Review exact shares in Missions before the team starts.';
  if (
    (mission.type === 'bounty' || mission.type === 'assassinate') &&
    mission.hull &&
    clientGameState.A!.ships[mission.hull] &&
    !playerPayload.shipless
  ) {
    // how the target compares with your ship
    const radius =
      (clientGameState.A!.ships[mission.hull].strength || 10) /
      Math.max(1, clientGameState.A!.ships[playerPayload.ship.hull].strength || 10);
    if (radius > 1.6)
      note = `Target: ${clientGameState.A!.ships[mission.hull].name}, ${radius > 4 ? 'far stronger than' : 'stronger than'} your ${clientGameState.A!.ships[playerPayload.ship.hull].name}.`;
  }
  if (
    !note &&
    !playerPayload.shipless &&
    playerPayload.shipStats &&
    count > Math.floor(playerPayload.shipStats.fuel / 100)
  )
    note = `${count} jumps away, but your tanks hold ${Math.floor(playerPayload.shipStats.fuel / 100)}. Plan a stop to land and refuel on the way.`; // 2.4
  if (
    !note &&
    mission.type === 'supply' &&
    !playerPayload.shipless &&
    mission.qty! > (playerPayload.shipStats!.cargo || 0)
  )
    note = `You buy and carry the ${mission.qty} t yourself, and your hold takes ${playerPayload.shipStats!.cargo || 0} t.`; // 2.5.2
  if (
    !warn &&
    (mission.type === 'cargo' || mission.type === 'smuggle') &&
    mission.qty! > holdFree(playerPayload)
  )
    warn = `Needs ${mission.qty} t of hold space; you have ${Math.max(0, holdFree(playerPayload))} t free.`;
  return { where, warn, note };
}
/**
 * Calculates the total trade-in refund value for the player's current ship and outfits (50% value).
 * @param playerPayload Player state object
 * @returns Credit refund value
 */
function tradeIn(playerPayload: PlayerPayload): number {
  return playerPayload.shipless ? 0 : loadoutValue(clientGameState.A!, playerPayload.ship);
}
/**
 * Global click event dispatcher for interactive buttons and links across all landing screens and companion tabs.
 * @param mouseEvent Click event
 */
function onAct(mouseEvent: MouseEvent): void {
  const htmlElement = (mouseEvent.target as HTMLInputElement).closest<HTMLElement>('[data-act]');
  if (!htmlElement) return;
  if (htmlElement.tagName === 'A') mouseEvent.preventDefault();
  if (htmlElement.tagName === 'SELECT') return;
  const domStringMap = htmlElement.dataset;
  switch (domStringMap.act) {
    case 'trade': {
      let quantity = +domStringMap.q!;
      if (domStringMap.custom) {
        const input = htmlElement
          .closest<HTMLElement>('td')!
          .querySelector<HTMLInputElement>('.trade-amount');
        if (!input!.reportValidity() || !Number.isSafeInteger(input!.valueAsNumber)) {
          input!.focus();
          return;
        }
        // The server remains authoritative for bulk prices/bonuses and finite buyers.
        const market = clientGameState.landed!.market!.find(
          (marketItem) => marketItem.id === domStringMap.c,
        );
        const limit =
          domStringMap.custom === 'buy'
            ? Math.max(0, holdFree(clientGameState.you!))
            : Math.min(
                clientGameState.you!.cargo[domStringMap.c!] || 0,
                market!.sellCap ?? Infinity,
              );
        quantity =
          Math.min(input!.valueAsNumber, limit) * (domStringMap.custom === 'sell' ? -1 : 1);
        if (!quantity)
          return toast(
            domStringMap.custom === 'buy'
              ? 'No room in your hold.'
              : 'No sale inventory or buyer demand remaining.',
          );
      }
      const lots = domStringMap.grade
        ? { common: 0, rich: 0, pure: 0, [domStringMap.grade]: Math.abs(+domStringMap.q!) }
        : undefined;
      send({ t: 'trade', cid: domStringMap.c, qty: quantity, lots });
      break;
    }
    case 'addfriend':
      send({ t: 'social', op: 'add', name: domStringMap.n });
      break; // 2.6
    case 'relocate': {
      const htmlSelectElement = elementById('relsite');
      if (!htmlSelectElement) break;
      const value4 = htmlSelectElement.value;
      ask(
        `Warp your Personal Station to ${htmlSelectElement.selectedOptions[0].textContent.split(' · ')[0]}? It costs ${credits(relocateCost(clientGameState.you!.station.ops))} credits and an alloy II crate, and the warp core then needs ${RELOCATE.cooldownH} hours to recharge.`,
        () => send({ t: 'station', op: 'relocate', site: value4 }),
      );
      break;
    }
    case 'ainvite':
      send({ t: 'armada', op: 'invite', name: domStringMap.n });
      break;
    case 'sellall':
      for (const marketItem of clientGameState.landed!.market || [])
        if (clientGameState.you!.cargo[marketItem.id])
          send({ t: 'trade', cid: marketItem.id, qty: -999 });
      break;
    case 'mat':
      send({ t: 'buymat', mat: domStringMap.m, grade: +domStringMap.g!, n: +domStringMap.q! });
      break;
    case 'sel':
      clientGameState.sel = +domStringMap.h!;
      renderLanded();
      // Only a deliberate ship choice returns to details; background refreshes
      // and sorting keep the captain's browsing position. Render is synchronous.
      if (clientGameState.ltab === 'yard') elementById2('landbody').scrollTop = 0;
      break;
    case 'buyhangar':
      ask(
        `Buy the ${clientGameState.A!.ships[domStringMap.h!].name} for ${credits(clientGameState.A!.ships[domStringMap.h!].cost)} credits and send her to your Personal Station's hangar?`,
        () => {
          playInterfaceSound('buy', 0.7);
          send({ t: 'buyship', hull: +domStringMap.h!, store: true });
        },
      );
      break;
    case 'buyship':
      ask(
        `Buy the ${clientGameState.A!.ships[domStringMap.h!].name}?\n\n${clientGameState.you!.shipless ? 'You have no active ship to trade in.' : `Your ${clientGameState.A!.ships[clientGameState.you!.ship.hull].name} and its outfits are traded in for ${credits(tradeIn(clientGameState.you!))} credits. To keep her instead, store her in your Personal Station's drydock first.`}`,
        () => send({ t: 'buyship', hull: +domStringMap.h! }),
      );
      break;
    case 'outfit':
      send({ t: 'outfit', id: +domStringMap.id!, n: +domStringMap.n! });
      break;
    case 'accept':
      send({ t: 'accept', id: domStringMap.id });
      if (
        clientGameState.landed?.offers.find((mission) => mission.id === domStringMap.id)?.type ===
        'warband'
      )
        ctab('missions');
      break;
    case 'abandon': {
      const mission = (clientGameState.you!.missions || []).find(
        (mission) => mission.id === domStringMap.id,
      );
      ask(
        mission && mission.quest
          ? `Abandon this step? That ends the story "${mission.quest.name}".`
          : 'Abandon this job? You will not be paid for it.',
        () => send({ t: 'abandon', id: domStringMap.id }),
      );
      break;
    }
    case 'st':
      mouseEvent.preventDefault();
      send({
        t: 'station',
        op: domStringMap.op,
        id: domStringMap.id,
        hull: domStringMap.hull ? +domStringMap.hull : undefined,
        i: domStringMap.i ? +domStringMap.i : undefined,
        all: domStringMap.all ? 1 : undefined,
        mat: domStringMap.mat,
        g: domStringMap.g ? +domStringMap.g : undefined,
        n: domStringMap.n ? +domStringMap.n : undefined,
      });
      break;
    case 'rename':
      send({ t: 'rename', name: elementById2('rename').value });
      break;
    case 'off':
      send({
        t: 'officer',
        op: domStringMap.op,
        id: domStringMap.id,
        oid: domStringMap.oid
          ? isNaN(+domStringMap.oid)
            ? domStringMap.oid
            : +domStringMap.oid
          : undefined,
        slot: domStringMap.slot,
      });
      break;
    case 'bm':
      send({ t: 'bm', id: domStringMap.id });
      break; // 1.2
    case 'promote':
      send({ t: 'promote', id: isNaN(+domStringMap.id!) ? domStringMap.id : +domStringMap.id! });
      break;
    case 'lower': {
      const htmlSelectElement = document.querySelector<HTMLSelectElement>(
        `[data-lowersel="${domStringMap.i}"]`,
      );
      send({
        t: 'lower',
        op: domStringMap.op,
        i: +domStringMap.i!,
        kind: htmlSelectElement ? htmlSelectElement.value : undefined,
      });
      break;
    }
    case 'bank': {
      const value2 = +((elementById('bankamt') || {}).value || 0);
      send({
        t: 'bank',
        op: domStringMap.op === 'payall' ? 'pay' : domStringMap.op,
        amt: domStringMap.op === 'payall' ? 1e12 : value2,
      });
      break;
    }
    case 'arcopen': {
      const options = (clientGameState.landed!.arcs || []).find(
        (positionX) => positionX.fac === domStringMap.f,
      );
      if (options)
        window.dispatchEvent(
          new CustomEvent('rift-story', {
            detail: {
              arc: options.fac,
              id: options.fac,
              title: options.title,
              tag: `${FACTIONS[options.fac].name.toUpperCase()} · ${options.arc}`,
              text: options.text,
              acc: 'Accept',
              ref: 'Not now',
            },
          }),
        );
      break;
    }
    case 'sh': {
      const message = {
        t: 'shuttle',
        op: domStringMap.op,
        sid: domStringMap.sid ? +domStringMap.sid : undefined,
        kind: domStringMap.kind,
        job: domStringMap.job,
      };
      if (domStringMap.op === 'send') {
        const htmlSelectElement = document.querySelector<HTMLSelectElement>(
          `select[data-job="${domStringMap.job}"]`,
        );
        message.sid = htmlSelectElement ? +htmlSelectElement.value : undefined;
      }
      if (domStringMap.op === 'scrap') {
        ask('Scrap this shuttle for 30% of its price?', () => send(message));
        break;
      }
      send(message);
      break;
    }
    case 'dock':
      if (domStringMap.op === 'sell') {
        const storedShip = domStringMap.uid
            ? clientGameState.you!.dock.find(
                (storedShip) => storedShip.ship.uid === domStringMap.uid,
              )
            : clientGameState.you!.dock[+domStringMap.i!],
          allOutfits2 = allOutfits(clientGameState.A!);
        let value = (clientGameState.A!.ships[storedShip!.ship.hull].cost || 0) * 0.5;
        for (const [identifier, count] of Object.entries(storedShip!.ship.outfits || {}))
          value += (allOutfits2[identifier] ? allOutfits2[identifier].cost : 0) * count * 0.5;
        ask(
          `Sell the stored ${clientGameState.A!.ships[storedShip!.ship.hull].name} and its outfits for ${credits(Math.round(value))} credits?`,
          () =>
            send({
              t: 'dock',
              op: domStringMap.op,
              i: +domStringMap.i!,
              uid: domStringMap.uid || undefined,
            }),
        );
        break;
      }
      send({
        t: 'dock',
        op: domStringMap.op,
        i: +domStringMap.i!,
        uid: domStringMap.uid || undefined,
      });
      break;
    case 'goal':
      send({ t: 'goal', period: domStringMap.p as 'daily' | 'weekly', i: +domStringMap.i! });
      break;
    case 'plotto':
      plot(domStringMap.sys);
      break;
    case 'buystore':
      send({ t: 'store', id: domStringMap.id, fac: domStringMap.f });
      break;
    case 'stores':
      openStores();
      break;
    case 'storyopen': {
      const story2 = clientGameState.landed!.story;
      if (story2)
        window.dispatchEvent(
          new CustomEvent('rift-story', {
            detail: { id: story2.id, title: story2.title, text: story2.text, acc: story2.acc },
          }),
        );
      break;
    }
    case 'holdout':
      ask('Start a Holdout? You launch to defend your station against ten waves.', () =>
        send({ t: 'holdout' }),
      );
      break;
    case 'sfac':
      clientGameState.storeFac = domStringMap.f;
      openStores();
      break;
    case 'sclose':
      elementById2('storebox').classList.add('hidden');
      break;
    case 'col':
      {
        const navigate = () =>
          send({
            t: 'colony',
            op: domStringMap.op,
            kind: domStringMap.kind,
            i: domStringMap.i !== undefined ? +domStringMap.i : undefined,
          });
        if (domStringMap.op === 'abandon')
          ask('Abandon this colony and everything on it?', navigate);
        else navigate();
      }
      break;
    case 'arena':
      send({ t: 'arena', op: domStringMap.op, mode: domStringMap.mode });
      break;
    case 'xplace': {
      const [entryKey, firstValue, secondValue] = elementById2('xitem').value.split(':');
      send({
        t: 'exchange',
        op: 'place',
        side: elementById2('xside').value,
        kind: entryKey,
        mat: entryKey === 'mat' ? firstValue : undefined,
        grade: entryKey === 'mat' ? +secondValue : undefined,
        cid: entryKey === 'com' ? firstValue : undefined,
        qty: +elementById2('xqty').value,
        price: +elementById2('xprice').value,
      });
      break;
    }
    case 'xcancel':
      send({ t: 'exchange', op: 'cancel', id: +domStringMap.id! });
      break;
    case 'xcollect':
      send({ t: 'exchange', op: 'collect' });
      break;
    case 'xsend':
      ask(`Send ${elementById2('xamt').value} credits to ${elementById2('xto').value}?`, () =>
        send({
          t: 'exchange',
          op: 'transfer',
          to: elementById2('xto').value,
          n: +elementById2('xamt').value,
        }),
      );
      break;
    case 'board':
      clientGameState.boardCat = domStringMap.cat;
      send({ t: 'boards', cat: domStringMap.cat });
      renderLanded();
      break;
    case 'prof':
      send({ t: 'profile', name: domStringMap.n });
      break;
    case 'profgo':
      send({ t: 'profile', name: elementById2('profq').value });
      break;
    case 'stab':
      clientGameState.stab = domStringMap.k;
      renderLanded();
      renderStationTab();
      break;
    case 'gotodock':
      clientGameState.ltab = 'station';
      clientGameState.stab = 'docks';
      showLanded();
      break;
    case 'dockgo':
      send({ t: 'docks', op: 'activate', k: +domStringMap.k! });
      break; // 2.1
    case 'outfitterrep':
      send({ t: 'docks', op: 'outfitterRepair', uid: domStringMap.uid });
      break;
    case 'wingrep':
      send({ t: 'docks', op: 'repair', uid: domStringMap.uid });
      break; // from the no-ship notice
    case 'ocat':
      clientGameState.ocat = domStringMap.k;
      renderLanded();
      break; // 2.4
    case 'ltab':
      clientGameState.ltab = domStringMap.t!;
      clientGameState.sel = null;
      showLanded();
      break;
    case 'spec':
      send({
        t: 'spec',
        op: domStringMap.op,
        id: domStringMap.id ? +domStringMap.id : undefined,
        c: domStringMap.c,
      });
      break;
    case 'rtree':
      clientGameState.rtree = domStringMap.t;
      renderLanded();
      renderStationTab();
      break;
    case 'refineall':
      for (const mATERIALS of MATERIALS)
        for (let game = 0; game < 4; game++) {
          const count = Math.floor(clientGameState.you!.mats[mATERIALS][game] / REFINE_UP.need);
          if (count) send({ t: 'station', op: 'refine', mat: mATERIALS, g: game, n: count });
        }
      break;
  }
}

// ------------------------------------------------------------------ galaxy map overlay and routes
/**
 * Opens the full-screen galaxy map overlay, optionally centering on a given system.
 * @param focus Star system ID to center view on
 */
export function openMap(focus?: number | string): void {
  window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: 'open' }));
  elementById2('gmap').classList.remove('hidden');
  const htmlCanvasElement = elementById2('gcanvas');
  htmlCanvasElement.width = htmlCanvasElement.clientWidth;
  htmlCanvasElement.height = htmlCanvasElement.clientHeight;
  if (!clientGameState.mapView) {
    clientGameState.mapView = {
      ...mapFit(htmlCanvasElement.width, htmlCanvasElement.height),
      W: htmlCanvasElement.width,
      H: htmlCanvasElement.height,
    };
    clientGameState.mapView!.prevFit = clientGameState.mapView!.fit;
    centerOn(focus || clientGameState.sys!, 2.2);
  } else if (focus) {
    clientGameState.mapView!.k = Math.max(
      clientGameState.mapView!.k,
      clientGameState.mapView!.fit * 2.2,
    );
    centerOn(focus);
  } else drawGMap();
  requestAnimationFrame(() => {
    if (
      htmlCanvasElement.width !== htmlCanvasElement.clientWidth ||
      htmlCanvasElement.height !== htmlCanvasElement.clientHeight
    ) {
      htmlCanvasElement.width = htmlCanvasElement.clientWidth;
      htmlCanvasElement.height = htmlCanvasElement.clientHeight;
      drawGMap();
    }
  }); // re-measure once layout has settled
}
/**
 * Centers the galaxy map viewport on the specified star system coordinate.
 * @param identifier Star system ID
 * @param zoom Relative zoom factor
 */
function centerOn(identifier: number | string, zoom?: number): void {
  const starSystem = systemsById[identifier];
  if (!starSystem || !clientGameState.mapView) return;
  clientGameState.mapView!.cx = starSystem.x;
  clientGameState.mapView!.cy = starSystem.y;
  if (zoom)
    clientGameState.mapView!.k = Math.max(
      clientGameState.mapView!.k,
      clientGameState.mapView!.fit * zoom,
    );
  drawGMap();
}
/**
 * Searches systems and stellar bodies by name query and updates the search results list.
 */
function searchMap(): void {
  const toLowerCase2 = elementById2('gsearch').value.trim().toLowerCase();
  if (!toLowerCase2) {
    elementById2('gresults').innerHTML = '';
    return;
  }
  const hits = [];
  for (const starSystem of Object.values(systemsById)) {
    if (!storySystemVisible(clientGameState.you?.story?.flags, starSystem.id)) continue;
    if (starSystem.name.toLowerCase().includes(toLowerCase2))
      hits.push([starSystem.id, starSystem.name, FACTIONS[starSystem.faction].short]);
    for (const rawStellarBody of starSystem.stellars)
      if (rawStellarBody.name.toLowerCase().includes(toLowerCase2) && !rawStellarBody.site)
        hits.push([starSystem.id, rawStellarBody.name, starSystem.name]);
  }
  elementById2('gresults').innerHTML =
    hits
      .slice(0, 8)
      .map(
        ([identifier, count, subscription]) =>
          `<div class="it" data-sys="${identifier}"><b>${escapeHtml2(count)}</b> <span class="dim">${escapeHtml2(subscription)}</span></div>`,
      )
      .join('') || '<div class="dim">No match.</div>';
}
/**
 * Closes the galaxy map overlay.
 */
export function closeMap(): void {
  if (!elementById2('gmap').classList.contains('hidden'))
    window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: 'close' }));
  elementById2('gmap').classList.add('hidden');
}
// Map views
elementById2('gcid').innerHTML = COMMODITIES.filter(
  (commodityDef) => !['ore', 'gas', 'shards'].includes(commodityDef.id),
)
  .map((commodityDef) => `<option value="${commodityDef.id}">${commodityDef.name}</option>`)
  .join('');
elementById2('gcid').onchange = (event) => {
  clientGameState.mapCid = (event.target as HTMLInputElement).value;
  clientGameState.mapMode = 'trade';
  syncModes();
  drawGMap();
};
elementById2('gmodes').addEventListener('click', (pointerEvent) => {
  const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>('[data-mm]');
  if (!htmlElement) return;
  clientGameState.mapMode = htmlElement.dataset.mm!;
  syncModes();
  drawGMap();
});
/**
 * Synchronizes the visual active state of the galaxy map filter mode buttons.
 */
function syncModes(): void {
  elementById2('gmodes')
    .querySelectorAll<HTMLElement>('[data-mm]')
    .forEach((htmlElement) =>
      htmlElement.classList.toggle(
        'on',
        htmlElement.dataset.mm === (clientGameState.mapMode || 'factions'),
      ),
    );
  elementById2('gcid').classList.toggle('dimsel', clientGameState.mapMode !== 'trade');
}
/**
 * Redraws the galaxy map canvas and updates the system info tooltip/panel.
 */
function drawGMap(): void {
  const htmlCanvasElement = elementById2('gcanvas');
  galaxy(clientGameState, htmlCanvasElement.getContext('2d')!, { big: true });
  const starSystem =
    systemsById[
      (clientGameState.hoverSys ||
        (clientGameState.route && clientGameState.route[clientGameState.route.length - 1]) ||
        clientGameState.sys)!
    ];
  if (starSystem) {
    const seen =
        !clientGameState.you || (clientGameState.you!.explored || []).includes(starSystem.id),
      fields = (starSystem.fields || [])
        .map(
          (factionId) =>
            ({ ore: 'asteroid field', gas: 'gas cloud', shards: 'crystal field' })[factionId.ore],
        )
        .join(', ');
    const lawfulness =
      starSystem.danger >= 3 ? ' · <span style="color:#f77">lawless: PvP allowed</span>' : '';
    const jumps =
      clientGameState.route && clientGameState.route.includes(starSystem.id)
        ? ` · ${clientGameState.route.indexOf(starSystem.id) + 1} jump${clientGameState.route.indexOf(starSystem.id) ? 's' : ''} away`
        : '';
    let extra = ''; // what the current map view says about this system
    if (seen && clientGameState.mapMode === 'trade') {
      const captainId = clientGameState.mapCid || 'food',
        commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === captainId),
        rawStellarBodys = starSystem.stellars.filter(
          (rawStellarBody) =>
            rawStellarBody.svc && rawStellarBody.svc!.includes('T') && !rawStellarBody.site,
        );
      extra = rawStellarBodys.length
        ? `<br><span>${escapeHtml2(commodityDef!.name)}: ${rawStellarBodys
            .map((rawStellarBody) => {
              const price2 = price(rawStellarBody, captainId);
              return price2 === null
                ? ''
                : `${escapeHtml2(rawStellarBody.name)} <b class="${price2 < commodityDef!.base * 0.92 ? 'lo' : price2 > commodityDef!.base * 1.08 ? 'hi' : ''}">${price2.toLocaleString()}</b>`;
            })
            .filter(Boolean)
            .join(' · ')} <span class="dim">(average ${commodityDef!.base})</span></span>`
        : '<br><span class="dim">No market here.</span>';
    }
    if (seen && clientGameState.mapMode === 'services')
      extra = `<br><span>${
        starSystem.stellars
          .filter((rawStellarBody) => rawStellarBody.svc && /[YO]/.test(rawStellarBody.svc))
          .map(
            (rawStellarBody) =>
              `${escapeHtml2(rawStellarBody.name)}: ${[rawStellarBody.svc!.includes('Y') ? 'shipyard' : '', rawStellarBody.svc!.includes('O') ? 'outfitter' : ''].filter(Boolean).join(' + ')}`,
          )
          .join(' · ') || '<span class="dim">No shipyard or outfitter.</span>'
      }</span>`;
    if (clientGameState.mapMode === 'standing' && clientGameState.you!)
      extra = `<br><span>Your standing with ${FACTIONS[starSystem.faction].name}: <b>${clientGameState.you!.rep[starSystem.faction] || 0}</b></span>`;
    const myHome =
      clientGameState.you &&
      clientGameState.you!.station &&
      clientGameState.you!.station.claimed &&
      STELLARS[clientGameState.you!.station.site!] &&
      STELLARS[clientGameState.you!.station.site!].system === starSystem.id;
    elementById2('ginfo').innerHTML =
      `${myHome ? '<span style="color:#ffd27a">◎ YOUR STATION · </span>' : ''}<b style="color:${FACTIONS[starSystem.faction].color}">${escapeHtml2(starSystem.name)}</b> · ${FACTIONS[starSystem.faction].name}${stateOfSys(starSystem.id) ? ' · ' + stateLine(starSystem.id) : ''} · danger <span class="dgr">${Array.from({ length: 7 }, (unused, index) => `<i class="${index < starSystem.danger ? 'on' : ''}"></i>`).join('')}</span> ${starSystem.danger}${lawfulness}${jumps}${seen ? '' : ' · <i>not yet visited</i>'}${extra}<br><span class="dim">${starSystem.stellars.map((rawStellarBody) => (rawStellarBody.site ? `${rawStellarBody.name}${clientGameState.sites && clientGameState.sites[rawStellarBody.id] ? ' (' + escapeHtml2(clientGameState.sites[rawStellarBody.id].owner) + ', Station Tier ' + clientGameState.sites[rawStellarBody.id].ops + ')' : ' (unclaimed)'}` : `${rawStellarBody.name} (${[rawStellarBody.svc!.includes('Y') && 'shipyard', rawStellarBody.svc!.includes('O') && 'outfitter', rawStellarBody.svc!.includes('T') && 'market', rawStellarBody.svc!.includes('B') && 'jobs'].filter(Boolean).join(', ') || 'no services'})`)).join(' · ') || 'No inhabited worlds.'}${fields ? ' · Mining: ' + fields : ''}${(() => {
        const cargo2 = Object.keys(
            (clientGameState.you && clientGameState.you!.cargo) || {},
          ).filter((component) => clientGameState.you!.cargo[component] > 0),
          buys = cargo2.filter((component) =>
            starSystem.stellars.some((rawStellarBody) => {
              const stellarBody = STELLARS[rawStellarBody.id];
              return (
                stellarBody &&
                !stellarBody.site &&
                (stellarBody.svc || '').includes('T') &&
                price(stellarBody, component) !== null
              );
            }),
          );
        return buys.length
          ? ` · <span style="color:var(--ok)">buys your ${buys.map((component) => COMMODITIES.find((commodityDef) => commodityDef.id === component)!.name.toLowerCase()).join(', ')}</span>`
          : '';
      })()}</span>`; // 2.5.2
  }
}
/**
 * Plots a navigational jump hyperspace route to a target destination system.
 * @param destination Target star system ID
 */
export function plot(destination: number | string | undefined | null): void {
  if (destination === clientGameState.sys) {
    clientGameState.route = [];
    drawGMap();
    return;
  }
  const route2 = route(systemsById, clientGameState.sys!, destination as string);
  clientGameState.route = route2;
  drawGMap();
  drawMini();
  toast(
    `Course plotted to ${systemsById[destination!].name}: ${route2.length} jump${route2.length > 1 ? 's' : ''}. Fly clear of planets and press J.`,
  );
}
/**
 * Displays the ship destruction and insurance reconstruction notice modal.
 * @param message2 Rebuild event payload containing location and insurance fee
 */
export function showDead(message: { at: string; fee: number }): void {
  elementById2('deadmsg').textContent =
    `Your ship was destroyed. The insurers rebuilt it at ${message.at} for ${credits(message.fee)} credits. Your cargo was lost; your wingmates flew home.`;
  elementById2('deadbox').classList.remove('hidden');
}
export { escapeHtml2 as esc };
