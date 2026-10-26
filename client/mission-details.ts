import type { ClientGameState } from './main.ts';
import type { Mission } from '../server/game.ts';
import type { MissionTarget } from './missions.ts';
export type MissionDetailsInput = Omit<Partial<Mission>, 'quest' | 'sys'> &
  Omit<Partial<MissionTarget>, 'sys' | 'stellar' | 'quest' | 'team'> & {
    sys?: string | null;
    stellar?: string | null;
    quest?: Mission['quest'] | boolean;
  } & { team?: unknown };

import { escapeHtml as escapeHtml2 } from './html.ts';
import { SYS as systemsById, STELLARS, TRAFFIC, FACTIONS } from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';
import { passengerSeats, occupiedPassengerSeats } from '../shared/passengers.ts';
import { contractShares } from '../shared/mission-payouts.ts';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';
import { dangerTier, raidBudget } from '../shared/hostile.ts';
import type { DangerTier } from '../shared/hostile.ts';

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
const DANGER_LABELS: Record<DangerTier, string> = {
  low: '● Low',
  moderate: '◆ Moderate',
  high: '▲ High',
  deadly: '☠ Deadly',
};
/**
 * Estimates the hostile power a combat job puts against the captain.
 * @param clientGameState Client game state.
 * @param missionDetailsInput Job or mission offer.
 * @param power Captain's effective combat power.
 * @param systemId The job's destination system.
 * @returns Expected hostile power, or null for jobs that are not straight fights.
 */
