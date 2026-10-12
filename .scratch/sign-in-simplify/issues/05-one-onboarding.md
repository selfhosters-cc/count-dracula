# One onboarding: the checklist

Type: build (AFK)
Status: todo
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

- [ ] A new sign-up lands on Tonight with the checklist, no overlay
- [ ] Pairing from item 1 ticks it with the TV's night
- [ ] Naming the household from the checklist renames it and the line goes
- [ ] `bun test` passes; the help test still covers every key
