# Walking skeleton: one tap reaches the TV

Type: build (AFK)
Status: ready-for-agent
Blocked by:

## What to build

The thinnest end-to-end path through the whole system. A helper taps "+1 Kid" on a bare phone page and a bare `/tv` page's count goes up live. Behind it is the real server shape from [spec §3](../spec.md#3-architecture-and-hosting): one Bun process with `bun:sqlite` in WAL mode serving the static files, with no npm dependencies on the server.

The server stores **events**, **ghost_buckets**, **tags** and **kids**, with the columns that §3 "Data the server stores" lists (the other tables come with their features). On first install it creates the "Rehearsal" event and makes it **live** with a random **join key**. It also seeds the counts-only "Halloween 2025 (counts)" event from a JSON file holding the five buckets in [data/2025-counts.md](../data/2025-counts.md).

At startup the server reads the **server config file**: the admin PIN, the Must 3–9 **feature switches** (all default on, exposed to clients in the snapshot so each later feature can honour its own switch), the soundboard slot labels/files, and the path to the ghost seed.

Taps are POSTs that carry the join key and a phone-generated `{id, tagId, tappedAt, phoneName}`. The server runs `INSERT … ON CONFLICT(id) DO NOTHING`, stores `received_at`, assigns the **kid number** (the live non-deleted count at arrival, stored once and never rewritten, see [§2](../spec.md#2-domain-model)), returns 200 either way, and broadcasts only new rows.

Each device opens one SSE stream: a full snapshot (live event, tags, kids, ghost buckets, settings, current `seq`), then `id: <seq>` deltas (`kid.added` here). Use `server.timeout(req, 0)` and send a `:` heartbeat every 15 s.

**Modules:** [Ledger](../modules.md#1-ledger-server), [SSE hub](../modules.md#2-sse-hub-server), [Live state](../modules.md#4-live-state-phone--tv), [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] A fresh database ends up with "Rehearsal" live (exactly one live event) and the 2025 counts-only event holding 346 kids across five buckets
- [x] Writes without the right join key are rejected; reads (snapshot/SSE) need no key
- [x] POSTing the same tap ID twice stores one kid, returns 200 both times and broadcasts once
- [x] Kid numbers equal the live count at arrival, with tests covering an undone kid's number being reused by the next arrival
- [x] The phone page's "+1 Kid" bumps the `/tv` count live, and a TV that reconnects gets a fresh snapshot with the right count
- [x] The SSE connection survives more than 2 minutes idle (heartbeat plus timeout disabled)
- [x] Config file values (PIN, switches) are read at startup and the switches appear in the snapshot
- [x] Server-side tests cover idempotent insert, numbering and the snapshot shape
