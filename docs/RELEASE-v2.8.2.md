# Quantum Rift v2.8.2

## Combat Assist, map stability and scenery

- **Combat Assist:** selecting a legal neutral NPC before enabling Assist starts pursuit and primary fire, including ordinary Dory traffic and named captains in Solo inner space. Assist turns and applies thrust even when the player ship already has sideways drift. Passive defense still requires an actual hostile attacker; own-wing and player protections remain unchanged.
- **Galaxy map:** hovered-system details occupy a stable, scrollable footer instead of shrinking or expanding the canvas when text wraps. The complete details remain available to mouse and keyboard users, including market and service information.
- **Gas giants:** opaque planet disks hide the sun and background scenery behind them while atmosphere and ring edges retain their own transparency.
- **Comets:** slower continuous motion, soft procedural nuclei, separate curved dust and blue ion tails pointing away from the actual rendered sun, and background layering behind planets and foreground scenery.

## Download and compatibility

Use **Quantum-Rift-v2.8.2.zip**, attached to the GitHub release, for the complete game with actual artwork. The automatically generated source archives may contain Git LFS pointers. Extract the complete ZIP and run **Start Solo Game.bat** on Windows, or follow the README for other platforms. Node.js 18 or newer is required.

Existing saves remain supported; no save-format migration or combat-balance change is included. Attacking neutral NPCs retains the game's existing standing and retaliation consequences. Radio functionality is unchanged.

## Verification

Real Chromium Solo tests exercise radar target selection followed by the Assist button without a prior Attack order, including initial sideways drift, actual heading/velocity changes, thrust, primary damage and manual takeover for ordinary traffic and named-rival trade AI. Map tests compare the window, canvas and details bounding rectangles before, during and after short/long-system hover at multiple desktop viewport sizes, sidebar widths and UI scales; navigation and full-detail keyboard scrolling are checked. Comet rendering is checked both in an isolated compositor and the complete running flight view. Node regressions and the repository's formatting, type, feature and contract checks accompany hosted GitHub CI.
