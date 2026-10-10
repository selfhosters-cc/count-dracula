# Halloween Trick-or-Treater Tracker — Map

Label: wayfinder:map

## Destination

A build-ready v1 spec for a Halloween trick-or-treater tracker: door phones tap kids in, and a laptop-driven, porch-facing TV celebrates each one live. Scoped so it can be built and dress-rehearsed by **Oct 24, 2026** and run on **Oct 31, 2026**.

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

## Not yet specified

- **Dress rehearsal** — what the Oct 24 rehearsal must exercise and what "pass" means. Laptop kiosk setup supplies an 11-step hardware checklist; still open: app-level scenarios (burst of 10 kids, phone offline, server restart).
- **Idle / attract mode** — the Scoreboard layout (see TV screen prototype) is always on and already readable when idle; still open whether quiet stretches need anything extra (e.g. a periodic "next golden ticket could be YOU" teaser).
- **End-of-night recap** — a summary screen once the night winds down; maybe a shareable image.
- **Failure resilience** — phone outbox + snapshot-on-reconnect covers Wi-Fi blips (see Live-update stack); still open: server/laptop crash recovery and a manual fallback if everything dies.
- **Visit window tuning** — the actual grouping threshold; may want to be adjustable live.
- **Event setup** — creating an event before the night: name, tags set up ahead of time, golden ticket count and draw, entering ghost data, choosing which event is live. Probably a small admin view on the phone.
- **Tag presentation** — TV side: six validated colours then grey, top 5 on the leaderboard (see TV screen prototype); open how emoji get chosen when a tag is created live. Phone side: a 3-column grid that scrolls (see Phone controller prototype); open whether rarely-used tags should sink or hide.
- **Phone secondary controls** — where the soundboard, "release remaining tickets", mute/volume and event admin live, kept off the main counting screen (a menu? a second tab?). Depends on Sound design and Event setup.
- **Final spec assembly** — rolling every decision into the hand-off spec.

## Out of scope

- Multi-household / neighbourhood leaderboard — scoped to one household (charting decision); a separate effort for another year.
- Accounts / sign-up — single household, trusted devices.
- Candy meter, photo booth/camera, kid self-tap tablet, weather — cut in [Fun-features shortlist](issues/04-fun-features-shortlist.md): no candy shortage last year, privacy with a street-facing TV, accuracy, low value.
