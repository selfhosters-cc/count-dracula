# First-run, the ready checklist and the Rehearsal

Type: build (AFK)
Status: done
Blocked by: 23, 24, 25, 26

## What to build

A new Manager gets from sign-up to a TV on the porch, and tests it on their Rehearsal. See [spec §6](../spec.md#6-sign-up-first-run-and-the-rehearsal).

**First-run: 3 screens**

1. **Name your household:** the display name, and the captured zone read-only.
2. **Location:** the picker from [ticket 25](25-location-picker.md), with **Skip**.
3. **Put it on your TV**, pairing first:
   - *"On the TV's computer, open Chrome and go to count-dracula.example.com/tv"*, with the real host filled in
   - a box for the 6-character code
   - it ticks over to **"✓ Your TV is showing your Rehearsal"** when a TV-link stream connects
   - alternatives: **Send the link instead**, **Use this screen as the TV**, **Skip for now**, **Help with TV setup**

- Every screen can be skipped.
- First-run shows on each visit to `/setup` until screen 3 has been passed once.

**Ready-for-Halloween checklist** (top of `/setup`)

1. **A TV is watching:** ticked by a TV-link stream connection.
2. **A phone counted a test kid:** ticked by any kid on the Rehearsal, then "try **Reset the Rehearsal** so your TV starts at 0".
3. **Your Halloween night:** "goes live Sat Oct 31, 4:00 pm" (from Goes live at), with an **Expected kids** field. Ticked once it's set or skipped.

It ticks itself from real state, and hides when done or dismissed.

**The Rehearsal**

- **Reset the Rehearsal**, only while the Rehearsal is live, clears its kids.
- A **"🎭 Rehearsal"** chip in the TV top bar and the door phone header, also seen by TV-link viewers.
- **Clock shift** and the **golden-ticket** fields move under an **Advanced** fold in the event editor.

**A first `/help/tv`**

A public page with the essentials: a computer on HDMI with Chrome or Edge full-screen, go to `/tv` and pair, sleep and screen blanking off, "a reload needs a click or key press for sound", and other devices being best effort ("test it on your Rehearsal"). [Ticket 48](48-help-tv-polish.md) fills in the rest.

## Acceptance criteria

- [x] A brand-new Manager on a phone gets through all 3 screens and sees "✓ Your TV is showing your Rehearsal" when a second browser pairs (checked in the browser)
- [x] Skipping every screen still lands in a working `/setup`; first-run stops showing once screen 3 has been passed
- [x] Each checklist item ticks from real state, without a reload
- [x] Reset the Rehearsal clears its kids, and the TV and phones drop to 0; it's refused on a non-Rehearsal Event
- [x] The 🎭 chip shows on the TV, on TV-link viewers and on phones during the Rehearsal, and not on "Halloween 2026"
- [x] Clock shift and golden tickets are under Advanced
- [x] `/help/tv` is reachable signed out
- [x] `bun test` passes

## Notes from the build

- **Server:** `households.first_run_passed` (migration step 6; existing Households count as passed), Setup commands `passFirstRun` and `resetRehearsal` (live Rehearsal only: deletes its kids, batches and fired moments, re-hides its tickets, un-ends it, and sends `event.updated` so screens resync to 0). `/api/household` adds `firstRunPassed` and `checklist: { tvWatching, rehearsalKids }` (TV-link or paired streams open; kids on the Household's Rehearsals).
- **First-run** is `public/first-run.js` over `/setup`. Screen 3 is passed by Done (after the TV connects), Send the link, Use this screen or Skip; redeeming any pairing code also passes it. Arriving with `?pair=` skips first-run for that visit.
- **The checklist** polls `/api/household` every 3 s. Item 2 stays ticked after Reset the Rehearsal (remembered on the phone); item 3 is about the next night with a Goes live at (or the live non-Rehearsal one), and ticks with Expected kids, a Race against, or Skip. Skips and the ✕ are per phone (`localStorage`). The "About how many kids came last year?" field comes with ticket 45.
- **🎭 chip:** TV top bar (TV-link viewers too) and the door phone header, from `event.rehearsal`.
- **`/help/tv`:** a first public page (`public/help-tv.html`); ticket 48 fills it in.
- Checked in the browser at phone size: sign-up → 3 screens → a second tab's code → "✓ Your TV is showing your Rehearsal"; checklist items ticking without a reload; Reset the Rehearsal taking the TV to 0; the chip gone after Go live; first-run not shown again.
