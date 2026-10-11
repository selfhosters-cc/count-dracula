# Assemble the v2.1 addendum and build tickets 50+

Type: task (AFK)
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13

## Question

Write the **v2.1 addendum** to [the v2 spec](../../multi-household/spec.md) (amending the sections the decisions touch, leaving the rest in force) and **build tickets 50+** in `.scratch/multi-household/issues/`, in v1/v2's shape (`Type:`, `Status:`, `Blocked by:`, acceptance boxes), in build order:

- **Before the new opening line:** the event rework (e) and the homepage (1). [Open sign-up](../../multi-household/issues/38-open-sign-up.md)'s steps 5–7 move after them.
- **After it, fix-forward and switch-off-able:** nearby across Area edges (b) and the `/setup` help column (d).
- A cut rule for Oct 31, 3 pm (the freeze), as v2 §17 did.
- Update CONTEXT.md's terms, the spec's §17 tables and `deploy/RUNBOOK.md` where they change.
- **A RUNBOOK build ticket** (graduated from the map's fog): the redone opening line and "Household #1 before Oct 31" from [Household #1](10-household-1.md), plus the checks the decisions left: test a Household's auto go-live, 3 am end and noon Past ([Going live and ending by themselves](05-auto-go-live-and-end.md)); on Nov 1 after 3 am, no Counting, Stale or Waiting rows on `/operator` ([Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md)); a test sign-up gets a live Test night and Halloween 2026, `/signup` lands on `/`, and the paused state shows there ([Sign-up and first run](09-sign-up-and-first-run.md)); the dev-box nearby check with 2 houses at an edge and a corner ([Nearby across Area edges](12-nearby-across-area-edges.md)).
- Carry each decision's **build notes** (tickets 10, 11, 12, 13) into the tickets that own them.

## Answer

Resolved 2026-10-11 (AFK).

- **The addendum:** [spec-v2.1.md](../../multi-household/spec-v2.1.md), 17 sections amending v2. It makes no new decisions; each section links the ticket that holds the reasoning. §14 lists every v2 rule it replaces. The [v2 spec](../../multi-household/spec.md) has a pointer at the top and in §17.
- **Build tickets 50–64** in `.scratch/multi-household/issues/`:
  - **Before the line (no cuts):**
    - 50 event states, the cap and named commands
    - 51 per-Event deltas and the TV
    - 52 the door on `/door`
    - 53 the tick
    - 54 Reset
    - 55 the estimate, golden tickets and summaries
    - 56 nearby, the Site-wide total and the Operator through the door's Event (with no minimum)
    - 57 `/setup`'s tabs
    - 58 the Test night and checklist
    - 59 the homepage
    - 60 retire the Household #1 claim and import the 2025 counts
    - 61 the RUNBOOK
    - **62** rebuild production (HITL)
  - Then [Open sign-up](../../multi-household/issues/38-open-sign-up.md)'s steps 5–7 (38 is now blocked by 62).
  - **After the line:** 63 nearby across edges (switch `nearbyEdges`) and 64 the help column (cut whole). They drop from the bottom: 64 first.
- **Cut rule:** v2's, unchanged. The rework and homepage aren't cut; the opening waits for them.
- **The SSE shape** (one channel with `eventId` on every delta, or a channel per Event) is left to the builder, as v2 §21 did for such choices.
- **Glossary:** **Door's Event** added. The other terms were already updated by tickets 02–12.
- **The fog's last two patches:**
  - The build order landed here.
  - The Operator and Reports knock-on effects: none found beyond tickets 06 and 07; addendum §16 says a build ticket fixes any it finds.
- **Not done here:** `deploy/RUNBOOK.md` describes what's deployed, so it changes with the build, in ticket 61.
