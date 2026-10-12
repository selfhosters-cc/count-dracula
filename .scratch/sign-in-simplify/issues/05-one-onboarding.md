# One onboarding: the checklist

Type: build (AFK)
Status: done
Blocked by:

## What to build

First-run's three screens (name → Location → TV) and the Tonight tab's ready checklist (TV → test kid → Halloween
night) do the same job twice, and first-run asks for the name and a map before the thing that sells it: the TV
cheering a kid. One checklist, the pattern people know from Linear, Stripe and Notion, replaces both.

- **No first-run overlay.** A new Household lands on Tonight with the checklist at the top.
- **🎃 Ready for Halloween**, in this order:
  1. **Put it on your TV**: first-run screen 3 inline. *"On the TV's computer, open Chrome and go to
     `<host>/tv`. Type its code here, or scan its QR with your phone."* The code box and **Pair**, then **Send the
     link instead** · **Use this screen as the TV** · **Help with TV setup**. Ticked: *"✓ Your TV is showing Test
     night"* (`tvTick`).
  2. **Count a test kid**: as item 2 today.
  3. **Your Halloween night**: as item 3 today.
- **Also, when you like** under the three, while the checklist shows: *Name your household* (a field and Save,
  shown while it's still "Our household") and *Add a rough Location* (to Household's Location section, shown while
  there's none). Neither holds the checklist up.
- The checklist hides when items 1–3 are done, or ✕.
- `public/first-run.js`, the `passFirstRun` command and `firstRunPassed` go; the column stays (migrations only add).
  Help's `checklist` entry and `/help/tv` follow.

## Acceptance criteria

- [x] A new sign-up lands on Tonight with the checklist, no overlay
- [x] Pairing from item 1 ticks it with the TV's night
- [x] Naming the household from the checklist renames it and the line goes
- [x] `bun test` passes; the help test still covers every key

## Notes from the build

- **Gone:** `public/first-run.js`, the `#first-run` overlay and its CSS, the `passFirstRun` command, and
  `firstRunPassed` in `ledger.households()` and `/api/household`. The `first_run_passed` column stays (migrations
  only add). The Location picker's `onSkip` (only first-run used it) went too.
- **Item 1** is in `setup.html`'s checklist: the `<host>/tv` line, a code box and **Pair** (the Household tab's
  `redeem`), Send the link instead, Use this screen as the TV, Help with TV setup. Its tick is `tvTick(house.door)`,
  now without its own ✓ (the list's marker draws it). Item 2 reads "Count a test kid".
- **Also, when you like** (`#check-also`): the name form while `checklist.named` is false (the server compares the
  name with `NEW_HOUSEHOLD_NAME`), and a link to Household's Location section (scrolled to) while there's no
  Location. `checklist()` returns `also: { name, location }`; the list still hides on items 1–3 alone.
- Checked in the browser on a new email sign-up: Tonight opened on the checklist, with no overlay. A `/tv` tab's code
  typed into item 1 paired it, and within 3 s the item read "✓ Your TV is showing *Test night*". Saving "The Daves"
  renamed the household and hid the name line. The Location link opened Household at its Location section. Also
  checked at 1280 px.
