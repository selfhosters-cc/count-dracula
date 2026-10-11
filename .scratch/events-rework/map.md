# Events rework and the front door — Map

Label: wayfinder:map

## Destination

A build-ready **v2.1 addendum** to the [v2 spec](../multi-household/spec.md) plus **build tickets 50+** in `.scratch/multi-household/issues/`, after opening-day feedback:

- **(e)** any number of Events per Household, several live at once, any of them resettable, so a rehearsal is just another Event (or the real one reset)
- **(1)** a public homepage on `/`, with the door phone on `/door` and `/?key=` links still working
- **(b)** nearby no longer split by Area edges
- **(d)** a help column on `/setup`

(e) and (1) land before the new opening line; (b) and (d) deploy fix-forward and can be cut.

## Notes

- **Scope, decided at charting (2026-10-11):**
  - **Sign-up stays paused until (e) and (1) are deployed.** [Open sign-up](../multi-household/issues/38-open-sign-up.md)'s steps 5–7 move after them; steps 1–4 are done. Production has **no users but Household #1**, and anything can be destroyed and rebuilt.
  - **"Several live" is reading C:** "live" means *open for counting*, and a rehearsal is just another Event. No separate Rehearsal kind is assumed.
  - **Homepage:** `/` is the public homepage, folding in `/signup`; the door moves to **`/door`**; `/?key=…` redirects there with the key; a phone with a remembered key goes to the door; a signed-in Manager gets a "Go to Setup" button, not a redirect.
  - **Help:** a sticky right column on `/setup` at ≥ 900 px, following the section in view; a "?" per section heading on phones; one source of text; `/help/tv` stays.
  - **(b) is about Area edges**, not the picker: a town split across an Area edge.
- **Calendar:** decisions ~Oct 12–13, build, open sign-up ~Oct 16–18. The only freeze is **Oct 31, 3 pm–midnight**.
- **Constraints carried from v2:** zero npm dependencies (vendored browser libraries); never commit our real hostnames (use `count-dracula.example.com`); every read and write carries a credential; public internet is the threat model.
- **Glossary:** [CONTEXT.md](../../CONTEXT.md). Expect **Rehearsal**, **Event**, **Join key**, **TV link**, **Goes live at**, **Active Household** and **Area** to change.
- **Skills each session should consult:** `/grilling` + `/domain-modeling` for decisions; `/prototype` for prototype tickets; `/research` for research tickets; `dataviz` for anything map- or chart-shaped.
- **Tracker:** local markdown. Decision tickets in `issues/NN-<slug>.md` with `Type:`, `Status:`, `Blocked by:`; research findings in `research/`. The build tickets continue v2's numbering in `../multi-household/issues/`.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

