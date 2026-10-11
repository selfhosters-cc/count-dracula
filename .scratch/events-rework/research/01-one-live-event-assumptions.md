# Where the code assumes one live Event, a Household-level credential, or the Rehearsal flag

Research for [ticket 01](../issues/01-one-live-event-assumptions.md). Read against the code at commit `28ee581` (main, 2026-10-11).
Sources are the repo itself: `server/`, `public/`, `shared/`, `deploy/`, `test/`, the [v2 spec](../../multi-household/spec.md), [CONTEXT.md](../../../CONTEXT.md), the [v1 spec](../../count-dracula/spec.md) (which CONTEXT.md points to for **Event** and **Join key**) and [deploy/RUNBOOK.md](../../../deploy/RUNBOOK.md). Every line number below is from that commit.

**Three kinds of assumption** are tagged on each row:

- **(a)** exactly one live Event per Household, or "the live Event" as the default when no event is named
- **(b)** the Household-level join key or TV link resolving to the live Event
- **(c)** the `rehearsal` flag, or Rehearsal wording

**Size** is a rough guess at the change if Events become independently live with their own credentials:
**S** = a line or a small local edit; **M** = a function, a route or a screen section, plus its tests; **L** = cross-cutting (data shape, wire protocol, or many call sites).

---

## 0. The four seams everything else hangs from

Most rows below lead back to one of these.

| # | Site | What it assumes | Size |
|---|---|---|---|
| 0.1 | `server/ledger.js:392-396` `eventById(id)` | **(a)** `id == null` means `SELECT … WHERE household_id = ? AND live = 1` with `.get()`, so the first live row wins. 15 call sites pass no id: `tap` 546, `catchUp` 557, `remove` 573, `backfill` 590, `removeBatch` 604, `end` 630, `resume` 642, `addTicket` 660, `release` 673, `goLive` (the old one) 702, `setTimeZone` 792, `resetRehearsal` 824, `deleteEvent` 851, `liveUpdated` 883, `batches()` 989. `snapshot(eventId)` (1059) also falls through to it when called with no id. | L |
| 0.2 | `server/ledger.js:695-707` `goLive` | **(a)** "Exactly one event is live per Household, never zero: Go live freezes the old one." Sets the old live row `live = 0, frozen = 1`, the new one `live = 1`, draws its golden tickets, and returns one `event.switched` delta. Nothing else ever sets `frozen` on a real night. | M |
| 0.3 | `server/app.js:441-459` `credentialOf`, plus `read` 461-469, `write` 482-498, `manager` 500-515 | **(b)** A join key resolves through `ledger.householdByJoinKey` (`ledger.js:213-217`) and a TV-link token through `householdByTvToken` (321-325), both to a **Household id only**. The handler then gets `ledger.household(id)` and calls `house.snapshot()` / `house.apply({ type })` with no event, so seam 0.1 picks the event. | L |
| 0.4 | `server/hub.js:16, 51-90`, `server/ledger.js:421, 925`, `public/live.js:6, 70-72` | **(a)** One SSE channel per **Household** (`channels: household id → clients`). Deltas mostly carry no event id: only `event.switched` / `event.updated` do. `seq` is one counter per Household Ledger, and `live.js` reopens the stream on any seq gap and on every `event.switched` / `event.updated`. If one Household had two live Events, a tap on one would reach the other's TV as a delta on the wrong board, and filtering per event would open seq gaps. | L |

**Zero live Events is never handled.** Each of the 15 no-id call sites in 0.1 dereferences the result (`event.id`, `old.id`, `live.race_against_id`, `eventById().id`) without a null check. The same goes for `public/setup.js:306-312` (`live.name`, `live.id`) and the `read` routes (`tvSnapshot(null)` would throw at `snap.kids`). Today that's safe because no command leaves a Household with none.

---

