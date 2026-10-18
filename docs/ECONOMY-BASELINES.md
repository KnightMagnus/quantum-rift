# 3.2.1 economy measurement protocol

No career-rate or tuning claims have been measured. The user reviewed the implementation
summary and authorized tests and merge. This economy change has no standalone release;
it is the first merge toward the cumulative 3.2.1 economy, QoL and mission update. Regression fixtures validate settlement
and report arithmetic; they are not real 30-minute career observations.

Use isolated temporary saves and the normal authoritative game actions. Preserve
the seed, starting save, loadout, route, accepted offers, costs and timed input log
for every session. Never use production/player saves or the rich KNIGHT test profile
as an ordinary progression baseline. No rewarded tutorial replay or external gifts.

## Matched sessions

Record 30 wall-clock minutes per career in each early/mid/late and low/higher-risk
combination: trade, delivery, patrol/bounty, precision mining, refinery, towing.
That is 36 baseline cells, not 36 completed observations. Repeat suspected outliers
under the same seed and comparable capital/hold/risk before proposing any tuning.

Starting fixture suggestions, to be saved and reused rather than silently changed:

| Band  | Ordinary freighter anchor            | Working credits | Progression target                                       |
| ----- | ------------------------------------ | --------------- | -------------------------------------------------------- |
| Early | Dory Hauler (704), 70t base hold     | 30,000          | First useful profession equipment or hull upgrade        |
| Mid   | Ore Crawler (710), 140t base hold    | 80,000          | Better profession loadout or Longhaul Barge              |
| Late  | Longhaul Barge (712), 300t base hold | 250,000         | Next useful fleet/profession upgrade, not maximum wealth |

Profession equipment, tow capability, combat capability, crew, reputation, station
access and perks must be explicit and priced into capital. These anchors are not
a claim that the same bare freighter can perform all six careers. Missing equipment
is a prerequisite cost, not a free benchmark bonus. Log actual outfitted hold and
upgrade price. Do not normalize away a profession's meaningful capital requirement.

Low risk uses a safe route/field and avoids optional fights. Higher risk uses the
same documented risk class across professions, with recovery/losses logged. Do not
compare unequal danger as if only reward differed. Preserve grade premiums, finite
sources, faction discounts, bulk pricing and anti-arbitrage fees.

Mark time spent actively flying, choosing, fighting, collecting or delivering as
active. Log offline/processing waits as idle and report both wall-clock and active
rates. A refinery cannot become the best career merely by hiding hours of idle time.
Unsold cargo or unfinished jobs at the end are not settled profit: mark that record
`closedLoop:false` and do not rank it until the route is reconciled. Record those
outstanding goods/jobs in notes. Fuel/repairs may genuinely be free at a port; record
zero only after verifying that, rather than assuming unknown costs are zero.

## Record format and analysis

`tools/economy-baseline.mjs` accepts an array of observations. Each record requires:

- `id`, `career`, `band`, `risk`, `seed`, `profile` (`standard` or `stress-only`).
- `durationSeconds:1800`, `activeSeconds`, `openingCredits`, `closingCredits`.
- `externalCredits` / `externalDebits`: transfers excluded from earned cash flow.
- `capitalCredits`, `holdRequired`, `lossesCredits`, `nextUpgradeCost`.
- `closedLoop`, `unmeasuredCosts:[]`, `notes:[]`.

After approval, run `node tools/economy-baseline.mjs observations.json report.json`.
Incomplete evidence fails by default; `--allow-partial` produces an explicitly
incomplete report. Never turn missing runs into synthetic data. Net cash, active and
wall-clock rates, idle time, losses, capital/hold and estimated upgrade time are
reported separately. KNIGHT-style stress runs are excluded from comparable cells.
Losses already present in the cash difference are never subtracted a second time.

The proposed 25% difference is a repeat/investigation trigger, not a balance target.
The report only flags same-band/risk/seed comparisons with capital and hold within
25%. Unequal prerequisites remain visible instead of being forced into equal pay.
No reward, market-impact, fee, recovery, timing or grade multiplier is changed by
this draft. Measured tuning remains conditional on the later execution/review phase.
