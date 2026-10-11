# Event states, the 3-open cap and commands that name their Event

Type: build (AFK)
Status: done
Blocked by: —

## What to build

The Ledger stops assuming one live Event. See [v2.1 §3](../spec-v2.1.md#3-events-and-their-states) and [§15](../spec-v2.1.md#15-where-it-lands-in-the-code-and-builders-latitude). The [code-seams research](../../events-rework/research/01-one-live-event-assumptions.md) (§0, §11, §12) lists every site.

**States**
- **Upcoming → Live → Ended → Past.** Go live, End the night, Resume, and **Close now** (Ended → Past). Past replaces `frozen`.
- **Ended → Past by itself at noon the next day**, in the Household's zone. The minute tick does it, and catches up after a restart.
- **Go live never changes another Event.** It stamps the Event with its went-live time (the **go-live stamp**). Resume doesn't restamp.
- **At most 3 open** (Live or Ended). At the cap a Manager's Go live is refused: "End or close one of your live nights first".
- **Zero open is normal:** no route or command throws (400 for a command that needs an open Event, never a 500).
- **Delete:** refused while Live. Ended, Past and Upcoming Events can be deleted. A Race against pointing at a deleted Event falls back to None.

**Commands name their Event**
- `eventById()` loses its "no id means the live one" default. Every command takes an event id. Every phone write also takes the **go-live stamp**. A missing, non-open or stale-stamped Event is a `BadCommand` (400).
- **`ledger.doorEvent(householdId)`:** the open Event with the latest go-live stamp, or null. Tickets 51–58 use it.
- The `rehearsal` flag goes from the schema and the Ledger (a `user_version` step that may rewrite: [§12](../spec-v2.1.md#12-household-1-and-the-opening-line)). `createHousehold` makes its live starter an ordinary Event named "Test night"; [ticket 58](58-test-night-and-checklist.md) does the rest of sign-up.
- `events.join_key` (v1's dead column) can go in the same step.
- **Tests:** `test/v1-night.js` and the Ledger, households, schedule and credentials suites name their Event. The "exactly one live" and "Go live freezes the old one" cases are replaced by this ticket's.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server).

## Acceptance criteria

- [x] Two Events of one Household can be Live at once; a third goes live; a fourth is refused with the cap message
- [x] Go live leaves every other Event as it was; nothing is frozen
- [x] End → Ended; Resume → Live with the same stamp; Close now → Past; an Ended Event is Past at noon local the next day (fake clock, `America/Toronto` and `Pacific/Auckland`), including after a restart
- [x] `doorEvent` returns the open Event with the latest stamp; null with none open
- [x] A command with no event id, a Past or Upcoming id, or a stale stamp gets 400; a Household with zero open Events reads and writes without a 500
- [x] A Live Event can't be deleted; deleting one that's raced falls the racer back to None
- [x] No `rehearsal` column or flag remains in the server
- [x] `bun test` passes

## Notes from the build

- **Schema (migration step 12, a rewriting step):** one `events.state` column, `upcoming | live | ended | past`, replaces v1's `live`, `frozen` and `ended`. `counts_only` or `frozen` → past; `live` + `ended` → ended; `live` → live; else upcoming. `rehearsal` and v1's `events.join_key` are dropped (SQLite `DROP COLUMN`; the `events_by_household` index moves to `(household_id, state)`). Open rows without a `went_live_at` get one. Migration steps 1–11 are untouched history, so step 1 still adds `rehearsal` before step 12 drops it. The Ledger's v1 `SCHEMA` string still creates v1's table for a fresh database; the steps reshape it.
- **The go-live stamp is `went_live_at`.** Go live stamps it with `max(now, the Household's latest stamp + 1)`, so two Go lives in the same millisecond (fake clocks) never tie and the door's Event is never ambiguous. Resume keeps it. Ticket 54's Reset should clear it; a re-Go-live then gets a fresh, strictly later stamp, so a tap queued before the reset is refused.
- **Commands:** `eventById()` has no default any more. Every night command (`tap`, `catchUp`, `remove`, `backfill`, `removeBatch`, `end`, `resume`, `release`, `addTicket`, `soundboard`) goes through `openNight({ eventId, stamp })`: a missing, Upcoming or Past Event, or a stamp that isn't the Event's `went_live_at`, is a `BadCommand` (400). That includes Setup's backfill, removeBatch and Add a ticket, for one rule. `mix` stays per Household. New `close({ eventId })` (Close now, in `ADMIN_COMMANDS`): Ended → Past; refused on Live ("End the night first"), Upcoming and Past.
- **The cap:** `goLive` counts Live + Ended and refuses at 3 with "End or close one of your live nights first". It never touches another Event and returns no delta of its own.
- **Telling screens:** `apply()` compares the door's Event before and after every command. If it moved (Go live, Close now, the noon Past, deleting the door's Ended Event), it appends `{ type: 'event.switched', eventId }` (null with none open), so `live.js` reopens and reads the new door. That is the stopgap ticket 51 replaces with per-Event deltas; deltas still carry no `eventId`, so a tap on a non-door open Event (via `/setup` Add missed kids) still reaches the door's board. **Ticket 51 must fix that.**
- **`ledger.doorEvent(householdId)` / `house.doorEvent()`:** the open Event with the latest stamp (ties by id), as an `events()` summary without kids or tags, or null. `liveNights()` and `nearbyNights()` already return one row per Household (its door's Event) and no `rehearsal`, so nearby and the Operator count a Household once; ticket 56 still adds the Ended / No night statuses and the dropped minimum.
- **The tick:** goes live on due Upcoming Events (at the cap the `BadCommand` is caught and the Event just stays Upcoming: ticket 53 adds closing the oldest Ended one and the notes); ends every Live Event past its first 3:00 am, **naming it** (no Rehearsal exemption); then closes every Ended Event past **noon after that 3:00 am**, local time. So a night ended at 9 pm, or at 1:30 am, is Past at noon the next day, and an auto-ended one at noon the same morning (spec §1's "Nov 1, noon: every Ended Event goes Past"). One tick after a restart does all three in order.
- **Reads:** `house.snapshot(id)` needs an id (null without one). Phone and TV reads (`/api/snapshot`, `/api/stream` with no `?event=`) read the door's Event, or `house.idleSnapshot()` with none open: `{ event: null, tags: [], kids: [], ghost: null, golden: null, recap: null, settings, timeZone, seq }`. `/api/batches` takes `?event=`, else the door's. Every event payload carries `state`, `open`, `live` (Live only), `ended` (Ended only), `past` and `wentLiveAt`; `frozen` and `rehearsal` are gone.
- **Delete:** refused only while Live ("End the night first"); the typed-name confirm is unchanged for every Event (ticket 57 may relax it for Events with no kids). Racers fall back to None.
- **Rehearsal:** `resetRehearsal` is **removed** (not stubbed) from the Ledger, `ADMIN_COMMANDS`, `/setup` and the tests; ticket 54 adds `reset`. `createHousehold` makes "Test night", an ordinary Event, in the same by-the-clock shape as before (ticket 58 reshapes it and adds `test_night_event_id`). `rehearsalKids()` became `anyKids()` and `/api/household`'s `checklist.rehearsalKids` became `checklist.anyKids` (ticket 58 named that rename). The Operator's `Rehearsal` status is gone (server and `/operator` chips). No `rehearsal` remains in `server/` outside migration history; a test checks.
- **Judgment calls:** the estimate's gate (`canEstimateLastYear`) is v2's minus the flag, so a Past Test night now counts as "a past night of its own" until ticket 55 drops the gate. `comingNight()` (the estimate's target) is the next scheduled Upcoming Event, else the door's, else any Upcoming; ticket 55 replaces it.
- **Clients, minimally:** the door phone names `live.state.event`'s id and stamp on every write; outbox entries keep the Event and stamp they were tapped under (`outbox.tap(tagId, { teen, night })`, `outbox.remove(kidId, night)`), so a stale one gets 400 and is dropped. With no night on, the phone says "No night on right now" in its problem line and taps are dropped. The TV stands an empty board under a "🌙 No night on right now" title (no Start screen), and `over` keys off `ended || past`. `/setup`'s "Live now" shows the door's Event and lists the other open ones ("also open: …"), handles none open, and drops the Rehearsal tools. There's no Close now button yet (ticket 57). The 🎭 chips in `tv.html` and `index.html` are inert, and "Rehearsal" wording in `help-tv.html`, `privacy.html` and `first-run.js` remains for tickets 51, 52 and 58.
- **Tests:** `test/v1-night.js` now exports `namingTheDoor(house)` (commands that name no Event carry the door's id and stamp, and `snapshot()` / `tickets()` read it), `named(house, id)`, `doorNamed(ledger, householdId)` and `doorSnapshot(house)`. The new `server/event-states.test.js` covers the acceptance list. 472 tests pass.
- Checked in the browser against a copy of the dev database (v1, migrated through step 12): three Events Live at once, the fourth refused with the cap message in `/setup`; door-phone taps landed on the door's Event and ☰ End ended it; closing every open Event moved the TV to "No night on right now" with no reload; the phone, `/setup` and `/tally` loaded with none open, and a tap then was dropped.
