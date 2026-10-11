# The minute tick: every Live Event auto-ends, room at the cap

Type: build (AFK)
Status: done
Blocked by: 50

## What to build

What the server does by itself, across several open Events. See [v2.1 §5](../spec-v2.1.md#5-going-live-and-ending-by-themselves).

- **Auto-end:** any Event still Live at the first 3:00 am (Household time) after it went live is ended, **naming that Event** (fixes v2's "first live row"). There's no exemption. Unclaimed golden tickets expire, as before.
- **Goes live at:** the tick runs Go live on an Upcoming Event whose time has passed.
  - **At the cap** it closes the **oldest Ended** Event (Past early) and goes live.
  - **If all 3 are Live it waits**, and goes live on the first tick after one is ended or closed.
  - A Manager's Go live at the cap is still refused.
- **Setting Goes live at:** Upcoming only; a time in the past is refused.
- **Notes on the Event the tick touched**, returned with `events()` for [ticket 57](57-setup-tabs.md) to show:
  - **auto-ended** ("Ended automatically at 3:00 am. Late kids still count until noon."): cleared on Resume or at Past
  - **closed to make room** ("Closed at 4:00 pm so Halloween 2026 could go live"): kept 24 hours
  - **waiting at the cap** ("Couldn't go live at 4:00 pm: 3 nights are open. It'll go live as soon as you end or close one."): kept while waiting
- Ended → Past at noon is [ticket 50](50-event-states.md)'s. The tick is where it runs.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), [Night maths](../../count-dracula/modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] Two Live Events with different go-live times each auto-end at their own first 3:00 am, by name, across the Nov 1 DST change
- [x] With 2 Live and 1 Ended, Halloween's 4 pm closes the Ended one (with its note) and goes live
- [x] With 3 Live, Halloween waits (with its note) and goes live on the tick after one is ended
- [x] A missed tick catches up after a restart
- [x] Goes live at can't be set on an open Event or to a past time
- [x] `bun test` passes

## Notes from the build

- **Tick order (changed from ticket 50's):** auto-end every Live Event past its first 3:00 am (by name), then every Ended Event past noon goes Past, **then** the due go-lives. So a tick after a restart frees the room first: three nights left Live overnight are auto-ended before Halloween's catch-up go-live, which then closes only the oldest of them (before noon) or needs no room (after noon), and never shows a spurious "waiting" note. Queries are ordered by id, so a tick's output is deterministic, and a tick leaves out entries with no deltas (a waiting Event, a close that didn't move the door).
- **The tick's go-live is its own command, `goesLive`**, not in `ADMIN_COMMANDS` (Setup passes its whole command object, so a flag on `goLive` would have let a Manager skip the cap). At the cap it runs `close` on the Household's **oldest Ended Event by go-live stamp** (ties by id), then `goLive`, inside one `apply()`, so screens get one `door.changed`. With all 3 Live it returns nothing and the Event stays Upcoming; the tick tries again every minute. A Manager's `goLive` at the cap is refused as before. **Judgment call:** "oldest" means went live earliest, not ended earliest.
- **Schema (migration step 13, additive):** `events.tick_note` (`'closed' | 'waiting'`), `tick_note_at`, `tick_note_for` (the name of the Event that went live, as it was then). The auto-end's note needs no column: it's `ended_automatically` on an Ended Event. Any `goLive` (tick or Manager) clears the row's note.
- **Notes:** `events()` (so `/api/events`) gives each Event `note`, null or one of: `{ kind: 'autoEnded', at }` (while Ended; `at` is its 3:00 am; Resume clears `ended_automatically`, and Past hides it while keeping `endedAutomatically` for the summary), `{ kind: 'closedForRoom', at, for }` (on the Past Event for 24 hours from `at`), `{ kind: 'waiting', at }` (on the Upcoming Event; `at` is the first tick that couldn't, so after a restart it's the restart's time, not the Goes live at). One at a time, since each belongs to one state. The wording is `tickNoteText(note, timeZone)` in `shared/night-maths.js` (spec §5's three sentences, times as "4:00 pm" in the Household's zone). `/api/household` doesn't carry them; `/setup` already reads `/api/events`.
- **Setting Goes live at:** still Upcoming only; a new time at or before now is refused ("Pick a time that's still ahead"). **Judgment call:** the time the Event already has passes unchanged, because `/setup`'s settings form always sends it back: otherwise saving a waiting Event's name would be refused. A different time (or clearing it) ends the wait and drops the note.
- **`/setup` (minimal, until ticket 57):** a "🕰️ Done by itself" section above Live now lists every Event's note as "<name>: <text>", leaving out the door's auto-end, which keeps its own section. Checked at 390 px on a throwaway server: "Party: Couldn't go live at 5:05 pm: 3 nights are open. …" and "A: Closed at 5:05 pm so Halloween 2026 could go live", no horizontal scroll.
- **For tickets 54+:** Reset (54) should clear `tick_note*` and `ended_automatically` with the rest (an Event reset to Upcoming whose Goes live at has passed would be picked up by the next tick, so Reset should drop a past Goes live at, as CONTEXT says). Ticket 57 should show `note` on the Event's own card via `tickNoteText`, with Resume / Close now / the summary link on an auto-ended one, and remove the stopgap section.
- **Tests:** new `server/tick.test.js` (the acceptance list, the oldest-Ended rule, the 24-hour note, the restart catch-ups before and after noon, the form's unchanged time) and `tickNoteText` cases in `shared/night-maths.test.js`. 540 pass.
