import type { Session } from './game.ts';
import type { Entity, Space } from './space.ts';
/** Bounded connection-local notice produced by an actual patrol scan. */
export interface RecentPatrolScan {
  /** System where the scan completed. */
  system: string;
  /** Recipient ship identity; a replacement ship cannot inherit the notice. */
  entity: number;
  /** Exclusive expiry in server wall-clock milliseconds. */
  until: number;
}
/** Recipient-only presentation flags; never includes source or target identities. */
export interface AttentionPayload {
  /** Another live ship has selected this captain for combat. */
  targeted: boolean;
  /** A real patrol scan completed within the last three seconds. */
  scanned: boolean;
}
/** Projects live authoritative intent without publishing other ships' targets. */
export function attentionPayload(
  session: Session,
  space: Space,
  now = Date.now(),
): AttentionPayload {
  const recipient = session.ent;
  const inactive = { targeted: false, scanned: false };
  if (
    !recipient ||
    recipient.dead ||
    recipient.state !== 'fly' ||
    session.data.stellar ||
    space.ships.get(recipient.id) !== recipient
  )
    return inactive;
  let targeted = false;
  for (const source of space.ships.values()) {
    if (source === recipient || source.dead || source.disabled || source.state !== 'fly') continue;
    const target: Entity | null | undefined = source.autoCombat
      ? source.combatTarget
      : source.player
        ? source.target
        : source.fireAt;
    if (target !== recipient) continue;
    if (
      !source.player ||
      source.autoCombat ||
      space.isHostile(source, recipient) ||
      source.inp?.fire1 ||
      source.inp?.fire2
    ) {
      targeted = true;
      break;
    }
  }
  return {
    targeted,
    scanned:
      session.attentionScan?.entity === recipient.id &&
      session.attentionScan.system === space.id &&
      session.attentionScan.until > now,
  };
}
