# First-run, the ready checklist and the Rehearsal

Type: build (AFK)
Status: ready-for-agent
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

- [ ] A brand-new Manager on a phone gets through all 3 screens and sees "✓ Your TV is showing your Rehearsal" when a second browser pairs (checked in the browser)
- [ ] Skipping every screen still lands in a working `/setup`; first-run stops showing once screen 3 has been passed
- [ ] Each checklist item ticks from real state, without a reload
- [ ] Reset the Rehearsal clears its kids, and the TV and phones drop to 0; it's refused on a non-Rehearsal Event
- [ ] The 🎭 chip shows on the TV, on TV-link viewers and on phones during the Rehearsal, and not on "Halloween 2026"
- [ ] Clock shift and golden tickets are under Advanced
- [ ] `/help/tv` is reachable signed out
- [ ] `bun test` passes
