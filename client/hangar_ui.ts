import { legacyHtml } from './eta-runtime.ts';
import {
  renderHangarUiOfficerCardFragment001,
  renderHangarUiOfficerCardFragment002,
  renderHangarUiCrewHtmlFragment003,
  renderHangarUiCrewHtmlFragment004,
  renderHangarUiCrewHtmlFragment005,
  renderHangarUiCrewHtmlFragment006,
  renderHangarUiCrewHtmlFragment007,
  renderHangarUiCrewHtmlFragment008,
  renderHangarUiCrewHtmlFragment009,
  renderHangarUiCrewHtmlFragment010,
  renderHangarUiCrewHtmlFragment011,
  renderHangarUiCrewHtmlFragment012,
  renderHangarUiCrewHtmlFragment013,
  renderHangarUiCrewHtmlFragment014,
  renderHangarUiCrewHtmlFragment015,
  renderHangarUiCrewHtmlFragment016,
  renderHangarUiCrewHtmlFragment017,
  renderHangarUiCrewHtmlFragment018,
  renderHangarUiCrewHtmlFragment019,
  renderHangarUiShuttleSummaryFragment020,
  renderHangarUiShuttleSummaryFragment021,
  renderHangarUiShuttleSummaryFragment022,
  renderHangarUiShuttleSummaryFragment023,
  renderHangarUiShuttleSummaryFragment024,
  renderHangarUiHangarHtmlFragment025,
  renderHangarUiHangarHtmlFragment026,
  renderHangarUiHangarHtmlFragment027,
  renderHangarUiHangarHtmlFragment028,
  renderHangarUiHangarHtmlFragment029,
  renderHangarUiHangarHtmlFragment030,
  renderHangarUiHangarHtmlFragment031,
  renderHangarUiHangarHtmlFragment032,
  renderHangarUiHangarHtmlFragment033,
  renderHangarUiHangarHtmlFragment034,
  renderHangarUiHangarHtmlFragment035,
  renderHangarUiHangarHtmlFragment036,
  renderHangarUiHangarHtmlFragment037,
  renderHangarUiHangarHtmlFragment038,
  renderHangarUiHangarHtmlFragment039,
  renderHangarUiHangarHtmlFragment040,
  renderHangarUiHangarHtmlFragment041,
  renderHangarUiHangarHtmlFragment042,
  renderHangarUiHangarHtmlFragment043,
  renderHangarUiHangarHtmlFragment044,
  renderHangarUiHangarHtmlFragment045,
  renderHangarUiHangarHtmlFragment046,
  renderHangarUiHangarHtmlFragment047,
  renderHangarUiHangarHtmlFragment048,
  renderHangarUiResearchHtmlFragment049,
  renderHangarUiResearchHtmlFragment050,
  renderHangarUiResearchHtmlFragment051,
  renderHangarUiResearchHtmlFragment052,
  renderHangarUiResearchHtmlFragment053,
  renderHangarUiResearchHtmlFragment054,
  renderHangarUiResearchHtmlFragment055,
  renderHangarUiResearchHtmlFragment056,
  renderHangarUiResearchHtmlFragment057,
  renderHangarUiResearchHtmlFragment058,
  renderHangarUiMaterialsHtmlFragment059,
  renderHangarUiMaterialsHtmlFragment060,
  renderHangarUiMaterialsHtmlFragment061,
  renderHangarUiMaterialsHtmlFragment062,
  renderHangarUiMaterialsHtmlFragment063,
  renderHangarUiMaterialsHtmlFragment064,
  renderHangarUiBoardHtmlFragment065,
} from './eta-templates.ts';
import type { OfficerRecord } from '../shared/rules.ts';
import type { ClientGameState } from './main.ts';
export type OfficerEntry = OfficerRecord;
export type ShuttleInstance = {
  /** Shuttle instance ID */
  id: number | string;

  /** Shuttle model key */
  kind: string;

  /** Current shuttle status */
  state: 'idle' | 'out' | 'damaged';

  /** Assigned officer ID */
  crew?: number | string | null;

  /** Number of completed runs */
  runs?: number;

  /** Timestamp when current job finishes */
  ends?: number;

  /** Success probability (0..1) */
  chance?: number;

  /** Active job details */
  job?: { id: string; name: string; time: number };
};
export type BoardedTarget = {
  /** Hull identifier */
  hull: string | number;
  /** Faction index or identifier */
  fac: string | number;
  /** Custom target name */
  name?: string;
};

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

