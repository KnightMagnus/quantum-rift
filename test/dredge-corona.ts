import { LandingFeedback } from '../client/landing-feedback.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import filesystem from 'node:fs';
import virtualMachine from 'node:vm';
import { K as physicsConstants, wrap, step } from '../shared/rules.ts';
import { landingGuidance, landingReady } from '../client/landing_autopilot.ts';
import { gatewayGuidance } from '../client/gateway_autopilot.ts';
import {
  dredgePilot,
  control,
  industrialStep,
  fullStep,
  seed,
  lots,
  DT as simulationStepSeconds,
} from './helpers/dredge-fixture.ts';
import { CORONA_BANDS, coronaAt, INDUSTRIAL } from '../shared/industrial-rules.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
for (const secondEntry of CORONA_BANDS) {
  assert.ok(systemsById[secondEntry.sys], 'authored system exists');
  for (const stellarBody of systemsById[secondEntry.sys].stellars)
    assert.ok(
      Math.hypot(stellarBody.x - secondEntry.x, stellarBody.y - secondEntry.y) >
        secondEntry.outer + stellarBody.r + 1000,
      'outside launch/port/gate corridors',
    );
}
for (const heading of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
  const feature = dredgePilot(undefined, 'Stock' + heading),
    entity = requiredFixtureValue(feature.s).ent,
    secondEntry = CORONA_BANDS[0];
  requiredFixtureValue(entity).x = secondEntry.entry.x;
  requiredFixtureValue(entity).y = secondEntry.entry.y;
  requiredFixtureValue(entity).a = heading;
  requiredFixtureValue(entity).vx = requiredFixtureValue(entity).vy = 0;
  const shields = requiredFixtureValue(entity).shield,
    hull = requiredFixtureValue(entity).armor;
  control(feature, 'harvest');
  fullStep(feature, 15);
  assert.equal(
    requiredFixtureValue(feature.s).data.cargo.plasma,
    5,
    'first five tonnes in 15 productive seconds',
  );
  assert.ok(
    Math.abs(requiredFixtureValue(requiredFixtureValue(feature.s).data.ship.industrial).heat - 45) <
      0.01,
  );
  control(feature, 'off');
  let exit = 0;
  // Actual stock turn/acceleration/velocity: turn toward outward east, then accelerate.
  while (
    coronaAt('meridian', requiredFixtureValue(entity).x, requiredFixtureValue(entity).y) &&
    exit < 10
  ) {
    const delta = Math.atan2(
      Math.sin(Math.PI / 2 - requiredFixtureValue(entity).a),
      Math.cos(Math.PI / 2 - requiredFixtureValue(entity).a),
    );
    requiredFixtureValue(requiredFixtureValue(entity).player).lastInput = {
      seq: 1,
      turn: Math.abs(delta) > 0.04 ? Math.sign(delta) : 0,
      thrust: Math.abs(delta) < 0.15 ? 1 : 0,
    };
    requiredFixtureValue(feature.s).inputs = [];
    feature.g.features.mining.advanceClock(simulationStepSeconds);
    feature.sp.tick();
    exit += simulationStepSeconds;
  }
  assert.ok(exit <= 10, 'actual stock exit within signalled margin');
  assert.equal(requiredFixtureValue(entity).shield, shields);
  assert.equal(requiredFixtureValue(entity).armor, hull);
}
// Uniform fine/coarse heat threshold and actual damage ordering.
for (const elapsedSeconds of [1 / 30, 0.5, 1]) {
  const pilotFixture = dredgePilot(undefined, 'Heat' + elapsedSeconds),
    shipEntity = requiredFixtureValue(pilotFixture.s).ent,
    secondEntry = CORONA_BANDS[0];
  requiredFixtureValue(shipEntity).x = secondEntry.entry.x;
  requiredFixtureValue(shipEntity).y = secondEntry.entry.y;
  control(pilotFixture, 'harvest');
  industrialStep(pilotFixture, 34, elapsedSeconds);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture.s).data.ship.industrial).harvest,
    false,
  );
  assert.equal(requiredFixtureValue(shipEntity).shield, requiredFixtureValue(shipEntity).st.shield);
  assert.equal(requiredFixtureValue(shipEntity).armor, requiredFixtureValue(shipEntity).st.armor);
  industrialStep(pilotFixture, 7, elapsedSeconds);
  assert.ok(requiredFixtureValue(shipEntity).shield < requiredFixtureValue(shipEntity).st.shield);
  assert.equal(requiredFixtureValue(shipEntity).armor, requiredFixtureValue(shipEntity).st.armor);
  industrialStep(pilotFixture, 11, elapsedSeconds);
  assert.ok(requiredFixtureValue(shipEntity).armor < requiredFixtureValue(shipEntity).st.armor);
}
const pilotFixture = dredgePilot(),
  secondEntry = CORONA_BANDS[0];
