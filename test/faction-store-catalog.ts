// Faction stores: store-only outfits install on purchase and never appear at outfitters;
// star charts reveal a faction's systems; fog of war limits what the map and routes show.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { makeLoadout, shipStats, type GameAssets } from '../shared/rules.ts';
import { FACTIONS, STELLARS, SYS, SYSTEMS } from '../shared/galaxy.ts';
import { FACTION_STORE_OUTFITS } from '../shared/faction-outfits.ts';
import { factionStoreListings, starChartListing } from '../shared/faction-store-catalog.ts';
import { chartSystems, knownRoute, laneKnown, mapKnowledge } from '../shared/map-knowledge.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';

// ---- catalogue: three store-only outfits for every faction that runs a store
process.env.SEEDS_FILE = '/nonexistent';
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-store-'));
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(directory));
const storeFactions = [
  ...new Set(
    SYSTEMS.flatMap((system) =>
      system.stellars
        .map((body) => game.features.fronts.storeFor(STELLARS[body.id]))
        .filter((faction): faction is string => !!faction),
    ),
  ),
].sort();
assert.ok(storeFactions.length >= 10, 'every public faction store is covered');
for (const faction of storeFactions) {
  const outfits = FACTION_STORE_OUTFITS.filter((outfit) => outfit.faction === faction);
  assert.equal(outfits.length, 3, `${faction} store sells three specialised outfits`);
  assert.ok(
    outfits.some((outfit) => outfit.eff?.weapon),
    `${faction} store has a signature weapon`,
  );
  for (const outfit of outfits) {
    assert.ok(game.O[outfit.id], `${outfit.name} is a real outfit`);
    if (outfit.eff?.weapon) assert.ok(game.A.weapons[outfit.eff.weapon], `${outfit.name} fires`);
    assert.ok(
      filesystem.existsSync(new URL(`../client/assets/${outfit.icon}`, import.meta.url)),
      `${outfit.name} has an icon`,
    );
  }
  const listings = factionStoreListings(faction).map((listing) => listing.id);
  assert.ok(listings.includes('chart'), `${faction} store sells its star chart`);
}
// Store-only outfits never appear at any outfitter, including an owned Personal Station.
const storeOnly = new Set(FACTION_STORE_OUTFITS.map((outfit) => outfit.id));
for (const body of Object.values(STELLARS)) {
  const stock = game.outfitter(body) || [];
  assert.ok(
    stock.every((id) => !storeOnly.has(id)),
    `${body.name} outfitter does not stock store-only outfits`,
  );
}

// ---- real store purchases through the message switchboard
const socket = legacySocket();
socket.open = true;
socket.backlog = 0;
socket.send = () => {};
socket.close = () => {};
game.connect(socket, '127.0.0.1');
socket.emit('message', JSON.stringify({ t: 'hello', name: 'Store Pilot', pass: 'secret' }));
const session = requiredFixtureValue([...game.sessions.values()].at(-1));
const playerData = session.data;
const send = (message: Record<string, unknown>) => socket.emit('message', JSON.stringify(message));
playerData.tut = 999;
playerData.stellar = 'meridian-yards';
playerData.sys = STELLARS[playerData.stellar].system;
session.ent = null;
assert.equal(game.features.fronts.storeFor(STELLARS[playerData.stellar]), 'quantum');
playerData.credits = 5_000_000;
playerData.tokens = { quantum: 200 };
playerData.rep.quantum = 100;

// Star chart: every Concord system becomes known, once.
const concord = chartSystems(SYS, 'quantum');
const chartPrice = starChartListing('quantum').credits;
let credits = playerData.credits;
send({ t: 'store', fac: 'quantum', id: 'chart' });
assert.deepEqual([...(playerData.charted || [])].sort(), concord, 'chart reveals Concord space');
assert.equal(playerData.credits, credits - chartPrice);
assert.deepEqual(
  game.playerPayload(session, playerData, game.features.shipStats.stats(playerData)).charted,
  playerData.charted,
  'payload carries charts',
);
credits = playerData.credits;
const tokensBefore = playerData.tokens.quantum;
send({ t: 'store', fac: 'quantum', id: 'chart' });
assert.equal(playerData.credits, credits, 'a chart you already hold is not sold twice');
assert.equal(playerData.tokens.quantum, tokensBefore);

