# Add missed kids and the tally sheet

Type: build (AFK)
Status: ready-for-agent
Blocked by: 20, 22

## What to build

The paper fallback and the rehearsal's bulk add. See [spec §6 Night tools](../spec.md#6-setup-page), [§2 Backfill batch](../spec.md#2-domain-model) and [§11](../spec.md#11-failure-handling).

- **"🖨 Print tally sheet"** in Setup opens a tiny static print page with the event name and **15-minute rows from 5:30 to 9:00**, for tally marks only. The header says "Phone blank or dead? Tally here. Write the time you started." It needs no key.
- **"➕ Add missed kids"** is a grid with the same 15-minute rows. Type a count per row. On save, the server spreads each row's count **evenly across that slot** as untagged kids with `source: backfill`, all in **one batch**.
  - Rows are in event time (Clock shift applies) and can't be later than the event's "now".
  - The batch is numbered in tap-time order as it lands.
  - Backfilled kids are **late taps**: they never celebrate, and the TV does one quiet roll-up.
- Setup lists each batch ("+38 kids, 6:30–7:00 · Remove") and can **remove a batch as a whole** (soft delete, quiet dip on the TV).
- There's no separate dev route: this is the rehearsal's bulk add.

## Acceptance criteria

- [ ] The tally sheet prints cleanly on one page with the right rows and header
- [ ] Saving 10 in 6:30–6:45 creates 10 untagged backfill kids spread across that slot, in one batch
- [ ] With Clock shift +3h, rows past the event's "now" can't be filled
- [ ] The TV rises with one quiet roll-up and no pops or chips
- [ ] Removing a batch drops exactly its kids, and re-adding works
- [ ] The race chart places backfilled kids at their spread tap times
- [ ] Tests cover the even spread, batch numbering order and batch removal
