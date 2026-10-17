import assert from 'node:assert/strict';
import { miningPanelState } from '../client/mining-panel-state.js';
const G = {
  A: { ships: { 704: { role: 'survey' }, 1: { role: 'interceptor' } } },
  you: { ship: { hull: 704 }, shipStats: { cargo: 70 }, cargoUsed: 60, jobCargo: 10 },
  view: {},
};
assert.deepEqual(miningPanelState(G), { visible: true, capacity: 70, free: 0, active: false });
G.you.shipStats.cargo = 0;
assert.equal(miningPanelState(G).visible, false);
G.you.shipStats.cargo = 70;
G.you.ship.hull = 1;
assert.equal(miningPanelState(G).visible, false);
G.you.shipStats.towRig = true;
assert.equal(miningPanelState(G).visible, true);
G.landed = true;
assert.equal(miningPanelState(G).visible, false);
G.landed = false;
G.you.shipStats.towRig = false;
G.towing = { attached: 1 };
assert.equal(miningPanelState(G).visible, true, 'never hide emergency detach');
G.you = null;
assert.equal(miningPanelState(G).visible, false);
console.log(
  'Mining panel role/capacity/full hold/mission cargo/rig/active safety/lifecycle passed.',
);
