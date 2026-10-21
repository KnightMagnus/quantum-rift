import { contextualHail } from './hail-dialogue.js';
// 1.1: hailing. Talk to the ship you have targeted or the planet you have selected:
// bribe pirates, ask traders for fuel or repairs when stranded, bribe a planet for landing rights, trade words with rivals.
import { SYS, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.js';
import { RIVAL, MOOD } from '../shared/rivals.js';
import { credits } from '../shared/rules.js';

/** @import { PlayerData, Session } from './game.js' */
/** @import { NetworkMessage } from './message-registry.js' */
/** @import { Entity, Space } from './space.js' */

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

export const HailOperations = {
  /**
   * Calculate credit cost to bribe hostile forces based on player ship and cargo.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Credit cost to bribe.
   */
  bribeCost(playerData) {
    const H = this.A.ships[playerData.ship.hull],
      cargo = Object.entries(playerData.cargo).reduce(
        (a, [c, n]) => a + n * ((COMMODITIES.find((x) => x.id === c) || {}).base || 100),
        0,
      );
    return Math.max(800, Math.round(((H && H.cost) || 0) * 0.02 + cargo * 0.4) / 100) * 100;
  },
  /**
   * Find and validate the targeted ship for a hail within comms range.
   * @param {Session} session - Player session.
   * @param {NetworkMessage} message - Target hail message.
   * @returns {{sp: Space, e: Entity, root: Entity} | null} Target context or null if unreachable.
   */
  hailTarget(session, message) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly') return null;
    const sp = this.spaces[playerData.sys],
      e = sp.ships.get(message.id | 0);
    if (!e || e.dead || e === entity) return null;
    if (e.player) return { sp, e, root: sp.root(e) };
    if (Math.hypot(e.x - entity.x, e.y - entity.y) > 3500) {
      this.toast(session, 'Too far away to hail.');
      return null;
    }
    return { sp, e, root: sp.root(e) };
  },
  /**
   * Open communications with a targeted ship or selected planet.
   * @param {Session} session - Player session.
   * @param {NetworkMessage} message - Inbound hail message.
   * @returns {void}
   */
  hail(session, message) {
    const playerData = session.data;
    if (message.stellar) return this.hailPlanet(session, message.stellar);
    const T = this.hailTarget(session, message);
    if (!T) return;
    const { sp, e, root } = T;
    if (e.player) return this.hails.player(session, e);
    const F = FACTIONS[root.faction] || {},
      name = (e.name || this.A.ships[e.hull].name).split(' · ')[0],
      entity = session.ent;
    const say = (text, opts = []) =>
      this.send(session, { t: 'hail', id: e.id, who: name, sub: F.name || '', text, opts });
    if (sp.root(e) === entity) return say(`${name}: standing by, Captain. Give the order.`);
    if (e.disabled) return say(contextualHail(session, e, sp));
    if (root.huntOf)
      return say(
        root.huntOf === session.id
          ? 'Nothing personal, Captain. Somebody paid good money for your hull.'
          : 'Move along. We are working.',
      );
    if (root.faction === 'umbral' || root.faction === 'eclipse' || root.faction === 'swarm')
      return say(
        root.faction === 'swarm'
          ? 'A wet clicking, then nothing.'
          : 'The Umbral do not answer. Only a low hum, and the static of a light going out.',
      );
    const hostile = sp.isHostile(root, entity);
    if (root.rival && !hostile) {
      const R = RIVAL[root.rival],
        rel = this.relOf(playerData, root.rival),
        mood = MOOD(rel),
        opts = [];
      opts.push(
        { k: 'praise', label: 'Compliment their flying' },
        { k: 'taunt', label: 'Taunt them' },
      );
      if (rel >= 60 && !e.owner) opts.push({ k: 'fly', label: 'Ask them to fly with you' });
      return say(
        `${contextualHail(session, root, sp, rel)}\n\n(${R.name} · ${mood} · relation ${rel})`,
        opts,
      );
    }
    if (hostile && (F.pirate || root.rival)) {
      const cost = this.bribeCost(playerData),
        mine = this.myPower(playerData),
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
        const rel = this.relOf(playerData, root.rival);
        opts.push({
          k: 'settle',
          label: `Settle the grudge (${credits(5000 + Math.abs(rel) * 400)} cr)`,
        });
      }
      return say(
        root.rival
          ? contextualHail(session, root, sp, this.relOf(playerData, root.rival))
          : contextualHail(session, root, sp) +
              ' ' +
              pick([
                'Cargo or coffin, Captain. Your call.',
                'Nice ship. Be a shame if something happened to it. Unless you pay.',
                'Power down your weapons and send the toll.',
              ]),
        opts,
      );
    }
    if (hostile) {
      // a lawful patrol that wants you dead
      const cost = 3000 + Math.abs(playerData.rep[root.faction] || 0) * 150;
      return say(
        contextualHail(session, root, sp) +
          ' You are wanted in this space, Captain. Power down and prepare to be boarded.',
        [{ k: 'bribe', label: `Offer a "fine" (${credits(cost)} cr)` }],
      );
    }
    const opts = [],
      fuelLow = entity.fuel < 100,
      hurt = entity.armor < entity.st.armor * 0.5;
    if (fuelLow)
      opts.push({
        k: 'fuel',
        label: `Ask for fuel (${(playerData.rep[root.faction] || 0) >= 30 ? 'free, friends help friends' : '600 cr'})`,
      });
    if (hurt) opts.push({ k: 'repair', label: 'Ask for emergency repairs (1,500 cr)' });
    return say(contextualHail(session, e, sp), opts);
  },
  /**
   * Process a player's selected dialogue response or negotiation option in a hail.
   * @param {Session} session - Player session.
   * @param {NetworkMessage} message - Inbound dialogue choice message.
   * @returns {void}
   */
  hailOpt(session, message) {
    const playerData = session.data;
    if (message.stellar) return this.hailPlanetOpt(session, message);
    const T = this.hailTarget(session, message);
    if (!T) return;
    const { sp, e, root } = T;
    if (e.player || e.disabled) return;
    const entity = session.ent,
      name = (e.name || this.A.ships[e.hull].name).split(' · ')[0];
    const say = (text) => this.send(session, { t: 'hail', id: e.id, who: name, text, opts: [] });
    const group = [root, ...[...sp.ships.values()].filter((x) => x.owner === root.id)];
    const calm = () => {
      for (const x of group) {
        x.bribed = x.bribed || new Set();
        x.bribed.add(session.id);
        x.aggro.delete(entity.id);
        if (x.target === entity) x.target = null;
        entity.aggro.delete(x.id);
        sp.root(entity).aggro.delete(x.id);
      }
    };
    switch (message.k) {
      case 'bribe': {
        const lawful = !FACTIONS[root.faction].pirate && !root.rival,
          cost = lawful
            ? 3000 + Math.abs(playerData.rep[root.faction] || 0) * 150
            : this.bribeCost(playerData);
        if (playerData.credits < cost) return say("You don't have the credits. Pity.");
        playerData.credits -= cost;
        calm();
        this.you(session);
        this.log(playerData, `Paid ${credits(cost)} credits to be left alone.`);
        return say(
          lawful
            ? 'Fine paid. We never saw you, Captain. Move along.'
            : 'Pleasure doing business. Off you go.',
        );
      }
      case 'threat': {
        const mine = this.myPower(playerData),
          theirs = (root.pw || 10) + group.slice(1).reduce((a, x) => a + (x.pw || 10), 0);
        if (mine > theirs * 1.6) {
          for (const x of group) {
            x.ai = 'flee';
            x.target = null;
            x.aggro.delete(entity.id);
          }
          return say('...all right, all right! We are going!');
        }
        root.aggro.add(entity.id);
        return say('Big words for a small ship. Get them!');
      }
      case 'settle': {
        if (!root.rival) return;
        const rel = this.relOf(playerData, root.rival),
          cost = 5000 + Math.abs(rel) * 400;
        if (playerData.credits < cost) return say('Come back when you can afford an apology.');
        playerData.credits -= cost;
        this.rivalRel(session, root.rival, Math.min(55, -rel - 10), 'you settled the grudge');
        calm();
        this.you(session);
        return say('...fine. Water under the bridge. For now.');
      }
      case 'praise': {
        if (!root.rival) return;
        session.praiseT = session.praiseT || {};
        if (session.praiseT[root.rival] && Date.now() - session.praiseT[root.rival] < 10 * 60000)
          return say('You said that already. Flattery has diminishing returns, Captain.');
        session.praiseT[root.rival] = Date.now();
        this.rivalRel(session, root.rival, 4);
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
        this.rivalRel(session, root.rival, -10, 'you taunted them');
        return say(
          pick([
            'Say that again when I am in range.',
            'Cute. I will remember that.',
            'You will regret that, Captain.',
          ]),
        );
      }
      case 'fly': {
        if (!root.rival || this.relOf(playerData, root.rival) < 60) return;
        root.owner = entity.id;
        root.ai = 'escort';
        root.target = null;
        root.slot = null;
        this.toast(
          session,
          `${RIVAL[root.rival].name} flies with you until you leave this system.`,
        );
        return say('Lead the way, partner.');
      }
      case 'fuel': {
        if (entity.fuel >= 100) return say('Your tanks look fine to me.');
        const free = (playerData.rep[root.faction] || 0) >= 30;
        if (!free && playerData.credits < 600)
          return say('Sorry, Captain. Fuel is not free out here.');
        if (!free) playerData.credits -= 600;
        entity.fuel = Math.min(entity.st.fuel, entity.fuel + 100);
        this.you(session);
        return say('Transferring enough for one jump. Safe travels.');
      }
      case 'repair': {
        if (entity.armor >= entity.st.armor * 0.5) return say('You look sound enough.');
        if (playerData.credits < 1500) return say('Repairs cost money, Captain.');
        playerData.credits -= 1500;
        entity.armor = Math.min(entity.st.armor, entity.armor + entity.st.armor * 0.25);
        this.you(session);
        return say('Patched you up. It will hold until you reach a shipyard.');
      }
    }
  },
  // planets: docking control. When your standing is too low to land, docking control can be persuaded.
  /**
   * Hail a planet's docking control for landing clearance.
   * @param {Session} session - Player session.
   * @param {string} id - Stellar body identifier.
   * @returns {void}
   */
  hailPlanet(session, id) {
    const playerData = session.data,
      stellarBody = STELLARS[id];
    if (!stellarBody || stellarBody.system !== playerData.sys) return;
    const say = (text, opts = []) =>
      this.send(session, {
        t: 'hail',
        stellar: id,
        who: stellarBody.name,
        sub: 'Docking control',
        text,
        opts,
      });
    if (!stellarBody.svc.includes('L')) return say('No reply. Nothing down there is listening.');
    const fac = SYS[stellarBody.system].faction,
      rep = playerData.rep[fac] || 0,
      pass = playerData.landPass && playerData.landPass[id] > Date.now();
    if (!stellarBody.outlaw && rep <= -30 && !pass)
      return say(
        `${stellarBody.name} docking control. Your record precedes you, Captain. Landing clearance denied.`,
        [{ k: 'bribe', label: `Make a "donation" (${credits(2000 + Math.abs(rep) * 200)} cr)` }],
      );
    return say(
      pass
        ? 'Your clearance is on file, Captain. Come on down.'
        : pick([
            `${stellarBody.name} docking control. You are clear to land, Captain.`,
            'Docking control here. Pads are open. Mind the traffic.',
            `Welcome to ${stellarBody.name}. Landing beacons are lit.`,
          ]),
    );
  },
  /**
   * Handle dialogue response for planetary docking control (such as paying bribes for clearance).
   * @param {Session} session - Player session.
   * @param {NetworkMessage} message - Inbound option message.
   * @returns {void}
   */
  hailPlanetOpt(session, message) {
    const playerData = session.data,
      stellarBody = STELLARS[message.stellar];
    if (!stellarBody || stellarBody.system !== playerData.sys || message.k !== 'bribe') return;
    const rep = playerData.rep[SYS[stellarBody.system].faction] || 0,
      cost = 2000 + Math.abs(rep) * 200;
    if (playerData.credits < cost)
      return this.send(session, {
        t: 'hail',
        stellar: stellarBody.id,
        who: stellarBody.name,
        text: 'That is not enough to make us forget, Captain.',
        opts: [],
      });
    playerData.credits -= cost;
    playerData.landPass = playerData.landPass || {};
    playerData.landPass[stellarBody.id] = Date.now() + 30 * 60000;
    this.you(session);
    this.db.touch();
    this.send(session, {
      t: 'hail',
      stellar: stellarBody.id,
      who: stellarBody.name,
      text: 'Clearance granted for the next thirty minutes. This conversation never happened.',
      opts: [],
    });
  },
};
