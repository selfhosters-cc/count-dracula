# Sign-up, first-run and the ready checklist without the Rehearsal

Type: grilling (HITL)
Status: resolved
Blocked by: 03, 04, 08

## Question

v2's sign-up creates a live Rehearsal (no golden tickets, starter costumes) and "Halloween 2026" going live Oct 31, 4 pm; first-run screen 3 ticks over to "Your TV is showing your Rehearsal"; the checklist suggests "Reset the Rehearsal". With a rehearsal being just another Event:

- **What sign-up creates:** one Event ("Halloween 2026") live now and reset before the night (a reset sends it back to Upcoming, so it goes live by itself at Goes live at; [Resetting any Event](03-resetting-any-event.md))? A test Event and "Halloween 2026"? Its names, live state, Goes live at, golden tickets, costumes.
- **After 4 pm Oct 31:** v2 made "Halloween 2026" live at once for a late sign-up.
- **First-run screen 3** and the **checklist**'s three items, reworded, and where the checklist sits now that `/setup` opens on the **Tonight** tab ([/setup with several live Events](08-setup-with-several-live.md)).
- **The homepage hand-off:** Sign up / Sign in on `/` (decided at charting) replaces `/signup`.

## Answer

Resolved 2026-10-11 (HITL grilling).

**What sign-up creates**, by when it happens (in the Household's zone):
- **Before Oct 31, 4:00 pm:** a live **Test night** (starter costumes, no golden tickets) and **"Halloween 2026"**, Upcoming, Goes live at Oct 31, 4:00 pm (starter costumes, 5 golden tickets). Race against is the Household default ([Ghost, estimated ghost, golden tickets and summaries](07-ghost-golden-summaries.md)), None at sign-up.
- **Oct 31, 4:00 pm until Nov 1, 3:00 am:** only "Halloween 2026", **live now**, and no Test night. As in v2, its golden tickets draw nothing until a Race against or Expected kids exists.
- **After Nov 1, 3:00 am:** only a live **Test night**, and no "Halloween 2026". The Household makes a night when it wants one.
- The Test night is an **ordinary Event**: no marker or chip. It auto-ends at 3 am and goes Past at noon ([Going live and ending by themselves](05-auto-go-live-and-end.md)), stays out of nearby once Halloween goes live ([Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md)), can be renamed or deleted like any other, and gets a Night summary. The server remembers **which Event sign-up made as the Test night, by id**, never by name. Only Abandoned sign-up and checklist item 3 use that.
- This replaces the live Rehearsal and "Reset the Rehearsal". Nothing needs a reset after a test: the TV switches to Halloween when it goes live, because Halloween is then the open Event that went live most recently ([TVs and door phones](04-tvs-and-door-phones.md)).

**First-run**
- Screens 1 (name) and 2 (Location) are unchanged. Screen 3's pairing steps and alternatives (Send the link instead, Use this screen as the TV, Skip, Help with TV setup) are unchanged.
- Screen 3's tick names the Event the TV is on: **"✓ Your TV is showing *Test night*"** (or *Halloween 2026* on a late sign-up).

**The ready checklist**
- It sits at the **top of the Tonight tab**, above the door's night, and only there ([/setup with several live Events](08-setup-with-several-live.md)). It ticks from real state and hides when done or dismissed. Ticks, skips and the dismissal are remembered on the phone, as in v2.
1. **A TV is watching:** ticked by a TV-link stream connection, as in v2.
2. **A phone counted a test kid:** ticked by a kid on **any** of the Household's Events. It carries Count on this device and Add a helper. The "Reset the Rehearsal" suggestion is replaced by *"Test night ends by itself at 3 am. Your TV switches to Halloween 2026 when it goes live."*, shown only when both are true.
3. **Your Halloween night:** *"Halloween 2026 goes live Sat Oct 31, 4:00 pm"*, with that Event's **Expected kids** and the Household's **"About how many kids came last year?"** (the same value as Household → Last year (estimated)). It's ticked once either is set, or skipped. The night it follows is the next Event with a Goes live at, else an open Event that isn't the Test night. **Hidden** when there's no such night (a November sign-up).

**The homepage hand-off** (the page itself is [The homepage](11-homepage.md)'s call)
- The **Start your household** form (household name, Continue with Google, the privacy line) and **Already counting? Sign in with Google** move onto `/` unchanged.
- **`/signup` redirects to `/`.** Every "go sign in" points at `/`: `/setup` and `/operator` without a session, sign-out, and the sign-in error pages' Try again, Start again and Sign up links.
- After Google, a new Household lands on `/setup` with first-run, and a returning Manager on `/setup` (Tonight).
- **While sign-ups are paused**, `/` says "Sign-ups are paused, try again later." in place of the Start button, before anyone goes to Google. Sign in still works.

**Wording elsewhere**
- **Abandoned sign-up:** 60 days without a sign-in and no kid counted on any Event but the Test night sign-up made.
- **`/help/tv`:** "test it on your Test night (or Go live on any night)", replacing "test it on your Rehearsal".

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Test night** added; **Abandoned sign-up** reworded.
