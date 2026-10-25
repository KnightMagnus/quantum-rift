# Client/server compatibility

Compatibility uses the numeric `GAME_PROTOCOL` epoch in `shared/protocol.ts`,
not the package version shown on the title screen or the artwork cache version.
Different builds can connect when their wire contract is the same.

## Supported combinations

- Current client and server: numeric epoch `1` in HTTP status, native world RPC
  and local hello; native join metadata encodes it as the string `"1"`.
- Released clients without identifiers: accepted as legacy epoch 1 by current
  local and native servers. Their existing payloads remain supported.
- Current client with an older server that omits identifiers: accepted as legacy
  epoch 1. Older servers ignore the additional hello and join fields.
- Explicit unknown, malformed or different epochs: rejected. An omitted identifier
  is not equivalent to `null`, an empty string or a malformed value.

Missing identifiers remain supported because the wire contract has not changed.
This is an explicit migration policy, not proof that all historical builds work.
A future breaking contract must change the epoch and reconsider legacy admission
in both local hello and native join; accepting an unmarked client then would be
unsafe. Protocol identifiers declare compatibility, not identity or permissions.
Existing authentication, request validation, economic authority and save owners
remain necessary.

## Admission and recovery

Every browser connection, including reconnect, reads `/api/status` without cache
before authentication or opening a gameplay transport. The native `qr_world` RPC
also advertises its actual epoch, so a stale static host cannot hide a newer
runtime. Native join metadata is checked before Game login; local hello is checked
before account creation, migration or authentication. Unsupported clients cannot
enter the authoritative gameplay action routes.

On a mismatch, the browser stops reconnecting, clears stale controls and returns
to sign-in with a Refresh Game Page button. Refresh happens only when selected.
If refresh cannot resolve the mismatch, the message asks the player or host to
update. The recovery action does not import, reset or replace a save. Ordinary
disconnect/checkpoint behavior still owns progress already committed to storage.

An older browser does not have this recovery UI, but its legacy epoch remains
supported. Status and RPC failures are ordinary connection errors, not evidence
of incompatibility. The static host and native runtime should be updated together;
RPC and join checks cover their independent compatibility declarations. No live
protocol negotiation or automatic server update is performed.
