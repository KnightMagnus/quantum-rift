# Cockpit and menu style

The cockpit uses an integrated Tray and readable Pixelify Sans text. The README
flight screenshot shows the implemented design.

## Construction, not just a colour palette

- The bottom cockpit is a sculpted steel shell with a stepped upper rail, raised
  left wing, inset brushed-metal deck, fasteners, engraved equipment labels and
  a ventilation grille. These layers are presentation only and cannot intercept
  flight or menu input.
- At 1600 × 1000, the shell is 200px high. The function housing starts at x=50
  and is 290px wide. The 590px COMMS screen is centred on the viewport. Utility
  controls occupy a matching 290px housing on the right. Narrow layouts reflow;
  do not shrink the desktop design's text to fit a narrow screenshot.
- Function controls use compact key faces, separate visible labels and a small
  indicator. An expanded panel gets the warm oxide active treatment. Keep all
  ship functions in the registry and scrollable stack in `client/ship-functions.ts`.
- COMMS has its own sector/status header, scrolling history, channel controls and
  entry row. Keep long histories inside the screen instead of stretching the deck.
- A popup has a raised steel header and a distinct recessed `.function-body`.
  Do not apply separate wells around every inline button or checkbox.
- Actual incoming-hail markers and transient system speech have separate labelled
  bezels and inset reading areas. They are different message types; preserve their
  authoritative routing, plain-text rendering and visibility/expiry rules.

## Menu family

Use the shared `.metal` frame, restrained oxide header rule, bevelled buttons and
`.well`/list reading surfaces for the map, landing services, ship/captain info,
Personal Station, settings, help and Tray tabs. Preserve semantic warnings and
resource colours. Original landing, catalog and radar artwork stays in recessed
screens, not replaced by decorative concept art.

## Tray capacity

- System radar defaults to square and fills its inset frame. Players can resize
  its height independently of the lower tabbed menu; backing pixels and target
  math follow both dimensions after resizing, UI scaling and viewport changes.
- COMMS is capped at 590px. Desktop expanded utilities retain a 156px track
  (three 48px controls plus gaps); compact views use full-width stacked controls.
- The continuous red screen rail is viewport chrome, not a child of the scrolling
  cockpit. Opening/resizing the Tray must not clip or recolor it. The decorative
  left fin must not overlap the main Tray.

- Fresh default: **520 CSS screen pixels**, growing with UI scale to at most
  760px (728px at 140%). The viewport cap still applies on compact screens.
- All seven Tray menu tabs fit one row at desktop defaults. Narrow or manually
  resized Trays wrap the tabs into visible rows; never require horizontal tab
  scrolling or silently discard an existing narrow width preference.
- Remember the player's resized width in the existing `rift.hud` setting.
- Keep the existing drag bound: minimum 280px, maximum min(760px, 60vw).
  Temporary viewport shrink bounds the rendered width without overwriting the
  saved preference, including after reload; expanding the viewport restores the
  preferred capacity.
- UI scale changes text and inner layout, not the outer-screen drag maximum.
  The connected trim must not block the actual pointer resize grip.
- Small/short high-scale views may need the outer HUD scroll as well as the inner
  content scroll. Keep the final tabs and actions keyboard/wheel reachable.

## Review evidence

Capture actual populated game states, not HTML concepts, at 1600×1000 and
1440×1000, plus narrow/high-scale views. Inspect popups, long chat, all major menu
families and a fully expanded function stack. Update the README gallery with
implemented captures. Use isolated fixture saves, never player saves.

`cockpit-browser.mjs` covers typography/artwork, real menu actions, tray defaults,
live drag at 0.8/1/1.4 scale, saved-width reload, viewport-shrink recovery and literal
hail-marker edge containment. `ship-functions-browser.mjs`,
`mining-panel-browser.mjs` and `sidebar-browser.mjs` cover multi-panel flow,
reachability and narrow/scaled cases. Run the canonical regression manifest; a
screenshot or passing geometry check alone is not functional verification.

## Live landed view and independent Tray column

Docking is not pausing. The server keeps an occupied dock system awake and sends
read-only scene snapshots to docked captains, without spawning their ships. The
normal renderer follows the landed stellar body; it never substitutes traffic or
a wallpaper. Flight prediction remains disabled while landed. Explicit Solo
pause still stops simulation and snapshots. Service panels retain opaque readable
surfaces over a light scrim; secondary modals do not stack blackout scrims.

An expanded Tray owns the full-height right column, including the lower-right
corner. Cockpit width excludes the actual rendered Tray width. COMMS and the
Volume/Settings/Help group stay adjacent in the remaining area; compact widths
stack the function housing below them in a scrollable console. Width persistence
and the 280px minimum / min(760px,60vw) maximum remain unchanged.
