import type { OfficerRecord } from '../shared/rules.ts';
import type { ClientGameState } from './main.ts';
export type OfficerEntry = OfficerRecord;
export type ShuttleInstance = {
  id: number | string;
  kind: string;
  state: 'idle' | 'out' | 'damaged';
  crew?: number | string | null;
  runs?: number;
  ends?: number;
  chance?: number;
  job?: { id: string; name: string; time: number };
};
export type BoardedTarget = { hull: string | number; fac: string | number; name?: string };

import { escapeHtml as escapeHtml2 } from './html.ts';
import { artworkUrl } from './artwork.ts';
// Quantum Rift: interface pieces: crew (bar, roster, bridge), hangar (shuttles, job board, drydock), research trees, boarding.
import { rankLine, lowerDeckHtml } from './syn_ui.ts';
import { SYS as systemsById, FACTIONS, MATERIALS, GRADES, RESEARCH } from '../shared/galaxy.ts';
import {
  SHUTTLES,
  SHUTTLE_JOBS,
  SHUTTLE_REPAIR,
  ROLES,
  RARITY,
  STAT_NAME,
  BRIDGE_SLOTS,
  ROSTER_MAX,
  XP_LEVEL,
  MAX_LEVEL,
  RESEARCH_TREES,
  RESEARCH_QUEUE_MAX,
  REFINE_UP,
  SYNERGY,
} from '../shared/hangar.ts';
import { officerStats, credits } from '../shared/rules.ts';

/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {Object} OfficerEntry
 * @property {number|string} id Unique officer ID
 * @property {string} name Officer name
 * @property {string} race Faction / race identifier
 * @property {string} role Role key (e.g. 'pilot', 'engineer')
 * @property {number} rarity Rarity index (0..4)
 * @property {number} lv Officer level
 * @property {number} [xp] Current experience points
 * @property {number} [cost] Credit hiring cost
 */

/**
 * @typedef {Object} ShuttleInstance
 * @property {number|string} id Shuttle instance ID
 * @property {string} kind Shuttle model key
 * @property {'idle'|'out'|'damaged'} state Current shuttle status
 * @property {number|string|null} [crew] Assigned officer ID
 * @property {number} [runs] Number of completed runs
 * @property {number} [ends] Timestamp when current job finishes
 * @property {number} [chance] Success probability (0..1)
 * @property {{id: string, name: string, time: number}} [job] Active job details
 */

/**
 * @typedef {Object} BoardedTarget
 * @property {string} hull Hull identifier
 * @property {string|number} fac Faction index or identifier
 * @property {string} [name] Custom target name
 */

/**
 * Formats duration in milliseconds to whole minutes or hours + minutes.
 * @param {number} milliseconds Duration in milliseconds
 * @returns {string} Formatted duration string
 */
const minutes2 = (milliseconds: number): string => {
  const message = Math.max(0, Math.ceil(milliseconds / 60000));
  return message >= 60 ? `${Math.floor(message / 60)}h ${message % 60}m` : `${message}m`;
};
const SLOT_NAME: Record<string, string> = {
  captain: 'Captain',
  bridge1: 'Bridge',
  bridge2: 'Bridge',
};

/**
 * Formats an officer's passive stat bonuses into readable text.
 * @param {OfficerEntry} officerRecord Officer object
 * @returns {string} Formatted stat bonus text
 */
function statText(officerRecord: OfficerEntry): string {
  return Object.entries(officerStats(officerRecord))
    .map(([entryKey, value]) => `+${value}${entryKey === 'fuel' ? '' : '%'} ${STAT_NAME[entryKey]}`)
    .join(', ');
}

/**
 * Renders an officer card with rarity color, stats, level, and optional actions.
 * @param {ClientGameState} clientGameState Game state object
 * @param {OfficerEntry} officerRecord Officer object
 * @param {string} [extra] Additional HTML content or buttons
 * @returns {string} HTML markup
 */