- [Where the code assumes one live Event or the Rehearsal flag](issues/01-one-live-event-assumptions.md) — four seams carry it: `eventById()` defaulting to the live Event, `frozen` set only by Go live, join key / TV token resolving to a Household, one SSE channel and `seq` per Household; the Rehearsal flag is confined to nearby, Operator, auto-end, nudge, checklist, Reset and wording; three latent bugs once two are live, and zero live Events would 500.
- [Live Events and their credentials](issues/02-live-events-and-credentials.md) — Upcoming → Live → Ended → Past (noon next day, or a Manager closes it); Go live never touches another Event; zero to 3 open per Household; join key and TV link stay per Household (every write names its Event, a TV shows one Event, "No night on right now" between); no delete while Live; Rehearsal retired.
- [Resetting any Event](issues/03-resetting-any-event.md) — Live or Ended → back to Upcoming; clears kids, moments, golden tickets (redrawn at next Go live), summary and share links; keeps setup, tags at 0, Reports; Managers from `/setup`, typed name above 20 kids; a go-live stamp makes the outbox drop pre-reset taps; no practice marker.
- [TVs and door phones across several live Events](issues/04-tvs-and-door-phones.md) — TV and door both show the open Event that went live most recently (no pin, no switch on the phone), switching quietly; queued taps keep their Event and are dropped if it's gone; only the on-screen Event plays sound; nothing open gives "No night on right now" on both; a dead key is forgotten; helper links are `/door?key=`.
- [Going live and ending by themselves](issues/05-auto-go-live-and-end.md) — every Live Event auto-ends at 3 am (nothing stays Live past a night); Goes live at at the 3-open cap closes the oldest Ended Event or waits; the nudge only on the door's Event; ☰ Go live now for the soonest-scheduled Upcoming Event; tick moves are per-Event notes in `/setup`; Reset drops a Goes live at that has passed.
- [Nearby, the site-wide total and Operator status without a Rehearsal flag](issues/06-nearby-sitewide-operator.md) — any open Event can count, no practice marker; each Household is one house, counted only through the door's Event (the open one that went live most recently), so a 2 pm test night stays out once Halloween goes live; Site-wide total keeps v2's rule (open, not just Active); Operator statuses Counting → Stale (Live only) → Waiting → Ended → No night.
- [Ghost, estimated ghost, golden tickets and summaries per Event](issues/07-ghost-golden-summaries.md) — the estimate is the Household's default Race against (every Event racing None, later ones too), always offered, no past-Event gate; every Event draws golden tickets the same way (a test night is shaped by its count and Expected kids); every Ended or Past Event has a Night summary and one share link; tally, CSV and summary per Event row; Race against offers only Ended, Past, imported or estimated Events.
- [/setup with several live Events](issues/08-setup-with-several-live.md) — three tabs: **Tonight** (the door's night large, other open nights as short rows, a waiting night's note, "No night on right now" with Go live now; Count on this device and Add a helper), **Nights** (Open n of 3, Coming up, Past; Make a night), **Household** (join key, TV, the estimate, name, Location, Managers, account); each night opens its own screen with its notes, state's actions, tools, settings and costumes.
- [Sign-up, first-run and the ready checklist without the Rehearsal](issues/09-sign-up-and-first-run.md) — sign-up makes a live **Test night** (an ordinary Event, remembered by id) plus Halloween 2026 Upcoming; only Halloween, live, from Oct 31 4 pm to 3 am; only a Test night after; first-run's tick names the TV's Event; checklist on top of Tonight (TV watching · a kid on any Event, no Reset step · Your Halloween night); Start and Sign in move to `/`, `/signup` and every sign-in link redirect there, paused shows before Google.
- [Household #1: rebuild or migrate](issues/10-household-1.md) — rebuild: copy the v2 database, deploy on a fresh one and sign Household #1 up again at `/`; a one-off `deploy/import-past-counts.js` restores the real "Halloween 2025 (counts)" (346), which Halloween 2026 races (set by hand); the Rehearsal's 314 test kids are dropped; `HOUSEHOLD1_MANAGER_EMAIL` is retired; opening steps 1–4 redone as copy · fresh deploy and sign-up · load check · the new privacy checks.
- [The homepage](issues/11-homepage.md) — one phone-width scroll: pitch, the site-wide line ("Counting now" while a night is Live, "Last night" until noon, hidden below 5), a compact Start counting / Sign in row, then a large How it works (three steps, a screenshot each), then the full forms; a sticky Start / Sign in bar on phones; a signed-in Manager gets a Welcome back card with Go to Setup; own title and `og-home.png`.
- [Nearby across Area edges](issues/12-nearby-across-area-edges.md) — no minimum crowd: "near you" shows once one other house nearby is counting; the window is the Household's cell and its 8 neighbours rounded out to whole Areas (1, 2 at an edge, 4 at a corner), so a town across an edge sees the same figures; rounding, the 10-minute refresh and the 3-house top costume stay; a lone neighbour's rounded count is an accepted risk.
- [The /setup help column's content](issues/13-setup-help-column.md) — one `public/setup-help.js` keyed by each section's `data-help` (a test keeps them in step); at ≥ 900 px a sticky column lists the screen's topics with the one in view open; on phones a "?" per heading opens help in place; 23 topics across Tonight, Nights, a night's screen (help by state) and Household; the text ships from `prototype/setup-help`.

## Not yet specified

- **Build order and cut rule for 50+:** how the build tickets split, and which can be switched off, once the event model's size is known from [Where the code assumes one live Event](issues/01-one-live-event-assumptions.md) and the decisions. Lands in [Assemble the v2.1 addendum](issues/14-assemble-the-addendum.md).
- **Knock-on effects on the Operator dashboard's detail view and actions, and on Reports**, beyond what tickets 06 and 07 ask: likely small, not yet sharp. (Night summary share links are settled by [Ghost, estimated ghost, golden tickets and summaries](issues/07-ghost-golden-summaries.md): one per Ended or Past Event.)

## Out of scope

- Anything beyond the four items: per-Event or per-Household soundboards and switches, new extras, and everything in [v2's Out of scope](../multi-household/map.md#out-of-scope) stay after Halloween.
- Making last year's night the default ghost ("a Household's own 2026 night becomes its 2027 ghost", stated in v2 but never built): it first matters in October 2027. Ruled out in [Ghost, estimated ghost, golden tickets and summaries](issues/07-ghost-golden-summaries.md).
- The Location picker's feel ("my town is bigger than one square"): the feedback was about Area edges, not the picker. Ruled out at charting.
