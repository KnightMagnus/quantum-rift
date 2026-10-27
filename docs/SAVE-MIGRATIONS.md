# Save compatibility and restore rehearsal

Local Solo and friend games use the existing player/world checkpoint journal.
Online games use one private Nakama checkpoint guarded by CAS. Neither this
catalog nor the restore verifier introduces another live save store.

## Existing owners

[The migration catalog](../server/save-migrations.ts) identifies existing owners,
markers and lifecycle boundaries. Its order is an inventory, not an execution
schedule. Tutorial, hangar, co-op, dock, hostile, story, Syndicate and arc setup
still run at their existing login or operation boundaries. Social and specialist dictionaries initialize at their existing operation boundaries.
Frontier, rival and living-world containers initialize during construction. Mining,
refinery, industrial and towing retain their detailed world/hull validation and initialization.
Co-op compatibility includes economic refunds; running it outside its existing
marker checks can duplicate rewards.

Catalog format version 1 defines the explicit rehearsal order:
`cargo-ledger-v1`, then `tutorial-v2`. This is a supported tool subset, not a
replacement for Game's live lifecycle. The schema-2 report includes `catalogVersion` and
`checkedMigrations` so results identify exactly what ran.

The verifier executes `cargo-ledger-v1` through the existing
`migrateCargoLots` owner on detached account copies. Missing legacy ledgers become
common-grade lots while existing totals remain unchanged. Valid version-1 grades
are retained. Mismatched totals and unknown ledger versions reject the rehearsal.
The catalog has no global saved-game version; application release numbers do not
stand in for feature schema markers.

The second rehearsal invokes the existing `tutMigrate` owner. Missing, null, zero
and version-1 tutorial markers retain the owner's legacy interpretation; version 2
is current. Legacy indices through 8 stay unchanged, 9–15 move forward two, and
later indices move forward three. Missing progression stays missing. Completed
guide sentinels above the current list length remain valid. The rehearsal rejects
other versions, negative/fractional/nonfinite indices and legacy integer overflow
before executing either owner. The same tutorial checks also run at local/native load, import and login boundaries.

Local database startup rejects malformed JSON, invalid snapshot envelope shapes
and read failures other than a missing file. Missing snapshot files retain the
fresh-file defaults. A committed journal takes precedence over stale snapshots;
both journal payloads must have valid envelope shapes before either is restored.
[Feature validation](../server/save-validation.ts) checks present compatibility fields
before any owner can default them or pay refunds. It covers numeric economy fields,
tutorial markers, hangar/dock containers, co-op directives and markers, social lists,
Syndicate values, specialist resources, story/arc progress, holdout records and
world container/version shapes. Fractional mastery progress remains supported.
Collections are bounded at 100,000 entries; unknown append-only fields remain intact.
Missing/null legacy default fields stay with their existing owner. Economy fields
cannot be null or nonnumeric. This is bounded compatibility validation, not an
exhaustive validator for every saved field. Detailed version-1 world validation
remains with mining, refinery, industrial and towing.

Local journal recovery checks these fields before rewriting either snapshot.
Native checkpoint loads check them before Game construction. Solo import checks a
detached copy before replacing a slot or claim; login checks before binding the
account to the session or running migrations. Rejection does not repair balances,
pay partial refunds or replace the original account.

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
cargo and tutorial on detached accounts, checks idempotence, checkpoints, reopens and compares
players/world state. The disposable directory is removed on success or failure.
The original source files are never opened for writing. Keep the source stopped:
the final byte comparison detects changes but cannot make a live backup atomic.

Successful JSON output contains source hashes, account counts and check names,
not account names, credentials or save contents. Failure returns a fixed error
category and a nonzero exit status, without printing parser excerpts. The report
is a numeric rehearsal result, not a backup or a migrated player save.
`changedAccounts` counts accounts changed by either rehearsed owner.

## Supported evidence and limits

Committed fixtures in `test/fixtures/save-migrations/` are synthetic compatibility
shapes, not captures from historical release archives. They cover missing cargo
ledgers, current mixed grades, corrupt totals, an unsupported ledger version and
tutorial marker/index boundaries. A separate legacy co-op fixture combines old
fleet/directive fields with current fresh-account defaults. Committed feature cases
also cover absent pre-feature defaults, retired stored-escort presets and retained
story/arc/holdout/specialist progress. Real login and two save/reload cycles check
exact dock refunds, unchanged inventories/progress and consumed markers.
The registered regression checks original-byte preservation, late-account
rejection, journal precedence, malformed/unreadable snapshots and five actual
local journal fault boundaries followed by reopen and retry.

The registered test also runs the production `NakamaDatabase` against a detached,
in-memory CAS backend. Cargo/tutorial migration checkpoints are interrupted before
commit and after commit with a lost acknowledgement. Frozen writers cannot retry;
a fresh database reads the committed marker and state, repeats only uncommitted
work, and rejects a stale migration writer. A second drill runs Game construction's
legacy fleet-bank/founding-fee refunds and the account co-op directive-refund owner
through those same failures and repeated restarts. It checks exact balances,
removed legacy fields, saved markers and log counts, not just successful startup.
The account owner is invoked directly at its login boundary; the drill does not
exercise native authentication or transport.

## Native recovery procedure and limits

After a checkpoint write error, leave the failed writer frozen. Do not retry the
migration from its in-memory state or compensate balances: the write may already
have committed. Retire the old VM, then start one replacement world writer through
the normal singleton/CAS ownership path. Its `NakamaDatabase` reads the durable
checkpoint before Game construction. Compare the loaded feature markers and
balances in a private disposable environment before enabling player access. A
stale writer must lose CAS; it must not replace the checkpoint or merge accounts.

The fixture drill verifies that application-level sequence, not a production
backup restoration. PostgreSQL backup/restore, operator tooling for isolated
checkpoint export/import and old/new binary archive matrices are not implemented
by this verifier. Preserve the full database backup and server build together;
do not edit checkpoint revisions, storage versions or markers to force an import.
See [native storage guidance](NAKAMA.md#durable-state-and-migration-limits) for
ownership and legacy migration API limits.

The CLI does not start Game, log in, run co-op or other feature migrations, restore
Nakama/PostgreSQL, or reverse a migration. Existing import/login, beta generator
and native transport regressions remain separate evidence. Full
feature-schema validation and old/new executable archive-matrix restore drills
are not covered here. Cross-version upgrade/rollback support must not be inferred
from a successful rehearsal. Follow [release readiness](RELEASE-READINESS.md)
and [native storage guidance](NAKAMA.md) for their separate procedures.
