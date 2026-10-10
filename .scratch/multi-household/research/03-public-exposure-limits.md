# Public exposure: abuse protection and live-connection capacity — findings

Ticket: [03-public-exposure-limits](../issues/03-public-exposure-limits.md) · researched 2026-10-10 · feeds [11 Public hosting and abuse](../issues/11-public-hosting-and-abuse.md)

Placeholder public host throughout: `count-dracula.example.com`. Product decisions (caps, which challenge, `synchronous` setting) are left to the grilling ticket; this file recommends only.

Measurements marked **[M]** were taken on 2026-10-10 on the dev box: Intel Xeon E5-2643 v3, 20 threads, ext4 on `/dev/sda1`, Bun 1.4.2, SQLite 3.53.2 (as bundled in `bun:sqlite`). They ran the **unchanged** `server/app.js` / `server/hub.js` / `server/ledger.js` from `main` (8c72efa), on loopback, with the load client in a separate process. The method is in the [appendix](#appendix-measurement-method). The production LXC 118 is **1 core / 512 MB on ZFS (`zstorage2`)** (`deploy/README.md`), so treat dev-box numbers as an upper bound and re-run the scripts there before freeze.

---

## Bottom line

**Expected ceilings (one Bun process, today's code):**

- **Memory does not set the limit for healthy SSE viewers.** Each connection costs about 3–10 KB of RSS: 1,000 viewers took the server to 56 MB, and 20,000 viewers to 150 MB **[M]**. File descriptors do not set it either: Bun raises its soft `RLIMIT_NOFILE` to the hard limit, which is 524,288 under systemd **[M + systemd source]**. Bun's 10 s idle timeout is already turned off per stream by `hub.js` (`server.timeout(req, 0)`). Caddy's reverse proxy has no default read, write or stream timeout **[Bun docs, Caddy docs]**.
- **CPU is what limits viewers, and it is spent in two places:**
  1. **Fan-out on the write path.** `publish()` runs inside the `POST /api/taps` handler, so the porch phone waits for every viewer to be written to. Measured cost: one tap reached 1,000 viewers in 37 ms, 5,000 in 94 ms, 10,000 in 234 ms and 20,000 in 375 ms **[M]**. Under sustained taps, 2,000 viewers held the server to about 41 taps/s, with a median POST latency of 227 ms **[M]**.
  2. **One full snapshot per connect.** Each new viewer costs about 0.9–1 ms of CPU at a 300-kid night with a 52 KB snapshot. Building the snapshot itself scales with the night's size: 8 ms at 2,000 kids, 50 ms at 20,000 kids **[M]**. A reconnect storm therefore costs about 1 s of CPU per 1,000 viewers.
- **Realistic Halloween load is small if fan-out is per household.** Our 2025 peak was 119 kids in 30 minutes (`config/2025-counts.json`), about 0.07 taps/s per household. Even 200 households is only about 13 taps/s site-wide. SQLite handles that with 10–300× headroom (below).
- **Three things break first, and none of them is raw capacity:**
  1. **Today's hub is global.** Every viewer gets every delta, so one household's TV would receive every other household's kids. That is a **privacy leak**, and the cost becomes taps/s × all viewers. Separately, the client reconnects on any gap in `seq`, and `seq` is one process-wide counter. Per-household channels that kept a global `seq` would make every TV reconnect on every other household's tap.
  2. **A viewer that stops reading is buffered without bound.** 2,000 non-reading viewers pushed server RSS from 91 MB to 578 MB over 1,000 taps **[M]**, which exceeds LXC 118's 512 MB.
  3. **`bun:sqlite` runs on the event loop.** With the default `synchronous=FULL`, write stalls of 1.7–4.2 s, probably checkpoint fsyncs, froze the whole server, SSE included. At 50 concurrent writers the p99 tap was 11.6 s **[M]**.
- **Suggested ceilings for the grilling ticket**, until they are re-measured on LXC 118. These are starting numbers, not decisions:
  - about **500 viewers per household**
  - about **3,000–5,000 SSE connections site-wide**
  - about **10–20 open streams per client IP**

**Cheapest protections that fit Oct 13–23** (all zero-dependency, roughly in order of value per hour):

1. **Per-household SSE channels with a per-channel `seq`**, plus a **stalled-client drop**. `controller.desiredSize` goes negative once a client stops draining **[M]**: close those clients and let EventSource reconnect them to a fresh snapshot.
2. **Caps in the hub:** connections per household, per IP and site-wide, answered with 429/503 when full.
3. **`PRAGMA synchronous = NORMAL`** in WAL mode. SQLite documents it as corruption-safe in WAL, and the cost is that the last commits can roll back after power loss **[SQLite pragma docs]**. It took the ledger from about 130–400 to about 4,000 taps/s and the worst stall from seconds to 66 ms **[M]**. This is a decision, because it changes durability.
4. **In-process token-bucket rate limits in Bun**, keyed on the client IP Caddy puts in `X-Forwarded-For`. They go on sign-up, email sends, taps per household and stream opens. About 40 lines of code with no library.
5. **Bot sign-ups:** **Cloudflare Turnstile (Managed mode) + email verification + the rate limits above.** Turnstile is free with no request cap, needs no npm package and does not require Cloudflare DNS or proxying. Two caveats: it sends visitor IP, TLS fingerprint and User-Agent to Cloudflare, and its `api.js` must be loaded from Cloudflare's URL, not vendored. A self-built SHA-256 proof-of-work is the no-third-party fallback (about half a day of work, weaker). hCaptcha's free tier fits worst: a 10k/month cap and image puzzles for most users.
6. **Caddy `rate_limit` is not built in.** It is the third-party module `mholt/caddy-ratelimit`, which needs a custom `xcaddy` / `caddy:builder` build of the **shared** Caddy (LXC 117). App-level limits in Bun are cheaper for this timeline. Caddy's built-in `request_body { max_size }` is a free extra.
7. **Backups:** run `VACUUM INTO '<file>'` from the Bun process on a timer. It produces a consistent snapshot of the live DB in about 21 ms for a 2.5 MB database **[M]**, needs no extra packages, and the copy is fsynced when `synchronous` is NORMAL or FULL **[SQLite docs]**. `bun:sqlite` has no backup-API binding.

---

## 1. Live connections

### 1.1 How the hub works today (`server/hub.js`, `server/app.js`, `public/live.js`)

- **One global hub for all clients.** `clients` is a single `Set` of stream controllers, and `publish(deltas)` writes every delta to every client (`hub.js` `publish`). Nothing scopes it to an event or household.
- **One snapshot per connect.** `attach()` calls `getSnapshot()`, which runs the full `ledger.snapshot()`, and enqueues it before adding the client (`hub.js` `attach`). Each connection gets its own `ReadableStream`. `send()` re-encodes the frame text for every client (`encoder.encode(text)` inside `send`), so one delta is UTF-8 encoded N times.
- **Fan-out is synchronous inside the write request.** Every `POST /api/*` handler calls `hub.publish(ledger.apply(...))` before returning (`app.js` `routes`). The tapping phone's response waits for the loop over all clients.
- **Idle timeouts are already handled.** `server.timeout(req, 0)` disables Bun's idle timer for that stream, and a named `ping` event goes to every client every 15 s (`hub.js`).
- **Client resync behaviour** (`public/live.js`):
  - It reopens the stream on any `seq` gap (`delta.seq !== live.state.seq + 1`) and on `event.switched` / `event.updated`.
  - It retries after a fixed `RETRY_MS = 2_000` with no jitter.
  - It sends no `retry:` field.
  - `seq` comes from a single process-wide counter (`ledger.js` `apply`: `seq: ++seq`).

### 1.2 Limits and what bites first

| Limit | Value | Source |
|---|---|---|
| Bun idle timeout | Default **10 s**, max 255, `0` disables. "The idle timer applies while a response is being streamed… If your stream goes quiet for longer than idleTimeout, Bun closes the connection mid-response." `server.timeout(req, 0)` is documented as the way to keep SSE alive. **Already handled** by `hub.js`. | [Bun HTTP server docs](https://bun.com/docs/api/http); [`serve.d.ts` `idleTimeout` @default 10](https://github.com/oven-sh/bun/blob/main/packages/bun-types/serve.d.ts) |
| Bun request body limit | `maxRequestBodySize` default **128 MB**. Set it far lower for a public site (tap bodies are under 200 bytes). | [`serve.d.ts`](https://github.com/oven-sh/bun/blob/main/packages/bun-types/serve.d.ts) |
| File descriptors | systemd's default for services is `LimitNOFILE=1024:524288`, i.e. soft 1,024 and hard 524,288. On this box `systemctl show` gives `DefaultLimitNOFILESoft=1024`, `DefaultLimitNOFILE=524288`. **Bun raises its soft limit to the hard limit at startup**: with `ulimit -Sn 1024`, Bun's `/proc/self/limits` showed 524,288 / 524,288 **[M]**. Bun's own test suite says "bun raises RLIMIT_NOFILE at startup". So the 1,024 default **does not bite**, and `count-dracula.service` needs no `LimitNOFILE=`. | [systemd `systemd-system.conf.xml`](https://github.com/systemd/systemd/blob/main/man/systemd-system.conf.xml) ("DefaultLimitNOFILE= defaults to 1024:&HIGH_RLIMIT_NOFILE;"); [bun `fs-stat-seccomp-linux.test.ts`](https://github.com/oven-sh/bun/blob/main/test/js/node/fs/fs-stat-seccomp-linux.test.ts) |
| Caddy fds | Caddy is written in Go. Since Go 1.19, programs "automatically increase the open file limit (RLIMIT_NOFILE) to the maximum allowed value". Caddy holds 2 fds per proxied viewer (client side + upstream). | [Go 1.19 release notes](https://go.dev/doc/go1.19) |
| Caddy → upstream timeouts | `read_timeout` and `write_timeout` default to "No timeout". `dial_timeout` defaults to 3 s. `stream_timeout` defaults to "no timeout". | [Caddy `reverse_proxy` docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) |
| Caddy client-side timeouts | `read_body`: no timeout. `read_header`: 1 m. `write`: no timeout. `idle`: 5 min, but that covers time "to wait for the next request when keep-alives are enabled", not an active stream. TCP keepalive interval is 15 s. | [Caddy global options](https://caddyserver.com/docs/caddyfile/options) |
| Caddy SSE buffering | SSE is flushed immediately: responses with `Content-Type: text/event-stream` are flushed to the client straight away. | [Caddy `reverse_proxy` docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) |
| **Caddy config reload** | Streams are "forcibly closed when the config is unloaded" unless `stream_close_delay` is set (default: no delay). Every reload of the shared Caddy (adding any other host) therefore **drops every viewer at once**, and they all reconnect about 2 s later. | [Caddy `reverse_proxy` docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) |
| Browser per-host limit | Without HTTP/2, SSE is limited to "6" connections "per browser + domain". Over HTTP/2 the stream limit is negotiated (default 100). Caddy serves HTTPS with HTTP/2, so this only matters on the LAN `http://…:3131` route. | [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) |
| Reconnect timing | The EventSource reconnection time is "initially an implementation-defined value, probably in the region of a few seconds". A server can set it with a `retry:` field. The HTML spec recommends a comment about every 15 s for proxies that "drop HTTP connections after a short timeout", which `hub.js` already does with `ping`. | [HTML spec §9.2 Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) |

### 1.3 Measured capacity [M]

All SSE runs used the real app on a 301-kid night (a 52 KB snapshot), with raw TCP clients that read promptly. RSS readings are cumulative on one server process; connections were closed between runs.

| Viewers | Server CPU to attach all | Server RSS after attach | One tap: POST returns / all viewers have the delta |
|---:|---:|---:|---:|
| 100 | 0.12 s | 45.8 MB | 6 ms |
| 1,000 | 0.94 s | 55.8 MB | 37 ms |
| 5,000 | 4.5 s | 72.5 MB | 94 ms |
| 10,000 | 9.4 s | 96.1 MB | 234 ms |
| 20,000 | 19.3 s | 149.9 MB | 375 ms |

Under sustained load, with 10 concurrent senders posting 1,000 taps:

| Condition | Taps/s | Median tap POST | p99 tap POST | Server RSS |
|---|---:|---:|---:|---|
| No viewers (DB on tmpfs) | 1,662–2,568 | 0.3–25 ms | 1–74 ms | flat |
| 2,000 viewers reading | **41** | **227 ms** | 522 ms | flat (68→62 MB) |
| 2,000 viewers **not reading** (paused sockets) | 84 | 34 ms | 490 ms | **91 → 578 MB** |

Two more measurements:

- **Stalled-client detection.** A `ReadableStream` response body served by `Bun.serve` to a paused client kept `controller.desiredSize === 1` until about 2.5 MB had been accepted by the kernel socket buffers (loopback), then went negative (−1,937, −3,937, …) **[M]**. So `desiredSize < -K` is a usable "this viewer has stopped reading" signal for dropping it. Real-network socket buffers are smaller, so it trips sooner.
- **Snapshot size grows with the night:**
  - 300 kids: 52 KB, about 1 ms to attach
  - 2,000 kids: 347 KB, 8 ms to build
  - 20,000 kids: 3.5 MB, 50 ms to build

### 1.4 The two scenarios in the ticket

The estimates below use about 20–25 µs of server CPU per viewer per tap (the 10k/20k rows) and about 1 ms per connect, on the dev box. Single-core LXC numbers will be worse, so re-measure there.

- **1,000 viewers of one household (a viral TV link):**
  - **Steady state:** a household peaks at about 0.07 taps/s (2025: 119 kids per 30 min). Even a burst of 5 kids in 10 s is about 0.5 taps/s × 1,000 viewers, roughly 10–20 ms of CPU per second. Fine.
  - **Porch phone latency:** each tap's POST waits about 37 ms for the fan-out. Fine.
  - **Reconnect storm:** a deploy, a Caddy reload or an `event.updated` settings save makes all 1,000 reconnect within about 2 s and costs about 1 s of CPU. Tolerable.
  - **Memory:** about 10 MB.
  - **The real risk is stalled phones.** A thousand phones with the tab backgrounded each hold every delta in server memory until the socket dies. *Inference:* this applies behind Caddy too, because Caddy opens one upstream connection per viewer and stops reading upstream when its client stalls, so the buffering lands in Bun. Needs a stalled-client drop.
- **200 households × 5 viewers (1,000 viewers total):**
  - **With per-household channels:** about 13 taps/s site-wide × 5 viewers is about 66 deliveries/s. Trivial.
  - **With today's global hub:** every tap goes to all 1,000 viewers, about 13,000 deliveries/s, or about 0.3 s of CPU per second on one core. It works, but every TV shows other households' kids.
  - **Global hub with per-household filtering but a global `seq`:** every viewer sees `seq` gaps on every other household's tap and reconnects (`live.js`), so this design must not ship.
- **The site-wide hot spot is connects, not taps.** Each connect builds a full snapshot. With bigger nights and many viewers, a deploy at 7 pm costs (viewers × snapshot build). *Option to raise the ceiling:* cache the serialized snapshot per household, invalidated on any delta, so N reconnects cost one build. Adding jitter to `RETRY_MS` and sending a `retry:` field would spread the storm out.

### 1.5 Alternative noted, not recommended for this timeline

Bun's WebSocket server has native topic pub/sub (`server.publish(topic, …)`, documented as "Publish a message to all WebSocket clients subscribed to a topic"). It also has built-in backpressure handling (`backpressureLimit`, `closeOnBackpressureLimit`) ([Bun HTTP docs](https://bun.com/docs/api/http); [`serve.d.ts`](https://github.com/oven-sh/bun/blob/main/packages/bun-types/serve.d.ts)). That would solve per-household topics and slow clients natively. However, v1's research rejected WebSockets because of reconnect code, and Caddy also force-closes WebSockets on reload ([`reverse_proxy` docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)). Rewriting the client in 13 build days is the wrong trade. Keeping SSE and adding per-household `Set`s plus a `desiredSize` check is smaller.

---

## 2. Bot sign-ups

Turnstile and hCaptcha need no npm package. Each is a `<script>` tag plus one server-side HTTPS POST, which Bun's built-in `fetch` does ([Bun fetch docs](https://bun.com/docs/runtime/networking/fetch)). Both, however, load a **third-party script that must not be vendored**, unlike `public/vendor/`. That is a decision for ticket 11.

### 2.1 Cloudflare Turnstile — recommended

- **No Cloudflare proxying needed.** It "can be embedded into any website without sending traffic through Cloudflare" ([Turnstile overview](https://developers.cloudflare.com/turnstile/)). Our own DNS and Caddy stay as they are.
- **Client.** Load `https://challenges.cloudflare.com/turnstile/v0/api.js` and add `<div class="cf-turnstile" data-sitekey="…">`. Explicit rendering via `?render=explicit` is also available. Inside a form, the widget adds a hidden `cf-turnstile-response` input. The script must be loaded from that URL: "Proxying or caching this file will cause Turnstile to fail" ([client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)).
- **Server.**
  - Send `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, optional `remoteip` and optional `idempotency_key`. Form or JSON bodies are both accepted.
  - Tokens are at most 2,048 chars and valid for **300 s**, and "Each token can only be validated once".
  - The response has `success`, `challenge_ts`, `hostname`, `error-codes`, `action` and `cdata`. Check `success` and that `hostname` is `count-dracula.example.com`.
  - Source: [server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- **Test keys** work on localhost: sitekey `1x00000000000000000000AA` always passes, and `2x…AB` always fails ([testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)).
- **Free plan:** up to 20 widgets, 10 hostnames per widget, and "Unlimited challenges (traffic or verification requests)" ([plans](https://developers.cloudflare.com/turnstile/plans/), verified directly).
- **Modes:** Managed (recommended; "no images or text to decipher"), Non-interactive, and Invisible. Invisible requires naming the Turnstile Privacy Addendum in your privacy policy ([widget types](https://developers.cloudflare.com/turnstile/concepts/widget/)).
- **Privacy:**
  - **Data collected:** the Turnstile Privacy Addendum (updated 2025-06-18) lists the signals as "client IP address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin".
  - **Cloudflare's role:** a processor for bot detection, and a controller (legitimate interest) for using the signals "to improve Turnstile". It says the signals are collected "not to identify, profile or target any individuals". No retention period is stated ([Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)).
  - **Form contents:** Turnstile "does not access, store, or transmit user communications, form entries, or other page inputs" ([overview](https://developers.cloudflare.com/turnstile/)).
  - **Cookies:** the 2022 launch post says it never "uses cookies to collect or store information" ([Cloudflare blog](https://blog.cloudflare.com/turnstile-private-captcha-alternative/)). *Not fully confirmed:* the FAQ mentions an opt-in pre-clearance cookie.
  - **Canadian law:** neither vendor page addresses PIPEDA.
- **Setup effort: about 6 steps, 1–2 h.**
  1. Create a Cloudflare account and a widget for the hostname.
  2. Put the keys in `deploy/local.env` or the config.
  3. Add the script and div to the sign-up form.
  4. Verify the token with one `fetch` in the sign-up handler.
  5. Test with the dummy keys.
  6. Add a privacy-notice line (ties into the map's "Privacy notice" item).

### 2.2 hCaptcha — poorer fit

- **Client and server.** Load `https://js.hcaptcha.com/1/api.js` with `<div class="h-captcha">`. Verify with `POST https://api.hcaptcha.com/siteverify`, **form-urlencoded only** ("Do not send JSON"). Tokens are single-use with a 120 s expiry. **localhost is prohibited** for testing ([hCaptcha docs](https://docs.hcaptcha.com/)).
- **Free tier.** "Free up to 10,000 requests per month" ([plans](https://www.hcaptcha.com/plans), verified directly; also Terms Customer Appendix §7, [terms](https://www.hcaptcha.com/terms)). "Free provides a classic CAPTCHA experience in which most users will generally see a challenge", and passive mode starts at Pro ([hCaptcha Pro](https://www.hcaptcha.com/pro), [pricing](https://www.hcaptcha.com/pricing)).
- **Privacy.**
  - **Data collected:** "mouse movements, scroll position, keypress events, touch events" plus IP and device data.
  - **Use of answers:** challenge answers feed a "market for Labeled Data" ([privacy policy](https://www.hcaptcha.com/privacy)).
  - **Aggregate data:** "Aggregate/De-identified Data may be used by IMI for any business purpose" ([terms §5](https://www.hcaptcha.com/terms)).
- **Verdict:** more telemetry than Turnstile, a monthly cap, and image puzzles for grandparents on Halloween.

### 2.3 Self-built proof-of-work — the no-third-party fallback

- **Building blocks.** `crypto.subtle.digest('SHA-256', …)` is "available only in secure contexts (HTTPS)" and in Web Workers, and has been Baseline since January 2020 ([MDN SubtleCrypto.digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)). Caddy's HTTPS satisfies the secure-context requirement. The LAN `http://` route would not.
- **Shape.** The server issues an HMAC-signed `{salt, difficulty, expiresAt}`. A Worker searches for a nonce with N leading zero bits. The server verifies the HMAC, expiry and one hash, then marks the salt used. That is about half a day of work with zero dependencies.
- **Off-the-shelf option.** ALTCHA (MIT) implements this and can be self-hosted as a single file. Its server library `altcha-lib` would be an npm dependency, so the verify step would have to be hand-ported ([altcha-org/altcha](https://github.com/altcha-org/altcha), [ALTCHA PoW docs](https://altcha.org/docs/integration/proof-of-work-captcha/)). ALTCHA itself rates SHA's resistance to hardware advantage as "Very Low".
- **What it buys.** OWASP files PoW under "Degradation": it raises the attacker's per-request cost but does not block ([OWASP Credential Stuffing Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)). Laurie & Clayton (WEIS 2004) argue PoW difficulty high enough to deter abusers burdens legitimate users ([“Proof-of-Work” Proves Not to Work](https://www.cl.cam.ac.uk/~rnc1/proofwork.pdf)).
- **Privacy:** none leaves our server. The cost is battery and CPU on slow phones.

### 2.4 Email verification alone

- **What OWASP says.** Bulk sign-up is OWASP OAT-019 "Account Creation" ([OWASP OAT-019](https://owasp.github.io/www-project-automated-threats-to-web-applications/assets/oats/EN/OAT-019_Account_Creation)). OWASP advises "multiple, layered defenses" and says rate limits and IP blocks should not be the only defence, because proxy networks evade them ([Credential Stuffing cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)). It treats CAPTCHA as "a defense-in-depth control" ([Authentication cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)).
- **What it stops** (*our reasoning; no primary source states it*). It proves inbox control and keeps unverified households off shared screens.
- **What it doesn't stop.** It doesn't stop a form flood or disposable domains. It also turns our server into a mail cannon aimed wherever the attacker chooses, which hurts sender reputation and can mail-bomb third parties.
- **Conclusion.** It needs a rate limit, and preferably a challenge, **before** any email is sent. Ticket 01 (sign-in and email) decides whether verification exists at all.

**Recommendation:** layer Turnstile (Managed), email verification and Bun rate limits on sign-up and email sends. If the third-party script is unacceptable, swap Turnstile for the PoW fallback.

---

## 3. Rate limiting

### 3.1 Caddy: `rate_limit` is a plugin, not built in — confirmed

- **It must be compiled in.** The module is `github.com/mholt/caddy-ratelimit`: "To build Caddy with this module, use xcaddy", e.g. `xcaddy build --with github.com/mholt/caddy-ratelimit`. The README states "This is not an official repository of the Caddy Web Server organization". It has no tagged releases ([mholt/caddy-ratelimit](https://github.com/mholt/caddy-ratelimit)).
- **What it does.** It uses a sliding-window algorithm (ring buffer per key) with zones, `key`, `events` and `window`. When the limit is hit it returns 429 and sets `Retry-After` (same source).
- **Getting it into our Caddy.** For a Docker-run Caddy, the official path is a two-stage `caddy:<version>-builder` image running `xcaddy build --with …` ([Docker Hub `caddy`](https://hub.docker.com/_/caddy)). `caddy add-package` exists but is marked "⚠️ Experimental" ([Caddy CLI docs](https://caddyserver.com/docs/command-line)).
- **Cost here.** LXC 117's Caddy is shared by other sites (`deploy/README.md`, caddy-int tooling). Swapping it for a custom build is a change to shared infrastructure in the middle of the build window.
- **What Caddy can do without a plugin:**
  - `request_body { max_size … }`: "Reads of more bytes will return an error with HTTP status 413" ([request_body](https://caddyserver.com/docs/caddyfile/directives/request_body)).
  - `max_header_size`, which defaults to 16 KiB ([global options](https://caddyserver.com/docs/caddyfile/options)).
  - Caddy can cap upstream connections with `max_conns_per_host` (default "No limit") ([reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)). That cap is global, though, not per client, so it is a blunt site-wide SSE cap at best.

### 3.2 In Bun, with no library — recommended

- **Finding the client IP behind Caddy.**
  - `server.requestIP(req)` exists ([Bun HTTP docs](https://bun.com/docs/api/http)), but behind Caddy it always returns Caddy's address.
  - Caddy "sets or augments the X-Forwarded-For header". With no `trusted_proxies` (the default: "By default, no proxies are trusted"), Caddy ignores incoming `X-Forwarded-*` values "to prevent spoofing" ([reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [global options](https://caddyserver.com/docs/caddyfile/options)). So the `X-Forwarded-For` Bun receives from Caddy is the real client IP.
  - **Trust it only when `server.requestIP(req)` is Caddy's own address.** Bun also listens on the LAN at `:3131`, where a client can send any `X-Forwarded-For` it likes.
- **Shape** (about 40 lines). Keep a `Map<key, {tokens, at}>` token bucket, refill on read, and sweep entries idle for more than 10 min on the existing 15 s heartbeat interval. Answer `429` with `Retry-After`. State is in-memory and resets on restart, which is acceptable for a one-process app.
- **Suggested starting limits** (for ticket 11 to accept or change):

  | What | Suggested limit | Why |
  |---|---|---|
  | Sign-up attempts | 5/hour per IP | Real households sign up once. |
  | Verification emails | 3/hour per address and 10/hour per IP | Stops the mail-cannon abuse. |
  | Taps, removes and soundboard | 10/s burst, about 3/s sustained, per household key | The real 2025 peak was 0.07/s. |
  | SSE opens | 20/min per IP | The client reconnects every 2 s at worst. |
  | Open SSE streams | 10–20 per IP, a per-household cap, a site-wide cap | See §1. |

- **Shared networks.** Many legitimate viewers can share one public IP (a school or a mobile carrier's CGNAT), so per-IP stream caps should be generous and per-household caps should do the real work. *Inference; not measured.*

---

## 4. SQLite as the shared multi-household store

### 4.1 What the docs say

- **One writer at a time.** "WAL provides more concurrency as readers do not block writers and a writer does not block readers… there can only be one writer at a time" ([SQLite WAL](https://www.sqlite.org/wal.html)). In one Bun process with one connection, the writes are serialized in JS anyway.
- **What `synchronous` controls.** "Writers sync the WAL on every transaction commit if PRAGMA synchronous is set to FULL but omit this sync if PRAGMA synchronous is set to NORMAL… the checkpoint is the only operation to issue an I/O barrier" ([WAL §2.3](https://www.sqlite.org/wal.html)).
- **NORMAL is safe from corruption.** "WAL mode is safe from corruption with synchronous=NORMAL… A transaction committed in WAL mode with synchronous=NORMAL might roll back following a power loss or system crash" ([PRAGMA synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous)).
- **Checkpoints.** SQLite checkpoints automatically when the WAL reaches 1,000 pages ([WAL §2.1](https://www.sqlite.org/wal.html)). Checkpoints are "slower than write transactions" (§2.3). Persistent overlapping readers can starve checkpoints so "the WAL file will grow without bound" (§6), though one process with short reads won't hit this.
- **`bun:sqlite` blocks the event loop.** "The API is synchronous" ([Bun SQLite docs](https://bun.com/docs/api/sqlite)), so a slow commit freezes every request and stream in the process. *The docs say "synchronous" but do not spell out the event-loop effect; the measurement below shows it.*
- **What the code does today.** `ledger.js` sets `PRAGMA journal_mode = WAL` and leaves `synchronous` at its default. **[M]** `PRAGMA synchronous` reads `2`, which is FULL.

### 4.2 Measured write throughput [M]

The ledger runs `ledger.apply({type:'tap'})` directly against a file DB in WAL; each tap is one transaction with several statements (`ledger.js` `addKid` + `referee`).

| Setting | Taps in one event | Taps/s | p50 | p99 | Worst |
|---|---:|---:|---:|---:|---:|
| `synchronous=FULL` (today) | 2,000 | 131 / 166 / 397 (3 runs) | 1.1–1.2 ms | 2.0–3.2 ms | **1.75 s / 1.96 s / 4.25 s** |
| `synchronous=NORMAL` | 2,000 | 4,081 | 0.18 ms | 0.49 ms | 66 ms |
| `synchronous=NORMAL` | 20,000 | 676 | 1.4 ms | 4.4 ms | 42 ms |

Over HTTP (`POST /api/taps` through `Bun.serve`, no viewers):

- **Disk DB, FULL:** 1 sender gave 465 taps/s. 50 concurrent senders gave **176 taps/s, p99 11.6 s**.
- **Same, DB on tmpfs** (fsync is free): 1 sender gave 2,051–2,568 taps/s (p99 under 1 ms). 50 senders gave 1,662 taps/s (p99 74 ms).

Notes:

- **The multi-second stalls are not raw fsync.** The same disk's plain `fsync()` measured p50 0.98 ms, p99 1.9 ms, worst 3.3 ms over 300 calls **[M]**. *Inference:* the stalls are the automatic checkpoint, fsyncing the main DB at the 1,000-page mark (the WAL was about 4 MB, i.e. 1,000 × 4 KB pages, when they occurred), plus ext4 journal contention on a busy shared disk. ZFS on LXC 118 will behave differently, so **re-measure there**.
- **Per-tap cost grows with the size of one event:** 0.18 ms at 2,000 kids versus 1.4 ms at 20,000. *Inference from the code:* each tap runs `COUNT(*)` over the event's kids (`liveCount`) and golden-ticket queries. Per-household events of about 300 kids stay in the fast regime, provided the multi-household schema indexes by household and event.
- **Needed versus available.** Peak need is about 13 taps/s for 200 households (about 66 taps/s for 1,000) against about 130–4,000 taps/s available. **Throughput is not the problem. Stall length is**, because a stall freezes every TV.

### 4.3 Backups of the live database

| Approach | What the docs say | Measured / effort |
|---|---|---|
| **`VACUUM INTO '/path/backup.sqlite'`** | "an alternative to the backup API for generating backup copies of a live database… the resulting backup database is minimal in size". The output "is a consistent snapshot of the original". The target file must not exist (or must be empty). The output is fsynced when the source's `synchronous` is NORMAL or FULL. By contrast, "the backup API uses fewer CPU cycles and can be executed incrementally". VACUUM INTO is not a write operation, so it does not need the write lock. Source: [SQLite VACUUM](https://www.sqlite.org/lang_vacuum.html). | **[M]** 6 ms for a 290 KB DB and **21 ms for a 2.5 MB DB** (20k kids), run from the Bun process on the same connection. One SQL statement with no dependency. Run it on a timer (e.g. every 15 min on Halloween night, nightly otherwise) into a dated filename, then prune. Note that it briefly blocks the event loop (21 ms is fine). |
| **Online backup API** | It copies incrementally, holding locks only while reading. If *another* connection writes mid-backup, it "usually restarts the backup process" and "may never run to completion" if restarted often enough. Writes through the *same* connection update the destination with no restart ([SQLite backup](https://www.sqlite.org/backup.html)). | `bun:sqlite` has no backup-API binding: the [docs](https://bun.com/docs/api/sqlite) list `serialize()` but no backup. It is reachable via the `sqlite3` CLI's `.backup FILE` ([CLI docs](https://www.sqlite.org/cli.html)), which means installing the Debian `sqlite3` package on the LXC (apt, not npm). A separate process is a different connection, so under constant writes it can restart. |
| **`db.serialize()`** | It returns the database as a `Uint8Array` ([Bun SQLite docs](https://bun.com/docs/api/sqlite)). | **[M]** 8 ms to serialize and write 2.5 MB. Holds the whole DB in memory, which is fine at this size. |
| **Proxmox vzdump of LXC 118** | It is already in the scheduled backup jobs (`deploy/README.md`). | It is a filesystem-level copy, not SQLite-aware. Keep it as the outer layer and take `VACUUM INTO` files inside the LXC so the vzdump contains a clean copy. |

**Recommendation:** use `VACUUM INTO` from the app on a timer, keep about 24 recent files plus nightly files, and let the existing vzdump carry them off the box. Restore is "stop service, copy file over, start". Rehearse it on Oct 24.

---

## Open items for the grilling ticket (11)

These are listed, not decided:

- **Viewer caps:** per household, per IP and site-wide, and what an over-cap TV sees.
- **Third-party challenge script:** Turnstile, which is not vendored and sends visitor IP and fingerprint to Cloudflare, or the PoW fallback. Either way the privacy notice needs a line.
- **`synchronous=NORMAL`:** accept losing the last few seconds of taps on a power loss in exchange for removing multi-second freezes.
- **Caddy reloads drop every stream:** set `stream_close_delay` on this site, or schedule no Caddy reloads on Oct 31.
- **Re-measure on LXC 118** with the appendix scripts before the Oct 24 rehearsal (1 core, ZFS).

---

## Appendix: measurement method

All scripts lived in the session scratch directory (not committed) and imported the repo's `server/app.js` / `server/ledger.js` unchanged.

1. **Server.** `startServer({ configPath, port: 4141 })` with a scratch `config.json`: `{ adminPin, port, dbPath, switches: {} }`. The DB was either a file on ext4 or `/dev/shm/…` for the "fsync is free" runs.
2. **SSE load.**
   - Seed 300 taps via `POST /api/taps`.
   - Record server `VmRSS` and `utime+stime` from `/proc/<pid>/{status,stat}`.
   - Open N raw TCP connections with `Bun.connect`, each sending `GET /api/stream HTTP/1.1`, and wait until every socket has seen `event: snapshot`.
   - Record RSS and CPU again.
   - POST one tap and time until every socket has seen `event: delta`.
3. **Sustained taps.**
   - C concurrent `fetch` workers send T taps; the script records taps/s and latency percentiles.
   - Optional V viewers are opened with `node:net`, either draining (`on('data')`) or `pause()`d to simulate a stalled phone.
4. **Ledger only.** `openLedger(new Database(file))`, then T × `apply({type:'tap'})` with per-call timing. The `synchronous` pragma was set after open for the NORMAL runs. After the taps, the script times `JSON.stringify(ledger.snapshot())`, `VACUUM INTO` and `Bun.write(file, db.serialize())`.
5. **`desiredSize` probe.** `Bun.serve` returns a `ReadableStream` body to a paused `node:net` client. The probe enqueues 254-byte SSE frames and samples `controller.desiredSize` every 2,000 frames.
6. **fd limit.** `ulimit -Sn 1024; ulimit -Hn 524288; bun -e` reading `/proc/self/limits`.
7. **Raw fsync.** 300 × (4 KB `writeSync` + `fsyncSync`) on the same filesystem.