function officerCard(
  clientGameState: ClientGameState,
  officerRecord: OfficerEntry,
  extra?: string,
): string {
  const officerRarity = RARITY[officerRecord.rarity],
    factionDef = FACTIONS[officerRecord.race!];
  return `<div class="ocard" style="border-color:${officerRarity.color}55"><div class="oname"><b style="color:${officerRarity.color}">${escapeHtml2(officerRecord.name)}</b> <span class="dim small">${officerRarity.name} ${ROLES[officerRecord.role].name} · <span style="color:${factionDef.color}">${factionDef.short}</span> · Lv ${officerRecord.lv}</span></div>
    <div class="small">${statText(officerRecord)}</div>${officerRecord.xp !== undefined && officerRecord.lv < MAX_LEVEL && officerRecord.id !== undefined && typeof officerRecord.id === 'number' ? `<div class="xpbar"><i style="width:${Math.min(100, (100 * officerRecord.xp) / XP_LEVEL(officerRecord.lv))}%"></i></div>` : ''}${extra || ''}</div>`;
}

/**
 * Determines current assignment location or shuttle duty for an officer.
 * @param {ClientGameState} clientGameState Game state object
 * @param {OfficerEntry} officerRecord Officer object
 * @returns {string|null} Assignment description or null if off duty
 */
function where(clientGameState: ClientGameState, officerRecord: OfficerEntry): string | null {
  const playerPayload = clientGameState.you!;
  for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
    if (playerPayload.bridge[bRIDGE_SLOTS] === officerRecord.id) return SLOT_NAME[bRIDGE_SLOTS];
  const savedShuttle = playerPayload.shuttles.find(
    (savedShuttle) => savedShuttle.crew === officerRecord.id,
  );
  if (savedShuttle)
    return `${SHUTTLES[savedShuttle.kind].name}${savedShuttle.state === 'out' ? ' (out)' : ''}`;
  return null;
}

// ------------------------------------------------------------------ CREW tab (any landing): bar + roster + bridge

/**
 * Renders the CREW tab interface (bridge officers, species synergy, bar hires, roster, lower deck).
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function crewHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length2 = clientGameState.landed!;
  let height = '<div class="sect" style="margin-top:0">YOUR BRIDGE</div><div class="bridge">';
  for (const bRIDGE_SLOTS of BRIDGE_SLOTS) {
    const officer = playerPayload.officers.find(
      (officerRecord) => officerRecord.id === playerPayload.bridge[bRIDGE_SLOTS],
    );
    height += `<div class="slot"><div class="dim small">${bRIDGE_SLOTS === 'captain' ? 'CAPTAIN (x1.25)' : 'BRIDGE OFFICER'}</div>${officer ? officerCard(clientGameState, officer, `<button class="btn sm" data-act="off" data-op="assign" data-oid="${officer.id}" data-slot="">STAND DOWN</button>`) : '<div class="dim">Empty</div>'}</div>`;
  }
  height += '</div>';
  const races: Record<string, number> = {};
  for (const bRIDGE_SLOTS of BRIDGE_SLOTS) {
    const officer = playerPayload.officers.find(
      (officerRecord) => officerRecord.id === playerPayload.bridge[bRIDGE_SLOTS],
    );
    if (officer) races[officer.race!] = (races[officer.race!] || 0) + 1;
  }
  const synergies = Object.entries(races).filter(
    ([radius, count]) => count >= 2 && SYNERGY[radius],
  );
  height += `<div class="dim small">Two or more officers of one race on the bridge unlock a synergy bonus.${
    synergies.length
      ? ' Active: ' +
        synergies
          .map(
            ([radius]) =>
              `<b style="color:${FACTIONS[radius].color}">${FACTIONS[radius].short}</b> (${Object.entries(
                SYNERGY[radius],
              )
                .map(
                  ([entryKey, value]) =>
                    `+${value}${entryKey === 'fuel' ? '' : '%'} ${STAT_NAME[entryKey]}`,
                )
                .join(', ')})`,
          )
          .join(', ')
      : ''
  }</div>`;
  if (length2 && length2.bar && length2.bar.length) {
    height +=
      `<div class="sect">THE BAR: OFFICERS LOOKING FOR A BERTH</div><div class="ogrid">` +
      length2.bar
        .map((barOfficer) =>
          officerCard(
            clientGameState,
            barOfficer,
            `<div class="kv"><span class="cr">${credits(barOfficer.cost)} cr</span><button class="btn sm" data-act="off" data-op="hire" data-id="${barOfficer.id}">HIRE</button></div>`,
          ),
        )
        .join('') +
      '</div><div class="dim small">New faces arrive every hour.</div>';
  }
  height += `<div class="sect">ROSTER (${playerPayload.officers.length}/${ROSTER_MAX})</div>`;
  if (!playerPayload.officers.length)
    height += '<p class="dim">No officers yet. Hire them at bars on inhabited worlds.</p>';
  height +=
    '<div class="ogrid">' +
    playerPayload.officers
      .map((officer) => {
        const where2 = where(clientGameState, officer),
          result = where2 && where2.endsWith('(out)');
        const buttons = result
          ? ''
          : BRIDGE_SLOTS.filter((entryKey) => playerPayload.bridge[entryKey] !== officer.id)
              .map(
                (entryKey) =>
                  `<button class="btn sm" data-act="off" data-op="assign" data-oid="${officer.id}" data-slot="${entryKey}">${entryKey === 'captain' ? 'CAPTAIN' : entryKey === 'bridge1' ? 'BRIDGE 1' : 'BRIDGE 2'}</button>`,
              )
              .join(' ') +
            ` <button class="btn sm" data-act="off" data-op="dismiss" data-oid="${officer.id}">DISMISS</button>`;
        return officerCard(
          clientGameState,
          officer,
          `${rankLine(clientGameState, officer, true)}<div class="dim small">${where2 ? 'Serving: ' + escapeHtml2(where2) : 'Off duty'}</div><div>${buttons}</div>`,
        );
      })
      .join('') +
    '</div>';
  height += lowerDeckHtml(clientGameState); // 1.2
  return height;
}

// ------------------------------------------------------------------ HANGAR: shuttles + job board (remote: send and track) + drydock (at the station)

/**
 * Renders compact sidebar shuttle activity status list.
 * @param {ClientGameState} clientGameState Game state object
 * @returns {string} HTML markup
 */