requiredFixtureValue(pilotFixture.s).ent.x = secondEntry.entry.x;
requiredFixtureValue(pilotFixture.s).ent.y = secondEntry.entry.y;
seed(requiredFixtureValue(pilotFixture.s).data, { food: lots(400) });
control(pilotFixture, 'harvest');
industrialStep(pilotFixture, 20);
assert.equal(requiredFixtureValue(pilotFixture.s).data.cargo.plasma || 0, 0);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(pilotFixture.s).data.ship.industrial).harvestMs,
  0,
);
seed(requiredFixtureValue(pilotFixture.s).data, {});
requiredFixtureValue(requiredFixtureValue(pilotFixture.s).data.ship.industrial).heat = 0;
requiredFixtureValue(requiredFixtureValue(pilotFixture.s).data.ship.industrial).harvest = false;
control(pilotFixture, 'harvest');
requiredFixtureValue(pilotFixture.s).lastInput = { navigation: true };
industrialStep(pilotFixture, 1);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(pilotFixture.s).data.ship.industrial).harvest,
  false,
  'navigation cancels opt-in',
);
console.log(
  'Real stock 15s harvest/10s escape at four headings, fine/coarse cutoffs then shield/hull damage, full hold and navigation denial.',
);
// Source depletion is finite across reconnect/reload; stock plasma is the sole spendable upgrade balance.
const finite = dredgePilot(undefined, 'Finite'),
  effectiveStats = requiredFixtureValue(finite.s).ent;
requiredFixtureValue(effectiveStats).x = secondEntry.entry.x;
requiredFixtureValue(effectiveStats).y = secondEntry.entry.y;
control(finite, 'harvest');
industrialStep(finite, 3);
const source2 = requiredFixtureValue(finite.g.db.world.industrial).sources[secondEntry.id];
assert.equal(source2.units, INDUSTRIAL.sourceUnits - 300);
source2.units = 0;
const plasma = requiredFixtureValue(finite.s).data.cargo.plasma;
industrialStep(finite, 3);
assert.equal(requiredFixtureValue(finite.s).data.cargo.plasma, plasma);
finite.g.db.flush();
assert.equal(requiredFixtureValue(finite.s).data.spec.plasma || 0, 0);
// The same simulation clock naturally replenishes depleted non-rock mining sources.
// Twenty seconds replaces one tonne's 300 units; there is no wall-time catchup.
requiredFixtureValue(finite.g.db.world.mining).clock +=
  INDUSTRIAL.units / INDUSTRIAL.renewPerSecond;
requiredFixtureValue(requiredFixtureValue(finite.s).data.ship.industrial).heat = 0;
industrialStep(finite, 3);
assert.equal(requiredFixtureValue(finite.s).data.cargo.plasma, plasma + 1);
assert.ok(source2.units >= 0 && source2.units < INDUSTRIAL.sourceUnits);

