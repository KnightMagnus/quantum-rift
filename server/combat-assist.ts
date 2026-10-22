import type { Session } from './game.ts';
export type CombatConsent = { armada: string | number; leader: string };
export type CombatState = {
  on: boolean;
  consent: CombatConsent | null;
  coordinating: boolean;
  focus: boolean;
  target: number;
  status: string;
  reason: string;
  delegated?: boolean;
};
export type CombatPayload = {
  on: boolean;
  delegated: boolean;
  consent: boolean;
  coordinating: boolean;
  status: string;
  reason: string;
  target: number;
  power: number;
};
export type CombatCommand = {
  op: 'off' | 'manual' | 'assist' | 'coordinate' | 'delegate';
  on?: boolean;
};
export type CombatShipStats = { armor: number; shields?: number; speed?: number; cargo?: number };
export type ShipInputControl = {
  thrust?: number;
  turn?: number;
  fire1?: number;
  fire2?: number;
  ab?: number;
  rev?: number;
};
export type CombatEntity = import('./space.ts').Entity;
export type CombatInputFrame = {
  seq?: number;
  thrust?: number;
  turn?: number;
  ab?: number;
  rev?: number;
  fire1?: number;
  fire2?: number;
};
export type CombatSessionData = {
  sys: string;
  name: string;
  armada?: string | number | null;
  armadaFollow?: boolean;
};
export type CombatSession = Session;
export type CombatSystemInfo = {
  arena?: boolean;
  id?: string;
  name?: string;
  danger?: number;
  faction?: string;
};
export type CombatSpace = import('./space.ts').Space;
export type CombatGameHost = Pick<
  import('./game.ts').Game,
  'spaces' | 'features' | 'sessions' | 'send'
>;
// Server-authoritative, transient combat control. Never persists consent in saves.
import { winOdds } from '../shared/hostile.ts';

/**
 * Combat delegation consent granted to an armada leader.
 * CombatConsent fields:
 * armada: Unique armada identifier.
 * leader: Captain name of the armada leader.
 */

/**
 * Transient combat assist state tracked per player session.
 * CombatState fields:
 * on: Whether automated combat assistance is currently active.
 * consent: Active delegation consent granted to an armada leader, if any.
 * coordinating: Whether this session is coordinating combat targeting for follower ships.
 * focus: Whether manual focus fire targeting is active.
 * target: Target entity ID currently focused or acquired.
 * status: Operational status indicator ('OFF' | 'READY' | 'ENGAGING' | 'SUSPENDED').
 * reason: Human-readable explanation for state transitions or suspension.
 * [delegated]: Whether combat control is currently delegated to a coordinating leader.
 */

/**
 * Public combat assist telemetry and status payload sent to the client.
 * CombatPayload fields:
 * on: Whether combat assist is enabled.
 * delegated: Whether combat control is currently delegated to a leader.
 * consent: Whether delegation consent has been granted.
 * coordinating: Whether coordinating combat targeting for followers.
 * status: Current combat status ('OFF' | 'READY' | 'ENGAGING' | 'SUSPENDED').
 * reason: Explanation or reason for the current combat status.
 * target: Target entity ID.
 * power: Effective fleet and group combat power rating.
 */

/**
 * Client command payload for toggling or updating combat assist mode.
 * CombatCommand fields:
 * op: Combat operation command.
 * [on]: Enable/disable flag for state toggling.
 */

/**
 * Live computed ship performance stats.
 * CombatShipStats fields:
 * armor: Current maximum armor hitpoints.
 * [shields]: Maximum shield capacity.
 * [speed]: Maximum linear speed.
 * [cargo]: Cargo capacity.
 */

/**
 * Control inputs applied to ship physics simulation.
 * ShipInputControl fields:
 * [thrust]: Forward thruster input.
 * [turn]: Steering torque input.
 * [fire1]: Primary weapon fire command.
 * [fire2]: Secondary weapon fire command.
 * [ab]: Afterburner boost state.
 * [rev]: Reverse thrusters state.
 */

