# Performance and health measurements

Diagnostics are off by default. They collect numeric timings, sizes and counts,
not captain names, packets, chat, passwords, save contents or exception messages.
They do not change simulation order, storage authority, checkpoint recovery or
transport admission rules. Snapshot optimizations are described separately below.

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
- `snapshotBuildMs` measures shared system snapshot construction, visibility eligibility and
  reusable public JSON encoding when the system has no private story entities.
  `snapshotSerializeMs` includes construction of each flying recipient's payload
  and recipient JSON serialization. Public arrays are encoded once only when
  every recipient has the same visibility; private story systems retain individual
  filtering and serialization. Total snapshot work remains in `snapshotsMs`. `snapshotBytes` counts UTF-8 JSON bytes
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

The [accelerated baseline](performance-baselines/accelerated-fde394b.json) retains
all six scenario results from clean source
`fde394bd192868ba65bc878214ec0abe71741bed` on the shared EPYC host described below.
Five scenarios measured 900 ticks each; the soak measured 108,000 ticks (one
simulated hour, about 5.45 seconds of measured execution). The artifact includes
seeds, warmup counts, hardware, stage timings, bounded metric windows and final
fixture outcomes. Every scenario completed without a tick failure, space failure
or checkpoint freeze. Reproduce it with `RIFT_PERF_SOAK_TICKS=108000` and the
baseline command above. This is not a one-hour wall-clock stability result.

The [browser baseline](performance-baselines/browser-fde394b.json) retains the
four actual Engine fixture reports from the same source: requested WebGL at DPR 1
and 2, Canvas at DPR 1, and automatic renderer selection at DPR 2. It records
Chromium version, actual renderer, viewport, host and hashes of the served Engine,
scene and entry modules. These are headless CPU-hook observations from mixed
lifecycle activity, not GPU completion times, a frame-rate budget or evidence for
physical-device performance. Run `node test/excalibur-runtime-browser.ts` after
building to collect new reports; captures and server logs stay outside these
numeric baseline files.

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
1–30 captains and an unsigned 32-bit client seed. Invalid or duplicate arguments
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

## Explicit budget profiles

`tools/performance-budgets.ts` checks repeated native numeric reports against an
explicit JSON profile. It does not choose targets from a baseline. A profile may
define intended deployment limits or a measured-host regression alarm; the latter
is not evidence that deployment targets have been met. Select the hardware, runtime
versions, workload and acceptable limits before using it:

```sh
node tools/performance-budgets.ts /private/deployment-profile.json \
  /private/artifacts/native-run-1.json /private/artifacts/native-run-2.json
```

The profile has exactly these fields:

- `schema`: `1`.
- `name`: a nonempty hardware/workload label, at most 120 characters.
- `environment`: exact `platform`, `arch`, `cpuModel`, `logicalCpus`, `node`,
  `sdk`, `nakama` and `postgres` values from the native report's `metadata`.
  `logicalCpus` is a positive integer; the other fields are nonempty strings.
  An `unavailable` runtime or hardware value is rejected.
- `workload`: exact `durationSeconds`, `captains` and `seed`, within the native
  harness's limits above.
- `minimumRuns`: an integer from 2 to 100.
- `budgets`: one or more positive, finite upper limits from the supported metrics
  below. Unknown fields, misspelled metrics and newer schemas are rejected.

Supported metrics are `tickP95Ms`, `tickMaxMs`, `checkpointP95Ms`,
`snapshotGapP95Ms`, `sendDriftP95Ms`, `reconnectToFlightMs`, `restartToFlightMs`,
`nativeResidentKiB` and `checkpointBytes`. Health metrics use the largest reported
window percentile or lifetime maximum, not a percentile pooled across windows.
Snapshot gaps use the largest connection's retained-window p95, including
setup/reconnect/restart traffic. Connections with fewer than two snapshots have
no interval and are excluded; at least one measured interval is required. Send drift uses its retained-window p95.
Native resident memory is the pre-restart Nakama sample, not a lifetime peak.
Checkpoint bytes are the stored pre-restart checkpoint size, including database
JSON encoding. These meanings differ from in-process fixture measurements.

