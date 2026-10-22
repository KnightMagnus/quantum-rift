export interface StoryPayload {
  step: number;
  total: number;
  done: string[];
  active: (NonNullable<SavedStory['active']> & { title: string; brief: string }) | null;
  next: { title: string; at: string } | null;
  pass: boolean;
}
import type { SavedStory } from './save-contracts.ts';
export interface StoryOperations {
  storyInit(this: StoryCapabilities, playerData: PlayerData): SavedStory;
  storyDone(this: StoryCapabilities, playerData: PlayerData, identifier: string): boolean;
  storyPayload(this: StoryCapabilities, playerData: PlayerData): StoryPayload;
  storyOffer(
    this: StoryCapabilities,
    playerData: PlayerData,
    position: { id: string } | null,
  ): StoryStep | null;
  storyOnLand(this: StoryCapabilities, session: Session, position: { id: string }): void;
  storyAccept(this: StoryCapabilities, session: Session, message: { id: string }): void;
  storyComplete(this: StoryCapabilities, session: Session, storyStep: StoryStep): void;
  storyGift(this: StoryCapabilities, session: Session, storyStep: StoryStep): void;
  storyArrive(this: StoryCapabilities, session: Session, space: Space): void;
  storyProgress(this: StoryCapabilities, session: Session, entity: Entity): void;
  deepLocked(this: StoryCapabilities, playerData: PlayerData, destination: string): boolean;
}
import type { StoryCapabilities } from './features.ts';
type StoryStep = import('../shared/story.ts').StoryStep & { locked?: string };
import type { PlayerData, Session } from './game.ts';
import type { Entity, Space } from './space.ts';

import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: the Que'vari storyline as golden main-story missions (offered in landing pop-ups), and the Deep gate.
import { SYS as systemsById, STELLARS, GRADES } from '../shared/galaxy.ts';
import { STORY, STORY_SHIP, DEEP_UNLOCK } from '../shared/story.ts';
import { makeLoadout, credits } from '../shared/rules.ts';

