# Quantum Rift 0.3.4 — Trinity Stable Beta-A

Package version: **3.4.0**. Release tag: **v3.4.0**.

## Story and exploration

- Continue your captain's story with new choices, exploration and illustrated dialogue.
- Find new connections in faction arcs and spaceport stories. Existing progress and rewards remain intact.
- Story progress and choices belong to each captain in Solo and online play. Markets and ordinary world simulation remain shared.

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

The game remains in beta, with some content still under development.
Supported checks do not establish compatibility with every device or workload.
