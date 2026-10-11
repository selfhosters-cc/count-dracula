# Site-wide top costume clause

Type: build (AFK)
Status: done
Blocked by: 46

## What to build

The site line gains a top costume. See [spec §14 item 3](../spec.md#14-extras-above-the-cut-line). About 1 hour. **First to drop** if the build slips.

- The site line gains *"· top costume: 🧙 Witch"* wherever it shows: the phone fallback and the sign-up page.
- The costume is the most-counted name across live, non-Rehearsal Events, **only from names counted in ≥ 3 different Households** (case-insensitive, trimmed), **never blocklisted**. Left out if none qualifies.
- No top-N list, no trend.
- **Switch:** its own Operator-wide switch.

## Acceptance criteria

- [x] A name in only 2 Households, or a blocklisted one, never shows; with none qualifying, the clause is absent
- [x] It shows on the phone fallback and the sign-up page
- [x] A costume of `<img src=x onerror=alert(1)>` (in 3 Households) renders as text
- [x] The switch removes the clause
- [x] `bun test` passes

## Notes from the build

- `computeNearby(…, { siteTopCostume })` adds `site.topCostume` with the Area rule (≥ 3 Households, case-insensitive and trimmed, never blocklisted, `null` if none qualifies) over every live, non-Rehearsal, non-Suspended night, with or without a Location.
- The phone fallback and the sign-up page share `phoneNearby`, which appends "· top costume: 🧙 Witch" when there is one. Text only.
- **Switch:** `switches.siteTopCostume` (default on); off, the site line has no `topCostume` at all.
- Checked in the browser on the nearby seed (house 2 with its Location removed, so its phone falls back to the site line): both the phone and `/signup` read "🎃 Count Dracula tonight: 6 houses · ~155 kids · top costume: 🧙 Witch".
