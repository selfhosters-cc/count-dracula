# Export CSV

Type: build (AFK)
Status: done
Blocked by: 22

## What to build

"⬇ Export event" on Setup's past and live events downloads a CSV. See [spec §6 Export CSV](../spec.md#6-setup-page). It's rehearsal blocker #7 and the Nov 1 wrap-up step.

- One row per kid: number, tap timestamp, `received_at`, tag, source, deleted.
- A half-hour count summary (non-deleted kids per half-hour bucket), in the **same shape that next year's ghost seed reads**, so a 2026 export can seed a 2027 counts-only event.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] The export opens in a spreadsheet app with readable timestamps
- [x] Non-deleted rows equal the TV count for the same event
- [x] Deleted and backfilled kids are included and marked
- [x] The half-hour summary loads as a ghost seed (round-trip test: export, seed, ghost total matches)