## 1. TV

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:321-325` `householdByTvToken` | **(b)** The token lives on `households.tv_token` and leads to a Household, never an Event. | M |
| `server/app.js:117-126` `GET /api/snapshot` | **(a)(b)** With no `?event=`, the TV link or join key reads `house.snapshot()`, i.e. the live Event. `?event=<id>` (any Event) is for a Manager session only. | M |
| `server/app.js:127-139` `GET /api/stream` | **(a)(b)** The stream's snapshot closure is `house.snapshot()`, re-read on every reconnect, so a TV "follows Go live" by reconnecting. Attached to the Household's channel (seam 0.4). | M |
| `server/app.js:25-28` `tvSnapshot` / `tvDelta` | Per-payload shaping only; no event assumption. | — |
| `server/app.js:141-157`, `server/pairing.js:37-45`, `server/ledger.js:315-319, 951-956` | **(b)** Pairing redeems a code to a **Household** (`pairing.redeem(code, house.id)`); `/api/pair/wait` hands back `house.tvToken()` and a device token stored in `paired_devices (token, household_id)`. | M |
| `server/ledger.js:832-837` `rotateTvLink` | **(b)** One token per Household; rotating it also deletes every paired device of the Household. | S |
| `server/app.js:404-410` `/api/admin` | **(b)** After any Setup command, compares the Household's one join key and one TV token before and after, and closes streams holding the old one. Works by credential string, so a per-event credential would close the same way. | S |
| `server/hub.js:101-106` `close({ householdId, credential })` | Closes by credential string within a Household's channel. Not event-specific. | S |
| `server/guard.js:11, 72-76` | The viewer cap (`householdViewers: 200`) and the tap limit (line 21) are per Household. | S |
| `server/ledger.js:101-106, 650-655` `mix` | The TV volume and mutes are per Household ("a level tuned at the rehearsal should survive Go live"). Every TV of the Household gets the same `mix.changed`. | S |
| `server/ledger.js:103-104, 348, 614-623` soundboard | The 3 s cooldown (`lastBoardAt`) is per Household Ledger, "across every button and phone of a Household". The `soundboard` delta has no event id. | S |
| `public/tv.js:23-29, 478-483` | **(b)** Three modes: `/tv/k/<token>` (the Household's live night), `/tv?event=<id>` (a past recap, Manager only), or bare `/tv` with `cd.tvLink` in `localStorage` (one stored link per device). | M |
| `public/tv.js:372-381` `over` / `inRecap` | **(a)** A night is "over" if `ended` **or** `frozen`; `frozen` only comes from Go live (seam 0.2). | S |
| `public/tv.js:47-58` | The full-screen "Start the night" shows while the live Event has no kid (spec §9, line 338). | S |
| `public/tv.js:529`, `public/tv.html:33-35, 177` | **(c)** `🎭 Rehearsal` chip from `state.event.rehearsal`. | S |
| `public/tv-pairing.js` | Only the code/poll loop; gets whatever `/api/pair/wait` returns. | S |
| `public/live.js:6, 70-72` | **(a)** `event.switched` and `event.updated` force a reopen; seq gap forces a reopen (seam 0.4). | M |
| `deploy/caddy-site.caddy:30-38` | Log masking knows `/tv/k/<token>` and `?key=` / `?device=`. Any new token-bearing URL shape must be added here (spec §21, line 870). | S |
| `deploy/loadtest.js:51-52, 128-140` | Opens viewers on `house.tvToken()` and taps with `house.joinKey()`. | S |
| CONTEXT.md:27-29 **TV link** | **(a)(b)** "The one secret link that lets a device watch a Household's live Event". | S |
| Spec §2:68-69, §3:124-125, 133, §9:308-338, 343 | **(a)(b)** "Each Household always has exactly one TV link … The token identifies the Household" (310); "Live Event only … It follows Go live to the next Event" (329); "The TV link is per Household, live-only, and only rotated" (343). | S |
| `public/privacy.html:52, 57` | **(a)(b)** "Anyone with your TV link sees your live night"; rotate the TV link to cut them off. | S |

## 2. Phones and the join key

| Site | What it assumes | Size |
|---|---|---|
| `server/migrations.js:8-17` | **(b)** `households.join_key TEXT NOT NULL UNIQUE`. | M |
| `server/ledger.js:15` | `events.join_key` still exists (v1's column, "the key lives on households since v2"). v2 never writes it; Household #1's v1 rows still hold v1 values. Not unique. | S |
| `server/ledger.js:213-217` `householdByJoinKey` | **(b)** Key → Household id. | M |
| `server/ledger.js:839-843` `changeKey` | **(b)** One key per Household, regenerated in place. | S |
| `server/ledger.js:928-934` `joinKey()`, `tvToken()` | **(b)** Read off `households`. | S |
| `server/app.js:158-166, 412-438` `/api/taps`, `/api/remove`, `/api/end`, `/api/resume`, `/api/release`, `/api/soundboard`, `/api/mix`, `/api/catch-up` | **(a)(b)** Every phone write sends `{ type, … }` with no event id; the Ledger applies it to the live Event (seam 0.1). | M |
| `server/app.js:338-344` `GET /api/household` | **(b)** Returns the Household's one `joinKey` and one `tvToken` to `/setup`. | S |
| `public/index.js:12-20, 27, 78` | **(b)** One `cd.joinKey` in `localStorage`; sent as `X-Join-Key` and `?key=` on the stream. Taps queued in the outbox carry no event id, so a tap queued before Go live lands on whichever Event is live when it's sent (its costume dropped if the tag isn't in that Event, `ledger.js:457`). | M |
| `public/index.js:104-108, 119` | **(a)(c)** The header chip from `event.rehearsal`; costume tiles are rebuilt for "a different event after Go live". | S |
| `public/index.js:362-381` | **(a)(b)** "Go live on <next scheduled night> now" in ☰: shown only when `/api/household`'s `joinKey` equals this phone's key (a signed-in Manager of the same Household); the confirm says "Tonight's board and the TV switch over". | M |
| `public/index.js:391-401, 412` | **(a)** End / Resume / Release act on "the night"; "Add a helper" builds `/?key=<household key>`. | S |
| `public/index.html:154` | **(c)** `🎭 Rehearsal` chip. | S |
| `public/setup.js:61-65, 70-78, 319, 515-526` | **(b)** Join URL, "Count on this device" (stores the Household key), the key shown under "Live now", Change join key (rewrites this phone's stored key if it matched). | S |
| CONTEXT.md:19-21 **Helper** | "the phone joins an event with its join key" (already per-event wording). | S |
| v1 spec:56, 58, 71, 218 | **(a)(b)** The base definitions CONTEXT.md defers to: "Exactly one is live, never zero"; "Only the next Go live freezes it"; the join key "carries over on Go live". | S |
| Spec §2:86-87, §3:124, 132, §7:282, §21:872 | **(a)(b)** "exactly one live, never zero now holds per Household"; "Join key: one per Household, kept across Go live"; "A join key leads to the Event and so its Household" (132, which is per-event wording, while the code goes key → Household); "One join key per Household, kept across Go live, so phones joined at the Rehearsal keep working on the night" (282). | S |

## 3. Ghost / Race against

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:398-419` `ghostOf(event)` | Per Event (`race_against_id`); no live assumption. | — |
| `server/ledger.js:710-736` `settings` | Changing any setting returns `event.updated` **only if the Event is live**; a not-live Event changes "quietly" (no subscribers). | S |
| `server/ledger.js:797-814` `setLastYear` | **(a)(c)** Attaches the estimate to `comingNight()` only, then sends `event.updated` for `eventById()` (883). | M |
| `server/ledger.js:866-870` `canEstimateLastYear` | **(c)** "No past night of its own": a frozen or counts-only Event with `rehearsal = 0` and `estimated = 0`. Depends on `frozen`, which only Go live sets (seam 0.2). | S |
| `server/ledger.js:872-880` `comingNight` | **(a)(c)** "The live non-Rehearsal one, or else the next one to go live": `frozen = 0 AND counts_only = 0 AND rehearsal = 0 ORDER BY live DESC, goes_live_at …LIMIT 1`. One answer per Household. | M |
| `server/ledger.js:845-858` `deleteEvent` | **(a)** Refuses the live Event; sends `event.updated` only if `eventById()`'s `race_against_id` pointed at the deleted one. | S |
| Spec §14 (estimated), CONTEXT.md:63-65 | "A counts-only past Event a Household without a past night gets"; the estimate races "the coming night". | S |

