# Quantum Rift 3.4.2

Package version: **3.4.2**. Release tag: **v3.4.2**.

## Cockpit and encounters

- Landed windows use more of the available flight area on ultrawide screens, while keeping the Tray and console clear.
- Cockpit fasteners no longer overlap ship-function buttons and labels at the tested UI scales.
- Controls opens in a wider, two-column layout, with a single-column fallback on narrow screens.
- Neutral Index fleets give larger hulls more room. Split Tridents can still return and rejoin without restoring lost health or spending replacement ships.
- Index and Nhal hails use ship artwork, including incoming and archived hails. Missing artwork falls back to another ship image or no portrait, never a humanoid captain.
- The story-only Rift Harness no longer appears in Codex outfit browsing, searches or stale detail links. Its story reward, fitting and inventory behavior remain available when earned.

## Controls and reliability

Options, Controls, key capture and logout share dialog priority and keyboard focus.
Closing an overlay restores appropriate focus without allowing keyboard, touch or
gamepad flight input through the active dialog. Other screens retain their existing
owners; this is not a migration of every overlay.

Server message routing uses typed gameplay packets and explicit action owners.
Station production and research timers retain their existing behavior under a
separate progression owner. Save checks reject malformed local snapshot envelopes
and preserve committed-journal recovery. A stopped-backup rehearsal checks cargo
ledger compatibility without writing to the original save; see
[SAVE-MIGRATIONS.md](SAVE-MIGRATIONS.md) for its scope and limits.

A bounded native workload records real Nakama/PostgreSQL flight, reconnection and
checkpoint recovery. Its timings are observations, not a production capacity or
latency guarantee. See [PERFORMANCE.md](PERFORMANCE.md).

## Updating

Close the old server before starting the new copy. Back up and preserve existing
Solo and friend-game save folders. This patch adds no global save-schema version.
Import/export and pause remain Solo-only; local saves do not automatically move
to dedicated online storage.

Download the complete **Quantum-Rift-latest.zip** release attachment rather than
GitHub's source archive. Use the [supported pinned Node 27 runtime](TYPESCRIPT-RUNTIME.md)
and the launch instructions in the [README](../README.md). The archive includes
compiled modules and bundled libraries; players do not need to install npm dependencies.

The beta Solo save generator catalog matches package version 3.4.2 and retains its
custom captain, credits, ship and station controls. See the
[generator instructions](../test/Save%20Generator/README.md).

The game remains in beta. Browser device emulation does not certify physical touch
or gamepad hardware. The story and far-side content limits described in the
[0.3.4 notes](RELEASE-3.4.0.md) still apply.
