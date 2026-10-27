# Performance and health measurements

Diagnostics are off by default. They collect numeric timings, sizes and counts,
not captain names, packets, chat, passwords, save contents or exception messages.
They do not change simulation order, storage authority, checkpoint recovery or
transport admission rules. No gameplay optimization is included.

## Enable and read

- **Nakama:** set the runtime environment variable `RIFT_HEALTH=1` in the server
  configuration. Each match owns one monitor. Every 900 match ticks the server
  writes a bounded `World health` JSON summary to its existing logger. This is
  an operator setting, not a client packet. Restart the runtime to change it.
- **Local hosts:** `RIFT_HEALTH=1` adds a monitor to the host's `Game`. Embedding
  tools can read `game.health?.report()`. No public HTTP diagnostics endpoint is
  added. The ordinary server does not periodically print local reports.
- **Browser:** append `?health=1` (or `&health=1` alongside a renderer selection).
  Read `window.RiftEngine.scene.health?.report()` in developer tools. Reload
  without that query parameter to disable it. This does not enable server metrics.

`HealthMonitor` retains at most 512 observations per fixed metric by default;
construction allows 1–4096. `count`, `total`, `max` and `last` cover the monitor's
lifetime. `p50` and `p95` cover only the retained window. Reporting sorts a copy;
collection does not sort or retain payloads. There is no player-controlled metric
label, dynamic identifier or growing per-captain history. Disabled paths do not
read a measurement clock, enumerate diagnostic entities or size payloads.

## What the numbers mean

- `tickMs` covers the authoritative tick; `featuresMs`, `spacesMs` and
  `snapshotsMs` divide its ordinary stages. Odd ticks do not send snapshots.
  Paused/frozen ticks still count as tick calls but do not advance simulation.
- `snapshotBuildMs` measures shared system snapshot construction.
  `snapshotSerializeMs` includes construction of each flying recipient's payload
  and its existing JSON serialization. `snapshotBytes` counts UTF-8 JSON bytes
  before transport framing/compression. Docked `scene` packets are not included.
- `systems`, `entities` and `shots` count awake systems, ships and projectiles
  after a tick, including quiet systems waiting to sleep. Rocks, loot, beams and
  browser Actors are not included in the ship count.
- `checkpointMs` includes validation, detach serialization/parse and synchronous
  backend write. `checkpointSerializeMs` covers detach serialization/parse;
  `checkpointBytes` measures UTF-8 serialized checkpoint JSON before database
  encoding. Clean no-op flushes are excluded. `checkpointFreezes` records failed
  writes; `frozenTicks` identifies a world that stopped advancing for recovery.
  A write may have committed before its acknowledgement failed. Restart/recover
  through the existing checkpoint procedure; these counters never retry a write.
- `tickFailures` and `spaceFailures` count exceptions without recording their
  text. Existing tick error logs retain a fixed category/count, not exception
  contents. Repeated failures remain visible after the first few detailed logs
  would otherwise have been suppressed.
- `connections`/`disconnects` count lifecycle calls; duplicate close handling can
  count twice. `returningLogins` counts successful logins to existing accounts,
  not proof of a network reconnect. Correlate these rates with native transport
  diagnostics; there is no identity tracking or causal reconnect classifier.
- `browserUpdateMs` covers the scene's pre-update work, including prediction and
  display reconciliation. `browserDrawMs` covers Scene pre-/post-draw CPU time,
  not GPU completion, total Engine frame time or an FPS guarantee. Native actor
  engine work outside these hooks is excluded.

Node's baseline harness injects `performance.now()`. Production portable server
metrics use `Date.now()` because Nakama does not provide the browser Performance
API; sub-millisecond stages may report zero and wall-clock adjustments can affect
samples. Browser measurements use `performance.now()`.

## Reproduce the workloads

```sh
RIFT_PERF_OUTPUT=/private/artifacts/baseline.json node tools/performance-baseline.ts
# Bounded overrides: 1..108000 measured ticks per scenario.
RIFT_PERF_TICKS=900 RIFT_PERF_SOAK_TICKS=18000 \
  RIFT_PERF_OUTPUT=/private/artifacts/baseline.json node tools/performance-baseline.ts
node test/health.ts
```

