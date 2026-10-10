# End-of-night recap (Must #9)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 35

## What to build

When the night is ended, the TV shows one static recap in the Scoreboard frame, behind the Must #9 feature switch (off → the "THAT'S A WRAP" top-bar variant from the previous ticket). See [spec §7 Ended](../spec.md#7-tv-screen).

- **Top bar:** "🎃 THAT'S A WRAP — <event name>" (no golden pill, no clock).
- **Hero:** the final count and a verdict: "🏆 New record! +23 on 2025" or "👻 2025 wins this year by 12".
- **Right:** the finished race chart.
- **The leaderboard row becomes four stat cards:**
  - **Peak half-hour** ("7:00–7:30 · 104 kids")
  - **Biggest crew** ("9 kids at once · 7:12pm"), from **Visits**: kids whose taps fall within the event's Visit window of each other
  - **Costume of the night 👑**
  - **Golden tickets:** winners' numbers, unclaimed numbers revealed and greyed, rolled-forward tickets marked "rolled forward"
- **The pumpkin patch** stays as it is.
- A straggler tap plays its pop, then the screen returns to the recap.
- It renders from stored data, so **`/tv?event=<id>`** shows any past event's recap, and Setup's past-events list gets a **View recap** link.

**Modules:** [Night maths](../modules.md#3-night-maths-shared), [Celebration director](../modules.md#6-celebration-director-tv).

## Acceptance criteria

- [x] Ending the night shows the recap with every card filled from real data
- [x] Changing the Visit window regroups Biggest crew
- [x] The golden card shows won, unclaimed (greyed) and rolled-forward numbers correctly
- [x] A straggler pops, then the recap returns with the count updated
- [x] `/tv?event=<id>` renders a frozen past event's recap, and View recap links to it
- [x] Recap total = TV count = CSV non-deleted rows
- [x] Peak half-hour and Visit grouping are unit-tested
