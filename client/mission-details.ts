import { legacyHtml } from './eta-runtime.ts';
import {
  renderMissionDetailsMissionFactsHtmlFragment001,
  renderMissionDetailsMissionFactsHtmlFragment002,
  renderMissionDetailsMissionFactsHtmlFragment003,
  renderMissionDetailsMissionFactsHtmlFragment004,
  renderMissionDetailsMissionFactsHtmlFragment005,
  renderMissionDetailsMissionFiltersHtmlFragment006,
  renderMissionDetailsMissionFiltersHtmlFragment007,
  renderMissionDetailsContractPlanHtmlFragment008,
  renderMissionDetailsContractPlanHtmlFragment009,
  renderMissionDetailsContractPlanHtmlFragment010,
  renderMissionDetailsContractPlanHtmlFragment011,
} from './eta-templates.ts';
import type { ClientGameState } from './main.ts';
import type { Mission } from '../server/game.ts';
import type { MissionTarget } from './missions.ts';
export type MissionDetailsInput = Omit<Partial<Mission>, 'quest' | 'sys'> &
  Omit<Partial<MissionTarget>, 'sys' | 'stellar' | 'quest' | 'team'> & {
    sys?: string | null;
    stellar?: string | null;
    quest?: Mission['quest'] | boolean;
  } & { team?: unknown };

import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';
import { passengerSeats, occupiedPassengerSeats } from '../shared/passengers.ts';
import { contractShares } from '../shared/mission-payouts.ts';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';

