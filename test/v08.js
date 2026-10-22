import { seedCargo } from './helpers/cargo-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
// 0.8 tests: the Sol Gateway (Sol, Earth, the wormhole, the Farside region), ship roles, specialty ships, parts and tiers.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS, FACTION_HULLS, COMMON_HULLS } from '../shared/galaxy.js';
import { route } from '../shared/rules.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v08-')));
export const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
let ip = 1;
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  game.connect(sock, '9.9.9.' + ip++);
  const s = [...game.sessions.values()].pop();
  const c = {
    sock,
    s,
    send: (m) => sock.emit('message', JSON.stringify(m)),
    last: (t) => [...sock.out].reverse().find((m) => m.t === t),
    all: (t) => sock.out.filter((m) => m.t === t),
  };
  c.send({ t: 'hello', name, pass: 'secret' });
  return c;
}
// --- Sol Gateway
const sol = SYS.sol,
  xs = SYSTEMS.filter((s) => !s.farside).map((s) => s.x),
  ys = SYSTEMS.filter((s) => !s.farside).map((s) => s.y);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
  cy = (Math.min(...ys) + Math.max(...ys)) / 2;
ok(
  sol && STELLARS.earth && STELLARS.earth.system === 'sol' && STELLARS.luna,
  'Sol exists, with Earth and Luna Station',
);
ok(
  Math.hypot(sol.x - cx, sol.y - cy) < 150,
  `Sol sits near the centre of the galaxy (${Math.round(Math.hypot(sol.x - cx, sol.y - cy))} from centre)`,
);
ok(
  sol.links.length >= 2 && sol.links.every((l) => SYS[l].links.includes('sol')),
  `Sol is on the hyperspace network (${sol.links.join(', ')})`,
);
const far = SYSTEMS.filter((s) => s.farside);
ok(
  far.length === 16 && far.every((s) => s.x < Math.min(...xs) && s.y < Math.min(...ys) + 60),
  'sixteen Farside systems lie off the north-west edge of the map',
);
ok(
  far.every((s) => s.links.every((l) => SYS[l].farside)) &&
    SYSTEMS.filter((s) => !s.farside).every((s) => s.links.every((l) => !SYS[l].farside)),
  'no hyperspace route connects Farside to the main galaxy',
);
const fseen = new Set(['coldharbor']),
  q = ['coldharbor'];
while (q.length)
  for (const l of SYS[q.shift()].links)
    if (!fseen.has(l)) {
      fseen.add(l);
      q.push(l);
    }
ok(fseen.size === 16, 'all sixteen Farside systems connect to each other');
ok(
  STELLARS['sol-gateway'].wormhole === 'coldharbor' &&
    STELLARS['coldharbor-gate'].wormhole === 'sol',
  'the wormhole joins Sol and Coldharbor in both directions',
);
const rt = route(SYS, 'meridian', 'ninefold');
ok(
  rt.includes('sol') && rt.includes('coldharbor') && rt[rt.length - 1] === 'ninefold',
  `routes plot through the Gateway (${rt.length} legs)`,
);
ok(
  FACTION_HULLS.farside.every((h) => COMMON_HULLS.includes(h)),
  'Farside shipyards sell common hulls only',
);
// traffic: no racial ships
const racial = new Set(
  Object.entries(FACTION_HULLS)
    .filter(([f]) => !['quantum', 'spacer', 'lamp', 'hollow', 'farside'].includes(f))
    .flatMap(([, h]) => h),
);
let hulls = [];
for (const s of far) {
  const sp = game.spaces[s.id];
  for (let i = 0; i < 25; i++) sp.spawnTraffic(false);
  hulls.push(...[...sp.ships.values()].map((e) => e.hull));
}
ok(
  hulls.length > 100 && hulls.every((h) => !racial.has(h)),
  `Farside traffic flies no racial ships (${hulls.length} ships checked)`,
);
// crossing
const a = fake('Gate Runner'),
  d = a.s.data;
d.sys = 'sol';
d.stellar = 'earth';
game.depart(a.s);
const w = STELLARS['sol-gateway'],
  e = a.s.ent;
e.x = w.x;
e.y = w.y;
e.vx = e.vy = 0;
const fuel = e.fuel;
game.spaces.sol.tick();
ok(
  d.sys === 'coldharbor' && a.s.ent && a.last('space').sys === 'coldharbor',
  'flying into the wormhole crosses to Coldharbor',
);
ok(
  Math.abs(a.s.ent.fuel - fuel) < 1 && d.explored.includes('coldharbor'),
  'the crossing costs no fuel and charts Coldharbor',
);
const back = STELLARS['coldharbor-gate'],
  e2 = a.s.ent;