/**
 * Entity representation participating in or evaluated by combat assist.
 * CombatEntity fields:
 * id: Unique entity simulation ID.
 * [dead]: True if the ship is destroyed.
 * [disabled]: True if the ship is disabled and drifting.
 * state: Entity flight state ('fly', 'jumpout', 'landed').
 * armor: Current armor hitpoints.
 * st: Live computed ship stats containing max armor.
 * [player]: Player reference if this is a player-controlled ship.
 * [noDisable]: Exemption flag preventing disablement threshold.
 * [rescueT]: Rescue protection countdown timestamp.
 * [owner]: Entity ID of the commanding or parent ship.
 * [target]: Current active combat target entity.
 * [fireAt]: Secondary weapon fire target entity.
 * [inp]: Ship input control state.
 * [think]: Time until next AI decision cycle.
 * [autoCombat]: Whether automated combat maneuvers and weapon firing are enabled.
 * [combatTarget]: Shared combat target designated by assist or group leader.
 * [sharedCombat]: Whether participating in shared fleet or group combat.
 * [order]: Active fleet order ('hold', 'holdfire', 'loot', 'gather', etc.).
 * [orderSeq]: Monotonic sequence counter of fleet orders.
 * x: Coordinate X in 2D space.
 * y: Coordinate Y in 2D space.
 * [pw]: Effective combat power rating.
 * [strength]: Base combat strength rating.
 * [recall]: True if fighter drone is recalled to dock.
 * [lastHitBy]: Entity ID of attacker that dealt last damage.
 * hitT: Simulation timestamp when ship was last damaged.
 * [enemy]: Test or hostile flag.
 * [aggro]: Set of hostile entity IDs that have engaged this ship.
 */

/**
 * Command input frame received from player client.
 * CombatInputFrame fields:
 * [seq]: Sequence number.
 * [thrust]: Thrust control.
 * [turn]: Turn control.
 * [ab]: Afterburner.
 * [rev]: Reverse thrusters.
 * [fire1]: Primary fire.
 * [fire2]: Secondary fire.
 */

/**
 * Account save data fields accessed by combat assist.
 * CombatSessionData fields:
 * sys: Current solar system ID.
 * name: Captain name.
 * [armada]: Unique armada identifier.
 * [armadaFollow]: Whether following armada leader.
 */

/**
 * Player session structure managing combat assist state and ship reference.
 * CombatSession fields:
 * [combat]: Combat assist state for this session.
 * ent: Currently active ship entity in space.
 * data: Player account save data.
 * inputs: Pending input command queue.
 * [lastInput]: Most recent processed input.
 */

/**
 * System configuration parameters for combat space.
 * CombatSystemInfo fields:
 * [arena]: Whether system is a PvP combat arena.
 * [id]: System ID.
 * [name]: System name.
 * [danger]: Danger level.
 * [faction]: Controlling faction ID.
 */

/**
 * System space simulation environment containing ships and combat context.
 * CombatSpace fields:
 * id: Space system identifier.
 * sys: System configuration parameters.
 * ships: Map of entity ID to live ship entities.
 * t: Current simulation timestamp.
 * root: Resolves fleet root or parent commanding entity.
 * isHostile: Checks hostile relationship between entities.
 * canHit: Checks whether attacks can connect and damage target.
 * spared: Checks whether source faction spares target.
 * [newcomerTruce]: Checks ambient targeting truce without arrival grace.
 */

/**
 * Server game interface for combat coordination.
 * CombatGameHost fields:
 * spaces: Active solar system space instances.
 * features: Server feature services.
 * sessions: Active client sessions.
 * [send]: Message transmitter.
 */

/**
 * Maximum distance in space units for target engagement validity.
 */
const BOUNDARY: number = 2200;

/**
 * Fleet orders that halt or suppress offensive combat actions.
 */
const stoppedOrders: Set<string | undefined> = new Set(['hold', 'holdfire', 'loot']);

/**
 * Determines whether a ship entity is alive, flight-ready, and capable of combat.
 * @param entity Candidate ship entity to check.
 * @returns True if the entity is available for combat operations.
 */
export const available = (entity: CombatEntity | null | undefined): entity is CombatEntity =>
  !!entity &&
  !entity.dead &&
  !entity.disabled &&
  entity.state === 'fly' &&
  entity.armor > 0 &&
  !!(entity.player || entity.noDisable || (entity.st && entity.armor >= entity.st.armor * 0.15));

/**
 * Server-authoritative combat assistance coordinator managing targeting, fleet focus,
 * and armada delegation.
 */
export class CombatAssist {
  declare game: CombatGameHost;

  /**
   * Initializes the CombatAssist service.
   * @param game The root Game server instance.
   */
  constructor(game: CombatGameHost) {
    this.game = game;
  }

