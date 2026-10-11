# TVs and door phones across several live Events

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

Given [Live Events and their credentials](02-live-events-and-credentials.md), how does each device end up on the right Event?

- **TV:** the TV link is per Household and shows one open Event at a time (decided in [Live Events and their credentials](02-live-events-and-credentials.md)): which one it shows; how a porch TV moves from a test Event to the real night (by itself at Goes live? a Manager's tap?); what it shows when its Event ends, is reset (back to Upcoming, per [Resetting any Event](03-resetting-any-event.md)) or is deleted; remote viewers; the recap.
- **Door phone on `/door`:** joining by QR/link, Count on this device, Add a helper (door ☰ and `/setup`); a phone whose Event ends, is reset or is deleted; switching a phone to another Event; the outbox across a switch.
- **`/?key=`:** old join links and printed QRs keep working by redirecting to `/door` (decided at charting); what the homepage does with a remembered key whose Event is gone.
- **Sound and takeovers** with several open Events on one TV link: only the Event on screen plays them?

## Answer

Resolved 2026-10-11 (HITL grilling).

**Which Event a device is on: one rule, no pin**
- The TV link shows the **open Event that went live most recently**, whether it is Live or Ended (the go-live stamp from [Resetting any Event](03-resetting-any-event.md)). With nothing open: "No night on right now" (ticket 02). No Manager pin or "On the TV" setting.
- So Halloween going live at 4 pm takes the porch TV off a test night left Live, with no tap; End the night on Halloween keeps its recap on screen even if a test night is still Live; Resume doesn't restamp, so it changes nothing on screen.
- When the Event on screen is reset, deleted or goes Past, the TV drops to the next Event the rule picks (an older test night still Live reappears; whether one can still be Live by then is [Going live and ending by themselves](05-auto-go-live-and-end.md)'s), or to "No night on right now" with the next Upcoming Event's countdown.
- Remote viewers use the same link, so they get the same Event, moments and sound as the porch.

**Switching: quiet**
- The TV reconnects to the new Event's board with no transition screen or "Now showing" banner; a freshly Live Event's "Start the night" full screen is the announcement. No "this night was reset" message.
- A takeover or sound playing at the switch is cut off, never finished over the new board.

**Door phones follow the TV**
- `/door` taps into the Event the TV link would show, by the same rule. Helpers never choose; there is **no switch-night control** on the phone. Tapping into another open Event is `/setup`'s "Add missed kids".
- **Nothing open:** `/door` shows "No night on right now" with the next Upcoming Event's name and countdown, no board and no tap buttons, and stays connected so it moves onto the board by itself at Go live. ☰ keeps its device items; a signed-in Manager of the Household keeps "Go live on <next Event> now". No nudge, End, Resume or Release.

**The outbox: taps keep their Event**
- A queued tap belongs to the Event (and go-live stamp) it was tapped under, never re-pointed. If that Event is still open with that stamp (Live or Ended), it lands there even after the phone has moved on; if it's been reset, deleted or gone Past, the server refuses it and the outbox drops it silently.
- The seconds-long race at a switch (a phone that hasn't heard yet counts a kid into the old Event) is accepted: no server-side redirect.

**Sound and takeovers: only the on-screen Event plays**
- Moments (milestones, Beat last year, golden tickets) still fire and are recorded on their own Event; only a TV showing that Event plays them. One reached off screen is recorded silently and never replays.
- A soundboard press names the on-screen Event; if the TV has switched meanwhile, it's dropped. The 3 s cooldown and the TV mix stay per Household.

**`/?key=` and a dead key**
- `/` with a remembered key redirects to `/door`; `/?key=…` (old links, printed QRs) redirects to `/door?key=…`. The homepage never checks the key.
- A key only dies by Change join key (or the Household going). `/door` with a refused key **forgets it** and shows "This phone's link no longer works. Ask your host for a new link or QR code." with one button to the homepage, so the next `/` shows the homepage. A valid key with nothing open gets "No night on right now", not an error.
- `/door?key=` joins the Caddy log-masking shapes.

**Add a helper and Count on this device**
- Add a helper (door ☰ and `/setup`) builds `/door?key=<key>`; its wording names the Household, never an Event, so a QR printed for a test night is right on the real one. Count on this device stores the key and opens `/door`. The Manager-phone check in ☰ is unchanged.
- The key moves out of `/setup`'s "Live now" header to a Household-level place: its layout is [/setup with several live Events](08-setup-with-several-live.md)'s.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **TV link** and **Helper** say which Event they're on.
