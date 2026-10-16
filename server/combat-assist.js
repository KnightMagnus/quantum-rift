// @ts-check
// Server-authoritative, transient combat control. Never persists consent in saves.
import { winOdds } from '../shared/hostile.js';

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
 * Entity representation participating in or evaluated by combat assist.
 * @typedef {object} CombatEntity
 * @property {number} id Unique entity simulation ID.
 * @property {boolean} [dead] True if the ship is destroyed.
 * @property {boolean} [disabled] True if the ship is disabled and drifting.
 * @property {string} state Entity flight state ('fly', 'jumpout', 'landed').
 * @property {number} armor Current armor hitpoints.
 * @property {{armor: number, [key: string]: any}} st Live computed ship stats containing max armor.
 * @property {unknown} [player] Player reference if this is a player-controlled ship.
 * @property {boolean} [noDisable] Exemption flag preventing disablement threshold.
 * @property {number} [rescueT] Rescue protection countdown timestamp.
 * @property {number | null} [owner] Entity ID of the commanding or parent ship.
 * @property {CombatEntity | null} [target] Current active combat target entity.
 * @property {CombatEntity | null} [fireAt] Secondary weapon fire target entity.
 * @property {Record<string, any>} [inp] Ship input control state.
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
 * Player session structure managing combat assist state and ship reference.
 * @typedef {object} CombatSession
 * @property {CombatState} [combat] Combat assist state for this session.
 * @property {CombatEntity} ent Currently active ship entity in space.
 * @property {{sys: string, name: string, armada?: string | number, armadaFollow?: boolean, [key: string]: any}} data Player account save data.
 * @property {any[]} inputs Pending input command queue.
 * @property {any} [lastInput] Most recent processed input.
 */

/**
 * System space simulation environment containing ships and combat context.
 * @typedef {object} CombatSpace
 * @property {string} id Space system identifier.
 * @property {{arena?: boolean, [key: string]: any}} sys System configuration parameters.
 * @property {Map<number, CombatEntity>} ships Map of entity ID to live ship entities.
 * @property {number} t Current simulation timestamp.
 * @property {(entity: any) => any} root Resolves fleet root or parent commanding entity.
 * @property {(lead: any, target: any) => boolean} isHostile Checks hostile relationship between entities.
 * @property {(source: any, target: any) => boolean} spared Checks whether source faction spares target.
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
 * @param {CombatEntity | any} e Candidate ship entity to check.
 * @returns {e is CombatEntity} True if the entity is available for combat operations.
 */
export const available = (e) =>
  !!e &&
  !e.dead &&
  !e.disabled &&
  e.state === 'fly' &&
  e.armor > 0 &&
  !!(e.player || e.noDisable || (e.st && e.armor >= e.st.armor * 0.15));

/**
 * Server-authoritative combat assistance coordinator managing targeting, fleet focus,
 * and armada delegation.
 */
