# Thumb-pad counting screen with costumes and Catch-up

Type: build (AFK)
Status: ready-for-agent
Blocked by: 17

## What to build

The real phone counting screen: **Variant A, "Thumb pad"** from [spec §4](../spec.md#4-phone-counting-screen). Use the prototype on branch `prototype/phone-controller` (commit `7aadcef`, `prototypes/phone-controller/`) as the visual reference.

Top to bottom: a header with tonight's total and "N untagged", a 3-column **costume grid** (emoji, name, tonight's count, and a coloured bar in the tag's TV colour from [§7](../spec.md#7-tv-screen)) ending with **"+ New"**, a utility row with placeholders for Undo and Recent, and a giant **"+1 Kid"** filling the bottom ~30%.

- **Tags belong to the live event.** Tapping a tag tile adds a kid with that tag; "+1 Kid" adds an untagged kid. Both go through the outbox.
- **Every tap** flashes an optimistic "#N 🧙" and vibrates. The flash corrects to the server-assigned number if another phone got there first.
- **"+ New"** opens a panel with a name field, an emoji choice and a − / + stepper for "How many already seen before this one?", capped at the untagged count, with a preview of the kid numbers it will re-tag. **Create** applies **Catch-up** ([§2](../spec.md#2-domain-model)): it re-tags the N most recent untagged kids and adds the kid at the door with the new tag, so the total goes up by exactly 1 and timestamps are untouched.
- New SSE deltas: `tag.added` and `kid.retagged`, so every phone's grid and counts stay in sync.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Outbox and door view](../modules.md#5-outbox-and-door-view-phone).

## Acceptance criteria

- [ ] The layout matches the Thumb pad prototype on a phone-sized screen, and the grid scrolls when there are many tags
- [ ] Tag taps and "+1 Kid" taps both count, both offline and online
- [ ] The optimistic flash corrects when two phones tap at the same moment
- [ ] Catch-up with N=3 re-tags exactly the 3 most recent untagged kids, adds one tagged kid, and raises the total by 1
- [ ] The stepper can't exceed the untagged count, and the preview lists the right numbers
- [ ] A tag created on phone A appears on phone B without a reload
- [ ] Tests cover the Catch-up update (cap, ordering, the +1)
