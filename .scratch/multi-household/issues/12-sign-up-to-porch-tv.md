# From sign-up to a TV on the porch

Type: grilling (HITL)
Status: claimed
Blocked by: 05, 06

## Question

How does a stranger, with no help from us, get from "sign up" to a TV on their porch and helpers' phones counting?

- The first-run path: sign up → set location → first event live → open the TV on a laptop or smart TV → add helper phones (the existing join QR) → a mini rehearsal.
- What a stranger's TV is likely to be (laptop on HDMI as in v1, a smart-TV browser, a Chromecast tab) and what we can promise. The v1 kiosk scripts assume our laptop; do they ship to everyone, get simplified, or become a help page?
- Sound: the "Start the night" click, autoplay on smart-TV browsers.
- A built-in "test night" so strangers can rehearse before Oct 31 (v1's Clock shift and bulk add already exist).
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): sign-up already creates a live "Rehearsal" with a join key, a starter costume list and no golden tickets, and captures the browser's time zone. New Households race None; Expected kids is the only "how big a night" input.
- **Given** ([Shareable TV: link, code and QR](06-shareable-tv.md)): the porch TV opens the Household's TV link (Copy/Share from `/setup`), or a bare `/tv` shows a TV pairing code plus a scan-to-pair QR that a Manager redeems from their phone. Decide here how the kiosk scripts take the TV link and how the smart-TV walkthrough uses pairing.
- **Given** ([Fuzzy location](07-fuzzy-location.md)): first-run asks for a Location once, optional with **Skip**, using the map picker with **Use my location** (it can be set later in `/setup`). Decide here where that step sits in the first-run order.
- **Given** ([Public hosting and abuse](11-public-hosting-and-abuse.md)): the helper join QR always points at the public HTTPS URL (no `lanUrl`, no LAN route); the site sends `frame-ancestors 'none'`, so a TV link can't be embedded in another page (matters for smart-TV or signage apps that wrap a URL in a frame); creating a Household is limited to 3 per IP per day, and the Operator can Pause sign-ups.