  /**
   * Retrieves or initializes the transient combat assist state for a session.
   * @param session Player session.
   * @returns Active combat assist state object.
   */
  state(session: CombatSession): CombatState {
    return (
      session.combat ||
      (session.combat = {
        on: false,
        consent: null,
        coordinating: false,
        focus: false,
        target: 0,
        status: 'OFF',
        reason: '',
      })
    );
  }

  /**
   * Suspends combat assist and clears combat targeting orders for a session and its escorts.
   * @param session Player session to stop.
   * @param reason Human-readable explanation for stopping.
   */
  stop(session: CombatSession, reason: string = 'Manual control'): void {
    const combatState = this.state(session);
    combatState.on = false;
    combatState.delegated = false;
    combatState.consent = null;
    combatState.coordinating = false;
    combatState.focus = false;
    combatState.target = 0;
    combatState.status = 'SUSPENDED';
    combatState.reason = reason;
    const space = session.data && this.game.spaces[session.data.sys];
    if (session.ent && space)
      for (const entity of space.ships.values())
        if (entity.owner && space.root(entity) === session.ent) {
          entity.target = null;
          entity.fireAt = null;
          entity.inp = {};
          entity.think = 0;
        }
    if (session.ent) {
      session.ent.autoCombat = false;
      session.ent.fireAt = null;
      session.ent.combatTarget = null;
      session.ent.sharedCombat = false;
      session.ent.inp = {};
    }
  }

  /**
   * Handles manual flight control input, suspending assist unless coordinating followers.
   * @param session Player session taking manual control.
   */
  manual(session: CombatSession): void {
    const combatState = this.state(session);
    // A leader may fly manually while still supplying the group's target.
    if (combatState.coordinating && !combatState.consent) {
      combatState.on = false;
      if (session.ent) {
        session.ent.autoCombat = false;
        session.ent.inp = {};
      }
      return;
    }
    this.stop(session);
  }

  /**
   * Processes a combat assist command operation from the client.
   * @param session Player session sending the command.
   * @param combatCommand Command message containing operation and parameters.
   */
  command(session: CombatSession, combatCommand: CombatCommand): void {
    const combatState = this.state(session),
      entity = session.ent;
    if (combatCommand.op === 'off') return this.stop(session, 'Combat assist off');
    if (combatCommand.op === 'manual') return this.manual(session);
    if (!available(entity) || this.game.spaces[session.data.sys].sys.arena || entity.rescueT)
      return;
    if (!['assist', 'coordinate', 'delegate'].includes(combatCommand.op)) return;
    if (combatCommand.op === 'assist') {
      combatState.on = combatCommand.on === true;
      combatState.focus = combatState.on;
      combatState.status = combatState.on ? 'READY' : 'OFF';
      combatState.reason = '';
      // Selection can precede arming: adopt it only on explicit enable, using the
      // same legal-NPC, protection and acquisition-range checks as active selection.
      if (combatState.on) this.selected(session, entity.target, this.game.spaces[session.data.sys]);
      else this.stop(session, 'Combat assist off');
    }
    if (combatCommand.op === 'coordinate') {
      combatState.coordinating = combatCommand.on === true;
      combatState.focus = combatState.coordinating || combatState.on;
    }
    if (combatCommand.op === 'delegate') {
      const armadaState = this.game.features.coop.armadaOf(session.data);
      combatState.consent =
        combatCommand.on === true &&
        armadaState &&
        session.data.armadaFollow &&
        armadaState.leader !== session.data.name
          ? { armada: armadaState.id, leader: armadaState.leader }
          : null;
      combatState.focus = combatState.on;
    }
    session.inputs.length = 0;
    session.lastInput = null;
    entity.inp = {};
    entity.order = 'gather';
    entity.orderSeq = (entity.orderSeq || 0) + 1;
  }

  /**
   * Selects an explicit target entity if valid and assist or coordination is enabled.
   * @param session Player session selecting a target.
   * @param entity Candidate target entity.
   * @param space Active space system instance.
   */
  selected(
    session: CombatSession,
    entity: CombatEntity | null | undefined,
    space: CombatSpace,
  ): void {
    const combatState = this.state(session);
    if (
      (combatState.on || combatState.focus || combatState.coordinating || combatState.consent) &&
      this.valid(space, session.ent!, entity)
    )
      combatState.target = entity.id;
  }