The harness fixes simulation time, seeds each workload independently, starts 30
warmup ticks, then replaces the monitor before measuring. It uses production
Game, Space, mining beam, towing attachment and checkpoint serialization code.
Connections discard packets after serialization. Checkpoints use an isolated
memory CAS backend with detached copies, not PostgreSQL. No external services,
real accounts, credentials or saves are required. RNG and wall-clock overrides
are restored even after a failure; deferred callbacks use the authority queue.

- **busy-combat:** two captains and 48 armed Hollow/Concord NPCs in one system.
- **mining-towing:** two industrial captains, one real beam against a generated
  rock and one surveyed towing attachment. The normal simulation advances both.
- **concentrated:** twelve captains in Meridian.
- **distributed:** twelve captains in distinct sorted galaxy systems; the harness
  also initializes Meridian for common fixture setup. Quiet systems remain visible.
- **reconnect:** two captains; one disconnects and logs back into the same account
  every 90 measured ticks. This exercises Game reconnect state, not TCP recovery.
- **soak:** two captains, 18,000 measured ticks by default (600 simulated seconds).
  This is accelerated simulation, not a ten-minute wall-clock or multihour soak.

Each JSON artifact records commit, dirty status, runtime, CPU, memory, host load,
seed, measured/warmup ticks, captain count, elapsed time, transport/backend limits,
metrics and final authoritative state. Keep artifacts in a private output
location. The browser regression writes separate numeric health artifacts for
Canvas/WebGL and DPR combinations alongside its existing actual-game captures.

## Baseline and budgets

The first bounded run used Node 27.0.0-nightly20261020531d28fc36 on a shared Linux
x64 AMD EPYC 4344P host (16 logical CPUs). Five scenarios ran 900 measured ticks;
the soak ran 18,000. The busiest observed snapshot was 18,063 bytes and largest
checkpoint 144,448 bytes; distributed flight peaked at 455 projectiles. These
are fixture observations, not supported player-count limits or dedicated-hardware
results. Renderer measurements are separate browser artifacts, not server figures.

The registered health regression requires zero simulation exceptions/freezes,
bounded sample retention and identical enabled/disabled authoritative outcomes
for each 120-tick seeded workload. Fixture resource ceilings are 32 KiB per flying
snapshot and 256 KiB per checkpoint, rounded up from the observed baseline to
leave room for ordinary payload variation. These are payload-growth guards, not
network, latency or production storage quotas. Review the scenario and protocol
change before changing a ceiling; do not regenerate it merely to pass a test.

No hardware latency budget is enforced in shared-host CI. Before adopting one,
select the intended server/browser hardware, player distribution and renderer;
repeat real Nakama/PostgreSQL/network runs and sustained wall-clock soaks there.
The 30 Hz simulation has a 33.33 ms cadence, which alone is not a measured latency
SLO. Optimize only a hot path established by those measurements, with separate
authoritative parity coverage. Current instrumentation does not prove multihour
stability, weak-device rendering, GC tail latency or production checkpoint speed.

## Planet render caches

Each world drawn in flight keeps per-pixel lighting arrays and canvases in one of two
caches in `client/planets.ts`: procedural worlds, used while pre-rendered maps load or
when planet artwork is missing or fails to decode, and worlds lit from pre-rendered
maps. Before these budgets, neither cache evicted catalog worlds; only background
worlds were trimmed, so both grew with every system visited. The shared surface-map
cache is bounded separately at 18 texture sets, and evicting a set also drops the
worlds lit from it.

Reproduce with:

```sh
npm run build
RIFT_PLANET_TOUR=24 node test/planet-cache-budget-browser.ts
```

The test tours the catalog worlds of the 24 busiest systems (12 in the registered
regression run) in headless Chromium and
writes per-system retention to `planet-cache-budget/results.json` under the
regression artifact directory. Sizes are estimates of typed-array and canvas backing
stores, not process memory: decoded images, GPU copies and browser overhead are
excluded.

| Measurement (MB)                          | Pre-rendered | Procedural |
| ----------------------------------------- | -----------: | ---------: |
| Busiest system (5 worlds)                 |         16.1 |       10.7 |
| Unbounded after 24 systems                |        118.0 |      128.8 |
| Budget                                    |           48 |         32 |
| Highest bounded retention during the tour |         47.8 |       31.9 |
| Shared surface maps after 24 systems      |         39.9 |          — |

