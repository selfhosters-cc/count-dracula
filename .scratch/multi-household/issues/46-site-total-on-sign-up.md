# Site-wide total on the sign-up page

Type: build (AFK)
Status: ready-for-agent
Blocked by: 41

## What to build

The public sign-up page shows the same site line as the phone fallback. See [spec §14 item 2](../spec.md#14-extras-above-the-cut-line). 1–2 hours.

- The signed-out landing / sign-up page shows *"🎃 Count Dracula tonight: 212 houses · ~3,140 kids"*, from the Nearby module's site-wide figures: live, non-Rehearsal Events right now, ≥ 5 Households, kids rounded to 5s, refreshed every 10 minutes.
- Hidden below the minimum. Not on the TV and not in `/setup`.
- Under the same switch as nearby ([ticket 41](41-nearby.md)).
- The public endpoint returns only the rounded site line, never per-Household data.

## Acceptance criteria

- [ ] The line shows with ≥ 5 live Households and is hidden below
- [ ] The public response holds only the rounded totals
- [ ] The nearby switch hides it
- [ ] `bun test` passes