Every report must be from the same clean source commit, emitted runtime hash,
source-input fingerprint and exact selected environment/workload. Repeated start timestamps are rejected. Each report must
show its full measured duration, expected input count, restored captains, a real
checkpoint, zero SDK/authority failures and successful process cleanup. Any
missing requested metric or any run exceeding its limit fails; averaging cannot
hide an outlier. The verifier prints a numeric summary and fixed failure codes,
exits 0 on success and 1 on failure. It starts no services and changes no report.
Input files must be ordinary JSON files no larger than 4 MiB.

`npm run build` writes `dist/nakama/quantum-rift.provenance.json` next to the
native runtime. The manifest records its SHA-256 and a fingerprint of sorted,
portable input paths and digests. The build captures the exact bytes passed to
esbuild, plus `tools/build-nakama.ts`, the provenance helper and `package-lock.json`;
it rejects inputs changed during bundling. Symlink-resolved dependencies use
portable `node_modules/` paths, not another checkout's absolute directory.

Native performance preflight checks that manifest, every current input and the
runtime before creating fixture directories or starting services. The CLI also
checks before reserving its report file. Missing, changed or stale builds require
`npm run build`; they are not measured with a current source label. Verified
runtime bytes are pinned for the service copy, so a concurrent rebuild of ignored
`dist` cannot silently change the measured artifact. Numeric reports include only
`runtimeSha256` and `sourceFingerprint`, not the input inventory or source bytes.
The budget verifier rejects missing/malformed hashes and mixed artifacts even
when source commits match. Reports made before those fields existed need new
measurements; hashes cannot be inferred retroactively.

This is a local build-integrity check, not a signature or a trust boundary against
someone able to rewrite both code and manifest. It fingerprints the declared
build-tool source and lockfile, not every installed compiler byte or the operating
system. The existing runtime/binary versions and environment checks still apply.

A matching CPU model and logical CPU count do not establish exclusive access,
CPU allocation, thermal conditions, network path or representative database load.
Inspect report load and repeat on the intended deployment before adopting a
profile. A passing profile covers only its measured native workload; it does not
establish browser performance, distributed/combat/mining native capacity or
multihour stability. No deployment latency profile is supplied while the intended
hardware and workload remain unspecified. Shared-host CI tests verifier behavior
with synthetic measurements and retains the existing payload-growth guards.

## Thirty-player instance target

A native game instance admits at most 30 simultaneous connections. The join-attempt
callback rejects a full instance; the join callback checks again so a batch of
accepted attempts cannot exceed the limit. Duplicate joins do not allocate extra
Game sessions. A new connection for the same authenticated captain may replace
its old presence even when the instance is full. The old presence receives the
existing displaced-login message and is retired before the replacement is
allocated; its delayed leave callback cannot remove the replacement.
Disconnected captains retain the existing docking and save rules.
This is an admission limit, not evidence of smooth play on arbitrary hardware.

A provisional single-instance host is four modern dedicated vCPUs, 8 GB RAM and
SSD storage, including the database. The baseline host recorded in each report is
a shared machine, not proof that this proposed allocation is sufficient. Choose a
region near the players and repeat the workload on the intended host before deployment.
No GPU is needed for the headless server; browser rendering must be measured separately.

The native tool accepts `--captains=30` and exercises all 30 actual SDK connections,
flight input, one reconnect and checkpoint/restart continuity. Use two independent
300-second runs with the same clean build for a bounded full-instance baseline.
The default short CI workload remains small; it does not impersonate a capacity test.

Set `RIFT_PERF_CAPTAINS=30` for all six accelerated scenarios. Those runs cover
concentrated/distributed captains, NPC combat, mining/towing and reconnects with
production simulation, but use counting connections and memory CAS rather than
native network/database latency. Thirty-player concentrated/distributed cases are
also part of the registered health regression. Their 512 KiB checkpoint ceiling
is a fixture growth guard, not a PostgreSQL latency or production save quota.

