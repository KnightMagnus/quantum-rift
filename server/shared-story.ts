import type { CoopCapabilities } from './features.ts';
import type { Session } from './game.ts';
import type { Entity } from './space.ts';
import type { CoopMessage } from './coop-contracts.ts';
import type { SavedStory } from './save-contracts.ts';
import { partTwoStages } from '../shared/part-two-story.ts';

const suppressedEncounters = new WeakSet<Session>();

/**
 * Shared credit needs the same chapter, stage and objective. Earlier choices count only
 * when they change this stage's objective, such as the Part II campaign or aftercare route.
 */
export function sameStoryStep(owner: Session, helper: Session): boolean {
  const left = owner.data.story;
  const right = helper.data.story;
  return !!(
    left?.active &&
    right?.active &&
    !right.active.ready &&
    left.step === right.step &&
    left.active.id === right.active.id &&
    (left.active.stage || 0) === (right.active.stage || 0) &&
    stageObjectiveKey(left) === stageObjectiveKey(right)
  );
}

/** Serialized objective of the active stage; empty for chapters whose content ignores choices. */
function stageObjectiveKey(story: SavedStory): string {
  const active = story.active!;
  if (!active.id.startsWith('p2-')) return '';
  const objective = partTwoStages(story.flags || {}, active.id)[active.stage || 0];
  return JSON.stringify(objective || null);
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
  const progressHelpers = helpers.filter((helper) => sameStoryStep(session, helper));
  session.sharedStory = {
    mission: active.id,
    stage: active.stage || 0,
    progressHelpers: progressHelpers.map((helper) => helper.id),
    ownerEntity: session.ent.id,
    helperEntities: Object.fromEntries(helpers.map((helper) => [helper.id, helper.ent!.id])),
    armada: session.data.armada!,
    sys: session.data.sys,
    helpers: helpers.map((helper) => helper.id),
    until: Date.now() + 15 * 60_000,
  };
  // Remove duplicate mission actors without kills, bounties or progression.
  for (const helper of progressHelpers) {
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
      `Shared story fight started by ${session.name}: ${helpers.map((helper) => helper.name).join(', ')}. Assistance lasts up to 15 minutes while both captains remain connected, in-system and in the Armada. Captains on the same chapter, stage and branch share objective progress; each reports their own chapter for rewards. Other helpers receive ordinary combat bounties.`,
    );
  for (const helper of helpers)
    if (!progressHelpers.includes(helper))
      game.toast(
        helper,
        `${session.name}'s fight is not your current story step, so it won't advance your chapter. Your own encounter stays in the system.`,
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
