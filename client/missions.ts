import { legacyHtml } from './eta-runtime.ts';
import {
  renderMissionsJournalHtmlFragment001,
  renderMissionsJournalHtmlFragment002,
  renderMissionsMissionsHtmlFragment003,
  renderMissionsMissionsHtmlFragment004,
  renderMissionsMissionsHtmlFragment005,
  renderMissionsMissionsHtmlFragment006,
  renderMissionsMissionsHtmlFragment007,
  renderMissionsMissionsHtmlFragment008,
  renderMissionsMissionsHtmlFragment009,
  renderMissionsMissionsHtmlFragment010,
  renderMissionsMissionsHtmlFragment011,
  renderMissionsMissionsHtmlFragment012,
  renderMissionsMissionsHtmlFragment013,
  renderMissionsMissionsHtmlFragment014,
  renderMissionsPinnedObjectiveHtmlFragment015,
  renderMissionsPinnedObjectiveHtmlFragment016,
} from './eta-templates.ts';
import type { ClientGameState } from './main.ts';
export type MissionKind = 'story' | 'career' | 'arc' | 'job';
export type MissionTarget = {
  /** Mission unique key or ID */
  key: string;

  /** Category of mission */
  kind: MissionKind;

  /** Headline or mission name */
  title: string;

  /** Mission description or briefing */
  text: string;

  /** Progress or destination instructions */
  status: string;

  /** System ID to fly to (or null if anywhere) */
  sys: string | null | undefined;

  /** Destination stellar body ID */
  stellar?: string | null;

  /** Mission card tag or category badge */
  tag?: string | null;

  /** Credit reward */
  reward?: number;

  /** Whether mission has a deadline */
  urgent?: boolean;

  /** Whether mission is part of a quest line */
  quest?: boolean;
  type?: string;
  dest?: string;
  qty?: number;
  pax?: number;
  done?: boolean;
  team?: string[];
  pendingQuest?: string;
};

import {
  missionFactsHtml,
  filterMissions,
  missionFiltersHtml,
  contractPlanHtml,
} from './mission-details.ts';
import { refineryJobsHtml } from './refinery_ui.ts';
// active mission tracking. Works out where each mission (and the main story) wants you to go, for the MISSIONS
// companion tab and the gold target markers on the galaxy map.
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { STORY } from '../shared/story.ts';
import { route } from '../shared/rules.ts';
import { TUTORIAL } from '../shared/tutorial.ts';

/**
 * Resolves the parent system ID for a given stellar body.
 * @param stellar Stellar body ID
 * @returns System ID or null
 */
const systemOf = (stellar: string | null | undefined): string | null =>
  STELLARS[stellar!] ? STELLARS[stellar!].system : null;

/**
 * Returns formatted location string "StellarName (SystemName)".
 * @param stellar Stellar body ID
 * @returns Location display string
 */
const placeName = (stellar: string | null | undefined): string =>
  STELLARS[stellar!] ? `${STELLARS[stellar!].name} (${systemsById[systemOf(stellar)!].name})` : '';

/**
 * Computes active mission target entries including career steps, main story, faction arcs, and job board contracts.
 * @param clientGameState Game state object
 * @returns Array of mission target objectives
 */
