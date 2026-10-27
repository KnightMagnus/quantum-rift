import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import vm from 'node:vm';
import { projectPlayer } from '../client/player-projection.ts';
import type { PlayerProjectionState } from '../client/player-projection.ts';
import type { PlayerPayload } from '../client/main.ts';

// Exact case body captured from 4444b8a before extraction, with its original
// switch/break semantics. Its dependencies remain independently instrumented.
const before = filesystem
  .readFileSync(
    new URL('./fixtures/ownership/player-projection-before.txt', import.meta.url),
    'utf8',
  )
  .replaceAll('clientGameState.you!', 'clientGameState.you');
function run(
  legacy: boolean,
  flying: boolean,
  landed: boolean,
  returning: boolean,
  restore: boolean,
) {
  const trace: unknown[][] = [];
  const player = {
    sys: 'fixture-system',
    ship: { ammo: { '71': 9 } },
    radioStations: ['fixture-radio'],
  } as unknown as PlayerPayload;
  const state = {
    you: returning ? player : null,
    sys: 'old-system',
    views: {
      load: () => {
        trace.push(['views']);
        return restore;
      },
    },
    view: flying ? { id: 71 } : null,
    ammo: { '71': 3 },
    landed: landed ? { stellar: 'fixture-port' } : null,
    ctab: 'missions',
  } as unknown as PlayerProjectionState;
  const effect = (name: string, ...args: unknown[]) => {
    trace.push([name, state.you === player, state.sys, ...args]);
  };
  const context = {
    serverMessage: { t: 'you', d: player },
    clientGameState: state,
    setUnlockedStations: (stations: string[]) => effect('radio', stations),
    coopYou: () => effect('coop'),
    renderLanded: () => effect('landed'),
    refreshCompanion: () => effect('companion'),
    refreshStores: () => effect('stores'),
    ctab: (tab: string, persist: boolean) => effect('tab', tab, persist),
    renderTut: () => effect('tutorial'),
  };
  if (legacy) vm.runInNewContext(`switch(serverMessage.t) { ${before} }`, context);
  else
    projectPlayer(state, player, {
      unlockedStations: context.setUnlockedStations,
      coopYou: context.coopYou,
      renderLanded: context.renderLanded,
      refreshCompanion: context.refreshCompanion,
      refreshStores: context.refreshStores,
      tab: context.ctab,
      tutorial: context.renderTut,
    });
  assert.equal(state.you, player, 'Projection keeps the supplied payload identity');
  return { trace: JSON.parse(JSON.stringify(trace)), sys: state.sys, ammo: state.ammo };
}
for (const flying of [false, true])
  for (const landed of [false, true])
    for (const returning of [false, true])
      for (const restored of [false, true])
        assert.deepEqual(
          run(false, flying, landed, returning, restored),
          run(true, flying, landed, returning, restored),
        );
console.log(
  'Player projection: independent before/after effect ordering, payload identity, flight ammo and tab/landing traces passed.',
);