// ALL OFF is not cooling while passive corona exceeds cooling capacity.
{
  const pilotFixture2 = dredgePilot(undefined, 'OffHeat'),
    shipEntity = requiredFixtureValue(pilotFixture2.s).ent,
    secondEntry2 = CORONA_BANDS[0];
  requiredFixtureValue(shipEntity).x = secondEntry2.entry.x;
  requiredFixtureValue(shipEntity).y = secondEntry2.entry.y;
  control(pilotFixture2, 'harvest');
  industrialStep(pilotFixture2, 15);
  control(pilotFixture2, 'off');
  const before = requiredFixtureValue(
    requiredFixtureValue(pilotFixture2.s).data.ship.industrial,
  ).heat;
  industrialStep(pilotFixture2, 2);
  assert.ok(
    Math.abs(
      requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).heat -
        before -
        6,
    ) < 1e-6,
  );
  assert.match(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).reason,
    /CORONA HEATING — EXIT BAND/,
  );
  requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).heat = 105;
  industrialStep(pilotFixture2, 1);
  assert.match(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).reason,
    /THERMAL CUTOFF.*CORONA HEATING — EXIT BAND/,
  );
  requiredFixtureValue(shipEntity).x = secondEntry2.x + secondEntry2.outer + 2000;
  const hotState = requiredFixtureValue(
    requiredFixtureValue(pilotFixture2.s).data.ship.industrial,
  ).heat;
  industrialStep(pilotFixture2, 1);
  assert.ok(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).heat <
      hotState,
  );
  assert.doesNotMatch(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).reason,
    /CORONA HEATING/,
  );
  requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).heat = 60;
  industrialStep(pilotFixture2, 1);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).reason,
    'OFF / COOLING',
  );
}
// Arbitrary automatic route segments, not just authored stellar-to-stellar routes.
{
  const { coronaRouteBlocked } = await import('../shared/industrial-rules.ts');
  const { step } = await import('../shared/rules.ts');
  const { landingGuidance } = await import('../client/landing_autopilot.ts');
  const secondEntry2 = CORONA_BANDS[0],
    pilotFixture2 = dredgePilot(undefined, 'Keepout'),
    shipEntity = requiredFixtureValue(pilotFixture2.s).ent;
  const start = { x: secondEntry2.x + 7000, y: secondEntry2.y },
    target = { x: secondEntry2.x - 7000, y: secondEntry2.y, r: 100 };
  assert.equal(coronaRouteBlocked(secondEntry2.sys, start, target), true);
  assert.equal(
    coronaRouteBlocked(secondEntry2.sys, secondEntry2.entry, target),
    true,
    'inside-start also rejected',
  );
  let refused = false;
  Object.assign(shipEntity, start, { vx: 0, vy: 0 });
  for (let index = 0; index < 300; index++) {
    const input = {};
    if (coronaRouteBlocked(secondEntry2.sys, shipEntity, target)) refused = true;
    else landingGuidance({}, shipEntity, requiredFixtureValue(shipEntity).st, target, input);
    step(shipEntity, requiredFixtureValue(shipEntity).st, input);
    assert.equal(
      coronaAt(
        secondEntry2.sys,
        requiredFixtureValue(shipEntity).x,
        requiredFixtureValue(shipEntity).y,
      ),
      null,
      'rejected route never enters collector',
    );
  }
  assert.equal(refused, true);
  for (const stellarBody of systemsById[secondEntry2.sys].stellars)
    for (const zoom of systemsById[secondEntry2.sys].stellars)
      assert.equal(
        coronaRouteBlocked(secondEntry2.sys, stellarBody, zoom),
        false,
        'authored safe routes unaffected',
      );
}