export function missionTargets(clientGameState: ClientGameState): MissionTarget[] {
  const playerPayload = clientGameState.you!;
  if (!playerPayload) return [];
  const missionTargets: MissionTarget[] = [],
    story2 = playerPayload.story;
  const targetIndex = playerPayload.tut ?? TUTORIAL.length,
    tutorialStep = TUTORIAL[targetIndex]; // the current career step leads the list
  if (tutorialStep)
    missionTargets.push({
      key: 'career',
      kind: 'career',
      title: tutorialStep.title,
      text: tutorialStep.text,
      status: `Career step ${targetIndex + 1} of ${TUTORIAL.length} · reward ${tutorialStep.reward.toLocaleString()} cr${tutorialStep.mat ? ' + a crate' : ''}`,
      sys: null,
    });
  if (story2 && !story2.pass) {
    if (story2.active) {
      const storyMission = STORY.find((storyMission) => storyMission.id === story2.active!.id);
      if (storyMission) {
        let starSystem,
          status,
          stellar2 = null;
        if (storyMission.type === 'carry') {
          starSystem = systemOf(storyMission.dest);
          status = `Land at ${placeName(storyMission.dest)}.`;
          stellar2 = storyMission.dest;
        } else if (story2.active.ready) {
          starSystem = systemOf(storyMission.back);
          status = `Return to ${placeName(storyMission.back)}.`;
          stellar2 = storyMission.back;
        } else {
          starSystem = storyMission.sys;
          status =
            `Go to the ${systemsById[storyMission.sys!].name} system.` +
            (storyMission.count ? ` ${story2.active.got || 0} / ${storyMission.count} done.` : '');
        }
        missionTargets.push({
          key: 'story',
          kind: 'story',
          title: storyMission.title,
          text: storyMission.brief,
          status,
          sys: starSystem,
          stellar: stellar2,
        });
      }
    } else if (STORY[story2.step]) {
      const storyMission = STORY[story2.step];
      missionTargets.push({
        key: 'story',
        kind: 'story',
        title: storyMission.title,
        text: 'The next part of the main story is waiting.',
        status: `Land at ${placeName(storyMission.at)}.`,
        sys: systemOf(storyMission.at),
        stellar: storyMission.at,
      });
    }
  }
  for (const positionX of playerPayload.arcs || [])
    if (positionX.active) {
      // 1.2 faction arcs
      const active2 = positionX.active,
        starSystem =
          active2.type === 'carry'
            ? systemOf(active2.dest)
            : active2.ready
              ? systemOf(active2.back)
              : active2.sys;
      const status =
        active2.type === 'carry'
          ? `Land at ${placeName(active2.dest)}.`
          : active2.ready
            ? `Return to ${placeName(active2.back)}.`
            : `Go to the ${systemsById[active2.sys].name} system.${active2.count ? ` ${active2.got || 0} / ${active2.count} done.` : ''}`;
      missionTargets.push({
        key: 'arc-' + positionX.fac,
        kind: 'arc',
        title: active2.title,
        text: active2.brief,
        status,
        sys: starSystem,
        tag: positionX.name,
        stellar: active2.type === 'carry' ? active2.dest : active2.ready ? active2.back : null,
      });
    }
  for (const mission of playerPayload.missions || []) {
    const there = mission.sys && systemsById[mission.sys] ? systemsById[mission.sys].name : '';
    let status,
      starSystem = mission.sys || null;
    if (mission.done) {
      status = 'Complete: land anywhere to collect the reward.';
      starSystem = null;
    } else if (mission.dest && STELLARS[mission.dest]) {
      status = `Land at ${placeName(mission.dest)}.`;
      starSystem = systemOf(mission.dest);
    } else if (mission.type === 'patrol')
      status = `${mission.got || 0} / ${mission.need} kills in ${there}.`;
    else if (mission.type === 'survey')
      status = `${(mission.seen || []).length} / ${mission.points ? mission.points.length : 3} points in ${there}, then land anywhere.`;
    else if (mission.type === 'bounty' || mission.type === 'assassinate')
      status = `Destroy ${mission.targetName} in ${there}.`;
    else if (mission.type === 'warband')
      status = `Armada contract: destroy ${mission.targetName} in ${there}, together.`; // 2.6
    else if (mission.type === 'salvage')
      status = `Recover the salvage at the marked point in ${there}, then land anywhere.`;
    else if (mission.type === 'rescue')
      status = `Find and board the ${mission.wreckName} in ${there}.`;
    else status = there ? `Go to ${there}.` : '';
    if (
      !mission.done &&
      mission.quest &&
      !playerPayload.shipless &&
      playerPayload.shipStats &&
      (mission.type === 'cargo' || mission.type === 'smuggle' || mission.type === 'supply') &&
      mission.qty! > (playerPayload.shipStats.cargo || 0)
    )
      status = `⚠ Needs ${mission.qty} t of hold: switch ships for this step. ${status}`; // the step waits for a ship that can do it
    if (mission.deadline) {
      const left = Math.max(0, Math.ceil((mission.deadline - Date.now()) / 60000));
      status = `⏱ ${left} min left · ${status}`;
    }
    missionTargets.push({
      type: mission.type,
      qty: mission.qty,
      pax: mission.pax,
      dest: mission.dest,
      done: mission.done,
      team: mission.team,
      stellar: mission.done ? null : mission.dest || null,
      key: mission.id,
      kind: mission.exp || mission.quest ? 'arc' : 'job',
      quest: !!mission.quest,
      tag: mission.exp
        ? 'FARSIDE EXPEDITION'
        : mission.quest
          ? `${mission.quest.qid.startsWith('s:') ? 'SIDE STORY' : 'QUEST'} · ${mission.quest.name.toUpperCase()} · STEP ${mission.quest.step + 1}/${mission.quest.of}`
          : null,
      title: mission.title,
      text: mission.text,
      status,
      sys: starSystem,
      reward: mission.reward,
      urgent: !!mission.deadline,
    });
  }
  for (const quantity of playerPayload.quests?.active || []) {
    const waiting = quantity.awaitingSeats;
    if (!waiting) continue;
    missionTargets.push({
      key: 'waiting:' + quantity.qid,
      kind: 'arc',
      pendingQuest: quantity.qid,
      tag: `${quantity.side ? 'SIDE STORY' : 'QUEST'} · ${quantity.name.toUpperCase()} · STEP ${quantity.step + 1}/${quantity.of}`,
      title: waiting.title,
      text: waiting.text,
      status: `Awaiting boarding: free ${waiting.pax} passenger seats and a mission slot, then land at ${placeName(waiting.at)}. No passengers have boarded yet.`,
      sys: systemOf(waiting.at),
      stellar: waiting.at,
    });
  }
  return missionTargets;
}

// the story journal under the active missions

