# Event states, the 3-open cap and commands that name their Event

Type: build (AFK)
Status: ready-for-agent
Blocked by: —

## What to build

The Ledger stops assuming one live Event. See [v2.1 §3](../spec-v2.1.md#3-events-and-their-states) and [§15](../spec-v2.1.md#15-where-it-lands-in-the-code-and-builders-latitude). The [code-seams research](../../events-rework/research/01-one-live-event-assumptions.md) (§0, §11, §12) lists every site.

**States**
- **Upcoming → Live → Ended → Past.** Go live, End the night, Resume, and **Close now** (Ended → Past). Past replaces `frozen`.
- **Ended → Past by itself at noon the next day**, in the Household's zone. The minute tick does it, and catches up after a restart.
- **Go live never changes another Event.** It stamps the Event with its went-live time (the **go-live stamp**). Resume doesn't restamp.
- **At most 3 open** (Live or Ended). At the cap a Manager's Go live is refused: "End or close one of your live nights first".
- **Zero open is normal:** no route or command throws (400 for a command that needs an open Event, never a 500).
- **Delete:** refused while Live. Ended, Past and Upcoming Events can be deleted. A Race against pointing at a deleted Event falls back to None.

**Commands name their Event**
- `eventById()` loses its "no id means the live one" default. Every command takes an event id. Every phone write also takes the **go-live stamp**. A missing, non-open or stale-stamped Event is a `BadCommand` (400).
- **`ledger.doorEvent(householdId)`:** the open Event with the latest go-live stamp, or null. Tickets 51–58 use it.
- The `rehearsal` flag goes from the schema and the Ledger (a `user_version` step that may rewrite: [§12](../spec-v2.1.md#12-household-1-and-the-opening-line)). `createHousehold` makes its live starter an ordinary Event named "Test night"; [ticket 58](58-test-night-and-checklist.md) does the rest of sign-up.
- `events.join_key` (v1's dead column) can go in the same step.
- **Tests:** `test/v1-night.js` and the Ledger, households, schedule and credentials suites name their Event. The "exactly one live" and "Go live freezes the old one" cases are replaced by this ticket's.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server).

## Acceptance criteria

- [ ] Two Events of one Household can be Live at once; a third goes live; a fourth is refused with the cap message
- [ ] Go live leaves every other Event as it was; nothing is frozen
- [ ] End → Ended; Resume → Live with the same stamp; Close now → Past; an Ended Event is Past at noon local the next day (fake clock, `America/Toronto` and `Pacific/Auckland`), including after a restart
- [ ] `doorEvent` returns the open Event with the latest stamp; null with none open
- [ ] A command with no event id, a Past or Upcoming id, or a stale stamp gets 400; a Household with zero open Events reads and writes without a 500
- [ ] A Live Event can't be deleted; deleting one that's raced falls the racer back to None
- [ ] No `rehearsal` column or flag remains in the server
- [ ] `bun test` passes
