# End and resume the night

Type: build (AFK)
Status: ready-for-agent
Blocked by: 26, 29

## What to build

Any helper can close the night, and undo that. See [spec §2 Ended](../spec.md#2-domain-model), [§5](../spec.md#5-phone--door-menu), [§9](../spec.md#9-golden-tickets) and [§10](../spec.md#10-sound).

- **"🌙 End the night"** in ☰, with a confirmation, sets the live event's **ended** flag. The event **stays live**, so straggler taps still count. Only the next Go live freezes it. It becomes **"Resume the night"** once ended.
- If golden tickets remain, the confirmation reads "🎫 2 golden tickets never found. Release them to the next 2 kids instead?" with three choices:
  - **Release & keep going:** runs Release remaining and doesn't end
  - **End anyway:** the tickets **expire** and the pill goes away
  - **Cancel**
- **Resume** brings expired tickets back as they were, and brings the ambience back.
- **The TV:** one closing sting (for example a descending "wah-wah-WOOO" plus an owl), then the ambience **fades out over ~5 s** to the keep-alive. With Must #9 switched off, or until the recap ticket lands, End shows the Scoreboard with a "🎃 THAT'S A WRAP — <event name>" top bar.

## Acceptance criteria

- [ ] End → Resume → End works from any joined phone and survives a TV reload
- [ ] A straggler tap after End still counts and pops
- [ ] With tickets left, each of the three choices does what it says; Resume restores expired tickets
- [ ] The closing sting plays and the ambience fades over ~5 s; Resume brings it back
- [ ] The ended TV shows the "THAT'S A WRAP" top bar
