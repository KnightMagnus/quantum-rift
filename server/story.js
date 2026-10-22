import { clampStanding } from '../shared/reputation.js';
// Quantum Rift: the Que'vari storyline as golden main-story missions (offered in landing pop-ups), and the Deep gate.
import { SYS, STELLARS, GRADES } from '../shared/galaxy.js';
import { STORY, STORY_SHIP, DEEP_UNLOCK } from '../shared/story.js';
import { makeLoadout, credits } from '../shared/rules.js';

/** @import { StoryStep } from '../shared/story.js' */
/** @import { PlayerData, Session } from './game.js' */
/** @import { Entity, Space } from './space.js' */

export const StoryOperations = {
  /**
   * Initialize or retrieve player story progress state.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string | number | boolean>} Story progress state object.
   */
  storyInit(playerData) {
    playerData.story = playerData.story || { step: 0, active: null, done: [] };
    playerData.story.done = playerData.story.done || [];
    return playerData.story;
  },
  /**
   * Check whether a specific storyline mission has been completed.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} id - Story mission identifier.
   * @returns {boolean} True if mission is completed.
   */
  storyDone(playerData, id) {
    const S = this.storyInit(playerData);
    return S.pass || S.done.includes(id);
  },
  /**
   * Construct story progress overview payload for client synchronization.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string | number | boolean>} Story overview payload.
   */
  storyPayload(playerData) {
    const S = this.storyInit(playerData),
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
   * @param {PlayerData} playerData - Saved player data.
   * @param {{id: string} | null} p - Landed stellar body.
   * @returns {StoryStep | null} Available story step or null.
   */
  storyOffer(playerData, p) {
    const S = this.storyInit(playerData),
      st = STORY[S.step];
    if (!st || S.active || !p || st.at !== p.id) return null;
    if (st.minRep && (playerData.rep.quevari || 0) < st.minRep)
      return {
        ...st,
        locked: `The elders will ask more of you when your standing with the Que'vari reaches ${st.minRep} (it is ${playerData.rep.quevari || 0}).`,
      };
    return st;
  },
  /**
   * Check active story mission completion or send landing mission offer.
   * @param {Session} session - Player session.
   * @param {{id: string}} p - Landed stellar body.
   * @returns {void}
   */
  storyOnLand(session, p) {
    const playerData = session.data,
      S = this.storyInit(playerData),
      a = S.active;
    if (a) {
      const st = STORY.find((x) => x.id === a.id);
      if ((st.type === 'carry' && p.id === st.dest) || (a.ready && p.id === st.back))
        this.storyComplete(session, st);
    }
    const off = this.storyOffer(playerData, p);
    if (off && !off.locked)
      this.send(session, {
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
   * @param {Session} session - Player session.
   * @param {{id: string}} m - Accept message.
   * @returns {void}
   */
  storyAccept(session, m) {
    const playerData = session.data,
      S = this.storyInit(playerData),
      p = STELLARS[playerData.stellar],
      st = this.storyOffer(playerData, p);
    if (!st || st.locked || st.id !== m.id) return;
    if (st.type === 'gift') return this.storyGift(session, st);
    S.active = { id: st.id, got: 0, spawned: false, ready: st.type === 'carry' ? false : false };
    this.log(playerData, `Story: ${st.title}. ${st.brief}`);
    this.toast(session, `Story mission accepted: ${st.brief}`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Conclude a story mission, distributing credits, standing, and rewards.
   * @param {Session} session - Player session.
   * @param {StoryStep} st - Story step definition.
   * @returns {void}
   */
  storyComplete(session, st) {
    const playerData = session.data,
      S = this.storyInit(playerData);
    S.active = null;
    S.done.push(st.id);
    S.step++;
    playerData.credits += st.pay;
    playerData.stats.earned += st.pay;
    playerData.rep.quevari = clampStanding((playerData.rep.quevari || 0) + st.rep);
    const got = [st.pay ? `${credits(st.pay)} credits` : '', `+${st.rep} Que'vari standing`];
    if (st.crate) {
      playerData.mats[st.crate[0]][st.crate[1]]++;
      got.push(`${st.crate[0]} ${GRADES[st.crate[1]]}`);
    }
    this.log(playerData, `Story complete: ${st.title}.`);
    this.send(session, {
      t: 'story',
      id: st.id,
      title: st.title,
      text: st.done + `\n\nRewards: ${got.filter(Boolean).join(', ')}.`,
      done: true,
    });
    this.db.touch();
    this.you(session);
  },
  /**
   * Award the unique Que'vari flagship reward as part of the storyline culmination.
   * @param {Session} session - Player session.
   * @param {StoryStep} st - Story step definition.
   * @returns {void}
   */
  storyGift(session, st) {
    const playerData = session.data,
      S = this.storyInit(playerData),
      old = playerData.ship,
      _H = this.A.ships[old.hull];
    if (playerData.shipless) {
    } else if (playerData.dock.length < this.dockSlots(playerData))
      playerData.dock.push({ ship: old, bridge: playerData.bridge });
    else {
      const v = this.tradeIn(playerData);
      playerData.credits += v;
    }
    playerData.ship = makeLoadout(this.A, STORY_SHIP, "Ina Que'var");
    playerData.shipless = false;
    playerData.fuel = undefined;
    if (this.leadChanged) this.leadChanged(playerData);
    S.done.push(st.id);
    S.step++;
    playerData.rep.quevari = clampStanding((playerData.rep.quevari || 0) + st.rep);
    this.log(playerData, "Took the helm of the Ina Que'var.");
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `Over Ina Lumen, a great white sail-ship wakes for ${playerData.name}.`,
    });
    this.send(session, { t: 'story', id: st.id, title: st.title, text: st.done, done: true });
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // arriving in a story system spawns what the step needs
  /**
   * Spawn story encounter ships, derelicts, boss vessels, or choir allies upon arriving in target system.
   * @param {Session} session - Player session.
   * @param {Space} space - Current space system instance.
   * @returns {void}
   */
  storyArrive(session, space) {
    const playerData = session.data,
      S = this.storyInit(playerData),
      a = S.active;
    if (!a || a.ready) return;
    const st = STORY.find((x) => x.id === a.id);
    if (st.sys !== playerData.sys || [...space.ships.values()].some((e) => e.story === session.id))
      return;
    const entity = session.ent,
      left = (st.count || 1) - a.got;
    if (st.type === 'board')
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          w = space.makeShip({
            hull: st.hull,
            faction: st.faction,
            x: Math.cos(ang) * (800 + i * 300),
            y: Math.sin(ang) * (800 + i * 300),
            name: 'Becalmed Sloop',
          });
        w.disabled = true;
        w.armor = w.st.armor * 0.1;
        w.story = session.id;
        w.storyBoard = true;
        w.life = 1e9;
        w.wreckT = 1e9;
        w.rescueOf = { id: 'story', owner: session.id };
      }
    if (st.type === 'kill')
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          h = space.makeShip({
            hull: st.hull,
            faction: st.faction,
            x: Math.cos(ang) * 1400,
            y: Math.sin(ang) * 1400,
            ai: 'raid',
            name: 'Umbral Hunter',
          });
        h.story = session.id;
        h.storyKill = true;
        h.life = 1e9;
        h.target = entity;
      }
    if (st.type === 'boss') {
      const rightEntity = space.makeShip({
        hull: st.hull,
        faction: st.faction,
        x: 0,
        y: 0,
        ai: 'guard',
        name: 'The Night Anchor',
        bonus: { shieldPct: 120, armorPct: 120 },
      });
      rightEntity.home = { x: 0, y: 0 };
      rightEntity.story = session.id;
      rightEntity.storyKill = true;
      rightEntity.life = 1e9;
      rightEntity.noDisable = true;
      for (let i = 0; i < 2; i++) {
        const g = space.makeShip({
          hull: 762,
          faction: 'umbral',
          x: i ? 200 : -200,
          y: 150,
          ai: 'escort',
          owner: rightEntity.id,
        });
        g.life = 1e9;
      }
      st.allies.forEach((h, i) => {
        const al = space.makeShip({
          hull: h,
          faction: 'quevari',
          x: entity.x + (i - 1.5) * 90,
          y: entity.y + 120,
          ai: 'escort',
          owner: entity.id,
          name: "Que'vari Choir-of-War",
        });
        al.life = 1e9;
        al.storyAlly = true;
      });
      this.toast(
        session,
        "The Que'vari choirs-of-war drop in beside you. The Night Anchor waits at the heart of Umbra.",
      );
    }
    if (st.type === 'board')
      this.toast(
        session,
        `${left} becalmed sloop${left > 1 ? 's' : ''} drift in this system. Board each one and choose Rescue.`,
      );
    if (st.type === 'kill')
      this.toast(session, `${left} Umbral hunter${left > 1 ? 's' : ''} are closing in.`);
  },
  /**
   * Advance active story mission progress after a relevant kill or rescue.
   * @param {Session} session - Player session.
   * @param {Entity} entity - Defeated or rescued entity associated with the story mission.
   * @returns {void}
   */
  storyProgress(session, entity) {
    const playerData = session.data,
      S = this.storyInit(playerData),
      a = S.active;
    if (!a || entity.story !== session.id) return;
    const st = STORY.find((x) => x.id === a.id);
    a.got++;
    this.toast(
      session,
      st.progress + (st.count && a.got < st.count ? ` (${a.got}/${st.count})` : ''),
    );
    if (a.got >= (st.count || 1)) {
      a.ready = true;
      this.toast(session, `Return to ${STELLARS[st.back].name}.`);
    }
    this.db.touch();
    this.you(session);
  },
  /**
   * Check whether a destination system is in deep space and locked behind story progression.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} to - Destination system ID.
   * @returns {boolean} True if jump to Deep system is locked.
   */
  deepLocked(playerData, to) {
    return SYS[to] && SYS[to].faction === 'deep' && !this.storyDone(playerData, DEEP_UNLOCK);
  },
};
