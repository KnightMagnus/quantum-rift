# Quantum Rift 0.3.6

Public release: **0.3.6**. The source package and release tag are **3.6.0** and **v3.6.0**.

## Exploration and faction stores

- The galaxy map distinguishes visited and charted systems from name-only neighbours. Unexplored space stays hidden, while mission bearings remain available when your captain has earned them. Routes use known space, with a final hop into an adjacent unvisited system.
- Faction stores sell star charts and 33 exclusive outfits: a weapon, defence and utility for each faction. Charts reveal faction-owned systems; outfit purchases check fit before charging.
- The minimap starts square and fits above the sidebar controls. Pressing J with the galaxy map open closes it and starts your plotted jump.
- Hyperspace arrivals keep clear of nearby bodies, and chained departures head away from obstructions.

## Ships and captains

- NPC landing approaches brake more consistently. Fleet wingmates hold steadier headings, and NPC convoy followers use their leader's destination port.
- Index survey groups tour their work areas, with smoother drone sorties that follow the moving parent. Extraction respects deployment and range.
- Thirty rival captains have a fixed roster of names and ship names. The two formerly privileged captains now use ordinary starting luck and wealth. Stable IDs preserve existing careers; credits already held in a save are not reset.
- Combat ships close to their primary weapon's effective range rather than remaining too far away to use it.

## Launching and reliability

- Launchers download the pinned Node runtime on first use when a suitable runtime is unavailable. An unsuccessful installation stops with an explanation and can be retried without reusing a partial download.
- Silent and interrupted connections are detected instead of leaving stale controls or offers active. Save validation, network command checks and graphics-resource recovery have broader regression coverage.
- Local trade quotes close profitable buy-and-sell loops. Clearance payments apply only when clearance is denied, and cockpit panels leave room for the JUMP control.
- Online instances admit up to thirty captains, with shared snapshot encoding and measured performance checks.

## Updating

Close the old server first and preserve a backup of the complete Solo or friend-game save folder. Download **Quantum-Rift-latest.zip**, extract it into a new folder, and follow the [README](../README.md). Keep the old copy and backup until you have verified your captain in the new version. Native online hosts should follow [the Nakama hosting guide](NAKAMA.md).

The game remains in beta. The optional Solo save generator uses the 3.6.0 catalog and remains unavailable to online captains. Existing rival credits are preserved; this update does not retroactively remove earned or previously granted wealth.
