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

- [Geocoding and location-fuzzing options](issues/02-geocoding-and-fuzzing-options.md) — local FSA (CA, GeoNames) + ZCTA (US, Census) tables, no web geocoder; store only a 5-char geohash (~5 × 3 km), nearby = cell + 8 neighbours; ≥ 5 households before an area shows; no map before the freeze.

## Not yet specified

- **v2 rehearsal and launch-day plan.** How the Oct 24 rehearsal changes when it's also the multi-household acceptance test: a second test household, many public TV viewers, sign-up from a stranger's phone. And what Oct 25–31 looks like with strangers' nights depending on us (support channel, status, on-call on the night). Sharpens once the features are settled.
- **How households find it.** Nearby is only interesting with density. Whether launch is "tell the street / neighbourhood Facebook group" or broader affects the nearby design and the hosting load. Possibly out of scope (promotion isn't the build); decide once nearby is designed.
- **Privacy notice, retention and deletion.** What we must tell households, how long nights and locations are kept, what "delete my household" removes. Waits on what location and identity data we actually collect.

## Out of scope

- Native apps / app stores: web only, as in v1.
