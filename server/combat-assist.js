// @ts-check
// Server-authoritative, transient combat control. Never persists consent in saves.
import { winOdds } from '../shared/hostile.js';

/** @import { FeatureServices } from './features.js' */
/** @import { Session } from './game.js' */
/** @import { NetworkMessage } from './message-registry.js' */

/**
 * Combat delegation consent granted to an armada leader.
 * @typedef {object} CombatConsent
 * @property {string | number} armada Unique armada identifier.
 * @property {string} leader Captain name of the armada leader.
 */

/**
 * Transient combat assist state tracked per player session.
 * @typedef {object} CombatState
 * @property {boolean} on Whether automated combat assistance is currently active.
 * @property {CombatConsent | null} consent Active delegation consent granted to an armada leader, if any.
 * @property {boolean} coordinating Whether this session is coordinating combat targeting for follower ships.
 * @property {boolean} focus Whether manual focus fire targeting is active.
 * @property {number} target Target entity ID currently focused or acquired.
 * @property {string} status Operational status indicator ('OFF' | 'READY' | 'ENGAGING' | 'SUSPENDED').
 * @property {string} reason Human-readable explanation for state transitions or suspension.
 * @property {boolean} [delegated] Whether combat control is currently delegated to a coordinating leader.
 */

/**
 * Public combat assist telemetry and status payload sent to the client.
 * @typedef {object} CombatPayload
 * @property {boolean} on Whether combat assist is enabled.
 * @property {boolean} delegated Whether combat control is currently delegated to a leader.
 * @property {boolean} consent Whether delegation consent has been granted.
 * @property {boolean} coordinating Whether coordinating combat targeting for followers.
 * @property {string} status Current combat status ('OFF' | 'READY' | 'ENGAGING' | 'SUSPENDED').
 * @property {string} reason Explanation or reason for the current combat status.
 * @property {number} target Target entity ID.
 * @property {number} power Effective fleet and group combat power rating.
 */

/**
 * Client command payload for toggling or updating combat assist mode.
 * @typedef {object} CombatCommand
 * @property {'off' | 'manual' | 'assist' | 'coordinate' | 'delegate'} op Combat operation command.
 * @property {boolean} [on] Enable/disable flag for state toggling.
 */

/**
 * Live computed ship performance stats.
 * @typedef {object} CombatShipStats
 * @property {number} armor Current maximum armor hitpoints.
 * @property {number} [shields] Maximum shield capacity.
 * @property {number} [speed] Maximum linear speed.
 * @property {number} [cargo] Cargo capacity.
 */

/**
 * Control inputs applied to ship physics simulation.
 * @typedef {object} ShipInputControl
 * @property {number} [thrust] Forward thruster input.
 * @property {number} [turn] Steering torque input.
 * @property {number} [fire1] Primary weapon fire command.
 * @property {number} [fire2] Secondary weapon fire command.
 * @property {number} [ab] Afterburner boost state.
 * @property {number} [rev] Reverse thrusters state.
 */

