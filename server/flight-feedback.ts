import type { Session } from './game.ts';
import type { Space } from './space.ts';
/** Same-system Armada contact, visible only to that Armada. */
export interface ArmadaContact {
  /** Live captain ship ID. */
  id: number;
  /** Captain display name. */
  name: string;
  /** Authoritative position. */
  x: number;
  /** Authoritative position. */
  y: number;
  /** Whether this contact can currently perform a rescue. */
  canRescue: boolean;
  /** Seconds until insurance takes over, or zero when not awaiting rescue. */
  rescueSeconds: number;
}
/** Recipient-only rescue timing and same-system Armada contacts. */
export interface FlightFeedback {
  /** Seconds left on this captain's rescue window. */
  rescueSeconds: number;
  /** Captain ships only; excludes docked, dead and unrelated players. */
  contacts: ArmadaContact[];
}
/** Projects the existing rescue state without changing its deadline or eligibility. */
export function flightFeedbackPayload(session: Session, space: Space): FlightFeedback {
  const entity = session.ent;
  const empty = { rescueSeconds: 0, contacts: [] };
  if (
    !entity ||
    entity.dead ||
    entity.state !== 'fly' ||
    session.data.stellar ||
    !session.data.armada
  )
    return empty;
  const seconds = (deadline?: number) => Math.max(0, Math.ceil((deadline || 0) - space.t));
  return {
    rescueSeconds: seconds(entity.rescueT),
    contacts: [...space.ships.values()]
      .filter(
        (mate) =>
          mate !== entity &&
          !mate.dead &&
          mate.state === 'fly' &&
          !!mate.player?.s?.data &&
          mate.player.s.data.armada === session.data.armada,
      )
      .map((mate) => ({
        id: mate.id,
        name: mate.player!.name,
        x: mate.x,
        y: mate.y,
        canRescue: !mate.disabled,
        rescueSeconds: seconds(mate.rescueT),
      })),
  };
}
