# Pumpkin patch (Must #8)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 20, 28

## What to build

The bottom strip of the TV fills with one pumpkin per kid, behind the Must #8 feature switch (off → strip hidden). See [spec §7](../spec.md#7-tv-screen).

- One pumpkin per non-deleted kid, coloured by tag (untagged = `#ff7a1a`, golden winner = gold, other tags use the leaderboard colours).
- New pumpkins pop in. Undone or deleted kids' pumpkins go away quietly; a deleted golden winner's gold pumpkin goes with it.
- It must stay smooth at ~400 pumpkins. If time runs short, fall back to coloured dots that grow into pumpkins.

**Modules:** [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] Each live tap adds a pumpkin in the right colour, with a pop-in
- [x] A golden winner's pumpkin is gold
- [x] Retags and deletions update the patch
- [x] 400 kids render without the frame rate dropping noticeably during a burst
- [x] With the switch off, the strip is hidden
