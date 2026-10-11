# Per-Event deltas, the door's Event and the TV

Type: build (AFK)
Status: done
Blocked by: 50

## What to build

A TV shows one Event, the door's Event, and moves by itself. See [v2.1 §4](../spec-v2.1.md#4-credentials-tvs-and-door-phones) and [§15](../spec-v2.1.md#15-where-it-lands-in-the-code-and-builders-latitude) (the SSE shape is the builder's choice).

- **Deltas carry their `eventId`**, and a device never applies another Event's delta to its board. `seq` gaps never come from filtering.
- **The TV link reads the door's Event** (`/api/snapshot` and `/api/stream` with no `?event=`). When the door's Event changes (Go live, End leaves it, Reset, Delete, Past), every TV of the Household moves **quietly**: no banner. A takeover or sound playing is cut off. A freshly Live Event's "Start the night" is the announcement.
- **Nothing open:** "No night on right now", with the next Upcoming Event's name and a countdown when it has Goes live at. An Ended door's Event keeps its recap until Past.
- **Sound:** moments fire and are recorded on their own Event, but only a TV showing that Event plays them; one reached off screen never replays. A soundboard press names the on-screen Event and is dropped if that's no longer the door's. The cooldown and mix stay per Household.
- **TV "over" and recap** key off Ended or Past, not `frozen`.
- The 🎭 Rehearsal chip goes from `tv.html` / `tv.js`.
- The TV link stays live-only. `/tv?event=` past recaps stay Manager-only. Pairing and Rotate don't change.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), the hub, `public/live.js`, `public/tv.js`.

## Acceptance criteria

- [x] With a test night Live, Halloween going live moves every TV to Halloween with no reload and no banner
- [x] A tap on the test night (via `/setup` Add missed kids) doesn't change the TV showing Halloween, and opens no reconnect loop
- [x] End on Halloween keeps its recap up even though the test night is still Live
- [x] Resetting or deleting the door's Event drops TVs to the next open Event, or to "No night on right now" with the countdown
- [x] A milestone reached on the off-screen Event is recorded, never played; a soundboard press after a switch is dropped
- [x] A remote TV-link viewer sees exactly what the porch TV sees
- [x] `bun test` passes

## Notes from the build

- **SSE shape: one channel per Household, kept.** Every delta names its Event (`eventId`), or `null` for the whole Household (`mix.changed`, `door.changed`, `next.changed`); `apply()` defaults a missing one to null. The hub never filters, so every stream of a Household gets every delta and one `seq`; the screen skips another Event's deltas but still counts their seq, so a skip is never a gap. Chosen over a channel per Event because `hub.js`, the caps, Rotate / Change key / Suspend closing, and `sendEach` (nearby) all key on the Household already, and a per-Event channel would need a device to move channels at every switch (a server-side re-attach, or a client reopen to a new URL plus the "which channel" question for a door with nothing open). Here a switch is just the reopen `live.js` already did. `hub.js` changed only in its header comment.
- **`door.changed`** (was ticket 50's `event.switched`): `{ type: 'door.changed', eventId: null, door: <id or null> }`, appended by `apply()` whenever the door's Event moves (Go live, End-and-Close, the noon Past, deleting the door's Ended Event; ticket 54's Reset will get it for free). It still swallows that command's `event.updated`. Tests that matched `event.switched` now match `door.changed` (the tick's `wentLive` helper reads `door`).
- **`public/live.js`** has a pure `receive(state, delta)` → `{ action: 'apply' | 'skip' | 'stale' | 'reopen', state }`, tested in `public/live.test.js`. Reopen on a seq gap, on `door.changed`, and on `event.updated` for its own Event only (a non-door Event's settings no longer reopen every screen). A skipped delta emits nothing, so the TV and the door phone never see it. A screen with nothing open has board id null, so it skips every Event's delta and applies only Household ones.
- **Nothing open:** `idleSnapshot()` carries `next`: the Upcoming Event with the soonest Goes live at, else the oldest Upcoming one (`goesLiveAt: null`, so no countdown), else null; counts-only Events never. With nothing open, any command that changes `next` (rename, schedule, create, delete) appends `next.changed` with the new value, so the countdown follows `/setup` with no reconnect; with a door's Event, nobody shows `next` and nothing is sent. The TV's `#no-night` screen ("🌙 No night on right now", "Next up: …", "Goes live in 19 days / 5 h 12 min / 9:58", "Going live any minute" at or past its time) stands over the empty board; its text is `public/no-night.js` (tested). The teaser pauses on it.
- **The switch on the TV:** when a snapshot names a different Event than the one on screen, `cutOff()` runs: `director.cut()` (clears the show, drops the queue) and `sound.cut()` (stops every voice, the soundboard's and the golden fanfare included, lifts the golden hold and the ducks), hides the banner, takeover and headstone, clears the soundboard flyers and confetti, and sets the new count rather than rolling it. No banner. Nothing new is shown as an "announcement": the existing Start-the-night rule (no kid yet and sound never unlocked on this page load) is left as it is, so a running porch TV just shows the fresh board at 0. Read conservatively: spec v2.1 §4 calls Start "the announcement", but making it reappear on a TV that already has sound would need a click on an unattended porch TV.
- **Sound:** a moment reached on an off-screen Event is recorded on that Event (`fired_moments`) and its delta names that Event, so no TV showing another plays it; the TV's later snapshot of that Event never celebrates (as before). **Soundboard:** a press must name the door's Event (and its stamp): otherwise `BadCommand` ("… isn't on the TV any more", 400), checked before the cooldown, so a dropped press spends none. The door phone toasts "That night isn't on the TV any more" on a 400. Judgment call: a 400 rather than `{ played: false }`, which the phone shows as the cooldown.
- **TV:** the 🎭 Rehearsal chip is gone from `tv.html` (its CSS too); `tv.js` had already stopped reading it. `over` and the recap were already `ended || past` (ticket 50). The TV link stays live-only, `/tv?event=` stays Manager-only, pairing and Rotate untouched. A remote viewer and the porch get byte-identical frames (tested).
- **For tickets 52+:** the door phone gets the same filtering through `live.js` with no change of its own, but `door-view.js` still adds queued outbox taps (which keep their old Event) to whatever board is shown: after a switch they show on the new board until they land or are dropped. `/door`'s own no-night screen can read `state.next` (and `next.changed`). The 🎭 chip in `index.html` and the Rehearsal wording in `help-tv.html` are still there (52, 58). Ticket 53's tick goes through `apply()`, so its go-lives and closes send `door.changed` already. Ticket 54's Reset needs nothing extra for the TV if it moves the door within one `apply()`.
- **Tests:** new `server/per-event-deltas.test.js` (Ledger and over HTTP), `public/live.test.js`, `public/no-night.test.js`, plus `cut()` cases in the director and sound suites. 501 pass.
- Checked in the browser on a throwaway server (a fresh database, a fake Google, a signed-in Manager) with the TV link on one tab and a door phone on another: with the Test night Live, Halloween going live moved the TV from 3 to Halloween's 0 with no reload and no banner; Add missed kids and phone taps on the Test night left it at 0 with one stream open, and a Halloween tap showed; the Test night's #50 was recorded and never played; a soundboard press naming the Test night got the 400; End on Halloween kept its recap up with the Test night still Live; deleting Halloween dropped the TV to the Test night's 53 with nothing replayed; closing that showed "No night on right now" with "Goes live in 20 days", and rescheduling it (the `settings` admin command `/setup` sends) updated it to "9:58" with no reconnect; Go live then put the board back. The phone followed a Go live to the new Event (0) and ignored Add missed kids on the old one.

