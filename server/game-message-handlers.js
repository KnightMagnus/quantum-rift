import { createMessageRegistry } from './message-registry.js';
import { TUTORIAL } from '../shared/tutorial.js';

/** @typedef {import('./game.js').Session} Session */
/**
 * Explicit switchboard dependencies, supplied by Game.createMessageHandlers.
 * Getters read current services/state; forwarding functions preserve Game as the
 * method receiver. This routes actions, not a new owner of save or world state.
 * Legacy handler bodies remain unchecked; this type is not wire validation.
 * @typedef {Pick<import('./game.js').Game,
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
 * @param {MessageCapabilities} c Only the explicitly provided core capabilities.
 * @returns {import('./message-registry.js').MessageRegistry}
 */
export function createGameMessageHandlers(c) {
  return createMessageRegistry([
    ['towing', (s, m) => c.features.towing.command(s, m)],
    ['industrial', (s, m) => c.features.industrial.command(s, m)],
    ['miningPressure', (s, m) => c.features.pressure.consent(s, m)],
    ['refinery', (s, m) => c.features.refinery.command(s, m)],
    ['miningOrder', (s, m) => c.features.refinery.command(s, m, true)],
    [
      'mining',
      (s, m) => {
        c.features.mining.survey(s, m);
      },
    ],
    [
      'combat',
      /**
       * Dispatches combat assist autopilot mode command.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.combatAssist.command(s, m);
      },
    ],
    [
      'input',
      /**
       * Processes raw ship flight controls (thrust, turn, afterburner, weapons fire).
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        if (
          (m.th || m.tu || m.ab || m.rv || m.f1 || m.f2) &&
          s.combat &&
          (s.combat.on || s.combat.consent)
        )
          c.combatAssist.manual(s);
        if (s.ent && s.inputs.length < 8)
          s.inputs.push({
            seq: m.seq | 0,
            thrust: m.th ? 1 : 0,
            turn: clamp(m.tu | 0, -1, 1),
            ab: m.ab ? 1 : 0,
            rev: m.rv ? 1 : 0,
            fire1: m.f1 ? 1 : 0,
            fire2: m.f2 ? 1 : 0,
            navigation: !!m.nav,
          });
        return;
      },
    ],
    [
      'target',
      /**
       * Selects or clears current combat target entity.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        if (s.ent) {
          const sp = c.spaces[d.sys];
          s.ent.target = m.id ? sp.ships.get(m.id) || null : null;
          c.combatAssist.selected(s, s.ent.target, sp);
          if (s.ent.target) c.tut(s, 'target');
        }
        return;
      },
    ],
    [
      'tutskip',
      /**
       * Skips career tutorial guide to completion.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        if (d.tut != null && d.tut < TUTORIAL.length) {
          d.tut = TUTORIAL.length;
          c.you(s);
        }
        return;
      },
    ],
    [
      'land',
      /**
       * Requests landing at target stellar body.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.combatAssist.stop(s, 'Travel or boarding');
        c.land(s, m.stellar);
        return;
      },
    ],
    [
      'depart',
      /**
       * Requests launch from currently docked stellar body into space.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.depart(s);
        return;
      },
    ],
    [
      'jump',
      /**
       * Initiates hyperjump to connected system.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.combatAssist.stop(s, 'Travel or boarding');
        c.jump(s, m.to);
        return;
      },
    ],
    [
      'trade',
      /**
       * Executes commodity buy or sell transaction at docked market.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.trade(s, m.cid, m.qty | 0, m.lots);
        return;
      },
    ],
    [
      'buyship',
      /**
       * Purchases a ship from shipyard for flagship or hangar storage.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        if (m.store) c.features.docks.buyToHangar(s, m.hull | 0);
        else c.buyShip(s, m.hull | 0);
        return;
      },
    ],
    [
      'docks',
      /**
       * Dispatches drydock operations (ship loadouts, wing assignments).
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.docks.docksOp(s, m);
        return; // 2.1
      },
    ],
    [
      'questdrop',
      /**
       * Abandons an active story quest.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        if (typeof m.qid === 'string') {
          c.features.quests.questFail(s, m.qid, 'abandoned');
          c.you(s);
          if (d.stellar) c.landed(s);
        }
        return; // 2.4
      },
    ],
    [
      'outfit',
      /**
       * Purchases or sells ship outfits and ammunition.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.outfit(s, m.id | 0, m.n | 0);
        return;
      },
    ],
    [
      'accept',
      /**
       * Accepts mission from stellar job board.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.accept(s, m.id);
        return;
      },
    ],
    [
      'abandon',
      /**
       * Abandons an active mission.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        {
          // 2.0.3: an abandoned bounty's target leaves too
          const gone = d.missions.find((x) => x.id === m.id);
          if (!gone) return;
          if (gone.type === 'miningOrder')
            return c.features.refinery.command(
              s,
              { t: 'miningOrder', op: 'cancelOrder', id: gone.id, port: gone.dest },
              true,
            );
          d.missions = d.missions.filter((x) => x !== gone);
          if (gone.quest) c.features.quests.questFail(s, gone.quest.qid, 'abandoned'); // 2.4: abandoning a step ends the story
          if (gone.sys && c.live[gone.sys]) {
            const sp = c.live[gone.sys];
            for (const x of [...sp.ships.values()])
              if (x.mission && x.mission.id === gone.id) {
                x.mission = null;
                x.ai = 'leave';
                x.target = null;
                x.life = 0;
              }
          }
          c.log(d, `Abandoned: ${gone.title}.`);
          c.db.touch();
          c.you(s);
          if (d.stellar) c.landed(s);
          return;
        }
      },
    ],
    [
      'station',
      /**
       * Performs Personal Station operations (claim, upgrade, refinery, research, relocate).
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.station(s, m);
        return;
      },
    ],
    [
      'buymat',
      /**
       * Purchases or sells engineering materials at station or commodity hub.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.buyMat(s, m.mat, m.grade | 0, m.n | 0);
        return;
      },
    ],
    [
      'rename',
      /**
       * Renames current flagship.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        if (typeof m.name === 'string' && !d.shipless) {
          d.ship.name =
            m.name.replace(/[<>]/g, '').trim().slice(0, 28) || c.A.ships[d.ship.hull].name;
          c.you(s);
        }
        return;
      },
    ],
    [
      'note',
      /**
       * Adds a custom captain's log note entry.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        if (typeof m.text === 'string' && m.text.trim()) {
          c.log(d, m.text.slice(0, 500));
          c.you(s);
        }
        return;
      },
    ],
    [
      'chat',
      /**
       * Sends chat message to system, global, or Armada channels.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.chat(s, m);
        return;
      },
    ],
    [
      'officer',
      /**
       * Performs bridge officer assignments, recruitment, and promotions.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hangar.officerOp(s, m);
        return;
      },
    ],
    [
      'shuttle',
      /**
       * Dispatches or manages automated trade and mining shuttles.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hangar.shuttleOp(s, m);
        return;
      },
    ],
    [
      'dock',
      /**
       * Manages hangar ship storage and swap operations.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hangar.dockOp(s, m);
        return;
      },
    ],
    [
      'board',
      /**
       * Boards disabled enemy ship or performs rescue operation.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.combatAssist.stop(s, 'Travel or boarding');
        c.features.hangar.board(s, m);
        return;
      },
    ],
    [
      'spec',
      /**
       * Performs ship specialization tier upgrades and modification.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.specialists.specOp(s, m);
        return;
      },
    ],
    [
      'armada',
      /**
       * Performs co-op Armada formation, invites, and group commands.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.coop.armadaOp(s, m);
        return; // 2.6: the co-op group (was the solo-armada summon)
      },
    ],
    [
      'holdout',
      /**
       * Initiates survival holdout wave combat event.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hostile.holdoutStart(s);
        return;
      },
    ],
    [
      'storyacc',
      /**
       * Accepts main storyline progression chapter.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.story.storyAccept(s, m);
        return;
      },
    ],
    [
      'social',
      /**
       * Dispatches social operations: friend requests, direct messages, blocks.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.coop.socialOp(s, m);
        return; // 2.6: friends, DMs, blocks
      },
    ],
    [
      'trade2',
      /**
       * Conducts secure station-to-station cargo and credit trade between captains.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.coop.tradeOp(s, m);
        return; // 2.6: trading between stations
      },
    ],
    [
      'duel',
      /**
       * Initiates or accepts formal non-lethal captain duel challenge.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.coop.duelOp(s, m);
        return; // 2.6: agreed duels
      },
    ],
    [
      'goal',
      /**
       * Claims milestone reward for faction war front goal.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.fronts.claimGoal(s, m);
        return;
      },
    ],
    [
      'store',
      /**
       * Purchases items from faction front milestone store.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.fronts.storeBuy(s, m);
        return;
      },
    ],
    [
      'colony',
      /**
       * Dispatches frontier planet colonization and outpost development operations.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.frontier.colonyOp(s, m);
        return;
      },
    ],
    [
      'arena',
      /**
       * Enters matchmaking queue or manages combat arena operations.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.frontier.arenaOp(s, m);
        return;
      },
    ],
    [
      'exchange',
      /**
       * Exchanges faction victory tokens and currencies.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.frontier.exchangeOp(s, m);
        return;
      },
    ],
    [
      'boards',
      /**
       * Requests community competitive leaderboard data.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.send(s, {
          t: 'boards',
          cat: m.cat,
          list: c.features.frontier.leaderboard(m.cat),
        });
        return;
      },
    ],
    [
      'profile',
      /**
       * Requests public captain career and combat profile.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.send(s, { t: 'profile', p: c.features.frontier.profile(m.name) });
        return;
      },
    ],
    [
      'ping',
      /**
       * Responds to client latency measurement ping with pong.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.send(s, { t: 'pong', c: m.c });
        return;
      },
    ],
    [
      'hail',
      /**
       * Initiates radio comms hail to target stellar or ship.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hail.hail(s, m);
        return; // 1.1
      },
    ],
    ['hailin', (s, m) => c.hails.request(s, m)],
    [
      'hailopt',
      /**
       * Selects dialogue conversation choice during active radio hail.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.hail.hailOpt(s, m);
        return;
      },
    ],
    [
      'order',
      /**
       * Issues fleet command order to escort wingmates.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        if (s.ent) {
          if (m.o === 'attack' && s.ent.order !== 'attack')
            c.combatAssist.attack(s, c.spaces[s.data.sys]);
          else c.combatAssist.stop(s, 'Fleet order');
        }
        c.features.fleetcmd.fleetOrder(s, m.o);
        return;
      },
    ],
    [
      'jettison',
      /**
       * Jettisons cargo into space to lighten ship or distract raiders.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.fleetcmd.jettison(s, m.cid, m.n | 0, m.lots);
        return;
      },
    ],
    [
      'rivals',
      /**
       * Requests status payload of active AI rival captains.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        const d = s.data;
        c.send(s, { t: 'rivals', list: c.features.rivals.rivalsPayload(d) });
        return;
      },
    ],
    [
      'bm',
      /**
       * Purchases illicit contraband from syndicate black market.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.syndicate.bmBuy(s, m.id);
        return;
      },
    ],
    [
      'arcacc',
      /**
       * Accepts faction campaign story arc.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.arcs.arcAccept(s, m.fac);
        return; // 1.2
      },
    ],
    [
      'promote',
      /**
       * Claims syndicate crime tier promotion.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.syndicate.promote(s, m.id);
        return;
      },
    ],
    [
      'lower',
      /**
       * Dispatches lower deck syndicate crew operations.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.syndicate.lowerDeck(s, m);
        return;
      },
    ],
    [
      'bank',
      /**
       * Performs Syndicate bank loan borrowing and repayment.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        c.features.syndicate.bankOp(s, m);
        return;
      },
    ],
    [
      'pause',
      /**
       * Toggles solo play game pause state.
       * @param {Session} s Player session.
       * @param {import("./message-registry.js").NetworkMessage} m Message payload.
       */
      (s, m) => {
        if (c.solo && [...c.sessions.values()].filter((x) => x.data).length === 1) {
          c.setPaused(!c.paused);
          c.send(s, { t: 'paused', on: c.paused });
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
