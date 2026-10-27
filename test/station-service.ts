import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import type { Session } from '../server/game.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import type { GameAssets } from '../shared/rules.ts';
import * as galaxy from '../shared/galaxy.ts';
import { credits, researchBonus } from '../shared/rules.ts';
import { TIER3_TRUCE } from '../shared/hostile.ts';
import { planTake, applyTake } from '../shared/cargo-lots.ts';
import { FixtureSocket } from './helpers/refinery-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

// Exact Game.station method at 4e4ecde, including its Personal Station log correction.
// It executes with the legacy receiver,
// independent of the extracted factory's capability wiring and implementation.
const source = filesystem.readFileSync(
  new URL('./fixtures/ownership/station-before.txt', import.meta.url),
  'utf8',
);
const legacy: { station: (this: Game, session: Session, message: NetworkMessage) => void } =
  vm.runInNewContext(stripTypeScriptTypes('({' + source + '})'), {
    ...galaxy,
    systemsById: galaxy.SYS,
    operationLevels: galaxy.OPS,
    credits,
    researchBonus,
    TIER3_TRUCE,
    planTake,
    applyTake,
    Date,
    Math,
  });
const originalNow = Date.now,
  originalRandom = Math.random;
const currentTime = 1_800_000_000_000;
Date.now = () => currentTime;
Math.random = () => 0.25;
try {
  function run(before: boolean, scenario: string) {
    const assets: GameAssets = JSON.parse(
      filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
    );
    const database = new DB(tempDataDir('rift-station-owner-'));
    const game = new Game(assets, database, {
      seedDefinitions: [],
      automaticClock: false,
      defer: () => {},
      randomUUID: () => 'station-owner-fixture',
    });
    const socket = new FixtureSocket();
    game.connect(socket, 'fixture');
    const session = [...game.sessions.values()][0];
    game.onMessage(session, { t: 'hello', name: 'Station Captain', pass: 'fixture' });
    const player = session.data;
    database.get(player.name)!.salt = 'synthetic-salt';
    database.get(player.name)!.hash = 'synthetic-hash';
    player.credits = 1e8;
    player.tut = 999;
    session.ent = null;
    player.stellar = 'site-qgate';
    player.sys = galaxy.STELLARS[player.stellar].system;
    Object.assign(player.station, {
      claimed: true,
      site: player.stellar,
      ops: 2,
      refUnits: 0,
      refT: currentTime,
      active: null,
      done: [],
      queue: [],
    });
    for (const material of galaxy.MATERIALS) player.mats[material] = [999, 999, 999, 999, 999];
    database.world.sites[player.stellar] = database.key(player.name);
    const trace: unknown[][] = [];
    const checkStation = game.checkStation.bind(game),
      you = game.you.bind(game),
      landed = game.landed.bind(game);
    const toast = game.toast.bind(game),
      pushSites = game.pushSites.bind(game),
      log = game.log.bind(game);
    game.checkStation = (account) => {
      trace.push(['timers']);
      checkStation(account);
    };
    game.you = (target) => {
      trace.push(['you']);
      you(target);
    };
    game.landed = (target) => {
      trace.push(['landed']);
      landed(target);
    };
    game.toast = (target, text) => {
      trace.push(['toast', text]);
      toast(target, text);
    };
    game.log = (account, text) => {
      trace.push(['log', text]);
      log(account, text);
    };
    game.pushSites = () => {
      trace.push(['sites']);
      pushSites();
    };
    const message: NetworkMessage = { t: 'station', op: scenario };
    if (scenario === 'claim') {
      player.station.site = undefined;
      player.station.claimed = false;
      delete database.world.sites[player.stellar];
    } else if (scenario === 'claim-occupied') {
      message.op = 'claim';
    } else if (scenario === 'claim-port') {
      message.op = 'claim';
      player.stellar = 'qstation';
    } else if (scenario === 'upgrade-denied') {
      message.op = 'upgrade';
      player.credits = 0;
    } else if (scenario === 'process' || scenario === 'process-denied') {
      message.op = 'process';
      message.id = 'ore';
      message.all = true;
      player.cargo = { ore: 24 };
      player.cargoLots = { version: 1, byCommodity: { ore: { common: 12, rich: 12, pure: 0 } } };
      if (scenario === 'process-denied') message.lots = { common: 99, rich: 0, pure: 0 };
    } else if (scenario === 'collect') {
      player.station.refUnits = 3;
    } else if (scenario === 'research') {
      message.id = galaxy.RESEARCH.find((node) => node.ops <= 2 && !node.needs)!.id;
    } else if (scenario === 'research-queue') {
      message.op = 'research';
      message.id = 'fixture-next';
      player.station.active = { id: 'fixture-current', ends: currentTime + 100000 };
      game.features = {
        ...game.features,
        hangar: {
          ...game.features.hangar,
          queueResearch: (_session, id) => {
            trace.push(['new-queue-provider', id]);
          },
        },
      };
    } else if (scenario === 'unqueue') {
      message.id = 'fixture-one';
      player.station.queue = ['fixture-one', 'fixture-two'];
    } else if (scenario === 'defense') {
      game.features = {
        ...game.features,
        frontier: {
          ...game.features.frontier,
          defenseUpgrade: () => {
            trace.push(['new-defense-provider']);
          },
        },
      };
    } else if (scenario === 'refine') {
      message.mat = 'alloy';
      message.g = 1;
      message.n = 2;
      game.features = {
        ...game.features,
        hangar: {
          ...game.features.hangar,
          refineUp: (_session, material, grade, count) => {
            trace.push(['new-refine-provider', material, grade, count]);
          },
        },
      };
    } else if (scenario === 'relocate' || scenario === 'relocate-denied') {
      message.op = 'relocate';
      message.site = 'site-halcyon';
      session.trade = 'fixture-trade';
      session.retaliationVisit = { sys: player.sys, factions: new Set(['fixture']) };
      game.features = {
        ...game.features,
        coop: {
          ...game.features.coop,
          tradeCancel: (id, reason) => {
            trace.push(['new-trade-provider', id, reason, player.credits, player.station.site]);
          },
        },
      };
      if (scenario === 'relocate-denied') player.station.relocT = currentTime;
    } else if (scenario === 'flying-denied') {
      player.stellar = null;
    } else if (scenario === 'live-database') {
      const replacement = new DB(tempDataDir('rift-station-replaced-db-'));
      replacement.players = database.players;
      replacement.world = structuredClone(database.world);
      replacement.world.sites = {};
      game.db = replacement;
      message.op = 'claim';
      player.station.site = undefined;
      player.station.claimed = false;
    }
    const currentDatabase = game.db;
    currentDatabase.touch();
    currentDatabase.flush();
    const dirty = currentDatabase.touch.bind(currentDatabase);
    currentDatabase.touch = () => {
      trace.push(['dirty']);
      dirty();
    };
    currentDatabase.dirty = false;
    socket.out.length = 0;
    const stationIdentity = player.station;
    if (before) legacy.station.call(game, session, message);
    else game.station(session, message);
    assert.equal(
      player.station,
      stationIdentity,
      'The existing station object is mutated in place',
    );
    const after = JSON.parse(
      JSON.stringify({
        player,
        sites: currentDatabase.world.sites,
        trace,
        packets: socket.out,
        dirty: currentDatabase.dirty,
        retaliation: session.retaliationVisit,
        oldSites: database.world.sites,
      }),
    );
    currentDatabase.flush();
    const restarted = new DB((currentDatabase as DB).dir);
    assert.equal(
      restarted.get(player.name)!.credits,
      player.credits,
      'Same store checkpoints exact settlement',
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(restarted.get(player.name)!.station)),
      JSON.parse(JSON.stringify(player.station)),
    );
    return after;
  }
  for (const scenario of [
    'claim',
    'claim-occupied',
    'claim-port',
    'upgrade',
    'upgrade-denied',
    'process',
    'process-denied',
    'collect',
    'research',
    'research-queue',
    'unqueue',
    'defense',
    'refine',
    'relocate',
    'relocate-denied',
    'flying-denied',
    'live-database',
    'refit',
    'hire',
  ]) {
    assert.deepEqual(
      run(false, scenario),
      run(true, scenario),
      scenario + ': independent before/after state, settlement and effects',
    );
  }
  console.log(
    'Station service: independent before/after traces for 19 actions/denials, live providers/database, exact settlement and checkpoint reopen passed.',
  );
} finally {
  Date.now = originalNow;
  Math.random = originalRandom;
}