## 4. Golden tickets

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:350-365, 705` `drawGoldenTickets` | Drawn only inside `goLive` (also reached by the tick). Not drawn when sign-up makes "Halloween 2026" live at once (`ledger.js:176-177`, no base to draw from). | S |
| `server/ledger.js:657-676` `addTicket`, `release` | **(a)** No event id: the live Event. `release` is "any phone with the join key" (`app.js:419-422`). | S |
| `server/ledger.js:625-647` `end`, `resume` | **(a)** No event id. End expires unclaimed tickets; Resume restores them. | S |
| `server/ledger.js:367-379` `recapOf` | **(a)** Reveals the numbers once `ended` **or** `frozen`. | S |
| `server/ledger.js:822-830` `resetRehearsal` | **(a)(c)** Puts every ticket back to `hidden` with the **same numbers** and no winner; deletes kids, batches and fired moments; clears `ended`. It does not clear `summary_nearby`, share links or Reports. | M |
| `public/setup.js:509-514`, `public/setup.html:154` | **(a)** "Add a golden ticket to tonight?" with no event; "Golden tickets (drawn at Go live)". | S |
| `public/index.js:250-253, 391-406` | **(a)** Release shows from 7:45 pm event time on the live Event's shift. | S |
| `test/v1-night.js:6-16` | The v1-style fixture creates an event *named* "Rehearsal" with `createEvent` (so `rehearsal = 0`), races it against 2025, goes live (drawing 5 tickets), then deletes sign-up's own Rehearsal and Halloween. `ledger.test.js:641` "the first install draws for the live Rehearsal too" tests that. | S |
| Spec §6:217, §19:841 | **(c)** "The Rehearsal has no golden tickets" (in v2, by giving it `golden_count = 0`, `ledger.js:175`). | S |

## 5. Nearby and the Site-wide total

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:268-285` `nearbyNights` | **(a)(c)** One row per live Event (`WHERE e.live = 1`), each with `rehearsal`. | M |
| `server/nearby.js:10-11, 13-35` `computeNearby` | **(a)(c)** Comment: "one per Household's live Event". Drops `rehearsal` and `suspended`; an Area's `houses` is `active.length` and the site's `houses` is `counting.length`, i.e. **rows, not distinct Households**. Two live Events in one Household would count as two houses and add both nights' kids. The top-costume rule does count distinct Households (`households: Set`, 40-61). | M |
| `server/nearby.js:64-81` `createNearby` | `cells` and `forHousehold` keyed by Household. | S |
| `server/app.js:88-106, 362` | Figures per Household's channel; `nearbyArea(householdId)` is what an ending night keeps; `/api/site` serves the site line. | S |
| `server/ledger.js:629-632` | The Area figures saved onto the ended Event (`summary_nearby`) come from the Household, not the Event. | S |
| `public/nearby-text.js`, `public/signup.js` | Render whatever the figures say. | — |
| CONTEXT.md:55-61 | **(a)(c)** **Active Household**: "whose live, non-Rehearsal Event"; **Site-wide total**: "every Household with a live, non-Rehearsal Event, and how many such Households". | S |
| Spec §2:75-76, §6:248, §11:373, 378, 392 | **(a)(c)** The same rule, plus "A Rehearsal never counts toward nearby figures, the Site-wide total or the Operator's Counting status" (248). | S |

