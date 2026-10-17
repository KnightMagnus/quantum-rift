import { clampStanding } from '../shared/reputation.js';
// Quantum Rift 1.0: the Que'vari storyline as golden main-story missions (offered in landing pop-ups), and the Deep gate.
import { SYS, STELLARS, FACTIONS, MATERIALS, GRADES } from '../shared/galaxy.js';
import { STORY, STORY_SHIP, DEEP_UNLOCK } from '../shared/story.js';
import { makeLoadout, credits } from '../shared/rules.js';

export const StoryOperations = {
  /**
   * Initialize or retrieve player story progress state.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, string | number | boolean>} Story progress state object.
   */
  storyInit(d) {
    d.story = d.story || { step: 0, active: null, done: [] };
    d.story.done = d.story.done || [];
    return d.story;
  },
  /**
   * Check whether a specific storyline mission has been completed.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {string} id - Story mission identifier.
   * @returns {boolean} True if mission is completed.
   */
  storyDone(d, id) {
    const S = this.storyInit(d);
    return S.pass || S.done.includes(id);
  },
  /**
   * Construct story progress overview payload for client synchronization.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, string | number | boolean>} Story overview payload.
   */
  storyPayload(d) {
    const S = this.storyInit(d),
      cur = STORY[S.step];
    return {
      step: S.step,
      total: STORY.length,
      done: S.done,
      active: S.active
        ? {
            ...S.active,
            title: STORY.find((x) => x.id === S.active.id).title,
            brief: STORY.find((x) => x.id === S.active.id).brief,
          }
        : null,
      next: cur && !S.active ? { title: cur.title, at: STELLARS[cur.at].name } : null,
      pass: !!S.pass,
    };
  },
  // the story step on offer at this landing (if any)
  /**
   * Evaluate the story mission step on offer at a stellar landing.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {{id: string} | null} p - Landed stellar body.
   * @returns {import("../shared/story.js").StoryStep | null} Available story step or null.
   */
  storyOffer(d, p) {
    const S = this.storyInit(d),
      st = STORY[S.step];
    if (!st || S.active || !p || st.at !== p.id) return null;
    if (st.minRep && (d.rep.quevari || 0) < st.minRep)
      return {
        ...st,
        locked: `The elders will ask more of you when your standing with the Que'vari reaches ${st.minRep} (it is ${d.rep.quevari || 0}).`,
      };
    return st;
  },
  /**
   * Check active story mission completion or send landing mission offer.
   * @param {import('./game.js').Session} s - Player session.
   * @param {{id: string}} p - Landed stellar body.
   * @returns {void}
   */
  storyOnLand(s, p) {
    const d = s.data,
      S = this.storyInit(d),
      a = S.active;
    if (a) {
      const st = STORY.find((x) => x.id === a.id);
      if ((st.type === 'carry' && p.id === st.dest) || (a.ready && p.id === st.back))
        this.storyComplete(s, st);
    }
    const off = this.storyOffer(d, p);
    if (off && !off.locked)
      this.send(s, {
        t: 'story',
        id: off.id,
        title: off.title,
        text: off.text,
        acc: off.acc,
        ref: off.ref,
      });
  },
  /**
   * Accept an offered story mission.
   * @param {import('./game.js').Session} s - Player session.
   * @param {{id: string}} m - Accept message.
   * @returns {void}
   */
  storyAccept(s, m) {
    const d = s.data,
      S = this.storyInit(d),
      p = STELLARS[d.stellar],
      st = this.storyOffer(d, p);
    if (!st || st.locked || st.id !== m.id) return;
    if (st.type === 'gift') return this.storyGift(s, st);
    S.active = { id: st.id, got: 0, spawned: false, ready: st.type === 'carry' ? false : false };
    this.log(d, `Story: ${st.title}. ${st.brief}`);
    this.toast(s, `Story mission accepted: ${st.brief}`);
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  /**
   * Conclude a story mission, distributing credits, standing, and rewards.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import("../shared/story.js").StoryStep} st - Story step definition.
   * @returns {void}
   */
  storyComplete(s, st) {
    const d = s.data,
      S = this.storyInit(d);
    S.active = null;
    S.done.push(st.id);
    S.step++;
    d.credits += st.pay;
    d.stats.earned += st.pay;
    d.rep.quevari = clampStanding((d.rep.quevari || 0) + st.rep);
    const got = [st.pay ? `${credits(st.pay)} credits` : '', `+${st.rep} Que'vari standing`];
    if (st.crate) {
      d.mats[st.crate[0]][st.crate[1]]++;
      got.push(`${st.crate[0]} ${GRADES[st.crate[1]]}`);
    }
    this.log(d, `Story complete: ${st.title}.`);
    this.send(s, {
      t: 'story',
      id: st.id,
      title: st.title,
      text: st.done + `\n\nRewards: ${got.filter(Boolean).join(', ')}.`,
      done: true,
    });
    this.db.touch();
    this.you(s);
  },
  /**
   * Award the unique Que'vari flagship reward as part of the storyline culmination.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import("../shared/story.js").StoryStep} st - Story step definition.
   * @returns {void}
   */
  storyGift(s, st) {
    const d = s.data,
      S = this.storyInit(d),
      old = d.ship,
      H = this.A.ships[old.hull];
    if (d.shipless) {
    } else if (d.dock.length < this.dockSlots(d)) d.dock.push({ ship: old, bridge: d.bridge });
    else {
      const v = this.tradeIn(d);
      d.credits += v;
    }
    d.ship = makeLoadout(this.A, STORY_SHIP, "Ina Que'var");
    d.shipless = false;
    d.fuel = undefined;
    if (this.leadChanged) this.leadChanged(d);
    S.done.push(st.id);
    S.step++;
    d.rep.quevari = clampStanding((d.rep.quevari || 0) + st.rep);
    this.log(d, "Took the helm of the Ina Que'var.");
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `Over Ina Lumen, a great white sail-ship wakes for ${d.name}.`,
    });
    this.send(s, { t: 'story', id: st.id, title: st.title, text: st.done, done: true });
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  // arriving in a story system spawns what the step needs
  /**
   * Spawn story encounter ships, derelicts, boss vessels, or choir allies upon arriving in target system.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import('./space.js').Space} sp - Current space system instance.
   * @returns {void}
   */
  storyArrive(s, sp) {
    const d = s.data,
      S = this.storyInit(d),
      a = S.active;
    if (!a || a.ready) return;
    const st = STORY.find((x) => x.id === a.id);
    if (st.sys !== d.sys || [...sp.ships.values()].some((e) => e.story === s.id)) return;
    const e = s.ent,
      left = (st.count || 1) - a.got;
    if (st.type === 'board')
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          w = sp.makeShip({
            hull: st.hull,
            faction: st.faction,
            x: Math.cos(ang) * (800 + i * 300),
            y: Math.sin(ang) * (800 + i * 300),
            name: 'Becalmed Sloop',
          });
        w.disabled = true;
        w.armor = w.st.armor * 0.1;
        w.story = s.id;
        w.storyBoard = true;
        w.life = 1e9;
        w.wreckT = 1e9;
        w.rescueOf = { id: 'story', owner: s.id };
      }
    if (st.type === 'kill')
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          h = sp.makeShip({
            hull: st.hull,
            faction: st.faction,
            x: Math.cos(ang) * 1400,
            y: Math.sin(ang) * 1400,
            ai: 'raid',
            name: 'Umbral Hunter',
          });
        h.story = s.id;
        h.storyKill = true;
        h.life = 1e9;
        h.target = e;
      }
    if (st.type === 'boss') {
      const b = sp.makeShip({
        hull: st.hull,
        faction: st.faction,
        x: 0,
        y: 0,
        ai: 'guard',
        name: 'The Night Anchor',
        bonus: { shieldPct: 120, armorPct: 120 },
      });
      b.home = { x: 0, y: 0 };
      b.story = s.id;
      b.storyKill = true;
      b.life = 1e9;
      b.noDisable = true;
      for (let i = 0; i < 2; i++) {
        const g = sp.makeShip({
          hull: 762,
          faction: 'umbral',
          x: i ? 200 : -200,
          y: 150,
          ai: 'escort',
          owner: b.id,
        });
        g.life = 1e9;
      }
      st.allies.forEach((h, i) => {
        const al = sp.makeShip({
          hull: h,
          faction: 'quevari',
          x: e.x + (i - 1.5) * 90,
          y: e.y + 120,
          ai: 'escort',
          owner: e.id,
          name: "Que'vari Choir-of-War",
        });
        al.life = 1e9;
        al.storyAlly = true;
      });
      this.toast(
        s,
        "The Que'vari choirs-of-war drop in beside you. The Night Anchor waits at the heart of Umbra.",
      );
    }
    if (st.type === 'board')
      this.toast(
        s,
        `${left} becalmed sloop${left > 1 ? 's' : ''} drift in this system. Board each one and choose Rescue.`,
      );
    if (st.type === 'kill')
      this.toast(s, `${left} Umbral hunter${left > 1 ? 's' : ''} are closing in.`);
  },
  /**
   * Advance active story mission progress after a relevant kill or rescue.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import('./space.js').Entity} e - Defeated or rescued entity associated with the story mission.
   * @returns {void}
   */
  storyProgress(s, e) {
    const d = s.data,
      S = this.storyInit(d),
      a = S.active;
    if (!a || e.story !== s.id) return;
    const st = STORY.find((x) => x.id === a.id);
    a.got++;
    this.toast(s, st.progress + (st.count && a.got < st.count ? ` (${a.got}/${st.count})` : ''));
    if (a.got >= (st.count || 1)) {
      a.ready = true;
      this.toast(s, `Return to ${STELLARS[st.back].name}.`);
    }
    this.db.touch();
    this.you(s);
  },
  /**
   * Check whether a destination system is in deep space and locked behind story progression.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {string} to - Destination system ID.
   * @returns {boolean} True if jump to Deep system is locked.
   */
  deepLocked(d, to) {
    return SYS[to] && SYS[to].faction === 'deep' && !this.storyDone(d, DEEP_UNLOCK);
  },
};
