import type { MiningPanelState } from '../client/mining-panel-state.ts';
import assert from 'node:assert/strict';
import { miningPanelState } from '../client/mining-panel-state.ts';
const game: MiningPanelState = {
  A: { ships: { 704: { role: 'survey' }, 1: { role: 'interceptor' } } },
  you: { ship: { hull: 704 }, shipStats: { cargo: 70 }, cargoUsed: 60, jobCargo: 10 },
  view: {},
};
assert.deepEqual(miningPanelState(game), { visible: true, capacity: 70, free: 0, active: false });
game.you!.shipStats!.cargo = 0;
assert.equal(miningPanelState(game).visible, false);
game.you!.shipStats!.cargo = 70;
game.you!.ship!.hull = 1;
assert.equal(miningPanelState(game).visible, false);
game.you!.shipStats!.towRig = true;
assert.equal(miningPanelState(game).visible, true);
game.landed = true;
assert.equal(miningPanelState(game).visible, false);
game.landed = false;
game.you!.shipStats!.towRig = false;
game.towing = { attached: 1 };
assert.equal(miningPanelState(game).visible, true, 'never hide emergency detach');
game.you = null;
assert.equal(miningPanelState(game).visible, false);
console.log(
  'Mining panel role/capacity/full hold/mission cargo/rig/active safety/lifecycle passed.',
);