function combatThreat(
  clientGameState: ClientGameState,
  missionDetailsInput: MissionDetailsInput,
  power: number,
  systemId: string | null | undefined,
): number | null {
  if (!['patrol', 'bounty', 'assassinate'].includes(missionDetailsInput.type!)) return null;
  if (missionDetailsInput.hull) {
    const targetPower = clientGameState.A!.ships[missionDetailsInput.hull]?.strength;
    if (!targetPower) return null;
    const guardPower =
      missionDetailsInput.type === 'assassinate'
        ? (clientGameState.A!.ships[missionDetailsInput.guard!]?.strength || 0) * 2
        : 0;
    return targetPower + guardPower;
  }
  const system = systemsById[systemId!];
  if (
    missionDetailsInput.type === 'patrol' &&
    system &&
    !system.farside &&
    !system.arena &&
    system.faction !== 'deep'
  ) {
    // These are estimates for newly spawned raids, not existing traffic or special encounters.
    const factions = FACTIONS[system.faction].pirate
      ? [system.faction]
      : system.danger >= 3
        ? ['hollow', 'umbral']
        : ['hollow'];
    const minimumRaider = Math.max(
      ...factions.map((faction) =>
        Math.min(
          ...TRAFFIC[faction].war.map((hull) => clientGameState.A!.ships[hull]?.strength || 10),
        ),
      ),
    );
    return Math.max(raidBudget(power, system.danger), minimumRaider);
  }
  return null;
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
  let risk =
    danger == null ? 'See briefing' : danger >= 4 ? '▲ High' : danger >= 2 ? '◆ Moderate' : '● Low';
  const power = Math.round(
      playerPayload.power || clientGameState.A!.ships[playerPayload.ship?.hull]?.strength || 10,
    ),
    threat = combatThreat(clientGameState, missionDetailsInput, power, system);
  if (threat != null)
    risk = `${DANGER_LABELS[dangerTier(power, threat)]} (${missionDetailsInput.type === 'patrol' ? 'estimated raid' : 'threat'} ${Math.round(threat)} vs your ${power})`;
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
  return `<div class="mission-facts small"><span><b>Travel:</b> ${missionDetails2.jumps === null ? 'see briefing' : missionDetails2.jumps === 0 ? 'this system' : missionDetails2.jumps + (missionDetails2.jumps === 1 ? ' jump' : ' jumps')}</span><span><b>Danger:</b> ${escapeHtml2(missionDetails2.risk)}</span><span><b>Hold needed:</b> ${missionDetails2.cargo} t${!active && missionDetails2.cargo ? ` (${missionDetails2.free} t free)` : ''}</span>${missionDetailsInput.type === 'passenger' ? `<span><b>Seats:</b> ${missionDetailsInput.pax || 1} needed · ${missionDetails2.seats} free</span>` : ''}<span><b>Turn in:</b> ${escapeHtml2(missionDetails2.turnIn)}</span>${missionDetailsInput.reward != null ? `<span class="cr"><b>Your pay:</b> ${escapeHtml2(missionDetails2.pay)}</span>` : ''}${missionDetailsInput.type === 'warband' && !active ? `<span>Team pool: ${missionDetailsInput.reward!.toLocaleString()} credits, split only between captains who agree. Review exact shares before starting.</span>` : ''}${active && missionDetailsInput.team ? '<span>Your saved share stays fixed if teammates leave. Reconnect to finish or collect; late joiners are not added.</span>' : ''}</div>`;
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
  return `<div class="mission-filters"><label class="small">${scope === 'job' ? 'Job' : 'Mission'} type <select data-mission-filter="${scope}Type" aria-label="${scope === 'job' ? 'Job' : 'Mission'} type">${kinds.map(([entryKey, count]) => `<option value="${entryKey}"${(clientGameState[(scope + 'Type') as 'jobType'] || 'all') === entryKey ? ' selected' : ''}>${count}</option>`).join('')}</select></label><label class="small"><input type="checkbox" data-mission-filter="${scope}Feasible"${clientGameState[(scope + 'Feasible') as 'jobFeasible'] ? ' checked' : ''}> ${scope === 'job' ? 'Can take now' : 'Fits current ship'}</label><label class="small"><input type="checkbox" data-mission-filter="${scope}Nearby"${clientGameState[(scope + 'Nearby') as 'jobNearby'] ? ' checked' : ''}> Within 1 jump</label></div>`;
}
export function contractPlanHtml(clientGameState: ClientGameState) {
  const contractPlan2 = clientGameState.contractPlan;
  if (!contractPlan2) return '';
  const mine = contractPlan2.roster.find((radius) => radius.name === clientGameState.you?.name),
    proposer = contractPlan2.proposer === clientGameState.you?.name;
  if (!mine) return '';
  const button = (operation: string, label: string, disabled = false) =>
    `<button class="btn sm" data-contract="${operation}"${disabled ? ' disabled' : ''}>${label}</button>`;
  return `<section class="mcard contract-plan"><div class="sect">PLAN A TEAM CONTRACT</div><b>${escapeHtml2(contractPlan2.title)}</b><p class="small">Nothing is assigned until every listed captain chooses Ready and ${escapeHtml2(contractPlan2.proposer)} starts. Leaving or disconnecting cancels the plan. Accepted shares stay fixed; late joiners are not added.</p><ul class="small">${contractPlan2.roster.map((radius) => `<li>${escapeHtml2(radius.name)} · <b>${radius.share.toLocaleString()} cr</b> · ${radius.ready ? '✓ Ready' : 'Waiting'} · ${radius.slots} job slots free</li>`).join('')}</ul>${contractPlan2.skipped.map((radius) => `<p class="small dim">${escapeHtml2(radius.name)}: ${escapeHtml2(radius.reason)}</p>`).join('')}<p class="small cr">Your share: ${mine.share.toLocaleString()} credits. Team pool: ${contractPlan2.pool.toLocaleString()} credits.</p><div class="mfoot">${button('contractReady', mine.ready ? '✓ READY' : 'READY', mine.ready)}${proposer ? button('contractStart', 'START TEAM CONTRACT', !contractPlan2.roster.every((radius) => radius.ready && radius.slots > 0)) : ''}${button(proposer ? 'contractCancel' : 'contractDecline', proposer ? 'CANCEL PLAN' : 'NO THANKS')}</div><p class="dim small">This divides the team contract pool. Ordinary shared combat bounties are separate extra rewards.</p></section>`;
}
