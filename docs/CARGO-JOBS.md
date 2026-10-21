# Courier and freight progression

Jobs, missions and quests refer to the same system. Courier work should be the
most broadly available, straightforward route to earning ship upgrades; combat
and specialist careers remain optional alternatives. This change improves job
availability, not a measured guarantee that cargo earns more per hour than every
other activity.

## Reliable small deliveries

Every ordinary job board in the inner neighbourhood posts two additional lawful,
untimed courier contracts: **3–5 t** and **6–10 t**. Both fit together in an empty
15 t **Gnat Skiff**; the first also fits a 5 t scout. The sender supplies the cargo,
so accepting requires space, not commodity purchases.

The inner neighbourhood is defined as the lawful, danger 0–1 systems reachable
within two low-danger jumps of Concordia. Courier destinations are other systems
in that neighbourhood, at most two jumps away by low-danger links. Personal
station sites and outlaw ports do not post these guaranteed slots. In the current
galaxy this covers **15 systems and 18 ordinary boards**.

The guarantee concerns offered work, not an endlessly refilling board: an accepted
slot disappears while that job is active. Already-carried goods, other contracts,
six-job limits and personal landing reputation still apply. It does not promise
an entirely risk-free flight or override a faction's refusal to admit a captain.

## Work for larger ships

Lawful, danger 0–2 job boards with a suitable one-to-four-jump trade route also
post five freight contracts, one in each band:

| Shipment    | Example stock hauler that fits the whole band |
| ----------- | --------------------------------------------- |
| 30–60 t     | Dory Hauler — 70 t                            |
| 70–120 t    | Sunwake Sloop — 120 t                         |
| 140–300 t   | Longhaul Barge — 300 t                        |
| 350–450 t   | Magma Hauler — 450 t                          |
| 900–1,800 t | Grand Caravan — 1,800 t                       |

Intermediate-capacity ships retain smaller contracts and can take larger ones
when that board's weight fits; multiple shipments can share available hold space.
These routes use one to four jumps through lawful, danger 0–2 systems, excluding
outlaw ports, territorial regions and Farside space. They use ordinary cargo
acceptance, reservation and delivery rules, not new economic mechanics.
Isolated boards without a suitable plotted route do not receive these additional
bulk contracts; their existing job generators are unchanged. The current galaxy
has 111 boards with suitable routes.

Bulk pay increases with both weight and distance:
`round(1.35 × (800 + 1100 × jumps + tonnes × (60 + 20 × jumps)))`.
For example, a 300 t two-jump shipment pays 44,550 credits; an 1,800 t four-jump
shipment pays 347,220 credits. These are contract rewards, not measured net
profits after fuel, repairs or other spending. Small courier pay keeps the
existing delivery formula. Existing accepted contracts are unchanged.

The five original random board slots now select ordinary delivery **65%** of the
time, up from 50%. Other job generators, supply/procurement rules, combat rewards
and ship capacities are unchanged. New board slots are public and seeded by port
and the existing ten-minute window: changing ship, wealth, combat rank or account
does not resize them or reroll their rewards.

## Verification

`cargo-couriers.js` samples all 18 inner boards across 128 windows, checks real
stock-hauler fit, and exercises actual acceptance, capacity/slot/duplicate/forged
denials, exact once-only payout, high-tonnage delivery and database reload.
`mission-ui-browser.mjs` uses a fresh 15 t captain and actual HUD buttons to accept
both small shipments while a high-tonnage contract remains correctly disabled.
Both are registered in the canonical regression inventory and CI.
