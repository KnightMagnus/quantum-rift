# Quantum Rift 3.3.3 — Trinity Stable Beta

## Cockpit and sidebar

- Read larger cockpit text, expand chat above the console and open ship and captain details from the helmet or **I**.
- Distinguish combat targeting from patrol scans: red takes priority over orange, and reduced-motion mode retains the color without blinking.
- Keep automatic radar square as the sidebar changes size. Retain separate radar and menu sizing preferences and reachable controls at narrow widths and different interface scales.
- Receive landing feedback without repeated copies of the same pending refusal. Server-side landing checks remain authoritative.

## Login and audio

- Watch login traffic follow the actual playing theme, including staged formations. Flybys respect reduced motion and visibility; they do not advance through suspended audio as though it were playing.
- Start new effects settings at 50%. Existing saved settings, explicit zero and mute remain unchanged, with separate music and interface controls.
- Hear a softer purchase signal for confirmed purchases, including buying a ship into the hangar. Sales, cancelled confirmations and disabled controls do not trigger it.

## Worlds and captain portraits

- Use 908 planetary illustrations across 227 scene sets. Each set includes an unsettled scene and three colony stages: level 1, levels 2–3 and levels 4–5.
- Retain explicit scene mappings for 179 current worlds, with deterministic biome choices for future unmapped worlds. Original Earth and station images remain unchanged; stations retain their separate live presentation.
- Use 70 portraits, including explicit identities for all 30 named rivals. Named rivals are excluded from the selectable generic pool.
- Open **PROFILE** in flight or while landed to preview and save a captain portrait; the flight button reads **ME** in compact layouts. Only the authenticated captain's selection can change, and the chooser confirms saving after the server acknowledges it.
- Show captain faces in public profiles and hails. Archived transmissions retain their captured caller identity after a ship leaves or despawns.

## Download and update

Download and extract the complete ZIP. Close the previous server before starting the new
copy, and preserve existing `data/`, `solo-data/` and `friend-data/` folders.
Use the [pinned Node 27 runtime](TYPESCRIPT-RUNTIME.md). Complete releases include
compiled modules and bundled libraries; source checkouts require `npm ci` and
`npm run build`.

The beta Solo save generator retains custom captain, credits, ship and station
controls. Save import/export and pause remain Solo-only. Local saves do not
automatically migrate to Nakama or synchronize between backends.

Solo and friend games need no Nakama or PostgreSQL. Dedicated online hosting
still requires separately configured Nakama 3.41.0, PostgreSQL, keys, backups and
network security. Ordinary startup starts the static web host, not those services.
See [friend hosting](HOSTING.md) and [native hosting](NAKAMA.md).

Friend games run only while the host server is open and require a reachable
address. They provide no automatic NAT traversal, router/firewall changes, host
migration or peer-to-peer simulation. Use a trusted LAN/VPN, or configure HTTPS/WSS
before exposing sign-in publicly.

The game remains in beta. Regression checks cover selected fixtures and browser
layouts, not every device, performance level, random seed or production workload.