const kinds = [
  ['all', 'All types'],
  ['cargo', 'Cargo'],
  ['passenger', 'Passengers'],
  ['combat', 'Combat'],
  ['explore', 'Exploration'],
  ['story', 'Stories'],
  ['team', 'Team contracts'],
];
export function missionKind(missionDetailsInput: MissionDetailsInput) {
  if (
    missionDetailsInput.kind === 'story' ||
    missionDetailsInput.kind === 'arc' ||
    missionDetailsInput.kind === 'career' ||
    missionDetailsInput.quest ||
    missionDetailsInput.type === 'quest'
  )
    return 'story';
  if (missionDetailsInput.type === 'warband') return 'team';
  if (['cargo', 'smuggle', 'supply'].includes(missionDetailsInput.type!)) return 'cargo';
  if (missionDetailsInput.type === 'passenger') return 'passenger';
  if (['bounty', 'assassinate', 'patrol'].includes(missionDetailsInput.type!)) return 'combat';
  return 'explore';
}
export function missionDetails(
  clientGameState: ClientGameState,
  missionDetailsInput: MissionDetailsInput,
  active = false,
) {
  const playerPayload = clientGameState.you!,
    system =
      missionDetailsInput.sys ||
      STELLARS[(missionDetailsInput.dest || missionDetailsInput.stellar)!]?.system;
  const path =
    system && clientGameState.sys ? route(systemsById, clientGameState.sys, system) : null;
  const jumps =
    missionDetailsInput.done || system === clientGameState.sys ? 0 : path?.length || null;
  const cargo = ['cargo', 'smuggle', 'supply'].includes(missionDetailsInput.type!)
    ? missionDetailsInput.qty || 0
    : 0;
  const free = new ShipCapacity(
    playerPayload.shipStats?.cargo || 0,
    playerPayload.cargoUsed || 0,
    reservedCargoTonnes(playerPayload.missions),
  ).available;
  const capacity = passengerSeats(
    clientGameState.A!.ships[playerPayload.ship?.hull],
    playerPayload.ship,
  );
  const seats = Math.max(0, capacity - occupiedPassengerSeats(playerPayload.missions));
  const team = (playerPayload.armada?.members || []).filter(
    (message) => message.online && message.jobSlots > 0,
  );
  const reasons = [];
  if (!active && playerPayload.missions.length >= 6)
    reasons.push('All six job slots are full. Finish or abandon a job first.');
  if (
    !missionDetailsInput.done &&
    ['cargo', 'smuggle'].includes(missionDetailsInput.type!) &&
    cargo > (active ? playerPayload.shipStats?.cargo || 0 : free)
  )
    reasons.push(
      `Needs ${cargo} t of ${active ? 'hold capacity' : 'free hold'}; you have ${active ? playerPayload.shipStats?.cargo || 0 : free} t.`,
    );
  if (
    !missionDetailsInput.done &&
    missionDetailsInput.type === 'passenger' &&
    (missionDetailsInput.pax || 1) > (active ? capacity : seats)
  )
    reasons.push(
      `Needs ${missionDetailsInput.pax || 1} ${active ? 'passenger seats' : 'free passenger seats'}; you have ${active ? capacity : seats}.`,
    );
  if (!active && missionDetailsInput.type === 'warband' && team.length < 2)
    reasons.push(
      'Needs two online Armada captains with free job slots. Open Allies to form a team.',
    );
  let danger = systemsById[system!]?.danger;
  if (missionDetailsInput.type === 'warband') danger = Math.max(4, danger || 0);
  if (['patrol', 'bounty', 'assassinate'].includes(missionDetailsInput.type!))
    danger = Math.max(2, danger || 0);
  if (
    missionDetailsInput.hull &&
    clientGameState.A!.ships[missionDetailsInput.hull]?.strength >
      (clientGameState.A!.ships[playerPayload.ship?.hull]?.strength || 10) * 1.6
  )
    danger = Math.max(4, danger || 0);
  const risk =
    danger == null ? 'See briefing' : danger >= 4 ? '▲ High' : danger >= 2 ? '◆ Moderate' : '● Low';
  const stellarBody = STELLARS[(missionDetailsInput.dest || missionDetailsInput.stellar)!];
  const turnIn = stellarBody
    ? `Land at ${stellarBody.name} (${systemsById[stellarBody.system].name})`
    : missionDetailsInput.type === 'warband' ||
        ['bounty', 'patrol', 'assassinate', 'survey', 'salvage', 'rescue'].includes(
          missionDetailsInput.type!,
        )
      ? 'Land anywhere after completing the objective'
      : missionDetailsInput.status || 'See the briefing';
  let payment =
    missionDetailsInput.reward == null
      ? 'See briefing'
      : `${missionDetailsInput.reward!.toLocaleString()} credits`;
  if (!active && missionDetailsInput.type === 'warband') {
    const share = contractShares(
      missionDetailsInput.reward!,
      team.map((message) => message.name),
    ).find((message) => message.name === playerPayload.name)?.share;
    payment =
      share == null
        ? 'Choose a team first'
        : `about ${share.toLocaleString()} credits if all ${team.length} eligible captains join`;
  }
  return { jumps, risk, cargo, free, seats, reasons, turnIn, pay: payment };
}
export function missionFactsHtml(
  clientGameState: ClientGameState,
  missionDetailsInput: MissionDetailsInput,
  active = false,
) {
  if (missionDetailsInput.kind === 'career') return '';
  const missionDetails2 = missionDetails(clientGameState, missionDetailsInput, active);
  return renderMissionDetailsMissionFactsHtmlFragment001({
    missionDetails2Jumps: legacyHtml(
      missionDetails2.jumps === null
        ? 'see briefing'
        : missionDetails2.jumps === 0
          ? 'this system'
          : missionDetails2.jumps + (missionDetails2.jumps === 1 ? ' jump' : ' jumps'),
    ),
    missionDetails2Risk: missionDetails2.risk,
    missionDetails2Cargo: legacyHtml(missionDetails2.cargo),
    active: legacyHtml(!active && missionDetails2.cargo ? ` (${missionDetails2.free} t free)` : ''),
    missionDetailsInputType: legacyHtml(
      missionDetailsInput.type === 'passenger'
        ? renderMissionDetailsMissionFactsHtmlFragment002({
            missionDetailsInputPax: legacyHtml(missionDetailsInput.pax || 1),
            missionDetails2Seats: legacyHtml(missionDetails2.seats),
          })
        : '',
    ),
    missionDetails2TurnIn: missionDetails2.turnIn,
    missionDetailsInputReward: legacyHtml(
      missionDetailsInput.reward != null
        ? renderMissionDetailsMissionFactsHtmlFragment003({
            missionDetails2Pay: missionDetails2.pay,
          })
        : '',
    ),
    missionDetailsInputType2: legacyHtml(
      missionDetailsInput.type === 'warband' && !active
        ? renderMissionDetailsMissionFactsHtmlFragment004({
            missionDetailsInputReward: legacyHtml(missionDetailsInput.reward!.toLocaleString()),
          })
        : '',
    ),
    active2: legacyHtml(
      active && missionDetailsInput.team ? renderMissionDetailsMissionFactsHtmlFragment005() : '',
    ),
  });
}
export function filterMissions<ValueType extends MissionDetailsInput>(
  clientGameState: ClientGameState,
  offers: ValueType[],
  scope: 'job' | 'mission' = 'job',
  active = false,
) {
  return offers.filter((options) => {
    const missionDetails2 = missionDetails(clientGameState, options, active),
      type = clientGameState[(scope + 'Type') as 'jobType'] || 'all';
    return (
      (type === 'all' || missionKind(options) === type) &&
      (!clientGameState[(scope + 'Feasible') as 'jobFeasible'] ||
        !missionDetails2.reasons.length) &&
      (!clientGameState[(scope + 'Nearby') as 'jobNearby'] ||
        (missionDetails2.jumps !== null && missionDetails2.jumps <= 1))
    );
  });
}
export function missionFiltersHtml(
  clientGameState: ClientGameState,
  scope: 'job' | 'mission' = 'job',
) {
  return renderMissionDetailsMissionFiltersHtmlFragment006({
    scope: legacyHtml(scope === 'job' ? 'Job' : 'Mission'),
    scope2: legacyHtml(scope),
    scope3: legacyHtml(scope === 'job' ? 'Job' : 'Mission'),
    kindsMap: legacyHtml(
      kinds
        .map(([entryKey, count]) =>
          renderMissionDetailsMissionFiltersHtmlFragment007({
            entryKey: legacyHtml(entryKey),
            clientGameState: legacyHtml(
              (clientGameState[(scope + 'Type') as 'jobType'] || 'all') === entryKey
                ? ' selected'
                : '',
            ),
            count: legacyHtml(count),
          }),
        )
        .join(''),
    ),
    scope4: legacyHtml(scope),
    clientGameState: legacyHtml(
      clientGameState[(scope + 'Feasible') as 'jobFeasible'] ? ' checked' : '',
    ),
    scope5: legacyHtml(scope === 'job' ? 'Can take now' : 'Fits current ship'),
    scope6: legacyHtml(scope),
    clientGameState2: legacyHtml(
      clientGameState[(scope + 'Nearby') as 'jobNearby'] ? ' checked' : '',
    ),
  });
}
export function contractPlanHtml(clientGameState: ClientGameState) {
  const contractPlan2 = clientGameState.contractPlan;
  if (!contractPlan2) return '';
  const mine = contractPlan2.roster.find((radius) => radius.name === clientGameState.you?.name),
    proposer = contractPlan2.proposer === clientGameState.you?.name;
  if (!mine) return '';
  const button = (operation: string, label: string, disabled = false) =>
    renderMissionDetailsContractPlanHtmlFragment008({
      operation: legacyHtml(operation),
      disabled: legacyHtml(disabled ? ' disabled' : ''),
      label: legacyHtml(label),
    });
  return renderMissionDetailsContractPlanHtmlFragment009({
    contractPlan2Title: contractPlan2.title,
    contractPlan2Proposer: contractPlan2.proposer,
    contractPlan2RosterMap: legacyHtml(
      contractPlan2.roster
        .map((radius) =>
          renderMissionDetailsContractPlanHtmlFragment010({
            radiusName: radius.name,
            radiusShareToLocaleString: legacyHtml(radius.share.toLocaleString()),
            radiusReady: legacyHtml(radius.ready ? '✓ Ready' : 'Waiting'),
            radiusSlots: legacyHtml(radius.slots),
          }),
        )
        .join(''),
    ),
    contractPlan2SkippedMap: legacyHtml(
      contractPlan2.skipped
        .map((radius) =>
          renderMissionDetailsContractPlanHtmlFragment011({
            radiusName: radius.name,
            radiusReason: radius.reason,
          }),
        )
        .join(''),
    ),
    mineShareToLocaleString: legacyHtml(mine.share.toLocaleString()),
    contractPlan2PoolToLocaleString: legacyHtml(contractPlan2.pool.toLocaleString()),
    button: legacyHtml(button('contractReady', mine.ready ? '✓ READY' : 'READY', mine.ready)),
    proposer: legacyHtml(
      proposer
        ? button(
            'contractStart',
            'START TEAM CONTRACT',
            !contractPlan2.roster.every((radius) => radius.ready && radius.slots > 0),
          )
        : '',
    ),
    button2: legacyHtml(
      button(
        proposer ? 'contractCancel' : 'contractDecline',
        proposer ? 'CANCEL PLAN' : 'NO THANKS',
      ),
    ),
  });
}
