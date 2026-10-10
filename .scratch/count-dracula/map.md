# Count Dracula — Map

Label: wayfinder:map

## Destination

A build-ready v1 spec for **Count Dracula**, a Halloween trick-or-treater tracker: door phones tap kids in, and a laptop-driven, porch-facing TV celebrates each one live. Scoped so it can be built and dress-rehearsed by **Oct 24, 2026** and run on **Oct 31, 2026**.

## Notes

- Domain: one household's Halloween night. No accounts, no multi-tenant. Self-hosted on the homelab.
- Hard deadline: rehearsal Oct 24, live Oct 31. Feature creep is the main risk — prefer cutting to Out of scope.
- Skills each session should consult: `/grilling` + `/domain-modeling` for decisions; `/prototype` for prototype tickets; `/research` for research tickets; `dataviz` for anything chart-shaped.
- Tracker: local markdown — tickets in `issues/NN-<slug>.md` with `Type:`, `Status:`, `Blocked by:` lines.

### Locked during charting (2026-10-10)

| Term | Meaning |
|---|---|
| **Event** | One night ("Rehearsal", "Halloween 2026", …). Exactly one is **live**; phones and TV follow the live event. Past events are kept. |
| **Kid** | One tap = one kid, with a timestamp and at most one Tag. |
| **Kid number** | The live count at the moment a kid reaches the server, stored once and never rewritten, so the pop always matches the count. Freed numbers are reused after an undo (decided in [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md)). |
| **Visit** | Derived, not entered: kids whose taps fall within a short window (~15s, to be tuned) of each other. |
| **Tag** | A costume button, created beforehand or live from a phone via "+ New". Tapping a tag button *adds* a kid with that tag (one tap per kid); "+1 Kid" adds an untagged kid. |
| **Catch-up** | Creating a new tag asks "how many already seen before this one?", re-tags the N most recent *untagged* kids (capped at how many exist), **and adds the kid at the door with the new tag** — total +1 (revised in [Phone controller prototype](issues/05-phone-controller-prototype.md)). Timestamps untouched. |
| **Undo / Recent** | Per-phone Undo removes that phone's most recent kid (repeatable) with a toast. A Recent list shows the last ~10 kids from all phones, each deletable. Removals are **quiet** on the TV — subtle tick-down, no sad sound. |
| **Ghost line** | Last year's cumulative arrivals, from half-hour bucket counts, raced against tonight's live line. Year-over-year is in v1. |
| **Display** | Laptop on HDMI running Chrome fullscreen. TV faces the **porch** — audience is the trick-or-treaters: huge, glanceable visuals, a "You're kid #57!" moment, porch-audible sound. |

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

- [Last year's numbers](issues/01-last-years-numbers.md) — 346 kids from 17:42 to 20:00, peak 119 in 19:00–19:30; natural drop-off, so 346 is a fair target; ghost line flat after 20:00.
- [Fun-features shortlist](issues/04-fun-features-shortlist.md) — 8 must-haves in build order (kid pop → ghost race → milestones → 5 secret golden tickets → leaderboard → trend alert → soundboard → pumpkin patch); 4 nice-to-haves; 4 cut.
- [Live-update stack](issues/02-live-update-stack.md) — Bun + bun:sqlite, POST taps + SSE with a snapshot on connect, phone-generated IDs for idempotent offline taps, no-build TV with Chart.js/Motion/confetti.
- [Laptop kiosk setup](issues/03-laptop-kiosk-setup.md) — "Start the night" click plus Chrome autoplay flag and `--kiosk`; OS-level keep-awake; 1080p60 with TV "Just Scan"; Web Audio with capped overlaps; 11-step rehearsal checklist.
- [Phone controller prototype](issues/05-phone-controller-prototype.md) — "Thumb pad": giant +1 Kid at the bottom, 3-column costume grid above, Undo + slide-up Recent between them; "+ New" also counts the kid at the door.
- [TV screen prototype](issues/06-tv-screen-prototype.md) — Layout A "Scoreboard": giant count + pace left, ghost-race chart right, full-width costume leaderboard, pumpkin-patch ground strip; merged burst pops, priority queue, full-screen takeovers for 100s/golden/beat-last-year.
- [Sound design](issues/07-sound-design.md) — arcade bloops for each kid (5 variations, rising scale for bursts, quieter in the rush), cartoony-spooky stings for big moments, wind/cricket ambience bed, 6-button soundboard (3 homemade) on the TV with a 3 s cooldown, mute toggles in the phone menu.
- [Hosting and phone access](issues/08-hosting-and-phone-access.md) — Bun + SQLite in a new Proxmox LXC; tailnet devices via https://count-dracula.example.com, helpers via LAN HTTP; per-event join key required for writes; QR only on a phone, never the porch TV; phone names in Recent.
- [Event setup and phone menu](issues/09-event-setup-and-phone-menu.md) — Go live freezes the old event and keeps the join key; costumes per event with "Copy from"; 2025 ghost seeded from a file; per-event Clock shift for the rehearsal; blind stratified golden draw at Go live; ☰ door menu for every helper, `/setup` behind an admin PIN.
- [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md) — one silent idle teaser after 45 s; any helper can "🌙 End the night" (reversible, event stays live, unwon golden tickets released or expired); the ended state is a static recap screen (Must #9), viewable per past event.
- [Failure fallback](issues/11-failure-fallback.md) — phones count offline with a ⏳ pill ("don't reload"); TV freezes calmly with a 🦇 chip, then one quiet roll-up; late taps skip #100s, delay Beat last year, roll golden tickets forward; paper tally sheet + "Add missed kids" backfill (also the rehearsal's bulk add); CSV export + existing Proxmox backup job.
- [Dress rehearsal plan](issues/12-dress-rehearsal-plan.md) — Oct 24 in two parts (3pm app script with Clock shift +3h; 6:30pm dusk sidewalk, volume and idle checks); staged golden test; 7 blockers re-run Wed Oct 28; feature freeze Oct 24 with config switches for Must 3–9; paper plus Nov 1 backfill as the last resort; printed checklist.
- [Assemble the v1 spec](issues/13-assemble-the-v1-spec.md) — [spec.md](spec.md) (19 sections, plus a Builder's latitude list) and the printable [rehearsal-checklist.md](rehearsal-checklist.md); one gap sent back as [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md).
- [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md) — number = count at arrival, never rewritten; golden wins are final; milestones fire once per event; the server referees golden races (banner only on connected phones with empty outboxes); Recent/recap/CSV use the stored number.

## Not yet specified

<!-- Charting-time fog has graduated: event setup + phone secondary controls + visit window → Event setup and phone menu; idle + recap → Quiet stretches and end of night; resilience → Failure fallback; rehearsal → Dress rehearsal plan (resolved); spec assembly → Assemble the v1 spec (resolved). Tag presentation was answered by the two prototypes (emoji picked in "+ New"; six TV colours then grey). -->

- Nothing un-ticketable remains in view. New fog may appear as the last tickets resolve.

## Out of scope

- Multi-household / neighbourhood leaderboard — scoped to one household (charting decision); a separate effort for another year.
- Accounts / sign-up — single household, trusted devices.
- Saved/shareable recap image — ruled out in [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md): a photo of the TV does the job; the recap stays viewable per event instead.
- Candy meter, photo booth/camera, kid self-tap tablet, weather — cut in [Fun-features shortlist](issues/04-fun-features-shortlist.md): no candy shortage last year, privacy with a street-facing TV, accuracy, low value.
