# /setup: Tonight, Nights, Household and a night's screen

Type: build (AFK)
Status: done
Blocked by: 51, 53, 54, 55

## What to build

`/setup` becomes three tabs and a screen per night. See [v2.1 §9](../spec-v2.1.md#9-setup). The prototype is `prototype/setup-several-live`, `public/setup-prototype.html?variant=B` (scenarios `halloween`, `morning`, `nothing`, `cap`). It's the layout to build. Phone width first.

- **Tonight:**
  - leave room at the top for the checklist ([ticket 58](58-test-night-and-checklist.md))
  - the door's Event large: its notes, state's actions and tools, and "Settings and costumes ›"
  - **Also open** rows
  - the waiting-at-the-cap note
  - "No night on right now" with ▶ Go live on the next scheduled Event
  - Count on this device and Add a helper at the foot
- **Nights:** Open (n of 3), Coming up, Past; Make a night (name, copy costumes from).
- **A night's screen:**
  - the header with its notes ([ticket 53](53-tick-cap-and-notes.md)) and the actions for its state (Go live, End the night, Resume, Close now, Reset, Delete)
  - Night tools: golden ticket, Add missed kids into **this** Event, CSV, tally, Night summary and sharing
  - Settings, with Advanced (Clock shift, Golden tickets) and Goes live at for Upcoming only
  - Costumes
- **Household:**
  - helpers and the join key
  - Your TV (Pair, the link, Rotate)
  - Last year (estimated)
  - name, Location, Managers, account
- **Reset's confirm:** it names the count. Above 20 kids, type the name. Add "won't go live by itself again" when Goes live at has passed.
- **Delete's confirm:** typed name with kids, a plain confirm otherwise. It's refused while Live.
- v2's Live now header, Edit <select>, Create, Past and Night tools sections, and Reset the Rehearsal, all go.
- Leave a place in each section heading for the help "?" ([ticket 64](64-setup-help-column.md)).

## Acceptance criteria

- [x] Each prototype scenario (Halloween with a test night open, the morning after, nothing open, waiting at the cap) renders from a real Household in `/setup`
- [x] Every state's actions work from a night's screen, and End, Close now and Reset work from Tonight's rows
- [x] Add missed kids lands in the Event whose screen it's on, not the door's
- [x] The auto-ended, closed-to-make-room and waiting notes show on their Events
- [x] Reset and Delete confirms follow the rules above
- [x] Usable at 360 px wide; checked in a browser
- [x] `bun test` passes

## Notes from the build

- **Files:** `public/setup.html` is the frame: the Household's name, three sticky tabs, Tonight (the checklist's static HTML, then `#tonight`), Nights (`#nights`, then the static Make a night form), a night's screen (`#night`) and the static Household sections. `public/setup.js` is the controller (load, commands, the screen in the URL, Tonight and Nights); `setup-night.js` draws the door card, Also open rows, the waiting note, "No night on right now", the Nights rows and a night's screen (settings, costumes, Add missed kids); `setup-household.js` wires Household (pairing, TV link, join key, Last year, name, Location, Managers, account); `setup-dom.js` has `h()`. The pure logic is `public/setup-view.js` (tested in `setup-view.test.js`): the door's Event, the night groups, the tab label, each state's actions / row actions / tools, the note's buttons, the when and golden lines, the Reset, Delete, Close, Go live and End confirms, and the URL.
- **URL:** `?event=<id>` is a night's screen (pushed, so the phone's Back returns), `?tab=nights|household` a tab (replaced). "‹ All nights" goes back to the tab the screen opened from (the prototype's behaviour), even from Tonight. `?pair=` opens Household and leaves `?tab=household`. A night deleted while shown drops back to its tab.
- **Server (`server/ledger.js`):** Delete's typed name is now required only when the Event has kids or is imported counts; otherwise no `confirm` is needed (spec §3; ticket 50 had it for every Event). `events()` rows gain `counted` (imported counts' total, else null) and `golden: { drawn, won, left }` (null with the switch off). Tests: `server/setup-tabs.test.js`.
- **End, Resume and Release** go through `/api/end`, `/api/resume`, `/api/release` with the Household's join key (from `/api/household`), naming the Event and its stamp, so End keeps its nearby slide. With golden tickets left, End shows v2's three choices under that Event (on its screen or its Tonight row). Close now and Reset are Setup commands.
- **Judgment calls (conservative):**
  - Imported counts count as "has kids" for Delete's typed name.
  - Close now has a confirm ("It becomes a Past night: no more kids count, and it can't be resumed or reset. Its summary stays.").
  - Tonight's door card keeps Delete for an Ended door (the prototype's `lifecycle()`); Also open rows show only End or Close now, Reset and › (spec §9's list). The auto-ended note carries Resume, Close now and ✨ Summary, as specced, so those repeat the header's on that night.
  - 🖨 Tally sheet shows on Upcoming nights too (a blank sheet with its costumes, to print ahead; ticket 55 gave Upcoming rows one). ⬇ CSV is from Live on. 📺 TV recap (`/tv?event=`) stays on Past nights.
  - The sharing toggle turns sharing on with the name shown (the summary's default) and then shows "Show our name" and Share link; turning it off asks first.
  - A Past night's settings and costumes are shown read-only (the Ledger refuses edits). Imported counts show only Delete and a line.
  - The estimate ("… (estimated)") isn't listed under Nights; it lives under Household → Last year.
  - With nothing open and nothing scheduled, Tonight says "Nothing is scheduled. Go live on a night from Nights." with a link to Nights.
  - 🎫 Add a golden ticket shows on any Live night while the switch is on; with no Race against or Expected kids the server's refusal is shown.
  - The status line is a toast at the top (errors stay 6 s, tap to dismiss), since the tabs are sticky.
- **For ticket 58:** the checklist is unchanged apart from two pointers that named removed sections ("Pair a TV under Household.", "Make it under Nights."). It's static HTML at the top of `#screen-tonight`, drawn by `renderChecklist()` in `setup.js`; first-run is untouched (`showFirstRun` gets `household.redeem` and `household.tvUrl`).
- **For ticket 64:** every help topic in spec §9 is a `data-help` attribute on its section, and each has a heading (`h2`, or the night header's `h1`; the door card's is `h2.eyebrow`) to hang the "?" on. Keys in use: `checklist door nothing also waiting helpers nights make night-Upcoming|Live|Ended|Past|imported tools settings costumes join tv estimate name location managers account`. Tonight and the night screen are redrawn after every command, so the "?" state must live outside the DOM (or be re-applied on render).
- **For ticket 59:** nothing here.
- **Tests:** `public/setup-view.test.js`, `server/setup-tabs.test.js`; `server/first-run.test.js`'s layout case now checks the name above the tabs and the checklist at the top of Tonight. 609 pass.
- **Checked in the browser** on four throwaway servers (fresh databases, fake Google, a Manager cookie, a fake clock per scenario and the browser's clock set to match), at 360, 375 and 390 px (no horizontal scroll) and 1280 px:
  - **Halloween 7:10 pm:** Halloween 2026 Live on the door (132 kids, "golden tickets 5 of 5 won"), Afternoon test Also open, Nights "(2 open)" with Practice night and the imported counts under Past. Add missed kids on Afternoon test's screen added 3 to it, not to the door's 132, and its batch was removed. Add a golden ticket, End (the three choices, Release & keep going, End anyway), Sharing on / Show our name / off, Resume, then End and Close now from its Tonight row. Reset on the door with 132 kids: a mistyped name was refused, the right one reset it with the "won't go live by itself again" line, and Tonight showed "No night on right now". Delete on a Past night with kids asked for the name; Make a night opened the new night's screen, Goes live at saved, and Delete on it was a plain confirm and dropped back to Nights.
  - **The morning after:** Dress rehearsal Ended with "Ended automatically at 3:00 am…" and Resume / Close now / Summary on Tonight, its Nights row and its screen; the note's Resume made it Live.
  - **Nothing open:** "No night on right now", Halloween 2026's time and "▶ Go live on Halloween 2026 now", which went live.
  - **At the cap:** three Live, Halloween's waiting note on Tonight and its Nights row; Go live on its screen showed "End or close one of your live nights first"; End on a Tonight row then a tick closed it ("Closed at 4:01 pm so Halloween 2026 could go live" on its Past screen) and put Halloween on the door. Reset from a Tonight row (2 kids) used the plain confirm.
  - Household: Add a helper's QR and wording on Tonight and Household, Last year saved (racers set), Change join key (End from Setup still worked after), `?pair=` landed on Household with the code filled. First-run's three screens showed on a fresh Household and Skip for now closed them. Count on this device stored the key and opened `/door`; the phone's Back left a night's screen.