export function shuttleSummary(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    currentTime = Date.now();
  if (!playerPayload.shuttles.length) return '';
  return (
    '<div class="sect">SHUTTLES</div>' +
    playerPayload.shuttles
      .map((savedShuttle) => {
        const shuttleCraft = SHUTTLES[savedShuttle.kind];
        const state2 =
          savedShuttle.state === 'out'
            ? `<span style="color:#7ad0ff">${escapeHtml2(savedShuttle.job!.title)} · back in ${minutes2(savedShuttle.ends! - currentTime)}</span>`
            : savedShuttle.state === 'damaged'
              ? '<span style="color:#ff9a8a">damaged</span>'
              : '<span style="color:var(--ok)">ready</span>';
        return `<div class="kv"><span>${escapeHtml2(shuttleCraft.name)}</span><span class="small">${state2}</span></div>`;
      })
      .join('')
  );
}

/**
 * Renders the Hangar interface including active shuttles, shuttle construction, and the remote Job Board.
 * @param {ClientGameState} clientGameState Game state object
 * @param {boolean} atHome Whether player is currently docked at their Personal Station
 * @returns {string} HTML markup
 */
export function hangarHtml(clientGameState: ClientGameState, atHome: boolean): string {
  const playerPayload = clientGameState.you!,
    currentTime = Date.now(),
    stationState = playerPayload.station;
  if (!stationState.site)
    return '<p class="dim">Claim a station hull first. Its hangar launches shuttles on jobs while you fly.</p>';
  let height = `<div class="sect" style="margin-top:0">HANGAR BAYS (${playerPayload.shuttles.length}/${playerPayload.bays})</div>`;
  if (!playerPayload.bays) height += '<p class="dim">The hangar opens at Station Tier 2.</p>';
  const idle = playerPayload.shuttles.filter((savedShuttle) => savedShuttle.state === 'idle'),
    _crewFree = playerPayload.officers.filter(
      (officer) =>
        !where(clientGameState, officer) ||
        playerPayload.shuttles.some(
          (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state !== 'out',
        ),
    );
  height +=
    '<div class="ogrid">' +
    playerPayload.shuttles
      .map((savedShuttle) => {
        const shuttleCraft = SHUTTLES[savedShuttle.kind],
          crew = savedShuttle.crew
            ? playerPayload.officers.find((officer) => officer.id === savedShuttle.crew)
            : null;
        let body;
        if (savedShuttle.state === 'out') {
          const total = Math.max(
              1,
              savedShuttle.ends! - (savedShuttle.ends! - savedShuttle.job!.minutes * 60000),
            ),
            percentage = Math.max(
              0,
              Math.min(100, 100 - (100 * (savedShuttle.ends! - currentTime)) / total),
            );
          body = `<div class="small" style="color:#7ad0ff">${escapeHtml2(savedShuttle.job!.title)}</div><div class="xpbar"><i style="width:${percentage}%;background:#7ad0ff"></i></div><div class="dim small">Back in ${minutes2(savedShuttle.ends! - currentTime)} · ${Math.round(savedShuttle.chance! * 100)}% odds</div>`;
        } else if (savedShuttle.state === 'damaged')
          body = `<div class="small" style="color:#ff9a8a">Damaged</div>${atHome ? `<button class="btn sm" data-act="sh" data-op="repair" data-sid="${savedShuttle.id}">REPAIR ${credits(Math.round(shuttleCraft.cost * SHUTTLE_REPAIR))}</button>` : '<div class="dim small">Repair at your station.</div>'}`;
        else
          body = `<div class="small" style="color:var(--ok)">Ready</div><div class="rrow"><select data-crew="${savedShuttle.id}"><option value="">No crew</option>${playerPayload.officers
            .filter(
              (officer) =>
                !playerPayload.shuttles.some(
                  (savedShuttle2) =>
                    savedShuttle2.crew === officer.id &&
                    savedShuttle2 !== savedShuttle &&
                    savedShuttle2.state === 'out',
                ),
            )
            .map(
              (officer) =>
                `<option value="${officer.id}" ${officer.id === savedShuttle.crew ? 'selected' : ''}>${escapeHtml2(officer.name)} (${ROLES[officer.role].name} ${officer.lv})</option>`,
            )
            .join('')}</select></div>`;
        return `<div class="ocard"><div class="oname"><img src="${artworkUrl(clientGameState.A!.ships[shuttleCraft.hull].img!)}" style="width:44px;height:30px;object-fit:contain;vertical-align:middle"> <b>${escapeHtml2(shuttleCraft.name)}</b> <span class="dim small">${savedShuttle.runs} runs</span></div>${crew && savedShuttle.state !== 'idle' ? `<div class="dim small">Crew: ${escapeHtml2(crew.name)}</div>` : ''}${body}${atHome && savedShuttle.state !== 'out' ? ` <button class="btn sm" data-act="sh" data-op="scrap" data-sid="${savedShuttle.id}">SCRAP</button>` : ''}</div>`;
      })
      .join('') +
    '</div>';
  if (atHome && playerPayload.shuttles.length < playerPayload.bays) {
    height +=
      '<div class="sect">BUILD A SHUTTLE</div>' +
      Object.entries(SHUTTLES)
        .map(
          ([entryKey, shuttleCraft]) =>
            `<div class="kv"><span><b>${escapeHtml2(shuttleCraft.name)}</b> <span class="dim small">${escapeHtml2(shuttleCraft.desc)}</span></span><span class="small">${stationState.ops >= shuttleCraft.ops ? `${credits(shuttleCraft.cost)} + ${shuttleCraft.mats.map(([message, game]) => `<span style="color:${playerPayload.mats[message][game] >= 1 ? '#8ff0ad' : '#ff9a8a'}">${message} ${GRADES[game]}</span>`).join(', ')} <button class="btn sm" data-act="sh" data-op="build" data-kind="${entryKey}">BUILD</button>` : `<span class="dim">Station Tier ${shuttleCraft.ops}</span>`}</span></div>`,
        )
        .join('');
  }
  // job board
  height += `<div class="sect">HANGAR JOB BOARD</div><div class="dim small">Jobs run in real time, even while you are offline. A shuttle suited to the job and a crew officer (scouts best) raise the odds. Dangerous systems pay more and can cost you the shuttle.</div>`;
  height +=
    playerPayload.board
      .map((shuttleJob) => {
        const shuttleJobType = SHUTTLE_JOBS[shuttleJob.kind],
          starSystem = systemsById[shuttleJob.sys],
          shuttleReward = shuttleJob.reward!;
        const join3 = [
          shuttleReward.credits ? credits(shuttleReward.credits) + ' cr' : '',
          ...(shuttleReward.mats || []).map(
            ([message, game, count]) => `${count} ${message} ${GRADES[game]}`,
          ),
          shuttleReward.rep
            ? `+${shuttleReward.rep[1]} ${FACTIONS[shuttleReward.rep[0]].short}`
            : '',
          shuttleReward.chart ? 'chart the system' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const join2 = idle
          .map(
            (savedShuttle) =>
              `<option value="${savedShuttle.id}" ${SHUTTLES[savedShuttle.kind] && shuttleJobType.fit === savedShuttle.kind ? 'selected' : ''}>${escapeHtml2(SHUTTLES[savedShuttle.kind].name)}${shuttleJobType.fit === savedShuttle.kind ? ' ★' : ''}</option>`,
          )
          .join('');
        return `<div class="card" style="cursor:default"><div class="t">${escapeHtml2(shuttleJob.title)}</div><div class="dim small">${shuttleJobType.name} · ${escapeHtml2(starSystem.name)} (${FACTIONS[starSystem.faction].short}) · ${shuttleJob.jumps} jumps · danger ${shuttleJob.danger} · ~${minutes2(shuttleJob.minutes * 60000)} · best: ${SHUTTLES[shuttleJobType.fit].name}</div><div class="p">${join3}</div>
      ${join2 ? `<div class="rrow"><select data-job="${shuttleJob.id}">${join2}</select><button class="btn sm" data-act="sh" data-op="send" data-job="${shuttleJob.id}">LAUNCH</button></div>` : ''}</div>`;
      })
      .join('') || '<p class="dim">No jobs posted. The board refreshes every three hours.</p>';
  return height;
}

// ------------------------------------------------------------------ research trees with a queue

/**
 * Renders the Research Lab tech trees, active research countdown, and research queue.
 * @param {ClientGameState} clientGameState Game state object
 * @param {boolean} [interactive] Whether research actions are enabled
 * @returns {string} HTML markup
 */
export function researchHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    stationState = playerPayload.station,
    currentTime = Date.now(),
    quantity = stationState.queue || [];
  let height = '<div class="sect">RESEARCH LAB</div>';
  if (stationState.active) {
    const researchNode = RESEARCH.find(
      (researchNode) => researchNode.id === stationState.active!.id,
    )!;
    height += `<div class="kv"><span>In progress</span><span><b>${escapeHtml2(researchNode.name)}</b> · ${minutes2(stationState.active.ends - currentTime)}</span></div>`;
  }
  if (quantity.length)
    height += `<div class="kv"><span>Queue (${quantity.length}/${RESEARCH_QUEUE_MAX})${stationState.waiting ? ' <span style="color:#ff9a8a">waiting for resources</span>' : ''}</span><span class="small">${quantity.map((identifier) => `${escapeHtml2(RESEARCH.find((researchNode) => researchNode.id === identifier)!.name)}${interactive ? ` <a href="#" data-act="st" data-op="unqueue" data-id="${identifier}" title="Remove">✕</a>` : ''}`).join(' → ')}</span></div>`;
  clientGameState.rtree = clientGameState.rtree || 'Combat';
  height += `<div class="chips">${RESEARCH_TREES.map((time) => `<span class="chip ${time === clientGameState.rtree ? 'on' : ''}" data-act="rtree" data-t="${time}">${time.toUpperCase()} ${RESEARCH.filter((researchNode) => researchNode.tree === time && stationState.done.includes(researchNode.id)).length}/${RESEARCH.filter((researchNode) => researchNode.tree === time).length}</span>`).join('')}</div>`;
  for (const researchNode of RESEARCH.filter(
    (researchNode3) => researchNode3.tree === clientGameState.rtree,
  )) {
    const done = stationState.done.includes(researchNode.id),
      queued =
        quantity.includes(researchNode.id) ||
        (stationState.active && stationState.active.id === researchNode.id),
      available = !done && stationState.ops >= researchNode.ops;
    const join2 = Object.entries(researchNode.bonus)
      .map(([entryKey, value]) => `${entryKey}+${value}`)
      .join(' ');
    height += `<div class="kv"><span style="color:${done ? '#8ff0ad' : available ? '#ddd' : '#555'}">${done ? '✓ ' : ''}${escapeHtml2(researchNode.name)}${researchNode.needs ? ` <span class="dim small">after ${escapeHtml2(RESEARCH.find((researchNode3) => researchNode3.id === researchNode.needs)!.name)}</span>` : ''}<div class="dim small">${escapeHtml2(join2)}</div></span><span class="small">${done ? 'done' : queued ? 'queued' : available ? `${credits(researchNode.cost)} + ${researchNode.mats.map(([message, game]) => message + ' ' + GRADES[game]).join(', ')} · ${researchNode.minutes}m ${interactive ? `<button class="btn sm" data-act="st" data-op="research" data-id="${researchNode.id}">${stationState.active || (researchNode.needs && !stationState.done.includes(researchNode.needs)) ? 'QUEUE' : 'START'}</button>` : ''}` : `Station Tier ${researchNode.ops}`}</span></div>`;
  }
  return height;
}

/**
 * Renders the Material crates inventory grid and crate refinement actions.
 * @param {ClientGameState} clientGameState Game state object
 * @param {boolean} [interactive] Whether refining actions are interactive
 * @returns {string} HTML markup
 */
export function materialsHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!;
  let height = `<div class="sect">MATERIALS</div><table class="tbl"><tr><th></th>${GRADES.map((game) => `<th>${game}</th>`).join('')}</tr>${MATERIALS.map((message) => `<tr><td>${message}</td>${playerPayload.mats[message].map((count, game) => `<td style="color:${count ? '#fff' : '#444'}">${count}${interactive && game < 4 && count >= REFINE_UP.need ? ` <a href="#" class="small" data-act="st" data-op="refine" data-mat="${message}" data-g="${game}" data-n="1" title="Refine ${REFINE_UP.need} into one grade ${GRADES[game + 1]} (${credits(REFINE_UP.cost[game])} cr)">▲</a>` : ''}</td>`).join('')}</tr>`).join('')}</table>`;
  if (interactive)
    height += `<div class="dim small">▲ refines ${REFINE_UP.need} crates into one of the next grade. <a href="#" data-act="refineall">Refine all</a></div>`;
  return height;
}

