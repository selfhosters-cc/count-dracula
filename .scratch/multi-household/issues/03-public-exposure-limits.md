# Public exposure: abuse protection and live-connection capacity

Type: research (AFK)
Status: open
Blocked by:

## Question

What does going from a LAN app to an open public site cost us in protection and capacity?

- **Live connections**: how many concurrent SSE connections one Bun process can hold, and what limits bite first (file descriptors, memory per connection, idle timeouts on Bun's server and on Caddy as a reverse proxy). Check how the current hub (`server/hub.js`) fans out and what it would cost if a TV link went viral (say 1,000 viewers of one household, or 200 households × 5 viewers).
- **Bot sign-ups**: free challenges that work without npm dependencies (e.g. Cloudflare Turnstile, hCaptcha, simple proof-of-work, email verification alone), their privacy terms and setup effort.
- **Rate limiting** in Bun with no library, and what Caddy can do in front (its `rate_limit` is a plugin, not built in; confirm).
- **SQLite as a shared multi-household store**: WAL write throughput for bursts of taps from many households at 7pm, and backup approaches for a live database (`VACUUM INTO`, the backup API).

Findings go to `research/03-public-exposure-limits.md`, every claim cited to a primary source.
