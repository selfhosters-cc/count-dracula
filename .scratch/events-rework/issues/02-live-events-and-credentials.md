# Live Events and their credentials

Type: grilling (HITL)
Status: resolved
Blocked by: 01

## Question

With any number of Events, several live at once (charting chose reading **C**: "live" means *open for counting*, and a rehearsal is just another Event), what is an Event's lifecycle and what do credentials point at?

- **States:** what are they now: not live yet / live / ended / frozen / past? Does "live" still need "ended" as a separate step (v1's End the night keeps it live for stragglers)? What makes an Event stop being live, now that Go live no longer freezes another? Can a Household have **zero** live Events?
- **How many live:** any number, or a cap (per Household, for the hub and abuse)?
- **Join key:** per Event, or kept per Household with the phone choosing an Event? Is it kept when an Event is reset or recreated? Does Change join key survive?
- **TV link:** per Event, or per Household with the TV following "the" Event some rule picks? What do porch and remote viewers see between Events?
- **Deleting:** can a live Event be deleted?
- Update **Event**, **Join key**, **TV link**, **Rehearsal** (likely retired), **Goes live at** in [CONTEXT.md](../../../CONTEXT.md).

Inputs: [the code inventory](01-one-live-event-assumptions.md); v2's [What becomes per-household](../../multi-household/issues/05-what-becomes-per-household.md) and [Shareable TV](../../multi-household/issues/06-shareable-tv.md).

## Answer

Resolved 2026-10-11 (HITL grilling).

**Four states**
- **Upcoming** (created or scheduled) → **Live** (Go live, by hand or at Goes live at) → **Ended** (End the night, by hand or the auto-end; late kids still count, **Resume** makes it Live again) → **Past** (read-only).
- An Ended Event becomes Past **by itself at noon the next day**, in the Household's time zone, or earlier when a Manager closes it from `/setup`. Past replaces v1's `frozen`: summaries, the TV's "over" state, Setup's Past list and the estimate rules key off it.
- **Go live never changes another Event.** Nothing is frozen by it.
- What ends an Event left Live (the auto-end, a test Event left on for weeks) → [Going live and ending by themselves](05-auto-go-live-and-end.md).

**How many open**
- **Open** = Live or Ended. A Household may have **zero** open Events. That's a normal state every screen and route handles, never a 500.
- **At most 3 open per Household.** At the cap, Go live is refused ("End or close one of your live nights first") and never closes anything by itself. An Ended Event counts until it's Past. Upcoming and Past are uncapped.

**Join key: one per Household**
- It writes to **any open Event** of its Household, and **every write names its Event** (taps, the outbox, End, Resume, Release, soundboard, …). Writes to an Upcoming or Past Event are refused.
- Kept across Events, so a phone set up for a test night works on the real one, and printed QRs and `/?key=` links keep working. Change join key stays and cuts off every phone. A reset or recreated Event doesn't touch it.
- How the door picks among several open Events → [TVs and door phones](04-tvs-and-door-phones.md).

**TV link: one per Household**
- It shows **one open Event at a time**, never a split. Its takeovers, sound and ghost are that Event's. Which Event, and how a porch TV moves from a test night to the real one → [TVs and door phones](04-tvs-and-door-phones.md).
- Live-only as before: open Events, including an Ended Event's recap. Past recaps stay Manager-only.
- **With nothing open:** a "No night on right now" screen, plus the next Upcoming Event's name and a countdown when it has Goes live at. The just-ended recap stays up until that Event is Past.
- Pairing, paired devices, kiosk scripts and Rotate TV link are unchanged.

**Deleting**
- **Refused while Live**: End the night first. Ended, Past and Upcoming Events can be deleted, with a typed name when the Event has kids (a plain confirm otherwise). A Race against pointing at it falls back to None. Devices on it behave as when it goes Past.

**Rehearsal retired**
- No Rehearsal kind and no Rehearsal term. A practice night is just an Event, and a Manager may *name* one "Rehearsal". Whether a "doesn't count toward nearby" marker replaces the flag → [Resetting any Event](03-resetting-any-event.md) and [Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md). Sign-up's starter Events → [Sign-up and first run](09-sign-up-and-first-run.md).

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Event** added (replaces v1's), **Join key** added, **Household**, **Helper**, **TV link** and **Goes live at** updated, **Rehearsal** retired. **Active Household** and **Site-wide total** still say "non-Rehearsal" until ticket 06; **Abandoned sign-up** still says "starter Rehearsal" until ticket 09.
