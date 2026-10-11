# Reset any Event

Type: build (AFK)
Status: done
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

- [x] Reset a Live Event with kids, tickets, a summary and a share link: it's Upcoming with no kids, tickets, summary or link; its tags remain at 0; its Reports remain
- [x] Go live after a reset draws new golden numbers
- [x] A reset Event with a future Goes live at goes live by itself then; with a passed one, Goes live at is cleared
- [x] A tap queued before the reset is refused even if Go live was pressed again before it arrives
- [x] Reset is refused on Upcoming and Past Events, and from a join key
- [x] `bun test` passes

## Notes from the build

- **`reset({ eventId, confirm })`** is in the Ledger and `ADMIN_COMMANDS` (Managers only; a join key gets the session refusal). Refused for Upcoming and Past ("Only a live or ended night can be reset") and for an unknown id. It deletes kids, backfill batches, fired moments, golden tickets and share links, and sets `state = 'upcoming'`, `went_live_at`, `summary_nearby`, `tick_note*` to null and `ended_automatically` to 0. It keeps tags, Reports, ghost buckets, every setting, and `goes_live_at` only while it's still after now. **Judgment call (the builder's choice in the ticket):** the server also requires `confirm` equal to the name above 20 live kids (`Type "<name>" to reset it`), the way `deleteEvent` does.
- **Deltas:** if the reset Event was the door's, `apply()` sends one `door.changed` (to the next open Event, or null and the "No night on right now" screens). Otherwise it sends `event.updated` for the reset Event, plus one for the door's Event when that races against it (its ghost goes empty; Race against still points at it, per §6).
- **Go live now keeps Goes live at** (it used to clear it). Without that, "keeps Goes live at if it's still ahead" could never apply, because a Live Event never had one. The tick only picks Upcoming Events, so a kept time does nothing until a Reset. `schedule.test.js`'s "going live early clears the time" became "keeps the time, but the tick only goes live on Upcoming". A sign-up after Halloween's 4 pm still makes Halloween Live with no Goes live at.
- **Schema (migration step 14, additive):** `households.last_stamp`, filled from `MAX(went_live_at)`. `nextStamp()` now takes `max(now, last_stamp + 1, MAX(went_live_at) + 1)` and records it. Without it, clearing a reset Event's stamp could give the next Go live the same stamp under a still clock, so a queued tap would land. That also covers a deleted Event's reused id. `createHousehold` sets it.
- **`/setup` (minimal, until ticket 57):** "Live now" has a "↺ Reset <name>" button for every open Event, the door's first. The confirm is spec §6's: "Reset "X"? Its N kids are deleted and it goes back to Upcoming." ("It goes back to Upcoming." with no kids). Above 20 kids it's a `prompt` that needs the typed name. When Goes live at has passed, it adds "X won't go live by itself again. Go live when you're ready."
- **Tests:** new `server/reset.test.js`: the acceptance list, the auto-ended note, the 20 / 21 kids confirm, the deltas, migration 14 on the v1 fixture with a clock behind every stamp, and over HTTP (a join key refused, then the stale stamp's 400 after a re-Go-live). 553 pass.
- **Checked in the browser** on a throwaway server (fresh database, fake Google, a Manager cookie), with the TV link, `/door` at 390 px and `/setup` at 390 px. Steps:
  - The Test night had 23 kids. One more tap was queued on the door with `/api/taps` blocked.
  - In `/setup`, a mistyped name changed nothing ("The name didn’t match"). The right name reset the night. The TV went to 0, and the door showed "No night on right now · Next up: Halloween 2026 · Goes live in 20 days" with "⏳ 1 waiting to send".
  - Go live on the Test night, then unblocking taps: the queued tap was refused and dropped. The server, the TV and the door all read 0.
  - There was no horizontal scroll.
- **For tickets 55+:** ticket 57 moves the Reset button onto each Event's card (the night's screen and Tonight's rows) and should keep `resetEvent()`'s wording. Ticket 55's summaries and ghost already see a reset Event as having no kids. A Live, Ended or Past Event may now carry a `goesLiveAt` (its scheduled time, kept through Go live), so filter by `state === 'upcoming'` before showing one, as every current reader does.