export class CombatAssist {
  /**
   * Initializes the CombatAssist service.
   * @param {any} game The root Game server instance.
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Retrieves or initializes the transient combat assist state for a session.
   * @param {CombatSession} s Player session.
   * @returns {CombatState} Active combat assist state object.
   */
  state(s) {
    return (
      s.combat ||
      (s.combat = {
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
   * @param {CombatSession} s Player session to stop.
   * @param {string} [reason='Manual control'] Human-readable explanation for stopping.
   * @returns {void}
   */
  stop(s, reason = 'Manual control') {
    const c = this.state(s);
    c.on = false;
    c.delegated = false;
    c.consent = null;
    c.coordinating = false;
    c.focus = false;
    c.target = 0;
    c.status = 'SUSPENDED';
    c.reason = reason;
    const sp = s.data && this.game.spaces[s.data.sys];
    if (s.ent && sp)
      for (const e of sp.ships.values())
        if (e.owner && sp.root(e) === s.ent) {
          e.target = null;
          e.fireAt = null;
          e.inp = {};
          e.think = 0;
        }
    if (s.ent) {
      s.ent.autoCombat = false;
      s.ent.fireAt = null;
      s.ent.combatTarget = null;
      s.ent.sharedCombat = false;
      s.ent.inp = {};
    }
  }

  /**
   * Handles manual flight control input, suspending assist unless coordinating followers.
   * @param {CombatSession} s Player session taking manual control.
   * @returns {void}
   */
  manual(s) {
    const c = this.state(s);
    // A leader may fly manually while still supplying the group's target.
    if (c.coordinating && !c.consent) {
      c.on = false;
      if (s.ent) {
        s.ent.autoCombat = false;
        s.ent.inp = {};
      }
      return;
    }
    this.stop(s);
  }

  /**
   * Processes a combat assist command operation from the client.
   * @param {CombatSession} s Player session sending the command.
   * @param {CombatCommand} m Command message containing operation and parameters.
   * @returns {void}
   */
  command(s, m) {
    const c = this.state(s),
      e = s.ent;
    if (m.op === 'off') return this.stop(s, 'Combat assist off');
    if (m.op === 'manual') return this.manual(s);
    if (!available(e) || this.game.spaces[s.data.sys].sys.arena || e.rescueT) return;
    if (!['assist', 'coordinate', 'delegate'].includes(m.op)) return;
    if (m.op === 'assist') {
      c.on = m.on === true;
      c.focus = c.on;
      c.status = c.on ? 'READY' : 'OFF';
      c.reason = '';
      // Selection can precede arming: adopt it only on explicit enable, using the
      // same hostility, protection and acquisition-range checks as active selection.
      if (c.on) this.selected(s, e.target, this.game.spaces[s.data.sys]);
      else this.stop(s, 'Combat assist off');
    }
    if (m.op === 'coordinate') {
      c.coordinating = m.on === true;
      c.focus = c.coordinating || c.on;
    }
    if (m.op === 'delegate') {
      const a = this.game.features.coop.armadaOf(s.data);
      c.consent =
        m.on === true && a && s.data.armadaFollow && a.leader !== s.data.name
          ? { armada: a.id, leader: a.leader }
          : null;
      c.focus = c.on;
    }
    s.inputs.length = 0;
    s.lastInput = null;
    e.inp = {};
    e.order = 'gather';
    e.orderSeq = (e.orderSeq || 0) + 1;
  }

  /**
   * Selects an explicit target entity if valid and assist or coordination is enabled.
   * @param {CombatSession} s Player session selecting a target.
   * @param {CombatEntity | null | undefined} t Candidate target entity.
   * @param {CombatSpace} sp Active space system instance.
   * @returns {void}
   */
  selected(s, t, sp) {
    const c = this.state(s);
    if ((c.on || c.focus || c.coordinating || c.consent) && this.valid(sp, s.ent, t))
      c.target = t.id;
  }

  /**
   * Directs local fleet focus fire on the player ship's current target.
   * @param {CombatSession} s Player session initiating attack.
   * @param {CombatSpace} sp Active space system instance.
   * @returns {void}
   */
  attack(s, sp) {
    const target = s.ent.target;
    if (!target || !this.valid(sp, s.ent, target)) return this.stop(s, 'Manual attack order');
    const c = this.state(s);
    // An explicit local order takes back authority before choosing this fleet's target.
    if (c.consent || c.delegated) this.stop(s, 'Local attack order');
    c.focus = true;
    c.reason = '';
    c.target = target.id;
  }

  /**
   * Validates whether a target entity is hostile, in range, and eligible for engagement.
   * @param {CombatSpace} sp Active space system instance.
   * @param {CombatEntity | any} lead Lead attacking entity.
   * @param {CombatEntity | null | undefined} t Candidate target entity.
   * @returns {t is CombatEntity} True if the target is valid for engagement.
   */
  valid(sp, lead, t) {
    return (
      available(lead) &&
      available(t) &&
      sp.ships.get(t.id) === t &&
      !sp.root(t).player &&
      !sp.sys.arena &&
      sp.isHostile(lead, t) &&
      // Protection is directional: our arrival/newcomer truce limits NPC initiation,
      // not an explicitly selected player attack. Match the player-to-target canHit direction.
      !sp.spared(lead, t) &&
      Math.hypot(t.x - lead.x, t.y - lead.y) <= BOUNDARY
    );
  }

  /**
   * Resolves the active coordinating leader session for a delegated follower.
   * @param {CombatSession} s Follower player session.
   * @param {CombatSpace} sp Active space system instance.
   * @returns {CombatSession | null} Coordinating leader session, or null if delegation is inactive or revoked.
   */
  delegation(s, sp) {
    const c = this.state(s),
      a = this.game.features.coop.armadaOf(s.data);
    if (!c.consent) return null;
    const leader = a && this.game.features.coop.sessionOf(a.leader);
    if (
      !a ||
      a.id !== c.consent.armada ||
      a.leader !== c.consent.leader ||
      !a.members.includes(s.data.name) ||
      !s.data.armadaFollow ||
      !leader ||
      leader === s ||
      !available(leader.ent) ||
      !available(s.ent) ||
      leader.data.sys !== s.data.sys ||
      stoppedOrders.has(s.ent.order) ||
      sp.sys.arena
    ) {
      this.stop(s, 'Delegation revoked');
      return null;
    }
    // Coordination may be enabled after consent; this does not transfer consent to another leader.
    return this.state(leader).coordinating ? leader : null;
  }

  /**
   * Gathers all follower sessions in the same system delegated to the specified leader.
   * @param {CombatSpace} sp Active space system instance.
   * @param {CombatSession} leadSession Leading coordinator session.
   * @returns {CombatSession[]} Group of sessions including leader and consenting followers.
   */
  group(sp, leadSession) {
    return [
      leadSession,
      ...[...this.game.sessions.values()].filter(
        (s) =>
          s !== leadSession &&
          s.data &&
          s.data.sys === sp.id &&
          this.delegation(s, sp) === leadSession,
      ),
    ];
  }

  /**
   * Computes aggregate combat power rating for a group of participating sessions and escorts.
   * @param {CombatSpace} sp Active space system instance.
   * @param {CombatSession[]} sessions Group of participating player sessions.
   * @returns {number} Combined combat power rating.
   */
  power(sp, sessions) {
    const roots = new Set(sessions.map((s) => s.ent).filter(available));
    let power = 0;
    for (const e of sp.ships.values())
      if (
        available(e) &&
        roots.has(sp.root(e)) &&
        !e.recall &&
        (roots.has(e) || !stoppedOrders.has(sp.root(e).order))
      )
        power += (e.pw || e.strength || 10) * (roots.has(e) ? 1 : 0.6);
    return power;
  }

  /**
   * Generates public combat status telemetry for transmission to a client session.
   * @param {CombatSession} s Player session.
   * @param {CombatSpace} sp Active space system instance.
   * @returns {CombatPayload} Serialized combat telemetry payload.
   */
  payload(s, sp) {
    const c = this.state(s),
      leader = this.delegation(s, sp) || s;
    return {
      on: c.on,
      delegated: !!c.delegated,
      consent: !!c.consent,
      coordinating: c.coordinating,
      status: c.status,
      reason: c.reason,
      target: c.target,
      power: this.power(sp, this.group(sp, leader)),
    };
  }

  /**
   * Evaluates targets, delegation hierarchy, and engagement priorities across all ships in space.
   * @param {CombatSpace} sp Active space system instance.
   * @returns {void}
   */
  resolve(sp) {
    const sessions = [...this.game.sessions.values()].filter(
      (s) => s.data && s.data.sys === sp.id && s.ent && sp.ships.get(s.ent.id) === s.ent,
    );
    for (const s of sessions) {
      const c = this.state(s);
      if (!available(s.ent) || sp.sys.arena || s.ent.rescueT || stoppedOrders.has(s.ent.order)) {
        if (c.on || c.consent || c.focus || c.coordinating)
          this.stop(s, 'Flight state or fleet order');
      }
    }
    const leaders = new Map(sessions.map((s) => [s, this.delegation(s, sp)]));
    for (const s of sessions) {
      const c = this.state(s);
      if (c.delegated && !leaders.get(s)) this.stop(s, 'Leader stopped coordination');
      c.delegated = !!leaders.get(s);
      s.ent.sharedCombat = !!(c.focus || c.on || c.delegated || c.coordinating);
      s.ent.autoCombat = false;
      s.ent.combatTarget = null;
    }
    for (const s of sessions) {
      if (leaders.get(s)) continue;
      const c = this.state(s),
        group = sessions.filter((o) => o === s || leaders.get(o) === s),
        roots = new Set(group.map((o) => o.ent));
      if (!s.ent.sharedCombat) continue;
      let target = sp.ships.get(c.target);
      if (!this.valid(sp, s.ent, target)) {
        const power = this.power(sp, group);
        const attackers = [...sp.ships.values()].filter(
          (t) =>
            this.valid(sp, s.ent, t) &&
            ((t.target && roots.has(sp.root(t.target))) ||
              [...sp.ships.values()].some(
                (v) => roots.has(sp.root(v)) && v.lastHitBy === t.id && sp.t - v.hitT < 8,
              )),
        );
        attackers.sort(
          (a, b) =>
            winOdds(power, a.pw || 10) - winOdds(power, b.pw || 10) ||
            Math.hypot(a.x - s.ent.x, a.y - s.ent.y) - Math.hypot(b.x - s.ent.x, b.y - s.ent.y) ||
            a.id - b.id,
        );
        target = attackers[0] || null;
      }
      for (const o of group) {
        const oc = this.state(o);
        oc.target = target ? target.id : 0;
        oc.status = target ? 'ENGAGING' : 'READY';
        oc.reason = '';
        o.ent.combatTarget = target;
        o.ent.sharedCombat = true;
        o.ent.autoCombat = !!(oc.on || leaders.get(o));
      }
    }
    // Preassign before entity iteration, including recall/hold overrides, so no stale offensive target survives a handoff.
    for (const e of sp.ships.values())
      if (e.owner && sp.root(e).sharedCombat) {
        const root = sp.root(e);
        e.target =
          !e.recall && !stoppedOrders.has(root.order) && this.valid(sp, root, root.combatTarget)
            ? root.combatTarget
            : null;
        e.fireAt = null;
      }
  }
}
