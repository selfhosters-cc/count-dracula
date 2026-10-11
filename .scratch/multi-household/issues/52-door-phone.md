# The door phone on /door

Type: build (AFK)
Status: ready-for-agent
Blocked by: 51

## What to build

The door phone moves to `/door` and writes to the door's Event by name. See [v2.1 §4](../spec-v2.1.md#4-credentials-tvs-and-door-phones) and [§5](../spec-v2.1.md#5-going-live-and-ending-by-themselves).

- **`/door`** serves today's door page. `/` with a remembered key redirects to `/door`, and `/?key=…` redirects to `/door?key=…`. Until [ticket 59](59-homepage.md), `/` without a key keeps v2's behaviour.
- **Every write names its Event and go-live stamp:** taps, remove, End, Resume, Release, Add a ticket, the soundboard, catch-up. The phone shows and taps into the door's Event.
- **The outbox** keeps each tap's Event and stamp, never re-points it, and drops a 400 silently (already).
- **Nothing open:** "No night on right now" with the next Event's countdown, no board and no tap buttons; it moves onto the board at Go live. ☰ keeps device items; no nudge, End, Resume or Release.
- **Dead key:** a refused key is forgotten, and the phone shows "This phone's link no longer works. Ask your host for a new link or QR code." with one button to `/`.
- **☰ "Go live on <Event> now"** (signed-in Manager): the Upcoming Event with the soonest Goes live at, hidden when none is scheduled, shown whether or not others are open, and refused at the cap.
- **The nudge** only on the door's Event while Live (`quietNudge` loses its Rehearsal test); its End names that Event; it goes if the door switches.
- **Add a helper** builds `/door?key=<key>` and its wording names the Household. **Count on this device** stores the key and opens `/door`.
- The 🎭 chip goes from `index.html` / `index.js`.
- **Caddy:** a `deploy/scripts.test.js` case shows `/door?key=` masked by the existing `key=` regexp.

## Acceptance criteria

- [ ] `/?key=abc` → `/door?key=abc`; `/` on a phone with a stored key → `/door`
- [ ] A tap queued offline under the test night lands on the test night after Halloween goes live; a tap queued before a reset is dropped
- [ ] With nothing open the phone shows the countdown and moves onto the board at Go live without a reload
- [ ] After Change join key, an old phone forgets its key and shows the message with a button to `/`
- [ ] ☰ Go live now offers the soonest scheduled Event, hides with none scheduled, and is refused at the cap
- [ ] The nudge never shows for an Event the door isn't on
- [ ] Add a helper's QR opens `/door?key=`
- [ ] `bun test` passes
