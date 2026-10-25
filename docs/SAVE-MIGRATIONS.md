# Save compatibility and restore rehearsal

Local Solo and friend games use the existing player/world checkpoint journal.
Online games use one private Nakama checkpoint guarded by CAS. Neither this
catalog nor the restore verifier introduces another live save store.

## Existing owners

[The migration catalog](../server/save-migrations.ts) identifies existing owners,
markers and lifecycle boundaries. Its order is an inventory, not an execution
schedule. Tutorial, hangar, co-op, dock, hostile, story, Syndicate and arc setup
still run at their existing login or operation boundaries. Mining, refinery,
industrial and towing retain their world/hull validation and initialization.
Co-op compatibility includes economic refunds; running it outside its existing
marker checks can duplicate rewards.

The verifier executes only `cargo-ledger-v1`, through the existing
`migrateCargoLots` owner on detached account copies. Missing legacy ledgers become
common-grade lots while existing totals remain unchanged. Valid version-1 grades
are retained. Mismatched totals and unknown ledger versions reject the rehearsal.
The catalog has no global saved-game version; application release numbers do not
stand in for feature schema markers.

Local database startup rejects malformed JSON, invalid snapshot envelope shapes
and read failures other than a missing file. Missing snapshot files retain the
fresh-file defaults. A committed journal takes precedence over stale snapshots;
both journal payloads must have valid envelope shapes before either is restored.
This is structural validation, not full validation of every feature field.

## Rehearse a stopped local backup

Stop the source process and preserve the whole data directory, including any
`checkpoint.json`. Never combine player/world files from different checkpoints.
Use synthetic or consented copies. Create a private scratch directory outside the
source save, then run:

```sh
mkdir -m 700 /private/restore-scratch
node tools/save-restore-verify.ts /private/stopped-save /private/restore-scratch
```

The command reads regular `players.json`, `world.json` and optional
`checkpoint.json` files. It refuses an incomplete snapshot pair unless a journal
is present, and refuses scratch storage inside the source directory. It copies
the inputs into a disposable directory, recovers the journal there, migrates
cargo on detached accounts, checks idempotence, checkpoints, reopens and compares
players/world state. The disposable directory is removed on success or failure.
The original source files are never opened for writing. Keep the source stopped:
the final byte comparison detects changes but cannot make a live backup atomic.

Successful JSON output contains source hashes, account counts and check names,
not account names, credentials or save contents. Failure returns a fixed error
category and a nonzero exit status, without printing parser excerpts. The report
is a numeric rehearsal result, not a backup or a migrated player save.

## Supported evidence and limits

Committed fixtures in `test/fixtures/save-migrations/` are synthetic compatibility
shapes, not captures from historical release archives. They cover missing cargo
ledgers, current mixed grades, corrupt totals and an unsupported ledger version.
The registered regression checks original-byte preservation, late-account
rejection, journal precedence, malformed/unreadable snapshots and five actual
local journal fault boundaries followed by reopen and retry.

This rehearsal does not start Game, log in, run other feature migrations, restore
Nakama/PostgreSQL, or reverse a migration. Existing import/login, beta generator,
native CAS/freeze and persistence regressions remain separate evidence. Full
feature-schema validation and old/new executable archive-matrix restore drills
are not covered here. Cross-version upgrade/rollback support must not be inferred
from a successful cargo rehearsal. Follow [release readiness](RELEASE-READINESS.md)
and [native storage guidance](NAKAMA.md) for their separate procedures.
