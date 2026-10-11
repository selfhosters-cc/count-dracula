# Ghost, estimated ghost, golden tickets and summaries per Event

Type: grilling (HITL)
Status: resolved
Blocked by: 02, 03

## Question

Most of these are already per Event in v1/v2, but each has a rule that names "the live Event", "the Rehearsal" or "the next to go live":

- **Race against / ghost:** per Event already; what a new Household's test Event races; "a Household's own 2026 night becomes its 2027 ghost" when several 2026 Events exist.
- **Estimated ghost:** v2 attaches it to "the live non-Rehearsal Event, or else the next one to go live". Which Event now, and does "About how many kids came last year?" belong to the Household or an Event?
- **Golden tickets:** drawn blind at Go live; v2's Rehearsal had none. Does a test Event get them? (A reset deletes them and the next Go live draws fresh ones, per [Resetting any Event](03-resetting-any-event.md).) Release remaining / End the night choices per Event.
- **Night summary:** exists once an Event is ended. Does every ended Event get one, test Events included? (A reset deletes the summary and its share links.)
- **Recap, tally sheet, CSV export:** per Event already; anything that assumed one live?

## Answer

Resolved 2026-10-11 (HITL grilling).

**The estimated ghost belongs to the Household**
- "About how many kids came last year?" is still stored as the Estimated past event ("Halloween 2025 (estimated)"), but it acts as the Household's **default Race against**. Entering it sets Race against on every Upcoming or open Event that races **None**, and every Event made afterwards starts out racing it.
- Any Event can still be switched to None or another Event by hand. Changing the number updates the same estimated Event; clearing it puts everything racing it back to None (v2's `removeEvent`).
- So a test night shows the ghost on the TV too (pace line, chart, "Last year had N by now"). This replaces v2's `comingNight()` ("the live non-Rehearsal one, or else the next one to go live"), which raced one Event and missed Events made later.
- **No past-Event gate.** v2 offers the field only while the Household has no past Event of its own, and `setLastYear` throws after that. A test night on Oct 15 is Past at noon on Oct 16, so the gate would hide the field two weeks early. The field is always offered in `/setup` (and in the checklist until that item is done), behind the `estimatedGhost` switch. Setting, changing or clearing it only touches Events racing None or racing the estimate. Whether Household #1's "Halloween 2025 (counts)" hides it → [Household #1](10-household-1.md).

**Golden tickets: the same rule for every Event**
- Every Event draws at Go live, blind and stratified over 10–80% of its Race against total, or of its Expected kids when it races nothing, from its own golden-ticket count. There is no test exemption: nothing marks a test night.
- A Manager shapes a test night with the knobs under Advanced: **Golden tickets 0** for none, or **Race against None and Expected kids 10** to see tickets won during a test. Racing an estimate of 120, a test night's tickets sit between kid 12 and kid 96.
- An Event made in `/setup` defaults to 5 tickets (v1). The starter Events' counts → [Sign-up and first run](09-sign-up-and-first-run.md).
- Add a ticket, Release remaining, End the night's three choices (Release & keep going, End anyway, Cancel), the 3 am expiry and Resume bringing expired tickets back are v2's, **per Event**: each acts on the Event it names.
- Kept: an Event that goes live with no ghost and no Expected kids draws nothing; Add a ticket covers it. Release remaining's 7:45 pm stays a phone-side gate, not a server rule.

**A Night summary for every Ended or Past Event**
- Every Event that is Ended or Past has one, test nights included. (Past comes only through Ended, per [Live Events and their credentials](02-live-events-and-credentials.md), so v2's `ended || frozen` becomes "Ended or Past".)
- `summary_nearby` is still frozen at End from that moment's Area figures. A test night ended at 5 pm will almost always have no Nearby slide.
- Share links stay one per Event, with the hide-name toggle. They last until sharing is turned off, the Event is deleted or it's reset ([Resetting any Event](03-resetting-any-event.md)).
- "Vs the ghost" follows the Event's own Race against, so a test night racing the estimate says "last year (estimated)".
- `/setup`'s summary link and sharing move from "the live Event's" to **each Ended or Past Event's row** (layout → [/setup with several live Events](08-setup-with-several-live.md)).

**Recap, tally sheet, CSV and the Race against picker**
- **TV recap:** shown while the door's Event is Ended; Past recaps stay Manager-only (`/tv?event=`). Golden numbers are revealed once the Event is Ended or Past.
- **Tally sheet:** prints a named Event (`/tally?event=<id>`), reached from that Event's row in `/setup` and defaulting to the door's Event. The 5:30–9:00 rows are unchanged.
- **CSV export:** already per Event in the API; the `/setup` button moves onto each Event's row.
- **Race against picker:** offers only Events that can be a ghost: **Ended, Past, imported (counts-only) or estimated**, never the Event itself. A pointer already set is kept if its target is reset back to Upcoming (ticket 03); its ghost is empty until that Event has kids.

**Out of scope:** making last year's night the default ghost ("a Household's own 2026 night becomes its 2027 ghost", which v2 states but never built). It first matters in October 2027; until then Race against is picked by hand and the estimate is the only default.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Estimated past event** is the Household's default Race against and no longer needs "without a past night".