/**
 * Entity representation participating in or evaluated by combat assist.
 * @typedef {object} CombatEntity
 * @property {number} id Unique entity simulation ID.
 * @property {boolean} [dead] True if the ship is destroyed.
 * @property {boolean} [disabled] True if the ship is disabled and drifting.
 * @property {string} state Entity flight state ('fly', 'jumpout', 'landed').
 * @property {number} armor Current armor hitpoints.
 * @property {CombatShipStats} st Live computed ship stats containing max armor.
 * @property {Session | null} [player] Player reference if this is a player-controlled ship.
 * @property {boolean} [noDisable] Exemption flag preventing disablement threshold.
 * @property {number} [rescueT] Rescue protection countdown timestamp.
 * @property {number | null} [owner] Entity ID of the commanding or parent ship.
 * @property {CombatEntity | null} [target] Current active combat target entity.
 * @property {CombatEntity | null} [fireAt] Secondary weapon fire target entity.
 * @property {ShipInputControl} [inp] Ship input control state.
 * @property {number} [think] Time until next AI decision cycle.
 * @property {boolean} [autoCombat] Whether automated combat maneuvers and weapon firing are enabled.
 * @property {CombatEntity | null} [combatTarget] Shared combat target designated by assist or group leader.
 * @property {boolean} [sharedCombat] Whether participating in shared fleet or group combat.
 * @property {string} [order] Active fleet order ('hold', 'holdfire', 'loot', 'gather', etc.).
 * @property {number} [orderSeq] Monotonic sequence counter of fleet orders.
 * @property {number} x Coordinate X in 2D space.
 * @property {number} y Coordinate Y in 2D space.
 * @property {number} [pw] Effective combat power rating.
 * @property {number} [strength] Base combat strength rating.
 * @property {boolean} [recall] True if fighter drone is recalled to dock.
 * @property {number} [lastHitBy] Entity ID of attacker that dealt last damage.
 * @property {number} hitT Simulation timestamp when ship was last damaged.
 * @property {boolean} [enemy] Test or hostile flag.
 * @property {Set<number>} [aggro] Set of hostile entity IDs that have engaged this ship.
 */

/**
 * Command input frame received from player client.
 * @typedef {object} CombatInputFrame
 * @property {number} [seq] Sequence number.
 * @property {number} [thrust] Thrust control.
 * @property {number} [turn] Turn control.
 * @property {number} [ab] Afterburner.
 * @property {number} [rev] Reverse thrusters.
 * @property {number} [fire1] Primary fire.
 * @property {number} [fire2] Secondary fire.
 */

/**
 * Account save data fields accessed by combat assist.
 * @typedef {object} CombatSessionData
 * @property {string} sys Current solar system ID.
 * @property {string} name Captain name.
 * @property {string | number} [armada] Unique armada identifier.
 * @property {boolean} [armadaFollow] Whether following armada leader.
 */

/**
 * Player session structure managing combat assist state and ship reference.
 * @typedef {object} CombatSession
 * @property {CombatState} [combat] Combat assist state for this session.
 * @property {CombatEntity} ent Currently active ship entity in space.
 * @property {CombatSessionData} data Player account save data.
 * @property {CombatInputFrame[]} inputs Pending input command queue.
 * @property {CombatInputFrame | null} [lastInput] Most recent processed input.
 */

/**
 * System configuration parameters for combat space.
 * @typedef {object} CombatSystemInfo
 * @property {boolean} [arena] Whether system is a PvP combat arena.
 * @property {string} [id] System ID.
 * @property {string} [name] System name.
 * @property {number} [danger] Danger level.
 * @property {string} [faction] Controlling faction ID.
 */

/**
 * System space simulation environment containing ships and combat context.
 * @typedef {object} CombatSpace
 * @property {string} id Space system identifier.
 * @property {CombatSystemInfo} sys System configuration parameters.
 * @property {Map<number, CombatEntity>} ships Map of entity ID to live ship entities.
 * @property {number} t Current simulation timestamp.
 * @property {(entity: CombatEntity) => CombatEntity} root Resolves fleet root or parent commanding entity.
 * @property {(lead: CombatEntity, target: CombatEntity) => boolean} isHostile Checks hostile relationship between entities.
 * @property {(attacker: CombatEntity, target: CombatEntity) => boolean} canHit Checks whether attacks can connect and damage target.
 * @property {(source: CombatEntity, target: CombatEntity) => boolean} spared Checks whether source faction spares target.
 * @property {(source: CombatEntity, target: CombatEntity) => boolean} [newcomerTruce] Checks ambient targeting truce without arrival grace.
 */

/**
 * Server game interface for combat coordination.
 * @typedef {object} CombatGameHost
 * @property {Record<string, CombatSpace>} spaces Active solar system space instances.
 * @property {FeatureServices} features Server feature services.
 * @property {Map<number, CombatSession>} sessions Active client sessions.
 * @property {(session: CombatSession, msg: NetworkMessage) => void} [send] Message transmitter.
 */

