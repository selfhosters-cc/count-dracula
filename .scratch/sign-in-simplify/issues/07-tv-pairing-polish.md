# Pairing a TV, smoother

Type: build (AFK)
Status: done
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

- [x] `/setup?pair=` shows the card; Pair pairs it, Not now drops it; no dialog
- [x] The TV's pairing screen reads scan-first
- [x] An expired or unknown code gets the new wording
- [x] `bun test` passes

## Notes from the build

- **The card** (`#pair-card`) sits above the tabs, so it shows on whatever tab the page opens on (Tonight unless
  the URL says otherwise). `pairOffer(param)` in `setup-view.js` (tested) gives its code and words, or null for
  junk. `?pair=` leaves the address bar at once, so a reload doesn't ask again. Pair calls the Household tab's
  `pairTv` (exported in place of `pairFromUrl`), which no longer confirms: typing a code in Pair a TV already means it.
- **The TV:** *"Scan this with your phone's camera, or on your phone go to `<host>` and enter"*, then the code.
- **The 404 for an unknown or used code** says the TV already shows a new one: most often the code ran out
  while the Manager was signing in.
- Checked in the browser: a fresh `/tv` read scan-first. `/setup?pair=N37EAY` showed the card on Tonight with no
  dialog, and Pair paired that TV. Redeeming the same code again got the new wording.