/**
 * Renders the completed quests and stories journal section.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
function journalHtml(clientGameState: ClientGameState): string {
  const quests2 = clientGameState.you!.quests;
  if (!quests2 || !quests2.done || !quests2.done.length) return '';
  return renderMissionsJournalHtmlFragment001({
    quests2DoneLength: legacyHtml(quests2.done.length),
    quests2Done: legacyHtml(
      quests2.done
        .slice()
        .reverse()
        .map((positionX) =>
          renderMissionsJournalHtmlFragment002({
            positionXSide: legacyHtml(positionX.side ? '★' : '✦'),
            positionXName: positionX.name,
            positionXGiver: positionX.giver,
          }),
        )
        .join(''),
    ),
  });
}

/**
 * Renders the MISSIONS companion tab showing active missions, plot course buttons, and journal.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function missionsHtml(clientGameState: ClientGameState): string {
  const missionTargets2 = missionTargets(clientGameState),
    shown = filterMissions(clientGameState, missionTargets2, 'mission', true),
    refinery =
      contractPlanHtml(clientGameState) +
      missionFiltersHtml(clientGameState, 'mission') +
      refineryJobsHtml(clientGameState);
  if (!missionTargets2.length)
    return refinery + renderMissionsMissionsHtmlFragment003() + journalHtml(clientGameState);
  return (
    refinery +
    (!shown.length ? renderMissionsMissionsHtmlFragment004() : '') +
    shown
      .map((missionTarget) => {
        let jumps = '';
        if (missionTarget.sys && clientGameState.sys) {
          if (missionTarget.sys === clientGameState.sys)
            jumps = renderMissionsMissionsHtmlFragment005();
          else {
            const route2 = route(systemsById, clientGameState.sys, missionTarget.sys);
            jumps =
              route2 && route2.length
                ? `${route2.length} jump${route2.length > 1 ? 's' : ''}`
                : 'no known route';
          }
        }
        return renderMissionsMissionsHtmlFragment006({
          missionTargetKey: missionTarget.key,
          missionTargetKind: legacyHtml(
            missionTarget.kind === 'story' || missionTarget.kind === 'arc'
              ? ' story'
              : missionTarget.kind === 'career'
                ? ' career'
                : '',
          ),
          missionTargetUrgent: legacyHtml(missionTarget.urgent ? ' urgent' : ''),
          missionTargetKind2: legacyHtml(
            missionTarget.kind === 'story'
              ? renderMissionsMissionsHtmlFragment007()
              : missionTarget.kind === 'career'
                ? renderMissionsMissionsHtmlFragment008()
                : missionTarget.kind === 'arc'
                  ? renderMissionsMissionsHtmlFragment009({
                      missionTargetTag: missionTarget.tag || 'FACTION STORY',
                    })
                  : '',
          ),
          missionTargetTitle: missionTarget.title,
          missionTargetStatus: missionTarget.status,
          missionFactsHtml: legacyHtml(missionFactsHtml(clientGameState, missionTarget, true)),
          missionTargetKind3: legacyHtml(
            missionTarget.kind === 'story' &&
              missionTargets2.some((missionTarget) => missionTarget.kind === 'career')
              ? renderMissionsMissionsHtmlFragment010({ missionTargetText: missionTarget.text })
              : renderMissionsMissionsHtmlFragment011({ missionTargetText: missionTarget.text }),
          ),
          missionTargetKey2: missionTarget.key,
          clientGameStatePinnedObjective: legacyHtml(
            clientGameState.pinnedObjective === missionTarget.key,
          ),
          clientGameStatePinnedObjective2: legacyHtml(
            clientGameState.pinnedObjective === missionTarget.key ? 'UNPIN' : 'PIN',
          ),
          jumps: legacyHtml(jumps),
          missionTargetSys: legacyHtml(
            missionTarget.sys && missionTarget.sys !== clientGameState.sys
              ? renderMissionsMissionsHtmlFragment012({ missionTargetSys: missionTarget.sys })
              : '',
          ),
          missionTargetPendingQuest: legacyHtml(
            missionTarget.pendingQuest
              ? renderMissionsMissionsHtmlFragment013({
                  missionTargetPendingQuest: missionTarget.pendingQuest,
                })
              : missionTarget.kind === 'job' ||
                  missionTarget.quest ||
                  (missionTarget.kind === 'arc' && missionTarget.tag === 'FARSIDE EXPEDITION')
                ? renderMissionsMissionsHtmlFragment014({ missionTargetKey: missionTarget.key })
                : '',
          ),
        });
      })
      .join('') +
    journalHtml(clientGameState)
  );
}

// One deliberate next step, inside the existing Tray; all other tracking stays visible.
export function pinnedObjectiveHtml(clientGameState: ClientGameState) {
  const missionTarget = missionTargets(clientGameState).find(
    (missionTarget) => missionTarget.key === clientGameState.pinnedObjective,
  );
  if (!missionTarget) return '';
  return renderMissionsPinnedObjectiveHtmlFragment015({
    missionTargetTitle: missionTarget.title,
    missionTargetStatus: missionTarget.status,
    missionTargetSys: legacyHtml(
      missionTarget.sys && missionTarget.sys !== clientGameState.sys
        ? renderMissionsPinnedObjectiveHtmlFragment016({ missionTargetSys: missionTarget.sys })
        : '',
    ),
    missionTargetKey: missionTarget.key,
  });
}
