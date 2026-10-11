# Night summary slides

Type: build (AFK)
Status: ready-for-agent
Blocked by: 18, 26, 41

## What to build

An ended night becomes Wrapped-style tap-through slides that a Manager can open and screenshot. See [spec §12 The slides](../spec.md#12-night-summary). Prototype: branch `prototype/night-summary` (`ef3a9e3`), `public/summary-prototype.html` + `.js`, **variant C**, plus the receipt from B.

- **9:16 slides**, one stat each, in the order in §12: intro → total and span → vs the ghost (with the race chart) → peak half-hour and biggest crew → costume of the night and runners-up → golden tickets (all revealed) → nearby → receipt (with the kids-per-minute barcode) → closing card.
- **No ghost:** *"Next year: N is the number to beat"*. **Estimated ghost** ([ticket 45](45-estimated-ghost.md)): "last year (estimated)".
- **Nearby slide:** freeze the Area figures **when the night ends** (End, or the 3 am auto-end), and show them only if they met the minimum. It says "near you", never a place name. With nearby switched off or never shown, the slide is left out.
- Built from stored data, in the **Household's zone**. It exists once the night is **ended**, and for any past night. Resume just updates it.
- **For a Manager:** opened from `/setup`'s past events, and from the "ended automatically" message ([ticket 26](26-auto-go-live-and-auto-end.md)).
- The **display name** is on the intro slide. `/setup` warns "this appears on anything you share".
- The share button and public links are [ticket 44](44-summary-share-links.md).
- No server-side image rendering and no "Save image".

## Acceptance criteria

- [ ] An ended night's slides show the stored figures, matching the TV recap's numbers
- [ ] A live, unended night has no slides; Resume then End updates them
- [ ] The no-ghost and estimated-ghost wordings appear when they should
- [ ] The nearby slide shows the figures frozen at the end, unchanged after the Household moves its Location; it's absent below the minimum
- [ ] Times are in the Household's zone with the browser elsewhere
- [ ] Each slide reads on its own in a phone screenshot (checked in the browser)
- [ ] Costume and display names of `<img src=x onerror=alert(1)>` render as text
- [ ] `bun test` passes