/**
 * Formats duration in milliseconds to whole minutes or hours + minutes.
 * @param milliseconds Duration in milliseconds
 * @returns Formatted duration string
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
 * @param officerRecord Officer object
 * @returns Formatted stat bonus text
 */
function statText(officerRecord: OfficerEntry): string {
  return Object.entries(officerStats(officerRecord))
    .map(([entryKey, value]) => `+${value}${entryKey === 'fuel' ? '' : '%'} ${STAT_NAME[entryKey]}`)
    .join(', ');
}

/**
 * Renders an officer card with rarity color, stats, level, and optional actions.
 * @param clientGameState Game state object
 * @param officerRecord Officer object
 * @param extra Additional HTML content or buttons
 * @returns HTML markup
 */
function officerCard(
  clientGameState: ClientGameState,
  officerRecord: OfficerEntry,
  extra?: string,
): string {
  const officerRarity = RARITY[officerRecord.rarity],
    factionDef = FACTIONS[officerRecord.race!];
  return renderHangarUiOfficerCardFragment001({
    officerRarityColor: legacyHtml(officerRarity.color),
    officerRarityColor2: legacyHtml(officerRarity.color),
    officerRecordName: officerRecord.name,
    officerRarityName: legacyHtml(officerRarity.name),
    ROLES: legacyHtml(ROLES[officerRecord.role].name),
    factionDefColor: legacyHtml(factionDef.color),
    factionDefShort: legacyHtml(factionDef.short),
    officerRecordLv: legacyHtml(officerRecord.lv),
    statText: legacyHtml(statText(officerRecord)),
    officerRecordXp: legacyHtml(
      officerRecord.xp !== undefined &&
        officerRecord.lv < MAX_LEVEL &&
        officerRecord.id !== undefined &&
        typeof officerRecord.id === 'number'
        ? renderHangarUiOfficerCardFragment002({
            MathMin: legacyHtml(
              Math.min(100, (100 * officerRecord.xp) / XP_LEVEL(officerRecord.lv)),
            ),
          })
        : '',
    ),
    extra: legacyHtml(extra || ''),
  });
}

