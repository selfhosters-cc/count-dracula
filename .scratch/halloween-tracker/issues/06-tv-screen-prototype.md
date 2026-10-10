# TV screen prototype

Type: prototype (HITL)
Status: open
Blocked by: 04

## Question

What does the porch-facing TV screen look like, readable from 3m+ in a glance? Covers: the layout, the "You're kid #N!" celebration when a kid is added, the chart form (cumulative line vs per-interval bars), how tonight's line races the ghost line, how tags show up, and the quiet tick-down on removal. Build a rough animated prototype driven by fake taps (keyboard keys) to react to.

**Burst handling:** last year peaked at 119 kids in 30 min and totalled 346 (see `data/2025-counts.md`). Bursts of 8–10 kids at once are normal, so the prototype must show how celebrations queue or combine (e.g. "Kids #210–#215! 🎉") without falling behind.

**Features to lay out** (from [Fun-features shortlist](04-fun-features-shortlist.md)): kid #N pop, race against the ghost line, milestones and full-screen takeovers, golden ticket "YOU WON!" and the "N remaining" badge, costume leaderboard, new-trend alert, and the pumpkin patch. Key layout question: how the pumpkin patch and the chart share the screen.
