# Blocklist on names and costumes

Type: build (AFK)
Status: ready-for-agent
Blocked by: 21

## What to build

User-typed names that reach shared screens are checked against a vendored blocklist when saved. See [spec §15 User text on shared screens](../spec.md#15-hosting-capacity-and-abuse).

- A **vendored blocklist** of slurs and obvious obscenities, a few hundred entries, with its source and licence noted beside it.
- `isBlocked(text)`: matches on **normalised words** (case, accents and spacing folded) with **leetspeak folded**.
- It runs on save of:
  - a **Household display name** (sign-up, first-run, `/setup`)
  - a **costume name**: `createTag`, `updateTag`, and "+ New" on the phone (Catch-up)
- A match is refused with **"Pick another name"**, never starred out.
- [Ticket 41](41-nearby.md) also uses it for the nearby top costume.
- There's no review queue.

**Standing rule for every ticket that renders user text:** a test with `<img src=x onerror=…>` as a costume or display name.

## Acceptance criteria

- [ ] A blocklisted word is refused in each save path above, including with leetspeak, capitals and accents
- [ ] Ordinary names that contain a blocked word as part of a longer, innocent word pass (a few known cases tested)
- [ ] The phone's "+ New" shows "Pick another name" and creates nothing
- [ ] The blocklist's source and licence are noted in the repo
- [ ] `bun test` passes
