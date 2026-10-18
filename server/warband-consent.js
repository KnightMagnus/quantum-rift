import { randomUUID } from 'node:crypto';
import { contractShares } from '../shared/mission-payouts.js';
import { WARBAND } from '../shared/coop.js';

// Planning is session-only; accepted jobs and their fixed payouts use the normal saved missions.
const pending = new WeakMap();
function plans(c) {
  if (!pending.has(c.db)) pending.set(c.db, new Map());
  return pending.get(c.db);
}
function publish(c, plan, clear = false) {
  const shares = contractShares(
    plan.offer.reward,
    plan.members.map((m) => m.name),
  );
  for (const member of plan.members) {
    const session = c.sessionOf(member.name);
    if (session)
      c.send(session, {
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
              roster: shares.map((row) => ({
                ...row,
                ready: plan.ready.has(row.name),
                slots: Math.max(0, 6 - (c.sessionOf(row.name)?.data.missions.length || 0)),
              })),
              skipped: plan.skipped,
            },
      });
  }
}
function cancel(c, plan, reason) {
  plans(c).delete(plan.armada);
  publish(c, plan, true);
  for (const member of plan.members) {
    const session = c.sessionOf(member.name);
    if (session) c.toast(session, reason);
  }
}
function current(c, plan) {
  const armada = c.armadaOf(c.sessionOf(plan.proposer)?.data || {});
  return (
    armada?.id === plan.armada &&
    plan.members.every((m) => {
      const session = c.sessionOf(m.name);
      return session?.id === m.session && c.armadaOf(session.data)?.id === plan.armada;
    })
  );
}
export function proposeContract(c, session, offer) {
  const armada = c.armadaOf(session.data);
  if (c.solo || !armada)
    return c.toast(session, 'Team contracts need an Armada. Open Allies to form one.');
  const existing = plans(c).get(armada.id);
  if (existing && current(c, existing)) {
    publish(c, existing);
    return;
  }
  if (existing) cancel(c, existing, 'The team changed. Plan the contract again.');
  const online = armada.members.map((name) => c.sessionOf(name)).filter(Boolean);
  const eligible = online.filter(
    (s) => s.data.missions.length < 6 && !s.data.missions.some((m) => m.id === offer.id),
  );
  if (eligible.length < WARBAND.minMembers)
    return c.toast(
      session,
      'At least two online captains need a free job slot. No jobs were assigned.',
    );
  const plan = {
    id: randomUUID(),
    revision: 1,
    armada: armada.id,
    proposer: session.data.name,
    port: session.data.stellar,
    offer: structuredClone(offer),
    created: Date.now(),
    members: eligible.map((s) => ({ name: s.data.name, session: s.id })),
    ready: new Set([session.data.name]),
    skipped: online
      .filter((s) => !eligible.includes(s))
      .map((s) => ({
        name: s.data.name,
        reason: 'No free job slot or already has this contract.',
      })),
  };
  plans(c).set(armada.id, plan);
  publish(c, plan);
  for (const s of eligible)
    c.toast(
      s,
      `${session.data.name} is planning a team contract. Review your share in Missions; joining is optional.`,
    );
}
export function respondContract(c, session, message) {
  const armada = c.armadaOf(session.data),
    plan = armada && plans(c).get(armada.id);
  if (
    !plan ||
    message.id !== plan.id ||
    message.revision !== plan.revision ||
    !plan.members.some((m) => m.session === session.id)
  )
    return c.toast(session, 'That team plan changed. Review the current roster in Missions.');
  if (!current(c, plan))
    return cancel(c, plan, 'A captain left or disconnected. Plan the team contract again.');
  if (message.op === 'contractCancel') {
    if (session.data.name === plan.proposer)
      cancel(c, plan, 'Team contract plan cancelled. No jobs were assigned.');
    return;
  }
  if (message.op === 'contractDecline') {
    if (session.data.name === plan.proposer)
      return cancel(c, plan, 'Team contract plan cancelled. No jobs were assigned.');
    c.send(session, { t: 'armadaContract', plan: null });
    plan.members = plan.members.filter((m) => m.session !== session.id);
    if (plan.members.length < WARBAND.minMembers)
      return cancel(c, plan, 'Not enough captains chose to join. No jobs were assigned.');
    plan.revision++;
    plan.ready.clear();
    publish(c, plan);
    for (const m of plan.members)
      c.toast(
        c.sessionOf(m.name),
        'The team changed. Review your new share and choose Ready again.',
      );
    return;
  }
  if (
    plan.members.some((m) => {
      const s = c.sessionOf(m.name);
      return (
        !s || s.data.missions.length >= 6 || s.data.missions.some((job) => job.id === plan.offer.id)
      );
    })
  )
    return cancel(
      c,
      plan,
      'A captain has no free job slot or already took this contract. Plan again; no jobs were assigned.',
    );
  if (message.op === 'contractReady') {
    plan.ready.add(session.data.name);
    publish(c, plan);
    return;
  }
  if (message.op !== 'contractStart' || session.data.name !== plan.proposer) return;
  if (session.ent || session.data.stellar !== plan.port)
    return c.toast(session, 'Return to the posting port before starting the team contract.');
  if (!plan.members.every((m) => plan.ready.has(m.name)))
    return c.toast(
      session,
      'Wait for every listed captain to choose Ready. Nobody has been assigned yet.',
    );
  const shares = contractShares(
    plan.offer.reward,
    plan.members.map((m) => m.name),
  );
  // All validation precedes mutation. Fixed saved shares do not grow when someone leaves/reconnects.
  plans(c).delete(plan.armada);
  publish(c, plan, true);
  for (const row of shares) {
    const s = c.sessionOf(row.name);
    s.data.missions.push({
      ...plan.offer,
      reward: row.share,
      poolReward: plan.offer.reward,
      team: shares.map((r) => r.name),
      offerVersion: 1,
      owner: s.id,
      armada: plan.armada,
      taken: Date.now(),
    });
    c.log(
      s.data,
      `Joined team contract: ${plan.offer.title}. Your fixed share: ${row.share} credits.`,
    );
    c.toast(
      s,
      `Team contract started. Your share is ${row.share.toLocaleString()} credits; it stays fixed if teammates leave.`,
    );
    c.you(s);
  }
  c.db.touch();
  c.landed(session);
}
export function cleanContractPlans(c, leaving = null) {
  for (const plan of plans(c).values())
    if (
      plan.members.some((m) => m.session === leaving?.id) ||
      !current(c, plan) ||
      Date.now() - plan.created > 600000
    )
      cancel(
        c,
        plan,
        'The team plan ended or a captain left. No jobs were assigned; plan again when ready.',
      );
}
export function completeTeamContract(c, npc) {
  if (!Array.isArray(npc.contractTeam)) return false;
  for (const name of npc.contractTeam) {
    const data = c.db.get(name),
      mission = data?.missions.find((m) => m.id === npc.kingpin && m.offerVersion === 1 && !m.done);
    if (!mission) continue;
    mission.done = true;
    const session = c.sessionOf(name);
    if (session) {
      c.toast(
        session,
        `Team contract complete. Land anywhere to collect your ${mission.reward.toLocaleString()} credits.`,
      );
      c.you(session);
    }
  }
  c.db.touch();
  return true;
}
