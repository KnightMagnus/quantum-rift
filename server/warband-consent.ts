import type { CoopCapabilities } from './features.ts';
import type { CoopMessage } from './coop-contracts.ts';
import type { Mission, Session } from './game.ts';
import type { Entity } from './space.ts';
interface ContractPlan {
  id: string;
  revision: number;
  armada: string;
  proposer: string;
  port: string | null;
  offer: Mission;
  created: number;
  members: Array<{ name: string; session: number }>;
  ready: Set<string>;
  skipped: Array<{ name: string; reason: string }>;
}

import { contractShares } from '../shared/mission-payouts.ts';
import { WARBAND } from '../shared/coop.ts';

// Planning is session-only; accepted jobs and their fixed payouts use the normal saved missions.
const pending = new WeakMap<object, Map<string, ContractPlan>>();
function plans(coopCapabilities: CoopCapabilities) {
  if (!pending.has(coopCapabilities.db)) pending.set(coopCapabilities.db, new Map());
  return pending.get(coopCapabilities.db)!;
}
function publish(coopCapabilities: CoopCapabilities, plan: ContractPlan, clear = false) {
  const shares = contractShares(
    plan.offer.reward,
    plan.members.map((message) => message.name),
  );
  for (const member of plan.members) {
    const session = coopCapabilities.sessionOf(member.name);
    if (session)
      coopCapabilities.send(session, {
        t: 'armadaContract',
        plan: clear
          ? null
          : {
              id: plan.id,
              revision: plan.revision,
              proposer: plan.proposer,
              title: plan.offer.title,
              sys: plan.offer.sys,
              pool: plan.offer.reward,
              roster: shares.map((rowIndex) => ({
                ...rowIndex,
                ready: plan.ready.has(rowIndex.name),
                slots: Math.max(
                  0,
                  6 - (coopCapabilities.sessionOf(rowIndex.name)?.data.missions.length || 0),
                ),
              })),
              skipped: plan.skipped,
            },
      });
  }
}
function cancel(coopCapabilities: CoopCapabilities, plan: ContractPlan, reason: string) {
  plans(coopCapabilities).delete(plan.armada);
  publish(coopCapabilities, plan, true);
  for (const member of plan.members) {
    const session = coopCapabilities.sessionOf(member.name);
    if (session) coopCapabilities.toast(session, reason);
  }
}
function current(coopCapabilities: CoopCapabilities, plan: ContractPlan) {
  const armada = coopCapabilities.armadaOf(coopCapabilities.sessionOf(plan.proposer)?.data || {});
  return (
    armada?.id === plan.armada &&
    plan.members.every((message) => {
      const session = coopCapabilities.sessionOf(message.name);
      return (
        session?.id === message.session &&
        coopCapabilities.armadaOf(session.data)?.id === plan.armada
      );
    })
  );
}
export function proposeContract(
  coopCapabilities: CoopCapabilities,
  session: Session,
  offer: Mission,
) {
  const armada = coopCapabilities.armadaOf(session.data);
  if (coopCapabilities.solo || !armada)
    return coopCapabilities.toast(
      session,
      'Team contracts need an Armada. Open Allies to form one.',
    );
  const existing = plans(coopCapabilities).get(armada.id);
  if (existing && current(coopCapabilities, existing)) {
    publish(coopCapabilities, existing);
    return;
  }
  if (existing) cancel(coopCapabilities, existing, 'The team changed. Plan the contract again.');
  const online = armada.members
    .map((name) => coopCapabilities.sessionOf(name))
    .filter((session): session is Session => Boolean(session));
  const eligible = online.filter(
    (session) =>
      session.data.missions.length < 6 &&
      !session.data.missions.some((mission) => mission.id === offer.id),
  );
  if (eligible.length < WARBAND.minMembers)
    return coopCapabilities.toast(
      session,
      'At least two online captains need a free job slot. No jobs were assigned.',
    );
  const plan = {
    id: coopCapabilities.platform.randomUUID(),
    revision: 1,
    armada: armada.id,
    proposer: session.data.name,
    port: session.data.stellar,
    offer: structuredClone(offer),
    created: Date.now(),
    members: eligible.map((session2) => ({ name: session2.data.name, session: session2.id })),
    ready: new Set([session.data.name]),
    skipped: online
      .filter((session) => !eligible.includes(session))
      .map((session) => ({
        name: session.data.name,
        reason: 'No free job slot or already has this contract.',
      })),
  };
  plans(coopCapabilities).set(armada.id, plan);
  publish(coopCapabilities, plan);
  for (const session2 of eligible)
    coopCapabilities.toast(
      session2,
      `${session.data.name} is planning a team contract. Review your share in Missions; joining is optional.`,
    );
}
export function respondContract(
  coopCapabilities: CoopCapabilities,
  session: Session,
  message: CoopMessage,
) {
  const armada = coopCapabilities.armadaOf(session.data),
    plan = armada && plans(coopCapabilities).get(armada.id);
  if (
    !plan ||
    message.id !== plan.id ||
    message.revision !== plan.revision ||
    !plan.members.some((message) => message.session === session.id)
  )
    return coopCapabilities.toast(
      session,
      'That team plan changed. Review the current roster in Missions.',
    );
  if (!current(coopCapabilities, plan))
    return cancel(
      coopCapabilities,
      plan,
      'A captain left or disconnected. Plan the team contract again.',
    );
  if (message.op === 'contractCancel') {
    if (session.data.name === plan.proposer)
      cancel(coopCapabilities, plan, 'Team contract plan cancelled. No jobs were assigned.');
    return;
  }
  if (message.op === 'contractDecline') {
    if (session.data.name === plan.proposer)
      return cancel(coopCapabilities, plan, 'Team contract plan cancelled. No jobs were assigned.');
    coopCapabilities.send(session, { t: 'armadaContract', plan: null });
    plan.members = plan.members.filter((message) => message.session !== session.id);
    if (plan.members.length < WARBAND.minMembers)
      return cancel(
        coopCapabilities,
        plan,
        'Not enough captains chose to join. No jobs were assigned.',
      );
    plan.revision++;
    plan.ready.clear();
    publish(coopCapabilities, plan);
    for (const member of plan.members)
      coopCapabilities.toast(
        coopCapabilities.sessionOf(member.name)!,
        'The team changed. Review your new share and choose Ready again.',
      );
    return;
  }
  if (
    plan.members.some((message) => {
      const session = coopCapabilities.sessionOf(message.name);
      return (
        !session ||
        session.data.missions.length >= 6 ||
        session.data.missions.some((mission) => mission.id === plan.offer.id)
      );
    })
  )
    return cancel(
      coopCapabilities,
      plan,
      'A captain has no free job slot or already took this contract. Plan again; no jobs were assigned.',
    );
  if (message.op === 'contractReady') {
    plan.ready.add(session.data.name);
    publish(coopCapabilities, plan);
    return;
  }
  if (message.op !== 'contractStart' || session.data.name !== plan.proposer) return;
  if (session.ent || session.data.stellar !== plan.port)
    return coopCapabilities.toast(
      session,
      'Return to the posting port before starting the team contract.',
    );
  if (!plan.members.every((message) => plan.ready.has(message.name)))
    return coopCapabilities.toast(
      session,
      'Wait for every listed captain to choose Ready. Nobody has been assigned yet.',
    );
  const shares = contractShares(
    plan.offer.reward,
    plan.members.map((message) => message.name),
  );
  // All validation precedes mutation. Fixed saved shares do not grow when someone leaves/reconnects.
  plans(coopCapabilities).delete(plan.armada);
  publish(coopCapabilities, plan, true);
  for (const share2 of shares) {
    const session = coopCapabilities.sessionOf(share2.name)!;
    session.data.missions.push({
      ...plan.offer,
      reward: share2.share,
      poolReward: plan.offer.reward,
      team: shares.map((radius) => radius.name),
      offerVersion: 1,
      owner: session.id,
      armada: plan.armada,
      taken: Date.now(),
    });
    coopCapabilities.log(
      session.data,
      `Joined team contract: ${plan.offer.title}. Your fixed share: ${share2.share} credits.`,
    );
    coopCapabilities.toast(
      session,
      `Team contract started. Your share is ${share2.share.toLocaleString()} credits; it stays fixed if teammates leave.`,
    );
    coopCapabilities.you(session);
  }
  coopCapabilities.db.touch();
  coopCapabilities.landed(session);
}
export function cleanContractPlans(
  coopCapabilities: CoopCapabilities,
  leaving: Session | null = null,
) {
  for (const plan of plans(coopCapabilities).values())
    if (
      plan.members.some((message) => message.session === leaving?.id) ||
      !current(coopCapabilities, plan) ||
      Date.now() - plan.created > 600000
    )
      cancel(
        coopCapabilities,
        plan,
        'The team plan ended or a captain left. No jobs were assigned; plan again when ready.',
      );
}
export function completeTeamContract(coopCapabilities: CoopCapabilities, entity: Entity) {
  if (!Array.isArray(entity.contractTeam)) return false;
  for (const name of entity.contractTeam) {
    const data = coopCapabilities.db.get(name),
      mission = data?.missions.find(
        (mission) => mission.id === entity.kingpin && mission.offerVersion === 1 && !mission.done,
      );
    if (!mission) continue;
    mission.done = true;
    const session = coopCapabilities.sessionOf(name);
    if (session) {
      coopCapabilities.toast(
        session,
        `Team contract complete. Land anywhere to collect your ${mission.reward.toLocaleString()} credits.`,
      );
      coopCapabilities.you(session);
    }
  }
  coopCapabilities.db.touch();
  return true;
}