## 6. Auto go-live, the nudge and the auto-end

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:184-194` tick, going live | **(a)** Any `goes_live_at <= now AND live = 0 AND frozen = 0 AND counts_only = 0` Event is put through `goLive`, which **freezes whatever is live** (normally the Rehearsal, spec §7:277). | M |
| `server/ledger.js:195-204` tick, auto-end | **(a)(c)** Selects live, `rehearsal = 0`, unended Events and checks each one's own `went_live_at` against 3:00 am, but then applies `{ type: 'end' }` **with no event id**, which ends `eventById()`, the first live row. Correct only while there's one. | M |
| `server/ledger.js:93-96` | **(c)** `HALLOWEEN` (date, 4:00 pm) and `AUTO_END_AT = '03:00'`: "a live, non-Rehearsal night still on at 3:00 am local is ended". | S |
| `server/ledger.js:723-728` `settings.goesLiveAt` | **(a)** "Only a night that isn't live yet can be scheduled." | S |
| `server/migrations.js:73-81` | **(a)** 4 → 5 sets `went_live_at = now()` on `WHERE live = 1`. | S |
| `public/door-view.js:81-95` `quietNudge` | **(a)(c)** Only on `event.live && !event.rehearsal && !event.ended`, 8:30 pm event time, 30 min with no tap; the state is the phone's one live Event. | S |
| `public/setup.js:338, 343`, `public/setup.html:89-92` | **(a)** "Your night ended automatically at 3:00 am" shows for the live Event only (`live.ended && live.endedAutomatically`). | S |
| `public/index.js:362-381` | **(a)** Go live now picks the earliest scheduled not-live, not-frozen Event. | S |
| CONTEXT.md:39-41 **Goes live at** | **(a)** "The time a not-yet-live Event becomes live by itself"; "Go live early". | S |
| Spec §1:49-53, §7:277-282, §16:754-758, 812 | **(a)(c)** "using v1's Go live: the old live Event (normally the Rehearsal) is frozen"; the nudge and safety net "on a live, non-Rehearsal Event". | S |
| `deploy/RUNBOOK.md:64-76, 265-266` | **(a)(c)** Step 5 tests a test Household's auto go-live and 3 am end; Nov 1 step 1: "Every live, non-Rehearsal night ended at 3:00 am". | S |

## 7. Summaries, share links, export and recaps

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:1017-1035` `summary(eventId)` | **(a)** Exists once `ended` **or** `frozen`. A not-live, never-ended Event only gets one by being frozen by the next Go live. | S |
| `server/ledger.js:1037-1056`, `server/migrations.js:115-135` | Share links are per Event (`share_links.event_id UNIQUE`); Reports carry `event_id`. No live assumption. | — |
| `server/app.js:354-381` `/api/summary`, `/api/share` | Per Event id, Manager session or share token. | — |
| `server/ledger.js:971-985`, `server/export.js` | Export is per Event id. | — |
| `public/setup.js:339-342, 495` | **(a)** "✨ Tonight's Night summary", Stop sharing and ⬇ Export for `events.find(e => e.live)`. | S |
| `public/setup.js:308, 359-372` | **(a)** "Past" = `frozen || countsOnly`; only past rows get Night summary, View recap (`/tv?event=`), Export and Delete. | M |
| `public/summary.js`, `shared/summary.js`, `shared/night-maths.js` | Pure, per-night maths; no live, credential or Rehearsal assumption. `nextWallTime` (night-maths 139-145) is what the auto-end uses. | — |
| `public/tally.js:15-19` | **(a)** Titles the sheet with `/api/snapshot`'s event name: the live Event. | S |
| CONTEXT.md:43-45 **Night summary** | "of one ended Event". | — |
| Spec §12:418-422 | Slides exist "once the night is ended … and for any past night". | S |

