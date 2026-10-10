# TV screen prototype

Type: prototype (HITL)
Status: resolved
Blocked by: 04

## Question

What does the porch-facing TV screen look like, readable from 3m+ in a glance? Covers: the layout, the "You're kid #N!" celebration when a kid is added, the chart form (cumulative line vs per-interval bars), how tonight's line races the ghost line, how tags show up, and the quiet tick-down on removal. Build a rough animated prototype driven by fake taps (keyboard keys) to react to.

**Burst handling:** last year peaked at 119 kids in 30 min and totalled 346 (see `data/2025-counts.md`). Bursts of 8–10 kids at once are normal, so the prototype must show how celebrations queue or combine (e.g. "Kids #210–#215! 🎉") without falling behind.

**Features to lay out** (from [Fun-features shortlist](04-fun-features-shortlist.md)): kid #N pop, race against the ghost line, milestones and full-screen takeovers, golden ticket "YOU WON!" and the "N remaining" badge, costume leaderboard, new-trend alert, and the pumpkin patch. Key layout question: how the pumpkin patch and the chart share the screen.

## Answer

**Layout A, "Scoreboard", won.** The user checked it on the real TV: "looks great on tv". It beat B (pumpkin patch scene with the count in the moon) and C (one-panel rotating carousel).

Layout A, at 1080p:
- **Top bar:** title, a "🎫 N golden tickets left" pill and the clock.
- **Left third, hero:** "KIDS TONIGHT" plus a giant count, then the pace line ("👻 4 ahead of last year's ghost", which becomes "🏆 New record!" after 346).
- **Right two-thirds, race chart:** last year as a dashed pale ghost line (labelled "2025: 346") and tonight as a thick pumpkin-orange line. A 👻 marker sits at last year's value for the current time, and an orange dot is labelled with tonight's count. The y-axis scales in hundreds (minimum 400) and the x-axis runs from 5:30 to 8:30pm.
- **Full-width row, costume leaderboard:** the top 5 tags as horizontal bars in tag colours. Each row shows emoji, name and count, and bars reorder with animation when one overtakes another.
- **Bottom strip, pumpkin patch:** one pumpkin per kid, coloured by tag (untagged = orange). Golden-ticket kids get a gold pumpkin. New pumpkins pop in. This settles how the patch and the chart share the screen: the patch is a ground strip, not a scene.

Celebrations as prototyped. They were seen on the TV and not contested, so they are the baseline (tune timing at the rehearsal):
- **Kid pop:** an orange "YOU'RE KID #N!" chip at the centre of the screen with small confetti, about 1.5 s. Kids arriving within that window **merge** into "WELCOME, KIDS #N–M!" (capped at about 3 s), so bursts never fall behind.
- **Priority queue:** golden ticket > beat last year > every 100th > every 50th > pop. Milestones never merge into a pop.
- **Every 50th:** a bigger white chip "MILESTONE #150! 🎉" with emoji confetti, about 3 s.
- **#100/#200/#300, beat last year (#347), golden ticket:** full-screen takeovers (Creepster headline, emoji confetti), 5–6 s. Golden uses a gold palette: "KID #N WINS! You found a golden ticket!".
- **New costume:** a top banner "NEW COSTUME SPOTTED! 🖤 Wednesday ×3" (N includes catch-up), about 4 s.
- **Soundboard:** "MWAHAHAHA!" / "AWOOOOOO!" text with bats or wolves flying across. It doesn't interrupt the queue.
- **Undo:** the count quietly dips and fades. No chip, no sound.

Notes for the build:
- **Tag colours:** six validated categorical slots on the night surface, in order `#3987e5, #199e70, #c98500, #d55181, #9085e9, #e66767` (passes adjacent-pair CVD checks). Untagged is pumpkin `#ff7a1a`. A 7th+ tag folds to grey `#8a84a8`.
- **Type:** Bungee (numbers, labels), Fredoka (body), Creepster (takeover headlines only).
- **Readability:** the leaderboard text must stay small enough that its rows don't overlap. The first draft's 2vw labels collided at 5 rows.

Prototype: branch `prototype/tv-screen` (commit `1d78274`), `prototypes/tv-screen/`. Published copy: https://claude.ai/artifact/PsgdCkEhU97bSKvRR4thsq
