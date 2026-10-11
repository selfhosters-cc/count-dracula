# Assemble the v2 spec and build tickets

Type: task (AFK)
Status: open
Blocked by: 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 15, 16

## Question

Roll every resolved ticket into a build-ready **v2 spec** at `.scratch/multi-household/spec.md`, written as changes on top of the [v1 spec](../../count-dracula/spec.md): the domain model additions (from [CONTEXT.md](../../../CONTEXT.md)), identity and tenancy, the migration of household #1, each feature, hosting and abuse limits, and a **build order** with the **opening line** drawn after the core path and public-safety set from [v2 rehearsal and launch-day plan](16-v2-rehearsal-and-launch-day.md) (sign-up opens there; the rest deploys fix-forward until 3 pm Oct 31), plus that ticket's build tasks: `deploy/loadtest.js`, the nearby seed script, the opening-day checklist in `deploy/RUNBOOK.md` and the support links. Then cut **build tickets** in the v1 shape (`issues/NN-…` with acceptance boxes and `Status:`) so the existing ticket loop can run on them.

No new decisions. Anything still undecided goes back to the map as a new ticket. Every other ticket on the map is resolved.
