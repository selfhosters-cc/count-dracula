# Nearby, the site-wide total and Operator status without a Rehearsal flag

Type: grilling (HITL)
Status: resolved
Blocked by: 02, 03

## Question

v2 counts a Household into nearby, the site-wide total and the Operator's Counting status through its **one live, non-Rehearsal Event**. With several live Events and no Rehearsal flag:

- **Which Events count:** every live Event? Only ones that went live by Goes live at? Only on/after a date? ([Resetting any Event](03-resetting-any-event.md) keeps **no practice marker**: a reset Event goes back to Upcoming with no kids, so only unreset open Events are in question.) How do test taps at 3 pm on Oct 31 stay out?
- **A Household with two counting Events:** counted once in "houses counting"? Kids summed?
- **Active Household**, **Site-wide total** definitions in [CONTEXT.md](../../../CONTEXT.md).
- **Operator table:** Counting / Stale / Waiting / Rehearsal per Household when it has several live Events; the 3 am auto-end check on Nov 1.
- The site-wide top costume clause and the sign-up page total follow whatever's chosen.

## Answer

Resolved 2026-10-11 (HITL grilling).

**Which Events count: every open one**
- Any **open** Event (Live or Ended) can count, with no date, schedule or practice filter. Ended Events count as in v2: late kids are still kids.
- Test taps can count. A test kid at 3 pm on Oct 31 makes a house Active for 30 minutes. That's one house among the ≥ 5 an Area needs, with kids rounded to 5s, so it's accepted. Ruled out: only Halloween night (hard-codes the date) and only Events that went live by Goes live at (a Manager going live by hand would silently drop out).

**One house, through the door's Event**
- Each Household is **one house**, however many Events it has open. This fixes v2's `computeNearby`, which counts Event rows as houses and sums every row's kids.
- Everything a Household adds comes from **the door's Event**: its open Event that went live most recently, the one its TV and door show (per [TVs and door phones](04-tvs-and-door-phones.md)). That Event decides whether the house is Active and supplies its kids in 30 minutes, its whole-night kids and its costume counts. Taps into the Household's other open Events (Add missed kids into a test night) don't show.
- So a test night started at 2 pm on Halloween, still open until noon on Nov 1, stays out of the night's figures once Halloween 2026 goes live, with no practice marker.
- **Active Household:** its door's Event counted a kid in the last 30 minutes, and it isn't Suspended. Area figures (minimum of 5, kids in the last half hour, houses counting, top costume) are otherwise v2's.

**The Site-wide total: v2's rule, through the door's Event**
- Households with an open Event, Active or not, and the whole-night kids of their door's Events. Rounded to 5s, refreshed every 10 minutes, hidden below 5 Households. It only grows through the night.
- Ruled out: Active Households only (the house count would fall all evening while kids rise, and the homepage would go blank as the night quiets).
- Now that it's on the homepage all year (ticket 11), it can show an October figure when 5 or more Households test at once (true, so harmless). It also shows last night's total until noon on Nov 1, while Ended Events are still open. The "tonight" wording then is [The homepage](11-homepage.md)'s.
- The **site-wide top costume** clause and the homepage line follow the same Events. The ≥ 3 Households and blocklist rules are unchanged.

**The Operator table: judged on the door's Event**

| Status | Rule |
|---|---|
| **Counting** | An Active Household (an Ended Event with a late kid in 30 minutes counts) |
| **Stale** | The door's Event is **Live**, has kids, and none in the last 30 minutes |
| **Waiting** | The door's Event is Live with no kids yet |
| **Ended** | The door's Event is Ended, with no kid in the last 30 minutes |
| **No night** | No open Event (most Households, most of the year) |

- Sorted in that order, most kids first within each. **Rehearsal** is retired. **Kids** and **Last kid** come from the door's Event.
- Ended gets its own status, so Stale means only "Live and gone quiet" (a forgotten End, a dead porch phone), and a Household that ends properly at 10 pm doesn't show as Stale.
- **Nov 1, after 3 am:** the auto-end check is "no Counting, Stale or Waiting rows left" (every Live Event auto-ends at 3 am, per [Going live and ending by themselves](05-auto-go-live-and-end.md)).

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Active Household** and **Site-wide total** lose "non-Rehearsal" and are counted through the door's Event.