## 8. Sign-up, first-run and the checklist

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:157-182` `createHousehold` | **(a)(c)** Makes a live `Rehearsal` (`rehearsal = 1`, no tickets) and a scheduled "Halloween 2026"; after Oct 31 4:00 pm local, Halloween is live and the Rehearsal is not. One key and one TV token on the Household. | M |
| `server/ledger.js:81-91` | **(c)** "What a new Household's Rehearsal and nights start with". | S |
| `server/ledger.js:944-949` `rehearsalKids()` | **(c)** Kids on any `rehearsal = 1` Event: the checklist's "A phone counted a test kid". | S |
| `server/app.js:338-344` | **(c)** `checklist: { tvWatching, rehearsalKids }`. | S |
| `server/app.js:23` `ADMIN_COMMANDS` | **(c)** Includes `resetRehearsal`. | S |
| `server/accounts.js:70-77` | Sign-up calls `ledger.createHousehold`. | — |
| `public/first-run.js:77-81` | **(c)** "✓ Your TV is showing your Rehearsal". | S |
| `public/first-run.js:67-73` | **(b)** Send the link / Use this screen: the Household's TV link. | S |
| `public/setup.js:141-147, 344`, `public/setup.html:81, 99` | **(a)(c)** "🎭 Reset the Rehearsal to 0", shown only while the **live** Event is a Rehearsal; the checklist's "Now try Reset the Rehearsal". | M |
| `public/setup.js:163-182, 188-192` `halloweenNight` | **(a)(c)** The checklist's night: the earliest scheduled not-live Event, else `events.find(e => e.live && !e.rehearsal)`. | S |
| `public/help-tv.html:56, 69, 73-74` | **(c)** "Set the volume at your Rehearsal"; "Test it on your Rehearsal … Then Reset the Rehearsal … Halloween 2026 goes live by itself". | S |
| `public/privacy.html:65`, CONTEXT.md:87-89, spec §2:82 | **(c)** **Abandoned sign-up**: "never counted a kid outside its starter Rehearsal". Stated only; the purge job isn't built (spec line 648). | S |
| CONTEXT.md:35-37 **Rehearsal** | **(a)(c)** "sign-up creates it live", "can be reset to 0 while live", "never counts toward nearby figures". | S |
| Spec §6:209-248 | **(a)(c)** The whole section: live Rehearsal at sign-up (217-218), first-run's Rehearsal line (228), checklist (238-239), "The Rehearsal" (243-248). | M |

## 9. `/setup`'s live section and event list (ticket 08)

Not one of the ticket's named areas, but the largest single file affected.

| Site | What it assumes | Size |
|---|---|---|
| `public/setup.js:305-310` `render` | **(a)** `live = events.find(e => e.live)`; `editable = [live, ...upcoming]`; `editingId` falls back to `live.id`. | L |
| `public/setup.js:312, 318`, `public/setup.html:95-97` | **(a)** "Live now: <name>", its kid count, the join key and zone in one header. | M |
| `public/setup.js:321, 332, 459-462` | **(a)** The editor marks "(live)"; hides and never sends Goes live at for the live Event. | S |
| `public/setup.js:350, 380-418` `renderBackfill` / backfill submit | **(a)** "Add missed kids" rows use the live Event's clock shift; the command carries no event id; `/api/batches` is the live Event's (`ledger.js:987-998`). | M |
| `public/setup.js:351-357, 497-500` | **(a)** Each upcoming row's Go live button warns '"<live>" will be frozen as a past event. Phones and the TV switch over by themselves.' | S |
| `server/ledger.js:1007-1015` `events()` | Returns every Event with `live`, `frozen`, `rehearsal`; no assumption itself. | — |
| `server/ledger.js:738-772` tag commands | Send deltas "only for the live event: nobody is watching the others". | S |
| `server/ledger.js:788-793` `setTimeZone` | **(a)** Resyncs screens with `event.updated` for `eventById().id`. | S |

## 10. The Operator

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:254-266` `liveNights` | **(a)(c)** One row per live Event, with `rehearsal`. | S |
| `server/app.js:181-205` `/api/operator` | **(a)(c)** `new Map(liveNights().map(n => [n.householdId, n]))`: a second live Event of a Household **overwrites** the first. Kids and last kid are that one Event's. `statusCounts` includes `Rehearsal`. | M |
| `server/app.js:226-236` detail | **(a)** `liveNights().find(n => n.householdId === id)`: the first. | S |
| `server/operator.js:10-17` `STATUSES`, `householdStatus` | **(a)(c)** One status per Household from its one live Event; `rehearsal` → `'Rehearsal'`, checked first. | M |
| `public/operator.js:6, 60-74` | **(c)** Filter chips and sort order `Counting → Stale → Waiting → Rehearsal`. | S |
| `deploy/access-request.js:22-29` | **(c)** Lists each Event's `live`, `ended`, `rehearsal`. | S |
| Spec §13:451, 468-478 | **(a)(c)** "Rehearsal: The live Event is a Rehearsal"; "Kids (live Event)". | S |

