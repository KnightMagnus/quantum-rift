import type { RivalDefinition } from '../shared/rivals.ts';
import type { RivalState } from './world-contracts.ts';
export interface RivalsOperations {
  rivalsInit(this: RivalsCapabilities): void;
  rivalState(this: RivalsCapabilities, identifier: string): RivalState | undefined;
  rivalName(this: RivalsCapabilities, identifier: string): string;
  relOf(this: RivalsCapabilities, playerData: PlayerData, identifier: string): number;
  rivalRel(
    this: RivalsCapabilities,
    session: Session,
    identifier: string,
    delta: number,
    reason?: string,
  ): void;
  news(this: RivalsCapabilities, text: string): void;
  newsFeed(this: RivalsCapabilities, count?: number): string[];
  flashMult(this: RivalsCapabilities, stellar: string, captainId: string): number;
  rivalsTick(this: RivalsCapabilities): void;
  spawnHunters(this: RivalsCapabilities, session: Session, rivalDefinition: RivalDefinition): void;
  rivalSync(this: RivalsCapabilities, space: Space): void;
  rivalThink(this: RivalsCapabilities, entity: Entity, space: Space): void;
  rivalHostile(
    this: RivalsCapabilities,
    entity: Entity,
    stellarBody: PlayerReference | null,
  ): boolean | undefined;
  rivalOnHit(this: RivalsCapabilities, session: Session, entity: Entity, space: Space): void;
  rivalOnKill(this: RivalsCapabilities, session: Session, entity: Entity, space: Space): boolean;
  rivalDocked(this: RivalsCapabilities, entity: Entity): void;
  rivalBoard(
    this: RivalsCapabilities,
    category: string,
  ): Array<{ name: string; ai: boolean; v: number }>;
  rivalsPayload(
    this: RivalsCapabilities,
    playerData: PlayerData,
  ): Array<Record<string, string | number>>;
}
import type { RivalsCapabilities } from './features.ts';
import type { PlayerData, Session, SpaceSystem, PlayerReference } from './game.ts';
import type { Entity, Space } from './space.ts';

// Living Rift: rival captains (careers, presence in live systems, relations, hunters and allies), spaceport news
// and market price spikes. Rival state lives in world.rivals; relations are kept per player.
import { SYS as systemsById, SYSTEMS, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.ts';
import {
  RIVALS,
  RIVAL,
  KINDS,
  rivalHull,
  MOOD,
  MOOD_LABEL,
  NEWS_TEMPLATES as newsTemplates,
} from '../shared/rivals.ts';
import { credits } from '../shared/rules.ts';

/** @import { PlayerData, Session, SpaceSystem, StellarBody } from './game.ts' */
/** @import { Entity, Space } from './space.ts' */

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} value - Value to clamp.
 * @param {number} firstValue - Minimum value.
 * @param {number} secondValue - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Select a random item from an array.
 * @template T
 * @param {T[]} firstValue - Array of items.
 * @returns {T} Selected item.
 */
const pick = <ValueType>(firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(Math.random() * firstValue.length)];

// where each career likes to fly
/**
 * Check whether a system is appropriate for a rival's career archetype.
 * @param {{fac: string, kind: string}} radius - Rival configuration.
 * @param {SpaceSystem} system - System definition object.
 * @returns {boolean} True if system is valid for the rival.
 */
function okSystem(radius: { fac: string; kind: string }, system: SpaceSystem): boolean {
  if (!system || system.arena || system.faction === 'deep' || FACTIONS[system.faction].hidden)
    return false;
  if (radius.fac === 'farside') return !!system.farside;
  if (system.farside) return false;
  if (radius.kind === 'pirate')
    return system.danger >= 2 || system.faction === 'hollow' || system.faction === 'frontier';
  return system.danger <= 3 && system.faction !== 'hollow' && system.faction !== 'umbral';
}

