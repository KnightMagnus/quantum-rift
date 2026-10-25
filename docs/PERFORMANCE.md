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
