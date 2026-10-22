import { createMessageRegistry } from './message-registry.js';
import { TUTORIAL } from '../shared/tutorial.js';

/** @import { Game } from './game.js' */
/** @import { MessageRegistry, NetworkMessage } from './message-registry.js' */

/** @typedef {import('./game.js').Session} Session */
/**
 * Explicit switchboard dependencies, supplied by Game.createMessageHandlers.
 * Getters read current services/state; forwarding functions preserve Game as the
 * method receiver. This routes actions, not a new owner of save or world state.
 * Legacy handler bodies remain unchecked; this type is not wire validation.
 * @typedef {Pick<Game,
 *   'A' |
 *   'accept' |
 *   'buyMat' |
 *   'buyShip' |
 *   'chat' |
 *   'combatAssist' |
 *   'db' |
 *   'depart' |
 *   'features' |
 *   'hails' |
 *   'jump' |
 *   'land' |
 *   'landed' |
 *   'live' |
 *   'log' |
 *   'outfit' |
 *   'paused' |
 *   'send' |
 *   'sessions' |
 *   'setPaused' |
 *   'solo' |
 *   'spaces' |
 *   'station' |
 *   'trade' |
 *   'tut' |
 *   'you'>} MessageCapabilities
 */

/**
 * Build the fixed authenticated action switchboard. Game.onMessage retains the
 * authentication, flood, economic-freeze and activity gates ahead of dispatch.
 * @param {MessageCapabilities} capabilities Only the explicitly provided core capabilities.
 * @returns {MessageRegistry}
 */