// ------------------------------------------------------------------ boarding dialog

/**
 * Renders the modal dialog for boarding a disabled ship (plunder, capture, rescue/arrest).
 * @param {ClientGameState} clientGameState Game state object
 * @param {BoardedTarget} boardedTarget Target ship entity
 * @returns {string} HTML markup
 */
export function boardHtml(clientGameState: ClientGameState, boardedTarget: BoardedTarget): string {
  const shipHullAsset = clientGameState.A!.ships[boardedTarget.hull],
    factionDef = FACTIONS[clientGameState.FAC[boardedTarget.fac as number]],
    lawful =
      factionDef &&
      !factionDef.pirate &&
      clientGameState.FAC[boardedTarget.fac as number] !== 'umbral';
  const crew = BRIDGE_SLOTS.filter((entryKey) => clientGameState.you!.bridge[entryKey]).length;
  return `<h2>BOARDING: ${escapeHtml2(boardedTarget.name || shipHullAsset.name)}</h2><p class="dim">${escapeHtml2(shipHullAsset.name)} · ${factionDef ? factionDef.name : ''} · disabled and drifting</p>
    <div class="bopts"><button class="btn" data-board="plunder">1 · PLUNDER<br><span class="small">credits, cargo, maybe a crate${lawful ? ' · standing -8' : ''}</span></button>
    <button class="btn" data-board="capture" ${crew ? '' : 'disabled'}>2 · CAPTURE<br><span class="small">${crew ? `prize crew of ${crew} officer${crew > 1 ? 's' : ''} · to your drydock${lawful ? ' · standing -15' : ''}` : 'needs an officer on the bridge'}</span></button>
    <button class="btn" data-board="rescue">3 · ${lawful ? 'RESCUE' : 'ARREST'}<br><span class="small">${lawful ? 'standing +6 and a reward' : 'a Concord reward'}</span></button></div>
    <button class="btn sm" data-board="">CANCEL (Esc)</button>`;
}
