# New-costume alert (Must #6)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 18, 25

## What to build

When a helper creates a costume live with "+ New", the TV shouts about it. It sits behind the Must #6 feature switch (off → no banner). See [spec §8](../spec.md#8-celebration-rules) and [§10](../spec.md#10-sound).

- A top banner "NEW COSTUME SPOTTED! 🖤 Wednesday ×3" for ~4 s, where the count includes the Catch-up kids plus the kid at the door (×(N+1)).
- A two-tone "ding-ding" sting.
- It fires only for tags created live from a phone, not for presets created in Setup.

**Modules:** [Celebration director](../modules.md#6-celebration-director-tv), [Sound engine](../modules.md#7-sound-engine-tv).

## Acceptance criteria

- [x] "+ New" with Catch-up 3 shows "×4" with the right emoji and name
- [x] The banner coexists with the pop for the kid at the door without stomping on it
- [x] Creating a costume preset in Setup doesn't trigger it
- [x] With the switch off, no banner or ding appears
