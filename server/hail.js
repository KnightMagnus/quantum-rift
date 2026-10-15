// 1.1: hailing (inspired by Endless Sky). Talk to the ship you have targeted or the planet you have selected:
// bribe pirates, ask traders for fuel or repairs when stranded, bribe a planet for landing rights, trade words with rivals.
import { SYS, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.js';
import { RIVAL, HAIL_LINES, HAIL_SPECIAL, MOOD } from '../shared/rivals.js';
/**
 * Look up the dialogue line for a rival based on their current mood.
 * @param {{name: string, kind: string}} R - Rival configuration object.
 * @param {string} mood - Current mood key.
 * @returns {string} Dialogue text for the rival.
 */
const lineFor = (R, mood) => (HAIL_SPECIAL[R.name] || HAIL_LINES[R.kind])[mood];
import { credits } from '../shared/rules.js';

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} v - Value to clamp.
 * @param {number} a - Minimum value.
 * @param {number} b - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Select a random element from an array.
 * @template T
 * @param {T[]} a - Array of items.
 * @returns {T} Selected item.
 */
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** @type {string[]} Ambient dialogue lines for trader hails. */
const TRADER_LINES = [
  'Just hauling, Captain. Nothing worth your time.',
  'Clear skies. Mind the lanes past the third planet, raiders were spotted.',
  'Have you tried the food prices out on the Frontier? Robbery.',
  'If you are heading spinward, the jump beacons there are acting up.',
];

/** @type {string[]} Ambient dialogue lines for patrol hails. */
const PATROL_LINES = [
  'Patrol here. Keep it clean, Captain.',
  'This system is under our protection. Fly safe.',
  'Report any Hollow activity on this channel.',
];

