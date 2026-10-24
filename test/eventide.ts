import type { Entity } from '../server/game.ts';
import { mockSession, mockPlayerData, mockMission } from './helpers/mocks.ts';
import type { StarSystem } from '../shared/galaxy.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Authored v2.9 topology, old-save compatibility and normal mission lifecycle.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SYSTEMS, SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { EVENTIDE, EVENTIDE_LINKS, eventideDrain, eventidePulse } from '../shared/eventide.ts';
import { Game } from '../server/game.ts';
import { DT as simulationStepSeconds } from '../shared/rules.ts';
import { DB as Database } from '../server/db.ts';

const identifiers = new Set(EVENTIDE.map((session) => session.id));
assert.equal(SYSTEMS.length, 217);
assert.equal(identifiers.size, 6);
assert.equal(new Set(SYSTEMS.map((starSystem) => starSystem.id)).size, SYSTEMS.length);
assert.equal(
  new Set(SYSTEMS.flatMap((starSystem) => starSystem.stellars.map((player) => player.id))).size,
  Object.keys(STELLARS).length,
);
// Golden source: untouched v2.8.3 generation, normalized ONLY for intentional Terra display text.
// Scenes and the one new Vesper branch are additions; every legacy generated property stays exact.
const legacy: StarSystem[] = JSON.parse(
  JSON.stringify(SYSTEMS.filter((starSystem) => !starSystem.eventide)),
);
for (const starSystem of legacy) {
  // v3.0.4 changes only this display name; retain the strict legacy-world golden.
  if (starSystem.id === 'qgate') {
    assert.equal(starSystem.name, 'Concordia');
    starSystem.name = 'Quantum Gate';
  }
  delete starSystem.scene;
  // Mining3.0 intentionally adds only four processed-good price entries; compare
  // every legacy property/price exactly against the existing generation golden.
  for (const stellarBody of starSystem.stellars)
    for (const identifier of [
      'alloy_ingots',
      'fuel_cells',
      'cut_crystal',
      'composite_plating',
      'plasma',
      'quantum_fuel',
      'exotic_matter',
    ])
      if (stellarBody.prices) delete stellarBody.prices[identifier];
  // v2.9.2 deliberately moves only the Far Gateway; preserve the generation golden.
  for (const stellarBody of starSystem.stellars)
    if (stellarBody.id === 'coldharbor-gate') {
      stellarBody.x = 600;
      stellarBody.y = 600;
    }
  starSystem.links = starSystem.links.filter((identifier: string) => !identifiers.has(identifier));
}
// Reverse only the authored Gateway relocation and two lore descriptions for
// this pre-existing generation golden. Transit and new descriptions have their
// own behavior checks; generated worlds, prices and RNG remain under this hash.
const legacySol = legacy.find((system) => system.id === 'sol')!;
const legacyConcordia = legacy.find((system) => system.id === 'qgate')!;
const legacyColdharbor = legacy.find((system) => system.id === 'coldharbor')!;
const legacyGateway = legacyConcordia.stellars.find((stellar) => stellar.id === 'sol-gateway')!;
legacyConcordia.stellars = legacyConcordia.stellars.filter((stellar) => stellar !== legacyGateway);
delete legacyConcordia.gate;
legacy[legacy.indexOf(legacySol)] = Object.fromEntries(
  Object.entries(legacySol).flatMap(([key, value]) =>
    key === 'sol'
      ? [
          ['gate', 'coldharbor'],
          [key, value],
        ]
      : [[key, value]],
  ),
) as StarSystem;
legacyGateway.name = 'The Sol Gateway';
legacyGateway.x = -700;
legacyGateway.y = -520;
legacyGateway.desc =
  'A stable wormhole that opened beyond the orbit of Neptune. The far side is somewhere off the edge of every chart.';
