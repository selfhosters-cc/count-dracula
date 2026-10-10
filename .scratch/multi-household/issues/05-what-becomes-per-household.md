# What becomes per-household

Type: grilling (HITL)
Status: open
Blocked by: 04

## Question

Which parts of today's single-household app become per-household, which stay site-wide, and how do we get there without risking our own night?

- **Live event**: "exactly one live event, never zero" becomes per household. Does a brand-new household get a "Rehearsal" event live automatically, as v1's first install does?
- **`config.json`**: feature switches, soundboard slots, ghost seed, visit window. Which become household settings in `/setup`, which stay operator-only, and which are fixed for everyone.
- **Time zone**: time-of-day maths uses the runtime's local zone today (`shared/night-maths.js`, `server/export.js`). Where a household's zone comes from (browser, location, chosen), and how the ghost line and the "7:45pm release" behave for each household.
- **No last year**: new households have nothing to race. Expected-kids only? Their own typed-in half-hour counts? A neighbourhood or site-wide average as the ghost?
- **Sounds and assets**: shared library for everyone; can households upload anything? (Probably not before Halloween.)
- **URLs**: how a phone or TV knows which household it belongs to (path, subdomain, join key alone).
- **Migration**: today's database and config become household #1. Our Halloween 2025 ghost and rehearsal events survive.
