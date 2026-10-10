# Phone controller prototype

Type: prototype (HITL)
Status: resolved
Blocked by:

## Question

How should the door phone's controller look and behave so a person holding a candy bowl can count a crowd one-handed? Covers: the "+1 Kid" button plus a tag-button grid, "+ New" tag creation with the catch-up prompt, per-phone Undo with a toast, and the Recent list (last ~10 from all phones, ✕ to delete). Build a rough clickable prototype with fake local state to react to.

## Answer

**Variant A, "Thumb pad", won** (2026-10-10). The layout, from top to bottom:

- **Header:** tonight's total, plus a small "N untagged" count.
- **Golden banner:** "⭐ NEXT KID IS GOLDEN — get the prize ready" spans the full width under the header when the next number is a golden ticket.
- **Costume grid:** 3 columns of tiles, each showing emoji, name and tonight's count, with a coloured bar along the bottom. "+ New" is the last tile. The grid scrolls if there are more costumes than fit.
- **Utility row:** "↶ Undo" and "🕘 Recent ▴" sit just above the big button.
- **"+1 Kid":** a giant button filling the bottom ~30% of the screen, in the thumb zone.

Behaviour:

- **Every tap** flashes "#N 🧙" and vibrates (a stronger pattern when the kid is golden).
- **Undo** removes *this phone's* most recent kid. It can be repeated, and each time a toast says "Removed #N · 🧙 Witch".
- **Recent** is a slide-up panel showing the last 10 kids from all phones, newest first. Each row has the number, costume, which phone tapped it, the time, and a ✕ to delete. Deleting another phone's kid says so in the toast.
- **"+ New" costume** opens a panel with a name field, an emoji choice, and a − / + stepper for **"How many already seen before this one?"** The stepper is capped at the number of untagged kids, and the panel previews which kid numbers it will re-tag. **Create also counts the kid at the door:** it makes the costume, re-tags the N most recent untagged kids, then adds this kid with the new costume. The total goes up by exactly 1, and the alert says ×(N+1). *This changes the charting-time Catch-up rule ("total unchanged").*

Not settled here: where the phone's secondary controls live (soundboard, "release remaining tickets", mute/volume, event admin). They stay off the main counting screen. This is now in the map's fog.

Prototype (all three variants, verdict in the header comment): branch `prototype/phone-controller` (commit `7aadcef`), files `prototypes/phone-controller/`. Run with `bun prototypes/phone-controller/serve.ts`.