export function createGameMessageHandlers(capabilities) {
  return createMessageRegistry([
    ['towing', (session, message) => capabilities.features.towing.command(session, message)],
    [
      'industrial',
      (session, message) => capabilities.features.industrial.command(session, message),
    ],
    [
      'miningPressure',
      (session, message) => capabilities.features.pressure.consent(session, message),
    ],
    ['refinery', (session, message) => capabilities.features.refinery.command(session, message)],
    [
      'miningOrder',
      (session, message) => capabilities.features.refinery.command(session, message, true),
    ],
    [
      'mining',
      (session, message) => {
        capabilities.features.mining.survey(session, message);
      },
    ],
    [
      'combat',
      /**
       * Dispatches combat assist autopilot mode command.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.combatAssist.command(session, message);
      },
    ],
    [
      'input',
      /**
       * Processes raw ship flight controls (thrust, turn, afterburner, weapons fire).
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        if (
          (message.th || message.tu || message.ab || message.rv || message.f1 || message.f2) &&
          session.combat &&
          (session.combat.on || session.combat.consent)
        )
          capabilities.combatAssist.manual(session);
        if (session.ent && session.inputs.length < 8)
          session.inputs.push({
            seq: message.seq | 0,
            thrust: message.th ? 1 : 0,
            turn: clamp(message.tu | 0, -1, 1),
            ab: message.ab ? 1 : 0,
            rev: message.rv ? 1 : 0,
            fire1: message.f1 ? 1 : 0,
            fire2: message.f2 ? 1 : 0,
            navigation: !!message.nav,
          });
        return;
      },
    ],
    [
      'target',
      /**
       * Selects or clears current combat target entity.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        const playerData = session.data;
        if (session.ent) {
          const sp = capabilities.spaces[playerData.sys];
          session.ent.target = message.id ? sp.ships.get(message.id) || null : null;
          capabilities.combatAssist.selected(session, session.ent.target, sp);
          if (session.ent.target) capabilities.tut(session, 'target');
        }
        return;
      },
    ],
    [
      'tutskip',
      /**
       * Skips career tutorial guide to completion.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.land(session, message.stellar);
        return;
      },
    ],
    [
      'depart',
      /**
       * Requests launch from currently docked stellar body into space.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.depart(session);
        return;
      },
    ],
    [
      'jump',
      /**
       * Initiates hyperjump to connected system.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.jump(session, message.to);
        return;
      },
    ],
    [
      'trade',
      /**
       * Executes commodity buy or sell transaction at docked market.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.trade(session, message.cid, message.qty | 0, message.lots);
        return;
      },
    ],
    [
      'buyship',
      /**
       * Purchases a ship from shipyard for flagship or hangar storage.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        if (message.store) capabilities.features.docks.buyToHangar(session, message.hull | 0);
        else capabilities.buyShip(session, message.hull | 0);
        return;
      },
    ],
    [
      'docks',
      /**
       * Dispatches drydock operations (ship loadouts, wing assignments).
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.docks.docksOp(session, message);
        return; // 2.1
      },
    ],
    [
      'questdrop',
      /**
       * Abandons an active story quest.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.outfit(session, message.id | 0, message.n | 0);
        return;
      },
    ],
    [
      'accept',
      /**
       * Accepts mission from stellar job board.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.accept(session, message.id);
        return;
      },
    ],
    [
      'abandon',
      /**
       * Abandons an active mission.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        const playerData = session.data;
        {
          // an abandoned bounty's target leaves too
          const gone = playerData.missions.find((x) => x.id === message.id);
          if (!gone) return;
          if (gone.type === 'miningOrder')
            return capabilities.features.refinery.command(
              session,
              { t: 'miningOrder', op: 'cancelOrder', id: gone.id, port: gone.dest },
              true,
            );
          playerData.missions = playerData.missions.filter((x) => x !== gone);
          if (gone.quest)
            capabilities.features.quests.questFail(session, gone.quest.qid, 'abandoned'); // abandoning a step ends the story
          if (gone.sys && capabilities.live[gone.sys]) {
            const sp = capabilities.live[gone.sys];
            for (const x of [...sp.ships.values()])
              if (x.mission && x.mission.id === gone.id) {
                x.mission = null;
                x.ai = 'leave';
                x.target = null;
                x.life = 0;
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.station(session, message);
        return;
      },
    ],
    [
      'buymat',
      /**
       * Purchases or sells engineering materials at station or commodity hub.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.buyMat(session, message.mat, message.grade | 0, message.n | 0);
        return;
      },
    ],
    [
      'rename',
      /**
       * Renames current flagship.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.chat(session, message);
        return;
      },
    ],
    [
      'officer',
      /**
       * Performs bridge officer assignments, recruitment, and promotions.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hangar.officerOp(session, message);
        return;
      },
    ],
    [
      'shuttle',
      /**
       * Dispatches or manages automated trade and mining shuttles.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hangar.shuttleOp(session, message);
        return;
      },
    ],
    [
      'dock',
      /**
       * Manages hangar ship storage and swap operations.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hangar.dockOp(session, message);
        return;
      },
    ],
    [
      'board',
      /**
       * Boards disabled enemy ship or performs rescue operation.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.combatAssist.stop(session, 'Travel or boarding');
        capabilities.features.hangar.board(session, message);
        return;
      },
    ],
    [
      'spec',
      /**
       * Performs ship specialization tier upgrades and modification.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.specialists.specOp(session, message);
        return;
      },
    ],
    [
      'armada',
      /**
       * Performs co-op Armada formation, invites, and group commands.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.coop.armadaOp(session, message);
        return; // the co-op group
      },
    ],
    [
      'holdout',
      /**
       * Initiates survival holdout wave combat event.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hostile.holdoutStart(session);
        return;
      },
    ],
    [
      'storyacc',
      /**
       * Accepts main storyline progression chapter.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.story.storyAccept(session, message);
        return;
      },
    ],
    [
      'social',
      /**
       * Dispatches social operations: friend requests, direct messages, blocks.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.coop.socialOp(session, message);
        return; // friends, DMs, blocks
      },
    ],
    [
      'trade2',
      /**
       * Conducts secure station-to-station cargo and credit trade between captains.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.coop.tradeOp(session, message);
        return; // trading between stations
      },
    ],
    [
      'duel',
      /**
       * Initiates or accepts formal non-lethal captain duel challenge.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.coop.duelOp(session, message);
        return; // agreed duels
      },
    ],
    [
      'goal',
      /**
       * Claims a daily or weekly goal reward.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.fronts.claimGoal(session, message);
        return;
      },
    ],
    [
      'store',
      /**
       * Purchases a faction-store item.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.fronts.storeBuy(session, message);
        return;
      },
    ],
    [
      'colony',
      /**
       * Dispatches frontier planet colonization and outpost development operations.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.frontier.colonyOp(session, message);
        return;
      },
    ],
    [
      'arena',
      /**
       * Enters matchmaking queue or manages combat arena operations.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.frontier.arenaOp(session, message);
        return;
      },
    ],
    [
      'exchange',
      /**
       * Manages player Exchange orders and storage.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.frontier.exchangeOp(session, message);
        return;
      },
    ],
    [
      'boards',
      /**
       * Requests community competitive leaderboard data.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.send(session, {
          t: 'boards',
          cat: message.cat,
          list: capabilities.features.frontier.leaderboard(message.cat),
        });
        return;
      },
    ],
    [
      'profile',
      /**
       * Requests public captain career and combat profile.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.send(session, {
          t: 'profile',
          p: capabilities.features.frontier.profile(message.name),
        });
        return;
      },
    ],
    [
      'ping',
      /**
       * Responds to client latency measurement ping with pong.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.send(session, { t: 'pong', c: message.c });
        return;
      },
    ],
    [
      'hail',
      /**
       * Initiates radio comms hail to target stellar or ship.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hail.hail(session, message);
        return; // 1.1
      },
    ],
    ['hailin', (session, message) => capabilities.hails.request(session, message)],
    [
      'hailopt',
      /**
       * Selects dialogue conversation choice during active radio hail.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.hail.hailOpt(session, message);
        return;
      },
    ],
    [
      'order',
      /**
       * Issues fleet command order to escort wingmates.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        if (session.ent) {
          if (message.o === 'attack' && session.ent.order !== 'attack')
            capabilities.combatAssist.attack(session, capabilities.spaces[session.data.sys]);
          else capabilities.combatAssist.stop(session, 'Fleet order');
        }
        capabilities.features.fleetcmd.fleetOrder(session, message.o);
        return;
      },
    ],
    [
      'jettison',
      /**
       * Jettisons cargo into space to lighten ship or distract raiders.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.fleetcmd.jettison(session, message.cid, message.n | 0, message.lots);
        return;
      },
    ],
    [
      'rivals',
      /**
       * Requests status payload of active AI rival captains.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
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
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.syndicate.bmBuy(session, message.id);
        return;
      },
    ],
    [
      'arcacc',
      /**
       * Accepts faction campaign story arc.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.arcs.arcAccept(session, message.fac);
        return; // 1.2
      },
    ],
    [
      'promote',
      /**
       * Claims syndicate crime tier promotion.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.syndicate.promote(session, message.id);
        return;
      },
    ],
    [
      'lower',
      /**
       * Dispatches lower deck syndicate crew operations.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.syndicate.lowerDeck(session, message);
        return;
      },
    ],
    [
      'bank',
      /**
       * Performs Syndicate bank loan borrowing and repayment.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        capabilities.features.syndicate.bankOp(session, message);
        return;
      },
    ],
    [
      'pause',
      /**
       * Toggles solo play game pause state.
       * @param {Session} session Player session.
       * @param {NetworkMessage} message Message payload.
       */
      (session, message) => {
        if (
          capabilities.solo &&
          [...capabilities.sessions.values()].filter((x) => x.data).length === 1
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
 * @param {number} v Input value.
 * @param {number} a Minimum bound.
 * @param {number} b Maximum bound.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
