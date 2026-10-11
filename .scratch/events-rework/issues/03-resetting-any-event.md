# Resetting any Event

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

Any Event can be reset, so a "rehearsal" is a separate Event or the real one reset. What does a reset do?

- **What it clears:** kids, tags' counts, milestones and Beat-last-year, golden tickets (redraw? keep?), the recap, Night summary and its share links, Reports.
- **When it's allowed:** live only, ended too, past/frozen? Before Halloween only? Is there a guard on a night with lots of kids (type the name, like Delete)?
- **Who:** Managers only from `/setup`, or also the door ☰ for a signed-in Manager?
- **Live devices:** TVs and phones on the Event during a reset (v2's Rehearsal reset sends them back to 0); a phone's outbox holding taps from before the reset.
- **Any "practice" marker left?** Without a Rehearsal flag, is there still a way to say "this Event doesn't count" for nearby, the site-wide total and the Operator, or does reset alone carry that? (Feeds [Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md).)

## Answer

Resolved 2026-10-11 (HITL grilling).

**What a reset is**
- **Reset** puts a **Live or Ended** Event back to **Upcoming**, as if it never went live. It goes live again by Go live or at its Goes live at. Past and Upcoming Events can't be reset (to run a past night again, make a new Event).
- So "the real one reset" works: test Halloween 2026 on Oct 30, reset it, and it goes live by itself on Oct 31. It doesn't sit open overnight, take one of the 3 open slots, or count anywhere.

**What it clears**
- Kids, backfill batches and fired moments (milestones, Beat last year); ended, auto-ended and went-live-at.
- **Golden tickets are deleted**; the next Go live draws fresh ones from the Event's golden-ticket count. (This fixes v2's reset re-hiding the same numbers after the recap revealed them.)
- **The Night summary (`summary_nearby`) and its share links are deleted.** The recap and tally sheet clear by themselves, being worked out from kids.

**What it keeps**
- Name, Goes live at, Race against, Expected kids, golden-ticket count, clock shift, time zone.
- **Costume tags, at 0**, including any made with + New during the test (deletable in the editor; no "made before Go live" marker).
- **Reports** (the Operator's record; they outlive the page, as when sharing is turned off).
- The join key and TV link ([Live Events and their credentials](02-live-events-and-credentials.md)).

**Who and where**
- **Managers only, from `/setup`**, on the Event's row. Not on the door ☰, even for a signed-in Manager.
- **Guard:** a plain confirm naming the count ("Reset *Halloween 2026*? Its 7 kids are deleted and it goes back to Upcoming."); **above 20 kids**, type the Event's name, as with Delete.
- **No date rule** ("before Halloween only" is not a thing).

**Devices on the Event**
- TVs and door phones treat a reset as the Event **leaving open**, the same path as going Past or being deleted; where they go is [TVs and door phones](04-tvs-and-door-phones.md)'s call.
- **Go-live stamp:** each Go live stamps the Event (its went-live time). Every write carries the stamp of the run it was tapped under; a stale stamp gets a **400**, which the outbox already drops (`public/index.js` `send`). So taps queued offline before a reset never land in the next run, even if Go live is pressed again before the phone reconnects. No "taps discarded" notice.

**No practice marker**
- Without a Rehearsal flag there is **no "doesn't count" marker**. A reset leaves nothing behind to count; an unreset test Event left open beside the real night is [Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md)'s question of which open Events count.

**Race against**
- A Race against pointing at a reset Event **keeps pointing at it**; its ghost is empty until that Event has kids again. (A deleted target still falls back to None, per ticket 02.) The picker may show the target's kid count: a build detail.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Reset** added; **Event**'s _Avoid_ line points at it.

