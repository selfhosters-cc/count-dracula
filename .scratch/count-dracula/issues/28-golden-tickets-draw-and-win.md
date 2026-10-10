# Golden tickets: draw and live win (Must #4)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 17, 22, 27

## What to build

Secret kid numbers win a prize, behind the Must #4 feature switch (off → no draw, pill, banner or takeover). See [spec §9](../spec.md#9-golden-tickets), [§4](../spec.md#4-phone-counting-screen) and [§8](../spec.md#8-celebration-rules).

- **Count** per event (default 5), set in Setup.
- **Draw at Go live**: blind and stratified over **10–80%** of the Race-against event's total (about #35–#277 against 346), or of **Expected kids** when there's no ghost. The range is split into N equal bands with one random number per band. Stored in a golden tickets table (event, secret number, state, winning kid).
- **Nobody sees the numbers.** The TV top bar shows only "🎫 N golden tickets left". Phones show the full-width "⭐ NEXT KID IS GOLDEN — get the prize ready" banner only when **connected with an empty outbox**.
- **The server is the referee:** the first tap to reach the server with the golden number wins. That phone gets the strong golden buzz and "🎫 GOLDEN — hand over the prize!" only on the server's confirmation.
- **The TV** shows the gold takeover "KID #N WINS! You found a golden ticket!" (5–6 s, top of the queue) with a distinctive "you won" fanfare, and **nothing else plays during it**.
- **A win is final.** Undoing or deleting the winner doesn't bring the ticket back, the pill stays down, and the next kid to reach that number is ordinary.
- Late-tap roll-forward, Add a ticket and Release remaining are in the next ticket. Until then a golden number that lands on a late tap must not sit hidden below the count.

## Acceptance criteria

- [ ] Go live stores N numbers, one per band, inside the 10–80% range (unit-tested, including the Expected-kids path)
- [ ] The numbers never appear in any client payload, snapshot or page
- [ ] The banner shows on a connected phone with an empty outbox and hides when the outbox has entries or it's disconnected
- [ ] Two phones racing for the golden number: only the server's chosen tap gets the buzz, and the TV takeover names that number
- [ ] Undoing the winner keeps the ticket won and the pill count unchanged
- [ ] With the switch off, nothing golden appears anywhere
