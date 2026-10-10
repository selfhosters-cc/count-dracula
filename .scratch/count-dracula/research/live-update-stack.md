# Research: Live-update stack

Answers [ticket 02](../issues/02-live-update-stack.md), researched 2026-10-10. `[n]` cites the sources below; *(judgement)* marks opinion.

## 1. Transport: SSE + POST, not WebSockets

Taps are rare and each needs an acknowledgement. Fan-out to the TV and phones is one-way. That points to **POST for taps, Server-Sent Events (SSE) for fan-out.**

- **SSE reconnects on its own.** The server can set the delay with `retry:`. On reconnect the browser sends `Last-Event-ID` with the last `id:` it saw [1].
- **Keep-alive.** The spec warns that proxies drop idle connections and recommends a `:` comment line about every 15 s [1].
- **Caddy needs no config for SSE.** It flushes `text/event-stream` responses immediately, whatever `flush_interval` says [2].
- **The 6-connection limit** applies per domain over HTTP/1.1 only [3]. Each device here opens one tab, so it doesn't matter.
- **WebSockets** are proxied fine [2], and Bun has built-in pub/sub [6]. But Caddy **force-closes them on config reload** unless `stream_close_delay` is set [2], and reconnect and resume logic is yours to write. *(judgement)* That's extra code for nothing.
- **Hosted realtime** (Ably, Supabase): *(judgement, not researched)* needs internet and an account. Rejected.
- **~200 ms target:** *(judgement, unverified)* LAN POST plus an in-process broadcast should take tens of ms. Measure it at the rehearsal.

## 2. Server + storage

**One process, one SQLite file, static files served by the same process.**

- **Bun:** `bun:sqlite` is built in and synchronous, and Bun recommends `PRAGMA journal_mode = WAL` [7]. `Bun.serve` covers HTTP (and WebSockets) [6]. No npm dependencies.
- **Node:** `node:sqlite` only reached "Release candidate" in v25.7 [4], and v26 is not yet LTS [5]. *(judgement)* Bun is the shorter path.
- **Tables:** `events(id, name, is_live)`, `tags(id, event_id, label, emoji, colour)`, `kids(id TEXT PK, event_id, tag_id, phone_id, tapped_at, received_at, deleted_at)`, and `ghost_buckets(event_id, slot, count)`.
- **Soft deletes** make Undo idempotent. Catch-up is one `UPDATE … WHERE tag_id IS NULL ORDER BY tapped_at DESC LIMIT N`.
- **Event log:** an in-memory `seq`, sent as SSE `id:`.

## 3. Phone taps: idempotent and offline-tolerant

1. **The phone creates the ID.** On a tap it generates a UUID, saves `{id, tagId, tappedAt}` to a `localStorage` outbox, bumps the count optimistically, then POSTs.
2. **The server dedupes.** It runs `INSERT … ON CONFLICT(id) DO NOTHING` (UPSERT, SQLite ≥ 3.24 [8]). It returns 200 either way and only broadcasts new rows, so retries never double-count.
3. **Flush loop.** The phone retries on a timer, on `online` and on `visibilitychange`, and drops entries once acknowledged. Undo is `DELETE /kids/:id`, which is idempotent, or just removes the kid from the outbox if it hasn't been sent.
4. **No Background Sync.** MDN marks it "Limited availability… not Baseline" [9]. Keep everything in-page.
5. **Secure-context trap.** Over plain `http://` on the LAN, `crypto.randomUUID()` is unavailable [10], but `crypto.getRandomValues()` works [11]. Build UUIDs from the latter, so the app works whatever ticket 08 decides about HTTPS.
6. **Timestamps.** Chart by the phone's `tapped_at` so a queued tap lands in the right bucket, and keep `received_at` too. *(judgement)* A tap that arrives more than about 10 s late gets a quiet tick-up, not a "You're kid #57!" moment.

## 4. Rebuilding TV state after a reconnect

