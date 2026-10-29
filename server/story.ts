export interface StoryPayload {
  flags: StoryFlags;
  ending?: StoryFlags['main_ending'];
  step: number;
  total: number;
  done: string[];
  active: (NonNullable<SavedStory['active']> & { title: string; brief: string }) | null;
  next: { title: string; at: string } | null;
  pass: boolean;
}
import type { SavedStory, StoryFlags } from './save-contracts.ts';
import { endingText, mainEndings, storySystemVisible } from '../shared/story-world.ts';
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
  storyAccept(
    this: StoryCapabilities,
    session: Session,
    message: { id: string; choice?: string },
  ): void;
  storyComplete(this: StoryCapabilities, session: Session, storyStep: StoryStep): void;
  storyGift(this: StoryCapabilities, session: Session, storyStep: StoryStep): void;
  storyArrive(this: StoryCapabilities, session: Session, space: Space): void;
  storyProgress(this: StoryCapabilities, session: Session, entity: Entity): void;
  storyTick(this: StoryCapabilities, session: Session, space: Space, duration: number): void;
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
      flags: savedStory.flags || {},
      ending: savedStory.flags?.main_ending,
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
    const sideDecision = pendingSideDecision(playerData, position.id);
    if (sideDecision) this.send(session, sideDecision);
    if (active2) {
      const storyMission = STORY.find((storyMission) => storyMission.id === active2.id)!;
      if (
        (storyMission.type === 'carry' && position.id === storyMission.dest) ||
        (active2.ready && position.id === storyMission.back)
      ) {
        if (storyMission.decision && !savedStory.flags?.[storyMission.decision]) {
          active2.ready = true;
          this.send(session, {
            t: 'story',
            id: storyMission.id,
            title: storyMission.title,
            text: storyMission.done,
            choices: legalChoices(playerData, storyMission),
            acc: 'Choose',
            ref: 'Decide later',
          });
          this.db.touch();
          return;
        }
        this.storyComplete(session, storyMission);
      }
    }
    const storyStep = this.storyOffer(playerData, position);
    if (storyStep && !storyStep.locked)
      this.send(session, {
        t: 'story',
        id: storyStep.id,
        title: storyStep.title,
        text:
          storyStep.text +
          (storyStep.id === 'kept-below'
            ? `\n\nIn one new entry, the manifest goes to ${savedStory.flags?.d1 === 'concord' ? 'the Hollow' : 'the Concord'} instead. In the next, you ${savedStory.flags?.d2 === 'umbral' ? 'hand the Umbral prisoners to the Que’vari' : 'help the Umbral rebuild'}. Your own log records neither. The ledger knows both.`
            : '') +
          (savedStory.flags?.index_ending === 'silence'
            ? '\n\nAt the foundry, Concord engineers recover the Archive core from the silent network. They can supply its measurements and the same account, though no machine answers.'
            : ''),
        acc: storyStep.acc,
        ref: storyStep.ref,
        ...(storyStep.type === 'decision' ? { choices: legalChoices(playerData, storyStep) } : {}),
      });
  },
  /**
   * Accept an offered story mission.
   * @param session - Player session.
   * @param message - Accept message.
   */
  storyAccept(this: StoryCapabilities, session: Session, message: { id: string; choice?: string }) {
    if (session.ent) return;
    const playerData = session.data,
      savedStory = this.storyInit(playerData),
      stellarBody = STELLARS[playerData.stellar!],
      storyStep = this.storyOffer(playerData, stellarBody);
    if (message.id === 'harness-refit') {
      const prompt = pendingSideDecision(playerData, playerData.stellar || '');
      if (
        prompt?.id !== 'harness-refit' ||
        message.choice !== 'fit' ||
        this.stats(playerData)!.free < 5
      )
        return;
      playerData.ship.outfits[9021] = 1;
      this.db.touch();
      this.you(session);
      this.landed(session);
      this.toast(session, 'The keepers refit the unique Rift Harness.');
      return;
    }
    if (message.id === 'index-outcome' || message.id === 'morrow-outcome') {
      const prompt = pendingSideDecision(playerData, playerData.stellar || '');
      if (
        !prompt ||
        prompt.id !== message.id ||
        !prompt.choices.some((choice) => choice.value === message.choice)
      )
        return;
      const flags = (savedStory.flags ||= {});
      if (message.id === 'index-outcome') {
        flags.index_ending = message.choice as NonNullable<StoryFlags['index_ending']>;
        if (message.choice === 'silence') {
          playerData.credits += 150000;
          playerData.stats.earned += 150000;
        }
      } else flags.morrow_umbral = message.choice as NonNullable<StoryFlags['morrow_umbral']>;
      this.db.touch();
      this.you(session);
      this.send(session, {
        t: 'story',
        id: message.id,
        title: prompt.title,
        done: true,
        text:
          message.id === 'index-outcome'
            ? message.choice === 'silence'
              ? 'The Kernel network goes quiet. Its last log reads: makers not answering. The wrecked relay yields 150,000 credits in salvage. The machines will remember you, and only you.'
              : message.choice === 'concord_property'
                ? 'Concord engineers take custody of the codes. The survey machines keep working under new instructions.'
                : 'The Core receives all nine accounts. The Kernel records: survey complete. When the dark rises, the Index will stand with you.'
            : message.choice === 'reconcile'
              ? 'Morrow opens the envelope. The keepers will help rebuild the Night Anchor.'
              : 'Morrow leaves the envelope closed. Some debts will last another generation.',
      });
      return;
    }
    const current = STORY.find((step) => step.id === message.id);
    if (current?.decision && message.choice) {
      const active = savedStory.active;
      const canResolve =
        current.type === 'decision'
          ? storyStep?.id === current.id
          : active?.id === current.id &&
            active.ready &&
            playerData.stellar === (current.dest || current.back);
      if (
        !canResolve ||
        !legalChoices(playerData, current).some((choice) => choice.value === message.choice)
      )
        return;
      const flags = (savedStory.flags ||= {});
      Object.assign(flags, { [current.decision]: message.choice });
      this.questReconcile(session);
      if (current.decision === 'main_ending' && message.choice === 'unsettling') {
        // A second, landed choice records the people whose reality the captain joins.
        delete flags.main_ending;
        this.send(session, {
          t: 'story',
          id: 'unsettled-people',
          title: 'Whose Rift?',
          text: 'Choose the sky you will live under. Other peoples remain open to trade and travel.',
          choices: Object.entries(playerData.rep)
            .filter(
              ([faction, standing]) =>
                [
                  'quantum',
                  'spacer',
                  'vashari',
                  'korrund',
                  'ylith',
                  'sarn',
                  'thalassi',
                  'quevari',
                  'lamp',
                ].includes(faction) &&
                (standing > 0 || faction === 'quantum'),
            )
            .map(([value]) => ({
              value,
              label: value === 'quantum' ? 'Humanity — the Concord' : value,
            })),
        });
        return;
      }
      this.storyComplete(session, current);
      return;
    }
    if (
      message.id === 'unsettled-people' &&
      message.choice &&
      storyStep?.id === 'choice' &&
      playerData.stellar === 'qstation'
    ) {
      const people = [
        'quantum',
        'spacer',
        'vashari',
        'korrund',
        'ylith',
        'sarn',
        'thalassi',
        'quevari',
        'lamp',
      ];
      if (
        !people.includes(message.choice) ||
        (message.choice !== 'quantum' && !(playerData.rep[message.choice] > 0))
      )
        return;
      const flags = (savedStory.flags ||= {});
      flags.main_ending = 'unsettling';
      flags.unsettled_with = message.choice;
      playerData.rep[message.choice] = 300;
      flags.title = `Of the ${message.choice === 'quantum' ? 'Old Sky' : message.choice} Rift`;
      this.storyComplete(session, storyStep);
      return;
    }
    if (!storyStep || storyStep.locked || storyStep.id !== message.id) return;
    if (storyStep.type === 'decision') return;
    if (storyStep.id === 'breach') (savedStory.flags ||= {}).breach_started = true;
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
    if (savedStory.done.includes(storyStep.id)) return;
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
    if (
      storyStep.id === 'choice' &&
      ['table', 'captains_watch'].includes(savedStory.flags?.main_ending || '')
    )
      this.depart(session);
    this.send(session, {
      t: 'story',
      ...(storyStep.id === 'choice' &&
      ['table', 'captains_watch'].includes(savedStory.flags?.main_ending || '')
        ? { sequence: 'ark-departure' }
        : {}),
      id: storyStep.id,
      title: storyStep.title,
      text:
        (storyStep.id === 'choice' ? endingText(savedStory.flags || {}) : storyStep.done) +
        crewBeat(playerData, storyStep.id) +
        `\n\nRewards: ${received.filter(Boolean).join(', ')}.`,
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
  /** Staying in range lets a prepared captain hear the Dreamer without killing it. */
  storyTick(this: StoryCapabilities, session: Session, space: Space, duration: number) {
    const active = session.data.story?.active;
    if (
      active?.id !== 'dreamer' ||
      active.ready ||
      !session.ent ||
      !session.data.quests?.sides?.['nhal-eye']
    )
      return;
    const dreamer = [...space.ships.values()].find(
      (entity) => entity.story === session.id && entity.hull === 908 && !entity.dead,
    );
    if (
      !dreamer ||
      ![...space.ships.values()].some(
        (actor) => actor.story === session.id && actor.storySinger && !actor.dead,
      ) ||
      Math.hypot(dreamer.x - session.ent.x, dreamer.y - session.ent.y) > 1400
    )
      return;
    active.got += duration;
    if (active.got >= 30) {
      active.ready = true;
      this.toast(
        session,
        'The channel holds. Return to Quantum Station to witness the Dreamer or rebuild the seal. Destroying it remains possible.',
      );
      this.you(session);
    }
    this.db.touch();
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
    const flags = savedStory.flags || {};
    if (
      flags.breach_started &&
      !flags.main_ending &&
      flags.index_ending === 'survey_complete' &&
      session.ent
    ) {
      const existing = [...space.ships.values()].filter(
        (actor) => actor.story === session.id && actor.storyAlly && actor.faction === 'index',
      );
      for (let slot = existing.length; slot < 2; slot++) {
        const escort = space.makeShip({
          hull: 915,
          faction: 'index',
          ai: 'escort',
          owner: session.ent.id,
          x: session.ent.x + (slot ? 120 : -120),
          y: session.ent.y + 120,
          name: 'Index survey escort',
        });
        escort.story = session.id;
        escort.storyAlly = true;
        escort.noDisable = true;
        escort.life = 1e9;
      }
    }
    if (
      space.id === 'dimmer' &&
      flags.breach_started &&
      !flags.main_ending &&
      ![...space.ships.values()].some((actor) => actor.story === session.id && actor.storySight)
    ) {
      const relay = space.makeShip({
        hull: 799,
        faction: 'thalassi',
        ai: 'guard',
        x: 900,
        y: -600,
        name: 'Thalassi listening relay',
      });
      relay.story = session.id;
      relay.storyAlly = true;
      relay.home = { x: 900, y: -600 };
      relay.life = 1e9;
      for (let slot = 0; slot < 3; slot++) {
        const convoy = space.makeShip({
          hull: 704,
          faction: 'spacer',
          ai: 'guard',
          x: 1600 + slot * 150,
          y: -900,
          name: 'Convoy on the missing lane',
        });
        convoy.story = session.id;
        convoy.storyAlly = true;
        convoy.storySight = 'thalassi';
        convoy.home = { x: convoy.x, y: convoy.y };
        convoy.life = 1e9;
      }
    }
    if (playerData.quests?.active?.['s:nhal-stirs'] && space.id === 'dimmer') {
      this.nhal.storyCreature(space, 900, session.id, -900, -600, 8);
      this.nhal.storyCreature(space, 901, session.id, -1100, -800, 9);
      if (
        ![...space.ships.values()].some(
          (actor) => actor.story === session.id && actor.faction === 'umbral',
        )
      ) {
        const rival = space.makeShip({
          hull: 761,
          faction: 'umbral',
          ai: 'raid',
          x: -1000,
          y: -900,
          name: 'Umbral border hunter',
        });
        rival.story = session.id;
        rival.life = 1e9;
      }
    }
    if (playerData.quests?.active?.['s:keepers-dimming'] && space.id === 'shoalight')
      this.nhal.storyCreature(space, 901, session.id, 1200, -600, 10);
    if (playerData.quests?.active?.['s:nhal-eye'] && space.id === 'the-pale-eye') {
      this.nhal.storyCreature(space, 901, session.id, 800, -1600, 10);
      this.nhal.storyCreature(space, 901, session.id, -800, -1600, 11);
    }
    if (flags.nhal_ending === 'kill' && space.sys.faction === 'deep')
      this.nhal.storyCreature(space, 904, session.id, 1300, -900, 11);
    if (!active2 || active2.ready) return;
    const storyMission = STORY.find((storyMission) => storyMission.id === active2.id)!;
    if (
      storyMission.sys !== playerData.sys ||
      [...space.ships.values()].some(
        (entity) => entity.story === session.id && (entity.storyKill || entity.storyBoard),
      )
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
          entity3 =
            storyMission.faction === 'nhal'
              ? this.nhal.storyCreature(
                  space,
                  storyMission.hull!,
                  session.id,
                  Math.cos(angle) * 1400,
                  Math.sin(angle) * 1400,
                  index,
                )
              : space.makeShip({
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
      const rightEntity =
        storyMission.id === 'dreamer'
          ? this.nhal.storyDreamer(space, session.id, 0, 0)!
          : space.makeShip({
              hull: storyMission.hull,
              faction: storyMission.faction,
              x: 0,
              y: 0,
              ai: 'guard',
              name: storyMission.id === 'dreamer' ? 'The Dreamer' : 'The Night Anchor',
              bonus: { shieldPct: 120, armorPct: 120 },
            });
      rightEntity.home = { x: 0, y: 0 };
      rightEntity.story = session.id;
      rightEntity.storyKill = true;
      rightEntity.life = 1e9;
      rightEntity.noDisable = true;
      for (let index = 0; index < (storyMission.id === 'dreamer' ? 0 : 2); index++) {
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
      const singers = storyMission.id === 'dreamer' && !!playerData.quests?.sides?.['nhal-eye'];
      const alliedHulls = singers ? [799, 801] : storyMission.allies || [];
      alliedHulls.forEach((height, index) => {
        const entity5 = space.makeShip({
          hull: height,
          faction: singers ? 'thalassi' : 'quevari',
          x: entity!.x + (index - 1.5) * 90,
          y: entity!.y + 120,
          ai: singers ? 'story-singer' : 'escort',
          owner: entity!.id,
          name: singers ? 'Thalassi open-channel choir' : "Que'vari Choir-of-War",
        });
        entity5.life = 1e9;
        entity5.storyAlly = true;
        if (singers) {
          entity5.story = session.id;
          entity5.storySinger = true;
          entity5.home = { x: entity5.x, y: entity5.y };
        }
      });
      this.toast(
        session,
        storyMission.id === 'dreamer'
          ? `The Dreamer speaks in your own voice: I chose ${savedStory.flags?.d1 === 'concord' ? 'the Hollow' : 'the Concord'}. I stood with ${savedStory.flags?.d2 === 'umbral' ? 'the Que’vari' : 'the Umbral'}. You left me here.`
          : "The Que'vari choirs-of-war drop in beside you. The Night Anchor waits at the heart of Umbra.",
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
    if (storyMission.id === 'dreamer') (savedStory.flags ||= {}).dreamer_defeated = true;
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
    if (!storySystemVisible(playerData.story?.flags, destination)) return true;
    return (
      systemsById[destination] &&
      systemsById[destination].faction === 'deep' &&
      !this.storyDone(playerData, DEEP_UNLOCK)
    );
  },
};

/** Recompute all options from authoritative saved prerequisites, including on repeated packets. */
function legalChoices(
  playerData: PlayerData,
  mission: StoryStep,
): Array<{ value: string; label: string }> {
  const flags = playerData.story?.flags || {};
  return (mission.choices || []).filter((choice) => {
    if (mission.decision === 'main_ending') return mainEndings(flags).includes(choice.value);
    if (mission.decision === 'nhal_ending') {
      if (choice.value === 'kill') return !!flags.dreamer_defeated;
      if (flags.dreamer_defeated || !playerData.quests?.sides?.['nhal-eye']) return false;
      return choice.value !== 'seal' || flags.d2 === 'umbral';
    }
    return true;
  });
}

/** Side outcomes are reoffered on the correct landing until the choice is saved. */
function pendingSideDecision(player: PlayerData, stellar: string) {
  if (
    stellar === 'vigil-lamp' &&
    player.story.flags?.harness_built &&
    !(player.ship.outfits[9021] > 0) &&
    !player.dock.some((stored) => stored.ship.outfits[9021] > 0)
  )
    return {
      t: 'story',
      id: 'harness-refit',
      title: 'Refit the Rift Harness',
      text: 'The harness route is still in the keepers’ cradle. They can refit it after a lost hull, provided this ship has five free outfit space. A harness aboard a stored ship must stay with that ship.',
      choices: [{ value: 'fit', label: 'Refit the unique Harness' }],
    };
  if (
    stellar === 'glasswake-foundry' &&
    player.quests?.sides?.['index-records'] &&
    !player.story.flags?.index_ending
  )
    return {
      t: 'story',
      id: 'index-outcome',
      title: 'The Kernel’s Request',
      text: 'Nine accounts. Three instructions. The Kernel waits.',
      choices: [
        { value: 'survey_complete', label: 'Deliver the complete survey to the Core' },
        { value: 'concord_property', label: 'Give the Kernel codes to the Concord' },
        { value: 'silence', label: 'Break the Kernel network — take its salvage' },
      ],
    };
  if (
    stellar === 'vigil-lamp' &&
    player.quests?.sides?.['keepers-truce'] &&
    !player.story.flags?.morrow_umbral
  )
    return {
      t: 'story',
      id: 'morrow-outcome',
      title: 'Better Dark Than a Lie',
      text: 'Morrow asks whether the keepers should help their old enemies.',
      choices: [
        { value: 'reconcile', label: 'Reconcile — help rebuild the Night Anchor' },
        { value: 'feud', label: 'Keep the old feud' },
      ],
    };
  return null;
}

/** Recruited friends take part without changing their original arc rewards. */
function crewBeat(player: PlayerData, chapter: string): string {
  const has = (name: string) => player.officers?.some((officer) => officer.name === name);
  if (chapter === 'berth' && player.story.flags?.d1 === 'concord' && has('Ada Castell'))
    return '\n\nAda Castell takes the manifest. "I have seen those lower decks. I should have asked what the berth was for."';
  if (chapter === 'breach')
    return (
      (has('Thrix Wingsworn') ? '\n\nThrix says: "This is what happened to our mother."' : '') +
      (has('Seren Of-The-Veil')
        ? '\n\nSeren listens to the old Ylith message again. "Those words settled the outcome where you survived this. A prophecy that made itself true."'
        : '')
    );
  if (chapter === 'riftweavers' && has('Seren Of-The-Veil'))
    return '\n\nSeren looks at you. "It expected you. That is why you became the person it expected."';
  if (chapter === 'dreamer' && player.story.flags?.nhal_ending === 'witness')
    return has('Maren Deepcurrent')
      ? '\n\nMaren Deepcurrent holds the song from your bridge. You open every channel. For the first time, the Dreamer sees every unchosen life without having to swallow it. It stops growing.'
      : '\n\nThe Thalassi choir holds the song while you open every channel. The Dreamer sees every unchosen life. It stops growing.';
  if (chapter === 'dreamer' && player.story.flags?.nhal_ending === 'seal')
    return (
      '\n\nThe Umbral rebuild the Night Anchor.' +
      (player.story.flags?.morrow_umbral === 'reconcile'
        ? ' Morrow brings the keepers to help. Lamps and dark hulls work beside one another.'
        : ' The Lamplighters watch from their own beacons.') +
      ' The wall closes around the Deep again.'
    );
  return '';
}