export const HailOperations = {
  /**
   * Calculate credit cost to bribe hostile forces based on player ship and cargo.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {number} Credit cost to bribe.
   */
  bribeCost(d) {
    const H = this.A.ships[d.ship.hull],
      cargo = Object.entries(d.cargo).reduce(
        (a, [c, n]) => a + n * ((COMMODITIES.find((x) => x.id === c) || {}).base || 100),
        0,
      );
    return Math.max(800, Math.round(((H && H.cost) || 0) * 0.02 + cargo * 0.4) / 100) * 100;
  },
  /**
   * Find and validate the targeted ship for a hail within comms range.
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Target hail message.
   * @returns {{sp: any, e: any, root: any} | null} Target context or null if unreachable.
   */
  hailTarget(s, m) {
    const d = s.data,
      me = s.ent;
    if (!me || me.state !== 'fly') return null;
    const sp = this.spaces[d.sys],
      e = sp.ships.get(m.id | 0);
    if (!e || e.dead || e === me) return null;
    if (Math.hypot(e.x - me.x, e.y - me.y) > 3500) {
      this.toast(s, 'Too far away to hail.');
      return null;
    }
    return { sp, e, root: sp.root(e) };
  },
  /**
   * Open communications with a targeted ship or selected planet.
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Inbound hail message.
   * @returns {void}
   */
  hail(s, m) {
    const d = s.data;
    if (m.stellar) return this.hailPlanet(s, m.stellar);
    const T = this.hailTarget(s, m);
    if (!T) return;
    const { sp, e, root } = T,
      F = FACTIONS[root.faction] || {},
      name = (e.name || this.A.ships[e.hull].name).split(' · ')[0],
      me = s.ent;
    const say = (text, opts = []) =>
      this.send(s, { t: 'hail', id: e.id, who: name, sub: F.name || '', text, opts });
    if (sp.root(e) === me) return say('Standing by, Captain. Give the order.');
    if (e.disabled) return say('...static... a weak distress beacon, repeating on every channel.');
    if (root.huntOf)
      return say(
        root.huntOf === s.id
          ? 'Nothing personal, Captain. Somebody paid good money for your hull.'
          : 'Move along. We are working.',
      );
    if (root.faction === 'umbral' || root.faction === 'eclipse' || root.faction === 'swarm')
      return say(
        root.faction === 'swarm'
          ? 'A wet clicking, then nothing.'
          : 'The Umbral do not answer. Only a low hum, and the static of a light going out.',
      );
    const hostile = sp.isHostile(root, me);
    if (root.rival && !hostile) {
      const R = RIVAL[root.rival],
        rel = this.relOf(d, root.rival),
        mood = MOOD(rel),
        opts = [];
      opts.push(
        { k: 'praise', label: 'Compliment their flying' },
        { k: 'taunt', label: 'Taunt them' },
      );
      if (rel >= 60 && !e.owner) opts.push({ k: 'fly', label: 'Ask them to fly with you' });
      return say(
        `${lineFor(R, mood)}\n\n(${R.name} · ${mood === 'neutral' ? 'neutral' : mood} · relation ${rel})`,
        opts,
      );
    }
    if (hostile && (F.pirate || root.rival)) {
      const cost = this.bribeCost(d),
        mine = this.myPower(d),
        theirs =
          (root.pw || 10) +
          [...sp.ships.values()]
            .filter((x) => x.owner === root.id)
            .reduce((a, x) => a + (x.pw || 10), 0);
      const opts = [
        { k: 'bribe', label: `Pay them off (${credits(cost)} cr)` },
        {
          k: 'threat',
          label: mine > theirs * 1.6 ? 'Tell them to run' : 'Threaten them (they outgun you)',
        },
      ];
      if (root.rival) {
        const rel = this.relOf(d, root.rival);
        opts.push({
          k: 'settle',
          label: `Settle the grudge (${credits(5000 + Math.abs(rel) * 400)} cr)`,
        });
      }
      return say(
        root.rival
          ? lineFor(RIVAL[root.rival], MOOD(this.relOf(d, root.rival)))
          : pick([
              'Cargo or coffin, Captain. Your call.',
              'Nice ship. Be a shame if something happened to it. Unless you pay.',
              'Power down your weapons and send the toll.',
            ]),
        opts,
      );
    }
    if (hostile) {
      // a lawful patrol that wants you dead
      const cost = 3000 + Math.abs(d.rep[root.faction] || 0) * 150;
      return say('You are wanted in this space, Captain. Power down and prepare to be boarded.', [
        { k: 'bribe', label: `Offer a "fine" (${credits(cost)} cr)` },
      ]);
    }
    const opts = [],
      fuelLow = me.fuel < 100,
      hurt = me.armor < me.st.armor * 0.5;
    if (fuelLow)
      opts.push({
        k: 'fuel',
        label: `Ask for fuel (${(d.rep[root.faction] || 0) >= 30 ? 'free, friends help friends' : '600 cr'})`,
      });
    if (hurt) opts.push({ k: 'repair', label: 'Ask for emergency repairs (1,500 cr)' });
    return say(
      fuelLow
        ? 'You sound stranded, Captain. We can spare a little fuel.'
        : root.ai === 'patrol'
          ? pick(PATROL_LINES)
          : pick(TRADER_LINES),
      opts,
    );
  },
  /**
   * Process a player's selected dialogue response or negotiation option in a hail.
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Inbound dialogue choice message.
   * @returns {void}
   */
  hailOpt(s, m) {
    const d = s.data;
    if (m.stellar) return this.hailPlanetOpt(s, m);
    const T = this.hailTarget(s, m);
    if (!T) return;
    const { sp, e, root } = T,
      me = s.ent,
      name = (e.name || this.A.ships[e.hull].name).split(' · ')[0];
    const say = (text) => this.send(s, { t: 'hail', id: e.id, who: name, text, opts: [] });
    const group = [root, ...[...sp.ships.values()].filter((x) => x.owner === root.id)];
    const calm = () => {
      for (const x of group) {
        x.bribed = x.bribed || new Set();
        x.bribed.add(s.id);
        x.aggro.delete(me.id);
        if (x.target === me) x.target = null;
        me.aggro.delete(x.id);
        sp.root(me).aggro.delete(x.id);
      }
    };
    switch (m.k) {
      case 'bribe': {
        const lawful = !FACTIONS[root.faction].pirate && !root.rival,
          cost = lawful ? 3000 + Math.abs(d.rep[root.faction] || 0) * 150 : this.bribeCost(d);
        if (d.credits < cost) return say("You don't have the credits. Pity.");
        d.credits -= cost;
        calm();
        this.you(s);
        this.log(d, `Paid ${credits(cost)} credits to be left alone.`);
        return say(
          lawful
            ? 'Fine paid. We never saw you, Captain. Move along.'
            : 'Pleasure doing business. Off you go.',
        );
      }
      case 'threat': {
        const mine = this.myPower(d),
          theirs = (root.pw || 10) + group.slice(1).reduce((a, x) => a + (x.pw || 10), 0);
        if (mine > theirs * 1.6) {
          for (const x of group) {
            x.ai = 'flee';
            x.target = null;
            x.aggro.delete(me.id);
          }
          return say('...all right, all right! We are going!');
        }
        root.aggro.add(me.id);
        return say('Big words for a small ship. Get them!');
      }
      case 'settle': {
        if (!root.rival) return;
        const rel = this.relOf(d, root.rival),
          cost = 5000 + Math.abs(rel) * 400;
        if (d.credits < cost) return say('Come back when you can afford an apology.');
        d.credits -= cost;
        this.rivalRel(s, root.rival, Math.min(55, -rel - 10), 'you settled the grudge');
        calm();
        this.you(s);
        return say('...fine. Water under the bridge. For now.');
      }
      case 'praise': {
        if (!root.rival) return;
        s.praiseT = s.praiseT || {};
        if (s.praiseT[root.rival] && Date.now() - s.praiseT[root.rival] < 10 * 60000)
          return say('You said that already. Flattery has diminishing returns, Captain.');
        s.praiseT[root.rival] = Date.now();
        this.rivalRel(s, root.rival, 4);
        return say(
          pick([
            'Ha! Kind of you to notice.',
            'Flattery will get you everywhere, Captain.',
            'Well, I do try.',
          ]),
        );
      }
      case 'taunt': {
        if (!root.rival) return;
        this.rivalRel(s, root.rival, -10, 'you taunted them');
        return say(
          pick([
            'Say that again when I am in range.',
            'Cute. I will remember that.',
            'You will regret that, Captain.',
          ]),
        );
      }
      case 'fly': {
        if (!root.rival || this.relOf(d, root.rival) < 60) return;
        root.owner = me.id;
        root.ai = 'escort';
        root.target = null;
        root.slot = null;
        this.toast(s, `${RIVAL[root.rival].name} flies with you until you leave this system.`);
        return say('Lead the way, partner.');
      }
      case 'fuel': {
        if (me.fuel >= 100) return say('Your tanks look fine to me.');
        const free = (d.rep[root.faction] || 0) >= 30;
        if (!free && d.credits < 600) return say('Sorry, Captain. Fuel is not free out here.');
        if (!free) d.credits -= 600;
        me.fuel = Math.min(me.st.fuel, me.fuel + 100);
        this.you(s);
        return say('Transferring enough for one jump. Safe travels.');
      }
      case 'repair': {
        if (me.armor >= me.st.armor * 0.5) return say('You look sound enough.');
        if (d.credits < 1500) return say('Repairs cost money, Captain.');
        d.credits -= 1500;
        me.armor = Math.min(me.st.armor, me.armor + me.st.armor * 0.25);
        this.you(s);
        return say('Patched you up. It will hold until you reach a shipyard.');
      }
    }
  },
  // planets: docking control. When your standing is too low to land, docking control can be persuaded.
  /**
   * Hail a planet's docking control for landing clearance.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} id - Stellar body identifier.
   * @returns {void}
   */
  hailPlanet(s, id) {
    const d = s.data,
      p = STELLARS[id];
    if (!p || p.system !== d.sys) return;
    const say = (text, opts = []) =>
      this.send(s, { t: 'hail', stellar: id, who: p.name, sub: 'Docking control', text, opts });
    if (!p.svc.includes('L')) return say('No reply. Nothing down there is listening.');
    const fac = SYS[p.system].faction,
      rep = d.rep[fac] || 0,
      pass = d.landPass && d.landPass[id] > Date.now();
    if (!p.outlaw && rep <= -30 && !pass)
      return say(
        `${p.name} docking control. Your record precedes you, Captain. Landing clearance denied.`,
        [{ k: 'bribe', label: `Make a "donation" (${credits(2000 + Math.abs(rep) * 200)} cr)` }],
      );
    return say(
      pass
        ? 'Your clearance is on file, Captain. Come on down.'
        : pick([
            `${p.name} docking control. You are clear to land, Captain.`,
            'Docking control here. Pads are open. Mind the traffic.',
            `Welcome to ${p.name}. Landing beacons are lit.`,
          ]),
    );
  },
  /**
   * Handle dialogue response for planetary docking control (such as paying bribes for clearance).
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Inbound option message.
   * @returns {void}
   */
  hailPlanetOpt(s, m) {
    const d = s.data,
      p = STELLARS[m.stellar];
    if (!p || p.system !== d.sys || m.k !== 'bribe') return;
    const rep = d.rep[SYS[p.system].faction] || 0,
      cost = 2000 + Math.abs(rep) * 200;
    if (d.credits < cost)
      return this.send(s, {
        t: 'hail',
        stellar: p.id,
        who: p.name,
        text: 'That is not enough to make us forget, Captain.',
        opts: [],
      });
    d.credits -= cost;
    d.landPass = d.landPass || {};
    d.landPass[p.id] = Date.now() + 30 * 60000;
    this.you(s);
    this.db.touch();
    this.send(s, {
      t: 'hail',
      stellar: p.id,
      who: p.name,
      text: 'Clearance granted for the next thirty minutes. This conversation never happened.',
      opts: [],
    });
  },
};
