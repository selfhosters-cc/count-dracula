# Retire HOUSEHOLD1_MANAGER_EMAIL; import the 2025 counts

Type: build (AFK)
Status: ready-for-agent
Blocked by: 58

## What to build

Household #1 is rebuilt by sign-up. See [v2.1 §12](../spec-v2.1.md#12-household-1-and-the-opening-line).

- **Retire the claim:** remove `claimsHousehold1` and `HOUSEHOLD1_MANAGER_EMAIL` from:
  - `server/accounts.js` and `server/app.js`
  - `deploy.sh` `ENV_KEYS`
  - `deploy/local.env.example` and `deploy/README.md` ("all six" → five)
  - the README
  - The RUNBOOK is [ticket 61](61-runbook-v2-1.md)'s.
- **`deploy/import-past-counts.js <householdId>`**, run with Bun on LXC 118 like `deploy/copy-db.js`. It calls `addPastCounts` with the five 2025 buckets: 17:42–18:00 · 14, 18:00–18:30 · 72, 18:30–19:00 · 107, 19:00–19:30 · 119, 19:30–20:00 · 34. That makes **"Halloween 2025 (counts)"** and prints its id. It refuses if the Household already has an Event of that name.
- v2's 0 → 1 migration step (a v1 database becomes Household #1) stays as written.

## Acceptance criteria

- [ ] With `HOUSEHOLD1_MANAGER_EMAIL` absent, that account can sign up on a fresh database
- [ ] No reference to `HOUSEHOLD1_MANAGER_EMAIL` remains outside git history and the v2 spec
- [ ] A `deploy/scripts.test.js` case: the import makes a Past counts-only Event of 346 kids in those buckets, and a second run refuses
- [ ] `bun test` passes
