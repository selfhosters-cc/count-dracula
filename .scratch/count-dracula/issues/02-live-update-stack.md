# Live-update stack

Type: research (AFK)
Status: open
Blocked by:

## Question

What are the realistic options for a tiny self-hosted app where several phones send tap events and one TV browser shows them within ~200ms? Compare:

- Transport: Server-Sent Events vs WebSockets vs a hosted realtime service (only as a contrast — self-hosting is preferred).
- A single-process server + storage shape (e.g. Node/Bun + SQLite) that keeps Events, Kids, Tags durable across restarts.
- Phones on flaky porch Wi-Fi: reconnect behaviour, optimistic UI, queueing taps while offline, idempotent submits so retries don't double-count.
- TV reconnect: rebuilding full state after a dropped connection.
- Which stacks make the animated TV display easiest (framework + chart/animation library) without a heavy build.

Output: a short comparison and a recommended default, for the Hosting and phone access ticket and the final spec to build on.
