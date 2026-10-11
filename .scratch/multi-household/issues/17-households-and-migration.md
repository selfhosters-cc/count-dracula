# Households in the Ledger and the Household #1 migration

Type: build (AFK)
Status: ready-for-agent
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

- [ ] `v1-final` is tagged on the last v1 code commit and pushed
- [ ] The migration on a v1-built database (a test fixture made by the v1 schema) keeps every event, kid, tag, ticket, batch and moment, all in Household #1, and keeps the mix
- [ ] Running it twice changes nothing; a fresh database gets the v2 schema with no Household
- [ ] A copy of the production DB, pulled with `ssh proxmox pct pull`, migrates cleanly locally: "Halloween 2025 (counts)", the Rehearsal and Race against survive (the copy stays out of git)
- [ ] Two Households each have exactly one live Event; Go live in one never touches the other
- [ ] A command for another Household's event, tag or kid is refused
- [ ] Create Household gives a live Rehearsal with the starter costumes, a join key and no golden tickets
- [ ] `synchronous` reads back as NORMAL
- [ ] `bun test` passes