The unbounded pre-rendered figure levels off near 120 MB only because surface-map
eviction drops worlds as a side effect; the procedural cache grows linearly with no
limit. Each budget holds about three of the busiest systems, so moving between
neighbouring systems does not rebuild worlds. Worlds drawn in the last two seconds
are never evicted, so a system may exceed a budget by its own worlds rather than
lose the sprites on screen.

An evicted system is rebuilt on return. On the measurement host the five
pre-rendered worlds of the busiest system came back in 25 to 130 ms across runs, built
synchronously within one or a few frames, and the procedural fallback took 2.4 to 2.6 s
spread over frames by its existing 8 ms
per-frame build budget, during which those worlds are not drawn, as on a first visit.

These figures come from one run on a shared Linux x64 container (4 logical CPUs,
Intel Xeon 2.8 GHz, no GPU) using Chrome for Testing 153 headless and Node
27.0.0-nightly20261020531d28fc36. Retention estimates depend only on the catalog and
the cache code; rebuild times depend on the host. Neither is a device memory
guarantee or a frame-time budget.

## Native wall-clock workload

The separate native harness runs the built Goja match in disposable Nakama and
PostgreSQL processes, with real SDK sockets over loopback. Build first and provide
`POSTGRES_BIN` as for the native network regressions; `NAKAMA_BINARY` can select the
pinned installed Nakama binary.

```sh
npm run build
node tools/performance-native.ts --output=/private/artifacts/native-run-1.json \
  --duration=60 --captains=4 --seed=1701
node tools/performance-native.ts --output=/private/artifacts/native-run-2.json \
  --duration=60 --captains=4 --seed=1701
node test/performance-native.ts
```

The default workload lasts 60 measured wall-clock seconds with four fresh
captains in their common initial system. Limits are 32–300 integer seconds,
1–12 captains and an unsigned 32-bit client seed. Invalid or duplicate arguments
fail before creating services or an output file. Output must be an absolute path;
the tool creates a new mode-0600 file and refuses to overwrite one. Setup and
restart time are additional to the measured flight duration. The fixture watchdog
is duration plus 120 seconds, at most 420 seconds. Ordinary native fixture tests
retain their existing 180-second watchdog, warning-level logger and packet history.

The client sends seeded thrust/turn inputs at a target 10 Hz without firing. The
seed selects client actions only: it does not fix native server RNG, NPC activity
or OS scheduling. One captain disconnects halfway through the measured interval.
The normal server policy docks disconnected captains in-system; the harness waits
for authoritative player state and requests ordinary departure to resume flight.
After measurement it verifies input acknowledgements and actual movement, reads
numeric checkpoint metadata, restarts Nakama without replacing PostgreSQL, then
checks all captains' saved portrait markers, credits, hulls and systems before
resuming flight. No server state is injected to simulate this continuity.

Native health is enabled in the generated fixture's `runtime.env` with
`RIFT_HEALTH=1`, together with info-level logging. The report copies only fixed
numeric fields from `World health` summaries; arbitrary log messages, identifiers,
packets, SDK errors, credentials and tokens are not copied. Private fixture logs,
configuration and database files are not numeric reports and must remain private.
The 32-second registered regression crosses the 900-tick health logging cadence;
it also checks invalid limits, bounded collectors and cleanup after an injected
post-join failure. Existing native network coverage still exercises ordinary
fixture defaults.

Each connection retains at most 64 recent packets, 64 recent errors and three
fixed latest-state packets (`you`, `snap`, `scene`). Lifetime packet/byte/error and
snapshot/byte counters do not depend on this diagnostic window. Receive totals
cover each connection's full lifetime, including joins and restart. Input counters
count only the scheduled measured-flight inputs, not setup/control commands or
SDK framing. Numeric snapshot
gap and send-drift samples retain at most 512 values. At most 32 fixed health
summaries enter one report. The artifact includes source HEAD and dirty status,
actual binary/SDK versions, Node/platform/CPU/memory/load, driver CPU usage,
pre-restart native process CPU/RSS samples, measured and total monotonic elapsed
time, reconnect/restart readiness and process cleanup counts.

