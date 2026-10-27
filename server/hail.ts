import { hailMachineHull } from '../shared/hail-machine.ts';
import { npcPortrait, genericPortrait } from '../shared/portraits.ts';
export interface HailOperations {
  bribeCost(this: HailCapabilities, playerData: PlayerData): number;
  hailTarget(
    this: HailCapabilities,
    session: Session,
    message: NetworkMessage,
  ): { sp: Space; e: Entity; root: Entity } | null;
  hail(this: HailCapabilities, session: Session, message: NetworkMessage): void;
  hailOpt(this: HailCapabilities, session: Session, message: NetworkMessage): void;
  hailPlanet(this: HailCapabilities, session: Session, identifier: string): void;
  hailPlanetOpt(this: HailCapabilities, session: Session, message: NetworkMessage): void;
}
import type { HailCapabilities } from './features.ts';
import type { PlayerData, Session } from './game.ts';
import type { NetworkMessage } from './message-registry.ts';
import type { Entity, Space } from './space.ts';

import { contextualHail } from './hail-dialogue.ts';
// hailing. Talk to the ship you have targeted or the planet you have selected:
// bribe pirates, ask traders for fuel or repairs when stranded, bribe a planet for landing rights, trade words with rivals.
import { SYS as systemsById, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.ts';
import { RIVAL, MOOD } from '../shared/rivals.ts';
import { credits } from '../shared/rules.ts';
import { landingRefused } from '../shared/reputation.ts';

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param value - Value to clamp.
 * @param firstValue - Minimum value.
 * @param secondValue - Maximum value.
 * @returns Clamped value.
 */
const _clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Select a random element from an array.
 * @param firstValue - Array of items.
 * @returns Selected item.
 */
const pick = <ValueType>(firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(Math.random() * firstValue.length)];

export const HailOperations = {
  /**
   * Calculate credit cost to bribe hostile forces based on player ship and cargo.
   * @param playerData - Saved player data.
   * @returns Credit cost to bribe.
   */
  bribeCost(this: HailCapabilities, playerData: PlayerData) {
    const shipHullAsset = this.A.ships[playerData.ship.hull],
      cargo = Object.entries(playerData.cargo).reduce(
        (firstValue, [component, count]) =>
          firstValue +
          count *
            ((COMMODITIES.find((commodityDef) => commodityDef.id === component) || {}).base || 100),
        0,
      );
    return (
      Math.max(
        800,
        Math.round(((shipHullAsset && shipHullAsset.cost) || 0) * 0.02 + cargo * 0.4) / 100,
      ) * 100
    );
  },
  /**
   * Find and validate the targeted ship for a hail within comms range.
   * @param session - Player session.
   * @param message - Target hail message.
   * @returns Target context or null if unreachable.
   */
  hailTarget(this: HailCapabilities, session: Session, message: NetworkMessage) {
    const playerData = session.data,
      entity = session.ent!;
    if (!entity || entity.state !== 'fly') return null;
    const space = this.spaces[playerData.sys],
      entity2 = space.ships.get((message.id as number) | 0);
    if (!entity2 || entity2.dead || entity2 === entity) return null;
    if (entity2.player) return { sp: space, e: entity2, root: space.root(entity2) };
    if (Math.hypot(entity2.x - entity.x, entity2.y - entity.y) > 3500) {
      this.toast(session, 'Too far away to hail.');
      return null;
    }
    return { sp: space, e: entity2, root: space.root(entity2) };
  },
  /**
   * Open communications with a targeted ship or selected planet.
   * @param session - Player session.
   * @param message - Inbound hail message.
   */
  hail(this: HailCapabilities, session: Session, message: NetworkMessage) {
    const playerData = session.data;
    if (message.stellar) return this.hailPlanet(session, message.stellar);
    const hailTarget2 = this.hailTarget(session, message);
    if (!hailTarget2) return;
    const { sp: space, e: entity2, root } = hailTarget2;
    if (entity2.player) return this.hails.player(session, entity2);
    const factionDef = FACTIONS[root.faction] || {},
      name = (entity2.name || this.A.ships[entity2.hull].name).split(' · ')[0],
      entity = session.ent!;
    const announce = (text: string, options: Array<{ k: string; label: string }> = []) =>
      this.send(session, {
        t: 'hail',
        portraitId:
          hailMachineHull(entity2) === undefined ? npcPortrait(entity2, playerData.sys) : undefined,
        machineHull: hailMachineHull(entity2),
        id: entity2.id,
        who: name,
        sub: factionDef.name || '',
        text:
          text +
          (entity2.faction === 'ylith' && !playerData.story?.flags?.breach_started
            ? '\n\nCaptains keep bringing us different accounts of the same voyage. It is said the Core keeps everyone’s version from contradicting the others.'
            : ''),
        opts: options,
      });
    if (entity2.faction === 'nhal')
      return announce(
        'A low song fills the channel. No voice answers, and no trading signal is accepted.',
      );
    const realityFlags = playerData.story?.flags;
    if (
      realityFlags?.main_ending === 'unsettling' &&
      entity2.faction !== realityFlags.unsettled_with
    )
      return announce(
        'Your voice reaches me from somewhere beside the channel. I can still trade with you, Captain. I cannot quite see your face.',
      );
    if (realityFlags?.breach_started && !realityFlags.main_ending && space.id === 'dimmer') {
      if (entity2.faction === 'thalassi') {
        realityFlags.convoy_visible = true;
        this.db.touch();
        this.you(session);
        return announce(
          'The Spacer convoy is at 1600, minus 900. Their channel is clear to us. Everyone else insists it is empty space. Follow our bearing.',
        );
      }
      if (entity2.faction === 'umbral')
        return announce(
          'There is no station at that bearing. There has never been a station there. Put out your lights.',
        );
      if (entity2.faction === 'spacer')
        return announce(
          'The station is ahead, bright as a dockyard. The Thalassi found us. Can you see where they are pointing?',
        );
    }

    if (entity2.indexWorksite)
      return announce(
        'Index worksite. Leave marked material alone. Transit and unmarked resources are unrestricted. The Archive records; the Quarry extracts.',
        [{ k: 'index-take', label: 'Take nearby claimed salvage — Index will attack' }],
      );
    if (space.root(entity2) === entity)
      return announce(`${name}: standing by, Captain. Give the order.`);
    if (entity2.disabled) return announce(contextualHail(session, entity2, space));
    if (root.huntOf)
      return announce(
        root.huntOf === session.id
          ? 'Nothing personal, Captain. Somebody paid good money for your hull.'
          : 'Move along. We are working.',
      );
    if (root.faction === 'umbral' || root.faction === 'eclipse' || root.faction === 'swarm')
      return announce(
        root.faction === 'swarm'
          ? 'A wet clicking, then nothing.'
          : 'The Umbral do not answer. Only a low hum, and the static of a light going out.',
      );
    const hostile = space.isHostile(root, entity);
    if (root.rival && !hostile) {
      const rivalDefinition = RIVAL[root.rival],
        relOf2 = this.relOf(playerData, root.rival),
        mood = MOOD(relOf2),
        options = [];
      options.push(
        { k: 'praise', label: 'Compliment their flying' },
        { k: 'taunt', label: 'Taunt them' },
      );
      if (relOf2 >= 60 && !entity2.owner)
        options.push({ k: 'fly', label: 'Ask them to fly with you' });
      return announce(
        `${contextualHail(session, root, space, relOf2)}\n\n(${rivalDefinition.name} · ${mood} · relation ${relOf2})`,
        options,
      );
    }
    if (hostile && (factionDef.pirate || root.rival)) {
      const cost = this.bribeCost(playerData),
        mine = this.myPower(playerData),
        theirs =
          (root.pw || 10) +
          [...space.ships.values()]
            .filter((entity) => entity.owner === root.id)
            .reduce((firstValue, entity) => firstValue + (entity.pw || 10), 0);
      const options = [
        { k: 'bribe', label: `Pay them off (${credits(cost)} cr)` },
        {
          k: 'threat',
          label: mine > theirs * 1.6 ? 'Tell them to run' : 'Threaten them (they outgun you)',
        },
      ];
      if (root.rival) {
        const relOf3 = this.relOf(playerData, root.rival);
        options.push({
          k: 'settle',
          label: `Settle the grudge (${credits(5000 + Math.abs(relOf3) * 400)} cr)`,
        });
      }
      return announce(
        root.rival
          ? contextualHail(session, root, space, this.relOf(playerData, root.rival))
          : contextualHail(session, root, space) +
              ' ' +
              pick([
                'Cargo or coffin, Captain. Your call.',
                'Nice ship. Be a shame if something happened to it. Unless you pay.',
                'Power down your weapons and send the toll.',
              ]),
        options,
      );
    }
    if (hostile) {
      // a lawful patrol that wants you dead
      const cost = 3000 + Math.abs(playerData.rep[root.faction] || 0) * 150;
      return announce(
        contextualHail(session, root, space) +
          ' You are wanted in this space, Captain. Power down and prepare to be boarded.',
        [{ k: 'bribe', label: `Offer a "fine" (${credits(cost)} cr)` }],
      );
    }
    const options3 = [],
      fuelLow = entity.fuel < 100,
      hurt = entity.armor < entity.st.armor * 0.5;
    if (fuelLow)
      options3.push({
        k: 'fuel',
        label: `Ask for fuel (${(playerData.rep[root.faction] || 0) >= 30 ? 'free, friends help friends' : '600 cr'})`,
      });
    if (hurt) options3.push({ k: 'repair', label: 'Ask for emergency repairs (1,500 cr)' });
    return announce(contextualHail(session, entity2, space), options3);
  },
  /**
   * Process a player's selected dialogue response or negotiation option in a hail.
   * @param session - Player session.
   * @param message - Inbound dialogue choice message.
   */
  hailOpt(this: HailCapabilities, session: Session, message: NetworkMessage) {
    const playerData = session.data;
    if (message.stellar) return this.hailPlanetOpt(session, message);
    const hailTarget2 = this.hailTarget(session, message);
    if (!hailTarget2) return;
    const { sp: space, e: entity2, root } = hailTarget2;
    if (entity2.player || entity2.disabled || entity2.faction === 'nhal') return;
    const entity = session.ent!,
      name = (entity2.name || this.A.ships[entity2.hull].name).split(' · ')[0];
    const announce = (text: string) =>
      this.send(session, {
        t: 'hail',
        portraitId:
          hailMachineHull(entity2) === undefined ? npcPortrait(entity2, playerData.sys) : undefined,
        machineHull: hailMachineHull(entity2),
        id: entity2.id,
        who: name,
        text,
        opts: [],
      });
    if (entity2.indexWorksite) {
      if (message.k === 'index-take') {
        if (space.id === 'glasswake') this.index.take(session, space);
        else {
          const parcel = space.loot.find(
            (item) =>
              !item.taken &&
              item.it.indexClaim &&
              Math.hypot(item.x - session.ent!.x, item.y - session.ent!.y) <= 250,
          );
          if (parcel) this.indexFleet.take(space, session.ent!, parcel.it);
          else this.toast(session, 'No marked salvage within 250 units.');
        }
      }
      return;
    }
    const group = [root, ...[...space.ships.values()].filter((entity) => entity.owner === root.id)];
    const calm = () => {
      for (const entity3 of group) {
        entity3.bribed = entity3.bribed || new Set();
        entity3.bribed.add(session.id);
        entity3.aggro.delete(entity.id);
        if (entity3.target === entity) entity3.target = null;
        entity.aggro.delete(entity3.id);
        space.root(entity).aggro.delete(entity3.id);
      }
    };
    switch (message.k) {
      case 'bribe': {
        const lawful = !FACTIONS[root.faction].pirate && !root.rival,
          cost = lawful
            ? 3000 + Math.abs(playerData.rep[root.faction] || 0) * 150
            : this.bribeCost(playerData);
        if (playerData.credits < cost) return announce("You don't have the credits. Pity.");
        playerData.credits -= cost;
        calm();
        this.you(session);
        this.log(playerData, `Paid ${credits(cost)} credits to be left alone.`);
        return announce(
          lawful
            ? 'Fine paid. We never saw you, Captain. Move along.'
            : 'Pleasure doing business. Off you go.',
        );
      }
      case 'threat': {
        const mine = this.myPower(playerData),
          theirs =
            (root.pw || 10) +
            group.slice(1).reduce((firstValue, entity) => firstValue + (entity.pw || 10), 0);
        if (mine > theirs * 1.6) {
          for (const entity3 of group) {
            entity3.ai = 'flee';
            entity3.target = null;
            entity3.aggro.delete(entity.id);
          }
          return announce('...all right, all right! We are going!');
        }
        root.aggro.add(entity.id);
        return announce('Big words for a small ship. Get them!');
      }
      case 'settle': {
        if (!root.rival) return;
        const relOf2 = this.relOf(playerData, root.rival),
          cost = 5000 + Math.abs(relOf2) * 400;
        if (playerData.credits < cost) return announce('Come back when you can afford an apology.');
        playerData.credits -= cost;
        this.rivalRel(session, root.rival, Math.min(55, -relOf2 - 10), 'you settled the grudge');
        calm();
        this.you(session);
        return announce('...fine. Water under the bridge. For now.');
      }
      case 'praise': {
        if (!root.rival) return;
        session.praiseT = session.praiseT || {};
        if (session.praiseT[root.rival] && Date.now() - session.praiseT[root.rival] < 10 * 60000)
          return announce('You said that already. Flattery has diminishing returns, Captain.');
        session.praiseT[root.rival] = Date.now();
        this.rivalRel(session, root.rival, 4);
        return announce(
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
        return announce(
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
        return announce('Lead the way, partner.');
      }
      case 'fuel': {
        if (entity.fuel >= 100) return announce('Your tanks look fine to me.');
        const free = (playerData.rep[root.faction] || 0) >= 30;
        if (!free && playerData.credits < 600)
          return announce('Sorry, Captain. Fuel is not free out here.');
        if (!free) playerData.credits -= 600;
        entity.fuel = Math.min(entity.st.fuel, entity.fuel + 100);
        this.you(session);
        return announce('Transferring enough for one jump. Safe travels.');
      }
      case 'repair': {
        if (entity.armor >= entity.st.armor * 0.5) return announce('You look sound enough.');
        if (playerData.credits < 1500) return announce('Repairs cost money, Captain.');
        playerData.credits -= 1500;
        entity.armor = Math.min(entity.st.armor, entity.armor + entity.st.armor * 0.25);
        this.you(session);
        return announce('Patched you up. It will hold until you reach a shipyard.');
      }
    }
  },
  // planets: docking control. When your standing is too low to land, docking control can be persuaded.
  /**
   * Hail a planet's docking control for landing clearance.
   * @param session - Player session.
   * @param identifier - Stellar body identifier.
   */
  hailPlanet(this: HailCapabilities, session: Session, identifier: string) {
    const playerData = session.data,
      stellarBody = STELLARS[identifier];
    if (!stellarBody || stellarBody.system !== playerData.sys) return;
    const announce = (text: string, options: Array<{ k: string; label: string }> = []) =>
      this.send(session, {
        t: 'hail',
        portraitId: genericPortrait(
          `control:${identifier}`,
          systemsById[stellarBody.system].faction,
        ),
        stellar: identifier,
        who: stellarBody.name,
        sub: 'Docking control',
        text,
        opts: options,
      });
    if (!stellarBody.svc.includes('L'))
      return announce('No reply. Nothing down there is listening.');
    const faction2 = systemsById[stellarBody.system].faction,
      reputation = playerData.rep[faction2] || 0,
      passExpires = playerData.landPass?.[identifier] || 0,
      pass = passExpires > Date.now(),
      ownStation = !!stellarBody.site && playerData.station.site === identifier;
    if (ownStation)
      return announce('Welcome home, Captain. Your berth is clear and the pads are yours.');
    if (
      landingRefused({
        standing: reputation,
        outlawPort: !!stellarBody.outlaw,
        ownStation,
        passExpires,
        now: Date.now(),
      })
    )
      return announce(
        `${stellarBody.name} docking control. Your record precedes you, Captain. Landing clearance denied.`,
        [
          {
            k: 'bribe',
            label: `Make a "donation" (${credits(2000 + Math.abs(reputation) * 200)} cr)`,
          },
        ],
      );
    if (identifier === 'qstation' && playerData.story?.flags?.main_ending === 'captains_watch')
      return announce(
        'Your own voice answers from the heart of the station: I am here. The berth is held. You are clear to land, Captain.',
      );
    return announce(
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
   * @param session - Player session.
   * @param message - Inbound option message.
   */
  hailPlanetOpt(this: HailCapabilities, session: Session, message: NetworkMessage) {
    const playerData = session.data,
      stellarBody = STELLARS[message.stellar!];
    if (!stellarBody || stellarBody.system !== playerData.sys || message.k !== 'bribe') return;
    // Your own station never asks for a "donation".
    if (stellarBody.site && playerData.station.site === stellarBody.id) return;
    const reputation = playerData.rep[systemsById[stellarBody.system].faction] || 0,
      cost = 2000 + Math.abs(reputation) * 200;
    if (playerData.credits < cost)
      return this.send(session, {
        t: 'hail',
        portraitId: genericPortrait(
          `control:${stellarBody.id}`,
          systemsById[stellarBody.system].faction,
        ),
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
      portraitId: genericPortrait(
        `control:${stellarBody.id}`,
        systemsById[stellarBody.system].faction,
      ),
      stellar: stellarBody.id,
      who: stellarBody.name,
      text: 'Clearance granted for the next thirty minutes. This conversation never happened.',
      opts: [],
    });
  },
};
