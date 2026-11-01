import assert from 'node:assert/strict';
import type { StarSystem } from '../../shared/galaxy.ts';

/** Reverse only reviewed story content changes for the original generation goldens. */
export function legacyStorySystems(systems: StarSystem[]): StarSystem[] {
  const additions = new Set(['table', 'quantum-rift', 'beyond-rift', 'founding-vigil']);
  const legacy: StarSystem[] = structuredClone(
    systems.filter((system) => !additions.has(system.id)),
  );
  for (const system of legacy) {
    // Exclude the authored port and reverse its companion artwork description;
    // the station landing regression covers their current identities and artwork.
    system.stellars = system.stellars.filter((body) => body.id !== 'farside-span');
    for (const body of system.stellars)
      if (body.id === 'nightjar-beacon') {
        assert.equal(
          body.desc,
          'A forest-filled refuge dome beside the emergency beacon. Crews rest among its trees, coordinate searches and take survey reports here.',
        );
        body.desc =
          'A staffed emergency beacon. Refuge crews coordinate searches and take survey reports here.';
      }
    for (const body of system.stellars)
      if (body.id === 'cinder-hold') {
        assert.equal(
          body.desc,
          'A towering armored stronghold with recessed docking bays. The Hollow runs its fortress and black market from here.',
        );
        body.desc =
          "A gutted battleship grown over with salvage scaffolds: the Hollow's fortress and black market.";
      }
    system.links = system.links.filter((link) => !additions.has(link));
    for (const stellar of system.stellars)
      if (stellar.prices)
        for (const commodity of [
          'nhal_bone',
          'nhal_ichor',
          'nhal_eye',
          'index_core',
          'index_parts',
        ])
          delete stellar.prices[commodity];
  }
  const currentGateway = legacy
    .find((system) => system.id === 'qgate')!
    .stellars.find((stellar) => stellar.id === 'sol-gateway')!;
  assert.equal(
    currentGateway.desc,
    'A stable wormhole at the edge of the Concordia system, a short run from Quantum Station. For centuries the Concord studied it as the Concordia Anomaly, and every ship that went in came straight back out. A few generations ago, one finally crossed. On the far side are the Farside settlements.',
  );
  assert.equal(currentGateway.name, 'The Gateway');
  assert.deepEqual([currentGateway.x, currentGateway.y], [3400, 400]);
  assert.equal(currentGateway.svc, '', 'The moved Gateway does not become a service port');
  assert.equal(legacy.find((system) => system.id === 'sol')!.gate, undefined);
  assert.equal(legacy.find((system) => system.id === 'qgate')!.gate, 'coldharbor');
  assert.equal(legacy.find((system) => system.id === 'coldharbor')!.gate, 'qgate');
  // Reverse only the authored Gateway relocation and two lore descriptions for
  // this pre-existing generation golden. Transit and new descriptions have their
  // own behavior checks; generated worlds, prices and RNG remain under this hash.
  const legacySol = legacy.find((system) => system.id === 'sol')!;
  assert.equal(legacySol.name, 'Sol Minor');
  // Display-only rename; preserve the original topology/content golden.
  legacySol.name = 'Sol';
  const legacyConcordia = legacy.find((system) => system.id === 'qgate')!;
  const legacyColdharbor = legacy.find((system) => system.id === 'coldharbor')!;
  const legacyGateway = legacyConcordia.stellars.find((stellar) => stellar.id === 'sol-gateway')!;
  legacyConcordia.stellars = legacyConcordia.stellars.filter(
    (stellar) => stellar !== legacyGateway,
  );
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
  assert.equal(
    legacySol.stellars.find((stellar) => stellar.id === 'luna')!.desc,
    'The old lunar shipyards, still turning out hulls for the Concord.',
  );
  legacySol.stellars.find((stellar) => stellar.id === 'luna')!.desc =
    'The old lunar shipyards, now a customs station watching over the Gateway.';
  legacyColdharbor.gate = 'sol';
  const legacyFarGateway = legacyColdharbor.stellars.find(
    (stellar) => stellar.id === 'coldharbor-gate',
  )!;
  assert.equal(legacyFarGateway.wormhole, 'qgate');
  assert.equal(
    legacyFarGateway.desc,
    'The far mouth of the Gateway. Through it, faintly, the light of Concordia.',
  );
  legacyFarGateway.wormhole = 'sol';
  legacyFarGateway.desc =
    'The far mouth of the Sol Gateway. Through it, faintly, the light of home.';
  // The station refinery is now called the Workshop; reverse only that word in derelict hull text.
  for (const system of legacy)
    for (const stellar of system.stellars)
      if (stellar.site) {
        assert.match(stellar.desc!, /dock, Workshop, lab/);
        stellar.desc = stellar.desc!.replace('dock, Workshop, lab', 'dock, refinery, lab');
      }
  for (const system of legacy)
    for (const stellar of system.stellars)
      if (
        stellar.desc ===
        'Grey seas and long twilights. The settlers here came through the Gateway three generations ago and never looked back.'
      )
        stellar.desc =
          'Grey seas and long twilights. The settlers here do not talk about how they arrived.';
  return legacy;
}
