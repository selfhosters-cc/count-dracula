# Quiet stretches and end of night

Type: grilling (HITL)
Status: resolved
Blocked by: 

## Question

What does the TV do when nobody is at the door, and how does the night end?

- **Quiet stretches:** the Scoreboard layout is already readable when idle (TV screen prototype). Does it need anything extra during long gaps, e.g. a periodic golden-ticket teaser ("🎫 3 golden tickets still hidden — could be YOU!"), slowly cycling costume stats, or nothing?
- **Ending the night:** who ends it and how (a phone action? just stop tapping?), what happens to golden tickets nobody won, and whether ambience and sound stop.
- **End-of-night recap:** is there a recap screen (final total vs 2025, peak half-hour, biggest crew, top costume, golden winners)? Is a saved/shareable image in v1 or out of scope?

## Answer

Resolved 2026-10-10 by grilling.

**Quiet stretches: one idle teaser, nothing else**

- After **45 s with no taps**, a calm top banner (the new-costume banner, toned down) shows one line, hides, and repeats every ~45 s while it stays quiet. It rotates through:
  - "🎫 3 golden tickets still hidden — could be YOU!" (only while tickets remain)
  - "👻 Last year had 212 kids by now — help us catch up!" / "…we're 14 ahead!" (skipped when Race against is None)
  - "Next milestone: kid #150!"
- **No sound.** Any tap cancels the rotation immediately, so it never competes with a celebration. It doesn't run on the ended screen.
- No cycling costume stats or attract mode: the leaderboard already shows them.

**Ending the night**

- **"🌙 End the night"** goes in the ☰ door menu, with a confirmation and **open to any helper** (the last person on the door often isn't the admin). There's **no automatic end** by clock time, because last year tailed off naturally.
- **The event stays live.** A straggler tap still counts and plays its pop, then the TV returns to the recap. Freezing stays the job of the next Go live.
- **It's reversible:** the ☰ menu then shows **"Resume the night"**.
- **Unwon golden tickets:** if any remain, the End confirmation says "🎫 2 golden tickets never found. Release them to the next 2 kids instead?" and offers **Release & keep going** (runs Release remaining and doesn't end), **End anyway** or **Cancel**. Ending anyway **expires** them, and the pill goes away. Resume brings them back as they were.
- **Sound on End:** one closing sting (cartoony-spooky family, e.g. a descending "wah-wah-WOOO" plus an owl), then the **ambience fades out over ~5 s** to the inaudible keep-alive. Kid bloops and the soundboard keep working for stragglers. The mutes and volume are respected. Resume brings the ambience back. This is consistent with Sound design's "no *automatic* stop", because End is a deliberate action.

**Recap: the ended state *is* the recap**

- **One static screen in the Scoreboard frame**, not a carousel:
  - **Top bar:** "🎃 THAT'S A WRAP — <event name>" (no golden pill, no clock)
  - **Left hero:** the final count plus a verdict: "🏆 New record! +23 on 2025" or "👻 2025 wins this year by 12"
  - **Right:** the finished race chart
  - **The leaderboard row becomes four stat cards:**
    - **Peak half-hour** ("7:00–7:30 · 104 kids")
    - **Biggest crew** ("9 kids at once · 7:12pm", from derived visits)
    - **Costume of the night 👑** (the top tag with its count)
    - **Golden tickets** (winners' numbers; unclaimed numbers shown greyed, revealed now)
  - **The pumpkin patch strip** stays as it is
- This covers the "costume of the night 👑" and "biggest crew" nice-to-haves as recap numbers only, with no live alerts.
- **Build order: Must #9**, the new bottom of the list after Pumpkin patch, so it's dropped first. If it's cut, End shows the Scoreboard with a "THAT'S A WRAP" top bar.
- The recap renders from the event's stored data, so **`/tv?event=<id>` shows any past event's recap**. Setup's past-events list gets a **"View recap"** link. It survives a laptop reboot and lets you pull up 2026 next year.
- **Out of scope:** a saved or shareable recap image. A photo of the TV or a laptop screenshot does the job.