// Store outfit: installed straight onto the ship.
const lance = FACTION_STORE_OUTFITS.find(
  (outfit) => outfit.faction === 'quantum' && outfit.eff?.weapon,
)!;
const plating = FACTION_STORE_OUTFITS.find(
  (outfit) => outfit.faction === 'quantum' && outfit.eff?.armor,
)!;
// Give the ship room for a turret.
playerData.ship = { ...playerData.ship, hull: 736, outfits: {} };
playerData.ship.stockOutfits = {};
credits = playerData.credits;
send({ t: 'store', fac: 'quantum', id: 'outfit-' + plating.id });
assert.equal(playerData.ship.outfits[plating.id], 1, 'store outfit is installed');
assert.equal(playerData.credits, credits - plating.cost);
// A second copy exceeds max 1: refused before anything is spent.
credits = playerData.credits;
const tokensNow = playerData.tokens.quantum;
send({ t: 'store', fac: 'quantum', id: 'outfit-' + plating.id });
assert.equal(playerData.ship.outfits[plating.id], 1);
assert.equal(playerData.credits, credits, 'refused install keeps credits');
assert.equal(playerData.tokens.quantum, tokensNow, 'refused install keeps tokens');
// Standing gate: the signature weapon needs Honored.
playerData.rep.quantum = lance.rep - 1;
send({ t: 'store', fac: 'quantum', id: 'outfit-' + lance.id });
assert.ok(!playerData.ship.outfits[lance.id], 'standing gates the signature weapon');
// Another faction's outfit is not sold here.
const foreign = FACTION_STORE_OUTFITS.find((outfit) => outfit.faction === 'korrund')!;
send({ t: 'store', fac: 'quantum', id: 'outfit-' + foreign.id });
assert.ok(!playerData.ship.outfits[foreign.id], 'faction outfits stay in their own store');
// Store outfits sell back at an ordinary outfitter.
credits = playerData.credits;
game.outfit(session, plating.id, -1);
assert.ok(!playerData.ship.outfits[plating.id], 'store outfit sells at an outfitter');
assert.ok(playerData.credits > credits);

// Every faction's three outfits are bought through the real message route.
for (const faction of storeFactions) {
  const port = Object.values(STELLARS).find(
    (body) => game.features.fronts.storeFor(body) === faction,
  )!;
  playerData.stellar = port.id;
  playerData.sys = port.system;
  playerData.rep[faction] = 100;
  playerData.tokens![faction] = 200;
  for (const outfit of FACTION_STORE_OUTFITS.filter((entry) => entry.faction === faction)) {
    playerData.ship = {
      ...makeLoadout(game.A, 736),
      outfits: {},
      stockOutfits: {},
      fixed: [],
      bonusSpace: 0,
    };
    playerData.credits = 5_000_000;
    const tokenBalance: number = playerData.tokens![faction];
    send({ t: 'store', fac: faction, id: 'outfit-' + outfit.id });
    assert.equal(playerData.ship.outfits[outfit.id], 1, outfit.name + ' installs');
    assert.equal(playerData.credits, 5_000_000 - outfit.cost, outfit.name + ' credit price');
    assert.equal(
      playerData.tokens![faction],
      tokenBalance - outfit.tokens,
      outfit.name + ' token price',
    );
    if (outfit.eff?.weapon) {
      assert.equal(
        game.features.shipStats.stats(playerData)!.weapons[outfit.eff.weapon],
        1,
        outfit.name + ' equips its weapon',
      );
    }
  }
}
// Reserve cells advertise their actual fuel effect, not the unused legacy multiJump field.
const plainHauler = { ...makeLoadout(game.A, 704), outfits: {}, stockOutfits: {}, fixed: [] };
const baseFuel = shipStats(game.A, plainHauler)!.fuel;
for (const [id, extraFuel] of [
  [9203, 100],
  [9233, 150],
]) {
  const fitted = shipStats(game.A, { ...plainHauler, outfits: { [id]: 1 } })!;
  assert.equal(fitted.fuel, baseFuel + extraFuel);
}
// Full outfit space and full turret mounts refuse before spending either currency.
playerData.stellar = 'meridian-yards';
playerData.sys = STELLARS[playerData.stellar].system;
playerData.rep.quantum = 100;
playerData.tokens!.quantum = 100;
playerData.credits = 5_000_000;
playerData.ship = {
  ...makeLoadout(game.A, 704),
  outfits: {},
  stockOutfits: {},
  fixed: [],
  bonusSpace: 0,
};
playerData.ship.bonusSpace = -game.features.shipStats.stats(playerData)!.free;
for (const blocked of ['space', 'turret']) {
  if (blocked === 'turret') playerData.ship = makeLoadout(game.A, 704);
  const before: string = JSON.stringify({
    ship: playerData.ship,
    credits: playerData.credits,
    tokens: playerData.tokens,
  });
  send({ t: 'store', fac: 'quantum', id: 'outfit-' + lance.id });
  assert.equal(
    JSON.stringify({
      ship: playerData.ship,
      credits: playerData.credits,
      tokens: playerData.tokens,
    }),
    before,
    blocked + ' denial preserves resources',
  );
}
game.db.flush();
const restored = new Database(directory).get('Store Pilot')!;
assert.deepEqual(restored.charted, playerData.charted, 'purchased chart survives a real DB reopen');

