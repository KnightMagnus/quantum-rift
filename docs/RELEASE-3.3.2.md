# Quantum Rift 3.3.2 — Friend games and native online hosting

Host a shared universe on one computer, keep playing Solo, or configure a
dedicated Nakama service for online play.

- Add **Start Friend Game** launchers for an authoritative listen server. The host
  and friends play in browsers with separate captain names and passwords, sharing
  one world saved in `friend-data/`. No Nakama or PostgreSQL is needed for this mode.
- Protect friend saves with exclusive ownership checks and private local storage.
  Preserve Solo-only pause, save slots and import/export restrictions.
- Move dedicated authentication, sessions, match simulation and online checkpoints
  into Nakama 3.41.0 with PostgreSQL. Online sessions use the locally bundled
  official SDK; the Node web host serves the client, not a gameplay relay.
- Use ExcaliburJS for the flight scene, camera, input and native sprite entities,
  retaining the existing cockpit, artwork and authoritative gameplay simulation.
- Convert application source to native TypeScript with strict compiler checks.
  Complete downloads include compiled modules and bundled engine/client libraries;
  playing does not require a dependency installation or a build.
- Refresh the beta Solo save generator catalog for 3.3.2, retaining custom captain,
  credits, ship and station controls.

## Download and update

Use the complete ZIP or extract every matching smaller ZIP part into the same
folder. Do not mix versions. Close the previous server before starting the new
copy, and preserve existing `data/`, `solo-data/` and `friend-data/` folders.
Use the [pinned Node 27 runtime](TYPESCRIPT-RUNTIME.md); older release requirements
no longer apply. See [friend hosting](HOSTING.md) for launch and invitation steps.

Dedicated hosting requires separately configured Nakama and PostgreSQL services,
keys, backups and network security. Existing local accounts and saves do not
automatically migrate to Nakama or synchronize between backends. See
[native hosting](NAKAMA.md) before changing an existing online installation.

Friend games require a reachable host address and run only while the host server
is open. They provide no automatic NAT traversal, router/firewall changes, host
migration or peer-to-peer simulation. Use a trusted LAN/VPN, or configure HTTPS/WSS
before exposing sign-in publicly. Local regression checks are not proof of
Internet reachability, production capacity or complete native feature coverage.
