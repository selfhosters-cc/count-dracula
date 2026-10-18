# Extension tables and the ownership registry

Type: build (AFK)
Status: open
Blocked by: 65

## What to build

An Extension keeps its own tables, and the core deletes its rows with the Households and Events they belong to. See [v2.2 §5–6](../spec-v2.2.md#5-its-tables).

- **A core migration** (add-only) with **`extension_versions (name TEXT PRIMARY KEY, version INTEGER NOT NULL)`** and the ownership table (e.g. `extension_owns (tbl TEXT PRIMARY KEY, extension TEXT NOT NULL, household_col TEXT, event_col TEXT)`).
- **The Extension runner:** its steps from its `extension_versions` row, after the core's, one transaction per step, bumping the row inside it. Compare `sqlite_master` before and after each step: anything created, dropped or changed that isn't named `<name>_…` rolls the step back and stops the boot.
- **Recording `owns`** at boot, replacing that Extension's rows. A table not named `<name>_…`, or a column it doesn't have, stops the boot.
- **Deleting, in the same transaction** as the core's own delete, from every recorded table, skipping one that no longer exists:
  - **Delete Household** (`accounts.deleteHousehold`): every row with its id in the household column.
  - **Delete Event** (`removeEvent`, so also clearing the estimate) and **Reset**: every row with its id in the event column.
  - **`deploy/redelete.js`** runs with no Extension loaded and still deletes them, from the recorded tables.
- One helper for all three (e.g. `deleteOwned(db, { household })` / `{ event }`), so they can't drift.

## Acceptance criteria

- [ ] The fixture's two steps run once; a restart runs nothing; a third step added later runs alone
- [ ] A step that creates `other_table` or an unprefixed index fails the boot and leaves no table behind
- [ ] `owns` naming `events`, or a column the table lacks, fails the boot
- [ ] Delete Household removes the fixture's rows for that Household and no other's
- [ ] Delete Event and Reset each remove the fixture's rows for that Event, and leave the Household's other Events' rows
- [ ] `redelete.js` on a database with the fixture's rows, run with no Extension, deletes them for a logged Household
- [ ] A recorded table that was dropped is skipped: Delete Household still succeeds
- [ ] A new Event that reuses a deleted Event's id has none of its rows
- [ ] `bun test` passes
