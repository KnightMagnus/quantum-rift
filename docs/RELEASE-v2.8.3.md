# Quantum Rift v2.8.3 — Catalog Artwork Recovery

## Changes

- Ship and outfit imagery in Codex, shipyards, outfitters, drydocks, specialist panels and ship information uses release-versioned URLs. An old cached failure no longer shares a URL with the new release's artwork.
- Unversioned catalog artwork requests now revalidate. Matching release-versioned requests retain the existing one-day cache. WebP responses use `image/webp`.
- No artwork is replaced, and no combat, newcomer-protection, galaxy-map or scenery behavior is changed.

## Verification

The complete GitHub-downloaded v2.8.2 package has valid artwork: all 121 ship portraits and 73 outfit icons decode in Chromium on a cold load. The catalog UI uses ordinary image elements, not a shared JavaScript image loader.

A real HTTP proxy primed Chromium's normal cache with cacheable HTTP-200 LFS-pointer responses for every ship except seven seeded working assets: Gnat Skiff (703), Dory Hauler (704), Cutlass Interceptor (708), Pilgrim Liner (714), Swift Courier (821), Sabre Corvette (823), and Monarch Executive Yacht (827) and every outfit except five seeded working assets: Mite Drone (603), Passenger Seating Pack (9020), Reinforced Lattice V (564), Capacitor Bank V (569), and Mite Drone Bay (602). After restoring valid server responses, v2.8.2 still displayed only 7/96 Codex ships, 8/25 shipyard images (seven cards plus the selected Gnat portrait) and 5/57 outfitter icons. Every failed shipyard portrait also failed in Codex, and a missing ship's detail portrait failed. This reproduces the reported partial-image pattern despite valid server files.

With the patch, both a cold browser and the same bad-cache scenario decode all 194 catalog assets. Actual UI checks pass for 96 Codex ship rows, a formerly missing detail portrait, 25 shipyard images including the selected portrait, all 24 shipyard selection/detail transitions, 57 offered outfitter icons, 35 Codex outfit rows and 38 Codex weapon rows. Solo departure enters normal flight without page errors.

The cache regression establishes a reproducible failure and recovery, not a diagnosis of an uninspected browser or save. An older running server can also expose earlier behavior; confirm the server version before investigating artwork or Combat Assist.

## Reproduce browser regression

Playwright is optional and supplied separately, not a new game runtime dependency:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
POISON_CACHE=1 EXPECT_FIXED=1 \
node test/catalog-browser.ts "$PWD" /absolute/evidence/directory
```

Omit `POISON_CACHE` for a cold load. For the v2.8.2 negative control, point the first positional argument at the extracted complete v2.8.2 release and omit `EXPECT_FIXED`; the harness asserts the partial failures. The test creates a disposable Solo save and local servers on ports 18896 and 18897. It does not modify existing saves.

## Download and run

Use the attached complete `Quantum-Rift-v2.8.3.zip`, not GitHub's source-code archive. Stop the older Quantum Rift command window before starting the new folder, and confirm the login screen reports 2.8.3. Preserve existing saves.
