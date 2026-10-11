# Households in the Ledger and the Household #1 migration

Type: build (AFK)
Status: done
Blocked by:

## What to build

The Ledger learns about Households. Today's data becomes Household #1. See [spec §4](../spec.md#4-stored-data-and-the-household-1-migration), [§2](../spec.md#2-domain-model) and [§6 What sign-up creates](../spec.md#6-sign-up-first-run-and-the-rehearsal).

**Before the first code change:** tag **`v1-final`** on the last v1 code commit (the code LXC 118 runs today; everything after it is `.scratch/` docs) and push the tag. On opening day the tag must still point at v1, not at main.

**Migration**

- `PRAGMA user_version` 0 → 1, one transaction, at startup:
  - creates `households` (display name, IANA zone, Location cell, mix, suspended-since, signed-up-at …)
  - adds `events.household_id`, with every existing event going to Household #1
  - moves `kv` "mix" onto Household #1
- Household #1's zone is `America/Toronto`, and its display name is empty until a Manager sets it.
- It's idempotent: a second start changes nothing. Later tickets add the next `user_version` steps.
- **A fresh install creates no Household and no events.** Remove `firstInstall` and the `ghostSeed` path.
- Set `PRAGMA synchronous = NORMAL` beside WAL.

**The Ledger, per Household**

- `apply` and `snapshot` act on one Household. A command naming another Household's event, tag or kid is refused.
- "Exactly one live Event, never zero" holds per Household. Go live, End, Resume, Release and Change join key stay inside it.
- The **Rehearsal** flag on events.
- A **create Household** command makes the Household and its live **Rehearsal**: the Rehearsal flag, a fresh join key, **no golden tickets**, and the **starter costume list** (a fixed set of about 8 in code, including 🎃 Other). "Halloween 2026" is added in [ticket 26](26-auto-go-live-and-auto-end.md).
- The TV mix is per Household.
- Until [ticket 22](22-credentials-scope-everything.md) lands, the HTTP layer may keep acting on the join key's Household (or Household #1) so the app still runs.
- **Don't deploy to LXC 118** until [Open sign-up](38-open-sign-up.md).

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server).

## Acceptance criteria

- [x] `v1-final` is tagged on the last v1 code commit and pushed
- [x] The migration on a v1-built database (a test fixture made by the v1 schema) keeps every event, kid, tag, ticket, batch and moment, all in Household #1, and keeps the mix
- [x] Running it twice changes nothing; a fresh database gets the v2 schema with no Household
- [x] A copy of the production DB, pulled with `ssh proxmox pct pull`, migrates cleanly locally: "Halloween 2025 (counts)", the Rehearsal and Race against survive (the copy stays out of git)
  - **Left for the user:** the agent wasn't allowed to read production. A copy of the local dev DB (v1 data: the 2025 ghost, the live Rehearsal racing it, 67 kids) migrated cleanly. The opening-day checklist repeats this on the real copy.
- [x] Two Households each have exactly one live Event; Go live in one never touches the other
- [x] A command for another Household's event, tag or kid is refused
- [x] Create Household gives a live Rehearsal with the starter costumes, a join key and no golden tickets
- [x] `synchronous` reads back as NORMAL
- [x] `bun test` passes

## Notes from the build

- `v1-final` is on `4f369ed` (the last commit touching code; everything after is `.scratch/` and `CONTEXT.md`).
- Interface: `openLedger(db, config)` → `createHousehold({ displayName, timeZone })`, `household(id)`, `householdByJoinKey(key)`, `households()`. `household(id)` has v1's `apply`, `snapshot`, `joinKey`, `events`, `tickets`, `batches`, `exportEvent`, plus `addPastCounts({ name, buckets })` for a counts-only past night (ticket 45 uses it).
- The join key and the TV mix live on `households`; `seq` and the soundboard cooldown are per Household. `events.join_key` is left as v1's, unused.
- The migration marks Household #1's v1 "Rehearsal" as a Rehearsal (spec §21 latitude).
- Starter costumes: 🧙 Witch, 🦸 Superhero, 👸 Princess, 👻 Ghost, 🧛 Vampire, 💀 Skeleton, 🦖 Dinosaur, 🎃 Other.
- The v1 test fixture is `test/fixtures/v1.sql`, a dump of a database built by the `v1-final` Ledger. The v1 Ledger tests run on `test/v1-night.js`, a Household set up the way a v1 first install was.
- `ghostSeed` and `ghostSeedFromCsv` are gone; the HTTP layer reads Household #1 (or the join key's Household) until ticket 22.

Production copy checked on opening day (2026-10-11), with `deploy/v1-final.sh`: an 88 KB `VACUUM INTO` copy migrated to Household #1, the live Rehearsal (314 kids) racing "Halloween 2025 (counts)", America/Toronto. (The first try copied the `.sqlite` with `cp` and got an empty 4 KB file: the rows were in the `-wal` file.)