`reconnectMs` ends at authoritative player state; `reconnectToFlightMs` additionally
includes departure and the first flying snapshot. `restartToStateMs` ends at the
last restored captain's player state, including earlier captains' departures;
`restartToFlightMs` also includes the final departure. Snapshot gaps are receive
intervals, not round-trip latency. Send drift includes client scheduling, serial
sends and reconnect work. Native CPU samples use `ps` integer CPU seconds; the
PostgreSQL parent excludes its backend workers. Driver CPU includes setup and
cleanup and is not server CPU. Health timings retain the production `Date.now()`
resolution and window semantics described above.

Repeat runs and compare their spread on the same host before drawing conclusions.
These concentrated fresh-captain flight/reconnect/checkpoint runs do not measure
distributed, combat or mining workloads, Internet latency, browser/GPU work,
production player capacity, a latency SLO or multihour stability. The accelerated
in-process scenarios remain separate measurements, not native workload ports.
## Image, audio and procedural resource ownership

Reproduce the actual-browser loading, cache eviction and graphics recovery probe:

```sh
npm run build
node test/asset-recovery-browser.ts
```

It writes `asset-recovery/results.json` under the regression artifact directory,
including initial page-to-music readiness and the six-sheet load/decode time.
These elapsed times include network, scheduling and cache hits, not isolated decoder benchmarks.
The local Chromium fixture loads the login theme, enters ordinary early-game
flight and decodes six additional catalog ship sheets. On the shared Linux
measurement host, one final run retained about 101 MiB of decoded ship sheets
and 51 MiB of scenery. Traffic changes the exact working set between runs; the
current JSON report is the measurement record. Login music decoded to about
48 MiB of PCM. These are reproducible
fixture observations, not total browser memory or universal device requirements.

`imageResourceUsage()` in `client/asset-resources.ts` estimates decoded images at
four bytes per natural pixel. Ship cache ownership is limited to 256 MiB, leaving
room above the measured ship working set; scenery ownership is limited to 64 MiB,
leaving headroom above the measured scenery set rather than retaining the whole
catalog at once. Resources used in the last two seconds are retained even
above budget. Idle zero-byte failures/loading records also have count limits.
Image eviction removes cache ownership; it never clears an image still used by
a Sprite. Two large scene-specific sheets are requested only in the scene that
uses them rather than retained eagerly for every captain.

`audioResourceUsage()` reports cached PCM bytes, active-source bytes and their
deduplicated union. The 64 MiB decoded audio cache accommodates the measured
48 MiB login track plus short effects. Playing music, ambience and sound effects
retain their own buffers after eviction. Radio HTMLMediaElement buffering is
browser-owned and is not part of this PCM cache. Pending loads are capped at 64, settle
on both success and failure, and failed requests back off for 30 seconds. Failure
diagnostics retain at most 128 resource keys. Audio falls back to silence, while
missing/corrupt ship sheets retain a visible neutral shape and existing controls.

Procedural resources have separate ownership ceilings: 32 MiB each for legacy
body and mining-rock canvases, 1 MiB for colored glow canvases, 32 MiB for native
ship embellishments and 16 MiB for native projectile frames. These limits replace
unbounded or count-only policies; all use the same two-second live-resource
protection. `proceduralResourceUsage()` and the scene display's `resourceUsage()`
expose their retained canvas estimates. The existing planet-lighting budgets
remain separate. These are cache-growth guardrails, not a promise to hold the
whole browser below their sum: active consumers, decoded image copies, GPU
textures, browser overhead and audio mixer internals can retain additional data.

On a restored graphics context the client disposes the old Excalibur display
engine, including its texture collector, and rebuilds the scene on the same
canvas. It preserves the connection and authoritative client state, sends neutral
manual input and requires held controls to release before resuming. Four real
WebGL loss/restoration cycles and renderer pixel checks run in Chromium CI.
Canvas2D handlers use its native context events, but a real 2D driver reset is not
forceable by this fixture. A driver that does not restore still requires reload;
physical GPUs, mobile devices and audible playback remain separate validation.
Losses lasting over a second show a short recovery notice with a Reload button;
it disappears automatically when drawing resumes.