## 11. Schema, migrations and Household #1

| Site | What it assumes | Size |
|---|---|---|
| `server/ledger.js:12` | **(a)** Column comment `live … -- exactly one per Household`. No constraint enforces it. | S |
| `server/migrations.js:18-20` | **(a)(c)** Adds `events.household_id`, `events.rehearsal`, and index `events_by_household (household_id, live)`. | S |
| `server/migrations.js:22-26` | **(a)(b)(c)** Household #1 is made only if a v1 row has `live = 1`; its key is **that live Event's** `join_key`; `rehearsal = 1` is set by the name `'Rehearsal'`. | S |
| `server/migrations.js:53-59` | **(b)** One `tv_token` per Household, unique index. | S |
| `server/migrations.js:61-71` | **(b)** `paired_devices (token, household_id)`. | S |
| `server/migrations.js:2-3`, spec §4:170 | "Once sign-up has opened, a step only ever adds". The map says production has no Household but #1 and can be rebuilt. | — |
| `server/accounts.js:26-31, 71` | `HOUSEHOLD1_MANAGER_EMAIL` claims Household #1 once. No event assumption. | — |
| `deploy/v1-final.sh:39-42` | **(a)** Prints `snap.event` as "Live:" after the practice migration. | S |
| `deploy/seed-nearby.js:6, 29-31` | **(a)** Takes each fake Household live on "Halloween 2026" with `goLive` (freezing its Rehearsal), then reads tags from `house.snapshot()`. | S |
| Spec §4:148-149, 167, §16:744, §21:872, 876 | **(a)(c)** "join key (one per Household)"; events get "a Rehearsal flag"; Household #1's "Rehearsal … and its Race against survive"; "Whether the migration marks Household #1's v1 Rehearsal … Either way, it's frozen when Halloween 2026 goes live". | S |
| `deploy/RUNBOOK.md:20-23, 45, 229-234` | **(a)(c)** Household #1 is "the live Rehearsal racing Halloween 2025 (counts)"; §7 creates "Halloween 2026" by hand, copying costumes from the Rehearsal, and tests "our Rehearsal". | S |

