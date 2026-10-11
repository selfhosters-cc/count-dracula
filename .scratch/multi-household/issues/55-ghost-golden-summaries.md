# The Household's estimate, golden tickets and summaries per Event

Type: build (AFK)
Status: ready-for-agent
Blocked by: 50

## What to build

See [v2.1 §7](../spec-v2.1.md#7-ghost-golden-tickets-and-summaries).

- **The estimate is the Household's default Race against.**
  - Setting "About how many kids came last year?" sets Race against on every Upcoming or open Event racing None, and new Events start racing it.
  - Changing it updates the same estimated Event. Clearing it puts its racers back to None.
  - It only ever touches Events racing None or racing the estimate. `comingNight()` and `canEstimateLastYear`'s gate go: the field is always offered behind the `estimatedGhost` switch.
- **Golden tickets:** one rule for every Event, drawn at Go live from its own count. No Rehearsal exemption. Add a ticket, Release remaining, End's choices, the 3 am expiry and Resume act on the Event they name.
- **A Night summary for every Ended or Past Event.** `summary_nearby` is frozen at End from the Household's "near you" figures. Share links stay one per Event.
- **Recap:** shown while the door's Event is Ended. Numbers are revealed once Ended or Past.
- **Tally sheet:** `/tally?event=<id>`, defaulting to the door's Event.
- **The Race against picker** offers only Ended, Past, counts-only or estimated Events, and never the Event itself. A pointer at a reset Event is kept.

## Acceptance criteria

- [ ] Entering 120 sets Race against on a test night and Halloween 2026 (both racing None), and a night made afterwards races it; one racing "Halloween 2025 (counts)" is untouched
- [ ] The field is offered after the Household has a Past Event of its own
- [ ] Clearing the estimate puts its racers back to None
- [ ] Two open Events each draw, add, release and expire their own tickets
- [ ] An Ended test night has a Night summary and a share link
- [ ] `/tally?event=` prints the named Event; bare `/tally` prints the door's Event
- [ ] The picker never offers an Upcoming or Live Event, or the Event itself
- [ ] `bun test` passes