/**
 * Determines current assignment location or shuttle duty for an officer.
 * @param clientGameState Game state object
 * @param officerRecord Officer object
 * @returns Assignment description or null if off duty
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
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function crewHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length2 = clientGameState.landed!;
  let height = renderHangarUiCrewHtmlFragment003();
  for (const bRIDGE_SLOTS of BRIDGE_SLOTS) {
    const officer = playerPayload.officers.find(
      (officerRecord) => officerRecord.id === playerPayload.bridge[bRIDGE_SLOTS],
    );
    height += renderHangarUiCrewHtmlFragment004({
      bRIDGE_SLOTS: legacyHtml(bRIDGE_SLOTS === 'captain' ? 'CAPTAIN (x1.25)' : 'BRIDGE OFFICER'),
      officer: legacyHtml(
        officer
          ? officerCard(
              clientGameState,
              officer,
              renderHangarUiCrewHtmlFragment005({ officerId: legacyHtml(officer.id) }),
            )
          : renderHangarUiCrewHtmlFragment006(),
      ),
    });
  }
  height += renderHangarUiCrewHtmlFragment007();
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
  height += renderHangarUiCrewHtmlFragment008({
    synergiesLength: legacyHtml(
      synergies.length
        ? ' Active: ' +
            synergies
              .map(([radius]) =>
                renderHangarUiCrewHtmlFragment009({
                  FACTIONS: legacyHtml(FACTIONS[radius].color),
                  FACTIONS2: legacyHtml(FACTIONS[radius].short),
                  ObjectEntries: legacyHtml(
                    Object.entries(SYNERGY[radius])
                      .map(
                        ([entryKey, value]) =>
                          `+${value}${entryKey === 'fuel' ? '' : '%'} ${STAT_NAME[entryKey]}`,
                      )
                      .join(', '),
                  ),
                }),
              )
              .join(', ')
        : '',
    ),
  });
  if (length2 && length2.bar && length2.bar.length) {
    height +=
      renderHangarUiCrewHtmlFragment010() +
      length2.bar
        .map((barOfficer) =>
          officerCard(
            clientGameState,
            barOfficer,
            renderHangarUiCrewHtmlFragment011({
              credits: legacyHtml(credits(barOfficer.cost)),
              barOfficerId: legacyHtml(barOfficer.id),
            }),
          ),
        )
        .join('') +
      renderHangarUiCrewHtmlFragment012();
  }
  height += renderHangarUiCrewHtmlFragment013({
    playerPayloadOfficersLength: legacyHtml(playerPayload.officers.length),
    ROSTER_MAX: legacyHtml(ROSTER_MAX),
  });
  if (!playerPayload.officers.length) height += renderHangarUiCrewHtmlFragment014();
  height +=
    renderHangarUiCrewHtmlFragment015() +
    playerPayload.officers
      .map((officer) => {
        const where2 = where(clientGameState, officer),
          result = where2 && where2.endsWith('(out)');
        const buttons = result
          ? ''
          : BRIDGE_SLOTS.filter((entryKey) => playerPayload.bridge[entryKey] !== officer.id)
              .map((entryKey) =>
                renderHangarUiCrewHtmlFragment016({
                  officerId: legacyHtml(officer.id),
                  entryKey: legacyHtml(entryKey),
                  entryKey2: legacyHtml(
                    entryKey === 'captain'
                      ? 'CAPTAIN'
                      : entryKey === 'bridge1'
                        ? 'BRIDGE 1'
                        : 'BRIDGE 2',
                  ),
                }),
              )
              .join(' ') + renderHangarUiCrewHtmlFragment017({ officerId: legacyHtml(officer.id) });
        return officerCard(
          clientGameState,
          officer,
          renderHangarUiCrewHtmlFragment018({
            rankLine: legacyHtml(rankLine(clientGameState, officer, true)),
            where2: legacyHtml(where2 ? 'Serving: ' + escapeHtml2(where2) : 'Off duty'),
            buttons: legacyHtml(buttons),
          }),
        );
      })
      .join('') +
    renderHangarUiCrewHtmlFragment019();
  height += lowerDeckHtml(clientGameState); // 1.2
  return height;
}

// ------------------------------------------------------------------ HANGAR: shuttles + job board (remote: send and track) + drydock (at the station)

/**
 * Renders compact sidebar shuttle activity status list.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function shuttleSummary(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    currentTime = Date.now();
  if (!playerPayload.shuttles.length) return '';
  return (
    renderHangarUiShuttleSummaryFragment020() +
    playerPayload.shuttles
      .map((savedShuttle) => {
        const shuttleCraft = SHUTTLES[savedShuttle.kind];
        const state2 =
          savedShuttle.state === 'out'
            ? renderHangarUiShuttleSummaryFragment021({
                savedShuttleJob: savedShuttle.job!.title,
                minutes2: legacyHtml(minutes2(savedShuttle.ends! - currentTime)),
              })
            : savedShuttle.state === 'damaged'
              ? renderHangarUiShuttleSummaryFragment022()
              : renderHangarUiShuttleSummaryFragment023();
        return renderHangarUiShuttleSummaryFragment024({
          shuttleCraftName: shuttleCraft.name,
          state2: legacyHtml(state2),
        });
      })
      .join('')
  );
}

/**
 * Renders the Hangar interface including active shuttles, shuttle construction, and the remote Job Board.
 * @param clientGameState Game state object
 * @param atHome Whether player is currently docked at their Personal Station
 * @returns HTML markup
 */
