# Quantum Rift 0.3.6.2

A beta maintenance update for the sidebar and combat code.

## Changes

- Keep the system radar square at every Tray width. Remove its manual height divider; scroll the Tray on short screens to reach the panels below it. The tabbed menu keeps its own height divider.
- Remove refinery information from Missions.
- Reorganize combat targeting, movement and encounter handling without changing gameplay.

## Updating

Close the old server and back up the complete Solo or friend-game save folder. Extract the new download into a separate folder and follow the [README](../README.md). Keep the old installation and backup until you have checked your captain.

Native online hosts should follow the [Nakama hosting guide](NAKAMA.md). The optional save generator remains Solo-only; online servers do not accept imported Solo saves.

The public beta label is **0.3.6.2**; the npm package version is `0.3.6-2`. This update does not change the network protocol or save schema.
