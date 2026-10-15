# Quantum Rift v2.8 — Hail to the Code

## Release summary

This release gathers the updates since **v2.6 "Together"**. It adds livelier communications, optional fleet combat automation and refreshed weapon data, alongside the engineering maintenance already merged upstream.

### In the cockpit

- Outgoing NPC hails vary with the ship's identity, task, location, damage and relationship. Ordinary traffic and the thirty named captains can initiate calls without opening a modal: an amber perimeter badge waits until you choose to answer.
- Fuel and hardship requests, friendly greetings and security warnings, plus local-port escorts, approximate hazard intelligence and distress rendezvous. Assistance requires explicit acceptance and fresh server validation.
- Same-system player hails use the familiar dialog and a 100-character composer, respecting privacy, blocking and rate limits. Trading remains a station feature.
- System-only player chat also appears as a short-lived speech bubble above the sender's active ship, without changing the chat log or exposing private/global/Armada messages.
- Optional combat assist reuses the NPC flight/combat behaviors. Fleet focus and target succession work with manual takeover and Hold Fire. Follow Leader combat delegation is opt-in; independent Armada members retain control. Estimated odds count participating fleet/Armada ships rather than the lead alone.

### Data and maintenance

- Fifteen inherited weapons have newly authored names, descriptions and tuning. Stable IDs, mounts and ammunition references preserve existing saves and loadouts. Updated title-screen, README and game-data terminology accompanies the refresh; this is not a claim about rights to every project asset.
- Explicit server-feature composition, JSDoc/type contracts and feature-inventory checks replace the old prototype-mixin wiring.
- Prettier, Husky, Git LFS asset rules and the upstream formatting/type/feature-contract CI workflow are included. This does **not** claim the separate unmerged Node-matrix/release-ZIP or 39-file readability branches.
- The README and changelog are maintained again, with restored existing screenshot files and four actual screenshots of the running v2.8 communications/combat UI.
- The radio is unchanged. Phone-layout support, unapproved encounter proposals and radio replacement are not part of this release.

## Commit and publication handoff

**Release target:** the verified final commit linked in this update’s pull request; its full SHA is supplied in the release handoff.

No tag or release has been created by this documentation change. The user will publish the release manually, using the release summary above and that exact commit ID. If the PR is squash-merged or otherwise rewritten, use the resulting upstream `main` commit that includes this update instead of the obsolete PR-head SHA.

Before publication, confirm package and lockfile versions are `2.8`, required checks pass for the chosen commit, and the README images render. Do not describe local tests as hosted checks or attach unverified release ZIPs.

## Scope evidence

Cumulative baseline inspected: `v2.6` through upstream `2f6494d` (combat assist), plus the communications/weapon/documentation update in this PR. Merged changes include `79bf9fc` (explicit features/JSDoc), `1e22c91` (formatting/Husky/CI/LFS) and `7bcd9c6` (combat assist). Current upstream has one `.github/workflows/ci.yml` workflow, not the separate release-publication pipeline.

Detailed behavior and limits: [communications](HAILING.md), [weapon mapping](WEAPON-REFRESH.md), [changelog](../CHANGELOG.md).

Screenshot provenance: the restored gallery images are byte-for-byte from commit `a249bb5`; the four new captures were produced by headless Chromium against the current local disposable-server build at 1440 × 1000. Matching binary art was served from the independently retained playtest build because existing upstream LFS objects were unavailable. No game-art pointers were rewritten.