  /**
   * Directs local fleet focus fire on the player ship's current target.
   * @param session Player session initiating attack.
   * @param space Active space system instance.
   */
  attack(session: CombatSession, space: CombatSpace): void {
    const target = session.ent!.target;
    if (!target || !this.valid(space, session.ent!, target))
      return this.stop(session, 'Manual attack order');
    const combatState = this.state(session);
    // An explicit local order takes back authority before choosing this fleet's target.
    if (combatState.consent || combatState.delegated) this.stop(session, 'Local attack order');
    combatState.focus = true;
    combatState.reason = '';
    combatState.target = target.id;
  }

  /**
   * Checks whether a target entity is in range and eligible for engagement.
   * @param space Active space system instance.
   * @param lead Lead attacking entity.
   * @param entity Candidate target entity.
   * @returns True if the target is valid for engagement.
   */
  valid(
    space: CombatSpace,
    lead: CombatEntity,
    entity: CombatEntity | null | undefined,
  ): entity is CombatEntity {
    return (
      available(lead) &&
      available(entity) &&
      space.ships.get(entity.id) === entity &&
      !space.root(entity).player &&
      !space.sys.arena &&
      // Selecting a target and arming Assist is an explicit attack order, just like
      // manual primary fire or K/Attack: neutral NPCs are legal too. Never PvP/own wing.
      space.canHit(lead, entity) &&
      // Protection is directional: our arrival/newcomer truce limits NPC initiation,
      // not an explicitly selected player attack. Match the player-to-target canHit direction.
      !space.spared(lead, entity) &&
      Math.hypot(entity.x - lead.x, entity.y - lead.y) <= BOUNDARY
    );
  }

  /**
   * Resolves the active coordinating leader session for a delegated follower.
   * @param session Follower player session.
   * @param space Active space system instance.
   * @returns Coordinating leader session, or null if delegation is inactive or revoked.
   */
  delegation(session: CombatSession, space: CombatSpace): CombatSession | null {
    const combatState = this.state(session),
      armadaState = this.game.features.coop.armadaOf(session.data);
    if (!combatState.consent) return null;
    const leader = armadaState && this.game.features.coop.sessionOf(armadaState.leader);
    if (
      !armadaState ||
      armadaState.id !== combatState.consent.armada ||
      armadaState.leader !== combatState.consent.leader ||
      !armadaState.members.includes(session.data.name) ||
      !session.data.armadaFollow ||
      !leader ||
      leader === session ||
      !available(leader.ent) ||
      !available(session.ent) ||
      leader.data.sys !== session.data.sys ||
      stoppedOrders.has(session.ent.order) ||
      space.sys.arena
    ) {
      this.stop(session, 'Delegation revoked');
      return null;
    }
    // Coordination may be enabled after consent; this does not transfer consent to another leader.
    return this.state(leader).coordinating ? leader : null;
  }

  /**
   * Gathers all follower sessions in the same system delegated to the specified leader.
   * @param space Active space system instance.
   * @param leadSession Leading coordinator session.
   * @returns Group of sessions including leader and consenting followers.
   */
  group(space: CombatSpace, leadSession: CombatSession): CombatSession[] {
    return [
      leadSession,
      ...[...this.game.sessions.values()].filter(
        (session) =>
          session !== leadSession &&
          session.data &&
          session.data.sys === space.id &&
          this.delegation(session, space) === leadSession,
      ),
    ];
  }

  /**
   * Computes aggregate combat power rating for a group of participating sessions and escorts.
   * @param space Active space system instance.
   * @param sessions Group of participating player sessions.
   * @returns Combined combat power rating.
   */
  power(space: CombatSpace, sessions: CombatSession[]): number {
    const roots = new Set(sessions.map((session) => session.ent).filter(available));
    let power = 0;
    for (const entity of space.ships.values())
      if (
        available(entity) &&
        roots.has(space.root(entity)) &&
        !entity.recall &&
        (roots.has(entity) || !stoppedOrders.has(space.root(entity).order))
      )
        power += (entity.pw || entity.strength || 10) * (roots.has(entity) ? 1 : 0.6);
    return power;
  }