**Household #1's Rehearsal is not like a signed-up one.** It's v1's live event: it races "Halloween 2025 (counts)", it had its golden tickets drawn at its v1 Go live ("the rehearsal draws for real", spec §19:841), and the migration flagged it `rehearsal = 1` only by name. Household #1 also has no "Halloween 2026" until a Manager makes one (RUNBOOK §7).

## 12. Tests

Counts are from `grep`. Most of the Ledger's test suite is written against the default live Event.

| Site | What it assumes | Size |
|---|---|---|
| `test/v1-night.js:6-21` `setUpV1Night` / `openV1Night` | **(a)** Builds the v1 night by `createEvent` + `goLive` (freezing the starters), then deletes the starters. Used 56 times in `server/*.test.js`. | M |
| `server/ledger.test.js` (1,201 lines) | **(a)** 69 no-argument `snapshot()` calls and 92 `tap` / `end` / `remove` / … commands with no event id. "Events and Go live" (319-430): Go live freezes the old one (332), new taps from #1 (346). "Change key replaces the live event's key" (433), "the live event can't be deleted" (443), "draws for the live Rehearsal too" (641), per-Household mix survives Go live (729). | L |
| `server/households.test.js` | **(a)(b)(c)** Migration to Household #1 (17); sign-up "gives a live Rehearsal … its own join key and no golden tickets" (80); "each has exactly one live Event, and Go live in one never touches the other" (109). 19 no-arg `snapshot()`. | M |
| `server/schedule.test.js` | **(a)(c)** Sign-up's Rehearsal live and Halloween scheduled (26, 37); the tick freezes the Rehearsal (50-70, `frozen: true` at 67); the 3 am end "never touches a Rehearsal" (130); `wentLive` detects `event.switched` (23); TVs and phones follow a go-live (182). | M |
| `server/first-run.test.js` | **(c)** Checklist's Rehearsal kid (75); Reset the Rehearsal clears and resyncs (86), refused on a non-Rehearsal (103); migrated Household #1 (52). | S |
| `server/credentials.test.js` | **(a)(b)** "A phone joined on the Rehearsal keeps working after Go live" (139); Change join key closes old-key streams (123); 5 no-arg `snapshot()`. | S |
| `server/tv-link.test.js` | **(a)(b)** "reads only the live Event, follows Go live, and never writes" (73). | S |
| `server/app.test.js` | **(a)** "Go live tells every stream to switch" (288); "a tap with the live event key is counted" (91). | S |
| `server/nearby.test.js` | **(a)(c)** "Rehearsals … don't count" (27); "every live, non-Rehearsal night's Household" (119). Pure `computeNearby` fixtures, one night per Household. | S |
| `server/operator-dashboard.test.js:13-22` | **(c)** `householdStatus` cases including Rehearsal. | S |
| `server/summary.test.js`, `server/share.test.js`, `server/estimated.test.js`, `server/sign-in.test.js:55`, `server/export.test.js` | **(a)** End the live night with no event id, then read its summary; sign-up "lands in /setup … with a live Rehearsal". | S |
| `public/door-view.test.js:218-255` | **(c)** "never on a Rehearsal" nudge. | S |
| `deploy/scripts.test.js:59-60` | **(c)** Access request lists 'Halloween 2026' and 'Rehearsal'. | S |
| `shared/*.test.js` | "rehearsal" only in names of clock-shift cases (night-maths.test.js 88, 125). | — |

