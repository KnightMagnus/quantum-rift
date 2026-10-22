import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dredgePilot, control, industrialStep, seed, DT } from './helpers/dredge-fixture.js';
import { weaponParams } from '../shared/rules.js';
import { RECIPES } from '../shared/refinery-rules.js';
import { SYS, STELLARS, COMMODITIES } from '../shared/galaxy.js';
import { quote, command } from './helpers/refinery-fixture.js';
import { evidenceDir } from './helpers/browser-fixture.mjs';
// Actual price/debit/output/fee loop including new plasma recipes, all forward only.
for (const recipe of RECIPES.filter((r) => r.inputs[0] === 'plasma'))
  for (const n of [1, 3, 7, 30]) {
    const f = dredgePilot(),
      { g, s } = f;
    g.dropEscorts(f.sp, s.ent);
    f.sp.remove(s.ent);
    s.ent = null;
    const p = Object.values(STELLARS).find(
      (p) => p.system === s.data.sys && !p.site && p.svc.includes('T') && p.svc.includes('O'),
    );
    s.data.stellar = p.id;
    seed(s.data, {});
    const start = s.data.credits;
    g.trade(s, 'plasma', n);
    assert.equal(s.data.cargo.plasma, n);
    const q = quote(g, s, recipe.id, n);
    command(g, s, { op: 'submit', id: q.id });
    command(g, s, { op: 'claim', recipe: recipe.id });
    const output = s.data.cargo[recipe.output] || 0;
    if (output) g.trade(s, recipe.output, -output);
    assert.ok(
      s.data.credits <= start,
      'no local buy/process/sell money pump including fractional liability',
    );
  }
const graph = new Map();
for (const r of RECIPES)
  for (const cid of r.inputs) graph.set(cid, [...(graph.get(cid) || []), r.output]);
