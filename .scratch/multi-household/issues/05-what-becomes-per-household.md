# What becomes per-household

Type: grilling (HITL)
Status: resolved
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

## Answer

Resolved 2026-10-10 (HITL grilling).

**URLs: the credential carries the Household**
- No Household in any URL (no path slug, no subdomain). `/`, `/tv`, `/setup` and `/tally` keep their v1 paths.
- **Manager:** session → Manager → their one Household. **Helper phone:** join key → Event → Household. **TV, tally and teaser:** a TV credential whose form is for [Shareable TV](06-shareable-tv.md).
- **Reads stop being open.** In v1, `/api/snapshot`, `/api/stream` and `?event=<id>` need no key. In v2 every read carries a join key, a TV credential or a session, and only reaches that Household's Events.

**Live event**
- "Exactly one live Event, never zero" holds **per Household**. Go live and End the night behave as in v1, within the Household.
- **Sign-up creates a live "Rehearsal"** with a fresh join key, the starter costume list (below) and **no golden tickets**. With no ghost and no Expected kids, `addTicket` would refuse anyway.

**`config.json` split**

| Field | v2 |
|---|---|
| `adminPin` | Gone ([Household identity and sign-up](04-household-identity-and-sign-up.md)) |
| `port`, `dbPath` | Deploy config |
| `switches` (8) | **Operator-wide, in config, all on.** Site-wide kill switches; no per-Household toggles until after Halloween |
| `soundboard` (6 slots) | Operator-wide shared library |
| Visit window | Already per Event in the DB |
| TV mix (`kv` "mix") | **Per Household** |
| `ghostSeed` | Migration input only, then removed |
| `autoJoinHosts` | **Dropped.** "The" live key means nothing with many Households; our Helpers scan the QR |
| `lanUrl` | For [Public hosting and abuse](11-public-hosting-and-abuse.md) (where the helper QR points) |

**Time zone**
- Each Household stores an **IANA time zone**, captured from the signing-up Manager's browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`). It is shown read-only in `/setup` and fixable by the Operator. It is not derived from the location.
- **All event-time maths uses the Household's zone, never the device's or the server's.** The snapshot carries `timeZone`. `minuteOfDay`, `atEventTime` and `toBuckets` take a zone and convert with `Intl`. This covers the ghost line, the 7:45pm Release remaining, backfill rows, the tally sheet, the CSV export and the night summary's barcode, so a remote viewer of a Shareable TV sees the Household's own evening. The server's `TZ` stops mattering. Clock shift works unchanged on top.

**No last year**
- For 2026, a new Household races **None** (v1 already hides the ghost, teaser and "last year" lines) and uses **Expected kids** for the golden range. Nothing new to build. Its own 2026 night becomes its 2027 ghost.
- **Typed-in half-hour counts** (a form that creates a counts-only event) goes on the [Multi-household extras shortlist](13-multi-household-extras.md) as a candidate.
- **No site-wide or neighbourhood ghost:** before Oct 31 the only past night that exists is ours.

**Sounds and starter content**
- **One shared stock sound library** (the manifest plus 6 soundboard slots) for every Household. No uploads and no choosing per Household (map: Out of scope).
- **No homemade recordings** in the shared library: they would play on strangers' TVs. All 6 soundboard slots are stock or shout-text, our Household included.
- **Starter costume list:** a fixed site-wide set of about 8 Tags in code (e.g. 🧙 Witch, 🦸 Superhero, 👸 Princess, 👻 Ghost, 🧛 Vampire, 🎃 Other) is copied into each new Household's Rehearsal. Managers edit them in `/setup` as in v1.

**Migration: today's data becomes Household #1**
- One versioned migration at startup, `PRAGMA user_version` 0 → 1, in a single transaction. It creates `households`, adds `events.household_id` (all existing events → Household #1) and moves `kv` "mix" onto Household #1. Kids, tags, tickets, batches and moments belong to a Household through their Event and need no change. It's idempotent; a fresh install skips it.
- Household #1: zone `America/Toronto`, display name set in `/setup` after first sign-in. "Halloween 2025 (counts)", the Rehearsal, its Race against and every tap survive.
- **First Manager:** `deploy/local.env` names Household #1's first Manager's email. The first Google sign-in with that verified email becomes its Manager, from then on keyed by `sub`. Further Managers join by Invite link.
- **Rollback, not a fallback:** before deploying v2, tag `v1-final` and copy the SQLite file with a timestamp. If v2 fails badly before Oct 31, redeploy the tag plus the copy.
- **Practise on a copy of the production DB first**, then deploy before the Oct 24 rehearsal so the rehearsal runs on migrated data.
