import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import {
  createGameMessageHandlers,
  type MessageCapabilities,
  type Session,
} from '../server/game-message-handlers.ts';
import { landingGuidance, type AutopilotState } from '../client/landing_autopilot.ts';
import { gatewayGuidance } from '../client/gateway_autopilot.ts';
import {
  augmentAssets,
  makeLoadout,
  shipStats,
  step,
  wrap,
  DT as tickDuration,
  type FlightInput,
} from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';

const handlers = createGameMessageHandlers({} as MessageCapabilities);
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
let fractionalTurns = 0;
for (const scheduling of ['local', 'match']) {
  const session = { ent: {}, inputs: [], inputScheduling: scheduling } as unknown as Session;
  const dispatch = (turn: number) => {
    handlers.dispatch('input', session, { tu: turn });
    return requiredFixtureValue(scheduling === 'match' ? session.lastInput : session.inputs.pop());
  };
  for (const turn of [-1, -0.7, -0.01, 0, 0.01, 0.7, 1])
    assert.equal(dispatch(turn).turn, turn, 'authority preserves bounded steering precision');
  for (const turn of [NaN, Infinity, -Infinity])
    assert.equal(dispatch(turn).turn, 0, 'nonfinite steering cannot poison flight');
  assert.equal(dispatch(10).turn, 1);
  assert.equal(dispatch(-10).turn, -1);

  for (const hull of [703, 704, 714, 821]) {
    const stats = requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull)));
    for (const mode of ['landing', 'gateway'])
      for (const heading of [0.01, -0.01, Math.PI - 0.01, -Math.PI + 0.01]) {
        const predicted = {
          x: 0,
          y: 3000,
          vx: 4,
          vy: -stats.maxSpeed * 0.6,
          a: heading,
          fuel: stats.fuel,
        };
        const authority = { ...predicted };
        const port = { x: 100, y: 0, r: 70 };
        const state: AutopilotState = {};
        for (let tick = 0; tick < 600; tick++) {
          const input: Record<string, number> = {};
          if (mode === 'landing') landingGuidance(state, predicted, stats, port, input);
          else gatewayGuidance(predicted, stats, port, input);
          handlers.dispatch('input', session, {
            seq: tick,
            th: input.thrust,
            tu: input.turn,
            rv: input.rev,
            nav: true,
          });
          const accepted = requiredFixtureValue(
            scheduling === 'match' ? session.lastInput : session.inputs.pop(),
          );
          if (input.turn && Math.abs(input.turn) < 1) fractionalTurns++;
          const previousHeading = authority.a;
          step(predicted, stats, { ...input, navigation: true } as FlightInput);
          step(authority, stats, accepted);
          assert.deepEqual(
            authority,
            predicted,
            `${scheduling} ${mode} hull ${hull}: no snapshot heading correction`,
          );
          assert.ok(
            Math.abs(wrap(authority.a - previousHeading)) <= stats.turn * tickDuration + 1e-8,
            'heading cannot jump between frames',
          );
          if (mode === 'gateway' && Math.hypot(authority.x - port.x, authority.y - port.y) < port.r)
            break;
        }
      }
  }
}
assert.ok(fractionalTurns > 100, 'matrix exercises fine steering rather than only full turns');
console.log(
  `Landing/Gateway prediction-authority headings agree (${fractionalTurns} fractional controls, both schedulers).`,
);
