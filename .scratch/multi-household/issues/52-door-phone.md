# The door phone on /door

Type: build (AFK)
Status: done
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

- [x] `/?key=abc` → `/door?key=abc`; `/` on a phone with a stored key → `/door`
- [x] A tap queued offline under the test night lands on the test night after Halloween goes live; a tap queued before a reset is dropped
- [x] With nothing open the phone shows the countdown and moves onto the board at Go live without a reload
- [x] After Change join key, an old phone forgets its key and shows the message with a button to `/`
- [x] ☰ Go live now offers the soonest scheduled Event, hides with none scheduled, and is refused at the cap
- [x] The nudge never shows for an Event the door isn't on
- [x] Add a helper's QR opens `/door?key=`
- [x] `bun test` passes

## Notes from the build

- **Files:** `public/index.html` / `index.js` became **`door.html` / `door.js`** (`git mv`). `PAGES` serves `door.html` on both `/door` and `/`. A new `GET /` route answers `/?key=…` with a **302 to `/door?…`** (the whole query kept), so the key never loads the page at `/`. `/` without one still serves the door page (v2's behaviour, as asked) and `door.js` sends a phone with a remembered key on to `/door` (`location.replace`). **Ticket 59** only has to point `/` at the homepage and keep the `?key=` route; the homepage itself needs the same stored-key check (`doorRedirect()` in `door-view.js`), since only the browser knows that key.
- **Pure door logic (`public/door-view.js`, tested):** `doorView` shows a queued or unconfirmed tap only on the board of the Event **and** go-live stamp it was tapped under, so after a switch (or a reset, once ticket 54 lands) old taps no longer show on the new board; queued removals aren't filtered (kid ids are unique). Also new there: `doorScreen` (board / no-night / connecting), `refusedKey`, `doorRedirect`, `helperLink` / `helperWording`, `goLiveNowTarget`. `quietNudge` already had no Rehearsal test (ticket 50); its comment now says it only watches the door's Event.
- **Nothing open:** `#no-night` ("🌙 No night on right now", "Next up: …", and the countdown from ticket 51's `no-night.js`) replaces the board, the tiles, Undo / Recent / Teen and +1 Kid (`#app.idle`). `state.next` and `next.changed` drive it, so rescheduling in `/setup` updates it live, and Go live (a door's `door.changed` reopen) puts the board up without a reload. The old problem-line stopgap is gone. In ☰ with nothing open, End / Resume, Release and the end choices are hidden, and so is "The night" heading unless Go live now shows. **Judgment call:** the soundboard (its ☰ item, the 🔊 tab and the swipe) goes too, since a press must name the door's Event and the server would refuse every one. TV sound, Add a helper and Setup stay.
- **Fixed on the way:** `#menu .wide { display: block }` beat the `hidden` attribute, so v2's empty Go live now button and a hidden End always showed. `#menu [hidden] { display: none }` fixes it.
- **Refused key:** `live.js`'s `onRefused` listeners now get `{ suspended }`. When a credential is refused, `read()` adds `X-Refused: suspended` if the key or TV token belongs to a **Suspended** Household. On `/door`, a refused key is forgotten and the full-screen `#gone` says *"This phone's link no longer works. Ask your host for a new link or QR code."* with one OK button to `/`. **Judgment call:** a Suspended Household's phone **keeps** its key and says "This Household is suspended by the Operator." with no button, because Unsuspend "restores everything" and spec §4 says a key only dies by Change join key or the Household going. (The TV's paired-device path still forgets on any refusal, as before.) A `/door` with no key at all, refused (no Manager session either), says *"This phone hasn't joined a door yet. Ask your host for a link or QR code."* (my wording; the spec has none). On `/` nothing changes (v2).
- **Every write names its Event:** this was already done in ticket 50 (`night()` on taps, remove, End, Resume, Release, catch-up and the soundboard). Here, End is named **when it's pressed**, the nudge's End included, and kept through the confirm or the ticket choices; if the door moves meanwhile, the choices close. Go live now shows the server's refusal text at the cap ("End or close one of your live nights first") instead of "check the connection"; its confirm now reads "The TV and the door phones switch over to it."
- **Add a helper / Count on this device:** both build `/door?key=` (`helperLink`). The wording is "A helper scans this, or opens the link, to count at <Household> on any night." in the door's ☰ (above the URL under the QR) and in `/setup`, and Share join link's title is "Help count trick-or-treaters at <Household>". For the door to know the name, a **phone's or Manager's** snapshot (`/api/snapshot`, the phone stream) now carries `household` (new `house.displayName()`); **a TV's never does**, because remote viewers watch the TV link. Count on this device opens `/door`. `server/main.js` prints the `/door?key=` link, and the README says `/door`.
- **The 🎭 chip** is gone from the door page (its HTML and CSS). `help-tv.html`'s Rehearsal wording is still there for ticket 58.
- **Caddy:** `deploy/scripts.test.js` reads the `request>uri` regexps from `deploy/caddy-site.caddy` and shows `/door?key=…`, `/?key=…` and `/api/stream?key=…&x=1` masked. No Caddy change was needed.
- **For tickets 53+:** Reset (54) needs nothing more on the phone. A reset Event's queued taps carry the old stamp, so the server 400s them and `doorView` keeps them off the board. `/setup`'s rebuild (57) should keep using `helperLink` / `helperWording` from `door-view.js`. The homepage (59) should reuse `doorRedirect` and swap `PAGES['/']`. The flaky one: `deploy/scripts.test.js`'s redelete case timed out once (20 s) under a full parallel run and passed on reruns.
- **Tests:** new `server/door.test.js` (routing, the outbox across a switch over HTTP, a stale stamp's 400, the Household name on phone but not TV reads, the suspended refusal header, Go live at the cap); new cases in `public/door-view.test.js` and the Caddy case. 522 pass.
- **Checked in the browser** at 390 and 360 px on a throwaway server (fresh database, fake Google, a signed-in Manager's cookie added to the browser):
  - `/?key=` landed on `/door` with the key stored, and `/` with it stored went to `/door`.
  - A tap queued offline under the Test night stayed off Halloween's board ("⏳ 1 waiting to send", total 0) after Halloween went live, then landed on the Test night.
  - With everything closed, the phone showed "No night on right now · Next up: Halloween 2027". Scheduling it in `/setup` added "Goes live in 2:59" with no reload, and ☰ showed Go live now with no End, Release or soundboard. Accepting it put the board up on the same page load.
  - With 3 open, ☰ offered the scheduled fourth and showed the cap refusal, and hid the button once it was unscheduled.
  - The nudge showed on a Clock-shifted door Event at "9 pm", its End ended that Event only, and the nudge went when another Event went live over it.
  - Add a helper (☰ and `/setup`) read "The Smiths" with a `/door?key=` link, and Count on this device opened `/door`.
  - Change join key: within about 2.5 s the old phone had forgotten its key and showed the message, and OK went to `/`. No horizontal scroll at 360 px.
