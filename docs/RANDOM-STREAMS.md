# Gameplay random streams

The world checkpoint owns version-one `randomStreams`: a root seed and the current
32-bit state of each initialized named stream. Legacy saves without this field draw
one root seed on first use and keep their existing accounts, active economy states,
cooldowns and generated galaxy. Unknown versions or invalid states fail instead of
silently resetting a sequence. No player identity or credential uses these streams.

`living-economy` owns all living-state selection, kind, duration and war-enemy draws.
It uses mulberry32. Each `simulation:<system-id>` owns Space traffic, movement,
weapon spread and loot draws, using the LCG32 algorithm used by the fixed simulation
fixtures. Stable system IDs, not market indexes or encounter creation order, identify
simulation streams. Seed derivation is FNV-1a(identity) XOR imul(rootSeed, 0x9e3779b1).
Changing an identity, algorithm or derivation requires a new schema version.

Every draw updates the world record and marks storage dirty. Local journal snapshots
and authoritative Nakama checkpoints therefore save the same state. Reload or service
restart resumes at the next draw in each saved stream, regardless of process entropy.
Reconnect does not recreate streams. Uncheckpointed draws can be lost on a crash,
just like other uncommitted world changes. Restart does not recreate the exact live
ships or rewind the clock; stream continuity is not full simulation replay.

## Global-random inventory and migration boundary

The inventory below covers server/shared runtime call sites before this migration.
Tests, tooling and client presentation randomness are outside authoritative gameplay.

| Call sites                                                                                      | Owner and boundary                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `living.ts` system-state selection                                                              | Dedicated persisted economy stream; no ambient draws after root initialization.                                                                        |
| `space.ts` range/pick helpers, traffic, AI, spread, drops                                       | Persisted per-system simulation streams. Waking another system cannot shift this system.                                                               |
| `game.ts` arrival/reward draws; `features.ts` refinery rewards                                  | Ambient gameplay outside Space; not consumed by economy warmup.                                                                                        |
| `arcs.ts`, `story.ts`, `nhal.ts`, `coop.ts`, `fronts.ts`, `frontier.ts`, `jobs.ts`, `quests.ts` | Ambient encounter placement and rewards outside Space; not promised to replay independently of other feature actions.                                  |
| `hail.ts`, `hail-service.ts`, `hostile.ts`, `rivals.ts`                                         | Ambient dialogue, hostile rewards/spawn choices and rival careers. Their deterministic characterization remains separate from Space's stream contract. |
| `fleetcmd.ts`, `hangar.ts`, `specialists.ts`, `station-service.ts`, `syndicate.ts`              | Ambient fleet/reward/progression draws; deferred from this isolation boundary.                                                                         |
| `shared/traffic-variety.ts` default roll                                                        | Space supplies its own explicit roll. Other callers may use the ambient default.                                                                       |
| `shared/deterministic-random.ts`, mining/galaxy/mission generators                              | Existing explicit seeded algorithms remain unchanged.                                                                                                  |
| Host UUID, password salts/hashes, authentication/session tokens                                 | Host security randomness remains unchanged and must not use gameplay streams.                                                                          |

Economy allocations may differ when the market roster changes: a local war or pirate
state is a simulation input, not RNG interference. Comparisons hold that local input
fixed while retaining all added markets in the extended run. Per-system streams
isolate random sequences, not changes to factions, geometry, loadouts or rewards.
