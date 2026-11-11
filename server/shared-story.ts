import type { CoopCapabilities } from './features.ts';
import type { Session } from './game.ts';
import type { Entity, ShipStats, Space } from './space.ts';
import type { CoopMessage } from './coop-contracts.ts';

const suppressedEncounters = new WeakSet<Session>();

/** Extra durability each live helper adds, as a share of the encounter's solo durability. */
export const SHARED_DURABILITY_PER_HELPER = 1;
/** Extra outgoing damage each live helper adds, as a share of the encounter's solo damage. */
export const SHARED_DAMAGE_PER_HELPER = 0.1;
/** Helpers beyond this count add no further scaling. */
export const SHARED_SCALING_HELPER_CAP = 4;

/** Solo stats and the helper count currently applied to one scaled encounter actor. */
interface SharedEncounterScaling {
  /** Story owner whose shared roster sets this actor's scale. */
  ownerId: number;
  /** Stats the actor had before any shared scaling. */
  soloStats: ShipStats;
  /** Live helper count the current stats reflect. */
  helpers: number;
}

const scaledActors = new WeakMap<Entity, SharedEncounterScaling>();
const scaledOwners = new WeakSet<Session>();

/** Shared credit never accepts a different chapter, stage or story branch. */
export function sameStoryStep(owner: Session, helper: Session): boolean {
  const left = owner.data.story;
  const right = helper.data.story;
  const choices = (session: Session) =>
    JSON.stringify(
      Object.entries(session.data.story?.flags || {})
        .filter(([, value]) => typeof value === 'string')
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  return !!(
    left?.active &&
    right?.active &&
    !right.active.ready &&
    left.step === right.step &&
    left.active.id === right.active.id &&
    (left.active.stage || 0) === (right.active.stage || 0) &&
    choices(owner) === choices(helper)
  );
}

/** A suppressed personal encounter resumes after consent or the frozen flight ends. */
export function resumeStoryEncounter(session: Session): boolean {
  return suppressedEncounters.delete(session);
}

/** Frozen consent, not merely READY TO HELP, suppresses a second personal fight. */
export function sharedEncounterOwner(
  game: Pick<CoopCapabilities, 'sessions'>,
  helper: Session,
): Session | undefined {
  const owner = game.sessions.get(helper.storyAssistOwner!);
  const run = owner?.sharedStory;
  if (!owner || !run || !sameStoryStep(owner, helper)) return;
  const target = { story: owner.id, storyKill: true, storyMission: run.mission };
  return storyParticipant(game, target, helper.id) ? owner : undefined;
}

/** Check live consent every time; stale rosters never grant access after reconnect or departure. */
export function storyParticipant(
  game: Pick<CoopCapabilities, 'sessions'> | undefined,
  target: Pick<Entity, 'story' | 'storyKill' | 'storyMission'>,
  captainId: number,
): boolean {
  if (target.story === captainId) return true;
  if (!game?.sessions) return false;
  const owner = target.story && game.sessions.get(target.story);
  const helper = game.sessions.get(captainId);
  const run = owner && owner.sharedStory;
  return !!(
    owner &&
    helper &&
    run &&
    target.storyKill &&
    target.storyMission === run.mission &&
    (owner.data.story?.active?.stage || 0) === (run.stage || 0) &&
    run.until > Date.now() &&
    run.helpers.includes(helper.id) &&
    owner.ent?.id === run.ownerEntity &&
    helper.ent?.id === run.helperEntities[helper.id] &&
    owner.data.armada === run.armada &&
    helper.storyAssistOwner === owner.id &&
    owner.ent &&
    !owner.ent.dead &&
    helper.ent &&
    !helper.ent.dead &&
    owner.data.story?.active?.id === run.mission &&
    !owner.data.story.active.ready &&
    owner.data.sys === run.sys &&
    helper.data.sys === run.sys &&
    owner.data.armada &&
    helper.data.armada === owner.data.armada
  );
}

/** Durability and damage multipliers for a shared encounter with this many live helpers. */
export function sharedEncounterScale(helpers: number): { durability: number; damage: number } {
  const counted = Math.max(0, Math.min(SHARED_SCALING_HELPER_CAP, Math.floor(helpers)));
  return {
    durability: 1 + SHARED_DURABILITY_PER_HELPER * counted,
    damage: 1 + SHARED_DAMAGE_PER_HELPER * counted,
  };
}

/** Helpers on the frozen roster who still pass every live participation check. */
export function liveSharedHelpers(
  game: Pick<CoopCapabilities, 'sessions'>,
  owner: Session,
): number {
  const run = owner.sharedStory;
  if (!run) return 0;
  const target = { story: owner.id, storyKill: true, storyMission: run.mission };
  return run.helpers.filter((helperId) => storyParticipant(game, target, helperId)).length;
}

/** Hostile actors of the owner's current fight: story targets and the escorts they command. */
function sharedEncounterActors(space: Space, owner: Session, mission: string): Entity[] {
  const targets = [...space.ships.values()].filter(
    (actor) =>
      !actor.dead &&
      actor.story === owner.id &&
      actor.storyKill &&
      actor.storyMission === mission &&
      !actor.storyAlly &&
      !actor.player,
  );
  const targetIds = new Set(targets.map((actor) => actor.id));
  const escorts = [...space.ships.values()].filter(
    (actor) =>
      !actor.dead &&
      actor.owner !== null &&
      targetIds.has(actor.owner) &&
      !actor.storyAlly &&
      !actor.player &&
      !targetIds.has(actor.id),
  );
  return [...targets, ...escorts];
}

/** Rebuild an actor's stats for a helper count while keeping its current health fraction. */
function applyActorScale(actor: Entity, scaling: SharedEncounterScaling, helpers: number): void {
  if (scaling.helpers === helpers) return;
  const scale = sharedEncounterScale(helpers);
  const solo = scaling.soloStats;
  const shieldFraction = actor.st.shield > 0 ? actor.shield / actor.st.shield : 1;
  const armorFraction = actor.st.armor > 0 ? actor.armor / actor.st.armor : 1;
  actor.st = {
    ...solo,
    shield: solo.shield * scale.durability,
    shieldRe: solo.shieldRe * scale.durability,
    armor: solo.armor * scale.durability,
    armorRe: solo.armorRe * scale.durability,
    damageMul: solo.damageMul * scale.damage,
  };
  actor.shield = actor.st.shield * shieldFraction;
  actor.armor = actor.st.armor * armorFraction;
  scaling.helpers = helpers;
}

/**
 * Match the owner's shared fight to the captains still on its roster. Runs every
 * tick; scaling follows live helpers down as well as up and preserves each
 * actor's health fraction, so joining or leaving never heals or breaks a target.
 */
export function scaleSharedEncounter(
  game: Pick<CoopCapabilities, 'sessions'>,
  owner: Session,
  space: Space,
): void {
  const run = owner.sharedStory;
  if (!run && !scaledOwners.has(owner)) return;
  const helpers = run && run.sys === space.id ? liveSharedHelpers(game, owner) : 0;
  const mission = run?.mission || owner.data.story?.active?.id;
  const actors = mission ? sharedEncounterActors(space, owner, mission) : [];
  for (const actor of actors) {
    let scaling = scaledActors.get(actor);
    if (!scaling) {
      if (!helpers) continue;
      scaling = { ownerId: owner.id, soloStats: actor.st, helpers: 0 };
      scaledActors.set(actor, scaling);
    }
    if (scaling.ownerId === owner.id) applyActorScale(actor, scaling, helpers);
  }
  if (helpers) scaledOwners.add(owner);
  else if (!run) scaledOwners.delete(owner);
}

/** Only the story owner starts a fight roster; helpers opt in before that roster is frozen. */
export function sharedStoryAction(
  game: CoopCapabilities,
  session: Session,
  message: CoopMessage,
): void {
  if (message.op === 'storyStop') {
    withdrawStoryAssistance(game, session);
    game.toast(session, 'Shared story assistance stopped.');
    return;
  }
  const armada = game.armadaOf(session.data);
  if (!armada || !session.ent || session.ent.dead)
    return game.toast(session, 'Launch with your Armada before arranging story assistance.');
  if (message.op === 'storyAssist') {
    const owner = game.sessionOf(String(message.name || ''));
    if (
      !owner ||
      owner === session ||
      !owner.ent ||
      owner.ent.dead ||
      owner.data.armada !== session.data.armada ||
      owner.data.sys !== session.data.sys
    )
      return game.toast(session, 'Choose an online Armada captain flying in your system.');
    session.storyAssistOwner = owner.id;
    session.storyAssistFlight = { owner: owner.ent.id, helper: session.ent.id };
    game.toast(
      session,
      `Ready to help ${owner.name}. They must start shared assistance; captains on the same chapter, stage and branch share objective progress. Each reports their own chapter for rewards.`,
    );
    game.toast(
      owner,
      `${session.name} is ready to help. Start shared assistance from Armada to freeze the roster.`,
    );
    return;
  }
  const active = session.data.story?.active;
  const space = game.spaces[session.data.sys];
  if (
    !active ||
    active.ready ||
    !space ||
    ![...space.ships.values()].some(
      (target) =>
        target.story === session.id && target.storyKill && target.storyMission === active.id,
    )
  )
    return game.toast(session, 'Enter your current story fight before starting shared assistance.');
  if (
    session.sharedStory &&
    session.sharedStory.until > Date.now() &&
    session.sharedStory.mission === active.id &&
    (session.sharedStory.stage || 0) === (active.stage || 0)
  )
    return game.toast(
      session,
      'This fight already has a frozen roster. Stop assistance before arranging another roster.',
    );
  const helpers = [...game.sessions.values()].filter(
    (helper) =>
      helper !== session &&
      helper.storyAssistOwner === session.id &&
      helper.storyAssistFlight?.owner === session.ent!.id &&
      helper.storyAssistFlight?.helper === helper.ent?.id &&
      helper.ent &&
      !helper.ent.dead &&
      helper.data.armada === session.data.armada &&
      helper.data.sys === session.data.sys,
  );
  if (!helpers.length) return game.toast(session, 'Ask helpers to choose READY TO HELP first.');
  session.sharedStory = {
    mission: active.id,
    stage: active.stage || 0,
    progressHelpers: helpers
      .filter((helper) => sameStoryStep(session, helper))
      .map((helper) => helper.id),
    ownerEntity: session.ent.id,
    helperEntities: Object.fromEntries(helpers.map((helper) => [helper.id, helper.ent!.id])),
    armada: session.data.armada!,
    sys: session.data.sys,
    helpers: helpers.map((helper) => helper.id),
    until: Date.now() + 15 * 60_000,
  };
  // Remove duplicate mission actors without kills, bounties or progression.
  for (const helper of helpers) {
    if (!sameStoryStep(session, helper)) continue;
    const removed = new Set<number>();
    for (const actor of space.ships.values())
      if (actor.story === helper.id && (actor.storyMission === active.id || actor.storyAlly))
        removed.add(actor.id);
    for (const actor of space.ships.values())
      if (actor.owner && removed.has(actor.owner)) removed.add(actor.id);
    for (const id of removed) {
      const actor = space.ships.get(id);
      if (actor) space.remove(actor);
    }
    suppressedEncounters.add(helper);
  }
  for (const participant of [session, ...helpers])
    game.toast(
      participant,
      `Shared story fight started by ${session.name}: ${helpers.map((helper) => helper.name).join(', ')}. Assistance lasts up to 15 minutes while both captains remain connected, in-system and in the Armada. Captains on the same chapter, stage and branch share objective progress; each reports their own chapter for rewards. Other helpers receive ordinary combat bounties. Story enemies get tougher for each helper still in the fight.`,
    );
}

/** Membership withdrawal is permanent for a frozen roster, even if the captain later rejoins. */
export function withdrawStoryAssistance(
  game: Pick<CoopCapabilities, 'sessions'>,
  session: Session,
): void {
  delete session.sharedStory;
  delete session.storyAssistOwner;
  delete session.storyAssistFlight;
  for (const owner of game.sessions.values()) {
    if (owner.sharedStory)
      owner.sharedStory.helpers = owner.sharedStory.helpers.filter((id) => id !== session.id);
    if (owner.storyAssistOwner === session.id) {
      delete owner.storyAssistOwner;
      delete owner.storyAssistFlight;
    }
  }
}
