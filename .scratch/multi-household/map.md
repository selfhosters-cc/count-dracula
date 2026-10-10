# Multi-household Count Dracula — Map

Label: wayfinder:map

## Destination

A build-ready **v2 spec plus build tickets** for Count Dracula as one public, multi-household deployment: households sign up and run their own nights; TVs shareable by link, code and QR; a fuzzy location; an operator dashboard with stale events; a nearby-activity indicator; a shareable night summary. Ranked in build order against the **Oct 24, 2026 feature freeze**, with today's data migrated into household #1, in the same shape as v1, so the existing ticket loop can build it.

## Notes

- **Scope, decided at charting (2026-10-10):**
  - **Open public sign-up**, live for **Halloween, Oct 31, 2026**.
  - **Dogfood:** our own household is household #1 on the same public deployment. The v1 LXC/LAN instance is not kept as a separate fallback.
  - **Calendar:** decisions by ~Oct 12, build Oct 13–23, **feature freeze at the Oct 24 rehearsal** (which runs on the multi-household build), sign-up opens ~Oct 25, Oct 25–30 fixes only.
  - **All four headline features are must-haves for the freeze:** shareable TV, shareable summary, fuzzy location + nearby, operator dashboard. Extra ideas only make it in if they're cheap.
- **Time is the main risk.** 13 build days for a lot of surface. Prefer the simplest version of each feature that's safe in public. Push polish to after Halloween and say so in Out of scope.
- **Public internet is now the threat model.** Everything that was "trusted LAN device" in v1 needs a second look: user-entered text on shared screens, a live "kids at my door right now" signal tied to a location, bot sign-ups.
- **Repo is public:** never commit our real hostnames. Use `count-dracula.example.com` and put the real host in the git-ignored `deploy/local.env`.
- **Constraint from v1:** zero npm dependencies; browser libraries are vendored in `public/vendor/`. Breaking that is a decision, not a default.
- **Facts:** time-of-day maths uses the runtime's local time zone (`shared/night-maths.js`, `server/export.js`); one global "exactly one live event"; one `config.json` holds the admin PIN, feature switches, soundboard and ghost seed.
- **Glossary:** [CONTEXT.md](../../CONTEXT.md) (new terms land there as they resolve). v1's night-level terms live in the [v1 spec](../count-dracula/spec.md#2-domain-model).
- **Skills each session should consult:** `/grilling` + `/domain-modeling` for decisions; `/prototype` for prototype tickets; `/research` for research tickets; `dataviz` for anything chart- or map-shaped.
- **Tracker:** local markdown. Tickets in `issues/NN-<slug>.md` with `Type:`, `Status:`, `Blocked by:` lines; research findings in `research/`.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

- [Shareable night summary](issues/09-shareable-night-summary.md) — Wrapped-style 9:16 slides plus a receipt slide with the kids-per-minute barcode; screenshots + a public share link (fixed preview image); display name shown (toggle per share), nearby only as "near you"; exists once the night is ended, link lasts until turned off.
- [Sign-in and email options](issues/01-sign-in-and-email-options.md) — all buildable dependency-free on Bun 1.3+; magic links by email are the realistic route; Resend (100/day free, $20 Pro) or SES as the provider; Google optional; passkeys and Apple after Halloween.
- [Geocoding and location-fuzzing options](issues/02-geocoding-and-fuzzing-options.md) — local FSA (CA, GeoNames) + ZCTA (US, Census) tables, no web geocoder; store only a 5-char geohash (~5 × 3 km), nearby = cell + 8 neighbours; ≥ 5 households before an area shows; no map before the freeze.
- [Public exposure: abuse protection and live-connection capacity](issues/03-public-exposure-limits.md) — CPU, not memory, limits SSE (fan-out blocks the tap: 37 ms per 1,000 viewers); the global hub, global `seq` and unbounded slow-reader buffers must change first; `synchronous=NORMAL` removes multi-second stalls; app-level caps and rate limits; Turnstile + email verification for bots.
- [Household identity and sign-up](issues/04-household-identity-and-sign-up.md) — Google sign-in only, no email sent; a Manager (Google account) belongs to one Household; more Managers join by a shared invite link (phone share sheet / copy); admin PIN gone, Helpers unchanged; Operators listed in `deploy/local.env`; delete = immediate hard delete.
- [What becomes per-household](issues/05-what-becomes-per-household.md) — the credential carries the Household (no slugs; reads no longer open); one live Event per Household, sign-up creates a live Rehearsal with starter costumes; switches and sounds stay Operator-wide until after Halloween, TV mix per Household; one IANA zone per Household (from the browser) drives all event-time maths; new Households race None; `user_version` migration into Household #1, linked by email in `local.env`, `v1-final` tag + DB copy as rollback.
- [Shareable TV: link, code and QR](issues/06-shareable-tv.md) — one secret TV link per Household for the porch and every viewer (same `/tv`, live Event only, phone names stripped, no expiry, Rotate drops devices to pairing); a bare `/tv` shows a 10-minute TV pairing code + scan-to-pair QR a Manager redeems; link QR only in `/setup`; past recaps and tally need a Manager; separate from summary links.
- [Fuzzy location](issues/07-fuzzy-location.md) — optional; a Leaflet map picker in `/setup` with Use my location, worldwide, no postal codes or addresses; the browser sends only a 5-char geohash cell (all we store); figures per fixed Area (4-char parent, ~20 × 25 km), ≥ 5 active Households, kid counts rounded to 5s, last 30 min refreshed every 10, Rehearsals excluded, "near you" only; fake-Household risk accepted.
- [Nearby activity indicator](issues/08-nearby-activity.md) — always-on on both: a small box under the TV's count and a one-line phone strip (kids in the last half hour, houses counting, top costume from ≥ 3 Households); Active = live non-Rehearsal Event with a kid in the last 30 min; below the minimum the TV shows nothing and the phone shows a site-wide total.

## Not yet specified

- **v2 rehearsal and launch-day plan.** How the Oct 24 rehearsal changes when it's also the multi-household acceptance test: a second test household, many public TV viewers, sign-up from a stranger's phone. And what Oct 25–31 looks like with strangers' nights depending on us (support channel, status, on-call on the night). Sharpens once the features are settled.
- **How households find it.** Nearby is only interesting with density. [Nearby activity indicator](issues/08-nearby-activity.md) now covers low density: below 5 Active Households the phone shows a site-wide total and the TV shows nothing. What's left is whether launch is "tell the street / neighbourhood Facebook group" or broader, which mostly affects hosting load. Likely out of scope (promotion isn't the build); the user to rule.

## Out of scope

- Native apps / app stores: web only, as in v1.
- Per-Household feature switches, sound uploads and per-Household soundboards: after Halloween ([What becomes per-household](issues/05-what-becomes-per-household.md) kept switches and sounds Operator-wide).
- Passkeys, email sign-in links, Apple sign-in, and any outgoing email: after Halloween ([Household identity and sign-up](issues/04-household-identity-and-sign-up.md) chose Google sign-in only).
- A portrait (phone) layout for TV viewers, expiring or per-viewer TV links, and a porch poster with the TV link: after Halloween ([Shareable TV: link, code and QR](issues/06-shareable-tv.md) chose one TV link on the same landscape `/tv`).
- Postal-code and typed-address location entry, and any map on the night (TV, phones, nearby): ruled out, with a map picker in `/setup` instead ([Fuzzy location](issues/07-fuzzy-location.md)).
