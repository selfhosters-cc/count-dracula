# Shareable TV: link, code and QR

Type: grilling (HITL)
Status: open
Blocked by: 04

## Question

How does a household make its TV viewable by others, and what do viewers get?

- **Default**: private (the TV needs a sign-in or a device token) or public? v1 lets anyone on the LAN read the TV with no key. On the open internet that's no longer harmless.
- **Link vs code**: an unguessable share link, a short code typed on another device (e.g. `/tv` then "BAT-427"), or both. Where the **QR** is shown (setup page, printable porch poster, the phone menu). Note the v1 rule that the join-key QR never goes on the porch TV. The share QR is a different thing; can it go on the TV?
- **Viewer vs porch TV**: is a shared viewer the same `/tv` page (takeovers, sound on click) or a lighter "watch along" view? Does the household's own porch laptop sign in differently from a shared viewer?
- **Revoke and rotate**: turning sharing off, regenerating the code, expiry after the night.
- **What's exposed**: household name, costume names, kid numbers, golden-ticket wins, anything location-related.
- **One sharing model?** [Shareable night summary](09-shareable-night-summary.md) already gives each ended night a public share link that works until turned off. Decide whether the TV's link/code is the same household-level "sharing on/off" or a separate one.
