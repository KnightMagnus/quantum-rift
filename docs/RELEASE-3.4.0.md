# Quantum Rift 0.3.4 — Trinity Stable Beta-A

Package version: **3.4.0**. Release tag: **v3.4.0**.

## Story and exploration

- Continue the main story beyond the Que'vari missions into Acts II and III. Make decisions at landed story screens and choose from the endings your captain has unlocked.
- Investigate the Index survey machines and their Farside worksites. Meet the Nhal in the Deep, learn their song, and face the Dreamer through combat or a prepared listening encounter.
- Follow the Lamplighter keepers' chain alongside the main story. Its old logs, failing beacons and founding vigil connect the ten Farside lamps to the choices ahead.
- Find new connections in existing faction arcs, port stories and expedition fragments. The original Que'vari objectives, unlocks and rewards remain unchanged.
- Reach the Quantum Rift through the appropriate ending, gather the five Riftproofing components and fit the unique Rift Harness. The far side is an explorable arrival scene, not a second full galaxy: it has no stations, traffic or onward lanes. Return through the rift to continue playing.

The Gateway is now near Quantum Station in Concordia. Its saved stellar ID remains
unchanged. The silent expedition hulk has a fixed home in Aureole and uses its
supplied dormant artwork. The finale includes the awake ark, an upright animated
violet rift and the supplied arrival backdrop.

## Your captain's version of the Rift

Story progress and choices belong to each captain in Solo and online play. Endings
change that captain's descriptions, scenery and available story destinations;
markets, territory and ordinary world simulation remain shared.

During Act III, other captains and their fleets can appear ghostly. Endings also
affect how different realities look, while group members and friend-game captains
remain solid to one another. These effects do not change collision, targeting,
trade or combat rules. Reduced effects removes shimmer and preserves readable
targeting indicators.

## Saves, update and hosting

Close the old server before starting the new copy. Keep backups of `data/`,
`solo-data/` and `friend-data/`; do not replace them with empty folders from a new
archive. New story choices are stored per captain, with unset choices for captains
who have not reached them. Save import/export and pause remain Solo-only. Local
saves do not automatically migrate to dedicated online storage or synchronize
between backends.

Use the [supported pinned Node 27 runtime](TYPESCRIPT-RUNTIME.md). Complete release
archives include compiled modules and bundled libraries. Source checkouts require
`npm ci` and `npm run build`.

Solo and friend games do not require Nakama or PostgreSQL. Dedicated online hosting
still needs the separately configured services described in [native hosting](NAKAMA.md).
Friend games run while the host is open and reachable; they do not provide automatic
NAT traversal, host migration or peer-to-peer simulation. See [friend hosting](HOSTING.md).

## Beta Solo save generator

The generator catalog matches package version 3.4.0. It retains custom captain
names, credits, player ships, public starting ports, Personal Station locations
and tiers, plus research, radio and tutorial options. Its 98 player-eligible hulls
exclude NPC-only faction ships and story actors. The game still uses those ships
in their intended encounters; the testing tool cannot create them as player ships.

The Python generator and Solo import path remain available. The standalone EXE
must be built on Windows using its supplied build script; a Linux build does not
produce a Windows executable. See the [generator instructions](../test/Save%20Generator/README.md).

The game remains in beta. The far-side scene is a placeholder for later content,
and supported checks do not establish compatibility with every device or workload.
