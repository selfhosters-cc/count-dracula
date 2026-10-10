# Costume leaderboard (Must #5)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 18, 20

## What to build

The full-width leaderboard row on the TV, behind the Must #5 feature switch (off → row hidden). See [spec §7](../spec.md#7-tv-screen).

- The **top 5 tags** as horizontal bars, each showing emoji, name and count.
- **Tag colours** by order from six slots: `#3987e5, #199e70, #c98500, #d55181, #9085e9, #e66767`. The 7th tag and later fold to grey `#8a84a8`. Use the same mapping as the phone tiles' bars.
- Bars **reorder with animation** when one overtakes another. Updates from retags, renames, deletes and undos are reflected.
- Text stays small enough that 5 rows never collide (the first draft's 2vw labels did).

**Modules:** [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [ ] With 7+ tags only the top 5 show, in the right colours
- [ ] An overtake animates the reorder smoothly
- [ ] Catch-up retags and costume renames update the bars live
- [ ] Five long costume names don't overlap at 1080p
- [ ] With the switch off, the row is hidden and the layout still looks deliberate