// ---- fog of war rules
const start = 'qgate';
const fresh = mapKnowledge(SYS, { explored: [start] });
assert.ok(fresh.known.has(start));
for (const link of SYS[start].links) assert.ok(fresh.visible.has(link), 'neighbours are named');
const twoAway = SYS[SYS[start].links[0]].links.find(
  (id) => id !== start && !SYS[start].links.includes(id),
)!;
assert.ok(!fresh.visible.has(twoAway), 'systems beyond your neighbours are hidden');
assert.ok(laneKnown(fresh, { explored: [start] }, start, SYS[start].links[0]));
assert.ok(
  !laneKnown(fresh, { explored: [start] }, SYS[start].links[0], twoAway),
  'lanes beyond your neighbours are hidden',
);
// One hop into the unknown is allowed; chained jumps through unvisited space are not.
assert.deepEqual(knownRoute(SYS, fresh, start, SYS[start].links[0]), [SYS[start].links[0]]);
assert.deepEqual(knownRoute(SYS, fresh, start, twoAway), [], 'no autojump through unvisited space');
const visited = { explored: [start, SYS[start].links[0]] };
assert.equal(knownRoute(SYS, mapKnowledge(SYS, visited), start, twoAway).length, 2);
// A star chart makes faction space routable without visiting it.
const charted = { explored: [start], charted: concord };
const chartedKnowledge = mapKnowledge(SYS, charted);
const farConcord = concord.find(
  (id) =>
    knownRoute(SYS, fresh, start, id).length === 0 &&
    knownRoute(SYS, chartedKnowledge, start, id).length > 1,
);
assert.ok(farConcord, 'a chart opens routes into Concord space that were unknown before');
// The Gateway and its far mouth stay hidden until you have flown through it.
const gateway = SYSTEMS.find((system) => system.gate)!;
const nearOnly = { explored: [gateway.id] };
assert.ok(!mapKnowledge(SYS, nearOnly).visible.has(gateway.gate!), 'the far mouth starts hidden');
assert.deepEqual(knownRoute(SYS, mapKnowledge(SYS, nearOnly), gateway.id, gateway.gate!), []);
const through = { explored: [gateway.id, gateway.gate!] };
const throughKnowledge = mapKnowledge(SYS, through);
assert.ok(throughKnowledge.visible.has(gateway.gate!), 'going through reveals the far mouth');
assert.ok(laneKnown(throughKnowledge, through, gateway.id, gateway.gate!), 'and the dashed lane');
assert.ok(FACTIONS.quantum, 'Concord store exists');

filesystem.rmSync(directory, { recursive: true, force: true });
console.log('Faction store outfits, star charts and fog-of-war routing passed.');
process.exit(0);