Native profiling at 30 captains identified snapshot processing, including the
opt-in byte counter, as the dominant measured stage. The
[pre-optimization report](performance-baselines/native-preoptimization-30-300s.json)
retains that observation at clean source
`95722080fdf54c079e52f413621c3ceedd90bd1f`. It predates emitted-runtime digest
receipts and cannot satisfy the current budget verifier. It documents the choice
of hot path, not a controlled speedup comparison with later runs on the shared host.
UTF-8 measurement now skips
ASCII runs in the host regular-expression engine while preserving exact Unicode
and lone-surrogate byte counts. Encoding the unrestricted public snapshot once
per system avoids repeating the same array serialization for each captain.
Recipient fields and systems with private story entities retain their individual
paths. These changes do not batch, reorder or defer network delivery.

## Retained thirty-player lab baseline

The two [numeric reports](performance-baselines/native-30-300s-1.json) and
[repeat](performance-baselines/native-30-300s-2.json) were collected sequentially
from clean source `0d28a12fc0342674aed77bd9de27378af1b65333`, built once after
integration with main at `07c0876`. Both record identical emitted-runtime SHA-256 and
source-input fingerprint. JSON whitespace is formatted for the repository; numeric
values and fields are unchanged from the private originals. Only sanitized numeric
reports are retained, not fixture logs, configuration, credentials or saves.

Each run measured 300 wall-clock seconds, 30 actual SDK connections and 90,000
scheduled inputs, restored all 30 captains after restart, and exited all six
service/helper processes cleanly. Both passed the harness's continuity and error
checks. The host was shared Linux x64, AMD EPYC 4344P, 16 logical CPUs and about
61.4 GiB total memory; this is not an isolated four-vCPU/eight-GB allocation.
The reports retain host load, runtime versions and bounded metric windows.

The [shared-host profile](performance-baselines/shared-host-30.json) is an executable
regression alarm for that exact environment and workload, not a deployment SLO.
Run the offline check with:

```sh
node tools/performance-budgets.ts docs/performance-baselines/shared-host-30.json \
  docs/performance-baselines/native-30-300s-1.json \
  docs/performance-baselines/native-30-300s-2.json
```

| Metric                                         | Worst repeat observation |     Lab alarm |
| ---------------------------------------------- | -----------------------: | ------------: |
| Largest retained tick-window p95               |                    59 ms |         75 ms |
| Lifetime tick maximum                          |                   116 ms |        150 ms |
| Largest retained checkpoint-window p95         |                    16 ms |         20 ms |
| Largest connection's retained snapshot-gap p95 |                283.15 ms |        375 ms |
| Retained send-drift p95                        |                  1.73 ms |          3 ms |
| Reconnect to flight                            |                556.81 ms |        700 ms |
| Restart to all captains flying                 |             15,175.88 ms |     19,000 ms |
| Sampled pre-restart Nakama resident memory     |              166,300 KiB |   212,992 KiB |
| Stored checkpoint size                         |            115,184 bytes | 147,456 bytes |

Each alarm starts at 125% of the worst observation across the two runs, rounded
upward: tick p95/checkpoint p95 to 5 ms, tick max/snapshot gap to 25 ms, send drift
to 1 ms, reconnect to 100 ms, restart to 1,000 ms, and memory/checkpoint size to
16,384 of their stated units. This leaves explicit headroom for small workload and
scheduling variation while flagging larger growth. Two runs do not characterize
the shared host's noise distribution; an alarm needs investigation, not automatic
threshold regeneration. Future comparisons must supply two new same-clean-build,
same-artifact reports; the verifier must not mix the archived source with a new build.
The registered budget regression verifies these retained artifacts offline, but
ordinary CI does not rerun this five-minute workload or enforce live timing.

The observed 59 ms tick-window p95 exceeds the 33.33 ms simulation cadence.
Neither passing the 75 ms lab alarm nor completing the workload establishes smooth
30-player play. Snapshot intervals also include setup, reconnect and restart and
are not round-trip latency. No controlled percentage improvement is inferred from
older runs with different sources, durations or competing host load. Dedicated-host
repeats, representative combat/mining/distributed activity, browser rendering and
longer soaks remain necessary before a production hardware or smoothness claim.

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