export function hangarHtml(clientGameState: ClientGameState, atHome: boolean): string {
  const playerPayload = clientGameState.you!,
    currentTime = Date.now(),
    stationState = playerPayload.station;
  if (!stationState.site) return renderHangarUiHangarHtmlFragment025();
  let height = renderHangarUiHangarHtmlFragment026({
    playerPayloadShuttlesLength: legacyHtml(playerPayload.shuttles.length),
    playerPayloadBays: legacyHtml(playerPayload.bays),
  });
  if (!playerPayload.bays) height += renderHangarUiHangarHtmlFragment027();
  const idle = playerPayload.shuttles.filter((savedShuttle) => savedShuttle.state === 'idle'),
    _crewFree = playerPayload.officers.filter(
      (officer) =>
        !where(clientGameState, officer) ||
        playerPayload.shuttles.some(
          (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state !== 'out',
        ),
    );
  height +=
    renderHangarUiHangarHtmlFragment028() +
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
          body = renderHangarUiHangarHtmlFragment029({
            savedShuttleJob: savedShuttle.job!.title,
            percentage: legacyHtml(percentage),
            minutes2: legacyHtml(minutes2(savedShuttle.ends! - currentTime)),
            MathRound: legacyHtml(Math.round(savedShuttle.chance! * 100)),
          });
        } else if (savedShuttle.state === 'damaged')
          body = renderHangarUiHangarHtmlFragment030({
            atHome: legacyHtml(
              atHome
                ? renderHangarUiHangarHtmlFragment031({
                    savedShuttleId: legacyHtml(savedShuttle.id),
                    credits: legacyHtml(credits(Math.round(shuttleCraft.cost * SHUTTLE_REPAIR))),
                  })
                : renderHangarUiHangarHtmlFragment032(),
            ),
          });
        else
          body = renderHangarUiHangarHtmlFragment033({
            savedShuttleId: legacyHtml(savedShuttle.id),
            playerPayloadOfficers: legacyHtml(
              playerPayload.officers
                .filter(
                  (officer) =>
                    !playerPayload.shuttles.some(
                      (savedShuttle2) =>
                        savedShuttle2.crew === officer.id &&
                        savedShuttle2 !== savedShuttle &&
                        savedShuttle2.state === 'out',
                    ),
                )
                .map((officer) =>
                  renderHangarUiHangarHtmlFragment034({
                    officerId: legacyHtml(officer.id),
                    officerId2: legacyHtml(officer.id === savedShuttle.crew ? 'selected' : ''),
                    officerName: officer.name,
                    ROLES: legacyHtml(ROLES[officer.role].name),
                    officerLv: legacyHtml(officer.lv),
                  }),
                )
                .join(''),
            ),
          });
        return renderHangarUiHangarHtmlFragment035({
          artworkUrl: legacyHtml(artworkUrl(clientGameState.A!.ships[shuttleCraft.hull].img!)),
          shuttleCraftName: shuttleCraft.name,
          savedShuttleRuns: legacyHtml(savedShuttle.runs),
          crew: legacyHtml(
            crew && savedShuttle.state !== 'idle'
              ? renderHangarUiHangarHtmlFragment036({ crewName: crew.name })
              : '',
          ),
          body: legacyHtml(body),
          atHome: legacyHtml(
            atHome && savedShuttle.state !== 'out'
              ? renderHangarUiHangarHtmlFragment037({ savedShuttleId: legacyHtml(savedShuttle.id) })
              : '',
          ),
        });
      })
      .join('') +
    renderHangarUiHangarHtmlFragment038();
  if (atHome && playerPayload.shuttles.length < playerPayload.bays) {
    height +=
      renderHangarUiHangarHtmlFragment039() +
      Object.entries(SHUTTLES)
        .map(([entryKey, shuttleCraft]) =>
          renderHangarUiHangarHtmlFragment040({
            shuttleCraftName: shuttleCraft.name,
            shuttleCraftDesc: shuttleCraft.desc,
            stationStateOps: legacyHtml(
              stationState.ops >= shuttleCraft.ops
                ? renderHangarUiHangarHtmlFragment041({
                    credits: legacyHtml(credits(shuttleCraft.cost)),
                    shuttleCraftMatsMap: legacyHtml(
                      shuttleCraft.mats
                        .map(([message, game]) =>
                          renderHangarUiHangarHtmlFragment042({
                            playerPayloadMats: legacyHtml(
                              playerPayload.mats[message][game] >= 1 ? '#8ff0ad' : '#ff9a8a',
                            ),
                            message: legacyHtml(message),
                            GRADES: legacyHtml(GRADES[game]),
                          }),
                        )
                        .join(', '),
                    ),
                    entryKey: legacyHtml(entryKey),
                  })
                : renderHangarUiHangarHtmlFragment043({
                    shuttleCraftOps: legacyHtml(shuttleCraft.ops),
                  }),
            ),
          }),
        )
        .join('');
  }
  // job board
  height += renderHangarUiHangarHtmlFragment044();
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
          .map((savedShuttle) =>
            renderHangarUiHangarHtmlFragment045({
              savedShuttleId: legacyHtml(savedShuttle.id),
              SHUTTLES: legacyHtml(
                SHUTTLES[savedShuttle.kind] && shuttleJobType.fit === savedShuttle.kind
                  ? 'selected'
                  : '',
              ),
              SHUTTLES2: SHUTTLES[savedShuttle.kind].name,
              shuttleJobTypeFit: legacyHtml(shuttleJobType.fit === savedShuttle.kind ? ' ★' : ''),
            }),
          )
          .join('');
        return renderHangarUiHangarHtmlFragment046({
          shuttleJobTitle: shuttleJob.title,
          shuttleJobTypeName: legacyHtml(shuttleJobType.name),
          starSystemName: starSystem.name,
          FACTIONS: legacyHtml(FACTIONS[starSystem.faction].short),
          shuttleJobJumps: legacyHtml(shuttleJob.jumps),
          shuttleJobDanger: legacyHtml(shuttleJob.danger),
          minutes2: legacyHtml(minutes2(shuttleJob.minutes * 60000)),
          SHUTTLES: legacyHtml(SHUTTLES[shuttleJobType.fit].name),
          join3: legacyHtml(join3),
          join2: legacyHtml(
            join2
              ? renderHangarUiHangarHtmlFragment047({
                  shuttleJobId: legacyHtml(shuttleJob.id),
                  join2: legacyHtml(join2),
                  shuttleJobId2: legacyHtml(shuttleJob.id),
                })
              : '',
          ),
        });
      })
      .join('') || renderHangarUiHangarHtmlFragment048();
  return height;
}

