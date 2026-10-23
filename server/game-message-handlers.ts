import type { Game } from './game.ts';
import type { MessageRegistry, NetworkMessage } from './message-registry.ts';
export type Session = import('./game.ts').Session;
export type MessageCapabilities = Pick<
  Game,
  | 'A'
  | 'accept'
  | 'buyMat'
  | 'buyShip'
  | 'chat'
  | 'combatAssist'
  | 'db'
  | 'depart'
  | 'features'
  | 'hails'
  | 'jump'
  | 'land'
  | 'landed'
  | 'live'
  | 'log'
  | 'outfit'
  | 'paused'
  | 'send'
  | 'sessions'
  | 'setPaused'
  | 'solo'
  | 'spaces'
  | 'station'
  | 'trade'
  | 'tut'
  | 'you'
>;

import { createMessageRegistry } from './message-registry.ts';
import { TUTORIAL } from '../shared/tutorial.ts';

/**
 * Explicit switchboard dependencies, supplied by Game.createMessageHandlers.
 * Getters read current services/state; forwarding functions preserve Game as the
 * method receiver. This routes actions, not a new owner of save or world state.
 * Handlers are statically checked; this type is not runtime wire validation.

 */

/**
 * Build the fixed authenticated action switchboard. Game.onMessage retains the
 * authentication, flood, economic-freeze and activity gates ahead of dispatch.
 * @param capabilities Only the explicitly provided core capabilities.
 */
