# Reset any Event

Type: build (AFK)
Status: ready-for-agent
Blocked by: 50, 51

## What to build

Reset replaces Reset the Rehearsal. See [v2.1 §6](../spec-v2.1.md#6-reset).

- **`reset` (Setup command, Managers only):** a Live or Ended Event → Upcoming. Refused for Upcoming and Past.
- **Clears:** kids, backfill batches, fired moments, ended, auto-ended and its note, the go-live stamp, **golden tickets (deleted; the next Go live draws fresh ones)**, `summary_nearby` and **share links**.
- **Keeps:** name, Race against, Expected kids, golden-ticket count, Clock shift, time zone, costume tags (at 0), Reports, the join key and TV link, and **Goes live at only if it's still in the future**.
- **Devices** treat it as the Event leaving open ([ticket 51](51-per-event-live-and-tv.md)). Taps under the old stamp are refused.
- `resetRehearsal` goes from the Ledger, `ADMIN_COMMANDS` and the tests.
- The confirm (with the typed name above 20 kids, and the "won't go live by itself again" line) is [ticket 57](57-setup-tabs.md)'s UI. The server only refuses. A `confirmName` check above 20 kids is the builder's choice.

## Acceptance criteria

- [ ] Reset a Live Event with kids, tickets, a summary and a share link: it's Upcoming with no kids, tickets, summary or link; its tags remain at 0; its Reports remain
- [ ] Go live after a reset draws new golden numbers
- [ ] A reset Event with a future Goes live at goes live by itself then; with a passed one, Goes live at is cleared
- [ ] A tap queued before the reset is refused even if Go live was pressed again before it arrives
- [ ] Reset is refused on Upcoming and Past Events, and from a join key
- [ ] `bun test` passes
