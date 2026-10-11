# Public host on the shared Caddy

Type: task (HITL)
Status: ready-for-agent
Blocked by: 34

## What to build

LXC 118 grows, and Count Dracula gets its public name on the shared Caddy, with its own masked access log. See [spec §15 Hosting](../spec.md#15-hosting-capacity-and-abuse) and [§16](../spec.md#16-privacy-and-retention). These are changes to shared infrastructure, so each step needs the user's OK.

**Don't route the public host to LXC 118 while it still runs v1** (open reads, a 4-digit PIN). Prepare everything now; **switch the host on during [Open sign-up](38-open-sign-up.md) step 2**, right after v2 is deployed.

**Now**

1. `pct set 118 --cores 2 --memory 1024`.
2. Write the Count Dracula site block, keeping it out of the repo if it carries the real name (or committed with `count-dracula.example.com` and filled in from `local.env`). It has:
   - `stream_close_delay 10m`
   - `request_body` with `max_size 64KB`
   - **its own access log:** `roll_keep_for 720h` and a size cap
   - **token masking** in logged paths and queries: `/tv/k/<token>`, the Night summary share path, and the `key=` (and any other token) query parameters become `REDACTED`. Match the URL shapes the app actually uses ([spec §21](../spec.md#21-builders-latitude))
3. Confirm Caddy passes **`CF-Connecting-IP`** from Cloudflare's ranges to the app.

**On opening day (ticket 38 step 2)**

4. `host-public.sh add` the real `PUBLIC_HOST` with the block above, under the existing Cloudflare-proxied wildcard.
5. Check: SSE stays up past Cloudflare's ~100 s idle cut, a TV-link token shows `REDACTED` in the log, and a 100 KB POST is refused.

## Acceptance criteria

- [ ] LXC 118 has 2 cores and 1 GB
- [ ] The site block is written and reviewed by the user, with `stream_close_delay`, `request_body`, its own log and the masking rules
- [ ] `CF-Connecting-IP` reaches the app with the visitor's IP
- [ ] (Opening day) The public host serves v2; a stream lives past 100 s; a TV-link token, a share token and `key=` show as `REDACTED`; a 100 KB body is refused
