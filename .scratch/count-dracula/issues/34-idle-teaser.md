# Idle teaser

Type: build (AFK)
Status: done
Blocked by: 21, 27, 28

## What to build

Quiet stretches still give the porch something to read. See [spec §7 States](../spec.md#7-tv-screen).

- After **45 s with no taps**, a calm top banner (the new-costume banner, toned down) shows one line, hides, and repeats every ~45 s.
- It rotates through:
  - "🎫 3 golden tickets still hidden — could be YOU!" (only while tickets remain and golden tickets are switched on)
  - "👻 Last year had 212 kids by now — help us catch up!" or "…we're 14 ahead!" (skipped when Race against is None; uses Clock shift)
  - "Next milestone: kid #150!" (only when milestones are switched on)
- It's **silent**. Any tap cancels it immediately. It doesn't run on the ended screen or while the TV is disconnected.

**Modules:** [Night maths](../modules.md#3-night-maths-shared), [Live state](../modules.md#4-live-state-phone--tv), [Celebration director](../modules.md#6-celebration-director-tv).

## Acceptance criteria

- [x] 45 s hands-off shows the teaser, and it repeats every ~45 s with rotating lines
- [x] A tap hides it instantly
- [x] Lines for switched-off features or a None Race against never appear
- [x] The ghost line's numbers match the race chart's 👻 marker
- [x] It plays no sound, and stays hidden while the 🦇 chip is up
