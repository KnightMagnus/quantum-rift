// 1.1 "Living Rift": rival captains (careers, presence in live systems, relations, hunters and allies), spaceport news
// and market price spikes. Rival state lives in world.rivals; relations are kept per player.
import { SYS, SYSTEMS, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.js';
import {
  RIVALS,
  RIVAL,
  KINDS,
  rivalHull,
  MOOD,
  MOOD_LABEL,
  NEWS_TEMPLATES as N,
} from '../shared/rivals.js';
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
 * Select a random item from an array.
 * @template T
 * @param {T[]} a - Array of items.
 * @returns {T} Selected item.
 */
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// where each career likes to fly
/**
 * Check whether a system is appropriate for a rival's career archetype.
 * @param {{fac: string, kind: string}} r - Rival configuration.
 * @param {import('./game.js').SpaceSystem} S - System definition object.
 * @returns {boolean} True if system is valid for the rival.
 */
function okSystem(r, S) {
  if (!S || S.arena || S.faction === 'deep' || FACTIONS[S.faction].hidden) return false;
  if (r.fac === 'farside') return !!S.farside;
  if (S.farside) return false;
  if (r.kind === 'pirate')
    return S.danger >= 2 || S.faction === 'hollow' || S.faction === 'frontier';
  return S.danger <= 3 && S.faction !== 'hollow' && S.faction !== 'umbral';
}

export const RivalsOperations = {
  /**
   * Initialize rival captains state and ambient spaceport news in world database.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  rivalsInit() {
    const W = this.db.world;
    W.rivals = W.rivals || {};
    W.news = W.news || [];
    W.flash = W.flash || [];
    for (const R of RIVALS) {
      if (W.rivals[R.id]) continue;
      const home = SYSTEMS.filter(
        (S) =>
          okSystem(R, S) &&
          (S.faction === R.fac ||
            (R.fac === 'hollow' && S.danger >= 2) ||
            (R.fac === 'farside' && S.farside)),
      );
      const wealth = Math.round(
        40000 * R.luck * (1 + Math.pow(Math.random(), 2) * 70) * (R.special ? 4 : 1),
      ); // most start modest, a few are rich veterans
      W.rivals[R.id] = {
        id: R.id,
        sys: (home.length ? pick(home) : pick(SYSTEMS.filter((S) => okSystem(R, S)))).id,
        credits: wealth,
        earned: Math.round(wealth * (0.5 + Math.random())),
        kills:
          R.kind === 'hunter' || R.kind === 'pirate'
            ? Math.floor(Math.random() * 40)
            : Math.floor(Math.random() * 5),
        hull: rivalHull(this.A, R.fac, wealth, R.kind),
        down: 0,
        rel: {},
      };
    }
    for (const R of RIVALS) {
      const r = W.rivals[R.id],
        want = rivalHull(this.A, R.fac, r.credits, R.kind);
      if (
        r.hull !== want &&
        this.A.ships[r.hull] &&
        (this.A.ships[r.hull].role === 'survey') !== (this.A.ships[want].role === 'survey')
      )
        r.hull = want;
    } // saves from before careers chose hulls
    if (!W.news.length)
      for (const R of RIVALS.slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 4)) {
        const r = W.rivals[R.id];
        this.news(N.upgrade(R.name, this.A.ships[r.hull].name, SYS[r.sys].name));
      } // a fresh Rift starts with a few headlines
    this.rivalEnts = new Map(); // rival id -> { sys, id } while they are present in a live system
  },
  /**
   * Look up persistent state for a rival captain.
   * @this {Record<string, unknown>}
   * @param {string} id - Rival identifier.
   * @returns {Record<string, unknown> | undefined} Persistent rival record.
   */
  rivalState(id) {
    return this.db.world.rivals[id];
  },
  /**
   * Look up full name of a rival captain.
   * @this {Record<string, unknown>}
   * @param {string} id - Rival identifier.
   * @returns {string} Rival name.
   */
  rivalName(id) {
    return RIVAL[id] ? RIVAL[id].name : '';
  },
  /**
   * Look up relationship score between a player and a rival captain.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {string} id - Rival identifier.
   * @returns {number} Relationship score (-100 to 100).
   */
  relOf(d, id) {
    const r = this.rivalState(id);
    return r ? r.rel[this.db.key(d.name)] || 0 : 0;
  },
  /**
   * Modify relationship score with a rival, logging changes and broadcasting news on threshold shifts.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {string} id - Rival identifier.
   * @param {number} delta - Delta to apply.
   * @param {string} [why] - Reason description.
   * @returns {void}
   */
  rivalRel(s, id, delta, why) {
    const d = s.data,
      r = this.rivalState(id);
    if (!r) return;
    const k = this.db.key(d.name),
      before = MOOD(r.rel[k] || 0);
    r.rel[k] = clamp((r.rel[k] || 0) + delta, -100, 100);
    const after = MOOD(r.rel[k]);
    if (before !== after) {
      const R = RIVAL[id];
      this.toast(
        s,
        `${R.name} is now your ${MOOD_LABEL[after].toLowerCase()}${why ? ` (${why})` : ''}.`,
      );
      this.log(d, `${R.name} is now your ${MOOD_LABEL[after].toLowerCase()}.`);
      if (after === 'nemesis' && (R.kind === 'hunter' || R.kind === 'pirate'))
        this.news(N.grudge(R.name, d.name));
      if (after === 'ally') this.news(N.allied(R.name, d.name));
    }
    this.db.touch();
  },
  /**
   * Add a headline to the persistent galaxy news feed.
   * @this {Record<string, unknown>}
   * @param {string} text - Headline text.
   * @returns {void}
   */
  news(text) {
    const W = this.db.world;
    W.news.push({ t: Date.now(), text });
    if (W.news.length > 60) W.news.splice(0, W.news.length - 60);
  },
  /**
   * Retrieve recent headlines from the world news feed.
   * @this {Record<string, unknown>}
   * @param {number} [n=6] - Number of items to retrieve.
   * @returns {string[]} Array of recent news strings.
   */
  newsFeed(n = 6) {
    return this.db.world.news
      .slice(-n)
      .reverse()
      .map((x) => x.text);
  },
  /**
   * Get active flash market price multiplier for a commodity at a stellar port.
   * @this {Record<string, unknown>}
   * @param {string} stellar - Stellar port ID.
   * @param {string} cid - Commodity ID.
   * @returns {number} Price multiplier.
   */
  flashMult(stellar, cid) {
    const f = (this.db.world.flash || []).find(
      (x) => x.stellar === stellar && x.cid === cid && x.until > Date.now(),
    );
    return f ? f.mult : 1;
  },

  // every 20 s: careers move on, ships get upgraded, news is made, grudges turn into hunters
  /**
   * Advance rival captains simulation tick: upgrade ships, trigger news, move between systems, spawn hunters.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  rivalsTick() {
    const W = this.db.world,
      now = Date.now();
    let any = false;
    for (const R of RIVALS) {
      const r = W.rivals[R.id],
        K = KINDS[R.kind];
      if (!r) continue;
      if (r.down) {
        if (now < r.down) continue;
        r.down = 0;
        const home = SYSTEMS.filter((S) => okSystem(R, S));
        r.sys = pick(home).id;
        any = true;
      }
      const gain = Math.round((K.earn * R.luck * (0.3 + Math.random() * 0.9)) / 12);
      r.credits += gain;
      r.earned += gain; // ~100k an hour, like a busy player
      if ((R.kind === 'hunter' || R.kind === 'pirate') && Math.random() < 0.15) r.kills++;
      const better = rivalHull(this.A, R.fac, r.credits, R.kind);
      if (
        better !== r.hull &&
        (this.A.ships[better].cost || 0) >
          (this.A.ships[r.hull] ? this.A.ships[r.hull].cost || 0 : 0)
      ) {
        r.credits -= Math.round((this.A.ships[better].cost || 0) * 0.5);
        r.hull = better;
        this.news(N.upgrade(R.name, this.A.ships[better].name, SYS[r.sys].name));
        any = true;
      }
      if (Math.random() < 0.025) {
        const place = SYS[r.sys].name;
        this.news(
          R.kind === 'trader'
            ? N.haul(R.name, place, credits(Math.round(gain * (4 + Math.random() * 8))))
            : R.kind === 'hunter'
              ? N.bounty(
                  R.name,
                  `Hollow captain ${pick(['Vask', 'Grail', 'Thorne', 'Kettle', 'Wren'])}`,
                )
              : R.kind === 'miner'
                ? N.strike(R.name, place)
                : R.kind === 'explorer'
                  ? N.chart(R.name, place)
                  : N.raid(R.name, place),
        );
      }
      const ent = this.rivalEnts.get(R.id),
        busy =
          ent &&
          this.live[ent.sys] &&
          (() => {
            const e = this.live[ent.sys].ships.get(ent.id);
            return e && (e.aggro.size || e.target || e.owner);
          })();
      if (!busy && Math.random() < 0.22) {
        const opts = SYS[r.sys].links.filter((l) => okSystem(R, SYS[l]));
        if (opts.length) {
          r.sys = pick(opts);
          any = true;
        }
      }
    }
    // market flashes: a shortage or a glut somewhere, for twenty minutes
    W.flash = W.flash.filter((f) => f.until > now);
    if (W.flash.length < 4 && Math.random() < 0.12) {
      const ps = Object.values(STELLARS).filter(
          (p) => p.svc && p.svc.includes('T') && !p.site && !SYS[p.system].farside,
        ),
        p = pick(ps),
        c = pick(
          COMMODITIES.filter((x) =>
            ['food', 'medical', 'luxury', 'metal', 'equipment'].includes(x.id),
          ),
        );
      const up = Math.random() < 0.55;
      W.flash.push({ stellar: p.id, cid: c.id, mult: up ? 1.45 : 0.6, until: now + 20 * 60000 });
      this.news(
        up
          ? `Shortage of ${c.name.toLowerCase()} on ${p.name} (${SYS[p.system].name}): prices soar.`
          : `A glut of ${c.name.toLowerCase()} on ${p.name} (${SYS[p.system].name}): prices crash.`,
      );
    }
    // grudges: a nemesis hunter or pirate sends hired guns after you
    for (const s of this.sessions.values()) {
      const d = s.data;
      if (!d || !s.ent || s.ent.state !== 'fly') continue;
      const S = SYS[d.sys];
      if (!S || S.arena || S.danger < 1) continue;
      if (s.huntT && now - s.huntT < 6 * 60000) continue;
      const foe = RIVALS.find(
        (R) =>
          (R.kind === 'hunter' || R.kind === 'pirate') &&
          this.relOf(d, R.id) <= -60 &&
          !W.rivals[R.id].down,
      );
      if (foe && Math.random() < 0.25) {
        s.huntT = now;
        this.spawnHunters(s, foe);
      }
    }
    if (any) this.db.touch();
  },
  /**
   * Spawn bounty hunter escort ships targeting a player with a severe nemesis grudge.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {Record<string, unknown>} R - Rival configuration object.
   * @returns {void}
   */
  spawnHunters(s, R) {
    const sp = this.spaces[s.data.sys],
      me = s.ent,
      ang = Math.random() * 6.283,
      hulls = [711, 708, 716].filter((h) => this.A.ships[h]);
    const lead = sp.makeShip({
      hull: pick(hulls),
      faction: 'hollow',
      x: me.x + Math.cos(ang) * 1500,
      y: me.y + Math.sin(ang) * 1500,
      ai: 'raid',
      name: `${R.name.split(' ')[0]}'s hired gun`,
    });
    lead.huntOf = s.id;
    lead.life = 300;
    lead.target = me;
    const w = sp.makeShip({
      hull: pick(hulls),
      faction: 'hollow',
      x: lead.x + 80,
      y: lead.y + 60,
      ai: 'escort',
      owner: lead.id,
    });
    w.huntOf = s.id;
    sp.events.push(['flash', Math.round(lead.x), Math.round(lead.y)]);
    this.toast(s, `Hired guns are closing in: ${R.name} put a price on your head.`);
  },
  // keep live systems in step with where the rivals are
  /**
   * Synchronize rival ships within an active space sector.
   * @this {Record<string, unknown>}
   * @param {import('./space.js').Space} sp - Space sector instance.
   * @returns {void}
   */
  rivalSync(sp) {
    if (sp.sys.arena) return;
    for (const R of RIVALS) {
      const r = this.rivalState(R.id),
        ent = this.rivalEnts.get(R.id);
      const here = r && !r.down && r.sys === sp.id;
      if (ent && ent.sys === sp.id) {
        const e = sp.ships.get(ent.id);
        if (!e) {
          this.rivalEnts.delete(R.id);
          continue;
        }
        if (!here) {
          sp.remove(e, 'jump');
          this.rivalEnts.delete(R.id);
        } // jumped out
        continue;
      }
      if (!here || ent || (r.dockT && Date.now() < r.dockT)) continue;
      const S = sp.sys,
        docked = r.dockT && S.stellars.find((p) => p.id === r.dockAt),
        fromPlanet = docked || (S.stellars.length && Math.random() < 0.5),
        pl = docked || (fromPlanet ? pick(S.stellars) : null),
        ang = Math.random() * 6.283;
      r.dockT = 0;
      const x = pl ? pl.x + 30 : Math.cos(ang) * 2400,
        y = pl ? pl.y + 30 : Math.sin(ang) * 2400;
      const e = sp.makeShip({
        hull: r.hull,
        faction: R.fac,
        x,
        y,
        a: ang + Math.PI,
        ai: KINDS[R.kind].ai,
        name: `${R.name} · ${R.ship}`,
        bonus: { shieldPct: 25, armorPct: 25, damagePct: 15 },
      });
      e.rival = R.id;
      e.rivalAi = KINDS[R.kind].ai;
      e.life = 1e9;
      e.noLeave = true;
      sp.events.push(['flash', Math.round(x), Math.round(y)]);
      this.rivalEnts.set(R.id, { sys: sp.id, id: e.id });
    }
  },
  // think hook: rivals pick fights with their rivals and stand by their allies
  /**
   * AI decision loop for rival ships in space (attack nemeses, assist allies).
   * @this {Record<string, unknown>}
   * @param {import('./space.js').Entity} e - Rival ship entity.
   * @param {import('./space.js').Space} sp - Space sector instance.
   * @returns {void}
   */
  rivalThink(e, sp) {
    let best = null,
      bd = 2600;
    for (const o of sp.ships.values()) {
      if (!o.player || o.state !== 'fly' || !o.player.s || !o.player.s.data) continue;
      const rel = this.relOf(o.player.s.data, e.rival),
        d = Math.hypot(o.x - e.x, o.y - e.y);
      if (rel <= -30 && d < bd) {
        best = o;
        bd = d;
      }
      if (rel >= 60 && !e.target) {
        // an ally joins your fights
        const foe = [...sp.root(o).aggro]
          .map((id) => sp.ships.get(id))
          .find((x) => x && !x.dead && x !== e);
        if (foe && Math.hypot(foe.x - e.x, foe.y - e.y) < 2600) {
          e.target = foe;
          e.aggro.add(foe.id);
        }
      }
    }
    if (best && !e.target) e.target = best;
  },
  // hostility hook (undefined = normal faction rules)
  /**
   * Determine hostility override between an NPC and a player based on rival status and relations.
   * @this {Record<string, unknown>}
   * @param {import('./space.js').Entity} npc - NPC entity.
   * @param {import('./game.js').StellarBody} p - Player entity.
   * @returns {boolean | undefined} True/false if override applies, undefined to defer to faction rules.
   */
  rivalHostile(npc, p) {
    if (npc.huntOf) return npc.huntOf === p.id;
    if (npc.bribed && npc.bribed.has(p.id)) return false;
    if (npc.rival && p.s && p.s.data) {
      const rel = this.relOf(p.s.data, npc.rival);
      if (rel <= -30) return true;
      if (rel >= 25) return false;
    }
    return undefined;
  },
  /**
   * Handle weapon impact on a rival ship, reducing player relationship score.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session that fired.
   * @param {import('./space.js').Entity} npc - Targeted entity that was hit.
   * @param {import('./space.js').Space} space - Space sector instance.
   * @returns {void}
   */
  rivalOnHit(s, npc, space) {
    if (!npc.rival) return;
    if (!npc.relHitT || space.t - npc.relHitT > 3) {
      npc.relHitT = space.t;
      this.rivalRel(s, npc.rival, -4, 'you fired on them');
      if (!npc.warned) {
        npc.warned = true;
        this.toast(s, `${RIVAL[npc.rival].name}: "Hey! Watch your fire!"`);
      }
    }
  },
  /**
   * Handle ship destruction involving rivals, penalizing killer or rewarding helpful bystanders.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session scoring the kill.
   * @param {import('./space.js').Entity} npc - Destroyed NPC entity.
   * @param {import('./space.js').Space} space - Space sector instance.
   * @returns {boolean} True if the destroyed NPC was a rival.
   */
  rivalOnKill(s, npc, space) {
    if (npc.rival) {
      const R = RIVAL[npc.rival],
        r = this.rivalState(npc.rival);
      r.down = Date.now() + 10 * 60000;
      r.credits = Math.round(r.credits * 0.7);
      this.rivalEnts.delete(npc.rival);
      this.rivalRel(s, npc.rival, -45, 'you destroyed their ship');
      this.news(N.lost(R.name, s.data.name));
      return true;
    }
    // helping a rival in a fight earns their thanks
    for (const o of space.ships.values())
      if (o.rival && (npc.target === o || o.aggro.has(npc.id) || npc.aggro.has(o.id))) {
        if (!o.thankT || space.t - o.thankT > 20) {
          o.thankT = space.t;
          this.rivalRel(s, o.rival, 12, 'you helped them in a fight');
          this.toast(s, `${RIVAL[o.rival].name}: "Thanks for the assist!"`);
        }
      }
    return false;
  },
  // a rival trader who lands stays docked a while, then takes off again from that world
  /**
   * Handle rival ship landing at a planetary spaceport.
   * @this {Record<string, unknown>}
   * @param {import('./space.js').Entity} e - Landing ship entity.
   * @returns {void}
   */
  rivalDocked(e) {
    const r = this.rivalState(e.rival);
    if (!r) return;
    r.dockT = Date.now() + (30 + Math.random() * 60) * 1000;
    r.dockAt = e.dest && e.dest.id;
    this.rivalEnts.delete(e.rival);
  },
  /**
   * Generate leaderboard entries for rival captains in a given category.
   * @this {Record<string, unknown>}
   * @param {string} cat - Metric category ('earned' or 'kills').
   * @returns {Array<{name: string, ai: boolean, v: number}>} Leaderboard ranking entries.
   */
  rivalBoard(cat) {
    const v = cat === 'earned' ? (r) => r.earned : cat === 'kills' ? (r) => r.kills : null;
    if (!v) return [];
    return RIVALS.map((R) => ({
      name: R.name,
      ai: true,
      v: Math.round(v(this.rivalState(R.id)) || 0),
    }));
  },
  /**
   * Compile the client payload listing all rival captains, locations, and relationship states.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Array<Record<string, unknown>>} Rivals summary list for client.
   */
  rivalsPayload(d) {
    return RIVALS.map((R) => {
      const r = this.rivalState(R.id),
        rel = this.relOf(d, R.id);
      return {
        id: R.id,
        name: R.name,
        kind: KINDS[R.kind].label,
        fac: R.fac,
        ship: this.A.ships[r.hull] ? this.A.ships[r.hull].name : '',
        sys: r.down ? null : r.sys,
        rel,
        mood: MOOD(rel),
      };
    });
  },
};
