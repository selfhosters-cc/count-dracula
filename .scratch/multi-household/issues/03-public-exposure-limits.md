# Public exposure: abuse protection and live-connection capacity

Type: research (AFK)
Status: resolved
Blocked by:

## Question

What does going from a LAN app to an open public site cost us in protection and capacity?

- **Live connections**: how many concurrent SSE connections one Bun process can hold, and what limits bite first (file descriptors, memory per connection, idle timeouts on Bun's server and on Caddy as a reverse proxy). Check how the current hub (`server/hub.js`) fans out and what it would cost if a TV link went viral (say 1,000 viewers of one household, or 200 households × 5 viewers).
- **Bot sign-ups**: free challenges that work without npm dependencies (e.g. Cloudflare Turnstile, hCaptcha, simple proof-of-work, email verification alone), their privacy terms and setup effort.
- **Rate limiting** in Bun with no library, and what Caddy can do in front (its `rate_limit` is a plugin, not built in; confirm).
- **SQLite as a shared multi-household store**: WAL write throughput for bursts of taps from many households at 7pm, and backup approaches for a live database (`VACUUM INTO`, the backup API).

Findings go to `research/03-public-exposure-limits.md`, every claim cited to a primary source.

## Answer

Resolved 2026-10-10 (AFK). Findings, with a citation on every claim and dev-box measurements marked [M]: [`research/public-exposure-limits:.scratch/multi-household/research/03-public-exposure-limits.md`](https://github.com/selfhosters-cc/count-dracula/blob/research/public-exposure-limits/.scratch/multi-household/research/03-public-exposure-limits.md) (`git show research/public-exposure-limits:.scratch/multi-household/research/03-public-exposure-limits.md`). The measurements ran on a dev box far faster than LXC 118 (1 core, 512 MB, ZFS); re-run the appendix scripts there before the Oct 24 rehearsal.

For [Public hosting and abuse](11-public-hosting-and-abuse.md) to decide:

- **Memory and file descriptors aren't the limit.** About 3–10 KB per SSE viewer (20,000 viewers ≈ 150 MB); Bun lifts its fd limit to 524,288 itself. Bun's idle timeout is already off per stream in `hub.js`; Caddy has no default stream timeouts.
- **CPU is.** Fan-out runs inside the tap request, so the porch phone waits on every viewer: 37 ms for 1,000 viewers, 234 ms for 10,000. Each connect builds a full snapshot (~1 ms at 300 kids), so a reconnect storm costs ~1 s of CPU per 1,000 viewers.
- **Three things break before capacity does:**
  - the hub is global, so every TV would get every household's kids (a privacy leak);
  - `seq` is one process-wide counter, so per-household streams sharing it would reconnect on other households' taps;
  - viewers that stop reading are buffered without limit (2,000 of them took RSS from 91 MB to 578 MB, past the LXC's 512 MB).
- **SQLite:** peak need is ~13 taps/s for 200 households. The default `synchronous=FULL` stalled the whole process for 1.7–4.2 s; `synchronous=NORMAL` in WAL (corruption-safe, last commits can roll back on power loss) gave ~4,000 taps/s and a worst stall of 66 ms. A durability decision.
- **Cheapest protections for Oct 13–23, all dependency-free:** per-household SSE channels with their own `seq`; drop stalled viewers (`desiredSize` < 0); caps per household / per IP / site-wide (starting points ~500, 10–20, 3,000–5,000); an in-process token bucket keyed on Caddy's `X-Forwarded-For`; a timed `VACUUM INTO` backup (21 ms for 2.5 MB).
- **Caddy `rate_limit` is a third-party plugin** (needs a custom build of the shared Caddy), so limit in the app.
- **Bot sign-ups:** Cloudflare Turnstile (Managed) + email verification + rate limits. Free, uncapped, no npm, no Cloudflare DNS. Catches: it sends IP, TLS fingerprint and User-Agent to Cloudflare, and its script can't be vendored. Fallback: a home-made proof-of-work. hCaptcha's free tier (10k/month, image puzzles) fits worst.
- **Open for 11:** the viewer caps; whether a third-party challenge script is acceptable; `synchronous=NORMAL`; Caddy reloads drop every viewer at once unless `stream_close_delay` is set or Caddy isn't reloaded on Oct 31.
