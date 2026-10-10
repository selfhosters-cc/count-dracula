# Count Dracula — modules and seams

How the [v1 spec](spec.md) is cut into modules before the build starts. Read it alongside the build tickets (15–38). Each ticket links the module(s) it lands in.

- **Written:** 2026-10-10, before the [walking skeleton](issues/15-walking-skeleton.md).
- **Principle:** deep modules. A small interface hides a lot of behaviour, and tests go through the same interface that callers use.
- **The split:** the server **decides** what happened. The TV and phones **present** it.

## Contents

1. [Ledger (server)](#1-ledger-server)
2. [SSE hub (server)](#2-sse-hub-server)
3. [Night maths (shared)](#3-night-maths-shared)
4. [Live state (phone + TV)](#4-live-state-phone--tv)
5. [Outbox and door view (phone)](#5-outbox-and-door-view-phone)
6. [Celebration director (TV)](#6-celebration-director-tv)
7. [Sound engine (TV)](#7-sound-engine-tv)
8. [Shallow traps](#8-shallow-traps)

---

## 1. Ledger (server)

The deep module. Every write goes through it, and every server-side unit test runs against it.

```js
const ledger = openLedger(db, config)   // db: bun:sqlite; ':memory:' in tests
ledger.apply(command) → Delta[]         // one transaction per command
ledger.snapshot(eventId?) → Snapshot    // defaults to the live event
```

**Commands:** `tap`, `undo`, `remove`, `catchUp`, `backfill`, `removeBatch`, `createTag`, `updateTag`, `deleteTag`, `createEvent`, `goLive`, `deleteEvent`, `changeKey`, `settings`, `end`, `resume`, `release`, `addTicket`, `soundboard`, `mix`. Names are the builder's.

**Hidden behind the interface:**

- `INSERT … ON CONFLICT(id) DO NOTHING` idempotency. A repeated tap returns `[]`.
- `received_at`, the **late** flag (> 10 s) and **kid numbering**. The number is stored once and never rewritten.
- Catch-up, soft deletes, the even spread for backfill batches, and batch removal.
- The **one-live-event** rule, freezing, and rejecting writes to frozen events.
- **Golden tickets:** the stratified draw at Go live, the referee (win, roll-forward on a late tap, release, expire, restore on resume), and the rule that **no hidden ticket sits below the count**.
- **Fired moments:** each milestone fires once, milestones crossed by late taps are skipped, and Beat last year waits for the next live tap.
- **Feature switches** from `config`. A switched-off feature produces no moments and no draw.
- The soundboard's 3 s cooldown, shared across all phones.

**Deltas carry decided moments.** The server decides every celebration, and the TV only renders it:

```js
{ type: 'kid.added', seq, kid: {id, number, tagId, phoneName, tappedAt, late, source},
  moments: ['golden', 'milestone:100'] }      // or [] for a plain pop
{ type: 'moment', seq, moments: ['beat-last-year'] }   // deferred beat, no kid number
```

- A TV reload can't re-fire a moment, and the TV can't disagree with the server about one.
- The secret golden numbers never leave the Ledger. Clients see only `goldenLeft` and `nextIsGolden`, in the snapshot and in deltas.

**Seam:** none. SQLite with `:memory:` is the test setup. A repository interface would have one adapter, so it would be a hypothetical seam. The HTTP layer stays thin: check the join key or admin PIN, parse the body, call `apply`, then `hub.publish(deltas)`.

**Internal seam (optional):** the referee can be a pure function, `referee(state, arrival) → {wins, moments}`, that `apply` calls inside the transaction. Test it directly only if the Ledger-level tests get awkward.

**Tickets:** 15, 17, 18, 19, 22, 23, 24 (export reads), 27, 28, 29, 32 (cooldown), 35.

---

## 2. SSE hub (server)

```js
hub.attach(req, () => ledger.snapshot()) → Response
hub.publish(deltas)
```

**Hidden:** the `id: <seq>` framing, the 15 s `:` heartbeat, `server.timeout(req, 0)`, removing dead clients, and the snapshot sent first on every connection.

**Tickets:** 15.

---

## 3. Night maths (shared)

One pure ES module under `shared/`. The Bun server imports it, and so do the browser pages (no build step). It's the **only** place Clock shift is applied.

```js
eventNow(realMs, shiftMs)              // and toEventTime / toRealTime
toBuckets(kids) → [{slot, count}]      // half-hour buckets: the export summary and the ghost seed
ghost(buckets) → (eventTime) → count   // linear within a bucket, flat after the last one
slots(from, to, minutes)               // the 15-min rows on the tally sheet and in Add missed kids
peakHalfHour(kids) / visits(kids, windowMs) / costumeOfTheNight(kids, tags)
releaseOpen(eventNow)                  // 7:45pm gate
tagColour(order)                       // the six slots, untagged orange, grey from the 7th tag
```

**Decision:** every ghost source becomes half-hour buckets. That covers the 2025 seed, a 2026 event's own taps, and the CSV summary. There's one code path, and [ticket 24](issues/24-export-csv.md)'s round-trip test passes by construction.

**Tickets:** 21, 22, 23, 24, 29, 30, 33, 34, 36.

---

## 4. Live state (phone + TV)

```js
const live = connectLive(url)
live.state                              // live event, tags, kids, settings, seq
live.on(({ state, cause, delta }) => …) // cause: 'snapshot' | 'delta'
live.connected / live.disconnectedFor   // ms; drives the 🦇 chip and pauses the idle teaser
```

**Hidden:** EventSource reconnects, applying the snapshot and then deltas, a full resync when there's a seq gap, and noticing a stale connection.

The TV's "never celebrate a snapshot" rule is one check: `cause === 'delta'`.

**Tickets:** 15, 17, 20, 34.

---

## 5. Outbox and door view (phone)

```js
const outbox = createOutbox({ send, storage, clock })
outbox.tap(tagId) → entry
outbox.remove(kidId) → { local: entry } | { server: kidId }   // drop an unsent tap, or queue a soft delete
outbox.mine / outbox.claim(kidId)                       // ids this phone added: what Undo walks back through
outbox.pending                                          // not yet acknowledged; persisted
outbox.unconfirmed                                      // acknowledged, not yet seen in the live state
outbox.sync({ cause, state })                           // feed it every live-state update
outbox.retryNow()                                       // on `online` / `visibilitychange`
outbox.status                                           // 'ok' | { waiting: n } | { down: n } | 'sent'

doorView(liveState, outbox) → { total, untagged, tags, catchUp: { max, preview(n) }, recent, undo, goldenBanner, … }
```

**Outbox hides:** UUIDs from `crypto.getRandomValues`, the localStorage outbox, retries on a timer and on `online`/`visibilitychange`, dropping entries once acknowledged (they stay `unconfirmed` until the live state shows them, so the door count doesn't dip while the stream reconnects after a server restart), and the ~5 s and ~2 min thresholds.

**Seam:** `send`, `storage` and `clock` are injected. Production uses `fetch`, `localStorage` and `Date`, and tests use fakes. That's two adapters, so this is a real seam.

**`doorView` is pure.** It merges the server's state with the queued taps (counting each id once, so the phone's own queued kids aren't counted twice when they arrive), puts the ⏳ marks on Recent, and shows the golden banner only when the phone is connected **and** the outbox is empty.

**Tickets:** 17, 18, 19, 28.

---

## 6. Celebration director (TV)

```js
const director = createDirector({ clock, play })   // play(show) renders it and cues sound
director.push(moments, kid?)                        // from kid.added / moment deltas
director.overlay(show)                              // soundboard, new-costume banner: bypass the queue
```

**Hidden:** the priority order (golden > beat last year > every 100th > every 50th > pop), merging pops inside the window with the ~3 s cap, rule that milestones never merge, takeovers waiting their turn, and the quiet roll-up for late kids.

**Tests:** a fake clock and a recording `play` cover them, with no DOM needed.

**Tickets:** 20, 27, 28, 29, 31, 32, 36 (a straggler pop, then back to the recap).

---

## 7. Sound engine (TV)

```js
const sound = createSound(slots)          // file per slot; missing → generated fallback
sound.unlock() / sound.running            // drives "Start the night"
sound.cue(name, opts?)                    // 'bloop' | 'pop-scale' {n} | 'sting:50' | 'takeover'
                                          // 'golden' | 'ding' | 'tick' | 'close' | 'board:<1–6>'
sound.mix({ volume, mutes })              // from settings deltas
```

**There's no public `duck`.** Each cue knows its category, and the engine handles every mixing rule itself:

- ducking the ambience under celebrations
- the soundboard ducking the automatic sounds
- golden plays alone
- the 3–4 voice cap
- lowering bloop volume as the arrival rate climbs
- the keep-alive while ambience is muted
- the closing sting followed by the ~5 s fade

Callers learn one verb, and the mixing rules live in one file.

**Tickets:** 25, 26, 27, 28, 31, 32, 35, 38.

---

## 8. Shallow traps

Patterns that would spread the rules around. Avoid them:

- **One endpoint with its own SQL per ticket.** Golden and milestone logic ends up copied across tap, backfill and release. Every write goes through `ledger.apply`.
- **The TV working out milestones or golden wins from the count.** It breaks "once per event" on reload and repeats the fired-moments logic.
- **Ghost or Clock shift maths written inline** in the chart, the teaser, the backfill grid or the Release gate. Import [night maths](#3-night-maths-shared).
- **Tag colours defined separately** on the phone tiles, the leaderboard and the pumpkins. Use `tagColour(order)`.
- **Phone screens reading localStorage or the snapshot directly.** Go through `doorView`.
