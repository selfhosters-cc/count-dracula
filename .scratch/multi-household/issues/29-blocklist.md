# Blocklist on names and costumes

Type: build (AFK)
Status: done
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

- [x] A blocklisted word is refused in each save path above, including with leetspeak, capitals and accents
- [x] Ordinary names that contain a blocked word as part of a longer, innocent word pass (a few known cases tested)
- [x] The phone's "+ New" shows "Pick another name" and creates nothing
- [x] The blocklist's source and licence are noted in the repo
- [x] `bun test` passes

## Notes from the build

- The list is LDNOOBW's English list (403 entries, CC BY 4.0) at `server/vendor/blocklist/`, with its `LICENSE` and a README naming the commit. It's server-only.
- `isBlocked(text)` (`server/blocklist.js`): lowercases, strips accents, folds leetspeak (`1` tried as both i and l), then matches whole words (and a trailing s/es), runs of single letters (`f u c k`), the whole text run together, and the list's multi-word phrases. Words that merely contain a listed word (Scunthorpe, Cocktail, Bass, Grape, Dickens, Assassin, Shiitake) pass.
- The list as published also blocks a few borderline costume words ("sexy", "nude", "kinky", "hooker", "boob"). Edit `en.txt` if that turns out too strict.
- Applied in the Ledger: `createHousehold` and `rename` (through `displayNameOf`, so sign-up's form and first-run get it too), and `createTag`, `updateTag` and `catchUp`. A refusal is a `BadCommand('Pick another name')`. Ticket 41 imports `isBlocked` for the top costume.
- Checked in the browser: "+ New" with "Sh1t head" toasts "Pick another name", keeps the sheet open and counts no kid.