legacySol.stellars.push(legacyGateway);
legacySol.stellars.find((stellar) => stellar.id === 'luna')!.desc =
  'The old lunar shipyards, now a customs station watching over the Gateway.';
legacyColdharbor.gate = 'sol';
const legacyFarGateway = legacyColdharbor.stellars.find(
  (stellar) => stellar.id === 'coldharbor-gate',
)!;
legacyFarGateway.wormhole = 'sol';
legacyFarGateway.desc = 'The far mouth of the Sol Gateway. Through it, faintly, the light of home.';
for (const system of legacy)
  for (const stellar of system.stellars)
    if (
      stellar.desc ===
      'Grey seas and long twilights. The settlers here came through the Gateway three generations ago and never looked back.'
    )
      stellar.desc =
        'Grey seas and long twilights. The settlers here do not talk about how they arrived.';
for (const systemId of Object.values(legacy))
  if (systemId.fields) systemId.fields = systemId.fields.filter((feature) => !feature.industrial);
assert.equal(
  createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
  '2eb244aab8a9987f780b6bd0fc318ee7845e716351369fd4602a9336ce0bee25',
);
for (const [firstText, secondText] of EVENTIDE_LINKS) {
  assert.ok(systemsById[firstText].links.includes(secondText));
  assert.ok(systemsById[secondText].links.includes(firstText));
}
const reached = new Set(['vesper-gate']),
  queue = ['vesper-gate'];
while (queue.length)
  for (const quantity of systemsById[requiredFixtureValue(queue.shift())].links)
    if (!reached.has(quantity)) {
      reached.add(quantity);
      queue.push(quantity);
    }
for (const entity of EVENTIDE) {
  assert.ok(reached.has(entity.id));
  assert.ok(STELLARS[entity.port.id]);
  assert.ok(requiredFixtureValue(entity.port.svc).includes('B'));
  assert.ok(requiredFixtureValue(entity.port.svc).includes('L'));
  assert.ok(systemsById[entity.id].farside);
}
const hull = requiredFixtureValue(requiredFixtureValue(systemsById.reliquary.scene).hazard);
assert.equal(eventidePulse(hull, 0), 'active');
assert.equal(eventidePulse(hull, 4), 'quiet');
assert.equal(eventidePulse(hull, 15), 'warning');
assert.equal(eventidePulse(hull, 18), 'active');
assert.equal(
  eventideDrain(
    systemsById.reliquary,
    { state: 'fly', x: requiredFixtureValue(hull).x, y: requiredFixtureValue(hull).y },
    1,
  ),
  24,
);
assert.equal(
  eventideDrain(
    systemsById.reliquary,
    { state: 'fly', x: requiredFixtureValue(hull).x, y: requiredFixtureValue(hull).y },
    10,
  ),
  0,
);
for (const stellarBody of systemsById.reliquary.stellars)
  assert.ok(
    Math.hypot(
      stellarBody.x - requiredFixtureValue(hull).x,
      stellarBody.y - requiredFixtureValue(hull).y,
    ) >
      requiredFixtureValue(hull).r + stellarBody.r + 200,
    'stable ports outside radiation pocket',
  );
for (const identifier of ['meridian', 'gloam', 'slagforge'])
  assert.ok(systemsById[identifier].scene, 'authored main-galaxy scenery');

