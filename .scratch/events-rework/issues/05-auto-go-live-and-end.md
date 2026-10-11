# Going live and ending by themselves

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

v2's minute tick makes an Event live at **Goes live at** by running Go live, which **froze the old live Event** (normally the Rehearsal). With several live at once, nothing is frozen. What do the automatic moves become?

- **Goes live at:** still the way "Halloween 2026" starts? What happens to the Event that was live before it (a test Event)? (TVs and phones move to whichever open Event went live most recently, per [TVs and door phones](04-tvs-and-door-phones.md); so a test Event left Live reappears on the porch TV once the real night goes Past.)
- **The 8:30 pm nudge:** on which Events?
- **The 3 am auto-end:** v2 skips Rehearsals. Without that flag, which live Events does it end? (Ended → Past at noon the next day is decided in [Live Events and their credentials](02-live-events-and-credentials.md).) What ends a test Event left live for weeks?
- **"Go live on Halloween 2026 now"** in the door ☰ (kept for a signed-in Manager, including on the "No night on right now" door, per [TVs and door phones](04-tvs-and-door-phones.md)).
- **The "ended automatically" message** in `/setup` when several Events could have ended.

## Answer

Resolved 2026-10-11 (HITL grilling).

**The 3 am auto-end: every Live Event**
- Any Event still **Live** at the first 3:00 am (Household time) after it went live is ended by the tick, with no Rehearsal exception and no per-Event opt-out. It then goes Past at noon, as decided in [Live Events and their credentials](02-live-events-and-credentials.md). The first tick after a restart still catches up.
- So nothing stays Live past one night, and a test Event left on for weeks can't happen. A test night on Oct 15 ends at 3 am and is Past at noon on Oct 16; to practise again, reset it before then or make a new Event. Resume after 3 am makes it Live until the next 3 am.
- On Halloween, a test night started at 2 pm is still Live when Halloween goes live at 4 pm: both stay open, and the TV and door move to Halloween (per [TVs and door phones](04-tvs-and-door-phones.md)). Both end at 3 am and go Past at the same noon, so the test night never reappears on the porch TV.
- The tick's `end` names its Event (fixes v2's "ends the first live row").

**Goes live at: still how Halloween starts, and it makes room at the cap**
- The tick runs Go live on an Upcoming Event whose Goes live at has passed. It never ends a Live Event.
- **At the 3-open cap,** the tick closes the **oldest Ended** Event (Past early: no more late kids, the recap leaves the TV) and then goes live. If all 3 are Live, it **waits**: the Event stays Upcoming and goes live on the first tick after one is ended or closed. This make-room rule is only for the unattended tick. A Manager's Go live at the cap is still refused (ticket 02).

**The 8:30 pm nudge: only the door's Event**
- It shows only for the Event the door is on (the open Event that went live most recently), when that one is Live and not Ended. The rest is v2's: from 8:30 pm Household time through the small hours, after 30 minutes with no tap, and dismissing it hides it for 30 minutes. Its End ends that Event by name.
- Other Live Events are never nudged; the auto-end catches them. If the door switches while the nudge is up, the nudge goes, and the new Event is judged on its own last tap.

**"Go live on <Event> now" in the door ☰ (signed-in Manager)**
- It's for the Upcoming Event with the **soonest Goes live at**, and it's hidden when no Upcoming Event is scheduled (going live on an unscheduled one is `/setup`'s job).
- It shows whether or not other Events are open, on a Live board and on "No night on right now". It keeps v2's confirm: "Go live on Halloween 2026 now instead of at 4:00 pm?"
- At the cap it's refused like any Manager's Go live ("End or close one of your live nights first"), with no closing made for you.

**`/setup`'s notes on what the tick did**
- Each unattended move is a note **on the Event it touched**, not a page banner. Where they sit is [/setup with several live Events](08-setup-with-several-live.md)'s layout. No email or push.
  - **Auto-ended:** "Ended automatically at 3:00 am. Late kids still count until noon." with Resume / Close now and the summary link. One per Event it ended. It goes on Resume or at Past.
  - **Closed to make room:** "Closed at 4:00 pm so Halloween 2026 could go live", on the Event closed early, **for 24 hours**.
  - **Waiting at the cap:** "Couldn't go live at 4:00 pm: 3 nights are open. It'll go live as soon as you end or close one." It stays on the waiting Event while it waits.

**Reset and a Goes live at that has passed** (found while grilling, amends [Resetting any Event](03-resetting-any-event.md))
- Reset keeps Goes live at only if it's still **in the future** and clears it otherwise. Without this, resetting Halloween at 5 pm would make it Live again within a minute.
- Ticket 03's case still works: test Halloween on Oct 30, reset it, and it goes live by itself at 4 pm on Oct 31.
- When the time is cleared, the reset confirm says "Halloween 2026 won't go live by itself again. Go live when you're ready." Setting Goes live at stays Upcoming-only, and a time in the past is refused.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Event** now covers the auto-end; **Reset** keeps only a future Goes live at; **Goes live at** covers making room at the cap and waiting.
