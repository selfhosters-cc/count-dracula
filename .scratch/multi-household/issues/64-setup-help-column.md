# The /setup help column

Type: build (AFK)
Status: done
Blocked by: 57, 62

## What to build

Help beside every `/setup` section. See [v2.1 §9](../spec-v2.1.md#9-setup) (the help column). The prototype is `prototype/setup-help`, `public/setup-help-prototype.html?scenario=signup|halloween|morning|nothing|cap`. Its `HELP` object is the text to ship. Deploys after the opening line; **cut whole** if it isn't ready (no switch).

- **`public/setup-help.js`** exports `HELP`: the 23 topics, `{ title, p, terms, more }`, plain text, escaped on render. The `location` entry says "near you" shows once another house nearby is counting.
- **`data-help="<key>"`** on every help-bearing section of [ticket 57](57-setup-tabs.md)'s tabs and night screen. The night header's key follows its state (`night-Upcoming` … `night-imported`).
- **At ≥ 900 px:**
  - a sticky 320 px right column, titled Help, lists the screen's topics in page order
  - the one in view (an IntersectionObserver band about 15–45% down) is open and highlighted
  - clicking a title scrolls to its section
  - TV help · Email us at the foot
- **On phones:** a round ? on each heading opens its help in place; switching tab or screen closes them all.
- **A unit test:** every `data-help` key has an entry, and every entry is used.

## Acceptance criteria

- [x] Every section of every tab and night state has its help, and the test passes
- [x] At 1200 px the column follows scrolling on Tonight, Nights, Household and a night's screen
- [x] At 390 px each ? opens and closes its help; switching tab closes all
- [x] No "Rehearsal" in the help text
- [x] `bun test` passes

## Notes from the build

- **Built before 62**, at the user's request, though this ticket lists 62 as a blocker (it was planned to deploy after the opening line). It can still be cut whole: drop `setup-help.js`, `setup-help-ui.js` and the `help` lines in `setup.js`; the `data-help` attributes do nothing alone.
- **Files:** `public/setup-help.js` exports `HELP` (23 entries, `{ title, p, terms, more }`, plain text). `public/setup-help-ui.js` draws it: `helpBody(key)` builds the DOM with `textContent` only, and `createHelp({ column, root, contact })` returns `update(screenKey)`, which `setup.js` calls after every `render()`, once `#admin` is shown, and on the 3 s poll (the checklist can come or go). The open "?"s are a `Set` in that module, not the DOM, so Tonight's and a night's redraws keep them; a different `screenKey` (a tab, or `night:<id>`) clears them, so switching tab, opening or leaving a night's screen closes all. The column's open topic is `currentTopic(order, inBand, previous)` in `setup-view.js` (tested). The prototype file isn't shipped.
- **Layout:** `setup.html` wraps the page in `.shell` (`main` + `aside#help-col`), a 720 px + 320 px grid at 900 px and up. The "?" and the in-place help are hidden at that width. The "?" is appended to each section's first `h1`/`h2`; its help goes under the heading, or under the row the heading sits in (the checklist's, beside ✕). `#nights` moved inside the `data-help="nights"` block so the band can see the list. `[data-help]` has `scroll-margin-top` for the sticky tabs. The column's foot is TV help · Email us (the page footer's `mailto:`, so `__CONTACT__` still fills it). After a click in the column its topic stays open for 1.2 s while the page scrolls there.
- **`/privacy`** gains `id="house-rules"` on its House rules heading, for the name entry's link.
- **Help text corrected against the built app** (the prototype's stub differed):
  - `location`: no minimum ("“Near you” shows once another house nearby is counting"), and near you takes in the next Area close to an edge, all four at a corner (ticket 63). "A square about 5 km across", as the picker says, not "5 × 3 km".
  - `name`: the TV never shows the Household name (ticket 52), so it no longer says "Shown on your TV". It's on shared summaries (unless Show our name is off) and in a helper's invite.
  - `join`: Change join key keeps this phone counting (Setup stores the new key), so not "yours too".
  - `estimate` and `settings` → Race against: saving the estimate sets it on the nights racing None, and new nights start on it (ticket 55). A night set back to None stays None, so it no longer says "a night racing None races your estimate".
  - `night-Upcoming`: the tick closes the oldest Ended night at the cap, but Go live by hand is refused there.
  - `night-Live`: Reset also deletes the share link, keeps settings and costumes, and asks for the typed name above 20 kids. End with golden tickets left offers Release.
  - `night-Ended`: Close now asks first and the night then can't be resumed or reset. Late kids count "until noon", not "until noon tomorrow" (an auto-ended night goes Past at noon the same morning).
  - `night-Past`: Delete asks for the typed name only when the night has kids (ticket 57). Its settings and costumes are read-only, and the TV recap stays.
  - `tools`: CSV and Tally sheet are separate. The tally sheet is the paper backup, and an Upcoming night has one too. The 📺 TV recap is added. Sharing shows the Household name unless Show our name is unticked.
  - `settings`: a Past night's settings are read-only, Goes live at is for Upcoming nights only, and with no ghost and no Expected kids no golden tickets are hidden.
  - `waiting`: it waits only while all 3 are Live. End or close one and it goes live within a minute, and a night you end is closed to make room.
  - `nothing`: the button is "Go live on <night> now", and with nothing scheduled it says to use Nights.
  - `also`, `checklist`, `costumes`, `managers` and `account` gained small true details: Ended rows go Past at noon, ✕ hides the list, deleting a costume leaves its kids untagged, Remove and the last Manager, and the typed name for Delete my household.
- **Judgment call:** the column follows the band as the prototype does, so a short page's last topics (Tonight at 1200 × 800, Nights) never open by scrolling. Clicking a title opens them.
- **Tests:** `public/setup-help.test.js`: every `data-help` key in `setup.html` and the `/setup` scripts (plus every `nightHelpKey`) has an entry and every entry is used (23), the only dynamic key is the night header's, entries are plain text with at most two paragraphs, no "Rehearsal", no "5 houses", and `currentTopic`. 676 pass.
- **Checked in the browser** on a throwaway server (the Halloween 7:10 pm scenario, scratch database, port 47611):
  - **At 1200 px:** the column stayed stuck at 16 px from the top and followed scrolling on Tonight (with Add a helper open: Ready for Halloween → On the door & TV), Household (join → TV → Last year → Location) and Halloween 2026's screen (A Live night → Night settings). At 1200 × 500, Nights stayed on Your nights.
  - Clicking Costumes in the column scrolled it to the top and opened it. Add missed kids redrew the screen and the column stayed.
  - **At 390 px:** every ? on Tonight, Household, Nights and a night's screen opened and closed its help. Tonight's stayed open through a redraw. Switching tab, opening a night and ‹ All nights closed them all. No horizontal scroll.
