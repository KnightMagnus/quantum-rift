import { hailMachineHull } from '../shared/hail-machine.ts';
import { playerPortrait, npcPortrait } from '../shared/portraits.ts';
import type { Game, Session, Entity } from './game.ts';
import type { Space } from './space.ts';

interface Point {
  x: number;
  y: number;
}
interface HailOption {
  k: string;
  label: string;
}
interface HailDetails {
  dest?: NonNullable<Entity['dest']> & { id: string };
  intel?: Point;
}
interface HailEntry extends HailDetails {
  /** Captured sender identity survives archive and despawn. */
  portraitId?: string;
  /** Ship-only caller artwork survives archive and sender removal. */
  machineHull?: number;
  key: string;
  kind: 'player' | 'npc';
  source: number;
  sys: string;
  who: string;
  text: string;
  expires: number;
  reason?: string;
  read?: boolean;
  archived?: boolean;
  opened?: number;
  opts?: HailOption[];
}
interface HailState {
  space: Space | null;
  ent: Entity | null;
  queue: HailEntry[];
  history: HailEntry[];
  next: number;
  named: Map<string, number>;
  pairs: Map<number, number>;
  sent: number;
  escort: { source: number; sys: string; expires: number } | null;
}
interface HailRequest {
  op?: unknown;
  allow?: unknown;
  id?: unknown;
  text?: unknown;
  key?: unknown;
  k?: unknown;
}
type FlyingSession = Session & { ent: Entity };

import { clampStanding } from '../shared/reputation.ts';
import { SYS as systemsById, FACTIONS } from '../shared/galaxy.ts';
import { contextualHail } from './hail-dialogue.ts';

export const HAIL_LIMITS = Object.freeze({
  npc: 3,
  player: 8,
  expires: 180000,
  history: 8,
  sender: 5000,
  pair: 10000,
  named: 900000,
});
export function hailText(value: unknown) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  // oxlint-disable-next-line no-control-regex -- Reject or sanitize control characters in player text.
  return text && Array.from(text).length <= 100 && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(text)
    ? text
    : null;
}
const flying = (session: Session | undefined): session is FlyingSession =>
  !!(
    session?.data &&
    session.ent &&
    !session.ent.dead &&
    !session.ent.disabled &&
    session.ent.state === 'fly'
  );
const distance = (point: Point, point2: Point) =>
  Math.hypot(point.x - point2.x, point.y - point2.y);
const silent = (entity: Entity) => ['umbral', 'eclipse', 'swarm', 'nhal'].includes(entity.faction);

/** Ephemeral, server-owned calls. Persist only communication preferences and real accepted job rewards. */
export class HailService {
  declare serial: number;
  declare game: Game;
  declare now: () => number;
  declare random: () => number;
  declare states: Map<number, HailState>;
  declare encounters: Map<string, unknown>;

