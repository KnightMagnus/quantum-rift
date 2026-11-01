# System scenery

`shared/scenery-allocation.json` assigns visual assets by stable system and body ID. The browser uses the same data for planet selection, station architecture, sky layers, background worlds, wrecks, props and asteroid art. Unknown and player-created bodies retain procedural selection. The allocation changes artwork, not mining yield, collision sizes, landing permissions or station services.

Existing named station designs, authored special skies and story scenery take precedence. Irregular moons use transparent sprites with slow rotation; spherical worlds retain the lit surface-map renderer. Dedicated planetary landing images apply at uncolonized worlds. Established colonies keep their existing staged illustrations because the new pack has no colony-stage variants. Stations with large landing renders use those versions; other stations reuse their flight image.

The quiet-world catalog in `shared/diversity-worlds.json` adds a world to each reviewed empty non-Deep system. These worlds provide landing only, except gas giants, which cannot be landed on. They do not add markets, refuelling, repair, jobs or shipyards. Empty Deep systems remain unpopulated and gain visual scenery rather than claimable sites or new services. Decorative minefields, cargo and feral drones are not interactive hazards, salvage or enemies.

## Rebuilding artwork

The `rift_*3.py` generators extend the existing Python renderers and require NumPy and Pillow. Pass an output directory and optional asset names. `rift_planets3.py` adds its manifest entries to the existing planet manifest; `REFIX=1` regenerates the four corrected ringed giants. Ring shadows are ray-cast in the shared `rift_planets.py` renderer, so both old and new generators use the same geometry.

The allocation generator accepts the original review inventory and galaxy dump as inputs. Those review files describe an older galaxy and are not shipped as live world data. Do not regenerate the allocation against that old dump and overwrite the quiet-world additions. Update stable IDs and validate all references when changing the galaxy.

Run `node test/system-diversity.ts` and the registered browser case after changing art assignments. The canonical regression suite includes both cases.
