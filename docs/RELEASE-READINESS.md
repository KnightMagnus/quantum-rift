# Release readiness and rollback

## Commit and artifact evidence

The CI **Release readiness** check fails unless quality, all server shards, the
Chromium browser aggregate, native Windows startup, the Windows save-generator
EXE, Firefox/WebKit smoke and extracted-archive smoke all succeed for that workflow
commit. Existing aggregate/check names remain unchanged. The readiness JSON names
the SHA and lane results; the artifact build manifest records every file and the
complete ZIP's SHA-256. Download the reports and runtime evidence from that same
workflow run. A successful aggregate does not publish a release.

The complete archive is built once on Linux, then those identical bytes are
verified and extracted on Linux x64, Windows x64 and Apple Silicon macOS. Runtime
checks do not run `npm install` in the extracted game. They import a synthetic
Solo captain, log in, buy a commodity, export, stop and restart, and compare the
saved credit balance. Shutdown uses an inherited launcher IPC channel and requires
a clean exit after the local database flush, including on Windows where process
termination does not deliver SIGTERM handlers. It exposes no network shutdown
endpoint. These checks do not exercise every OS/browser combination or native
Nakama on every OS. The existing packaged-runtime regression separately exercises
extracted Solo, friend authentication/persistence and native Nakama flight.

The verifier rejects mismatched hashes, missing/extra/duplicate paths, unsafe
paths, symbolic links, unresolved LFS pointers and file mode/content differences
before writing extracted files. Keep the manifest beside the ZIP. Its hashes
establish byte identity, not independent publisher authenticity; use the trusted
CI/release record when obtaining the manifest.

## Supported scope and manual checks

- Full gameplay browser regression: pinned Playwright Chromium on Linux.
- Narrow Firefox and WebKit engine smoke: Linux headless login, keyboard controls,
  Settings/chat input isolation, canvas fallback and playable exported/imported
  Solo saves. Playwright WebKit is not certification of shipping Safari.
- Built-archive Solo startup/login/save/restart: native Linux x64, Windows x64 and
  macOS ARM64 runners. Other listed runtime downloads are not equivalent coverage.
- Windows beta save-generator EXE: build with pinned PyInstaller and execute its
  CLI export; this does not certify every native Tk interaction.

Before publishing, inspect actual captures at 1920×1080 and 3440×1440, keyboard-only
focus/Escape and readable zoom, screen-reader names and dialog announcements.
Exercise real touch and gamepad hardware and listen for clipping, harsh cues and
platform autoplay behavior. Record device/browser versions, pass/fail and gaps in
the release evidence; do not replace these checks with emulated-device claims.

A weekly workflow installs the pinned runtime and exact npm lockfile on the three
native runner families, then checks command contracts. It detects compatibility
or distribution failures of pinned inputs; it neither upgrades dependencies nor
establishes compatibility with unpinned future versions.

## Upgrade and rollback rehearsal

Stop the old process before copying a save directory. Back up the complete Solo
or friend data directory while stopped, including any pending checkpoint journal;
never mix `players.json` from one checkpoint with `world.json` from another.
Preserve the old archive and its manifest separately. Native online saves live in
Nakama/PostgreSQL; use the guarded migration and rollback procedure in
[NAKAMA.md](NAKAMA.md), not a local JSON copy.

Use only synthetic or consented copies for rehearsal. Start the candidate against
a copy, log in, verify captain/credits/cargo/station ownership, mutate and save,
restart and verify again. Leave the pre-upgrade backup untouched. To roll back,
stop the candidate, restore the _entire pre-upgrade copy_ into a separate directory,
and launch the prior verified archive against it. Never point old code at a newer
save schema unless a reviewed reverse migration explicitly supports it. Verify
login and state again before resuming play. This loses candidate-only progress;
retain that directory for recovery rather than overwriting it.

Current automated evidence covers same-version exported/imported saves, journal
recovery and guarded native legacy rollback. Version-catalog migration/restore
fixtures from issue #84 must be wired into the artifact matrix before claiming
cross-version upgrade/rollback coverage. A release requiring a schema transition
is not ready on same-version smoke alone.

## Repository rules

Do not rename or remove existing checks to install the new aggregate. Before
changing required checks, inspect repository rulesets and main branch protection
with the repository administrator; an empty ruleset result or a protection 404
with limited credentials is not proof that no external merge policy exists.
Publishing, deployment and changes to branch requirements remain separate actions.
