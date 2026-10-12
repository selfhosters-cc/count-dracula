# The checklist remembered by the household

Type: build (AFK)
Status: done
Blocked by: 05

## What to build

The checklist's memory moves from each phone's `localStorage` to the Household, so every Manager and device sees the
same list: a second Manager doesn't see a checklist the first dismissed, and a test kid counted then reset still
counts as tested.

- `households.checklist`: a JSON object (migration, adds a column), `{ kid, night, hidden }`, each `true` once:
  `kid` when a kid is first counted on any Event (set by the server), `night` by Skip, `hidden` by ✕.
- One Setup command, `checklist { item: 'night' | 'hidden' }`; `/api/household` returns the object.
- A phone's old `cd.checklist.*` keys are read once and sent up, so nobody's dismissed list comes back.

## Acceptance criteria

- [x] ✕ on one Manager's phone hides it for every Manager
- [x] A Household that counted a kid keeps item 2 ticked after a Reset
- [x] `bun test` passes

## Notes from the build

- Migration 19: `households.checklist`, JSON, default `'{}'`. The Setup command `checklist { item }` sets a mark
  with `json_set`, and refuses anything but `kid`, `night` or `hidden`. `house.checklistMarks()` reads them as
  booleans; `/api/household`'s `checklist` spreads them in beside `tvWatching`, `anyKids` and `named`.
- `kid` is set by `/api/household` the first time it sees a kid, as the phone used to. It's checked on every Setup
  poll (3 s), so a kid counted and reset with no Setup open in between isn't remembered. The old phone-only
  version had the same gap.
- `setup.js` reads the marks from `house.checklist`; Skip and ✕ send the command (and `admin()` reloads). On load,
  a phone's old `cd.checklist.<id>.<mark>` keys are sent up once and removed.
- Help: ✕ "is hidden for every Manager, on every phone".
- Checked in the browser: an old `night` key on the phone became the Household's mark (item 3 ticked, key gone),
  and ✕ hid the list and stayed hidden on the server.
