// Human captains explicitly opt in. Control is transient; ordinary ship physics still applies.
import { angDiff, DT } from '../shared/rules.js';

export function cancelFormation(game, s, reason) {
  if (!s.data.armadaFollow) return;
  s.data.armadaFollow = false;
  s.armadaFormationLeader = null;
  s.armadaFormationTarget = null;
  game.db.touch();
  game.toast(s, `Follow the Leader off: ${reason}.`);
  game.you(s);
}

// Conservative fleet envelope: personal escorts retain their existing slots around their captain.
export function fleetFootprint(space, root) {
  let radius = Math.max(70, root.st.size);
  for (const e of space.ships.values()) {
    if (e === root || e.dead || space.root(e) !== root) continue;
    const slot = Math.max(0, e.slot ?? e.escortSlot ?? 0);
    const ring = Math.floor(slot / 9);
    radius = Math.max(radius, 260 + root.st.size + ring * 100 + e.st.size);
  }
  return radius;
}

export function formationTargets(space) {
  const game = space.game,
    targets = new Map();
  for (const s of game.sessions.values())
    if (s.data?.sys === space.id) s.armadaFormationTarget = null;
  if (game.solo || !game.db?.world.armadas) return targets;
  for (const A of Object.values(game.db.world.armadas || {})) {
    const leader = game.features.coop.sessionOf(A.leader);
    const le = leader?.ent;
    // Slots use membership order, not currently online/active order. Turning Follow off
    // or reconnecting therefore cannot shuffle every remaining captain across the V.
    const followers = A.members.filter((n) => game.db.key(n) !== game.db.key(A.leader));
    let envelope = le ? fleetFootprint(space, le) : 70;
    for (const n of followers) {
      const e = game.features.coop.sessionOf(n)?.ent;
      if (e && space.ships.get(e.id) === e) envelope = Math.max(envelope, fleetFootprint(space, e));
    }
    const gap = Math.max(240, envelope * 2 + 100);
    followers.forEach((name, slot) => {
      const s = game.features.coop.sessionOf(name);
      if (!s?.data.armadaFollow || s.data.sys !== space.id) return;
      if (s.armadaFormationLeader !== A.leader) {
        cancelFormation(game, s, 'leader changed; re-enable to follow');
        return;
      }
      const e = s.ent;
      s.armadaFormationTarget = null;
      if (
        !e ||
        e.dead ||
        e.disabled ||
        e.state !== 'fly' ||
        !le ||
        le.dead ||
        le.disabled ||
        le.state !== 'fly' ||
        s.data.sys !== space.id ||
        leader.data.sys !== space.id ||
        space.ships.get(e.id) !== e ||
        space.ships.get(le.id) !== le ||
        e.autoCombat
      )
        return;
      const side = slot % 2 ? 1 : -1,
        row = Math.floor(slot / 2) + 1;
      const lat = side * row * gap,
        back = row * gap;
      const target = {
        x: le.x + Math.cos(le.a) * lat - Math.sin(le.a) * back,
        y: le.y + Math.sin(le.a) * lat + Math.cos(le.a) * back,
        vx: le.vx,
        vy: le.vy,
        a: le.a,
        slot,
        gap,
      };
      s.armadaFormationTarget = target;
      targets.set(e.id, target);
    });
  }
  return targets;
}

export function steerFormation(e, target) {
  const dx = target.x - e.x,
    dy = target.y - e.y,
    distance = Math.hypot(dx, dy);
  const relativeSpeed = Math.hypot(e.vx - target.vx, e.vy - target.vy);
  let turn,
    thrust = 0;
  if (distance < 24 && relativeSpeed < 3) {
    turn = angDiff(target.a, e.a);
  } else {
    // Proportional arrival with a braking/rotation-aware speed envelope. No position,
    // velocity or heading snapping, catch-up stat boosts, afterburner, or auto weapons.
    const speed = Math.min(
      e.st.maxSpeed * 0.85,
      distance * 0.22,
      Math.sqrt(2 * e.st.accel * distance) * 0.45,
    );
    const vx = target.vx + (distance ? (dx / distance) * speed : 0);
    const vy = target.vy + (distance ? (dy / distance) * speed : 0);
    const ex = vx - e.vx,
      ey = vy - e.vy;
    turn = angDiff(Math.atan2(ex, -ey), e.a);
    thrust = Math.abs(turn) < 0.3 && Math.hypot(ex, ey) > 2 ? 1 : 0;
  }
  e.inp = {
    turn: Math.abs(turn) < e.st.turn * DT ? turn / (e.st.turn * DT) : Math.sign(turn),
    thrust,
  };
}
