# Shareable night summary

Type: prototype (HITL)
Status: resolved
Blocked by:

## Question

What does a night summary built to screenshot and share look like?

v1 ruled a shareable recap out ("a photo of the TV does the job"). It's back in scope because households will want to post their nights. Prototype and react:

- **Format**: a page laid out for a phone screenshot (9:16), a downloadable image the server renders, a share link whose preview card (Open Graph image) does the job, or a combination. Rendering an image server-side with no npm dependency is a real constraint (SVG → PNG? canvas in the browser and download?).
- **Content**: start from the v1 end-of-night recap (final count and verdict, the race, peak half-hour, biggest crew, costume of the night, golden numbers). Add a neighbourhood line ("3rd busiest of 12 homes nearby") if nearby exists? Household name shown or not?
- **When and who**: available once the night is ended? Shareable by link without signing in?

Link the prototype branch from the answer.

## Answer

Resolved 2026-10-10 (HITL). Prototype: branch [`prototype/night-summary`](https://github.com/selfhosters-cc/count-dracula/tree/prototype/night-summary) (`public/summary-prototype.html` + `.js`; `?variant=A|B|C|D`, `?event=<id>` for a real night). It showed four takes: A story poster, B candy receipt, C wrapped slides, D pumpkin-patch square.

- **Format: C, Wrapped-style slides.** Tap-through 9:16 stories, one stat per slide. People screenshot the slides they want; each slide stands alone. The slides, in order: intro (name · night) → total and time span → vs the ghost with the race chart → peak half-hour and biggest crew → costume of the night and runners-up → golden tickets → nearby (when it exists) → closing card.
- **Add a receipt slide (from B):** costume line items, teens, total, vs last year, golden tickets as a coupon, and the **kids-per-minute barcode**. Nothing else is taken from A or D.
- **Sharing: screenshots plus a public share link.** A Share button on the last slide opens the phone's share sheet with a link that opens the slides without signing in. The link preview is **one fixed Count Dracula image**, not rendered per night. No "Save image" button and no server-side image rendering.
- **Identity:** the household's **display name** shows on the slides (setup warns "this appears on anything you share"), with a per-share toggle to hide it. The nearby slide only ever says "near you" with rounded area totals, never a place name, within the rules from [Fuzzy location](07-fuzzy-location.md).
- **When:** slides exist once the night is **ended** (🌙 End the night) and for any past night. Resuming the night just updates them. Golden numbers are revealed, as on the v1 recap. A share link lasts until the household turns sharing off or deletes the night.
- With no ghost (a new household), the vs-ghost slide becomes "Next year: N is the number to beat" (as prototyped).
