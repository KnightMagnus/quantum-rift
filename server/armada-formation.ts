import type { Game, Session, FormationTarget } from './game.ts';
import type { Space, Entity } from './space.ts';

// Human captains explicitly opt in. Control is transient; ordinary ship physics still applies.
import { angDiff, DT as tickDuration } from '../shared/rules.ts';

export function cancelFormation(game: Game, session: Session, reason: string): void {
  if (!session.data.armadaFollow) return;
  session.data.armadaFollow = false;
  session.armadaFormationLeader = null;
  session.armadaFormationTarget = null;
  game.db.touch();
  game.toast(session, `Follow the Leader off: ${reason}.`);
  game.you(session);
}

// Conservative fleet envelope: personal escorts retain their existing slots around their captain.
export function fleetFootprint(space: Space, root: Entity): number {
  let radius = Math.max(70, root.st.size);
  for (const entity of space.ships.values()) {
    if (entity === root || entity.dead || space.root(entity) !== root) continue;
    const slot = Math.max(0, entity.slot ?? entity.escortSlot ?? 0);
    const ring = Math.floor(slot / 9);
    radius = Math.max(radius, 260 + root.st.size + ring * 100 + entity.st.size);
  }
  return radius;
}

export function formationTargets(space: Space): Map<number, FormationTarget> {
  const game = space.game,
    targets = new Map<number, FormationTarget>();
  for (const session of game.sessions.values())
    if (session.data?.sys === space.id) session.armadaFormationTarget = null;
  if (game.solo || !game.db?.world.armadas) return targets;
  for (const armadaState of Object.values(game.db.world.armadas || {})) {
    const leader = game.features.coop.sessionOf(armadaState.leader);
    const entity = leader?.ent;
    // Slots use membership order, not currently online/active order. Turning Follow off
    // or reconnecting therefore cannot shuffle every remaining captain across the V.
    const followers = armadaState.members.filter(
      (count) => game.db.key(count) !== game.db.key(armadaState.leader),
    );
    let envelope = entity ? fleetFootprint(space, entity) : 70;
    for (const follower of followers) {
      const entity = game.features.coop.sessionOf(follower)?.ent;
      if (entity && space.ships.get(entity.id) === entity)
        envelope = Math.max(envelope, fleetFootprint(space, entity));
    }
    const formationGap = Math.max(240, envelope * 2 + 100);
    followers.forEach((name, slot) => {
      const session = game.features.coop.sessionOf(name);
      if (!session?.data.armadaFollow || session.data.sys !== space.id) return;
      if (session.armadaFormationLeader !== armadaState.leader) {
        cancelFormation(game, session, 'leader changed; re-enable to follow');
        return;
      }
      const entity3 = session.ent;
      session.armadaFormationTarget = null;
      if (
        !entity3 ||
        entity3.dead ||
        entity3.disabled ||
        entity3.state !== 'fly' ||
        !entity ||
        entity.dead ||
        entity.disabled ||
        entity.state !== 'fly' ||
        session.data.sys !== space.id ||
        leader!.data.sys !== space.id ||
        space.ships.get(entity3.id) !== entity3 ||
        space.ships.get(entity.id) !== entity ||
        entity3.autoCombat
      )
        return;
      const side = slot % 2 ? 1 : -1,
        rowIndex = Math.floor(slot / 2) + 1;
      const lateralOffset = side * rowIndex * formationGap,
        back = rowIndex * formationGap;
      const target = {
        x: entity.x + Math.cos(entity.a) * lateralOffset - Math.sin(entity.a) * back,
        y: entity.y + Math.sin(entity.a) * lateralOffset + Math.cos(entity.a) * back,
        vx: entity.vx,
        vy: entity.vy,
        a: entity.a,
        slot,
        gap: formationGap,
      };
      session.armadaFormationTarget = target;
      targets.set(entity3.id, target);
    });
  }
  return targets;
}

export function steerFormation(entity: Entity, target: FormationTarget): void {
  const deltaX = target.x - entity.x,
    deltaY = target.y - entity.y,
    distance = Math.hypot(deltaX, deltaY);
  const relativeSpeed = Math.hypot(entity.vx - target.vx, entity.vy - target.vy);
  // A full physics tick is an indivisible thrust pulse. Do not chase corrections
  // smaller than that pulse, or the ship continually flips between braking and
  // accelerating instead of coasting with its leader.
  const velocityTolerance = Math.max(2, entity.st.accel * tickDuration * 0.55);
  const holding = entity.formationHolding
    ? distance < 60 && relativeSpeed < velocityTolerance
    : distance < 24 && relativeSpeed < velocityTolerance;
  entity.formationHolding = holding;
  let turn,
    thrust = 0;
  if (holding) {
    turn = angDiff(target.a, entity.a);
  } else {
    // Proportional arrival with a braking/rotation-aware speed envelope. No position,
    // velocity or heading snapping, catch-up stat boosts, afterburner, or auto weapons.
    const speed = Math.min(
      entity.st.maxSpeed * 0.85,
      distance * Math.min(0.22, entity.st.turn * 0.2),
      Math.sqrt(2 * entity.st.accel * distance) * 0.45,
    );
    let velocityX = target.vx + (distance ? (deltaX / distance) * speed : 0);
    let velocityY = target.vy + (distance ? (deltaY / distance) * speed : 0);
    // Bound the *world* velocity, not only the relative arrival correction.
    // Otherwise a same-speed leader can request an unreachable velocity forever.
    const desiredSpeed = Math.hypot(velocityX, velocityY);
    if (desiredSpeed > entity.st.maxSpeed) {
      velocityX *= entity.st.maxSpeed / desiredSpeed;
      velocityY *= entity.st.maxSpeed / desiredSpeed;
    }
    const velocityErrorX = velocityX - entity.vx,
      velocityErrorY = velocityY - entity.vy;
    const correction = Math.hypot(velocityErrorX, velocityErrorY);
    turn = angDiff(
      correction < velocityTolerance ? target.a : Math.atan2(velocityErrorX, -velocityErrorY),
      entity.a,
    );
    thrust = Math.abs(turn) < 0.03 && correction > velocityTolerance ? 1 : 0;
  }
  entity.inp = {
    turn:
      Math.abs(turn) < entity.st.turn * tickDuration
        ? turn / (entity.st.turn * tickDuration)
        : Math.sign(turn),
    thrust,
  };
}