export const StoryOperations = {
  /**
   * Initialize or retrieve player story progress state.
   * @param playerData - Saved player data.
   * @returns Story progress state object.
   */
  storyInit(this: StoryCapabilities, playerData: PlayerData) {
    playerData.story = playerData.story || { step: 0, active: null, done: [] };
    playerData.story.done = playerData.story.done || [];
    return playerData.story;
  },
  /**
   * Check whether a specific storyline mission has been completed.
   * @param playerData - Saved player data.
   * @param identifier - Story mission identifier.
   * @returns True if mission is completed.
   */
  storyDone(this: StoryCapabilities, playerData: PlayerData, identifier: string) {
    const savedStory = this.storyInit(playerData);
    return savedStory.pass || savedStory.done.includes(identifier);
  },
  /**
   * Construct story progress overview payload for client synchronization.
   * @param playerData - Saved player data.
   * @returns Story overview payload.
   */
  storyPayload(this: StoryCapabilities, playerData: PlayerData) {
    const savedStory = this.storyInit(playerData),
      storyMission = STORY[savedStory.step];
    return {
      step: savedStory.step,
      total: STORY.length,
      done: savedStory.done,
      active: savedStory.active
        ? {
            ...savedStory.active,
            title: STORY.find((storyMission) => storyMission.id === savedStory.active!.id)!.title,
            brief: STORY.find((storyMission) => storyMission.id === savedStory.active!.id)!.brief,
          }
        : null,
      next:
        storyMission && !savedStory.active
          ? { title: storyMission.title, at: STELLARS[storyMission.at].name }
          : null,
      pass: !!savedStory.pass,
    };
  },
  // the story step on offer at this landing (if any)
  /**
   * Evaluate the story mission step on offer at a stellar landing.
   * @param playerData - Saved player data.
   * @param position - Landed stellar body.
   * @returns Available story step or null.
   */
  storyOffer(this: StoryCapabilities, playerData: PlayerData, position: { id: string } | null) {
    const savedStory = this.storyInit(playerData),
      storyMission = STORY[savedStory.step];
    if (!storyMission || savedStory.active || !position || storyMission.at !== position.id)
      return null;
    if (storyMission.minRep && (playerData.rep.quevari || 0) < storyMission.minRep)
      return {
        ...storyMission,
        locked: `The elders will ask more of you when your standing with the Que'vari reaches ${storyMission.minRep} (it is ${playerData.rep.quevari || 0}).`,
      };
    return storyMission;
  },
  /**
   * Check active story mission completion or send landing mission offer.
   * @param session - Player session.
   * @param position - Landed stellar body.
   */
  storyOnLand(this: StoryCapabilities, session: Session, position: { id: string }) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      active2 = savedStory.active;
    if (active2) {
      const storyMission = STORY.find((storyMission) => storyMission.id === active2.id)!;
      if (
        (storyMission.type === 'carry' && position.id === storyMission.dest) ||
        (active2.ready && position.id === storyMission.back)
      )
        this.storyComplete(session, storyMission);
    }
    const storyStep = this.storyOffer(playerData, position);
    if (storyStep && !storyStep.locked)
      this.send(session, {
        t: 'story',
        id: storyStep.id,
        title: storyStep.title,
        text: storyStep.text,
        acc: storyStep.acc,
        ref: storyStep.ref,
      });
  },
  /**
   * Accept an offered story mission.
   * @param session - Player session.
   * @param message - Accept message.
   */
  storyAccept(this: StoryCapabilities, session: Session, message: { id: string }) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      stellarBody = STELLARS[playerData.stellar!],
      storyStep = this.storyOffer(playerData, stellarBody);
    if (!storyStep || storyStep.locked || storyStep.id !== message.id) return;
    if (storyStep.type === 'gift') return this.storyGift(session, storyStep);
    savedStory.active = {
      id: storyStep.id,
      got: 0,
      spawned: false,
      ready: storyStep.type === 'carry' ? false : false,
    };
    this.log(playerData, `Story: ${storyStep.title}. ${storyStep.brief}`);
    this.toast(session, `Story mission accepted: ${storyStep.brief}`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Conclude a story mission, distributing credits, standing, and rewards.
   * @param session - Player session.
   * @param storyStep - Story step definition.
   */
  storyComplete(this: StoryCapabilities, session: Session, storyStep: StoryStep) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData);
    savedStory.active = null;
    savedStory.done.push(storyStep.id);
    savedStory.step++;
    playerData.credits += storyStep.pay;
    playerData.stats.earned += storyStep.pay;
    playerData.rep.quevari = clampStanding((playerData.rep.quevari || 0) + storyStep.rep);
    const received = [
      storyStep.pay ? `${credits(storyStep.pay)} credits` : '',
      `+${storyStep.rep} Que'vari standing`,
    ];
    if (storyStep.crate) {
      playerData.mats[storyStep.crate[0]][storyStep.crate[1]]++;
      received.push(`${storyStep.crate[0]} ${GRADES[storyStep.crate[1]]}`);
    }
    this.log(playerData, `Story complete: ${storyStep.title}.`);
    this.send(session, {
      t: 'story',
      id: storyStep.id,
      title: storyStep.title,
      text: storyStep.done + `\n\nRewards: ${received.filter(Boolean).join(', ')}.`,
      done: true,
    });
    this.db.touch();
    this.you(session);
  },
  /**
   * Award the unique Que'vari flagship reward as part of the storyline culmination.
   * @param session - Player session.
   * @param storyStep - Story step definition.
   */
  storyGift(this: StoryCapabilities, session: Session, storyStep: StoryStep) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      shipLoadout = playerData.ship,
      _shipHullAsset = this.A.ships[shipLoadout.hull];
    if (playerData.shipless) {
    } else if (playerData.dock.length < this.dockSlots(playerData))
      playerData.dock.push({ ship: shipLoadout, bridge: playerData.bridge });
    else {
      const tradeIn2 = this.tradeIn(playerData);
      playerData.credits += tradeIn2;
    }
    playerData.ship = makeLoadout(this.A, STORY_SHIP, "Ina Que'var");
    playerData.shipless = false;
    playerData.fuel = undefined;
    if (this.leadChanged) this.leadChanged(playerData);
    savedStory.done.push(storyStep.id);
    savedStory.step++;
    playerData.rep.quevari = clampStanding((playerData.rep.quevari || 0) + storyStep.rep);
    this.log(playerData, "Took the helm of the Ina Que'var.");
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `Over Ina Lumen, a great white sail-ship wakes for ${playerData.name}.`,
    });
    this.send(session, {
      t: 'story',
      id: storyStep.id,
      title: storyStep.title,
      text: storyStep.done,
      done: true,
    });
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // arriving in a story system spawns what the step needs
  /**
   * Spawn story encounter ships, derelicts, boss vessels, or choir allies upon arriving in target system.
   * @param session - Player session.
   * @param space - Current space system instance.
   */
  storyArrive(this: StoryCapabilities, session: Session, space: Space) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      active2 = savedStory.active;
    if (!active2 || active2.ready) return;
    const storyMission = STORY.find((storyMission) => storyMission.id === active2.id)!;
    if (
      storyMission.sys !== playerData.sys ||
      [...space.ships.values()].some((entity) => entity.story === session.id)
    )
      return;
    const entity = session.ent,
      left = (storyMission.count || 1) - active2.got;
    if (storyMission.type === 'board')
      for (let index = 0; index < left; index++) {
        const angle = Math.random() * 6.283,
          entity = space.makeShip({
            hull: storyMission.hull,
            faction: storyMission.faction,
            x: Math.cos(angle) * (800 + index * 300),
            y: Math.sin(angle) * (800 + index * 300),
            name: 'Becalmed Sloop',
          });
        entity.disabled = true;
        entity.armor = entity.st.armor * 0.1;
        entity.story = session.id;
        entity.storyBoard = true;
        entity.life = 1e9;
        entity.wreckT = 1e9;
        entity.rescueOf = { id: 'story', owner: session.id };
      }
    if (storyMission.type === 'kill')
      for (let index = 0; index < left; index++) {
        const angle = Math.random() * 6.283,
          entity3 = space.makeShip({
            hull: storyMission.hull,
            faction: storyMission.faction,
            x: Math.cos(angle) * 1400,
            y: Math.sin(angle) * 1400,
            ai: 'raid',
            name: 'Umbral Hunter',
          });
        entity3.story = session.id;
        entity3.storyKill = true;
        entity3.life = 1e9;
        entity3.target = entity;
      }
    if (storyMission.type === 'boss') {
      const rightEntity = space.makeShip({
        hull: storyMission.hull,
        faction: storyMission.faction,
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
      for (let index = 0; index < 2; index++) {
        const entity = space.makeShip({
          hull: 762,
          faction: 'umbral',
          x: index ? 200 : -200,
          y: 150,
          ai: 'escort',
          owner: rightEntity.id,
        });
        entity.life = 1e9;
      }
      storyMission.allies!.forEach((height, index) => {
        const entity5 = space.makeShip({
          hull: height,
          faction: 'quevari',
          x: entity!.x + (index - 1.5) * 90,
          y: entity!.y + 120,
          ai: 'escort',
          owner: entity!.id,
          name: "Que'vari Choir-of-War",
        });
        entity5.life = 1e9;
        entity5.storyAlly = true;
      });
      this.toast(
        session,
        "The Que'vari choirs-of-war drop in beside you. The Night Anchor waits at the heart of Umbra.",
      );
    }
    if (storyMission.type === 'board')
      this.toast(
        session,
        `${left} becalmed sloop${left > 1 ? 's' : ''} drift in this system. Board each one and choose Rescue.`,
      );
    if (storyMission.type === 'kill')
      this.toast(session, `${left} Umbral hunter${left > 1 ? 's' : ''} are closing in.`);
  },
  /**
   * Advance active story mission progress after a relevant kill or rescue.
   * @param session - Player session.
   * @param entity - Defeated or rescued entity associated with the story mission.
   */
  storyProgress(this: StoryCapabilities, session: Session, entity: Entity) {
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      active2 = savedStory.active;
    if (!active2 || entity.story !== session.id) return;
    const storyMission = STORY.find((storyMission) => storyMission.id === active2.id)!;
    active2.got++;
    this.toast(
      session,
      storyMission.progress +
        (storyMission.count && active2.got < storyMission.count
          ? ` (${active2.got}/${storyMission.count})`
          : ''),
    );
    if (active2.got >= (storyMission.count || 1)) {
      active2.ready = true;
      this.toast(session, `Return to ${STELLARS[storyMission.back!].name}.`);
    }
    this.db.touch();
    this.you(session);
  },
  /**
   * Check whether a destination system is in deep space and locked behind story progression.
   * @param playerData - Saved player data.
   * @param destination - Destination system ID.
   * @returns True if jump to Deep system is locked.
   */
  deepLocked(this: StoryCapabilities, playerData: PlayerData, destination: string) {
    return (
      systemsById[destination] &&
      systemsById[destination].faction === 'deep' &&
      !this.storyDone(playerData, DEEP_UNLOCK)
    );
  },
};
