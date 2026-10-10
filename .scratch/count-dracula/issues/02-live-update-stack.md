# Live-update stack

Type: research (AFK)
Status: resolved
Blocked by:

## Question

What are the realistic options for a tiny self-hosted app where several phones send tap events and one TV browser shows them within ~200ms? Compare:

- Transport: Server-Sent Events vs WebSockets vs a hosted realtime service (only as a contrast — self-hosting is preferred).
- A single-process server + storage shape (e.g. Node/Bun + SQLite) that keeps Events, Kids, Tags durable across restarts.
- Phones on flaky porch Wi-Fi: reconnect behaviour, optimistic UI, queueing taps while offline, idempotent submits so retries don't double-count.
- TV reconnect: rebuilding full state after a dropped connection.
- Which stacks make the animated TV display easiest (framework + chart/animation library) without a heavy build.

Output: a short comparison and a recommended default, for the Hosting and phone access ticket and the final spec to build on.

## Answer

Recommended default: **one Bun process with `bun:sqlite` (WAL)** in an LXC behind Caddy, serving the static files too. **Plain POST for taps, a single Server-Sent Events stream for fan-out.** WebSockets were rejected (more reconnect code, and Caddy closes them on reload).

- Phones generate kid IDs (from `crypto.getRandomValues`, which works over plain HTTP), queue taps in a localStorage outbox and retry. The server dedupes with `INSERT … ON CONFLICT DO NOTHING`. Undo is an idempotent soft delete.
- Every SSE connection opens with a full **snapshot**, then numbered deltas. The TV never celebrates a snapshot. Taps that arrive more than about 10 s late get a quiet tick-up, not a celebration.
- TV: plain ES modules, no build step. Chart.js for the race against the ghost line, Motion for the "kid #N" pop, canvas-confetti for bursts. All stored locally, no CDN.
- Risks: Bun's 10 s idle timeout on the stream (turn it off and send a 15 s heartbeat); late taps making numbering look odd; HTTP vs HTTPS feature gaps (goes to Hosting and phone access); a burst of kids piling up animations (queue them); one process, one file, one laptop.

Full findings: branch `research/live-update-stack` (commit `0a0e424`), file `.scratch/count-dracula/research/live-update-stack.md`.
