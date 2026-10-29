# Quantum Rift 0.4.2

## Changes

- Improve save validation, checkpoint recovery and friend-server shutdown. Malformed imports no longer replace an existing Solo save.
- Pause AI captain careers when no authenticated player is connected, without accumulating income to catch up later.
- Correct toll payments, bank-rating progress, delivery cargo reservations, wingmate salvage and recovery protection.
- Add a saved missile-spending toggle to Assist and prevent incompatible work orders.
- Improve mission directions, trade previews and faction-store fitting information.
- Restore keyboard text entry and improve touch controls, short-screen layouts and readable zoom. Clear held flight controls when the page is hidden.
- Show clearer connection-loss and recovery feedback.
- Display the Sol system as Sol Minor. Existing saves retain their system identifiers.
- Restrict access to private server files and validate trades before applying them.

## Updating

Close the old game server, back up your complete Solo or friend-game save folder, and extract the new download into a separate folder. Preserve your saves when updating. See the [README](../README.md) and [hosting guide](HOSTING.md).

The optional save generator remains Solo-only. Physical touch devices, gamepads and screen-reader compatibility have not been verified for this release.
