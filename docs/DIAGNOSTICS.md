# Support diagnostics

Quantum Rift can record a small diagnostic capture when a trade estimate looks
wrong. You choose when to record, and you decide whether to share the file.

## Record and share a capture

1. Open **Settings** (the gear button or **O**).
2. Under **Support**, tick **Record trade estimates for a support report**.
3. Close Settings and repeat what looked wrong: open the market and enter the
   amounts that produced the unexpected estimate.
4. Open Settings again and select **Export**. Your browser saves
   `quantum-rift-diagnostics-v1.json`. Attach it to your report if you want to.
5. Untick the box to stop recording, or select **Clear** to discard everything.

Recording is off every time the game starts. Nothing is uploaded or sent
anywhere; the only copy is the file you export.

## What a capture contains

Each entry holds one market estimate for an amount you typed:

- the commodity id, listed price and remaining buyer demand;
- the amount you entered;
- your hold total and grade breakdown for that commodity only;
- your credits and free hold space;
- the port's trade terms;
- delivery orders for that commodity;
- the estimate the game showed, and how long it took to compute.

The file also records the game version and time offsets from the start of
recording, not clock times.

A capture never includes chat, captain or player names, passwords, sign-in
tokens, your other cargo or any other part of your save. The recorder copies
named fields only; anything else attached to the market or your ship is
ignored.

## Limits

- At most 50 estimates are kept. Older ones are dropped first.
- Recording stops by itself after 30 minutes, and entries older than 30 minutes
  are discarded.
- Entries are held only in the open game tab and are lost when it closes.
- Only market trade estimates are recorded. Combat, flight, mining, missions and
  server-side settlement are not captured.

## Replay a capture offline

Developers can reproduce the estimates in a capture without a server:

```sh
node tools/replay-diagnostic-capture.ts quantum-rift-diagnostics-v1.json
```

The tool recomputes every estimate with the current build's shared trade
formulas and compares it with the recorded result. It exits with status 0 when
all entries match, 1 when any entry differs, and 2 when the file is rejected.

Files are rejected without being evaluated when they are larger than 128 KiB,
are not valid JSON, are not Quantum Rift captures, use a different format
version, or contain fields outside the documented format. Version 1 readers do
not attempt to interpret newer versions.

A match shows that this build produces the same estimate from the same inputs.
It does not show that a later purchase or sale settled at that price: the server
re-checks prices, cargo and funds when you trade, and markets can change between
the estimate and the transaction. A mismatch usually means the trade formulas
changed between the recording build and the replaying build.
