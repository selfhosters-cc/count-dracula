# Shareable TV: link, code and QR

Type: grilling (HITL)
Status: resolved
Blocked by: 04

## Question

How does a household make its TV viewable by others, and what do viewers get?

- **Default**: private (the TV needs a sign-in or a device token) or public? v1 lets anyone on the LAN read the TV with no key. On the open internet that's no longer harmless.
- **Link vs code**: an unguessable share link, a short code typed on another device (e.g. `/tv` then "BAT-427"), or both. Where the **QR** is shown (setup page, printable porch poster, the phone menu). Note the v1 rule that the join-key QR never goes on the porch TV. The share QR is a different thing; can it go on the TV?
- **Viewer vs porch TV**: is a shared viewer the same `/tv` page (takeovers, sound on click) or a lighter "watch along" view? Does the household's own porch laptop sign in differently from a shared viewer?
- **Revoke and rotate**: turning sharing off, regenerating the code, expiry after the night.
- **What's exposed**: household name, costume names, kid numbers, golden-ticket wins, anything location-related.
- **One sharing model?** [Shareable night summary](09-shareable-night-summary.md) already gives each ended night a public share link that works until turned off. Decide whether the TV's link/code is the same household-level "sharing on/off" or a separate one.
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): no Household in URLs and reads are no longer open. The TV credential decided here is what lets `/tv`, `/tally` and the teaser read a Household's live Event. Viewers see times in the Household's own time zone.

## Answer

Resolved 2026-10-10 (HITL grilling).

**One credential: the TV link**
- Each Household always has exactly one **TV link**, a secret URL (e.g. `/tv/k/<long random token>`; the token identifies the Household, so no slug is needed). The porch TV and every remote viewer use the same link. There's no sharing on/off: who holds the link is who can watch.
- **No expiry.** `/setup` has **Rotate TV link** (any Manager, with a confirm). Every device holding the old link is disconnected straight away (its stream closes) and falls back to the pairing screen below. Deleting the Household removes it with everything else.

**Getting it onto a device**
- **In `/setup`:** the TV link with **Share** (`navigator.share`), **Copy**, and a full-screen **QR** for someone standing next to the Manager. The TV link's QR appears **only in `/setup`**: never on the porch TV, and no printable poster.
- **TV pairing code:** a bare `/tv` (no link) shows a pairing screen. It has a 6-character code from an alphabet with no lookalikes (e.g. `K7Q-M4X`), valid 10 minutes and then replaced, plus a **scan-to-pair QR** (the vendored `public/vendor/qrcode`) that opens `/setup` with the code filled in. A signed-in Manager scans it or types it into `/setup` → **Pair a TV**, confirms "Show our TV here?", and the waiting device switches to the Household's TV link. Redeeming needs a Manager session and is rate-limited per Manager, so a guessed code gets nothing. The pairing QR may appear on a TV; the v1 rule "the join QR never goes on the TV" still holds.

**What viewers get**
- **The same `/tv` page** as the porch: takeovers, sound, recap. The full-screen "Start the night" click stays as the way in (it unlocks sound). On a portrait phone, a "turn your phone sideways" overlay; a portrait layout comes after Halloween.
- **It reaches the live Event only:** the live board, its ghost, the idle teaser, and its end-of-night recap. It follows Go live to the next Event. **Past recaps** (`/tv?event=<id>`) and the **print tally sheet** need a signed-in Manager of the Household; both are opened from `/setup`. This amends [What becomes per-household](05-what-becomes-per-household.md), which listed `/tally` under the TV credential.
- **TV-shaped payload:** snapshot and stream reads made with the TV link leave out each kid's `phoneName` and `settings.lanUrl`. Everything else stays as the TV draws it: Event name, costume names and emoji, kid numbers, tap times, ghost buckets, won golden numbers and the golden summary. The join key was never in the snapshot and still isn't. Join-key phones keep the full payload.
- **Not on the TV:** the Household display name (the title stays "Count Dracula", or the Event name once ended) and anything location-related, unless [Nearby activity indicator](08-nearby-activity.md) decides to put a nearby strip there.

**Separate from the Night summary's sharing**
- [Shareable night summary](09-shareable-night-summary.md) links are per ended night, public, and each can be turned off. The TV link is per Household, live-only, and only rotated. They share no switch and no token.

**Handed on**
- A cap on viewers per TV link → [Public hosting and abuse](11-public-hosting-and-abuse.md).
- How the kiosk scripts take the TV link, and the smart-TV pairing walkthrough → [From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md).

Glossary: TV link and TV pairing code added to [CONTEXT.md](../../../CONTEXT.md).
