# Native online hosting

Dedicated online mode uses Nakama 3.41.0 for authentication, sessions,
sockets, match presence and authoritative simulation, with PostgreSQL for durable
storage. Local verification uses PostgreSQL 18.6. The 3.3.2 complete release
includes the compiled Nakama runtime, but no configured production services.

For a player-hosted universe without Nakama or PostgreSQL, see
[friend hosting](HOSTING.md). Ordinary startup still selects the dedicated native
backend; friend hosting is an explicit alternative, not a Node relay to Nakama.
The two backends do not automatically share accounts, worlds or progress.

## Service and launch boundary

The operator must provide PostgreSQL and a configured Nakama service, including
its database migrations, runtime module path, signing keys, TLS and network
policy. Follow the official [installation](https://heroiclabs.com/docs/nakama/getting-started/install/)
and [configuration](https://heroiclabs.com/docs/nakama/getting-started/configuration/)
documentation. This repository does not supply a production deployment or an
automatic port-opening workflow.

Extract the complete release, then start the web host with `node tools/start.ts`.
For a source checkout, first run `npm ci` and `npm run build`.

The build produces normal server/browser modules and the self-contained Nakama
runtime `dist/nakama/quantum-rift.js`. Configure Nakama to load that runtime. Merge these tested settings into the
operator-owned configuration; retain its database, signing, console and network
settings:

```yaml
runtime:
  path: <directory-containing-quantum-rift.js>
  js_entrypoint: quantum-rift.js
  js_min_count: 1
  js_max_count: 4
socket:
  write_timeout_ms: 60000
```

The pool sizes are the local test configuration, not a production capacity
recommendation. The longer HTTP write timeout is needed for legacy first-login
verification; it does not change the match tick or gameplay heartbeat.
The launcher runs compiled `server/main.ts`: without `SOLO` or `HOST_FRIENDS=1`, it selects
`server/nakama-host.ts`, which serves static HTTP and public connection
configuration only. It does not launch Nakama, relay gameplay or own a game timer.

The web host binds to `127.0.0.1` by default; `PORT` defaults to `8080`.
Set `HOST` explicitly when network access is intended. Configure the separate
Nakama listener and any firewall/reverse proxy deliberately as well. A remote
browser must reach both the web host and advertised Nakama endpoint.

The web host exposes these public settings through `/api/status`:

| Environment variable | Browser connection setting                                      |
| -------------------- | --------------------------------------------------------------- |
| `NAKAMA_HOST`        | Reachable Nakama hostname; defaults to the web request hostname |
| `NAKAMA_PORT`        | Nakama API/socket port; defaults to `7350`                      |
| `NAKAMA_USE_SSL`     | `1` selects HTTPS/WSS; otherwise HTTP/WS                        |
| `NAKAMA_SERVER_KEY`  | Client-public Nakama server key; defaults to `defaultkey`       |

The server key is a client connection setting, not a server secret. Nakama
runtime, session/refresh signing, HTTP and console keys belong in private service
configuration, never in these browser settings. Replace development defaults and
configure transport security for an actual deployment.

With `SOLO=1`, the same launcher selects `server/local-main.ts` instead. Solo
keeps the existing local database, save slots, import/export and paused behavior;
it needs neither Nakama nor PostgreSQL.

## Authentication and identity

The locally bundled official JavaScript SDK 2.8.0 owns native custom
authentication, sockets and session JWTs. Logout revokes access and refresh
sessions. No email login, account-management screen or new social feature is
introduced.

A before-custom-authentication hook verifies the captain password before Nakama
issues a session. The transport custom ID is `qr:` followed by
`encodeURIComponent` of the canonical captain name. A separate `captainName`
variable preserves the display name, including spaces. The hook strips **all**
client session variables and removes the supplied transport username. Match joins
resolve the captain from Nakama's server-owned account and private credential
record, not from a client hello, name or token variable. Native link/unlink
endpoints and other built-in authentication providers are disabled: a client
cannot preclaim another captain's custom ID or add an alternate-provider login
around the password gate. This does not add account-management UI.

New passwords use versioned `bcrypt-sha256`: a SHA-256 hexadecimal prehash avoids
bcrypt's 72-byte input boundary. New registrations accept passwords of 4–256
characters; existing credential verification accepts up to 4096. An independent
legacy scrypt verifier preserves the original password and upgrades an imported
credential after successful login. The measured first legacy verification took
18.6 seconds in the local Goja run; later logins use native bcrypt. The client
allows 45 seconds for API requests so this one-time upgrade does not require a
manual retry. This is a local timing observation, not a latency guarantee.
Six failed attempts per captain name or IP
block further attempts in a ten-minute window; the durable failure table is
bounded and fails closed when full. Successful logins do not clear those misses.

## One world and one clock

`server/nakama-world.ts` runs the existing `Game` and `Space` inside one native
authoritative match at 30 Hz. The authenticated `qr_world` RPC uses a private CAS
reservation to find or create the singleton world. An unpublished reservation
cannot advance Game or admit captains; an expired creator loses its fence and
retires, while a committed publish with a lost acknowledgement is recovered.
Native match callbacks own
joins, leaves, input and simulation advancement. There is no Node gameplay relay,
second timer or legacy online input queue.

Existing private JSON game packets travel over native match messages. The adapter
checks finite values, packet size/depth, input sequence bounds and flood limits
before the existing action validators. Per-captain output uses targeted native
presence delivery. Client prediction, DOM HUD, audio and Excalibur's animation
frame/render loop remain client-owned; they do not decide balances or world state.

The match state uses a callable `WorldHandle` to retain class and `Map` identities
when Nakama exports state through Go between callbacks in the match's dedicated
VM. Named global callback bridges invoke an IIFE-contained runtime rather than
relying on mutable caches in frozen globals. This is a tested boundary for the
pinned Nakama runtime, not a general compatibility guarantee for arbitrary Goja
programs or future versions. Shared credits formatting uses integer commas
without depending on host locale support.

## Durable state and migration limits

`server/nakama-storage.ts` commits the full world and game-account checkpoint as
one versioned PostgreSQL storage row. Records use the system-owner zero UUID and
read/write permissions `0`; clients cannot read private accounts, credentials or
world records directly. CAS prevents a competing writer from merging economies.
An uncertain write acknowledgement freezes economic writes; restart must reload
the durable checkpoint before further changes. This is not a distributed-world
or horizontal-scaling claim.

`server/nakama-migration.ts` supplies offline preview, apply, idempotence and
guarded rollback APIs for legacy-shaped data. It preserves names and game save
fields while moving credential material to private records. These APIs are not
player RPCs, an automatic startup import or a complete operator import tool. No
real player-data import or production migration is claimed. Keep existing online
`data/` archives and Solo saves unchanged; do not discard them after a synthetic
migration test.

## Social and gameplay service ownership

Native sessions and match presence are active service replacements. Existing
friends, blocking, chat, Armada, trade, duel and mission rules still run in the
ported Game; not every hand-written social subsystem has been replaced.

A native friend graph is a candidate once verified captain-to-UUID binding and
legacy offline-edge migration can provide a single authority with compatible
read projections. Raw chat channels are not a substitute for per-recipient
blocks, current-location authorization, offline mailbox and history/privacy
rules. Parties do not replace reconnect-persistent Armada membership. Matchmaker
selection must preserve FIFO, queue counts and eligibility before replacing the
current arena selector. Trade confirmation, duel consent and mission Ready/Start
with fixed shares remain gameplay rules, not consequences of native group
membership. No additional feature is implied by an available Nakama API.

## Verification scope

See [TEST-COVERAGE.md](TEST-COVERAGE.md#native-online-authority) for native suites,
reference-backend coverage and remaining limits, and
[DEVELOPMENT-TOOLS.md](DEVELOPMENT-TOOLS.md#native-runtime-build-and-tests) for
fixture prerequisites. Focused local native network and browser checks do not
prove full gameplay parity, production readiness or a successful hosted CI run.