export function createGameMessageHandlers(capabilities: MessageCapabilities): MessageRegistry {
  return createMessageRegistry([
    [
      'towing',
      (session, message) =>
        capabilities.features.towing.command(
          session,
          message as Parameters<typeof capabilities.features.towing.command>[1],
        ),
    ],
    [
      'industrial',
      (session, message) =>
        capabilities.features.industrial.command(
          session,
          message as Parameters<typeof capabilities.features.industrial.command>[1],
        ),
    ],
    [
      'miningPressure',
      (session, message) =>
        capabilities.features.pressure.consent(
          session,
          message as Parameters<typeof capabilities.features.pressure.consent>[1],
        ),
    ],
    [
      'refinery',
      (session, message) =>
        capabilities.features.refinery.command(
          session,
          message as Parameters<typeof capabilities.features.refinery.command>[1],
        ),
    ],
    [
      'miningOrder',
      (session, message) =>
        capabilities.features.refinery.command(
          session,
          message as Parameters<typeof capabilities.features.refinery.command>[1],
          true,
        ),
    ],
    [
      'mining',
      (session, message) => {
        capabilities.features.mining.survey(
          session,
          message as Parameters<typeof capabilities.features.mining.survey>[1],
        );
      },
    ],
    [
      'combat',
      /**
       * Dispatches combat assist autopilot mode command.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.combatAssist.command(
          session,
          message as Parameters<typeof capabilities.combatAssist.command>[1],
        );
      },
    ],
    [
      'input',
      /**
       * Processes raw ship flight controls (thrust, turn, afterburner, weapons fire).
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        if (
          (message.th || message.tu || message.ab || message.rv || message.f1 || message.f2) &&
          session.combat &&
          (session.combat.on || session.combat.consent)
        )
          capabilities.combatAssist.manual(session);
        if (session.ent && (session.inputScheduling === 'match' || session.inputs.length < 8)) {
          const input = {
            seq: message.seq! | 0,
            thrust: message.th ? 1 : 0,
            turn: clamp(message.tu! | 0, -1, 1),
            ab: message.ab ? 1 : 0,
            rev: message.rv ? 1 : 0,
            fire1: message.f1 ? 1 : 0,
            fire2: message.f2 ? 1 : 0,
            navigation: !!message.nav,
          };
          if (session.inputScheduling === 'match') session.lastInput = input;
          else session.inputs.push(input);
        }
        return;
      },
    ],
    [
      'target',
      /**
       * Selects or clears current combat target entity.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        const playerData = session.data;
        if (session.ent) {
          const space = capabilities.spaces[playerData.sys];
          session.ent.target = message.id ? space.ships.get(message.id as number) || null : null;
          capabilities.combatAssist.selected(session, session.ent.target, space);
          if (session.ent.target) capabilities.tut(session, 'target');
        }
        return;
      },
    ],
    [
      'tutskip',
      /**
       * Skips career tutorial guide to completion.
       * @param session Player session.
       * @param _message Message payload.
       */
      (session: Session, _message: NetworkMessage) => {
        const playerData = session.data;
        if (playerData.tut != null && playerData.tut < TUTORIAL.length) {
          playerData.tut = TUTORIAL.length;
          capabilities.you(session);
        }
        return;
      },
    ],
    [
      'land',
      /**
       * Requests landing at target stellar body.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.land(session, message.stellar!);
        return;
      },
    ],
    [
      'depart',
      /**
       * Requests launch from currently docked stellar body into space.
       * @param session Player session.
       * @param _message Message payload.
       */
      (session: Session, _message: NetworkMessage) => {
        capabilities.depart(session);
        return;
      },
    ],
    [
      'jump',
      /**
       * Initiates hyperjump to connected system.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.jump(session, message.to!);
        return;
      },
    ],
    [
      'trade',
      /**
       * Executes commodity buy or sell transaction at docked market.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.trade(session, message.cid!, message.qty! | 0, message.lots);
        return;
      },
    ],
    [
      'buyship',
      /**
       * Purchases a ship from shipyard for flagship or hangar storage.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        if (message.store) capabilities.features.docks.buyToHangar(session, message.hull! | 0);
        else capabilities.buyShip(session, message.hull! | 0);
        return;
      },
    ],
    [
      'docks',
      /**
       * Dispatches drydock operations (ship loadouts, wing assignments).
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.docks.docksOp(
          session,
          message as Parameters<typeof capabilities.features.docks.docksOp>[1],
        );
        return; // 2.1
      },
    ],
    [
      'questdrop',
      /**
       * Abandons an active story quest.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        const playerData = session.data;
        if (typeof message.qid === 'string') {
          capabilities.features.quests.questFail(session, message.qid, 'abandoned');
          capabilities.you(session);
          if (playerData.stellar) capabilities.landed(session);
        }
        return; // 2.4
      },
    ],
    [
      'outfit',
      /**
       * Purchases or sells ship outfits and ammunition.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.outfit(session, (message.id as number) | 0, message.n! | 0);
        return;
      },
    ],
    [
      'accept',
      /**
       * Accepts mission from stellar job board.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.accept(session, message.id as string);
        return;
      },
    ],
    [
      'abandon',
      /**
       * Abandons an active mission.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        const playerData = session.data;
        {
          // an abandoned bounty's target leaves too
          const gone = playerData.missions.find((mission) => mission.id === message.id);
          if (!gone) return;
          if (gone.type === 'miningOrder')
            return capabilities.features.refinery.command(
              session,
              { t: 'miningOrder', op: 'cancelOrder', id: gone.id, port: gone.dest },
              true,
            );
          playerData.missions = playerData.missions.filter((mission) => mission !== gone);
          if (gone.quest)
            capabilities.features.quests.questFail(session, gone.quest.qid, 'abandoned'); // abandoning a step ends the story
          if (gone.sys && capabilities.live[gone.sys]) {
            const space = capabilities.live[gone.sys];
            // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
            for (const entity of [...space.ships.values()])
              if (entity.mission && entity.mission.id === gone.id) {
                entity.mission = null;
                entity.ai = 'leave';
                entity.target = null;
                entity.life = 0;
              }
          }
          capabilities.log(playerData, `Abandoned: ${gone.title}.`);
          capabilities.db.touch();
          capabilities.you(session);
          if (playerData.stellar) capabilities.landed(session);
          return;
        }
      },
    ],
    [
      'station',
      /**
       * Performs Personal Station operations (claim, upgrade, refinery, research, relocate).
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.station(session, message as Parameters<typeof capabilities.station>[1]);
        return;
      },
    ],
    [
      'buymat',
      /**
       * Purchases or sells engineering materials at station or commodity hub.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.buyMat(session, message.mat!, (message.grade as number) | 0, message.n! | 0);
        return;
      },
    ],
    [
      'rename',
      /**
       * Renames current flagship.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        const playerData = session.data;
        if (typeof message.name === 'string' && !playerData.shipless) {
          playerData.ship.name =
            message.name.replace(/[<>]/g, '').trim().slice(0, 28) ||
            capabilities.A.ships[playerData.ship.hull].name;
          capabilities.you(session);
        }
        return;
      },
    ],
    [
      'note',
      /**
       * Adds a custom captain's log note entry.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        const playerData = session.data;
        if (typeof message.text === 'string' && message.text.trim()) {
          capabilities.log(playerData, message.text.slice(0, 500));
          capabilities.you(session);
        }
        return;
      },
    ],
    [
      'chat',
      /**
       * Sends chat message to system, global, or Armada channels.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.chat(session, message as Parameters<typeof capabilities.chat>[1]);
        return;
      },
    ],
    [
      'officer',
      /**
       * Performs bridge officer assignments, recruitment, and promotions.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.hangar.officerOp(
          session,
          message as Parameters<typeof capabilities.features.hangar.officerOp>[1],
        );
        return;
      },
    ],
    [
      'shuttle',
      /**
       * Dispatches or manages automated trade and mining shuttles.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.hangar.shuttleOp(
          session,
          message as Parameters<typeof capabilities.features.hangar.shuttleOp>[1],
        );
        return;
      },
    ],
    [
      'dock',
      /**
       * Manages hangar ship storage and swap operations.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.hangar.dockOp(
          session,
          message as Parameters<typeof capabilities.features.hangar.dockOp>[1],
        );
        return;
      },
    ],
    [
      'board',
      /**
       * Boards disabled enemy ship or performs rescue operation.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.features.hangar.board(
          session,
          message as Parameters<typeof capabilities.features.hangar.board>[1],
        );
        return;
      },
    ],
    [
      'spec',
      /**
       * Performs ship specialization tier upgrades and modification.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.specialists.specOp(
          session,
          message as Parameters<typeof capabilities.features.specialists.specOp>[1],
        );
        return;
      },
    ],
    [
      'armada',
      /**
       * Performs co-op Armada formation, invites, and group commands.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.coop.armadaOp(
          session,
          message as Parameters<typeof capabilities.features.coop.armadaOp>[1],
        );
        return; // the co-op group
      },
    ],
    [
      'holdout',
      /**
       * Initiates survival holdout wave combat event.
       * @param session Player session.
       * @param _message Message payload.
       */
      (session: Session, _message: NetworkMessage) => {
        capabilities.features.hostile.holdoutStart(session);
        return;
      },
    ],
    [
      'storyacc',
      /**
       * Accepts main storyline progression chapter.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.story.storyAccept(
          session,
          message as Parameters<typeof capabilities.features.story.storyAccept>[1],
        );
        return;
      },
    ],
    [
      'social',
      /**
       * Dispatches social operations: friend requests, direct messages, blocks.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.coop.socialOp(
          session,
          message as Parameters<typeof capabilities.features.coop.socialOp>[1],
        );
        return; // friends, DMs, blocks
      },
    ],
    [
      'trade2',
      /**
       * Conducts secure station-to-station cargo and credit trade between captains.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.coop.tradeOp(
          session,
          message as Parameters<typeof capabilities.features.coop.tradeOp>[1],
        );
        return; // trading between stations
      },
    ],
    [
      'duel',
      /**
       * Initiates or accepts formal non-lethal captain duel challenge.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.coop.duelOp(
          session,
          message as Parameters<typeof capabilities.features.coop.duelOp>[1],
        );
        return; // agreed duels
      },
    ],
    [
      'goal',
      /**
       * Claims a daily or weekly goal reward.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.fronts.claimGoal(
          session,
          message as Parameters<typeof capabilities.features.fronts.claimGoal>[1],
        );
        return;
      },
    ],
    [
      'store',
      /**
       * Purchases a faction-store item.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.fronts.storeBuy(
          session,
          message as Parameters<typeof capabilities.features.fronts.storeBuy>[1],
        );
        return;
      },
    ],
    [
      'colony',
      /**
       * Dispatches frontier planet colonization and outpost development operations.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.frontier.colonyOp(
          session,
          message as Parameters<typeof capabilities.features.frontier.colonyOp>[1],
        );
        return;
      },
    ],
    [
      'arena',
      /**
       * Enters matchmaking queue or manages combat arena operations.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.frontier.arenaOp(
          session,
          message as Parameters<typeof capabilities.features.frontier.arenaOp>[1],
        );
        return;
      },
    ],
    [
      'exchange',
      /**
       * Manages player Exchange orders and storage.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.frontier.exchangeOp(
          session,
          message as Parameters<typeof capabilities.features.frontier.exchangeOp>[1],
        );
        return;
      },
    ],
    [
      'boards',
      /**
       * Requests community competitive leaderboard data.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.send(session, {
          t: 'boards',
          cat: message.cat,
          list: capabilities.features.frontier.leaderboard(message.cat!),
        });
        return;
      },
    ],
    [
      'profile',
      /**
       * Requests public captain career and combat profile.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.send(session, {
          t: 'profile',
          p: capabilities.features.frontier.profile(message.name!),
        });
        return;
      },
    ],
    [
      'ping',
      /**
       * Responds to client latency measurement ping with pong.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.send(session, { t: 'pong', c: message.c });
        return;
      },
    ],
    [
      'hail',
      /**
       * Initiates radio comms hail to target stellar or ship.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.hail.hail(
          session,
          message as Parameters<typeof capabilities.features.hail.hail>[1],
        );
        return; // 1.1
      },
    ],
    [
      'hailin',
      (session, message) =>
        capabilities.hails.request(
          session,
          message as Parameters<typeof capabilities.hails.request>[1],
        ),
    ],
    [
      'hailopt',
      /**
       * Selects dialogue conversation choice during active radio hail.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.hail.hailOpt(
          session,
          message as Parameters<typeof capabilities.features.hail.hailOpt>[1],
        );
        return;
      },
    ],
    [
      'order',
      /**
       * Issues fleet command order to escort wingmates.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        if (session.ent) {
          if (message.o === 'attack' && session.ent.order !== 'attack')
            capabilities.combatAssist.attack(session, capabilities.spaces[session.data.sys]);
          else capabilities.combatAssist.stop(session, 'Fleet order');
        }
        capabilities.features.fleetcmd.fleetOrder(session, message.o!);
        return;
      },
    ],
    [
      'jettison',
      /**
       * Jettisons cargo into space to lighten ship or distract raiders.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.fleetcmd.jettison(
          session,
          message.cid!,
          message.n! | 0,
          message.lots,
        );
        return;
      },
    ],
    [
      'rivals',
      /**
       * Requests status payload of active AI rival captains.
       * @param session Player session.
       * @param _message Message payload.
       */
      (session: Session, _message: NetworkMessage) => {
        const playerData = session.data;
        capabilities.send(session, {
          t: 'rivals',
          list: capabilities.features.rivals.rivalsPayload(playerData),
        });
        return;
      },
    ],
    [
      'bm',
      /**
       * Purchases illicit contraband from syndicate black market.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.syndicate.bmBuy(session, message.id as string);
        return;
      },
    ],
    [
      'arcacc',
      /**
       * Accepts faction campaign story arc.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.arcs.arcAccept(session, message.fac!);
        return; // 1.2
      },
    ],
    [
      'promote',
      /**
       * Claims syndicate crime tier promotion.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.syndicate.promote(session, message.id as string);
        return;
      },
    ],
    [
      'lower',
      /**
       * Dispatches lower deck syndicate crew operations.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.syndicate.lowerDeck(
          session,
          message as Parameters<typeof capabilities.features.syndicate.lowerDeck>[1],
        );
        return;
      },
    ],
    [
      'bank',
      /**
       * Performs Syndicate bank loan borrowing and repayment.
       * @param session Player session.
       * @param message Message payload.
       */
      (session: Session, message: NetworkMessage) => {
        capabilities.features.syndicate.bankOp(
          session,
          message as Parameters<typeof capabilities.features.syndicate.bankOp>[1],
        );
        return;
      },
    ],
    [
      'pause',
      /**
       * Toggles solo play game pause state.
       * @param session Player session.
       * @param _message Message payload.
       */
      (session: Session, _message: NetworkMessage) => {
        if (
          capabilities.solo &&
          [...capabilities.sessions.values()].filter((session) => session.data).length === 1
        ) {
          capabilities.setPaused(!capabilities.paused);
          capabilities.send(session, { t: 'paused', on: capabilities.paused });
        }
        return;
      },
    ],
  ]);
}

/**
 * Clamps a numeric value between minimum and maximum bounds.
 * @param value Input value.
 * @param firstValue Minimum bound.
 * @param secondValue Maximum bound.
 * @returns Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));
