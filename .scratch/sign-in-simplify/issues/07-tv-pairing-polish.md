# Pairing a TV, smoother

Type: build (AFK)
Status: todo
Blocked by: 05

## What to build

- **No `confirm()`.** Scanning a TV's QR lands on `/setup?pair=K7QM4X`; today a browser dialog asks "Show our TV
  here?". Instead the page shows a card at the top: *"📺 Pair the TV showing K7Q-M4X?"* **Pair** · Not now. It's on
  Tonight, above the checklist, and replaces the jump to the Household tab.
- **The TV leads with the QR.** *"Scan this with your phone's camera"*, then *"or go to `<host>` and enter"* the
  code.
- **An expired code says what to do.** Redeeming a code that's gone: *"That code has expired: your TV shows a new
  one now. Scan it again, or type the new one."*

## Acceptance criteria

- [ ] `/setup?pair=` shows the card; Pair pairs it, Not now drops it; no dialog
- [ ] The TV's pairing screen reads scan-first
- [ ] An expired or unknown code gets the new wording
- [ ] `bun test` passes