  /**
   * Generates public combat status telemetry for transmission to a client session.
   * @param session Player session.
   * @param space Active space system instance.
   * @returns Serialized combat telemetry payload.
   */
  payload(session: CombatSession, space: CombatSpace): CombatPayload {
    const combatState = this.state(session),
      leader = this.delegation(session, space) || session;
    return {
      on: combatState.on,
      delegated: !!combatState.delegated,
      consent: !!combatState.consent,
      coordinating: combatState.coordinating,
      status: combatState.status,
      reason: combatState.reason,
      target: combatState.target,
      power: this.power(space, this.group(space, leader)),
    };
  }

  /**
   * Evaluates targets, delegation hierarchy, and engagement priorities across all ships in space.
   * @param space Active space system instance.
   */
  resolve(space: CombatSpace): void {
    const sessions = [...this.game.sessions.values()].filter(
      (session): session is CombatSession & { ent: CombatEntity } =>
        Boolean(
          session.data &&
          session.data.sys === space.id &&
          session.ent &&
          space.ships.get(session.ent.id) === session.ent,
        ),
    );
    for (const session of sessions) {
      const combatState = this.state(session);
      if (
        !available(session.ent) ||
        space.sys.arena ||
        session.ent.rescueT ||
        stoppedOrders.has(session.ent.order)
      ) {
        if (combatState.on || combatState.consent || combatState.focus || combatState.coordinating)
          this.stop(session, 'Flight state or fleet order');
      }
    }
    const leaders = new Map(sessions.map((session) => [session, this.delegation(session, space)]));
    for (const session of sessions) {
      const combatState = this.state(session);
      if (combatState.delegated && !leaders.get(session))
        this.stop(session, 'Leader stopped coordination');
      combatState.delegated = !!leaders.get(session);
      session.ent.sharedCombat = !!(
        combatState.focus ||
        combatState.on ||
        combatState.delegated ||
        combatState.coordinating
      );
      session.ent.autoCombat = false;
      session.ent.combatTarget = null;
    }
    for (const session2 of sessions) {
      if (leaders.get(session2)) continue;
      const combatState = this.state(session2),
        group = sessions.filter(
          (session) => session === session2 || leaders.get(session) === session2,
        ),
        roots = new Set(group.map((session) => session.ent));
      if (!session2.ent.sharedCombat) continue;
      let target = space.ships.get(combatState.target);
      if (!this.valid(space, session2.ent, target)) {
        const power = this.power(space, group);
        const attackers = [...space.ships.values()].filter(
          (entity) =>
            this.valid(space, session2.ent, entity) &&
            // Passive Assist only defends against hostile attackers; it never hunts
            // neutral traffic merely because our primary guns could damage it.
            space.isHostile(session2.ent, entity) &&
            // Stray fire during protected travel must not silently turn passive
            // Assist into an opt-in faction battle. Explicit selection above still can.
            !space.newcomerTruce?.(entity, session2.ent) &&
            ((entity.target && roots.has(space.root(entity.target))) ||
              [...space.ships.values()].some(
                (entity2) =>
                  roots.has(space.root(entity2)) &&
                  entity2.lastHitBy === entity.id &&
                  space.t - entity2.hitT! < 8,
              )),
        );
        attackers.sort(
          (leftEntity, rightEntity) =>
            winOdds(power, leftEntity.pw || 10) - winOdds(power, rightEntity.pw || 10) ||
            Math.hypot(leftEntity.x - session2.ent.x, leftEntity.y - session2.ent.y) -
              Math.hypot(rightEntity.x - session2.ent.x, rightEntity.y - session2.ent.y) ||
            leftEntity.id - rightEntity.id,
        );
        target = attackers[0] || null;
      }
      for (const session of group) {
        const combatState = this.state(session);
        combatState.target = target ? target.id : 0;
        combatState.status = target ? 'ENGAGING' : 'READY';
        combatState.reason = '';
        session.ent.combatTarget = target;
        session.ent.sharedCombat = true;
        session.ent.autoCombat = !!(combatState.on || leaders.get(session));
      }
    }
    // Preassign before entity iteration, including recall/hold overrides, so no stale offensive target survives a handoff.
    for (const entity of space.ships.values())
      if (entity.owner && space.root(entity).sharedCombat) {
        const root = space.root(entity);
        entity.target =
          !entity.recall &&
          !stoppedOrders.has(root.order) &&
          this.valid(space, root, root.combatTarget)
            ? root.combatTarget
            : null;
        entity.fireAt = null;
      }
  }
}
