# Night summary slides

Type: build (AFK)
Status: done
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

- [x] An ended night's slides show the stored figures, matching the TV recap's numbers
- [x] A live, unended night has no slides; Resume then End updates them
- [x] The no-ghost and estimated-ghost wordings appear when they should
- [x] The nearby slide shows the figures frozen at the end, unchanged after the Household moves its Location; it's absent below the minimum
- [x] Times are in the Household's zone with the browser elsewhere
- [x] Each slide reads on its own in a phone screenshot (checked in the browser)
- [x] Costume and display names of `<img src=x onerror=alert(1)>` render as text
- [x] `bun test` passes

## Notes from the build

- **Server:** `GET /api/summary?event=<id>` (a Manager of the Household) answers `house.summary(id)`: the display name, zone, event, tags, kids without phone names, ghost, the revealed tickets, switches and the frozen nearby figures. 404 while the night is still on (live and not ended), for a counts-only night, or another Household's. `/summary?event=<id>` is the page (Manager only).
- **Frozen nearby:** `events.summary_nearby` (migration step 9) is written by End, from `/api/end` and from the 3 am tick (`ledger.tick({ nearbyFor })`), with the Area's figures at that moment, or null below the minimum or without a Location. Resume then End rewrites it. Also fixed: the server's first tick ran before nearby existed, so a night ended at start-up would have thrown (now tested).
- **Facts:** `shared/summary.js` `nightFacts()`: the TV recap's own functions and wording (peak half-hour, biggest crew, costume of the night, the verdict), in the Household's zone, plus the per-minute barcode (tested in UTC with a Toronto night).
- **Slides** (`public/summary.js`): intro → total and span → vs the ghost with the race chart (or "Next year: N is the number to beat") → peak and crew → costume of the night → golden tickets → nearby → receipt → closing card. A slide with nothing to say is left out (no kids → no peak; no tickets drawn → no golden slide; no frozen figures → no nearby slide). Everything is DOM text; the two SVGs are numbers with escaped labels. Tap the right two-thirds or → for next.
- The estimated-ghost wording reads `ghost.estimated` ("last year (estimated)"); ticket 45 sets it. The Share button on the closing card is ticket 44 (`buildSlides(…, { closing })`).
- `/setup`: "✨ Night summary" on past nights and on an ended live night, the link in the "ended automatically" card, and "this appears on anything you share" by the household name.
- Checked in the browser at phone size on the nearby seed with house 1 renamed `<img src=x onerror=…> House` and a `<b>Bold</b>` costume: all 8 slides read on their own, names as text, no phone names on the page.
