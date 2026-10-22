import { mockPlayerReference } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.8 tests: the Sol Gateway (Sol, Earth, the wormhole, the Farside region), ship roles, specialty ships, parts and tiers.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import {
  SYS as systemsById,
  STELLARS,
  SYSTEMS,
  FACTION_HULLS,
  COMMON_HULLS,
} from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v08-')));
export const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
let ipAddress = 1;
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '9.9.9.' + ipAddress++);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
    all: (messageType2: string) =>
      legacySocket2.out.filter((message) => message.t === messageType2),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
// --- Sol Gateway
const starSystem = systemsById.sol,
  xScale = SYSTEMS.filter((starSystem2) => !starSystem2.farside).map(
    (starSystem2) => starSystem2.x,
  ),
  yScale = SYSTEMS.filter((starSystem2) => !starSystem2.farside).map(
    (starSystem2) => starSystem2.y,
  );
const centerX = (Math.min(...xScale) + Math.max(...xScale)) / 2,
  centerY = (Math.min(...yScale) + Math.max(...yScale)) / 2;
assertCondition(
  starSystem && STELLARS.earth && STELLARS.earth.system === 'sol' && STELLARS.luna,
  'Sol exists, with Earth and Luna Station',
);
assertCondition(
  Math.hypot(starSystem.x - centerX, starSystem.y - centerY) < 150,
  `Sol sits near the centre of the galaxy (${Math.round(Math.hypot(starSystem.x - centerX, starSystem.y - centerY))} from centre)`,
);
assertCondition(
  starSystem.links.length >= 2 &&
    starSystem.links.every((linkedSystemId) => systemsById[linkedSystemId].links.includes('sol')),
  `Sol is on the hyperspace network (${starSystem.links.join(', ')})`,
);
const starSystems = SYSTEMS.filter((starSystem2) => starSystem2.farside);
assertCondition(
  starSystems.length === 16 &&
    starSystems.every(
      (starSystem2) =>
        starSystem2.x < Math.min(...xScale) && starSystem2.y < Math.min(...yScale) + 60,
    ),
  'sixteen Farside systems lie off the north-west edge of the map',
);
assertCondition(
  starSystems.every((starSystem2) =>
    starSystem2.links.every((linkedSystemId2) => systemsById[linkedSystemId2].farside),
  ) &&
    SYSTEMS.filter((starSystem2) => !starSystem2.farside).every((starSystem2) =>
      starSystem2.links.every((linkedSystemId3) => !systemsById[linkedSystemId3].farside),
    ),
  'no hyperspace route connects Farside to the main galaxy',
);
const fseen = new Set(['coldharbor']),
  pendingSystemIds = ['coldharbor'];
while (pendingSystemIds.length)
  for (const linkedSystemId4 of systemsById[requiredFixtureValue(pendingSystemIds.shift())].links)
    if (!fseen.has(linkedSystemId4)) {
      fseen.add(linkedSystemId4);
      pendingSystemIds.push(linkedSystemId4);
    }
assertCondition(fseen.size === 16, 'all sixteen Farside systems connect to each other');
assertCondition(
  STELLARS['sol-gateway'].wormhole === 'coldharbor' &&
    STELLARS['coldharbor-gate'].wormhole === 'sol',
  'the wormhole joins Sol and Coldharbor in both directions',
);
const route2 = route(systemsById, 'meridian', 'ninefold');
assertCondition(
  route2.includes('sol') &&
    route2.includes('coldharbor') &&
    route2[route2.length - 1] === 'ninefold',
  `routes plot through the Gateway (${route2.length} legs)`,
);
assertCondition(
  FACTION_HULLS.farside.every((hull2) => COMMON_HULLS.includes(hull2)),
  'Farside shipyards sell common hulls only',
);
// traffic: no racial ships
const racial = new Set(
  Object.entries(FACTION_HULLS)
    .filter(([feature]) => !['quantum', 'spacer', 'lamp', 'hollow', 'farside'].includes(feature))
    .flatMap(([, hull3]) => hull3),
);
let hulls = [];
for (const starSystem2 of starSystems) {
  const space = game.spaces[starSystem2.id];
  for (let index = 0; index < 25; index++) space.spawnTraffic(false);
  hulls.push(...[...space.ships.values()].map((entity) => entity.hull));
}
assertCondition(
  hulls.length > 100 && hulls.every((hull4) => !racial.has(Number(hull4))),
  `Farside traffic flies no racial ships (${hulls.length} ships checked)`,
);
// crossing
const firstEntry = fake('Gate Runner'),
  playerData = requiredFixtureValue(firstEntry.s).data;
