# Synthetic save migration fixtures

These hand-authored JSON records isolate cargo/storage compatibility. They are
not historical player saves and are not complete login-ready Game accounts.

- `legacy.json`: no ledgers; ore/gas/shards totals become common-grade lots.
- `current.json`: valid mixed common/rich/pure grades, preserved without rewriting.
- `corrupt.json`: storage lots do not match the authoritative shard total.
- `unsupported.json`: cargo ledger version 99, which must reject.

Every record includes credits, unrelated goods, station ownership and progression
sentinels. Tests compare them before and after rehearsal and check the original
source files byte-for-byte, including failed rehearsals. Fixture version markers
refer only to cargo ledgers, not an application release or a global save schema.
