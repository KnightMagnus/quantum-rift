export interface AutopilotState {
  mode?: string;
  t?: number;
  vx?: number;
  vy?: number;
  dest?: { x: number; y: number };
  phase?: 'approach' | 'brake';
  settled?: number;
  sent?: number;
}
export interface AutopilotShip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  t?: number;
}
export interface LandingPort {
  x: number;
  y: number;
  r: number;
}
export interface FlightStats {
  accel: number;
  turn: number;
  maxSpeed: number;
}
// Landing-only guidance. Manual flight and server landing limits are unchanged.
import { DT as tickDuration, wrap } from '../shared/rules.ts';

/**
 * Steer toward a landing volume, then commit to a retrograde braking pass.
 * Retain the phase instead of repeatedly alternating approach and brake headings.
 * @param state Autopilot state retained across ticks.
 * @param ship Predicted player ship.
 * @param stats Computed hull/outfit flight stats.
 * @param port Target landable body.
 * @param input Controls modified in place.
 */
export function landingGuidance(
  state: AutopilotState,
  ship: AutopilotShip,
  stats: FlightStats,
  port: LandingPort,
  input: Record<string, number>,
) {
  input.thrust = input.turn = input.rev = input.ab = 0;
  const deltaX = port.x - ship.x,
    deltaY = port.y - ship.y,
    distance = Math.hypot(deltaX, deltaY),
    speed = Math.hypot(ship.vx, ship.vy),
    pulse = stats.accel * tickDuration,
    stopped = Math.max(2, pulse * 0.55);
  if (state.phase === 'brake' && speed <= stopped && distance > port.r + 25)
    state.phase = 'approach'; // An initial outward drift may stop outside the landing volume.
  if (distance <= port.r + 10) state.phase = 'brake';
  if (state.phase === 'brake') {
    if (speed <= stopped) return;
    // The existing retrograde control rotates by at most turn*DT and aligns exactly.
    // Stop before a discrete thrust pulse reverses the residual velocity.
    const wrap2 = wrap(Math.atan2(-ship.vx, ship.vy) - ship.a);
    input.rev = 1;
    input.thrust = Math.abs(wrap2) <= stats.turn * tickDuration + 0.02 ? 1 : 0;
    return;
  }
  state.phase = 'approach';
  const remaining = Math.max(0, distance - port.r * 0.4),
    speedLimit = Math.min(
      stats.maxSpeed,
      Math.sqrt(2 * stats.accel * remaining) * 0.65,
      remaining / (Math.PI / stats.turn + 0.6),
    ),
    velocityErrorX = (deltaX / (distance || 1)) * speedLimit - ship.vx,
    velocityErrorY = (deltaY / (distance || 1)) * speedLimit - ship.vy;
  const deadband = Math.max(3, pulse * 0.6),
    lateral = (ship.vx * deltaY - ship.vy * deltaX) / (distance || 1),
    // Cruise orientation is a policy, not the direction of a near-zero velocity
    // error. At the speed ceiling that error can point sideways or backwards.
    // Keep real lateral correction and the existing turn-time/stopping envelope.
    cruise =
      speedLimit === stats.maxSpeed &&
      Math.abs(lateral) < deadband &&
      ship.vx * deltaX + ship.vy * deltaY >= 0,
    correcting = Math.hypot(velocityErrorX, velocityErrorY) >= deadband,
    heading =
      cruise || !correcting
        ? Math.atan2(deltaX, -deltaY)
        : Math.atan2(velocityErrorX, -velocityErrorY),
    wrap3 = wrap(heading - ship.a);
  input.turn =
    Math.abs(wrap3) < 0.002
      ? 0
      : Math.abs(wrap3) < stats.turn * tickDuration
        ? wrap3 / (stats.turn * tickDuration)
        : Math.sign(wrap3);
  input.thrust = Math.abs(wrap3) < 0.15 ? 1 : 0;
}

/**
 * Require a settled prediction AND a recent authoritative snapshot well inside
 * the server's radius/speed limits before sending the one landing request.
 * @param state Retained autopilot state.
 * @param ship Predicted ship.
 * @param authority Last server ship snapshot.
 * @param stats Computed flight stats.
 * @param port Landing target.
 * @param currentTime Monotonic browser time in milliseconds.
 * @returns Whether to send the landing request this tick.
 */
export function landingReady(
  state: AutopilotState,
  ship: AutopilotShip,
  authority: AutopilotShip | null,
  stats: FlightStats,
  port: LandingPort,
  currentTime: number,
) {
  const maxSpeed = Math.max(2, stats.accel * tickDuration * 0.55),
    inside = (autopilotShip: AutopilotShip | null | undefined) =>
      autopilotShip &&
      Math.hypot(autopilotShip.x - port.x, autopilotShip.y - port.y) <= port.r + 25 &&
      Math.hypot(autopilotShip.vx, autopilotShip.vy) <= maxSpeed + 1;
  if (
    state.phase !== 'brake' ||
    !inside(ship) ||
    !inside(authority) ||
    currentTime - authority!.t! > 300
  ) {
    state.settled = 0;
    return false;
  }
  state.settled = (state.settled || 0) + 1;
  if (state.settled < 6 || state.sent) return false;
  state.sent = currentTime;
  return true;
}

/** A landable body that the L key can pick. */
export interface LandingCandidate {
  /** Stellar body ID. */
  id: string;

  /** World X position. */
  x: number;

  /** World Y position. */
  y: number;
}

/** What the player has highlighted when L is pressed. */
export interface LandingIntent {
  /** Nav point the player clicked, or null when nav was set automatically. */
  pickedNav: string | null;

  /** Stellar body of the pinned objective, when it has one. */
  pinnedStellar: string | null;

  /** Stellar bodies named by any active mission objective. */
  missionStellars: string[];
}

/**
 * Chooses the body that L lands on. A clicked nav point wins, then the pinned
 * objective, then the nearest mission destination, then the nearest landable body.
 * @param candidates Landable bodies in the current system.
 * @param ship Player position.
 * @param intent Highlighted nav point and mission destinations.
 * @returns The chosen body, or undefined when nothing here is landable.
 */
export function chooseLandingPort<Candidate extends LandingCandidate>(
  candidates: Candidate[],
  ship: { x: number; y: number },
  intent: LandingIntent,
): Candidate | undefined {
  const byDistance = [...candidates].sort(
    (first, second) =>
      Math.hypot(first.x - ship.x, first.y - ship.y) -
      Math.hypot(second.x - ship.x, second.y - ship.y),
  );
  const named = (id: string | null) => (id ? byDistance.find((body) => body.id === id) : undefined);
  return (
    named(intent.pickedNav) ??
    named(intent.pinnedStellar) ??
    byDistance.find((body) => intent.missionStellars.includes(body.id)) ??
    byDistance[0]
  );
}