// Run the actual production input tick, including recursive keep-out/full-stop completion.
// UI/audio adapters are inert; authoritative industrial work uses the real fixture.
{
  const source = stripTypeScriptTypes(
    filesystem.readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8'),
  );
  const productionFunction = (name: string) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
  };
  const { coronaRouteBlocked } = await import('../shared/industrial-rules.ts');
  for (const scenario of ['stationary', 'low-speed', 'moving', 'manual', 'normal-route']) {
    const pilotFixture2 = dredgePilot(undefined, 'Intent' + scenario),
      shipEntity = requiredFixtureValue(pilotFixture2.s).ent;
    Object.assign(shipEntity, CORONA_BANDS[0].entry, {
      vx: scenario === 'moving' ? 80 : scenario === 'low-speed' ? 5 : 0,
      vy: 0,
    });
    control(pilotFixture2, 'harvest');
    industrialStep(pilotFixture2, 1);
    assert.equal(
      requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).harvest,
      true,
    );
    const game = {
      view: { ...shipEntity },
      you: { shipStats: requiredFixtureValue(shipEntity).st },
      sys: requiredFixtureValue(pilotFixture2.s).data.sys,
      opts: {},
      combat: {},
      ents: new Map([[requiredFixtureValue(shipEntity).id, shipEntity]]),
      myId: requiredFixtureValue(shipEntity).id,
      route: [],
      auto:
        scenario === 'manual'
          ? null
          : {
              mode: 'land',
              id: systemsById[requiredFixtureValue(pilotFixture2.s).data.sys].stellars[0].id,
            },
    };
    if (scenario === 'normal-route') Object.assign(game.view, { x: 0, y: 0 });
    const sent: { t: string; nav?: boolean }[] = [],
      warnings: string[] = [];
    const context = virtualMachine.createContext({
      // This navigation fixture has no open browser dialog; modal denial has browser coverage.
      overlays: { blocksFlight: () => false },
      flightEngine: { recovering: false },
      landingFeedback: new LandingFeedback(),
      clientGameState: game,
      systemsById,
      physicsConstants,
      tickDuration: simulationStepSeconds,
      wrap,
      step,
      coronaRouteBlocked,
      landingGuidance,
      landingReady,
      gatewayGuidance,
      performance,
      mouse: {},
      history: [],
      seq: 0,
      held: () => false,
      shipFunctions: { secondary: () => false },
      typing: () => false,
      padInput() {},
      touchInput() {},
      audio: { engine() {}, ui() {} },
      toast: (session: string) => warnings.push(session),
      $: () => ({ classList: { toggle() {} } }),
      send: (message: { t: string; nav?: boolean }) => sent.push(message),
    });
    context.elementById2 = context.$;
    context.sequence = context.seq;
    virtualMachine.runInContext(
      ['setAuto', 'autopilot', 'fixedTick'].map(productionFunction).join('\n'),
      context,
    );
    virtualMachine.runInContext('fixedTick()', context);
    const input = sent.find((message) => message.t === 'input');
    assert.ok(input, 'production fixedTick sends input');
    assert.equal(input.nav, scenario !== 'manual', scenario + ' preserves navigation intent');
    if (['stationary', 'low-speed', 'moving'].includes(scenario)) {
      assert.ok(warnings.some((session) => session.includes('stellar collector keep-out')));
      assert.equal(game.auto?.mode || null, scenario === 'moving' ? 'stop' : null);
    }
    if (scenario === 'normal-route') assert.equal(game.auto?.mode, 'land');
    requiredFixtureValue(pilotFixture2.s).lastInput = { navigation: input.nav };
    const earned = requiredFixtureValue(
      requiredFixtureValue(pilotFixture2.s).data.ship.industrial,
    ).harvestMs;
    industrialStep(pilotFixture2, 1);
    assert.equal(
      requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).harvest,
      scenario === 'manual',
    );
    if (scenario === 'manual') {
      assert.ok(
        requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).harvestMs >
          earned,
        'manual opt-in work continues',
      );
    } else {
      assert.equal(
        requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).harvestMs,
        earned,
        'navigation earns no further harvest',
      );
      virtualMachine.runInContext('clientGameState.auto = null; fixedTick()', context);
      assert.equal(
        sent.filter((message) => message.t === 'input').at(-1)!.nav,
        false,
        'intent clears next tick',
      );
    }
  }
}
