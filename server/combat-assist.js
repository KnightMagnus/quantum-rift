// Server-authoritative, transient combat control. Never persists consent in saves.
import { winOdds } from '../shared/hostile.js';

const BOUNDARY = 2200;
const stoppedOrders = new Set(['hold', 'holdfire', 'loot']);
export const available = (e) =>
  !!e &&
  !e.dead &&
  !e.disabled &&
  e.state === 'fly' &&
  e.armor > 0 &&
  (e.player || e.noDisable || e.armor >= e.st.armor * 0.15);

export class CombatAssist {
  constructor(game) {
    this.game = game;
  }
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
      // same legal-NPC, protection and acquisition-range checks as active selection.
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
  selected(s, t, sp) {
    const c = this.state(s);
    if ((c.on || c.focus || c.coordinating || c.consent) && this.valid(sp, s.ent, t))
      c.target = t.id;
  }
  attack(s, sp) {
    const target = s.ent.target;
    if (!this.valid(sp, s.ent, target)) return this.stop(s, 'Manual attack order');
    const c = this.state(s);
    // An explicit local order takes back authority before choosing this fleet's target.
    if (c.consent || c.delegated) this.stop(s, 'Local attack order');
    c.focus = true;
    c.reason = '';
    c.target = target.id;
  }
  valid(sp, lead, t) {
    return (
      available(lead) &&
      available(t) &&
      sp.ships.get(t.id) === t &&
      !sp.root(t).player &&
      !sp.sys.arena &&
      // Selecting a target and arming Assist is an explicit attack order, just like
      // manual primary fire or K/Attack: neutral NPCs are legal too. Never PvP/own wing.
      sp.canHit(lead, t) &&
      // Protection is directional: our arrival/newcomer truce limits NPC initiation,
      // not an explicitly selected player attack. Match the player-to-target canHit direction.
      !sp.spared(lead, t) &&
      Math.hypot(t.x - lead.x, t.y - lead.y) <= BOUNDARY
    );
  }
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
            // Passive Assist only defends against hostile attackers; it never hunts
            // neutral traffic merely because our primary guns could damage it.
            sp.isHostile(s.ent, t) &&
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
