# The checklist remembered by the household

Type: build (AFK)
Status: todo
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

- [ ] ✕ on one Manager's phone hides it for every Manager
- [ ] A Household that counted a kid keeps item 2 ticked after a Reset
- [ ] `bun test` passes
