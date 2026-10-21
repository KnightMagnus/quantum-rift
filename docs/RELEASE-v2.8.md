# Quantum Rift v2.8 — Hail to the Code

## Release summary

This release gathers the updates since **v2.6 "Together"**. It adds livelier communications, optional fleet combat automation and refreshed weapon data, alongside server and development-tool maintenance.

### In the cockpit

- Outgoing NPC hails vary with the ship's identity, task, location, damage and relationship. Ordinary traffic and the thirty named captains can initiate calls without opening a modal: an amber perimeter badge waits until you choose to answer.
- Fuel and hardship requests, friendly greetings and security warnings, plus local-port escorts, approximate hazard intelligence and distress rendezvous. Assistance requires explicit acceptance and fresh server validation.
- Same-system player hails use the familiar dialog and a 100-character composer, respecting privacy, blocking and rate limits. Trading remains a station feature.
- System-only player chat also appears as a short-lived speech bubble above the sender's active ship, without changing the chat log or exposing private/global/Armada messages.
- Optional combat assist reuses the NPC flight/combat behaviors. Fleet focus and target succession work with manual takeover and Hold Fire. Follow Leader combat delegation is opt-in; independent Armada members retain control. Estimated odds count participating fleet/Armada ships rather than the lead alone.

### Data and maintenance

- Fifteen inherited weapons have newly authored names, descriptions and tuning. Stable IDs, mounts and ammunition references preserve existing saves and loadouts. Updated title-screen, README and game-data terminology accompanies the refresh; this is not a claim about rights to every project asset.
- Explicit server-feature composition, JSDoc/type contracts and feature-inventory checks replace the old prototype-mixin wiring.
- Prettier, Husky, Git LFS asset rules and the formatting/type/feature-contract CI workflow are included.
- The README gallery includes four screenshots of the running v2.8 communications/combat UI.
- The radio is unchanged. Phone-layout support is not included.

## Further reading

Detailed behavior and limits: [communications](HAILING.md), [weapon mapping](WEAPON-REFRESH.md), [changelog](../CHANGELOG.md).

The v2.8 gallery combines images from commit `a249bb5` with four headless Chromium captures at 1440 × 1000. Those captures use matching binary art from an independently retained playtest build.
