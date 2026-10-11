# Site-wide top costume clause

Type: build (AFK)
Status: ready-for-agent
Blocked by: 46

## What to build

The site line gains a top costume. See [spec §14 item 3](../spec.md#14-extras-above-the-cut-line). About 1 hour. **First to drop** if the build slips.

- The site line gains *"· top costume: 🧙 Witch"* wherever it shows: the phone fallback and the sign-up page.
- The costume is the most-counted name across live, non-Rehearsal Events, **only from names counted in ≥ 3 different Households** (case-insensitive, trimmed), **never blocklisted**. Left out if none qualifies.
- No top-N list, no trend.
- **Switch:** its own Operator-wide switch.

## Acceptance criteria

- [ ] A name in only 2 Households, or a blocklisted one, never shows; with none qualifying, the clause is absent
- [ ] It shows on the phone fallback and the sign-up page
- [ ] A costume of `<img src=x onerror=alert(1)>` (in 3 Households) renders as text
- [ ] The switch removes the clause
- [ ] `bun test` passes
