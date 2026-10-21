# Quantum Rift 3.3.1 — Maintainability cleanup

This maintenance release reorganizes existing behavior without redesigning the HUD
or changing gameplay rules, pricing, rewards, audio or save formats.

- Add a code-navigation guide, ownership map and worked job-acceptance trace.
- Move client-action routing into an explicit handler table with live core
  capabilities, retaining authentication, activity and docked-action checks.
- Give ordinary job offers, acceptance and landing completion one service owner.
- Give market, materials, shipyard and outfitter operations one port-service owner.
- Split the main stylesheet into ten ordered sections. Existing cascade order,
  declarations and relative asset paths are preserved.
- Repair the legacy Solo-mode CSS test to follow stylesheet imports. Browser
  coverage additionally verifies that CAPTAINS hides in Solo presentation and
  returns online.

The core Game still owns substantial shared state and legacy feature bodies.
This is incremental cleanup, not a complete rewrite or exhaustive type coverage.
See [code navigation](CODE-NAVIGATION.md) and [regression coverage](TEST-COVERAGE.md).

The separate HUD draft is not included. Its longer newcomer notice, redundant JOBS
note removal and shipyard cargo-comparison correction follow this release.

## Updating

Download the complete game ZIP and extract it. Node.js 18 or newer is required;
no dependency install or build step is needed to play. Close the previous game
server before starting the new copy and preserve existing `data/` and `solo-data/`
save folders. Use the included Windows or macOS/Linux launchers as before.