playerData.sys = 'sol';
playerData.stellar = 'earth';
game.depart(firstEntry.s);
const weapon = STELLARS['sol-gateway'],
  entity = requiredFixtureValue(firstEntry.s).ent;
requiredFixtureValue(entity).x = weapon.x;
requiredFixtureValue(entity).y = weapon.y;
requiredFixtureValue(entity).vx = requiredFixtureValue(entity).vy = 0;
const fuel = requiredFixtureValue(entity).fuel;
game.spaces.sol.tick();
assertCondition(
  playerData.sys === 'coldharbor' &&
    requiredFixtureValue(firstEntry.s).ent &&
    requiredFixtureValue(firstEntry.last('space')).sys === 'coldharbor',
  'flying into the wormhole crosses to Coldharbor',
);
assertCondition(
  Math.abs(
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).fuel - fuel,
  ) < 1 && playerData.explored.includes('coldharbor'),
  'the crossing costs no fuel and charts Coldharbor',
);
const back = STELLARS['coldharbor-gate'],
  entity3 = requiredFixtureValue(firstEntry.s).ent;
for (let index = 0; index < 160; index++) game.spaces.coldharbor.tick(); // wait out the re-entry guard
requiredFixtureValue(entity3).x = back.x;
requiredFixtureValue(entity3).y = back.y;
requiredFixtureValue(entity3).vx = requiredFixtureValue(entity3).vy = 0;
game.spaces.coldharbor.tick();
assertCondition(playerData.sys === 'sol', 'and the far mouth leads home to Sol');
assertCondition(
  game.offers(STELLARS.earth, playerData).length > 0 && STELLARS.earth.svc.includes('Y'),
  'Earth has a full set of services',
);
// --- the class triangle
await import('../shared/roles.ts').then(async ({ ROLES_INFO, roleMult }) => {
  const roles: Record<string, number> = {};
  for (const shipHullAsset of Object.values(assets.ships))
    roles[requiredFixtureValue(shipHullAsset.role)] =
      (roles[requiredFixtureValue(shipHullAsset.role)] || 0) + 1;
  assertCondition(
    Object.values(assets.ships).every(
      (shipHull) => ROLES_INFO[requiredFixtureValue(shipHull.role)],
    ) && Object.keys(ROLES_INFO).every((result) => roles[result] >= 8),
    `every hull has a role: ${JSON.stringify(roles)}`,
  );
  assertCondition(
    assets.ships[720].role === assets.ships[703].role &&
      assets.ships[745].role === assets.ships[708].role,
    'refits keep their base hull role',
  );
  assertCondition(
    roleMult('interceptor', 'battleship') === 1.15 &&
      roleMult('battleship', 'interceptor') === 0.9 &&
      roleMult('explorer', 'explorer') === 1,
    'interceptors hit battleships 15% harder; battleships hit interceptors 10% softer',
  );
  const message = game.spaces.meridian,
    damageHit = (attackerHull: number, target: number) => {
      const shipEntity = message.makeShip({
          hull: attackerHull,
          faction: 'spacer',
          x: 0,
          y: 0,
        }),
        targetEntity = message.makeShip({ hull: target, faction: 'hollow', x: 50, y: 0 });
      targetEntity.shield = 0;
      const armor2 = targetEntity.armor;
      message.damage(targetEntity, 100, 100, shipEntity);
      return armor2 - targetEntity.armor;
    };
  const battleshipDamage = damageHit(708, 717),
    explorerDamage = damageHit(708, 708),
    interceptorDamage = damageHit(708, 713);
  assertCondition(
    Math.abs(battleshipDamage / explorerDamage - 1.15) < 0.01 &&
      Math.abs(interceptorDamage / explorerDamage - 0.9) < 0.01,
    `in combat a Cutlass deals ${battleshipDamage} to a Bastion, ${explorerDamage} to another Cutlass, ${interceptorDamage} to a Halberd (explorer)`,
  );
  const secondEntry = fake('Hauler'),
    playerData4 = requiredFixtureValue(secondEntry.s).data;
  playerData4.ship.hull = 704;
  assertCondition(
    game.features.bonuses.bonus(playerData4).miningPct >= 50,
    'survey ships mine 50% better',
  );
  // --- specialists
  const {
    SPECIALISTS,
    SPEC: _SPEC,
    BP_NEED,
    PART_RATE: _PART_RATE,
    COMPONENTS,
  } = await import('../shared/specialty.ts');
  assertCondition(
    SPECIALISTS.length === 11 &&
      SPECIALISTS.every(
        (shipHull) =>
          assets.ships[shipHull.id] &&
          filesystem.existsSync(
            new URL(`../client/assets/ships/${shipHull.id}.webp`, import.meta.url),
          ) &&
          filesystem.existsSync(
            new URL(`../client/assets/ships/${shipHull.id}_yard.png`, import.meta.url),
          ),
      ),
    'ten original specialists plus Star Dredge, each with rendered sheets and yard portrait',
  );
  assertCondition(
    SPECIALISTS.every((shipHull) => shipHull.weapons.every(([weapon3]) => assets.weapons[weapon3])),
    'every specialist weapon exists',
  );
  const captain = fake('Specialist'),
    playerData5 = requiredFixtureValue(captain.s).data;
  playerData5.credits = 5e8;
  for (const message2 of ['alloy', 'crystal', 'isotope'])
    playerData5.mats[message2] = [20, 20, 20, 20, 20];
  Object.assign(playerData5.station, { claimed: true, ops: 5, site: 'site-meridian' });
  game.db.world.sites['site-meridian'] = game.db.key(playerData5.name);
  playerData5.sys = 'meridian';
  playerData5.stellar = 'site-meridian';
  game.features.specialists.specGain(captain.s, 'corsair', 0, 1, 5);
  assertCondition(playerData5.bp[808] === 5, 'boarding activity drops Corsair blueprints');
  captain.send({ t: 'spec', op: 'build', id: 805 });
  assertCondition(playerData5.ship.hull !== 805, 'a specialist needs 40 blueprints');
  playerData5.bp[805] = BP_NEED;
  captain.send({ t: 'spec', op: 'build', id: 805 });
  assertCondition(
    playerData5.ship.hull === 805 && playerData5.bp[805] === 0,
    'built the Lodestar at the station',
  );
  assertCondition(
    game.features.bonuses.bonus(playerData5).miningPct >= 250,
    'the Lodestar triples mining (plus the survey bonus)',
  );
  game.features.specialists.specGain(captain.s, 'lodestar', 12, 0);
  assertCondition(playerData5.spec.riftore >= 12, 'flying the Lodestar earns Riftore');
  captain.send({ t: 'spec', op: 'parts', id: 805 });
  assertCondition(
    playerData5.parts[805] >= 2,
    `refined Riftore into ${playerData5.parts[805]} Lodestar parts`,
  );
  playerData5.parts[805] = 100;
  for (const comp of Object.keys(COMPONENTS)) captain.send({ t: 'spec', op: 'comp', c: comp });
  assertCondition(
    Object.keys(COMPONENTS).every(
      (propertyKey) => playerData5.specState[805].comp[propertyKey] === 1,
    ),
    'upgraded all five components for Tier 1',
  );
  captain.send({ t: 'spec', op: 'comp', c: 'weapons' });
  assertCondition(
    playerData5.specState[805].comp.weapons === 1,
    'a component cannot pass the current tier',
  );
  captain.send({ t: 'spec', op: 'tierup' });
  assertCondition(
    requiredFixtureValue(playerData5.specState[805].upT) > Date.now(),
    'tier-up started: she goes into the drydock',
  );
  game.depart(captain.s);
  assertCondition(!requiredFixtureValue(captain.s).ent, 'she cannot fly while in the drydock');
  playerData5.specState[805].upT = Date.now() - 1;
  game.idleCheck(captain.s);
  assertCondition(
    playerData5.specState[805].tier === 2 && !playerData5.specState[805].upT,
    'the tier-up finished: Tier 2',
  );
  seedCargo(playerData5, { food: 5 });
  game.depart(captain.s);
  const message2 = game.spaces.meridian;
  message2.kill(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent), null);
  assertCondition(
    playerData5.cargo.food === 5,
    "the Lodestar's protected hold survives her destruction",
  );
  // abilities
  const makeElement = (hull: number, faction: string, horizontalPosition2 = 30) => {
    const shipEntity = message2.makeShip({ hull, faction: faction, x: horizontalPosition2, y: 0 });
    return shipEntity;
  };
  playerData5.stellar = 'site-meridian';
  playerData5.ship = { ...playerData5.ship, hull: 806 };
  playerData5.specState[806] = { tier: 1, comp: {} };
  game.depart(captain.s);
  const entity4 = requiredFixtureValue(captain.s).ent,
    shipEntity = makeElement(765, 'swarm'),
    shipEntity2 = makeElement(761, 'umbral'),
    shipEntity3 = makeElement(711, 'hollow');
  assertCondition(
    game.features.specialists.specMult(
      requiredFixtureValue(entity4),
      requiredFixtureValue(entity4),
      shipEntity,
    ) >= 1.6 &&
      game.features.specialists.specMult(
        requiredFixtureValue(entity4),
        requiredFixtureValue(entity4),
        shipEntity2,
      ) === 1,
    'the Swarmbreaker hits the Feral Swarm 60% harder',
  );
  assertCondition(
    message2.isHostile(shipEntity, requiredFixtureValue(entity4)),
    'the Feral Swarm attacks captains on sight',
  );
  playerData5.ship.hull = 807;
  assertCondition(
    game.features.specialists.specMult(
      requiredFixtureValue(entity4),
      requiredFixtureValue(entity4),
      shipEntity2,
    ) >= 1.5,
    'the Nightglass hits the Umbral 50% harder',
  );
  playerData5.ship.hull = 814;
  assertCondition(
    game.features.specialists.specMult(
      requiredFixtureValue(entity4),
      requiredFixtureValue(entity4),
      shipEntity3,
    ) >= 1.4,
    'the Vanguard hits pirates 40% harder',
  );
  playerData5.ship.hull = 809;
  const shipEntity4 = makeElement(751, 'quantum');
  shipEntity4.owner = requiredFixtureValue(entity4).id;
  assertCondition(
    game.features.specialists.specMult(requiredFixtureValue(entity4), shipEntity4, shipEntity3) >=
      1.25,
    "the Herald's escorts fight 25% harder",
  );
  playerData5.ship.hull = 812;
  playerData5.sys = 'meridian';
  assertCondition(
    game.features.bonuses.bonus(playerData5).shieldPct >= 50,
    "the Bulwark is 50% stronger in her station's system",
  );
  playerData5.ship.hull = 811;
  const secondHopSystemId = systemsById.meridian.links
    .flatMap((linkedSystemId5) => systemsById[linkedSystemId5].links)
    .find((entry) => entry !== 'meridian' && !systemsById.meridian.links.includes(entry));
  assertCondition(
    game.features.specialists.pathfinderJump(
      playerData5,
      'meridian',
      requiredFixtureValue(secondHopSystemId),
    ),
    `the Pathfinder can jump two systems at once (Meridian to ${systemsById[requiredFixtureValue(secondHopSystemId)].name})`,
  );
  requiredFixtureValue(entity4).hull = 813;
  requiredFixtureValue(entity4).player =
    requiredFixtureValue(entity4).player || mockPlayerReference({});
  const raider = makeElement(711, 'hollow', 900);
  assertCondition(
    !message2.findTarget(raider, 1800) || message2.findTarget(raider, 1800) !== entity4,
    'hostiles notice the Wraith at a third of the range',
  );
  // the swarm turns up in Vashari space
  const vsys = SYSTEMS.find((starSystem2) => starSystem2.faction === 'vashari' && starSystem2.gen),
    message3 = game.spaces[requiredFixtureValue(vsys).id];
  let found = false;
  for (let index = 0; index < 60 && !found; index++) {
    message3.spawnTraffic(false);
    found = [...message3.ships.values()].some((shipEntity5) => shipEntity5.faction === 'swarm');
  }
  assertCondition(
    found,
    `Feral Swarm clusters appear in Vashari space (${requiredFixtureValue(vsys).name})`,
  );
  console.log('ALL 0.8 TESTS PASSED');
  process.exit(0);
});