const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-eventide-'));
try {
  const assets = JSON.parse(
      filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
    ),
    database = new Database(directory),
    game = new Game(assets, database);
  const playerData = mockPlayerData(game.fresh());
  playerData.name = 'Eventide Regression';
  playerData.tut = 999;
  playerData.credits = 1000000;
  const session = mockSession({
    id: 9876,
    name: playerData.name,
    data: playerData,
    sock: { open: true, backlog: 0, send: () => {} },
  });
  game.sessions.set(session.id, session);
  const lifecycle = [];
  for (const expected of EVENTIDE) {
    playerData.sys = expected.id;
    playerData.stellar = expected.port.id;
    const offers = game.offers(STELLARS[playerData.stellar], playerData),
      supply = offers.find(
        (options) => options.id.startsWith('eventide-') && options.type === 'cargo',
      ),
      rescue = offers.find(
        (mission) => mission.id.startsWith('eventide-') && mission.type === 'rescue',
      );
    assert.ok(supply && rescue, expected.id + ' has supply and rescue work');
    assert.notEqual(supply.dest, playerData.stellar);
    game.accept(session, supply.id);
    assert.ok(
      playerData.missions.some((message) => message.id === supply.id),
      'authoritative board accepts cargo',
    );
    database.create(playerData.name, 'test', playerData);
    database.flush();
    const saved = new Database(directory).get(playerData.name);
    assert.equal(
      requiredFixtureValue(
        requiredFixtureValue(saved).missions.find((mission) => mission.id === supply.id),
      ).dest,
      supply.dest,
    );
    const credits = playerData.credits;
    playerData.sys = requiredFixtureValue(supply.sys);
    playerData.stellar = requiredFixtureValue(supply.dest);
    game.completeOnLanding(session, STELLARS[requiredFixtureValue(supply.dest)]);
    assert.ok(!playerData.missions.some((mission) => mission.id === supply.id));
    assert.ok(playerData.credits >= credits + supply.reward);
    // Survey stages remain generated by the existing expedition loop; persisted stages keep their references.
    playerData.sys = expected.id;
    playerData.stellar = expected.port.id;
    const expected2 = game.features.arcs.expeditionOffer(STELLARS[playerData.stellar], playerData);
    assert.ok(identifiers.has(requiredFixtureValue(expected2).sys));
    assert.ok(identifiers.has(requiredFixtureValue(expected2).exp.b));
    playerData.missions.push(mockMission({ ...expected2, done: true, owner: session.id }));
    game.completeOnLanding(session, STELLARS[playerData.stellar]);
    const stage2 = playerData.missions.find((mission) => mission.exp?.stage === 2);
    assert.ok(stage2);
    assert.ok(identifiers.has(stage2.sys));
    database.create(playerData.name, 'test', playerData);
    database.flush();
    assert.equal(
      requiredFixtureValue(
        requiredFixtureValue(new Database(directory).get(playerData.name)).missions.find(
          (mission) => mission.exp?.stage === 2,
        ),
      ).sys,
      stage2.sys,
    );
    stage2.done = true;
    game.completeOnLanding(session, STELLARS[playerData.stellar]);
    const result = playerData.missions.find((mission) => mission.exp?.stage === 3);
    if (result) game.completeOnLanding(session, STELLARS[requiredFixtureValue(result.dest)]);
    assert.equal(playerData.expd.n, lifecycle.length + 1);
    assert.ok(playerData.missions.every((mission) => !mission.exp));
    lifecycle.push({ system: expected.id, supply: supply.id, expedition: playerData.expd.n });
  }
  // Authored rescue uses the normal disabled-ship spawn/boarding/payment path.
  playerData.sys = 'lantern-twins';
  playerData.stellar = 'twins-exchange';
  const rescue = game
    .offers(STELLARS[playerData.stellar], playerData)
    .find((mission) => mission.eventide && mission.type === 'rescue');
  game.accept(session, requiredFixtureValue(rescue).id);
  playerData.sys = requiredFixtureValue(requiredFixtureValue(rescue).sys);
  playerData.stellar = null;
  game.spawnPlayer(session, -1100, 900, 0, 0);
  const rescueSpace = game.spaces[playerData.sys];
  game.features.fronts.missionArrive(session, rescueSpace);
  const wreck = [...rescueSpace.ships.values()].find(
    (shipEntity) => shipEntity.rescueOf?.id === requiredFixtureValue(rescue).id,
  );
  assert.ok(wreck?.disabled);
  assert.deepEqual([wreck.x, wreck.y], requiredFixtureValue(rescue).rescuePoint);
  requiredFixtureValue(session.ent).x = wreck.x + 30;
  requiredFixtureValue(session.ent).y = wreck.y;
  requiredFixtureValue(session.ent).vx = wreck.vx;
  requiredFixtureValue(session.ent).vy = wreck.vy;
  game.features.hangar.board(session, { id: wreck.id, act: 'rescue' });
  assert.ok(
    requiredFixtureValue(
      playerData.missions.find((mission) => mission.id === requiredFixtureValue(rescue).id),
    ).done,
    'real boarding completes authored rescue',
  );
  const paidAt = systemsById[playerData.sys].stellars.find((stellarBody) =>
    requiredFixtureValue(stellarBody.svc).includes('L'),
  );
  rescueSpace.remove(requiredFixtureValue(session.ent));
  session.ent = null;
  playerData.stellar = requiredFixtureValue(paidAt).id;
  const rescueCredits = playerData.credits;
  game.completeOnLanding(session, STELLARS[requiredFixtureValue(paidAt).id]);
  assert.ok(playerData.credits >= rescueCredits + requiredFixtureValue(rescue).reward);
  assert.ok(!playerData.missions.some((mission) => mission.id === requiredFixtureValue(rescue).id));
  // Actual live simulation applies bounded environmental shield drain, never hull damage.
  playerData.sys = 'reliquary';
  playerData.stellar = null;
  game.spawnPlayer(session, requiredFixtureValue(hull).x, requiredFixtureValue(hull).y, 0, 0);
  const pulseSpace = game.spaces.reliquary;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const shipEntity of [...pulseSpace.ships.values()])
    if (shipEntity !== session.ent) pulseSpace.remove(shipEntity);
  pulseSpace.spawnT = 9999;
  const shipEntity = requiredFixtureValue<Entity>(session.ent);
  requiredFixtureValue(shipEntity).x = requiredFixtureValue(hull).x;
  requiredFixtureValue(shipEntity).y = requiredFixtureValue(hull).y;
  requiredFixtureValue(shipEntity).vx = requiredFixtureValue(shipEntity).vy = 0;
  requiredFixtureValue(shipEntity).st.shieldRe = 0;
  const wallNow = Date.now;
  try {
    Date.now = () => 18000;
    requiredFixtureValue(shipEntity).shield = 35;
    const armor = requiredFixtureValue(shipEntity).armor;
    pulseSpace.tick();
    assert.ok(
      Math.abs(requiredFixtureValue(shipEntity).shield - (35 - 24 * simulationStepSeconds)) < 1e-8,
    );
    requiredFixtureValue(shipEntity).shield = 0;
    pulseSpace.tick();
    assert.equal(requiredFixtureValue(shipEntity).armor, armor);
    Date.now = () => 25000;
    requiredFixtureValue(shipEntity).shield = 35;
    pulseSpace.tick();
    assert.equal(requiredFixtureValue(shipEntity).shield, 35);
  } finally {
    Date.now = wallNow;
  }
  pulseSpace.remove(requiredFixtureValue(shipEntity));
  session.ent = null;
  // Existing save counts retain the survey order; new recoveries use the fixed hulk.
  playerData.sys = 'coldharbor';
  playerData.stellar = systemsById.coldharbor.stellars[0].id;
  playerData.expd.n = 0;
  const previousState = game.features.arcs.expeditionOffer(
    STELLARS[playerData.stellar],
    playerData,
  );
  assert.equal(requiredFixtureValue(previousState).sys, 'mirrorfall');
  assert.equal(requiredFixtureValue(previousState).exp.b, 'aureole');
  console.log(
    JSON.stringify(
      {
        systems: SYSTEMS.length,
        legacyStable: true,
        lifecycle,
        hazard: 'bounded shield-only, safe docks',
      },
      null,
      2,
    ),
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}

process.exit(0);
