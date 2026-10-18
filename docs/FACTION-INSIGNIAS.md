# Faction insignias

Original local SVG insignias in client/assets/factions use the exact canonical
FACTIONS color from shared/galaxy.js for their crest stroke. Dark recessed fields
and engraved shadows match the cockpit viewscreens; colors are not an alternative
palette. The store header selects its image from the existing faction selection,
without adding clicks or changing stock, standing, prices or purchase authority.

| Faction            | Motif                                           | Lore basis                               |
| ------------------ | ----------------------------------------------- | ---------------------------------------- |
| Quantum Concord    | intersecting orbital covenant / central diamond | Concord unity and quantum navigation     |
| Free Spacers       | outbound arrow and freight wings                | independent haulers and trading posts    |
| Lamplighters       | enclosed flame / beacon rays                    | vigil stations and tended beacons        |
| Hollow             | broken angular raider mask                      | pirate crews and scavenged hulls         |
| Que'vari           | paired light sails and mast                     | People of Light, woven sails             |
| Umbral             | eclipse crescent / dark shard                   | light-consuming worlds                   |
| Vashari            | winged chitin / brood body                      | grown hives and clutch-speakers          |
| Korrund            | forge anvil / ore diamond                       | forge elders, mines and quarry worlds    |
| Ylith              | split crystal / listening facets                | seers, frost crystal and listening posts |
| Sarn               | caravan wheel / dune line                       | caravan wheels and desert brass towers   |
| Thalassi           | living-water bell / tides                       | ocean worlds, reefs and song-ships       |
| Farside Settlers   | rising horizon / outbound trail                 | settlers beyond the main galaxy          |
| Unclaimed Frontier | broken mountain horizon                         | unclaimed frontier outposts              |
| Deep               | nested abyss diamonds                           | remote unexplored depths                 |
| Feral Swarm        | connected brood cells                           | wild Vashari drone clusters              |
| Umbral Eclipse     | occulted disc / eight rays                      | roaming Umbral cells                     |

Sources: shared/galaxy.js faction roster, shared/gen.js location descriptions,
shared/arcs.js faction arcs, shared/story.js Que'vari story. Motifs are original
interpretations, not claims of previously canonical flags. All 16 roster entries
have assets; the existing store exposes 11 (region/hidden powers and Umbral remain
excluded by STORE_FACS). Tests decode and switch all 11 selectable images, match
menu color, check top-left layout and preserve disabled purchase gates.
