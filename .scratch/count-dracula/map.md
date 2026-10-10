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
| **Catch-up** | Creating a new tag asks "how many already seen?" and re-tags the N most recent *untagged* kids (capped at how many exist). Total count is unchanged; timestamps untouched. |
| **Undo / Recent** | Per-phone Undo removes that phone's most recent kid (repeatable) with a toast. A Recent list shows the last ~10 kids from all phones, each deletable. Removals are **quiet** on the TV — subtle tick-down, no sad sound. |
| **Ghost line** | Last year's cumulative arrivals, from half-hour bucket counts, raced against tonight's live line. Year-over-year is in v1. |
| **Display** | Laptop on HDMI running Chrome fullscreen. TV faces the **porch** — audience is the trick-or-treaters: huge, glanceable visuals, a "You're kid #57!" moment, porch-audible sound. |

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

## Not yet specified

- **Dress rehearsal** — what the Oct 24 rehearsal must exercise and what "pass" means.
- **Idle / attract mode** — what the TV shows when nobody's at the door (could be most of the night).
- **End-of-night recap** — a summary screen once the night winds down; maybe a shareable image.
- **Failure resilience** — what happens if the laptop, server, or Wi-Fi dies mid-night; phones queuing taps offline. Depends on the stack.
- **Visit window tuning** — the actual grouping threshold; may want to be adjustable live.
- **Tag presentation** — colour/emoji assignment per tag, how many tags fit on TV and phone.
- **Final spec assembly** — rolling every decision into the hand-off spec.

## Out of scope

- Multi-household / neighbourhood leaderboard — scoped to one household (charting decision); a separate effort for another year.
- Accounts / sign-up — single household, trusted devices.
