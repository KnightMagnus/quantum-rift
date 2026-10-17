import { clampStanding } from '../shared/reputation.js';
import { SYS, FACTIONS } from '../shared/galaxy.js';
import { RIVAL } from '../shared/rivals.js';
import { contextualHail } from './hail-dialogue.js';

export const HAIL_LIMITS = Object.freeze({
  npc: 3,
  player: 8,
  expires: 180000,
  history: 8,
  sender: 5000,
  pair: 10000,
  named: 900000,
});
export function hailText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && [...text].length <= 100 && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(text)
    ? text
    : null;
}
const flying = (s) => s?.data && s.ent && !s.ent.dead && !s.ent.disabled && s.ent.state === 'fly';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const silent = (e) => ['umbral', 'eclipse', 'swarm'].includes(e.faction);

/** Ephemeral, server-owned calls. Persist only communication preferences and real accepted job rewards. */
export class HailService {
  constructor(game, now = () => Date.now(), random = Math.random) {
    this.game = game;
    this.now = now;
    this.random = random;
    this.states = new Map();
    this.serial = 0;
    this.encounters = new Map();
  }
  state(s) {
    let st = this.states.get(s.id);
    if (!st) {
      st = {
        space: null,
        ent: null,
        queue: [],
        history: [],
        next: 0,
        named: new Map(),
        pairs: new Map(),
        sent: 0,
        escort: null,
      };
      this.states.set(s.id, st);
    }
    // Hails never own system activation. The lazy spaces proxy would wake a
    // docked player's otherwise sleeping system on every communications tick.
    const sp = flying(s) ? this.game.live[s.data.sys] || null : null;
    if (st.space !== sp || st.ent !== s.ent) {
      this.cancelEscort(s, st);
      st.space = sp;
      st.ent = s.ent;
      st.queue = [];
      st.history = [];
      st.next = this.now() + 180000 + this.random() * 180000;
      s.hailLedger = null;
      this.push(s, st);
    }
    return st;
  }
  push(s, st = this.states.get(s.id)) {
    if (!st || !s.data) return;
    this.game.send(s, {
      t: 'hailinbox',
      allow: s.data.playerHails !== false,
      entries: [...st.queue, ...st.history].map((q) => ({
        key: q.key,
        who: q.who,
        kind: q.kind,
        unread: !q.read,
        expires: q.expires,
        archived: !!q.archived,
      })),
    });
  }
  archive(st, q) {
    st.queue = st.queue.filter((x) => x !== q);
    if (q.kind === 'player') return; // Player privacy/blocks retain their original removal semantics.
    q.archived = true;
    st.history = [q, ...st.history.filter((x) => x !== q)].slice(0, HAIL_LIMITS.history);
  }
  // Solo pause stops encounter time as well as the simulation. Opening a menu
  // must not consume a caller's remaining response window.
  resume(dt) {
    const spaces = new Set();
    for (const st of this.states.values()) {
      st.next += dt;
      for (const q of st.queue) {
        q.expires += dt;
        if (q.opened) q.opened += dt;
      }
      if (st.escort) st.escort.expires += dt;
      if (st.space) spaces.add(st.space);
    }
    for (const sp of spaces)
      for (const e of sp.ships.values()) {
        if (e.hailOfferUntil) e.hailOfferUntil += dt;
        if (e.hailEscort) e.hailEscort.expires += dt;
      }
  }
  source(s, q) {
    if (!flying(s) || s.data.sys !== q.sys) return null;
    const sp = this.game.live[q.sys],
      e = sp?.ships.get(q.source);
    if (!e || e.dead) return null;
    if (q.kind === 'player') {
      const other = e.player?.s;
      return other && other.ent === e && this.canContact(other, s) ? e : null;
    }
    return (!e.player &&
      !e.owner &&
      (q.reason === 'distress' || !e.disabled) &&
      !silent(e) &&
      !sp.isHostile(e, s.ent)) ||
      (e && q.reason === 'security' && !e.dead && !e.disabled)
      ? e
      : null;
  }
  canContact(from, to) {
    if (
      this.game.sessions.get(from?.id) !== from ||
      this.game.sessions.get(to?.id) !== to ||
      !flying(from) ||
      !flying(to) ||
      from === to ||
      from.data.sys !== to.data.sys ||
      to.data.playerHails === false
    )
      return false;
    const c = this.game.features.coop;
    if (c.blocked(from.data, to.data.name) || c.blocked(to.data, from.data.name)) return false;
    // Existing unsolicited-DM privacy remains authoritative for this new channel too.
    const friend = (to.data.friends || []).some(
      (n) => n.toLowerCase() === from.data.name.toLowerCase(),
    );
    const a = c.armadaOf(to.data),
      b = c.armadaOf(from.data);
    return !!(to.data.dmAll || friend || (a && b && a.id === b.id));
  }
  player(s, target, text) {
    const other = target?.player?.s;
    if (!this.canContact(s, other) || other.ent !== target)
      return this.game.toast(s, 'That captain is not accepting hails here.');
    if (text === undefined)
      return this.game.send(s, {
        t: 'hail',
        player: target.id,
        id: target.id,
        who: other.data.name,
        sub: 'Same-system private hail',
        text: 'Send a short hail. No trade or transfers on this channel.',
        opts: [],
      });
    const value = hailText(text);
    if (!value) return this.game.toast(s, 'Hails must contain 1–100 characters.');
    const st = this.state(s),
      now = this.now();
    if (
      now - st.sent < HAIL_LIMITS.sender ||
      now - (st.pairs.get(other.id) || 0) < HAIL_LIMITS.pair
    )
      return this.game.toast(s, 'Give that captain a moment before hailing again.');
    const inbox = this.state(other);
    let q = inbox.queue.find((q) => q.kind === 'player' && q.source === s.ent.id);
    if (!q && inbox.queue.filter((q) => q.kind === 'player').length >= HAIL_LIMITS.player)
      return this.game.toast(s, 'That captain’s hail inbox is full.');
    st.sent = now;
    st.pairs.set(other.id, now);
    if (!q) {
      q = { key: `h${++this.serial}`, kind: 'player', source: s.ent.id, sys: s.data.sys };
      inbox.queue.push(q);
    }
    Object.assign(q, {
      who: s.data.name,
      text: value,
      read: false,
      expires: now + HAIL_LIMITS.expires,
    });
    this.push(other, inbox);
    this.game.send(s, {
      t: 'hail',
      player: target.id,
      id: target.id,
      who: other.data.name,
      text: `Hail sent: ${value}`,
      opts: [],
    });
  }
  request(s, m) {
    const st = this.state(s),
      now = this.now();
    if (m.op === 'prefs') {
      s.data.playerHails = m.allow === true;
      this.game.db.touch();
      return this.push(s, st);
    }
    if (m.op === 'list') return this.push(s, st);
    if (m.op === 'send')
      return this.player(s, this.game.live[s.data.sys]?.ships.get(Number(m.id)), m.text);
    const q = [...st.queue, ...st.history].find((q) => q.key === m.key);
    if (!q) return this.game.toast(s, 'That hail has ended.');
    if (m.op === 'dismiss') {
      st.queue = st.queue.filter((x) => x !== q);
      st.history = st.history.filter((x) => x !== q);
      return this.push(s, st);
    }
    const e = this.source(s, q);
    if (q.archived || !e || q.expires <= now) {
      this.archive(st, q);
      if (q.kind === 'player') {
        this.push(s, st);
        return this.game.toast(s, 'That hail has ended.');
      }
      if (m.op === 'open') q.read = true;
      this.push(s, st);
      return this.game.send(s, {
        t: 'hail',
        who: q.who,
        text: `${q.text}\n\n[Archived transmission: this hail has expired or the sender is no longer available. No actions remain available.]`,
        opts: [],
      });
    }
    if (m.op === 'open') {
      q.read = true;
      q.opened = now;
      q.expires = Math.max(q.expires, now + 30000);
      this.push(s, st);
      return this.game.send(s, {
        t: 'hail',
        key: q.key,
        player: q.kind === 'player' ? e.id : undefined,
        who: q.who,
        sub: q.kind === 'player' ? 'Private hail' : q.reason,
        text: q.text,
        opts: q.opts || [],
      });
    }
    if (m.op !== 'answer' || !q.opened || !(q.opts || []).some((o) => o.k === m.k)) return;
    if (q.kind !== 'npc') return;
    return this.resolve(s, st, q, e, m.k);
  }
  enqueue(s, e, reason, text, opts = [], details = {}) {
    const st = this.state(s),
      now = this.now();
    if (
      st.queue.filter((q) => q.kind === 'npc').length >= HAIL_LIMITS.npc ||
      st.queue.some((q) => q.source === e.id)
    )
      return false;
    if (e.rival && now - (st.named.get(e.rival) || 0) < HAIL_LIMITS.named) return false;
    if (e.rival) st.named.set(e.rival, now);
    st.queue.push({
      key: `h${++this.serial}`,
      kind: 'npc',
      source: e.id,
      who: e.name || `${this.game.A.ships[e.hull].name} · transponder ${e.id}`,
      sys: s.data.sys,
      reason,
      text,
      opts,
      expires: now + HAIL_LIMITS.expires,
      ...details,
    });
    this.push(s, st);
    return true;
  }
  offer(s, e, reason) {
    const sp = this.game.live[s.data.sys],
      now = this.now();
    if (!sp || !flying(s)) return false;
    if (
      e.hailOfferUntil > now ||
      e.hailResolved ||
      e.owner ||
      e.player ||
      e.mission ||
      e.convoyOf ||
      silent(e)
    )
      return false;
    const hostile = sp.isHostile(e, s.ent);
    const opts = [],
      details = {};
    let text;
    if (reason === 'security') {
      if (e.ai !== 'patrol' || FACTIONS[e.faction]?.pirate || (s.data.rep[e.faction] || 0) > -20)
        return false;
      text = `${e.name || 'Local security'}: your standing with ${FACTIONS[e.faction]?.name || e.faction} is poor. Leave ${SYS[sp.id].name}. This is a warning, not a new countdown.`;
    } else {
      // Space.ai leaves the last target attached when a ship becomes disabled.
      // That stale combat pointer must not suppress a friendly survivor's distress.
      if (hostile || (e.target && !(reason === 'distress' && e.disabled))) return false;
      if (reason === 'distress') {
        if (e.armor >= e.st.armor * 0.5 || e.rescueOf || e.boss || e.dread) return false;
        text =
          'Our hull is badly damaged. Can you rendezvous and help? Accept marks our transponder; emergency supplies cost 250 cr when you arrive within 180 units.';
        opts.push({ k: 'rendezvous', label: 'Mark rescue rendezvous (no charge yet)' });
      } else if (e.disabled) return false;
      else if (reason === 'fuel') {
        if (e.ai !== 'trade' || e.fuel >= 100 || e.hailFuelHelp) return false;
        text = `Our tanks read ${Math.floor(e.fuel)} fuel. Could you spare 50 units? We can only accept this transfer once.`;
        opts.push({ k: 'donateFuel', label: 'Transfer 50 fuel (within 500 units)' });
      } else if (reason === 'escort') {
        if (
          e.ai !== 'trade' ||
          !e.dest ||
          e.dest.out ||
          !e.dest.id ||
          stEscort(this, s) ||
          e.hailEscort
        )
          return false;
        text = `We are making for ${e.dest.name}. Stay within 3,500 units until we land for 750 cr. Leaving this system, docking, separation or losing us fails the job. Five-minute limit; no raiders are spawned.`;
        opts.push({ k: 'escort', label: `Escort to ${e.dest.name} (750 cr)` });
        details.dest = { ...e.dest };
      } else if (reason === 'intel') {
        const threat = [...sp.ships.values()].find(
          (x) =>
            !x.player &&
            !x.owner &&
            !x.mission &&
            !x.dead &&
            !x.disabled &&
            sp.isHostile(x, s.ent) &&
            distance(x, e) < 1800,
        );
        if (!threat) return false;
        text =
          'We have a hostile NPC contact nearby. I can share a rough, position fix from this transmission—not live tracking.';
        opts.push({ k: 'intel', label: 'Receive approximate contact fix' });
        details.intel = {
          x: Math.round(threat.x / 250) * 250,
          y: Math.round(threat.y / 250) * 250,
        };
      } else if (reason === 'greeting') {
        if (!e.rival || this.game.features.rivals.relOf(s.data, e.rival) < 30) return false;
        text = contextualHail(s, e, sp, this.game.features.rivals.relOf(s.data, e.rival));
      } else if (reason === 'beg') {
        // A concrete, one-time simulated hardship; never claim this is tracked NPC wealth.
        if (e.rival || e.ai !== 'trade') return false;
        e.hailHardship = { requested: 100, resolved: false };
        text =
          'A small favor, Captain? I am asking for a one-time gift of 100 credits. No reward, no obligation.';
        opts.push({ k: 'gift', label: 'Give 100 cr (within 500 units)' });
      } else return false;
    }
    if (!this.enqueue(s, e, reason, text, opts, details)) return false;
    e.hailOfferUntil = now + HAIL_LIMITS.expires;
    return true;
  }
  resolve(s, st, q, e, action) {
    const g = this.game,
      me = s.ent,
      now = this.now();
    const finish = (text) => {
      st.queue = st.queue.filter((x) => x !== q);
      this.push(s, st);
      g.send(s, { t: 'hail', who: q.who, text, opts: [] });
    };
    if (e.hailResolved && action !== 'repair')
      return finish('Another captain already helped us. Thank you.');
    if (action === 'rendezvous') {
      q.opts = [{ k: 'repair', label: 'Supply emergency repairs (250 cr, within 180 units)' }];
      q.text =
        'Rendezvous marked. Approach within 180 units, then reopen this hail to supply repairs.';
      q.expires = now + HAIL_LIMITS.expires;
      g.send(s, {
        t: 'hailmark',
        id: e.id,
        x: e.x,
        y: e.y,
        label: 'Rescue rendezvous',
        until: q.expires,
      });
      return g.send(s, { t: 'hail', key: q.key, who: q.who, text: q.text, opts: q.opts });
    }
    if (action === 'intel') {
      g.send(s, {
        t: 'hailmark',
        ...q.intel,
        label: 'Last reported hostile contact',
        until: now + 60000,
      });
      return finish(
        `Approximate contact: ${q.intel.x}, ${q.intel.y}. The fix expires in one minute and is not live tracking.`,
      );
    }
    if (action === 'escort') {
      if (
        st.escort ||
        e.hailEscort ||
        e.disabled ||
        e.target ||
        !e.dest ||
        e.dest.id !== q.dest.id ||
        distance(me, e) > 3500
      )
        return finish('That escort is no longer available.');
      e.hailEscort = { owner: s.id, expires: now + 300000, dest: q.dest.id };
      e.life = Math.max(e.life, 330);
      st.escort = { source: e.id, sys: q.sys, expires: now + 300000 };
      g.send(s, {
        t: 'hailmark',
        id: e.id,
        x: e.x,
        y: e.y,
        label: `Escort to ${q.dest.name}`,
        until: now + 300000,
      });
      return finish(
        `Escort accepted. Remain within 3,500 units until ${q.who} actually lands at ${q.dest.name}.`,
      );
    }
    const range = action === 'repair' ? 180 : 500;
    if (distance(me, e) > range) return g.toast(s, `Approach within ${range} units first.`);
    if (action === 'donateFuel') {
      if (e.hailFuelHelp || e.fuel >= 100 || e.st.fuel - e.fuel < 50 || me.fuel < 50)
        return g.toast(s, 'The 50-unit transfer is no longer possible.');
      me.fuel -= 50;
      s.data.fuel = me.fuel;
      e.fuel += 50;
      e.hailFuelHelp = true;
    } else if (action === 'gift') {
      if (!e.hailHardship || e.hailHardship.resolved || s.data.credits < 100)
        return g.toast(s, 'The donation is no longer possible or you lack 100 cr.');
      s.data.credits -= 100;
      e.hailHardship.resolved = true;
    } else if (action === 'repair') {
      if (e.hailRepaired || e.armor >= e.st.armor * 0.5 || s.data.credits < 250)
        return g.toast(s, 'Repairs are no longer needed or you lack 250 cr.');
      s.data.credits -= 250;
      e.armor = Math.max(e.armor, e.st.armor * 0.55);
      e.disabled = false;
      e.disT = 0;
      e.hailRepaired = true;
      if (e.rival) g.features.rivals.rivalRel(s, e.rival, 6, 'you supplied emergency repairs');
      else s.data.rep[e.faction] = clampStanding((s.data.rep[e.faction] || 0) + 1);
    } else return;
    e.hailResolved = true;
    g.db.touch();
    g.you(s);
    return finish('Assistance received. Thank you, Captain.');
  }
  cancelEscort(s, st) {
    if (!st?.escort) return;
    const sp = this.game.live[st.escort.sys],
      e = sp?.ships.get(st.escort.source);
    if (e?.hailEscort?.owner === s.id) delete e.hailEscort;
    st.escort = null;
    if (s.data) {
      this.game.toast(s, 'Spontaneous escort ended without reward.');
      this.game.send(s, { t: 'hailmark', until: 0 });
    }
  }
  landed(e, sp) {
    const job = e.hailEscort;
    if (!job) return;
    delete e.hailEscort;
    const s = this.game.sessions.get(job.owner),
      st = s && this.states.get(s.id);
    if (
      !st?.escort ||
      !flying(s) ||
      s.data.sys !== sp.id ||
      this.now() > job.expires ||
      distance(s.ent, e) > 3500 ||
      e.dest?.id !== job.dest
    ) {
      if (st) this.cancelEscort(s, st);
      return;
    }
    st.escort = null;
    e.hailResolved = true;
    s.data.credits += 750;
    this.game.db.touch();
    this.game.you(s);
    this.game.toast(s, 'Spontaneous escort completed: 750 cr.');
    this.game.send(s, { t: 'hailmark', until: 0 });
  }
  tick() {
    const g = this.game,
      now = this.now();
    for (const [id, st] of this.states)
      if (!g.sessions.has(id)) {
        this.cancelEscort({ id }, st);
        this.states.delete(id);
      }
    for (const s of g.sessions.values()) {
      if (!s.data) continue;
      const st = this.state(s),
        sp = st.space;
      const before = st.queue.length;
      for (const q of [...st.queue])
        if (q.expires <= now || !this.source(s, q)) this.archive(st, q);
      if (before !== st.queue.length) this.push(s, st);
      if (st.escort) {
        const e = sp?.ships.get(st.escort.source);
        if (!flying(s) || !e || e.dead || now > st.escort.expires || distance(s.ent, e) > 3500)
          this.cancelEscort(s, st);
      }
      if (!sp || !flying(s) || now < st.next) continue;
      st.next = now + 180000 + this.random() * 180000;
      const combat =
        (s.ent.target && sp.isHostile(s.ent, s.ent.target)) ||
        [...sp.ships.values()].some((e) => e.target && sp.root(e.target) === s.ent);
      const candidates = [...sp.ships.values()].filter(
        (e) =>
          !e.player &&
          !e.owner &&
          !e.dead &&
          !e.mission &&
          !e.convoyOf &&
          !e.huntOf &&
          !silent(e) &&
          distance(e, s.ent) < 3500,
      );
      // Shuffle candidates and topics, with true emergencies before routine chatter.
      const topics = combat
        ? ['security', 'distress']
        : [
            'security',
            'distress',
            ...['greeting', 'fuel', 'escort', 'intel', 'beg'].sort(() => this.random() - 0.5),
          ];
      // Some ordinary traders enter with an explicit, real fuel shortage. This is
      // encounter state, not a claim that all NPC traffic simulates fuel economy.
      for (const e of candidates)
        if (e.ai === 'trade' && !e.rival && e.hailFuelChecked === undefined) {
          e.hailFuelChecked = true;
          if (this.random() < 0.12 && e.st.fuel >= 100) e.fuel = Math.min(e.fuel, 50);
        }
      let sent = false;
      for (const reason of topics) {
        for (const e of candidates.sort(() => this.random() - 0.5))
          if (this.offer(s, e, reason)) {
            sent = true;
            break;
          }
        if (sent) break;
      }
    }
  }
}
function stEscort(service, s) {
  return service.states.get(s.id)?.escort;
}