*(judgement)* **Every SSE connection opens with a full `snapshot`.** It holds the live event, its tags, its kids, the ghost buckets and the current `seq`. Deltas follow (`kid.added`, `kid.removed`, `kid.retagged`, `tag.added`, `event.switched`), each with `id: <seq>`.

- At a few hundred rows this is cheap, simpler than `Last-Event-ID` replay [1], and survives restarts.
- **The TV never celebrates a snapshot**, only deltas. Otherwise a reconnect would re-fire every celebration.
- Phones use the same stream for Recent and tags.
- **Bun gotcha:** `Bun.serve` closes connections after **10 s idle** by default, which kills quiet streams. The fix is `server.timeout(req, 0)` per SSE request [12], plus the heartbeat.

## 5. TV display

*(judgement)* No framework and no build step. Use vanilla ES modules, with libraries **vendored locally** so the night doesn't depend on a CDN.

- **Chart.js:** animates data updates by default (1000 ms, `easeOutQuart`) [13]. Two line datasets, tonight vs the ghost, give the race look. Style it per the `dataviz` skill.
- **Motion** `animate()`: 2.3 kB mini build with springs [14], loadable as plain ESM [15]. Use it for the "kid #57" pop.
- **canvas-confetti:** emoji confetti via `confetti.shapeFromText({ text: '🎃' })` [16].
- **If phone state gets messy:** add Preact + htm via an import map.

## Recommended default

**Bun + `bun:sqlite` (WAL) in one process. Taps are POSTs with client-generated IDs, deduped with `ON CONFLICT DO NOTHING`. One SSE stream opens with a full snapshot, then sends seq-numbered deltas. The TV and phones are vanilla ES modules, with Chart.js, Motion and canvas-confetti vendored.** Runs under systemd in an LXC behind Caddy.

### Risks

1. **Silent SSE death** from Bun's idle timeout [12] or a proxy [1]. Mitigation: `server.timeout(req, 0)`, a 15 s heartbeat, and a "reconnecting" badge on the TV after 30 s with no heartbeat.
2. **Late taps after a Wi-Fi drop.** Counts stay correct, but numbering and celebrations can look odd. Mitigation: quiet catch-up, and an airplane-mode test at the rehearsal.
3. **Missing secure-context APIs over HTTP** [10][11]. Mitigation: don't depend on `randomUUID`, service workers or Background Sync.
4. **Animation pile-ups.** A visit of 5 kids stacks 1000 ms transitions [13] plus confetti. Mitigation: a TV celebration queue that merges bursts into one "+5!" moment.
5. **Single point of failure** (one process, one file, one laptop). Mitigation: systemd `Restart=always`, a periodic `.db` copy, and laptop sleep disabled (ticket 03).

## Sources

1. WHATWG HTML, Server-sent events <https://html.spec.whatwg.org/multipage/server-sent-events.html>
2. Caddy `reverse_proxy` <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>
3. MDN, EventSource <https://developer.mozilla.org/en-US/docs/Web/API/EventSource>
4. Node.js v26, `node:sqlite` <https://nodejs.org/api/sqlite.html>
5. Node.js releases <https://nodejs.org/en/about/previous-releases>
6. Bun WebSockets <https://bun.com/docs/runtime/http/websockets>
7. Bun SQLite <https://bun.com/docs/runtime/sqlite>
8. SQLite UPSERT <https://sqlite.org/lang_upsert.html>
9. MDN, Background Synchronization API <https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API>
10. MDN, `randomUUID()` <https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID>
11. MDN, `getRandomValues()` <https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues>
12. Bun HTTP server <https://bun.com/docs/runtime/http/server>
13. Chart.js animations <https://www.chartjs.org/docs/latest/configuration/animations.html>
14. Motion `animate()` <https://motion.dev/docs/animate>
15. Motion quick start <https://motion.dev/docs/quick-start>
16. canvas-confetti <https://github.com/catdad/canvas-confetti>
