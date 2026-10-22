import { escapeHtml as esc } from './html.ts';
import { SYS, STELLARS } from '/shared/galaxy.js';
import { route } from '/shared/rules.js';
import { passengerSeats, occupiedPassengerSeats } from '/shared/passengers.js';
import { contractShares } from '/shared/mission-payouts.js';
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
export function missionKind(o) {
  if (
    o.kind === 'story' ||
    o.kind === 'arc' ||
    o.kind === 'career' ||
    o.quest ||
    o.type === 'quest'
  )
    return 'story';
  if (o.type === 'warband') return 'team';
  if (['cargo', 'smuggle', 'supply'].includes(o.type)) return 'cargo';
  if (o.type === 'passenger') return 'passenger';
  if (['bounty', 'assassinate', 'patrol'].includes(o.type)) return 'combat';
  return 'explore';
}
export function missionDetails(G, o, active = false) {
  const y = G.you,
    system = o.sys || STELLARS[o.dest || o.stellar]?.system;
  const path = system && G.sys ? route(SYS, G.sys, system) : null;
  const jumps = o.done || system === G.sys ? 0 : path?.length || null;
  const cargo = ['cargo', 'smuggle', 'supply'].includes(o.type) ? o.qty || 0 : 0;
  const free = new ShipCapacity(
    y.shipStats?.cargo || 0,
    y.cargoUsed || 0,
    reservedCargoTonnes(y.missions),
  ).available;
  const capacity = passengerSeats(G.A.ships[y.ship?.hull], y.ship);
  const seats = Math.max(0, capacity - occupiedPassengerSeats(y.missions));
  const team = (y.armada?.members || []).filter((m) => m.online && m.jobSlots > 0);
  const reasons = [];
  if (!active && y.missions.length >= 6)
    reasons.push('All six job slots are full. Finish or abandon a job first.');
  if (
    !o.done &&
    ['cargo', 'smuggle'].includes(o.type) &&
    cargo > (active ? y.shipStats?.cargo || 0 : free)
  )
    reasons.push(
      `Needs ${cargo} t of ${active ? 'hold capacity' : 'free hold'}; you have ${active ? y.shipStats?.cargo || 0 : free} t.`,
    );
  if (!o.done && o.type === 'passenger' && (o.pax || 1) > (active ? capacity : seats))
    reasons.push(
      `Needs ${o.pax || 1} ${active ? 'passenger seats' : 'free passenger seats'}; you have ${active ? capacity : seats}.`,
    );
  if (!active && o.type === 'warband' && team.length < 2)
    reasons.push(
      'Needs two online Armada captains with free job slots. Open Allies to form a team.',
    );
  let danger = SYS[system]?.danger;
  if (o.type === 'warband') danger = Math.max(4, danger || 0);
  if (['patrol', 'bounty', 'assassinate'].includes(o.type)) danger = Math.max(2, danger || 0);
  if (o.hull && G.A.ships[o.hull]?.strength > (G.A.ships[y.ship?.hull]?.strength || 10) * 1.6)
    danger = Math.max(4, danger || 0);
  const risk =
    danger == null ? 'See briefing' : danger >= 4 ? '▲ High' : danger >= 2 ? '◆ Moderate' : '● Low';
  const dest = STELLARS[o.dest || o.stellar];
  const turnIn = dest
    ? `Land at ${dest.name} (${SYS[dest.system].name})`
    : o.type === 'warband' ||
        ['bounty', 'patrol', 'assassinate', 'survey', 'salvage', 'rescue'].includes(o.type)
      ? 'Land anywhere after completing the objective'
      : o.status || 'See the briefing';
  let pay = o.reward == null ? 'See briefing' : `${o.reward.toLocaleString()} credits`;
  if (!active && o.type === 'warband') {
    const share = contractShares(
      o.reward,
      team.map((m) => m.name),
    ).find((m) => m.name === y.name)?.share;
    pay =
      share == null
        ? 'Choose a team first'
        : `about ${share.toLocaleString()} credits if all ${team.length} eligible captains join`;
  }
  return { jumps, risk, cargo, free, seats, reasons, turnIn, pay };
}
export function missionFactsHtml(G, o, active = false) {
  if (o.kind === 'career') return '';
  const d = missionDetails(G, o, active);
  return `<div class="mission-facts small"><span><b>Travel:</b> ${d.jumps === null ? 'see briefing' : d.jumps === 0 ? 'this system' : d.jumps + (d.jumps === 1 ? ' jump' : ' jumps')}</span><span><b>Danger:</b> ${esc(d.risk)}</span><span><b>Hold needed:</b> ${d.cargo} t${!active && d.cargo ? ` (${d.free} t free)` : ''}</span>${o.type === 'passenger' ? `<span><b>Seats:</b> ${o.pax || 1} needed · ${d.seats} free</span>` : ''}<span><b>Turn in:</b> ${esc(d.turnIn)}</span>${o.reward != null ? `<span class="cr"><b>Your pay:</b> ${esc(d.pay)}</span>` : ''}${o.type === 'warband' && !active ? `<span>Team pool: ${o.reward.toLocaleString()} credits, split only between captains who agree. Review exact shares before starting.</span>` : ''}${active && o.team ? '<span>Your saved share stays fixed if teammates leave. Reconnect to finish or collect; late joiners are not added.</span>' : ''}</div>`;
}
export function filterMissions(G, offers, scope = 'job', active = false) {
  return offers.filter((o) => {
    const d = missionDetails(G, o, active),
      type = G[scope + 'Type'] || 'all';
    return (
      (type === 'all' || missionKind(o) === type) &&
      (!G[scope + 'Feasible'] || !d.reasons.length) &&
      (!G[scope + 'Nearby'] || (d.jumps !== null && d.jumps <= 1))
    );
  });
}
export function missionFiltersHtml(G, scope = 'job') {
  return `<div class="mission-filters"><label class="small">${scope === 'job' ? 'Job' : 'Mission'} type <select data-mission-filter="${scope}Type" aria-label="${scope === 'job' ? 'Job' : 'Mission'} type">${kinds.map(([k, n]) => `<option value="${k}"${(G[scope + 'Type'] || 'all') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label class="small"><input type="checkbox" data-mission-filter="${scope}Feasible"${G[scope + 'Feasible'] ? ' checked' : ''}> ${scope === 'job' ? 'Can take now' : 'Fits current ship'}</label><label class="small"><input type="checkbox" data-mission-filter="${scope}Nearby"${G[scope + 'Nearby'] ? ' checked' : ''}> Within 1 jump</label></div>`;
}
export function contractPlanHtml(G) {
  const p = G.contractPlan;
  if (!p) return '';
  const mine = p.roster.find((r) => r.name === G.you?.name),
    proposer = p.proposer === G.you?.name;
  if (!mine) return '';
  const button = (op, label, disabled = false) =>
    `<button class="btn sm" data-contract="${op}"${disabled ? ' disabled' : ''}>${label}</button>`;
  return `<section class="mcard contract-plan"><div class="sect">PLAN A TEAM CONTRACT</div><b>${esc(p.title)}</b><p class="small">Nothing is assigned until every listed captain chooses Ready and ${esc(p.proposer)} starts. Leaving or disconnecting cancels the plan. Accepted shares stay fixed; late joiners are not added.</p><ul class="small">${p.roster.map((r) => `<li>${esc(r.name)} · <b>${r.share.toLocaleString()} cr</b> · ${r.ready ? '✓ Ready' : 'Waiting'} · ${r.slots} job slots free</li>`).join('')}</ul>${p.skipped.map((r) => `<p class="small dim">${esc(r.name)}: ${esc(r.reason)}</p>`).join('')}<p class="small cr">Your share: ${mine.share.toLocaleString()} credits. Team pool: ${p.pool.toLocaleString()} credits.</p><div class="mfoot">${button('contractReady', mine.ready ? '✓ READY' : 'READY', mine.ready)}${proposer ? button('contractStart', 'START TEAM CONTRACT', !p.roster.every((r) => r.ready && r.slots > 0)) : ''}${button(proposer ? 'contractCancel' : 'contractDecline', proposer ? 'CANCEL PLAN' : 'NO THANKS')}</div><p class="dim small">This divides the team contract pool. Ordinary shared combat bounties are separate extra rewards.</p></section>`;
}