for (let i = 0; i < 160; i++) game.spaces.coldharbor.tick(); // wait out the re-entry guard
e2.x = back.x;
e2.y = back.y;
e2.vx = e2.vy = 0;
game.spaces.coldharbor.tick();
ok(d.sys === 'sol', 'and the far mouth leads home to Sol');
ok(
  game.offers(STELLARS.earth, d).length > 0 && STELLARS.earth.svc.includes('Y'),
  'Earth has a full set of services',
);
// --- the class triangle
import('../shared/roles.js').then(async ({ ROLES_INFO, roleMult }) => {
  const roles = {};
  for (const H of Object.values(A.ships)) roles[H.role] = (roles[H.role] || 0) + 1;
  ok(
    Object.values(A.ships).every((H) => ROLES_INFO[H.role]) &&
      Object.keys(ROLES_INFO).every((r) => roles[r] >= 8),
    `every hull has a role: ${JSON.stringify(roles)}`,
  );
  ok(
    A.ships[720].role === A.ships[703].role && A.ships[745].role === A.ships[708].role,
    'refits keep their base hull role',
  );
  ok(
    roleMult('interceptor', 'battleship') === 1.15 &&
      roleMult('battleship', 'interceptor') === 0.9 &&
      roleMult('explorer', 'explorer') === 1,
    'interceptors hit battleships 15% harder; battleships hit interceptors 10% softer',
  );
  const sp = game.spaces.meridian,
    hit = (att, tgt) => {
      const x = sp.makeShip({ hull: att, faction: 'spacer', x: 0, y: 0 }),
        y = sp.makeShip({ hull: tgt, faction: 'hollow', x: 50, y: 0 });
      y.shield = 0;
      const a0 = y.armor;
      sp.damage(y, 100, 100, x);
      return a0 - y.armor;
    };
  const vsB = hit(708, 717),
    vsE = hit(708, 708),
    vsX = hit(708, 713);
  ok(
    Math.abs(vsB / vsE - 1.15) < 0.01 && Math.abs(vsX / vsE - 0.9) < 0.01,
    `in combat a Cutlass deals ${vsB} to a Bastion, ${vsE} to another Cutlass, ${vsX} to a Halberd (explorer)`,
  );
  const b = fake('Hauler'),
    dd = b.s.data;
  dd.ship.hull = 704;
  ok(game.features.bonuses.bonus(dd).miningPct >= 50, 'survey ships mine 50% better');
  // --- specialists
  const {
    SPECIALISTS,
    SPEC: _SPEC,
    BP_NEED,
    PART_RATE: _PART_RATE,
    COMPONENTS,
  } = await import('../shared/specialty.js');
  ok(
    SPECIALISTS.length === 11 &&
      SPECIALISTS.every(
        (sp) =>
          A.ships[sp.id] &&
          fs.existsSync(new URL(`../client/assets/ships/${sp.id}.webp`, import.meta.url)) &&
          fs.existsSync(new URL(`../client/assets/ships/${sp.id}_yard.png`, import.meta.url)),
      ),
    'ten original specialists plus Star Dredge, each with rendered sheets and yard portrait',
  );
  ok(
    SPECIALISTS.every((sp) => sp.weapons.every(([w]) => A.weapons[w])),
    'every specialist weapon exists',
  );
  const c = fake('Specialist'),
    d2 = c.s.data;
  d2.credits = 5e8;
  for (const m of ['alloy', 'crystal', 'isotope']) d2.mats[m] = [20, 20, 20, 20, 20];
  Object.assign(d2.station, { claimed: true, ops: 5, site: 'site-meridian' });
  game.db.world.sites['site-meridian'] = game.db.key(d2.name);
  d2.sys = 'meridian';
  d2.stellar = 'site-meridian';
  game.features.specialists.specGain(c.s, 'corsair', 0, 1, 5);
  ok(d2.bp[808] === 5, 'boarding activity drops Corsair blueprints');
  c.send({ t: 'spec', op: 'build', id: 805 });
  ok(d2.ship.hull !== 805, 'a specialist needs 40 blueprints');
  d2.bp[805] = BP_NEED;
  c.send({ t: 'spec', op: 'build', id: 805 });
  ok(d2.ship.hull === 805 && d2.bp[805] === 0, 'built the Lodestar at the station');
  ok(
    game.features.bonuses.bonus(d2).miningPct >= 250,
    'the Lodestar triples mining (plus the survey bonus)',
  );
  game.features.specialists.specGain(c.s, 'lodestar', 12, 0);
  ok(d2.spec.riftore >= 12, 'flying the Lodestar earns Riftore');
  c.send({ t: 'spec', op: 'parts', id: 805 });
  ok(d2.parts[805] >= 2, `refined Riftore into ${d2.parts[805]} Lodestar parts`);
  d2.parts[805] = 100;
  for (const comp of Object.keys(COMPONENTS)) c.send({ t: 'spec', op: 'comp', c: comp });
  ok(
    Object.keys(COMPONENTS).every((k) => d2.specState[805].comp[k] === 1),
    'upgraded all five components for Tier 1',
  );
  c.send({ t: 'spec', op: 'comp', c: 'weapons' });
  ok(d2.specState[805].comp.weapons === 1, 'a component cannot pass the current tier');
  c.send({ t: 'spec', op: 'tierup' });
  ok(d2.specState[805].upT > Date.now(), 'tier-up started: she goes into the drydock');
  game.depart(c.s);
  ok(!c.s.ent, 'she cannot fly while in the drydock');
  d2.specState[805].upT = Date.now() - 1;
  game.idleCheck(c.s);
  ok(d2.specState[805].tier === 2 && !d2.specState[805].upT, 'the tier-up finished: Tier 2');
  seedCargo(d2, { food: 5 });
  game.depart(c.s);
  const spM = game.spaces.meridian;
  spM.kill(c.s.ent, null);
  ok(d2.cargo.food === 5, "the Lodestar's protected hold survives her destruction");
  // abilities
  const mk = (hull, fac, x = 30) => {
    const e = spM.makeShip({ hull, faction: fac, x, y: 0 });
    return e;
  };
  d2.stellar = 'site-meridian';
  d2.ship = { ...d2.ship, hull: 806 };
  d2.specState[806] = { tier: 1, comp: {} };
  game.depart(c.s);
  const me = c.s.ent,
    sw = mk(765, 'swarm'),
    um = mk(761, 'umbral'),
    hol = mk(711, 'hollow');
  ok(
    game.features.specialists.specMult(me, me, sw) >= 1.6 &&
      game.features.specialists.specMult(me, me, um) === 1,
    'the Swarmbreaker hits the Feral Swarm 60% harder',
  );
  ok(spM.isHostile(sw, me), 'the Feral Swarm attacks captains on sight');
  d2.ship.hull = 807;
  ok(
    game.features.specialists.specMult(me, me, um) >= 1.5,
    'the Nightglass hits the Umbral 50% harder',
  );
  d2.ship.hull = 814;
  ok(
    game.features.specialists.specMult(me, me, hol) >= 1.4,
    'the Vanguard hits pirates 40% harder',
  );
  d2.ship.hull = 809;
  const esc = mk(751, 'quantum');
  esc.owner = me.id;
  ok(
    game.features.specialists.specMult(me, esc, hol) >= 1.25,
    "the Herald's escorts fight 25% harder",
  );
  d2.ship.hull = 812;
  d2.sys = 'meridian';
  ok(
    game.features.bonuses.bonus(d2).shieldPct >= 50,
    "the Bulwark is 50% stronger in her station's system",
  );
  d2.ship.hull = 811;
  const two = SYS.meridian.links
    .flatMap((l) => SYS[l].links)
    .find((x) => x !== 'meridian' && !SYS.meridian.links.includes(x));
  ok(
    game.features.specialists.pathfinderJump(d2, 'meridian', two),
    `the Pathfinder can jump two systems at once (Meridian to ${SYS[two].name})`,
  );
  me.hull = 813;
  me.player = me.player || {};
  const raider = mk(711, 'hollow', 900);
  ok(
    !spM.findTarget(raider, 1800) || spM.findTarget(raider, 1800) !== me,
    'hostiles notice the Wraith at a third of the range',
  );
  // the swarm turns up in Vashari space
  const vsys = SYSTEMS.find((x) => x.faction === 'vashari' && x.gen),
    spV = game.spaces[vsys.id];
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    spV.spawnTraffic(false);
    found = [...spV.ships.values()].some((e) => e.faction === 'swarm');
  }
  ok(found, `Feral Swarm clusters appear in Vashari space (${vsys.name})`);
  console.log('ALL 0.8 TESTS PASSED');
  process.exit(0);
});