graph.set('plasma', [...graph.get('plasma'), 'industrial_parts']);
graph.set('fuel_cells', ['ship_fuel']);
function visit(k, seen = new Set()) {
  assert.ok(!seen.has(k), 'no fuel/plasma/parts reverse conversion');
  for (const next of graph.get(k) || []) visit(next, new Set([...seen, k]));
}
for (const k of graph.keys()) visit(k);
// Twenty-minute deterministic production-boundary sessions. Scheduler travel/selection dwell is explicit;
// these are not autonomous flight AI, human play or full expansion-wide balance proofs.
const results = [];
for (const mature of [false, true])
  for (const hull of [815, 805]) {
    const f = dredgePilot(
        undefined,
        (mature ? 'Mature' : 'Stock') + hull,
        hull,
        hull === 805
          ? Object.values(SYS).find(
              (x) =>
                x.fields?.some((f) => f.ore === 'shards') &&
                x.stellars.some((p) => p.svc.includes('T') && p.svc.includes('O') && !p.site),
            ).id
          : 'meridian',
      ),
      { g, s, sp } = f,
      d = s.data;
    if (mature) {
      d.station.done = ['mining1', 'mining2', 'holds'];
      d.officers = [
        {
          id: 'industrial-chief',
          role: 'scout',
          rarity: 2,
          lv: 10,
          rank: 2,
          race: 'human',
          traits: ['prospector'],
        },
      ];
      d.bridge = { captain: 'industrial-chief' };
      d.lower = ['rigger', 'fixer'];
      d.mastery = { [hull]: 25000 };
      d.specState[hull] = {
        tier: 5,
        comp: { weapons: 5, shields: 5, hull: 5, drive: 5, special: 5 },
      };
    }
    const e = s.ent;
    e.st = g.features.shipStats.stats(d);
    e.a = Math.PI / 2;
    e.vx = 65;
    e.vy = 0;
    const cid = hull === 815 ? 'ore' : 'shards',
      family = sp.rocks.filter((r) => r.ore === cid && (hull === 815 ? r.stages === 1 : true));
    assert.ok(family.length);
    const p = Object.values(STELLARS).find(
      (p) => p.system === s.data.sys && !p.site && p.svc.includes('T') && p.svc.includes('O'),
    );
    let harvested = 0,
      premium = 0,
      net = 0,
      seconds = 60; // Initial travel budget; explicit fixed fixture assumption.
    let next = 0;
    while (seconds < 1200) {
      let current = sp.rocks.filter((r) => r.ore === cid && (hull === 815 ? r.stages === 1 : true));
      if (!current.length) current = sp.rocks.filter((r) => r.ore === cid);
      const r = current[next++ % current.length];
      if (r.down) {
        industrialStep(f, 1);
        seconds++;
        continue;
      }
      // Place encounter at a fixture-relative forward point; production work/ledger stays untouched.
      const beforeHold = g.holdUsed(d);
      r.x = e.x + 120;
      r.y = e.y;
      if (hull === 815 && r.stages === 1) {
        e.a = Math.PI / 2;
        e.vx = 65;
        e.vy = 0;
        control(f, 'sweep');
        let work = 0;
        while (!r.down && work < 10 && seconds < 1200) {
          industrialStep(f, DT);
          g.features.mining.endTick(sp);
          seconds += DT;
          work += DT;
        }
        control(f, 'off');
      } else {
        e.x = r.x + r.r + 100;
        e.y = r.y;
        e.a = -Math.PI / 2;
        e.vx = e.vy = 0;
        const gun = {
          w: 9102,
          n: hull === 815 ? 1 : 2,
          p: weaponParams(g.A.weapons[9102]),
          cd: 0,
          ammo: Infinity,
          snd: 'laser',
          sec: false,
          sndT: 0,
        };
        e.guns = [gun];
        let work = 0,
          stage = r.stage,
          releaseUntil = 0;
        while (!r.down && work < 30 && seconds < 1200) {
          g.features.mining.advanceClock(DT);
          sp.t += DT;
          if (stage !== r.stage) {
            stage = r.stage;
            releaseUntil = 0;
          }
          if (r.ready && r.heat >= 65 && !releaseUntil)
            releaseUntil = g.db.world.mining.clock + 0.3;
          if (!releaseUntil) sp.fire(e, gun, null, -Math.PI / 2);
          g.features.mining.endTick(sp);
          seconds += DT;
          work += DT;
        }
      }
      // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
      for (const parcel of [...g.db.world.mining.systems[d.sys].parcels])
        if (parcel.it.generationKey === r.key && !parcel.taken) {
          const _before = g.holdUsed(d);
          g.onLoot(e.player, parcel.it);
        }
      harvested += g.holdUsed(d) - beforeHold;
      if (g.holdUsed(d) >= e.st.cargo - 30 || seconds >= 1180) {
        premium += Object.values(d.cargoLots.byCommodity).reduce((n, l) => n + l.rich + l.pure, 0);
        // Actual docked refinery/trade settlement, with explicit roundtrip travel/processing time budget.
        const saved = s.ent;
        s.ent = null;
        d.stellar = p.id;
        const before = d.credits;
        const quantity = d.cargo[cid] || 0;
        if (quantity) g.trade(s, cid, -quantity);
        net += d.credits - before;
        d.stellar = null;
        s.ent = saved;
        seconds += 90;
      } else {
        industrialStep(f, hull === 815 ? 1 : 3);
        seconds += hull === 815 ? 1 : 3;
      } // Field selection/scoop dwell; precision attention is not free.
    }
    const hold = d.cargo[cid] || 0;
    premium += Object.values(d.cargoLots.byCommodity).reduce((n, l) => n + l.rich + l.pure, 0);
    const raw = COMMODITIES.find((c) => c.id === cid).base;
    net += Math.floor(hold * raw * 0.9);
    const common = d.cargoLots.byCommodity[cid]?.common || 0;
    results.push({
      mature,
      hull,
      cid,
      tonnes: harvested,
      premium,
      net,
      tonnesPerMinute: harvested / 20,
      netCreditsPerMinute: net / 20,
      miningPct: g.features.bonuses.bonus(d).miningPct,
      commonInFinalHold: common,
      protected: hull === 805,
      scope:
        'scripted production boundary; fixed travel/selection dwell, no encounters or player skill model',
    });
  }
fs.writeFileSync(
  path.join(evidenceDir('dredge-economy'), 'twenty-minute-sessions.json'),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
assert.ok(results.every((x) => Number.isFinite(x.net) && x.tonnes > 0));
for (const mature of [false, true]) {
  const bulk = results.find((x) => x.mature === mature && x.hull === 815),
    precision = results.find((x) => x.mature === mature && x.hull === 805);
  assert.ok(
    bulk.tonnesPerMinute > precision.tonnesPerMinute,
    'bounded scripted bulk throughput ahead',
  );
  assert.ok(
    precision.netCreditsPerMinute > bulk.netCreditsPerMinute,
    'precision value ahead without nerfing Lodestar',
  );
}
