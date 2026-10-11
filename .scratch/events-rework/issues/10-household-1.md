# Household #1: rebuild or migrate

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

Production has no users apart from Household #1, and the user said at charting that anything can be destroyed and rebuilt. What happens to Household #1?

- **Rebuild from scratch** (sign up again on the new build) and re-import "Halloween 2025 (counts)" from [`.scratch/count-dracula/data/2025-counts.md`](../../count-dracula/data/2025-counts.md), or **migrate** the `user_version` way?
- Its live Rehearsal (314 kids) and its Race against.
- Whether its "Halloween 2025 (counts)" import hides "About how many kids came last year?", now offered with no past-Event gate ([Ghost, estimated ghost, golden tickets and summaries](07-ghost-golden-summaries.md)).
- Whether `v1-final`, the opening-day checklist's steps 1–4 and the `HOUSEHOLD1_MANAGER_EMAIL` link need redoing, and what goes in the runbook.

## Answer

Resolved 2026-10-11 (agent defaults, confirmed by the user).

**Rebuild, not migrate**
- Production's database is **wiped** when the rework deploys. Household #1 **signs up again** through `/`, like any Household. The rework's schema changes are still new `user_version` steps (11 → …), because every database, a fresh one included, runs the whole chain. Until sign-up opens they may rewrite, not only add: no stranger's data exists yet.
- Those steps don't convert v2 production data. On a dev database, a row with the Rehearsal flag just becomes an ordinary Event. v2's 0 → 1 step (a v1 database becomes Household #1) stays as written.
- Why: only one Household exists, and it's ours. A rewrite migration would be throwaway code with one user. A fresh sign-up also runs the real path end to end: the **Test night** and "Halloween 2026" from [Sign-up, first-run and the ready checklist](09-sign-up-and-first-run.md), first-run, and the checklist.

**What's lost, and kept**
- The live Rehearsal's **314 kids** are test taps and are not carried over. They stay in the backup copy (below).
- The old join key, TV link and paired TVs all go. Our TV pairs again (the kiosk launcher opens a bare `/tv`). Helper phones hold a dead key, which they forget ([TVs and door phones](04-tvs-and-door-phones.md)), so they join again through Add a helper.
- Household #1's time zone comes from the browser at sign-up (America/Toronto). Its name and Location are set in first-run.

**"Halloween 2025 (counts)" is restored from the real counts**
- A one-off script, **`deploy/import-past-counts.js`**, runs on LXC 118 after the re-sign-up (pushed in and run with Bun, the way `deploy/copy-db.js` is). It calls the Ledger's `addPastCounts` for a given Household id with the five buckets from [2025-counts.md](../../count-dracula/data/2025-counts.md): 17:42–18:00 · 14, 18:00–18:30 · 72, 18:30–19:00 · 107, 19:00–19:30 · 119, 19:30–20:00 · 34 (346 in all). That makes the counts-only Past Event **"Halloween 2025 (counts)"** and prints its id. It refuses if the Household already has an Event of that name.
- Then, in `/setup`, set **Halloween 2026 → Race against "Halloween 2025 (counts)"** by hand (one select; the script doesn't guess which Event is Halloween 2026). The chart says "2025", not "estimated". Pointing the Test night at it too is optional, also by hand.

**"About how many kids came last year?" for Household #1**
- Per [Ghost, estimated ghost, golden tickets and summaries](07-ghost-golden-summaries.md) there's no past-Event gate, so the field stays offered in Household → Last year (estimated) and in checklist item 3. The real counts don't hide it.
- **Leave it empty.** If it's ever filled in, it only sets Race against on Events racing None (or racing the estimate). Halloween 2026, racing "Halloween 2025 (counts)", is untouched. But a Test night or a new Event racing None would pick up the estimate.
- Checklist item 3 ticks from Expected kids or a skip, so it doesn't need the field. Our porch skips it or sets Expected kids.

**`HOUSEHOLD1_MANAGER_EMAIL` is retired**
- On a fresh database, Household 1 doesn't exist, but `claimsHousehold1` (`server/accounts.js`) still sends that email to `join(1, …)` before sign-up is tried. So the Manager it names couldn't sign up at all.
- The build removes the claim path, the key from `deploy.sh`'s `ENV_KEYS`, `local.env.example`, `app.js` and the RUNBOOK. `deploy/README.md`'s "all six" becomes five. Remove the line from `deploy/local.env` too.

**The backup before the wipe, and `v1-final`**
- Before the wipe, take a `VACUUM INTO` copy of the v2 database (`deploy/copy-db.js`, the way `deploy/v1-final.sh` does) into `~/count-dracula-backups/`. No new tag: the deployed commit is in git.
- `v1-final` (tag and copy) stays as it is. It was a rollback only until the first stranger, and it's now two schemas behind. Like the v2 copy, it's kept and never used.
- Ticket 38's "retire `v1-final` after the first stranger" item is moot.

**The opening line, redone** (it replaces [Open sign-up](../../multi-household/issues/38-open-sign-up.md)'s done steps 1–4 for the rework deploy)
1. **Copy the v2 database** as above.
2. **Deploy the rework on a fresh database:** stop the service, move the database and its `-wal`/`-shm` aside, deploy, and start, so the schema is built from nothing. Sign up Household #1 at `/` with the main Google account.
   - The Google consent screen is still in **Testing**, so only listed test users can sign in. That's the real gate: a fresh database has **Pause sign-ups off** (`site_switches` is empty).
   - Go through first-run and pair our TV. Run `deploy/import-past-counts.js` for Household #1 and set Halloween 2026's Race against to "Halloween 2025 (counts)". Check that the Test night is live, "Halloween 2026" goes live Oct 31 at 4 pm racing it (the chart says "2025"), and the old door URL `/?key=` lands on `/door`.
3. **Load check again** (15 minutes). The hub changes in this rework (writes name their Event, a TV follows one Event).
4. **Privacy checks:** only the new parts. Open `/door?key=…` once and check the Caddy log shows `key=REDACTED` (the site block's regexp already masks `key=` on any path). Check OSM tiles load only after the tap in first-run's Location step. The contact email and the shared-log check stand as done.
5. Steps 5–7 (the test Household, publishing the consent screen, Pause sign-ups off) as before, through `/`. The test Household's check is now "a live Test night and Halloween 2026", its first-run and checklist, Goes live at 10 minutes ahead, the 3 am end and noon Past, then Delete.

**Household #1 before Oct 31** (the RUNBOOK's §7 shrinks)
- "Halloween 2026" now comes from sign-up: 5 golden tickets, Clock shift 0, starter costumes. So the "create it and copy costumes from the Rehearsal" step goes. Check its Race against is "Halloween 2025 (counts)" and look over its costumes.
- Test our porch on our Test night (or Go live now on a fresh test Event): the checklist, `/help/tv`, and v1's hardware checks (overscan with `/tv?border`, HDMI sound, the volume ceiling, kiosk flags).
- Print the tally sheet. The paper tally plus a Nov 1 backfill stays our last resort.

**Build notes for the addendum**
- Remove `claimsHousehold1` and `HOUSEHOLD1_MANAGER_EMAIL` (accounts, app, deploy.sh `ENV_KEYS`, local.env.example, README, RUNBOOK).
- The rework's migration steps may rewrite until sign-up opens, then only add again.
- `deploy/import-past-counts.js` (a small AFK build ticket, with a `deploy/scripts.test.js` case): imports the 2025 buckets through `addPastCounts` for a given Household id, and refuses a duplicate name.
- RUNBOOK: the redone opening line (including the import and the Race against step) and the shorter "Household #1 before Oct 31".
