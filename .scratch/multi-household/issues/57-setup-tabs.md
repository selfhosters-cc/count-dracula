# /setup: Tonight, Nights, Household and a night's screen

Type: build (AFK)
Status: ready-for-agent
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

- [ ] Each prototype scenario (Halloween with a test night open, the morning after, nothing open, waiting at the cap) renders from a real Household in `/setup`
- [ ] Every state's actions work from a night's screen, and End, Close now and Reset work from Tonight's rows
- [ ] Add missed kids lands in the Event whose screen it's on, not the door's
- [ ] The auto-ended, closed-to-make-room and waiting notes show on their Events
- [ ] Reset and Delete confirms follow the rules above
- [ ] Usable at 360 px wide; checked in a browser
- [ ] `bun test` passes