/**
 * Maximum distance in space units for target engagement validity.
 * @type {number}
 */
const BOUNDARY = 2200;

/**
 * Fleet orders that halt or suppress offensive combat actions.
 * @type {Set<string | undefined>}
 */
const stoppedOrders = new Set(['hold', 'holdfire', 'loot']);

/**
 * Determines whether a ship entity is alive, flight-ready, and capable of combat.
 * @param {CombatEntity | null | undefined} entity Candidate ship entity to check.
 * @returns {entity is CombatEntity} True if the entity is available for combat operations.
 */
export const available = (entity) =>
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
  /**
   * Initializes the CombatAssist service.
   * @param {CombatGameHost} game The root Game server instance.
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Retrieves or initializes the transient combat assist state for a session.
   * @param {CombatSession} session Player session.
   * @returns {CombatState} Active combat assist state object.
   */
  state(session) {
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
   * @param {CombatSession} session Player session to stop.
   * @param {string} [reason='Manual control'] Human-readable explanation for stopping.
   * @returns {void}
   */
  stop(session, reason = 'Manual control') {
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
   * @param {CombatSession} session Player session taking manual control.
   * @returns {void}
   */
  manual(session) {
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
   * @param {CombatSession} session Player session sending the command.
   * @param {CombatCommand} m Command message containing operation and parameters.
   * @returns {void}
   */
  command(session, m) {
    const combatState = this.state(session),
      entity = session.ent;
    if (m.op === 'off') return this.stop(session, 'Combat assist off');
    if (m.op === 'manual') return this.manual(session);
    if (!available(entity) || this.game.spaces[session.data.sys].sys.arena || entity.rescueT)
      return;
    if (!['assist', 'coordinate', 'delegate'].includes(m.op)) return;
    if (m.op === 'assist') {
      combatState.on = m.on === true;
      combatState.focus = combatState.on;
      combatState.status = combatState.on ? 'READY' : 'OFF';
      combatState.reason = '';
      // Selection can precede arming: adopt it only on explicit enable, using the
      // same legal-NPC, protection and acquisition-range checks as active selection.
      if (combatState.on) this.selected(session, entity.target, this.game.spaces[session.data.sys]);
      else this.stop(session, 'Combat assist off');
    }
    if (m.op === 'coordinate') {
      combatState.coordinating = m.on === true;
      combatState.focus = combatState.coordinating || combatState.on;
    }
    if (m.op === 'delegate') {
      const a = this.game.features.coop.armadaOf(session.data);
      combatState.consent =
        m.on === true && a && session.data.armadaFollow && a.leader !== session.data.name
          ? { armada: a.id, leader: a.leader }
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
   * @param {CombatSession} session Player session selecting a target.
   * @param {CombatEntity | null | undefined} entity Candidate target entity.
   * @param {CombatSpace} space Active space system instance.
   * @returns {void}
   */
  selected(session, entity, space) {
    const combatState = this.state(session);
    if (
      (combatState.on || combatState.focus || combatState.coordinating || combatState.consent) &&
      this.valid(space, session.ent, entity)
    )
      combatState.target = entity.id;
  }

  /**
   * Directs local fleet focus fire on the player ship's current target.
   * @param {CombatSession} session Player session initiating attack.
   * @param {CombatSpace} space Active space system instance.
   * @returns {void}
   */
  attack(session, space) {
    const target = session.ent.target;
    if (!target || !this.valid(space, session.ent, target))
      return this.stop(session, 'Manual attack order');
    const combatState = this.state(session);
    // An explicit local order takes back authority before choosing this fleet's target.
    if (combatState.consent || combatState.delegated) this.stop(session, 'Local attack order');
    combatState.focus = true;
    combatState.reason = '';
    combatState.target = target.id;
  }

  /**
   * Validates whether a target entity is hostile, in range, and eligible for engagement.
   * @param {CombatSpace} space Active space system instance.
   * @param {CombatEntity} lead Lead attacking entity.
   * @param {CombatEntity | null | undefined} entity Candidate target entity.
   * @returns {entity is CombatEntity} True if the target is valid for engagement.
   */
  valid(space, lead, entity) {
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
   * @param {CombatSession} session Follower player session.
   * @param {CombatSpace} space Active space system instance.
   * @returns {CombatSession | null} Coordinating leader session, or null if delegation is inactive or revoked.
   */
  delegation(session, space) {
    const combatState = this.state(session),
      a = this.game.features.coop.armadaOf(session.data);
    if (!combatState.consent) return null;
    const leader = a && this.game.features.coop.sessionOf(a.leader);
    if (
      !a ||
      a.id !== combatState.consent.armada ||
      a.leader !== combatState.consent.leader ||
      !a.members.includes(session.data.name) ||
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
   * @param {CombatSpace} space Active space system instance.
   * @param {CombatSession} leadSession Leading coordinator session.
   * @returns {CombatSession[]} Group of sessions including leader and consenting followers.
   */
  group(space, leadSession) {
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
   * @param {CombatSpace} space Active space system instance.
   * @param {CombatSession[]} sessions Group of participating player sessions.
   * @returns {number} Combined combat power rating.
   */
  power(space, sessions) {
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
   * @param {CombatSession} session Player session.
   * @param {CombatSpace} space Active space system instance.
   * @returns {CombatPayload} Serialized combat telemetry payload.
   */
  payload(session, space) {
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
   * @param {CombatSpace} space Active space system instance.
   * @returns {void}
   */
  resolve(space) {
    const sessions = [...this.game.sessions.values()].filter(
      (session) =>
        session.data &&
        session.data.sys === space.id &&
        session.ent &&
        space.ships.get(session.ent.id) === session.ent,
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
    for (const s of sessions) {
      if (leaders.get(s)) continue;
      const combatState = this.state(s),
        group = sessions.filter((session) => session === s || leaders.get(session) === s),
        roots = new Set(group.map((session) => session.ent));
      if (!s.ent.sharedCombat) continue;
      let target = space.ships.get(combatState.target);
      if (!this.valid(space, s.ent, target)) {
        const power = this.power(space, group);
        const attackers = [...space.ships.values()].filter(
          (entity) =>
            this.valid(space, s.ent, entity) &&
            // Passive Assist only defends against hostile attackers; it never hunts
            // neutral traffic merely because our primary guns could damage it.
            space.isHostile(s.ent, entity) &&
            // Stray fire during protected travel must not silently turn passive
            // Assist into an opt-in faction battle. Explicit selection above still can.
            !space.newcomerTruce?.(entity, s.ent) &&
            ((entity.target && roots.has(space.root(entity.target))) ||
              [...space.ships.values()].some(
                (v) =>
                  roots.has(space.root(v)) && v.lastHitBy === entity.id && space.t - v.hitT < 8,
              )),
        );
        attackers.sort(
          (leftEntity, rightEntity) =>
            winOdds(power, leftEntity.pw || 10) - winOdds(power, rightEntity.pw || 10) ||
            Math.hypot(leftEntity.x - s.ent.x, leftEntity.y - s.ent.y) -
              Math.hypot(rightEntity.x - s.ent.x, rightEntity.y - s.ent.y) ||
            leftEntity.id - rightEntity.id,
        );
        target = attackers[0] || null;
      }
      for (const session of group) {
        const oc = this.state(session);
        oc.target = target ? target.id : 0;
        oc.status = target ? 'ENGAGING' : 'READY';
        oc.reason = '';
        session.ent.combatTarget = target;
        session.ent.sharedCombat = true;
        session.ent.autoCombat = !!(oc.on || leaders.get(session));
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