// ------------------------------------------------------------------ research trees with a queue

/**
 * Renders the Research Lab tech trees, active research countdown, and research queue.
 * @param clientGameState Game state object
 * @param interactive Whether research actions are enabled
 * @returns HTML markup
 */
export function researchHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    stationState = playerPayload.station,
    currentTime = Date.now(),
    quantity = stationState.queue || [];
  let height = renderHangarUiResearchHtmlFragment049();
  if (stationState.active) {
    const researchNode = RESEARCH.find(
      (researchNode) => researchNode.id === stationState.active!.id,
    )!;
    height += renderHangarUiResearchHtmlFragment050({
      researchNodeName: researchNode.name,
      minutes2: legacyHtml(minutes2(stationState.active.ends - currentTime)),
    });
  }
  if (quantity.length)
    height += renderHangarUiResearchHtmlFragment051({
      quantityLength: legacyHtml(quantity.length),
      RESEARCH_QUEUE_MAX: legacyHtml(RESEARCH_QUEUE_MAX),
      stationStateWaiting: legacyHtml(
        stationState.waiting ? renderHangarUiResearchHtmlFragment052() : '',
      ),
      quantityMap: legacyHtml(
        quantity
          .map(
            (identifier) =>
              `${escapeHtml2(RESEARCH.find((researchNode) => researchNode.id === identifier)!.name)}${interactive ? renderHangarUiResearchHtmlFragment053({ identifier: legacyHtml(identifier) }) : ''}`,
          )
          .join(' → '),
      ),
    });
  clientGameState.rtree = clientGameState.rtree || 'Combat';
  height += renderHangarUiResearchHtmlFragment054({
    RESEARCH_TREESMap: legacyHtml(
      RESEARCH_TREES.map((time) =>
        renderHangarUiResearchHtmlFragment055({
          time: legacyHtml(time === clientGameState.rtree ? 'on' : ''),
          time2: legacyHtml(time),
          timeToUpperCase: legacyHtml(time.toUpperCase()),
          RESEARCHFilter: legacyHtml(
            RESEARCH.filter(
              (researchNode) =>
                researchNode.tree === time && stationState.done.includes(researchNode.id),
            ).length,
          ),
          RESEARCHFilter2: legacyHtml(
            RESEARCH.filter((researchNode) => researchNode.tree === time).length,
          ),
        }),
      ).join(''),
    ),
  });
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
    height += renderHangarUiResearchHtmlFragment056({
      done: legacyHtml(done ? '#8ff0ad' : available ? '#ddd' : '#555'),
      done2: legacyHtml(done ? '✓ ' : ''),
      researchNodeName: researchNode.name,
      researchNodeNeeds: legacyHtml(
        researchNode.needs
          ? renderHangarUiResearchHtmlFragment057({
              RESEARCHFind: RESEARCH.find(
                (researchNode3) => researchNode3.id === researchNode.needs,
              )!.name,
            })
          : '',
      ),
      join2: join2,
      done3: legacyHtml(
        done
          ? 'done'
          : queued
            ? 'queued'
            : available
              ? `${credits(researchNode.cost)} + ${researchNode.mats.map(([message, game]) => message + ' ' + GRADES[game]).join(', ')} · ${researchNode.minutes}m ${interactive ? renderHangarUiResearchHtmlFragment058({ researchNodeId: legacyHtml(researchNode.id), stationStateActive: legacyHtml(stationState.active || (researchNode.needs && !stationState.done.includes(researchNode.needs)) ? 'QUEUE' : 'START') }) : ''}`
              : `Station Tier ${researchNode.ops}`,
      ),
    });
  }
  return height;
}

