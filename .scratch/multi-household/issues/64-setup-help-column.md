# The /setup help column

Type: build (AFK)
Status: ready-for-agent
Blocked by: 57, 62

## What to build

Help beside every `/setup` section. See [v2.1 §9](../spec-v2.1.md#9-setup) (the help column). The prototype is `prototype/setup-help`, `public/setup-help-prototype.html?scenario=signup|halloween|morning|nothing|cap`. Its `HELP` object is the text to ship. Deploys after the opening line; **cut whole** if it isn't ready (no switch).

- **`public/setup-help.js`** exports `HELP`: the 23 topics, `{ title, p, terms, more }`, plain text, escaped on render. The `location` entry says "near you" shows once another house nearby is counting.
- **`data-help="<key>"`** on every help-bearing section of [ticket 57](57-setup-tabs.md)'s tabs and night screen. The night header's key follows its state (`night-Upcoming` … `night-imported`).
- **At ≥ 900 px:**
  - a sticky 320 px right column, titled Help, lists the screen's topics in page order
  - the one in view (an IntersectionObserver band about 15–45% down) is open and highlighted
  - clicking a title scrolls to its section
  - TV help · Email us at the foot
- **On phones:** a round ? on each heading opens its help in place; switching tab or screen closes them all.
- **A unit test:** every `data-help` key has an entry, and every entry is used.

## Acceptance criteria

- [ ] Every section of every tab and night state has its help, and the test passes
- [ ] At 1200 px the column follows scrolling on Tonight, Nights, Household and a night's screen
- [ ] At 390 px each ? opens and closes its help; switching tab closes all
- [ ] No "Rehearsal" in the help text
- [ ] `bun test` passes
