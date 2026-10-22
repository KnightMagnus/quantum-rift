# Browser fixture ownership and client state

## One writer for each temporary save

A setup `Game` is a seed builder, not a second live server. Its normal constructor
starts background simulation/autosave work. If the test then spawns `server/main.ts`
against the same directory, the two processes can race over `checkpoint.json.tmp`.
The resulting database freeze is real protection responding to an invalid fixture,
not permission to relax checkpoint checks or retry until green.

Suppress constructor timers synchronously while building the seed, restore the
native timer functions immediately afterward, finish seeding and flush, then start
the one authoritative child server. See `test/sidebar-browser.ts`. Use temporary
saves, bounded waits and cleanup; never a player's data directory. Do not leave a
parent simulation ticking beside the child or add a second mutating DB instance.
When investigating a browser timeout, inspect the first server error as well as
the screenshot and client error; later frozen-database errors can be consequences.

## Keep presentation services out of session snapshots

`client/main.ts` snapshots clean serializable state for logout. A helper containing
methods, DOM handles or closures is not serializable with `structuredClone`.
Explicitly retain/reset such a service rather than putting it into that snapshot.
Browser preferences must be loaded for the authenticated captain, not the last
login field, and tests must switch captains within a shared browser context to
prove isolation. A fresh context alone cannot expose accidental storage sharing.

Native Tab/Enter/Space handling must not consume remapped game actions or ordinary
steering after a HUD button click. Resize separators consume their own arrow and
reset keys locally. Keep the real remapped towing transfer and steering regressions;
do not replace them with source-text or inventory assertions.

## Dynamic DOM audits

For a synchronous style/content inventory of a frequently replaced panel, query
and inspect its current nodes inside one `page.evaluate` task. A locator
`evaluateAll` can snapshot nodes before a network-driven re-render and then
inspect detached controls (whose computed styles are empty). Keep all original
style assertions and the nonempty-inventory assertion; do not accept blank styles
or retry until an actual mismatch disappears.