  constructor(game: Game, currentTime = () => Date.now(), random = Math.random) {
    this.game = game;
    this.now = currentTime;
    this.random = random;
    this.states = new Map();
    this.serial = 0;
    this.encounters = new Map();
  }
  state(session: Session): HailState {
    let hailState = this.states.get(session.id);
    if (!hailState) {
      hailState = {
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
      this.states.set(session.id, hailState);
    }
    // Hails never own system activation. The lazy spaces proxy would wake a
    // docked player's otherwise sleeping system on every communications tick.
    const space2 = flying(session) ? this.game.live[session.data.sys] || null : null;
    if (hailState.space !== space2 || hailState.ent !== session.ent) {
      this.cancelEscort(session, hailState);
      hailState.space = space2;
      hailState.ent = session.ent;
      hailState.queue = [];
      hailState.history = [];
      hailState.next = this.now() + 180000 + this.random() * 180000;
      session.hailLedger = null;
      this.push(session, hailState);
    }
    return hailState;
  }
  push(session: Session, hailState = this.states.get(session.id)) {
    if (!hailState || !session.data) return;
    this.game.send(session, {
      t: 'hailinbox',
      allow: session.data.playerHails !== false,
      entries: [...hailState.queue, ...hailState.history].map((hailEntry) => ({
        key: hailEntry.key,
        who: hailEntry.who,
        portraitId: hailEntry.portraitId,
        machineHull: hailEntry.machineHull,
        kind: hailEntry.kind,
        unread: !hailEntry.read,
        expires: hailEntry.expires,
        archived: !!hailEntry.archived,
      })),
    });
  }
  archive(hailState: HailState, hailEntry: HailEntry) {
    hailState.queue = hailState.queue.filter((hailEntry2) => hailEntry2 !== hailEntry);
    if (hailEntry.kind === 'player') return; // Player privacy/blocks retain their original removal semantics.
    hailEntry.archived = true;
    hailState.history = [
      hailEntry,
      ...hailState.history.filter((hailEntry2) => hailEntry2 !== hailEntry),
    ].slice(0, HAIL_LIMITS.history);
  }
  // Solo pause stops encounter time as well as the simulation. Opening a menu
  // must not consume a caller's remaining response window.
  resume(deltaTime: number) {
    const spaces = new Set<Space>();
    for (const hailState of this.states.values()) {
      hailState.next += deltaTime;
      for (const hailEntry of hailState.queue) {
        hailEntry.expires += deltaTime;
        if (hailEntry.opened) hailEntry.opened += deltaTime;
      }
      if (hailState.escort) hailState.escort.expires += deltaTime;
      if (hailState.space) spaces.add(hailState.space);
    }
    for (const space of spaces)
      for (const entity of space.ships.values()) {
        if (entity.hailOfferUntil) entity.hailOfferUntil += deltaTime;
        if (entity.hailEscort) entity.hailEscort.expires += deltaTime;
      }
  }
  source(session: Session, hailEntry: HailEntry): Entity | null {
    if (!flying(session) || session.data.sys !== hailEntry.sys) return null;
    const space = this.game.live[hailEntry.sys],
      entity = space?.ships.get(hailEntry.source);
    if (!entity || entity.dead) return null;
    if (hailEntry.kind === 'player') {
      const other = entity.player?.s;
      return other && other.ent === entity && this.canContact(other, session) ? entity : null;
    }
    return (!entity.player &&
      !entity.owner &&
      (hailEntry.reason === 'distress' || !entity.disabled) &&
      !silent(entity) &&
      !space.isHostile(entity, session.ent)) ||
      (entity && hailEntry.reason === 'security' && !entity.dead && !entity.disabled)
      ? entity
      : null;
  }
  canContact(from: Session | undefined, session: Session | undefined): session is FlyingSession {
    if (
      !from ||
      !session ||
      this.game.sessions.get(from?.id) !== from ||
      this.game.sessions.get(session?.id) !== session ||
      !flying(from) ||
      !flying(session) ||
      from === session ||
      from.data.sys !== session.data.sys ||
      session.data.playerHails === false
    )
      return false;
    const coop2 = this.game.features.coop;
    if (coop2.blocked(from.data, session.data.name) || coop2.blocked(session.data, from.data.name))
      return false;
    // Existing unsolicited-DM privacy remains authoritative for this new channel too.
    const friend = (session.data.friends || []).some(
      (count) => count.toLowerCase() === from.data.name.toLowerCase(),
    );
    const armadaState = coop2.armadaOf(session.data),
      armadaState2 = coop2.armadaOf(from.data);
    return !!(
      session.data.dmAll ||
      friend ||
      (armadaState && armadaState2 && armadaState.id === armadaState2.id)
    );
  }
  player(session: Session, target: Entity | undefined, text?: unknown) {
    const other = target?.player?.s;
    if (!this.canContact(session, other) || other.ent !== target)
      return this.game.toast(session, 'That captain is not accepting hails here.');
    if (text === undefined)
      return this.game.send(session, {
        t: 'hail',
        player: target!.id,
        id: target!.id,
        who: other.data.name,
        portraitId: playerPortrait(other.data.portraitId),
        sub: 'Same-system private hail',
        text: 'Send a short hail. No trade or transfers on this channel.',
        opts: [],
      });
    const value = hailText(text);
    if (!value) return this.game.toast(session, 'Hails must contain 1–100 characters.');
    const hailState = this.state(session),
      currentTime = this.now();
    if (
      currentTime - hailState.sent < HAIL_LIMITS.sender ||
      currentTime - (hailState.pairs.get(other.id) || 0) < HAIL_LIMITS.pair
    )
      return this.game.toast(session, 'Give that captain a moment before hailing again.');
    const inbox = this.state(other);
    let hailEntry = inbox.queue.find(
      (hailEntry) => hailEntry.kind === 'player' && hailEntry.source === session.ent!.id,
    );
    if (
      !hailEntry &&
      inbox.queue.filter((hailEntry) => hailEntry.kind === 'player').length >= HAIL_LIMITS.player
    )
      return this.game.toast(session, 'That captain’s hail inbox is full.');
    hailState.sent = currentTime;
    hailState.pairs.set(other.id, currentTime);
    if (!hailEntry) {
      hailEntry = {
        key: `h${++this.serial}`,
        kind: 'player',
        source: session.ent!.id,
        sys: session.data.sys,
        who: session.data.name,
        portraitId: playerPortrait(session.data.portraitId),
        text: value,
        expires: currentTime + HAIL_LIMITS.expires,
      };
      inbox.queue.push(hailEntry);
    }
    Object.assign(hailEntry, {
      who: session.data.name,
      portraitId: playerPortrait(session.data.portraitId),
      text: value,
      read: false,
      expires: currentTime + HAIL_LIMITS.expires,
    });
    this.push(other, inbox);
    this.game.send(session, {
      t: 'hail',
      player: target!.id,
      id: target!.id,
      who: other.data.name,
      portraitId: playerPortrait(other.data.portraitId),
      text: `Hail sent: ${value}`,
      opts: [],
    });
  }
  request(session: Session, hailRequest: HailRequest) {
    const hailState = this.state(session),
      currentTime = this.now();
    if (hailRequest.op === 'prefs') {
      session.data.playerHails = hailRequest.allow === true;
      this.game.db.touch();
      return this.push(session, hailState);
    }
    if (hailRequest.op === 'list') return this.push(session, hailState);
    if (hailRequest.op === 'send')
      return this.player(
        session,
        this.game.live[session.data.sys]?.ships.get(Number(hailRequest.id)),
        hailRequest.text,
      );
    const hailEntry = [...hailState.queue, ...hailState.history].find(
      (hailEntry) => hailEntry.key === hailRequest.key,
    );
    if (!hailEntry) return this.game.toast(session, 'That hail has ended.');
    if (hailRequest.op === 'dismiss') {
      hailState.queue = hailState.queue.filter((hailEntry2) => hailEntry2 !== hailEntry);
      hailState.history = hailState.history.filter((hailEntry2) => hailEntry2 !== hailEntry);
      return this.push(session, hailState);
    }
    const entity = this.source(session, hailEntry);
    if (hailEntry.archived || !entity || hailEntry.expires <= currentTime) {
      this.archive(hailState, hailEntry);
      if (hailEntry.kind === 'player') {
        this.push(session, hailState);
        return this.game.toast(session, 'That hail has ended.');
      }
      if (hailRequest.op === 'open') hailEntry.read = true;
      this.push(session, hailState);
      return this.game.send(session, {
        t: 'hail',
        who: hailEntry.who,
        portraitId: hailEntry.portraitId,
        machineHull: hailEntry.machineHull,
        text: `${hailEntry.text}\n\n[Archived transmission: this hail has expired or the sender is no longer available. No actions remain available.]`,
        opts: [],
      });
    }
    if (hailRequest.op === 'open') {
      hailEntry.read = true;
      hailEntry.opened = currentTime;
      hailEntry.expires = Math.max(hailEntry.expires, currentTime + 30000);
      this.push(session, hailState);
      return this.game.send(session, {
        t: 'hail',
        key: hailEntry.key,
        player: hailEntry.kind === 'player' ? entity.id : undefined,
        who: hailEntry.who,
        portraitId: hailEntry.portraitId,
        machineHull: hailEntry.machineHull,
        sub: hailEntry.kind === 'player' ? 'Private hail' : hailEntry.reason,
        text: hailEntry.text,
        opts: hailEntry.opts || [],
      });
    }
    if (
      hailRequest.op !== 'answer' ||
      !hailEntry.opened ||
      !(hailEntry.opts || []).some((hailOption) => hailOption.k === hailRequest.k)
    )
      return;
    if (hailEntry.kind !== 'npc') return;
    return this.resolve(session, hailState, hailEntry, entity, hailRequest.k as string);
  }
  enqueue(
    session: Session,
    entity: Entity,
    reason: string,
    text: string,
    hailOptions: HailOption[] = [],
    details: HailDetails = {},
  ) {
    const hailState = this.state(session),
      currentTime = this.now();
    if (
      hailState.queue.filter((hailEntry) => hailEntry.kind === 'npc').length >= HAIL_LIMITS.npc ||
      hailState.queue.some((hailEntry) => hailEntry.source === entity.id)
    )
      return false;
    if (entity.rival && currentTime - (hailState.named.get(entity.rival) || 0) < HAIL_LIMITS.named)
      return false;
    if (entity.rival) hailState.named.set(entity.rival, currentTime);
    hailState.queue.push({
      key: `h${++this.serial}`,
      kind: 'npc',
      portraitId:
        hailMachineHull(entity) === undefined ? npcPortrait(entity, session.data.sys) : undefined,
      machineHull: hailMachineHull(entity),
      source: entity.id,
      who: entity.name || `${this.game.A.ships[entity.hull].name} · transponder ${entity.id}`,
      sys: session.data.sys,
      reason,
      text,
      opts: hailOptions,
      expires: currentTime + HAIL_LIMITS.expires,
      ...details,
    });
    this.push(session, hailState);
    return true;
  }
  offer(session: Session, entity: Entity, reason: string) {
    const space = this.game.live[session.data.sys],
      currentTime = this.now();
    if (!space || !flying(session)) return false;
    if (
      entity.hailOfferUntil! > currentTime ||
      entity.hailResolved ||
      entity.owner ||
      entity.player ||
      entity.mission ||
      entity.convoyOf ||
      silent(entity)
    )
      return false;
    const hostile = space.isHostile(entity, session.ent);
    const hailOptions: HailOption[] = [],
      details: HailDetails = {};
    let text;
    if (reason === 'security') {
      if (
        entity.ai !== 'patrol' ||
        FACTIONS[entity.faction]?.pirate ||
        (session.data.rep[entity.faction] || 0) > -20
      )
        return false;
      text = `${entity.name || 'Local security'}: your standing with ${FACTIONS[entity.faction]?.name || entity.faction} is poor. Leave ${systemsById[space.id].name}. This is a warning, not a new countdown.`;
    } else {
      // Space.ai leaves the last target attached when a ship becomes disabled.
      // That stale combat pointer must not suppress a friendly survivor's distress.
      if (hostile || (entity.target && !(reason === 'distress' && entity.disabled))) return false;
      if (reason === 'distress') {
        if (entity.faction === 'index' || entity.indexWorksite) return false;
        if (entity.armor >= entity.st.armor * 0.5 || entity.rescueOf || entity.boss || entity.dread)
          return false;
        text =
          'Our hull is badly damaged. Can you rendezvous and help? Accept marks our transponder; emergency supplies cost 250 cr when you arrive within 180 units.';
        hailOptions.push({ k: 'rendezvous', label: 'Mark rescue rendezvous (no charge yet)' });
      } else if (entity.disabled) return false;
      else if (reason === 'fuel') {
        if (entity.ai !== 'trade' || entity.fuel >= 100 || entity.hailFuelHelp) return false;
        text = `Our tanks read ${Math.floor(entity.fuel)} fuel. Could you spare 50 units? We can only accept this transfer once.`;
        hailOptions.push({ k: 'donateFuel', label: 'Transfer 50 fuel (within 500 units)' });
      } else if (reason === 'escort') {
        if (
          entity.ai !== 'trade' ||
          !entity.dest ||
          entity.dest.out ||
          !entity.dest.id ||
          stEscort(this, session) ||
          entity.hailEscort
        )
          return false;
        text = `We are making for ${entity.dest.name}. Stay within 3,500 units until we land for 750 cr. Leaving this system, docking, separation or losing us fails the job. Five-minute limit; no raiders are spawned.`;
        hailOptions.push({ k: 'escort', label: `Escort to ${entity.dest.name} (750 cr)` });
        details.dest = { ...entity.dest, id: entity.dest.id };
      } else if (reason === 'intel') {
        const threat = [...space.ships.values()].find(
          (entity2) =>
            !entity2.player &&
            !entity2.owner &&
            !entity2.mission &&
            !entity2.dead &&
            !entity2.disabled &&
            space.isHostile(entity2, session.ent) &&
            distance(entity2, entity) < 1800,
        );
        if (!threat) return false;
        text =
          'We have a hostile NPC contact nearby. I can share a rough, position fix from this transmission—not live tracking.';
        hailOptions.push({ k: 'intel', label: 'Receive approximate contact fix' });
        details.intel = {
          x: Math.round(threat.x / 250) * 250,
          y: Math.round(threat.y / 250) * 250,
        };
      } else if (reason === 'greeting') {
        if (!entity.rival || this.game.features.rivals.relOf(session.data, entity.rival) < 30)
          return false;
        text = contextualHail(
          session,
          entity,
          space,
          this.game.features.rivals.relOf(session.data, entity.rival),
        );
      } else if (reason === 'beg') {
        // A concrete, one-time simulated hardship; never claim this is tracked NPC wealth.
        if (entity.rival || entity.ai !== 'trade') return false;
        entity.hailHardship = { requested: 100, resolved: false };
        text =
          'A small favor, Captain? I am asking for a one-time gift of 100 credits. No reward, no obligation.';
        hailOptions.push({ k: 'gift', label: 'Give 100 cr (within 500 units)' });
      } else return false;
    }
    if (!this.enqueue(session, entity, reason, text, hailOptions, details)) return false;
    entity.hailOfferUntil = currentTime + HAIL_LIMITS.expires;
    return true;
  }
  resolve(
    session: Session,
    hailState: HailState,
    hailEntry: HailEntry,
    entity: Entity,
    action: string,
  ) {
    const game2 = this.game,
      entity2 = session.ent!,
      currentTime = this.now();
    const finish = (text: string) => {
      hailState.queue = hailState.queue.filter((hailEntry2) => hailEntry2 !== hailEntry);
      this.push(session, hailState);
      game2.send(session, {
        t: 'hail',
        who: hailEntry.who,
        portraitId: hailEntry.portraitId,
        machineHull: hailEntry.machineHull,
        text,
        opts: [],
      });
    };
    if (entity.hailResolved && action !== 'repair')
      return finish('Another captain already helped us. Thank you.');
    if (action === 'rendezvous') {
      hailEntry.opts = [
        { k: 'repair', label: 'Supply emergency repairs (250 cr, within 180 units)' },
      ];
      hailEntry.text =
        'Rendezvous marked. Approach within 180 units, then reopen this hail to supply repairs.';
      hailEntry.expires = currentTime + HAIL_LIMITS.expires;
      game2.send(session, {
        t: 'hailmark',
        id: entity.id,
        x: entity.x,
        y: entity.y,
        label: 'Rescue rendezvous',
        until: hailEntry.expires,
      });
      return game2.send(session, {
        t: 'hail',
        key: hailEntry.key,
        who: hailEntry.who,
        portraitId: hailEntry.portraitId,
        machineHull: hailEntry.machineHull,
        text: hailEntry.text,
        opts: hailEntry.opts,
      });
    }
    if (action === 'intel') {
      game2.send(session, {
        t: 'hailmark',
        ...hailEntry.intel,
        label: 'Last reported hostile contact',
        until: currentTime + 60000,
      });
      return finish(
        `Approximate contact: ${hailEntry.intel!.x}, ${hailEntry.intel!.y}. The fix expires in one minute and is not live tracking.`,
      );
    }
    if (action === 'escort') {
      if (
        hailState.escort ||
        entity.hailEscort ||
        entity.disabled ||
        entity.target ||
        !entity.dest ||
        entity.dest.id !== hailEntry.dest!.id ||
        distance(entity2, entity) > 3500
      )
        return finish('That escort is no longer available.');
      entity.hailEscort = {
        owner: session.id,
        expires: currentTime + 300000,
        dest: hailEntry.dest!.id,
      };
      entity.life = Math.max(entity.life, 330);
      hailState.escort = { source: entity.id, sys: hailEntry.sys, expires: currentTime + 300000 };
      game2.send(session, {
        t: 'hailmark',
        id: entity.id,
        x: entity.x,
        y: entity.y,
        label: `Escort to ${hailEntry.dest!.name}`,
        until: currentTime + 300000,
      });
      return finish(
        `Escort accepted. Remain within 3,500 units until ${hailEntry.who} actually lands at ${hailEntry.dest!.name}.`,
      );
    }
    const range = action === 'repair' ? 180 : 500;
    if (distance(entity2, entity) > range)
      return game2.toast(session, `Approach within ${range} units first.`);
    if (action === 'donateFuel') {
      if (
        entity.hailFuelHelp ||
        entity.fuel >= 100 ||
        entity.st.fuel - entity.fuel < 50 ||
        entity2.fuel < 50
      )
        return game2.toast(session, 'The 50-unit transfer is no longer possible.');
      entity2.fuel -= 50;
      session.data.fuel = entity2.fuel;
      entity.fuel += 50;
      entity.hailFuelHelp = true;
    } else if (action === 'gift') {
      if (!entity.hailHardship || entity.hailHardship.resolved || session.data.credits < 100)
        return game2.toast(session, 'The donation is no longer possible or you lack 100 cr.');
      session.data.credits -= 100;
      entity.hailHardship.resolved = true;
    } else if (action === 'repair') {
      if (
        entity.hailRepaired ||
        entity.armor >= entity.st.armor * 0.5 ||
        session.data.credits < 250
      )
        return game2.toast(session, 'Repairs are no longer needed or you lack 250 cr.');
      session.data.credits -= 250;
      entity.armor = Math.max(entity.armor, entity.st.armor * 0.55);
      entity.disabled = false;
      entity.disT = 0;
      entity.hailRepaired = true;
      if (entity.rival)
        game2.features.rivals.rivalRel(session, entity.rival, 6, 'you supplied emergency repairs');
      else
        session.data.rep[entity.faction] = clampStanding(
          (session.data.rep[entity.faction] || 0) + 1,
        );
    } else return;
    entity.hailResolved = true;
    game2.db.touch();
    game2.you(session);
    return finish('Assistance received. Thank you, Captain.');
  }
  cancelEscort(state: Session | Pick<Session, 'id'>, hailState: HailState | undefined) {
    if (!hailState?.escort) return;
    const space = this.game.live[hailState.escort.sys],
      entity = space?.ships.get(hailState.escort.source);
    if (entity?.hailEscort?.owner === state.id) delete entity.hailEscort;
    hailState.escort = null;
    if ('data' in state && state.data) {
      this.game.toast(state, 'Spontaneous escort ended without reward.');
      this.game.send(state, { t: 'hailmark', until: 0 });
    }
  }
  landed(entity: Entity, space: Space) {
    const hailEscort2 = entity.hailEscort;
    if (!hailEscort2) return;
    delete entity.hailEscort;
    const session = this.game.sessions.get(hailEscort2.owner),
      hailState = session && this.states.get(session.id);
    if (
      !hailState?.escort ||
      !flying(session) ||
      session.data.sys !== space.id ||
      this.now() > hailEscort2.expires ||
      distance(session.ent, entity) > 3500 ||
      entity.dest?.id !== hailEscort2.dest
    ) {
      if (hailState) this.cancelEscort(session!, hailState);
      return;
    }
    hailState.escort = null;
    entity.hailResolved = true;
    session.data.credits += 750;
    this.game.db.touch();
    this.game.you(session);
    this.game.toast(session, 'Spontaneous escort completed: 750 cr.');
    this.game.send(session, { t: 'hailmark', until: 0 });
  }
  tick() {
    const game2 = this.game,
      currentTime = this.now();
    for (const [identifier, hailState] of this.states)
      if (!game2.sessions.has(identifier)) {
        this.cancelEscort({ id: identifier }, hailState);
        this.states.delete(identifier);
      }
    for (const session of game2.sessions.values()) {
      if (!session.data) continue;
      const hailState = this.state(session),
        space2 = hailState.space;
      const before = hailState.queue.length;
      // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
      for (const hailEntry of [...hailState.queue])
        if (hailEntry.expires <= currentTime || !this.source(session, hailEntry))
          this.archive(hailState, hailEntry);
      if (before !== hailState.queue.length) this.push(session, hailState);
      if (hailState.escort) {
        const entity = space2?.ships.get(hailState.escort.source);
        if (
          !flying(session) ||
          !entity ||
          entity.dead ||
          currentTime > hailState.escort.expires ||
          distance(session.ent, entity) > 3500
        )
          this.cancelEscort(session, hailState);
      }
      if (!space2 || !flying(session) || currentTime < hailState.next) continue;
      hailState.next = currentTime + 180000 + this.random() * 180000;
      const combat =
        (session.ent.target && space2.isHostile(session.ent, session.ent.target)) ||
        [...space2.ships.values()].some(
          (entity) => entity.target && space2.root(entity.target) === session.ent,
        );
      const candidates = [...space2.ships.values()].filter(
        (entity) =>
          !entity.player &&
          !entity.owner &&
          !entity.dead &&
          !entity.mission &&
          !entity.convoyOf &&
          !entity.huntOf &&
          !silent(entity) &&
          distance(entity, session.ent) < 3500,
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
      for (const entity of candidates)
        if (entity.ai === 'trade' && !entity.rival && entity.hailFuelChecked === undefined) {
          entity.hailFuelChecked = true;
          if (this.random() < 0.12 && entity.st.fuel >= 100)
            entity.fuel = Math.min(entity.fuel, 50);
        }
      let sent = false;
      for (const reason of topics) {
        for (const entity of candidates.sort(() => this.random() - 0.5))
          if (this.offer(session, entity, reason)) {
            sent = true;
            break;
          }
        if (sent) break;
      }
    }
  }
}
function stEscort(service: HailService, session: Session) {
  return service.states.get(session.id)?.escort;
}
