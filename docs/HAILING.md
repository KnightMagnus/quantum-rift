# Communications expansion

## Player controls

Target a ship and use the normal Hail control (**T** by default). NPC services remain in the familiar dialog. Targeting another active player opens a plain-text, 100-Unicode-codepoint composer instead; it is not a trade window or chat replacement.

Incoming NPC/player calls update an amber circular communications badge at the upper flight-view perimeter. They never open a dialog, take keyboard focus or pause the game. Click the badge or use **Incoming hail inbox** (**U**, remappable in Keys) to inspect the queue. Escape closes the panel. There is no arrival animation or sound to mute, and no motion dependence. The badge stays inside the adjustable flight-view/sidebar boundary.

The inbox includes **Allow player hails**. Existing Captain privacy also applies: the recipient must accept unsolicited messages, be a friend, or share an Armada. Both directions of blocking prohibit hails. Both players must remain online, flying and in the same system; there is no 3,500-unit player range limit, offline mailbox, remote trade or chat injection. The server resolves the recipient's live ship identity and ignores supplied sender names. Each sender may send once per five seconds, and once per recipient per ten seconds. Messages from the same sender coalesce into the most recent call; at most eight player senders are queued independently of the three-call NPC allowance.

## Caller portraits and personal profile

Hail windows show a framed caller portrait with the same static scanline effect as landed artwork. Thirty named captains have individual portraits. Other NPC portraits are selected deterministically from faction pools; opening the same call does not reroll the face. Archived NPC transmissions retain their captured portrait after the sender leaves. Closing the window or returning to the inbox clears the caller image.

Open **PROFILE** from the flight command bar or landed world header to choose your captain portrait. The preview is not saved until you select **SAVE PORTRAIT** and receive server confirmation. Your choice appears in public captain profiles and player hails, and uses the existing Solo or native online account storage. Named NPC portraits are not selectable. Escape closes the chooser and returns focus to the button that opened it.

## NPC dialogue and pacing

Contextual text uses actual ship identity, task, combat/disabled state, armor/shield status, system and real destination when available. Eight authored openings per principal activity and thirty stable named-captain verbal signatures combine with the existing relationship-sensitive voice catalog. A per-player/system-visit ledger avoids complete routine-response repetition, with factual ship/task/position fallbacks; special silent/alien/hunter behavior is retained. No live language-model dependency or fictional cargo manifests are introduced.

Both general traffic and locally present named captains can initiate calls. Routine opportunities are sampled every three to six minutes of uninterrupted flight, with an initial arrival/respawn grace of three to six minutes. The timer is an opportunity, not a promise: there must be a suitable local ship. Combat suppresses routine calls; existing unread calls remain available, and actual security/distress can still queue. Named captains have a fifteen-minute per-recipient cooldown. Subordinate/mission/convoy/hunter/silent ships do not create unsolicited requests.

Calls expire after three minutes or source/system/status invalidation. Opening grants at least thirty seconds of grace. Docking, a new active ship or system transition clears the queue; disconnects do not accumulate calls. Ignore and dismiss have no reputation penalty. A source's offer is reserved for three minutes and resource assistance resolves once globally, so several captains cannot multiply a donation or repair.

## Encounters

- **Fuel request:** ordinary traders can carry an explicit one-time low-fuel encounter state (12% of eligible newly considered traders), reflected in their real `fuel` field. A friendly, fuel-short trader can request 50 units. Transfer requires proximity within 500, enough player fuel and enough receiving capacity. It changes actual fuel and grants no farming reward. This is encounter simulation, not a claim that all ordinary NPC traffic has an ongoing fuel economy.
- **Friendly named greeting:** actual relation of at least 30; uses that captain's stable voice and current ship context. No free relationship boost for merely opening it.
- **Donation request:** an explicit one-time hardship request for 100 credits, within 500 units, with no promised reward. This is minimal encounter state, not a claim to model the ordinary traffic captain's bank account.
- **Security warning:** patrols warn at faction standing -20 or below. There is no hidden enforcement countdown, new hostility rule or automatic payment.
- **Local-port escort:** an ordinary or named trader with an actual local landing destination offers 750 credits. The player must remain in the system, flying and within 3,500 units until the NPC actually lands at that destination. Five-minute deadline. Source death, disappearance, docking, departure or separation fails the escort; only the actual Space landing callback awards the reward, once. One active spontaneous escort per player/source; no new raiders or duplicate job-board mission/reward. Escorts stay within the local system.
- **Hazard intelligence:** a local NPC reports a real nearby hostile NPC group seen within 1,800 units of that source, excluding mission ships and players. Accept shows a rounded, approximate point for sixty seconds, not a live target tracker. No payment or discovery-state unlock.
- **Distress rendezvous:** an actually badly damaged friendly ship can call. Accept marks its real transponder. Within 180 units, a second explicit action supplies repairs for 250 credits, restoring the hull above the disable threshold. Assistance can resolve only once; named captains remember +6 relation, ordinary factions grant at most +1 standing per assisted ship. No synthetic rescue ship or existing rescue-job reward is created.

The rendezvous/escort marker tracks the accepted sender; the intel marker is a fixed approximate point. New accepted marks replace the current hail marker. Existing mission markers remain untouched. Hail encounters do not offer salvage, bounty leads, ceasefires, deception or in-flight player trading, and do not change the radio.

## Implementation boundaries and verification

`server/hail-service.ts` owns ephemeral queue, cooldown, source identity, resource/reward validation and encounter lifecycle. `server/hail-dialogue.ts` owns contextual authored responses. Existing `HailOperations` keep outgoing services and delegate player targets to the service through an explicit feature capability. The `hailin` message route is behind the normal authentication/flood/activity gates. `client/hails_ui.ts` uses DOM text nodes for all messages and option labels.

Checks:

```sh
node test/hailing.ts
npm run test:features
npm run typecheck
# With a disposable server, never a live account/data directory:
node test/hailing-network.ts ws://localhost:18766/ws
# Optional separately installed Playwright:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node test/hailing-browser.ts http://localhost:18766
```

The focused service test covers Unicode, sender ownership, blocks/privacy, rate limiting, coalescing, invalid and replayed actions, insufficient resources, actual-landing reward/replay/separation, rounded non-player intel, source exclusions, queue caps, expiry and active-ship resets. Two real WebSocket clients cover authenticated identity, reply, nonmodal delivery, flood/block behavior and forged player options. Browser checks cover incoming badge/focus, literal HTML-looking text, Unicode composer/reply, typing T safely, inbox key/Escape, desktop/sidebar resizing, continuous simulation and page errors.

Timing, encounter distribution and monetary amounts are starting balance values, not conclusions from long-session human playtesting. The browser test optionally accepts `RIFT_ASSET_FALLBACK=/path/to/retained/client` to route independently retained binary assets when the upstream LFS remote cannot supply its objects; it never modifies repository pointers/assets.