---

## Biggest costs (top 5)

1. **The default-to-live seam (0.1) and everything written against it.** 15 Ledger call sites, every phone write route, both read routes, the tick's auto-end, and roughly 160 test calls in `ledger.test.js` alone pass no event id.
2. **One SSE channel and one `seq` per Household (0.4).** Deltas mostly carry no event id, `live.js` resyncs on any gap and on every `event.switched` / `event.updated`, and the soundboard cooldown, TV mix and caps are per Household. Several live boards in one Household means changing the wire protocol, not just routing.
3. **Credentials resolve to a Household, never an Event (0.3).** That covers the join key and TV token on `households` (unique), pairing and `paired_devices`, the stored `cd.joinKey` / `cd.tvLink`, the outbox (taps carry no event), "Add a helper", "Count on this device", the Manager-phone check in ☰, `/api/household`, Change key / Rotate, and the Caddy masking shapes.
4. **`frozen` means "no longer live", and only Go live sets it (0.2).** Summaries, the TV recap and "over" state, Setup's Past list, read-only past events, `canEstimateLastYear`, `comingNight` and the tick's go-live query all key off `frozen`. If Go live stops freezing the old Event, nothing ever becomes "past".
5. **`/setup`'s single "Live now" layout (§9).** The `live = events.find(e => e.live)` render, the editor, backfill, Reset the Rehearsal, the auto-ended notice, export and summary links, and the Go live confirm. A close sixth: the Operator's one-status-per-Household map and nearby counting rows as houses.

## Surprising

- **The 3 am auto-end can end the wrong Event.** The tick checks each live non-Rehearsal Event's own `went_live_at` but then applies `end` with no event id (`ledger.js:203`), which ends the first live row. That's harmless only while there's one.
- **Nearby counts live Events, not Households** (`nearby.js:26, 32`). A Household with two live, non-Rehearsal Events would count as two houses toward the Area minimum of 5 and the site line.
- **Operator rows keep the last live Event per Household** (`app.js:183`, a `Map` overwrite), while the detail view keeps the first (`app.js:230`).
- **Nothing handles zero live Events.** About 18 server sites and `setup.js` `render` would throw a TypeError (a 500, not a 400).
- **Reset the Rehearsal re-hides the same golden numbers** (`ledger.js:827`). That's fine for a ticketless Rehearsal, but any Event reset after its recap revealed the numbers would reuse them. It also leaves `summary_nearby`, share links and Reports in place.
- **`events.join_key` still exists**, a per-event key column from v1 that v2 no longer writes (`ledger.js:15`). Household #1's v1 rows still carry v1 keys.
- **The test fixture's "Rehearsal" isn't a Rehearsal.** `test/v1-night.js` creates it with `createEvent`, so `rehearsal = 0` and it has 5 golden tickets. Most Ledger tests run on that, not on sign-up's shape.
- **Household #1's real Rehearsal has golden tickets and a Race against** (v1's "the rehearsal draws for real"), unlike any signed-up Household's.
- **The spec already says "A join key leads to the Event and so its Household"** (§3, line 132), but the code goes straight from key to Household.
- **`shared/` has no live, credential or Rehearsal assumption.** The night maths and summary facts are already per Event.
