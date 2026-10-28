# Quantum Rift 0.3.6.1

A beta maintenance update for cockpit defaults, navigation and ship encounters.

## Changes

- New captains open the Overview tab when docked.
- The sidebar minimap starts square, follows sidebar width changes and shrinks to fit short screens. Manual sizing preferences are preserved.
- Landing approaches keep the engine glow active on straight flight, and wormhole
  approaches avoid unnecessary heading-frame oscillation.
- Index ships defend themselves when attacked and spread their investigations
  across system objects and ships. They do not send rescue requests.
- Manual fire overrides combat assist after closing its panel.
- Wider hailing dialogs leave room for longer response buttons.

## Beta version labels

The game, status API, Solo save exports, save generator and release archives use
**0.3.6.1**. Future beta patch releases follow the same four-part convention.
The corresponding npm package version is `0.3.6-1`, because npm requires a
three-part semantic version; `package.json` stores the public label separately
as `publicVersion`. Neither label changes the network protocol or save schema.

The previous public release was **0.3.6**, published under the historical
`v3.6.0` tag. That tag and its downloads remain unchanged. New releases use
the public beta label, beginning with `v0.3.6.1`.

## Updating

Close the old server and back up the complete Solo or friend-game save folder.
Extract the new download into a separate folder and follow the [README](../README.md).
Keep the old installation and backup until you have checked your captain.
Native online hosts should follow the [Nakama hosting guide](NAKAMA.md).

The optional save generator remains Solo-only; online servers do not accept
imported Solo saves.
