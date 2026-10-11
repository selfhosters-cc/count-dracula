# Assemble the v2 spec and build tickets

Type: task (AFK)
Status: resolved
Blocked by: 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 15, 16

## Question

Roll every resolved ticket into a build-ready **v2 spec** at `.scratch/multi-household/spec.md`, written as changes on top of the [v1 spec](../../count-dracula/spec.md): the domain model additions (from [CONTEXT.md](../../../CONTEXT.md)), identity and tenancy, the migration of household #1, each feature, hosting and abuse limits, and a **build order** with the **opening line** drawn after the core path and public-safety set from [v2 rehearsal and launch-day plan](16-v2-rehearsal-and-launch-day.md) (sign-up opens there; the rest deploys fix-forward until 3 pm Oct 31), plus that ticket's build tasks: `deploy/loadtest.js`, the nearby seed script, the opening-day checklist in `deploy/RUNBOOK.md` and the support links. Then cut **build tickets** in the v1 shape (`issues/NN-…` with acceptance boxes and `Status:`) so the existing ticket loop can run on them.

No new decisions. Anything still undecided goes back to the map as a new ticket. Every other ticket on the map is resolved.

## Answer

Resolved 2026-10-10 (AFK). No new decisions were made.

- **[spec.md](../spec.md)** describes v2 in 23 sections, as changes on top of the v1 spec. It covers:
  - dates, and the domain model from CONTEXT.md
  - identity and tenancy, and stored data with the Household #1 migration
  - the config split between `config.json` and `local.env`
  - sign-up, first-run and the Rehearsal; auto go-live and auto-end; time zones
  - the TV link and pairing, Location, nearby, the Night summary, the Operator and the extras
  - hosting, capacity and abuse; privacy, with a table pairing each promise in the notice with what the build does to keep it
  - the build order with the opening line, and the runbook
  - **What changes from v1** (every v1 rule v2 replaces), **Where it lands in the code**, and **Builder's latitude**
- **33 build tickets, 17–49**, in v1's shape (`Type:`, `Status: ready-for-agent`, `Blocked by:`, acceptance boxes). Every blocker is an earlier ticket, so they build in number order:
  - **17–37:** the core path and the public-safety set, plus the load test and the RUNBOOK. Tickets 20 (Google OAuth client) and 35 (public host on the shared Caddy) are HITL.
  - **38 Open sign-up** (HITL) is **the opening line**: the opening-day checklist.
  - **39–49:** fix-forward after opening. Invites, the full `/operator`, nearby and its dev-box seed, the Night summary slides and share links, the three extras, `/help/tv` polish, and the restore drill (HITL). Each switch-off-able group gets an Operator-wide switch.
- **Two contradictions between tickets, settled by following the more specific ticket:**
  - Ticket 15's "What's public" lists the display name among what TV-link holders see, but ticket 06 keeps it off the TV. The spec and [ticket 33](33-privacy-page.md) keep it off the TV and have `/privacy` list what the TV actually shows.
  - Ticket 16's opening-day step 6 checks that the test Household's "summary is ready", but the same ticket puts the Night summary after the opening line. Before ticket 43 is deployed, step 6 checks `/setup`'s "Your night ended automatically" message instead.
- **Follow-through, not new decisions:**
  - The `v1-final` tag goes on the last v1 code commit, at the start of ticket 17, so it still points at v1 on opening day.
  - The public host is switched on only after v2 is deployed (opening-day step 2), never while LXC 118 still runs v1.
  - The deploy health check moves to an endpoint that needs no credential.
  - Household #1 creates its own "Halloween 2026" in `/setup` (v1's Oct 30 step), since it's migrated rather than signed up.
- **v1's open HITL tickets** [Kiosk launcher](../../count-dracula/issues/37-kiosk-launcher.md) and [Sound assets](../../count-dracula/issues/38-sound-assets.md) get a note: the launchers open a bare `/tv` on the public host, and there are no homemade soundboard clips.
