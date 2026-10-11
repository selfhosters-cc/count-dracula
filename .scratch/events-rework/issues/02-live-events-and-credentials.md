# Live Events and their credentials

Type: grilling (HITL)
Status: ready-for-human
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
