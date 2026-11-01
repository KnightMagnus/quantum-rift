import type { Game, Session } from './game.ts';
import type { Space } from './space.ts';
import type { EncounterFeedback } from '../shared/encounter-feedback.ts';
import { nhalTelegraph } from './nhal.ts';
import { storyParticipant } from './shared-story.ts';

/** Caller passes the recipient's already-filtered ship IDs, never the unfiltered system roster. */
export function encounterFeedback(
  game: Pick<Game, 'sessions'>,
  session: Session,
  space: Space,
  visibleIds: ReadonlySet<number>,
): EncounterFeedback[] {
  if (!session.ent || session.ent.dead || session.data.sys !== space.id) return [];
  return [...space.ships.values()]
    .filter(
      (entity) =>
        visibleIds.has(entity.id) &&
        !entity.dead &&
        (!entity.story || storyParticipant(game, entity, session.id)),
    )
    .map((entity) => ({ entity, ability: nhalTelegraph(space, entity) }))
    .filter(({ entity, ability }) => entity.boss || entity.dread || entity.storyKill || ability)
    .sort(
      (left, right) =>
        Math.hypot(left.entity.x - session.ent!.x, left.entity.y - session.ent!.y) -
        Math.hypot(right.entity.x - session.ent!.x, right.entity.y - session.ent!.y),
    )
    .slice(0, 6)
    .map(({ entity, ability }) => ({
      id: entity.id,
      name: entity.name || space.A.ships[entity.hull]?.name || 'Encounter',
      health: Math.max(
        0,
        Math.min(
          1,
          (entity.armor + entity.shield) / Math.max(1, entity.st.armor + entity.st.shield),
        ),
      ),
      x: entity.x,
      y: entity.y,
      ...(ability ? { ability } : {}),
    }));
}
