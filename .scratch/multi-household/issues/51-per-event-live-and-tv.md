# Per-Event deltas, the door's Event and the TV

Type: build (AFK)
Status: ready-for-agent
Blocked by: 50

## What to build

A TV shows one Event, the door's Event, and moves by itself. See [v2.1 §4](../spec-v2.1.md#4-credentials-tvs-and-door-phones) and [§15](../spec-v2.1.md#15-where-it-lands-in-the-code-and-builders-latitude) (the SSE shape is the builder's choice).

- **Deltas carry their `eventId`**, and a device never applies another Event's delta to its board. `seq` gaps never come from filtering.
- **The TV link reads the door's Event** (`/api/snapshot` and `/api/stream` with no `?event=`). When the door's Event changes (Go live, End leaves it, Reset, Delete, Past), every TV of the Household moves **quietly**: no banner. A takeover or sound playing is cut off. A freshly Live Event's "Start the night" is the announcement.
- **Nothing open:** "No night on right now", with the next Upcoming Event's name and a countdown when it has Goes live at. An Ended door's Event keeps its recap until Past.
- **Sound:** moments fire and are recorded on their own Event, but only a TV showing that Event plays them; one reached off screen never replays. A soundboard press names the on-screen Event and is dropped if that's no longer the door's. The cooldown and mix stay per Household.
- **TV "over" and recap** key off Ended or Past, not `frozen`.
- The 🎭 Rehearsal chip goes from `tv.html` / `tv.js`.
- The TV link stays live-only. `/tv?event=` past recaps stay Manager-only. Pairing and Rotate don't change.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), the hub, `public/live.js`, `public/tv.js`.

## Acceptance criteria

- [ ] With a test night Live, Halloween going live moves every TV to Halloween with no reload and no banner
- [ ] A tap on the test night (via `/setup` Add missed kids) doesn't change the TV showing Halloween, and opens no reconnect loop
- [ ] End on Halloween keeps its recap up even though the test night is still Live
- [ ] Resetting or deleting the door's Event drops TVs to the next open Event, or to "No night on right now" with the countdown
- [ ] A milestone reached on the off-screen Event is recorded, never played; a soundboard press after a switch is dropped
- [ ] A remote TV-link viewer sees exactly what the porch TV sees
- [ ] `bun test` passes
