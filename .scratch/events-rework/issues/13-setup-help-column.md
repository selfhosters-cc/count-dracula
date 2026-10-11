# The /setup help column's content

Type: prototype (HITL)
Status: resolved
Blocked by: 08

## Question

What goes in the `/setup` help, and how is it organised?

Decided at charting: a **sticky right column at ≥ 900 px** that follows the section you're in; a **"?" on each section heading** on phones opening that section's help inline; one source of help text; `/help/tv` stays its own page; it deploys after the opening line and can be cut.

Open: the topics and their wording (live Events, reset, TV link vs join key, golden tickets, Race against and the ghost, Clock shift, Location and nearby, Managers and invites), against the layout from [/setup with several live Events](08-setup-with-several-live.md): three tabs (Tonight, Nights, Household) and a screen per night, so the column follows the section in view on whichever tab or screen is showing. Draft text plus a rough prototype, linked here.

## Answer

Resolved 2026-10-11 (HITL prototype, agent defaults confirmed by the user). Prototype: branch `prototype/setup-help`, `public/setup-help-prototype.html` (variant B from [/setup with several live Events](08-setup-with-several-live.md) only, stub data; `?scenario=signup|halloween|morning|nothing|cap`). The full draft text is the `HELP` object at the top of that file: it's the text to ship, edited in place.

**One source**
- The help is one module, **`public/setup-help.js`**, exporting `HELP`: one entry per section key, `{ title, p: [paragraphs], terms: [[term, text]], more: [[label, href]] }`. Plain text only, escaped on render; no Markdown, no HTML in the strings.
- Every help-bearing section in `setup.html` carries `data-help="<key>"`. The column and the phone "?" both render from `HELP[key]`.
- A unit test checks every `data-help` key in `setup.html`/`setup.js` has an entry and every entry is used.
- `/help/tv` stays its own page. The TV and Household name entries link to it and to House rules; the column's foot always has **TV help · Email us**.

**At ≥ 900 px: the column**
- A sticky right column (320 px), titled **Help**, lists **every topic on the screen that's showing**, in page order: the tab, or a night's screen.
- The section in view (an IntersectionObserver band, about 15–45% down the viewport) is open and highlighted. The others show as titles; clicking one scrolls to its section and flashes it.
- The column never scrolls the page by itself, and it isn't dismissable (there's nothing to hide at that width).

**On phones: the "?"**
- Each section heading carries a small round **?** that opens that section's help in place, under the heading. Tapping it again closes it, and several can be open at once.
- Switching tab, or opening or leaving a night's screen, closes them all. Nothing is remembered.
- The ? is hidden at ≥ 900 px, where the column does the job.

**Topics, keyed to sections** (title → what it covers)
- **Tonight:**
  - `checklist` Ready for Halloween: ticks itself; hiding it is per phone.
  - `door` On the door & TV: the open night that went live most recently; nobody picks it; only it plays sound.
  - `nothing` No night on right now: what the TV and phones show; goes live by itself, or Go live now.
  - `also` Also open: door taps don't go there, use Add missed kids; 3 am; 3 open at once.
  - `waiting` Waiting to go live: its time came with 3 live; it goes live when you end one.
  - `helpers` Helpers: Count on this device; Add a helper's QR works on every night.
- **Nights:**
  - `nights` Your nights: Upcoming → Live → Ended → Past, late kids, Resume, noon, Close now, 3 open.
  - `make` Make a night: copy costumes; Upcoming until Go live or Goes live at.
- **A night's screen**, with the header's help chosen by state:
  - `night-Upcoming`: Goes live at, Go live, golden draw, cap behaviour.
  - `night-Live`: End the night, 3 am, Reset (what it deletes; pre-reset taps dropped).
  - `night-Ended`: late kids until noon, Resume, Close now, Reset.
  - `night-Past`: read-only, race it next year, Delete.
  - `night-imported`: race or delete only.
  - `tools` Night tools: a term each for golden ticket, missed kids (also counting into a night the door isn't on), CSV and tally, Night summary and sharing.
  - `settings` Night settings: a term each for Race against (None races the estimate), Expected kids, Visit window, Goes live at, Advanced: Clock shift, Advanced: Golden tickets (10–80% of the ghost or Expected kids).
  - `costumes`: this night's door buttons; Make a night copies them.
- **Household:**
  - `join` Helpers and the join key: every night; who to share it with; Change join key cuts off every phone.
  - `tv` Your TV: read-only, follows the door's night, Pair a TV, family far away, Rotate cuts every screen off; → TV help.
  - `estimate` Last year (estimated): a typical-night-shaped ghost, races every None night, Clear.
  - `name` Household name: shown on TV and shared summaries; House rules.
  - `location` Location: optional, ~5 × 3 km cell only; "near you" shows once another house nearby is counting.
  - `managers` Managers: equal, invite link once/7 days/Google, Leave.
  - `account` Your account: sign out doesn't stop phones or TV; Delete is immediate and final.
- Every topic the ticket named is covered: live Events (`door`, `also`, `nights`), reset (`night-Live`, `night-Ended`), TV link vs join key (`tv`, `join`), golden tickets (`tools`, `settings`), Race against and the ghost (`settings`, `estimate`), Clock shift (`settings`), Location and nearby (`location`), Managers and invites (`managers`).

**Tone**
- Plain, short and friendly, like `/help/tv`: 1–3 sentences per paragraph and at most two paragraphs per topic. Glossary words are used as the UI shows them (Go live, End the night, join key, TV link). The word "Rehearsal" appears nowhere.

**Left to other tickets / the build**
- The `location` text follows [Nearby across Area edges](12-nearby-across-area-edges.md): there's no minimum, so it says "near you" shows "once another house nearby is counting", not "once 5 houses count" (the prototype's text). The dropped minimum ships even if the edge window is cut, so this wording stands either way.
- It deploys after the opening line and can be cut (decided at charting). Cut it whole: `data-help` attributes without the module do nothing.