export const RivalsOperations = {
  /**
   * Initialize rival captains state and ambient spaceport news in world database.
   * @returns {void}
   */
  rivalsInit(this: RivalsCapabilities) {
    const worldData = this.db.world;
    worldData.rivals = worldData.rivals || {};
    worldData.news = worldData.news || [];
    worldData.flash = worldData.flash || [];
    for (const rivalDefinition of RIVALS) {
      if (worldData.rivals[rivalDefinition.id]) continue;
      const home = SYSTEMS.filter(
        (starSystem) =>
          okSystem(rivalDefinition, starSystem) &&
          (starSystem.faction === rivalDefinition.fac ||
            (rivalDefinition.fac === 'hollow' && starSystem.danger >= 2) ||
            (rivalDefinition.fac === 'farside' && starSystem.farside)),
      );
      const wealth = Math.round(
        40000 *
          rivalDefinition.luck *
          (1 + Math.pow(Math.random(), 2) * 70) *
          (rivalDefinition.special ? 4 : 1),
      ); // most start modest, a few are rich veterans
      worldData.rivals[rivalDefinition.id] = {
        id: rivalDefinition.id,
        sys: (home.length
          ? pick(home)
          : pick(SYSTEMS.filter((starSystem) => okSystem(rivalDefinition, starSystem)))
        ).id,
        credits: wealth,
        earned: Math.round(wealth * (0.5 + Math.random())),
        kills:
          rivalDefinition.kind === 'hunter' || rivalDefinition.kind === 'pirate'
            ? Math.floor(Math.random() * 40)
            : Math.floor(Math.random() * 5),
        hull: rivalHull(this.A, rivalDefinition.fac, wealth, rivalDefinition.kind),
        down: 0,
        rel: {},
      };
    }
    for (const rivalDefinition of RIVALS) {
      const rivalState = worldData.rivals[rivalDefinition.id],
        want = rivalHull(this.A, rivalDefinition.fac, rivalState.credits, rivalDefinition.kind);
      if (
        rivalState.hull !== want &&
        this.A.ships[rivalState.hull] &&
        (this.A.ships[rivalState.hull].role === 'survey') !== (this.A.ships[want].role === 'survey')
      )
        rivalState.hull = want;
    } // saves from before careers chose hulls
    if (!worldData.news.length)
      for (const rivalDefinition of RIVALS.slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 4)) {
        const rivalState = worldData.rivals[rivalDefinition.id];
        this.news(
          newsTemplates.upgrade(
            rivalDefinition.name,
            this.A.ships[rivalState.hull].name,
            systemsById[rivalState.sys].name,
          ),
        );
      } // a fresh Rift starts with a few headlines
    this.rivalEnts = new Map(); // rival id -> { sys, id } while they are present in a live system
  },
  /**
   * Look up persistent state for a rival captain.
   * @param {string} identifier - Rival identifier.
   * @returns {Record<string, string | number | boolean> | undefined} Persistent rival record.
   */
  rivalState(this: RivalsCapabilities, identifier: string) {
    return this.db.world.rivals[identifier];
  },
  /**
   * Look up full name of a rival captain.
   * @param {string} identifier - Rival identifier.
   * @returns {string} Rival name.
   */
  rivalName(this: RivalsCapabilities, identifier: string) {
    return RIVAL[identifier] ? RIVAL[identifier].name : '';
  },
  /**
   * Look up relationship score between a player and a rival captain.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} identifier - Rival identifier.
   * @returns {number} Relationship score (-100 to 100).
   */
  relOf(this: RivalsCapabilities, playerData: PlayerData, identifier: string) {
    const rivalState2 = this.rivalState(identifier);
    return rivalState2 ? rivalState2.rel[this.db.key(playerData.name)] || 0 : 0;
  },
  /**
   * Modify relationship score with a rival, logging changes and broadcasting news on threshold shifts.
   * @param {Session} session - Player session.
   * @param {string} identifier - Rival identifier.
   * @param {number} delta - Delta to apply.
   * @param {string} [reason] - Reason description.
   * @returns {void}
   */
  rivalRel(
    this: RivalsCapabilities,
    session: Session,
    identifier: string,
    delta: number,
    reason?: string,
  ) {
    const playerData = session.data,
      rivalState2 = this.rivalState(identifier);
    if (!rivalState2) return;
    const entryKey = this.db.key(playerData.name),
      before = MOOD(rivalState2.rel[entryKey] || 0);
    rivalState2.rel[entryKey] = clamp((rivalState2.rel[entryKey] || 0) + delta, -100, 100);
    const after = MOOD(rivalState2.rel[entryKey]);
    if (before !== after) {
      const rivalDefinition = RIVAL[identifier];
      this.toast(
        session,
        `${rivalDefinition.name} is now your ${MOOD_LABEL[after].toLowerCase()}${reason ? ` (${reason})` : ''}.`,
      );
      this.log(
        playerData,
        `${rivalDefinition.name} is now your ${MOOD_LABEL[after].toLowerCase()}.`,
      );
      if (
        after === 'nemesis' &&
        (rivalDefinition.kind === 'hunter' || rivalDefinition.kind === 'pirate')
      )
        this.news(newsTemplates.grudge(rivalDefinition.name, playerData.name));
      if (after === 'ally') this.news(newsTemplates.allied(rivalDefinition.name, playerData.name));
    }
    this.db.touch();
  },
  /**
   * Add a headline to the persistent galaxy news feed.
   * @param {string} text - Headline text.
   * @returns {void}
   */
  news(this: RivalsCapabilities, text: string) {
    const worldData = this.db.world;
    worldData.news.push({ t: Date.now(), text });
    if (worldData.news.length > 60) worldData.news.splice(0, worldData.news.length - 60);
  },
  /**
   * Retrieve recent headlines from the world news feed.
   * @param {number} [count=6] - Number of items to retrieve.
   * @returns {string[]} Array of recent news strings.
   */
  newsFeed(this: RivalsCapabilities, count: number = 6) {
    return this.db.world.news
      .slice(-count)
      .reverse()
      .map((positionX) => positionX.text);
  },
  /**
   * Get active flash market price multiplier for a commodity at a stellar port.
   * @param {string} stellar - Stellar port ID.
   * @param {string} captainId - Commodity ID.
   * @returns {number} Price multiplier.
   */
  flashMult(this: RivalsCapabilities, stellar: string, captainId: string) {
    const factionId = (this.db.world.flash || []).find(
      (positionX) =>
        positionX.stellar === stellar &&
        positionX.cid === captainId &&
        positionX.until > Date.now(),
    );
    return factionId ? factionId.mult : 1;
  },

  // every 20 s: careers move on, ships get upgraded, news is made, grudges turn into hunters
  /**
   * Advance rival captains simulation tick: upgrade ships, trigger news, move between systems, spawn hunters.
   * @returns {void}
   */
  rivalsTick(this: RivalsCapabilities) {
    const worldData = this.db.world,
      currentTime = Date.now();
    let hasAnyMatch = false;
    for (const rivalDefinition of RIVALS) {
      const rivalState = worldData.rivals[rivalDefinition.id],
        kinds = KINDS[rivalDefinition.kind];
      if (!rivalState) continue;
      if (rivalState.down) {
        if (currentTime < rivalState.down) continue;
        rivalState.down = 0;
        const home = SYSTEMS.filter((starSystem) => okSystem(rivalDefinition, starSystem));
        rivalState.sys = pick(home).id;
        hasAnyMatch = true;
      }
      const gain = Math.round(
        (kinds.earn * rivalDefinition.luck * (0.3 + Math.random() * 0.9)) / 12,
      );
      rivalState.credits += gain;
      rivalState.earned += gain; // ~100k an hour, like a busy player
      if (
        (rivalDefinition.kind === 'hunter' || rivalDefinition.kind === 'pirate') &&
        Math.random() < 0.15
      )
        rivalState.kills++;
      const better = rivalHull(
        this.A,
        rivalDefinition.fac,
        rivalState.credits,
        rivalDefinition.kind,
      );
      if (
        better !== rivalState.hull &&
        (this.A.ships[better].cost || 0) >
          (this.A.ships[rivalState.hull] ? this.A.ships[rivalState.hull].cost || 0 : 0)
      ) {
        rivalState.credits -= Math.round((this.A.ships[better].cost || 0) * 0.5);
        rivalState.hull = better;
        this.news(
          newsTemplates.upgrade(
            rivalDefinition.name,
            this.A.ships[better].name,
            systemsById[rivalState.sys].name,
          ),
        );
        hasAnyMatch = true;
      }
      if (Math.random() < 0.025) {
        const place = systemsById[rivalState.sys].name;
        this.news(
          rivalDefinition.kind === 'trader'
            ? newsTemplates.haul(
                rivalDefinition.name,
                place,
                credits(Math.round(gain * (4 + Math.random() * 8))),
              )
            : rivalDefinition.kind === 'hunter'
              ? newsTemplates.bounty(
                  rivalDefinition.name,
                  `Hollow captain ${pick(['Vask', 'Grail', 'Thorne', 'Kettle', 'Wren'])}`,
                )
              : rivalDefinition.kind === 'miner'
                ? newsTemplates.strike(rivalDefinition.name, place)
                : rivalDefinition.kind === 'explorer'
                  ? newsTemplates.chart(rivalDefinition.name, place)
                  : newsTemplates.raid(rivalDefinition.name, place),
        );
      }
      const entity = this.rivalEnts.get(rivalDefinition.id),
        busy =
          entity &&
          this.live[entity.sys] &&
          (() => {
            const entity2 = this.live[entity.sys].ships.get(entity.id);
            return entity2 && (entity2.aggro.size || entity2.target || entity2.owner);
          })();
      if (!busy && Math.random() < 0.22) {
        const options = systemsById[rivalState.sys].links.filter((length) =>
          okSystem(rivalDefinition, systemsById[length]),
        );
        if (options.length) {
          rivalState.sys = pick(options);
          hasAnyMatch = true;
        }
      }
    }
    // market flashes: a shortage or a glut somewhere, for twenty minutes
    worldData.flash = worldData.flash.filter((factionId) => factionId.until > currentTime);
    if (worldData.flash.length < 4 && Math.random() < 0.12) {
      const stellarBodys = Object.values(STELLARS).filter(
          (stellarBody) =>
            stellarBody!.svc &&
            stellarBody!.svc.includes('T') &&
            !stellarBody!.site &&
            !systemsById[stellarBody!.system].farside,
        ),
        stellarBody2 = pick(stellarBodys),
        commodityDef = pick(
          COMMODITIES.filter((commodityDef) =>
            ['food', 'medical', 'luxury', 'metal', 'equipment'].includes(commodityDef.id),
          ),
        );
      const upward = Math.random() < 0.55;
      worldData.flash.push({
        stellar: stellarBody2.id,
        cid: commodityDef.id,
        mult: upward ? 1.45 : 0.6,
        until: currentTime + 20 * 60000,
      });
      this.news(
        upward
          ? `Shortage of ${commodityDef.name.toLowerCase()} on ${stellarBody2.name} (${systemsById[stellarBody2.system].name}): prices soar.`
          : `A glut of ${commodityDef.name.toLowerCase()} on ${stellarBody2.name} (${systemsById[stellarBody2.system].name}): prices crash.`,
      );
    }
    // grudges: a nemesis hunter or pirate sends hired guns after you
    for (const session of this.sessions.values()) {
      const playerData = session.data;
      if (!playerData || !session.ent || session.ent.state !== 'fly') continue;
      const starSystem = systemsById[playerData.sys];
      if (!starSystem || starSystem.arena || starSystem.danger < 1) continue;
      if (session.huntT && currentTime - session.huntT < 6 * 60000) continue;
      const rivalDefinition = RIVALS.find(
        (rivalDefinition2) =>
          (rivalDefinition2.kind === 'hunter' || rivalDefinition2.kind === 'pirate') &&
          this.relOf(playerData, rivalDefinition2.id) <= -60 &&
          !worldData.rivals[rivalDefinition2.id].down,
      );
      if (rivalDefinition && Math.random() < 0.25) {
        session.huntT = currentTime;
        this.spawnHunters(session, rivalDefinition);
      }
    }
    if (hasAnyMatch) this.db.touch();
  },
  /**
   * Spawn bounty hunter escort ships targeting a player with a severe nemesis grudge.
   * @param {Session} session - Player session.
   * @param {Record<string, string | number>} rivalDefinition - Rival configuration object.
   * @returns {void}
   */
  spawnHunters(this: RivalsCapabilities, session: Session, rivalDefinition: RivalDefinition) {
    const space = this.spaces[session.data.sys],
      entity = session.ent!,
      angle = Math.random() * 6.283,
      hulls = [711, 708, 716].filter((height) => this.A.ships[height]);
    const lead = space.makeShip({
      hull: pick(hulls),
      faction: 'hollow',
      x: entity.x + Math.cos(angle) * 1500,
      y: entity.y + Math.sin(angle) * 1500,
      ai: 'raid',
      name: `${rivalDefinition.name.split(' ')[0]}'s hired gun`,
    });
    lead.huntOf = session.id;
    lead.life = 300;
    lead.target = entity;
    const entity2 = space.makeShip({
      hull: pick(hulls),
      faction: 'hollow',
      x: lead.x + 80,
      y: lead.y + 60,
      ai: 'escort',
      owner: lead.id,
    });
    entity2.huntOf = session.id;
    space.events.push(['flash', Math.round(lead.x), Math.round(lead.y)]);
    this.toast(
      session,
      `Hired guns are closing in: ${rivalDefinition.name} put a price on your head.`,
    );
  },
  // keep live systems in step with where the rivals are
  /**
   * Synchronize rival ships within an active space sector.
   * @param {Space} space - Space sector instance.
   * @returns {void}
   */
  rivalSync(this: RivalsCapabilities, space: Space) {
    if (space.sys.arena) return;
    for (const rivalDefinition of RIVALS) {
      const rivalState2 = this.rivalState(rivalDefinition.id)!,
        entity2 = this.rivalEnts.get(rivalDefinition.id);
      const here = rivalState2 && !rivalState2.down && rivalState2.sys === space.id;
      if (entity2 && entity2.sys === space.id) {
        const entity = space.ships.get(entity2.id);
        if (!entity) {
          this.rivalEnts.delete(rivalDefinition.id);
          continue;
        }
        if (!here) {
          space.remove(entity, 'jump');
          this.rivalEnts.delete(rivalDefinition.id);
        } // jumped out
        continue;
      }
      if (!here || entity2 || (rivalState2.dockT && Date.now() < rivalState2.dockT)) continue;
      const starSystem = space.sys,
        docked =
          rivalState2.dockT &&
          starSystem.stellars.find((stellarBody) => stellarBody!.id === rivalState2.dockAt),
        fromPlanet = docked || (starSystem.stellars.length && Math.random() < 0.5),
        rawStellarBody = docked || (fromPlanet ? pick(starSystem.stellars) : null),
        angle = Math.random() * 6.283;
      rivalState2.dockT = 0;
      const positionX = rawStellarBody ? rawStellarBody.x + 30 : Math.cos(angle) * 2400,
        positionY = rawStellarBody ? rawStellarBody.y + 30 : Math.sin(angle) * 2400;
      const entity = space.makeShip({
        hull: rivalState2.hull,
        faction: rivalDefinition.fac,
        x: positionX,
        y: positionY,
        a: angle + Math.PI,
        ai: KINDS[rivalDefinition.kind].ai,
        name: `${rivalDefinition.name} · ${rivalDefinition.ship}`,
        bonus: { shieldPct: 25, armorPct: 25, damagePct: 15 },
      });
      entity.rival = rivalDefinition.id;
      entity.rivalAi = KINDS[rivalDefinition.kind].ai;
      entity.life = 1e9;
      entity.noLeave = true;
      space.events.push(['flash', Math.round(positionX), Math.round(positionY)]);
      this.rivalEnts.set(rivalDefinition.id, { sys: space.id, id: entity.id });
    }
  },
  // think hook: rivals pick fights with their rivals and stand by their allies
  /**
   * AI decision loop for rival ships in space (attack nemeses, assist allies).
   * @param {Entity} entity - Rival ship entity.
   * @param {Space} space - Space sector instance.
   * @returns {void}
   */
  rivalThink(this: RivalsCapabilities, entity: Entity, space: Space) {
    let best = null,
      body = 2600;
    for (const entity2 of space.ships.values()) {
      if (!entity2.player || entity2.state !== 'fly' || !entity2.player.s || !entity2.player.s.data)
        continue;
      const relOf2 = this.relOf(entity2.player.s.data, entity.rival!),
        distance = Math.hypot(entity2.x - entity.x, entity2.y - entity.y);
      if (relOf2 <= -30 && distance < body) {
        best = entity2;
        body = distance;
      }
      if (relOf2 >= 60 && !entity.target) {
        // an ally joins your fights
        const entity4 = [...space.root(entity2).aggro]
          .map((identifier) => space.ships.get(identifier))
          .find((entity3) => entity3 && !entity3.dead && entity3 !== entity);
        if (entity4 && Math.hypot(entity4.x - entity.x, entity4.y - entity.y) < 2600) {
          entity.target = entity4;
          entity.aggro.add(entity4.id);
        }
      }
    }
    if (best && !entity.target) entity.target = best;
  },
  // hostility hook (undefined = normal faction rules)
  /**
   * Determine hostility override between an NPC and a player based on rival status and relations.
   * @param {Entity} entity - NPC entity.
   * @param {StellarBody} stellarBody - Player entity.
   * @returns {boolean | undefined} True/false if override applies, undefined to defer to faction rules.
   */
  rivalHostile(this: RivalsCapabilities, entity: Entity, stellarBody: PlayerReference | null) {
    if (entity.huntOf) return entity.huntOf === stellarBody!.id;
    if (entity.bribed && entity.bribed.has(stellarBody!.id)) return false;
    if (entity.rival && stellarBody!.s && stellarBody!.s.data) {
      const relOf2 = this.relOf(stellarBody!.s.data, entity.rival);
      if (relOf2 <= -30) return true;
      if (relOf2 >= 25) return false;
    }
    return undefined;
  },
  /**
   * Handle weapon impact on a rival ship, reducing player relationship score.
   * @param {Session} session - Player session that fired.
   * @param {Entity} entity - Targeted entity that was hit.
   * @param {Space} space - Space sector instance.
   * @returns {void}
   */
  rivalOnHit(this: RivalsCapabilities, session: Session, entity: Entity, space: Space) {
    if (!entity.rival) return;
    if (!entity.relHitT || space.t - entity.relHitT > 3) {
      entity.relHitT = space.t;
      this.rivalRel(session, entity.rival, -4, 'you fired on them');
      if (!entity.warned) {
        entity.warned = true;
        this.toast(session, `${RIVAL[entity.rival].name}: "Hey! Watch your fire!"`);
      }
    }
  },
  /**
   * Handle ship destruction involving rivals, penalizing killer or rewarding helpful bystanders.
   * @param {Session} session - Player session scoring the kill.
   * @param {Entity} entity - Destroyed NPC entity.
   * @param {Space} space - Space sector instance.
   * @returns {boolean} True if the destroyed NPC was a rival.
   */
  rivalOnKill(this: RivalsCapabilities, session: Session, entity: Entity, space: Space) {
    if (entity.rival) {
      const rivalDefinition = RIVAL[entity.rival],
        rivalState2 = this.rivalState(entity.rival)!;
      rivalState2.down = Date.now() + 10 * 60000;
      rivalState2.credits = Math.round(rivalState2.credits * 0.7);
      this.rivalEnts.delete(entity.rival);
      this.rivalRel(session, entity.rival, -45, 'you destroyed their ship');
      this.news(newsTemplates.lost(rivalDefinition.name, session.data.name));
      return true;
    }
    // helping a rival in a fight earns their thanks
    for (const entity2 of space.ships.values())
      if (
        entity2.rival &&
        (entity.target === entity2 || entity2.aggro.has(entity.id) || entity.aggro.has(entity2.id))
      ) {
        if (!entity2.thankT || space.t - entity2.thankT > 20) {
          entity2.thankT = space.t;
          this.rivalRel(session, entity2.rival!, 12, 'you helped them in a fight');
          this.toast(session, `${RIVAL[entity2.rival].name}: "Thanks for the assist!"`);
        }
      }
    return false;
  },
  // a rival trader who lands stays docked a while, then takes off again from that world
  /**
   * Handle rival ship landing at a planetary spaceport.
   * @param {Entity} entity - Landing ship entity.
   * @returns {void}
   */
  rivalDocked(this: RivalsCapabilities, entity: Entity) {
    const rivalState2 = this.rivalState(entity.rival!);
    if (!rivalState2) return;
    rivalState2.dockT = Date.now() + (30 + Math.random() * 60) * 1000;
    rivalState2.dockAt = entity.dest && entity.dest.id;
    this.rivalEnts.delete(entity.rival!);
  },
  /**
   * Generate leaderboard entries for rival captains in a given category.
   * @param {string} category - Metric category ('earned' or 'kills').
   * @returns {Array<{name: string, ai: boolean, v: number}>} Leaderboard ranking entries.
   */
  rivalBoard(this: RivalsCapabilities, category: string) {
    const value =
      category === 'earned'
        ? (rivalState: RivalState) => rivalState.earned
        : category === 'kills'
          ? (rivalState: RivalState) => rivalState.kills
          : null;
    if (!value) return [];
    return RIVALS.map((rivalDefinition) => ({
      name: rivalDefinition.name,
      ai: true,
      v: Math.round(value(this.rivalState(rivalDefinition.id)!) || 0),
    }));
  },
  /**
   * Compile the client payload listing all rival captains, locations, and relationship states.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<Record<string, string | number>>} Rivals summary list for client.
   */
  rivalsPayload(this: RivalsCapabilities, playerData: PlayerData) {
    return RIVALS.map((rivalDefinition) => {
      const rivalState2 = this.rivalState(rivalDefinition.id)!,
        relOf2 = this.relOf(playerData, rivalDefinition.id);
      return {
        id: rivalDefinition.id,
        name: rivalDefinition.name,
        kind: KINDS[rivalDefinition.kind].label,
        fac: rivalDefinition.fac,
        ship: this.A.ships[rivalState2.hull] ? this.A.ships[rivalState2.hull].name : '',
        sys: rivalState2.down ? null : rivalState2.sys,
        rel: relOf2,
        mood: MOOD(relOf2),
      };
    });
  },
};
