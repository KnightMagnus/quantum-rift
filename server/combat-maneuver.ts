import type { Entity, Space } from './space.ts';

/** The live steering capability used by shared NPC and Assist maneuvering. */
export type CombatSteering = Pick<Space, 'steer'>;

/** Choose approach, retreat or broadside movement without owning targets or weapon discharge. */
export function maneuverCombat(steering: CombatSteering, attacker: Entity, target: Entity): void {
  const available = attacker.guns.filter((mount) => !mount.p.pd && !mount.p.bay && mount.ammo > 0);
  const primary = available.filter((mount) => !mount.sec);
  // Both NPCs and Assist close for their primary battery. A long-range
  // secondary must not keep the ship outside its main guns' effective range.
  const battery = primary.length ? primary : available;
  const batteryRange = battery.length ? Math.max(...battery.map((mount) => mount.p.range)) : 300;
  const deltaX = target.x - attacker.x,
    deltaY = target.y - attacker.y,
    distance = Math.hypot(deltaX, deltaY);
  const lead = Math.min(1.2, distance / 600);
  const leadX = target.x + (target.vx - attacker.vx) * lead,
    leadY = target.y + (target.vy - attacker.vy) * lead;
  if (
    attacker.st.size >= 110 &&
    attacker.st.turrets >= 2 &&
    distance < batteryRange * 1.1 &&
    distance > Math.max(140, attacker.st.size)
  ) {
    // capitals with turrets circle and fire broadsides instead of ramming
    const side = attacker.id % 2 ? 1 : -1,
      targetAngle =
        Math.atan2(deltaX, -deltaY) +
        side *
          (Math.PI / 2 -
            (distance > batteryRange * 0.8 ? 0.35 : distance < batteryRange * 0.5 ? -0.35 : 0));
    steering.steer(
      attacker,
      attacker.x + Math.sin(targetAngle) * 300,
      attacker.y - Math.cos(targetAngle) * 300,
      false,
    );
    attacker.inp.thrust =
      Math.hypot(attacker.vx, attacker.vy) < attacker.st.maxSpeed * 0.6 ? attacker.inp.thrust : 0;
  } else if (distance > batteryRange * 0.75) steering.steer(attacker, leadX, leadY, false);
  else if (distance < Math.max(120, attacker.st.size * 0.9)) {
    const away = Math.atan2(-deltaX, deltaY) + 0.8;
    steering.steer(
      attacker,
      attacker.x + Math.sin(away) * 300,
      attacker.y - Math.cos(away) * 300,
      false,
    );
  } else {
    steering.steer(attacker, leadX, leadY, false);
    attacker.inp.thrust =
      Math.hypot(attacker.vx, attacker.vy) < attacker.st.maxSpeed * 0.5 ? attacker.inp.thrust : 0;
  }
  attacker.fireAt = target;
}