/**
 * Renders the Material crates inventory grid and crate refinement actions.
 * @param clientGameState Game state object
 * @param interactive Whether refining actions are interactive
 * @returns HTML markup
 */
export function materialsHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!;
  let height = renderHangarUiMaterialsHtmlFragment059({
    GRADESMap: legacyHtml(
      GRADES.map((game) => renderHangarUiMaterialsHtmlFragment060({ game: legacyHtml(game) })).join(
        '',
      ),
    ),
    MATERIALSMap: legacyHtml(
      MATERIALS.map((message) =>
        renderHangarUiMaterialsHtmlFragment061({
          message: legacyHtml(message),
          playerPayloadMats: legacyHtml(
            playerPayload.mats[message]
              .map((count, game) =>
                renderHangarUiMaterialsHtmlFragment062({
                  count: legacyHtml(count ? '#fff' : '#444'),
                  count2: legacyHtml(count),
                  interactive: legacyHtml(
                    interactive && game < 4 && count >= REFINE_UP.need
                      ? renderHangarUiMaterialsHtmlFragment063({
                          message: legacyHtml(message),
                          game: legacyHtml(game),
                          REFINE_UPNeed: legacyHtml(REFINE_UP.need),
                          GRADES: legacyHtml(GRADES[game + 1]),
                          credits: legacyHtml(credits(REFINE_UP.cost[game])),
                        })
                      : '',
                  ),
                }),
              )
              .join(''),
          ),
        }),
      ).join(''),
    ),
  });
  if (interactive)
    height += renderHangarUiMaterialsHtmlFragment064({ REFINE_UPNeed: legacyHtml(REFINE_UP.need) });
  return height;
}

// ------------------------------------------------------------------ boarding dialog

/**
 * Renders the modal dialog for boarding a disabled ship (plunder, capture, rescue/arrest).
 * @param clientGameState Game state object
 * @param boardedTarget Target ship entity
 * @returns HTML markup
 */
export function boardHtml(clientGameState: ClientGameState, boardedTarget: BoardedTarget): string {
  const shipHullAsset = clientGameState.A!.ships[boardedTarget.hull],
    factionDef = FACTIONS[clientGameState.FAC[boardedTarget.fac as number]],
    lawful =
      factionDef &&
      !factionDef.pirate &&
      clientGameState.FAC[boardedTarget.fac as number] !== 'umbral';
  const crew = BRIDGE_SLOTS.filter((entryKey) => clientGameState.you!.bridge[entryKey]).length;
  return renderHangarUiBoardHtmlFragment065({
    boardedTargetName: boardedTarget.name || shipHullAsset.name,
    shipHullAssetName: shipHullAsset.name,
    factionDef: legacyHtml(factionDef ? factionDef.name : ''),
    lawful: legacyHtml(lawful ? ' · standing -8' : ''),
    crew: legacyHtml(crew ? '' : 'disabled'),
    crew2: legacyHtml(
      crew
        ? `prize crew of ${crew} officer${crew > 1 ? 's' : ''} · to your drydock${lawful ? ' · standing -15' : ''}`
        : 'needs an officer on the bridge',
    ),
    lawful2: legacyHtml(lawful ? 'RESCUE' : 'ARREST'),
    lawful3: legacyHtml(lawful ? 'standing +6 and a reward' : 'a Concord reward'),
  });
}
