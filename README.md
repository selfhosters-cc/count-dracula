# 🧛 Count Dracula

A Halloween trick-or-treater counter for one household. Helpers at the door tap each kid in on their
phones. A TV facing the porch celebrates every kid live and races tonight's count against last year's.

![A night in progress, the door phone and the porch TV side by side: a helper taps costume tiles on the phone, and the TV counts each kid with a pop and confetti, the race against last year's ghost and the costume leaderboard moving. Kid #100 brings the giant headstone takeover, the phone warns that the next kid is golden, and kid #104 wins a golden ticket](docs/demo/demo.gif)

[▶ Watch in full quality (WebM)](docs/demo/demo.webm)

<p>
  <img src="docs/screenshots/phone.png" width="250" alt="The phone's counting screen: costume tiles, Undo, Recent, Teen and the big +1 Kid button">
  <img src="docs/screenshots/phone-new.png" width="250" alt="The + New costume sheet with an emoji picker and catch-up stepper">
  <img src="docs/screenshots/phone-sounds.png" width="250" alt="The soundboard page: six buttons that play on the TV">
</p>

## Features

### At the door (phones)

- **One big button.** "+1 Kid", or tap a **costume tile** to count the kid with their costume. Every tap
  flashes "#N" and buzzes.
- **+ New costume** on the spot, with **catch-up**: "how many did we already see?" re-tags the last few
  untagged kids, so a costume trend is never undercounted.
- **🧑 Teen**: counts the next kid but stops them winning a golden ticket. If a teen lands on a golden
  number, the ticket moves to a new random number further up.
- **Undo** and **Recent**: the last 10 kids from every phone, newest first, each with a ✕ to remove it.
- **Golden banner**: "⭐ NEXT KID IS GOLDEN — get the prize ready", and a strong buzz on the phone whose
  tap actually won.
- **Works offline.** Taps queue on the phone and send when the connection is back. Retries never
  double-count. After about 5 s an amber "⏳ N waiting to send" pill appears. If the server is down for
  more than 2 minutes, it adds "keep tapping, don't reload".
- **☰ Door menu**: TV volume and mutes (ambience, kid bloops, everything), release the remaining golden
  tickets (from 7:45pm), 🌙 End / Resume the night, and **Add a helper**: a QR code that joins a new phone
  without typing anything.
- **Soundboard**: swipe left (or use the 🔊 tab) for six buttons that play on the TV, with a 3 s cooldown
  shared across all phones.

### On the TV

- **The giant count**, which pops and throws confetti from the number for every kid. Several kids arriving
  together merge into one bigger pop.
- **The ghost race**: tonight's line against last year's dashed ghost line, with "👻 4 ahead of last year's
  ghost" under the count. The chart extends in place as kids arrive.
- **Rush meter**: kids per minute over the last 5 minutes, from quiet to 🔥 RUSH!
- **Costume leaderboard**: the top 5 costumes as bars that reorder when one overtakes another.
- **Pumpkin patch**: one pumpkin per kid, coloured by costume. Golden-ticket winners get a gold pumpkin.
- **Milestones**: a headstone rises for every 50th kid. #100, #200 and #300 get a full-screen takeover
  with a giant headstone.
- **Golden tickets**: secret numbers drawn at Go live, spread across the expected night. Nobody sees them,
  the family included. The winner gets a gold full-screen takeover.
- **Beat last year**: a takeover the moment tonight passes last year's total.
- **New costume spotted!**: a banner when a helper adds a new costume.
- **Idle teaser**: after 45 s with no kids, a quiet rotating line ("3 golden tickets still hidden — could be
  YOU!", "Next milestone: kid #150!").
- **Sound**: a bloop per kid that rises in pitch through a merged pop, stings for milestones, a fanfare
  for takeovers, quiet ambience all night. Every sound is CC0 or homemade
  ([public/sounds](public/sounds/README.md)).
- **Calm when the connection drops**: no error screens. A small "🦇 catching up…" chip appears, then the
  count rolls up quietly once it reconnects.
- **End-of-night recap**: the final count and verdict, the finished race, peak half-hour, biggest crew,
  costume of the night, and every golden number revealed. `/tv?event=<id>` shows any past night's recap.

| | |
|---|---|
| ![A golden ticket takeover: KID #278 WINS!](docs/screenshots/tv-golden.png) | ![The giant headstone for kid #300](docs/screenshots/tv-milestone.png) |
| ![The Ghost soundboard button: ghosts rise across the TV](docs/screenshots/tv-soundboard.png) | ![The end-of-night recap](docs/screenshots/tv-recap.png) |

### Near you: what the neighbourhood is up to

Every household counting on the same night adds to a shared picture, without anyone giving away where they live.

- **Opt in with a rough location.** A household picks its spot on a map in Setup (it's optional, and first-run
  offers a Skip). Only a cell a few kilometres across is stored: the exact point never leaves the phone. No
  location, no sharing.
- **"Near you" on the TV and phones**, refreshed every 10 minutes:
  - TV: *"🏘️ Near you tonight: ~90 kids in the last half hour · 14 houses counting · 🧙 Witch on top"*
  - door phone: *"🏘️ Near you: ~90 kids in 30 min · 14 houses"*
- **Totals only, never one house.** Kid counts are rounded to 5s and lag up to 10 minutes. A "house counting"
  is one that counted a kid in the last half hour. No place names, no map, no list. The top costume only shows
  when at least 3 houses counted it, and never a blocked word.
- **No minimum crowd, and no edges.** It shows as soon as one other house near you is counting. "Near you" is
  your area (about 20 × 25 km) plus the next one when you're close to its edge, so a town split by an area line
  sees the same figures on both sides.
- **Count Dracula tonight.** With no location, or nobody counting nearby, the phone shows the whole site's total
  instead (*"🎃 Count Dracula tonight: 212 houses · ~3,140 kids"*). The homepage shows it too: *"Counting now"*
  during a night, *"Last night"* until noon the next day. It's hidden below 5 houses.
- **The Night summary** keeps the neighbourhood's figures as they stood when your night ended.
- **Switches.** Whoever runs the site can turn nearby and the site-wide total off together (`"nearby": false` under
  `switches` in `config.json`), or just the edge-crossing (`"nearbyEdges": false`). Both are on by default.

### Setup (`/setup`, for a household's signed-in Managers)

- **Events**: create a night (copying last year's costumes), **Go live**, change the join key, view, export
  or delete past nights.
- **Per-night settings**: which past night to race against (or an expected number of kids), the number of
  golden tickets (default 5), a clock shift for daytime rehearsals, and the visit window. Add a golden
  ticket after Go live.
- **Costumes**: name, emoji and order (which sets the TV colour).
- **Night tools**: a printable **tally sheet** for when every phone is dead, and **➕ Add missed kids**
  to type the tallies back in afterwards. Each batch can be removed as a whole.
- **⬇ Export** a night as CSV: one row per kid plus half-hour counts, in the same shape next year's
  ghost reads.

<img src="docs/screenshots/setup.png" width="640" alt="The Setup page: the live event, its settings and costumes">

<p>
  <img src="docs/screenshots/phone-menu.png" width="250" alt="The phone's ☰ door menu">
</p>

## Install with Docker Compose

The quickest way to run your own: one container for the app, a volume for its database, and an optional Caddy in
front for HTTPS. You need a host name that points at the machine, and a Google sign-in client: sign-in needs
HTTPS, and the session cookie is HTTPS-only.

1. **A Google sign-in client.** In the [Google Cloud console](https://console.cloud.google.com/) → Google Auth
   Platform → Clients, create a *Web application* client with the authorized redirect URI
   `https://<your host>/auth/google/callback`. Only `openid email profile` is used, so no app review is needed.
   While the consent screen is in *Testing*, only the test users you list can sign in; publish it to open up.
2. **Configure it.**

   ```bash
   git clone https://github.com/selfhosters-cc/count-dracula.git && cd count-dracula
   cp docker/.env.example .env      # then fill in .env (git ignores it)
   ```

   | Setting in `.env` | What it's for |
   |---|---|
   | `PUBLIC_HOST` | The host name people open, e.g. `count-dracula.example.com` |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 1 |
   | `OPERATOR_EMAILS` | Your sign-in email: it also opens `/operator`, the whole-site dashboard |
   | `OPERATOR_CONTACT` | The contact address on `/privacy` and "Help: email us" |
   | `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` | Optional *Continue with email*: an SMTP server on port 25 with no TLS or login, such as a relay on your network. Leave `SMTP_HOST` empty to hide it |

3. **Start it**, one of two ways:
   - **With the bundled Caddy for HTTPS.** Point the host's DNS at this machine and open ports 80 and 443; Caddy
     gets and renews the certificate itself.

     ```bash
     docker compose --profile https up -d
     ```

   - **Behind your own reverse proxy.** The app listens on `127.0.0.1:3131`. Proxy your HTTPS host to it, set the
     `CF-Connecting-IP` header to the visitor's address (rate limits use it), and don't buffer responses: the TV
     and phones keep a live stream open. For nginx: `proxy_set_header CF-Connecting-IP $remote_addr;
     proxy_buffering off; proxy_read_timeout 1h;`. A proxy on another machine: set `COUNT_DRACULA_BIND=0.0.0.0`.

     ```bash
     docker compose up -d
     ```

4. **Open `https://<your host>/`** and press **Continue with Google**. Your first sign-in makes your household
   and a live *Test night*; Setup walks you through naming it, its location and pairing the TV.

**Your data** lives in the `count-dracula-data` volume: the SQLite database, a nightly backup in `backups/`, and
`config.json`, written on first start (feature switches, the soundboard; edit it and `docker compose restart`).
To copy the latest backup out:

```bash
docker compose cp count-dracula:/data/backups ./count-dracula-backups
```

**Upgrading:** `git pull && docker compose up -d --build`. The database is migrated on start; copy a backup out
first.

## Running it from source

Needs [Bun](https://bun.sh). There are no npm dependencies: the browser libraries (Chart.js, Motion,
canvas-confetti, qrcode-generator, the fonts) are vendored in `public/vendor/`, so nothing loads from a
CDN on the night.

```bash
cp config/config.example.json config/config.json
bun start                                          # prints the TV and phone URLs
bun test
```

- **Phone**: `http://<host>:3131/door?key=<join key>` (the server prints it), or enter the code on the homepage.
- **TV**: `http://<host>:3131/tv`. Click **Start the night** once to turn the sound on. `/tv?border`
  checks for overscan.
- **Setup**: `http://<host>:3131/setup`. Google sign-in needs HTTPS and its environment (see `docker/.env.example`).

`config/config.json` holds the port, the database path, the six soundboard slots and a switch for each fun feature (milestones,
golden tickets, leaderboard, new-costume alert, soundboard, pumpkin patch, recap, rush meter).

### How we deploy ours

Our own site runs in a Proxmox LXC under systemd, behind Cloudflare and a shared Caddy. The scripts for that live in
`deploy/`, and every address and secret they need comes from `deploy/local.env`, which git ignores
(`deploy/local.env.example` lists them). See [deploy/README.md](deploy/README.md) and the night-of
[RUNBOOK](deploy/RUNBOOK.md).

```bash
deploy/create-lxc.sh       # once: creates the LXC
deploy/deploy.sh           # runs the tests, ships the checkout, restarts, checks it answers
deploy/deploy.sh --rollback
```

### The TV laptop

[kiosk/README.md](kiosk/README.md) covers keeping the laptop awake, a one-command Chrome kiosk launcher
for CachyOS or Windows (which also keeps sound on after a reload), overscan and HDMI sound.

## How it fits together

```
door phones ──POST taps (+ join key)──▶ Bun server ──SSE: snapshot, then numbered deltas──▶ TV + phones
(offline outbox in localStorage)        bun:sqlite (WAL)
```

- `server/`: the HTTP app, the **Ledger** (every write goes through `apply()`, every read through
  `snapshot()`) and the SSE hub.
- `shared/night-maths.js`: pace, the ghost curve, the leaderboard, rush, recap stats. Shared by the server,
  the TV and the tests.
- `public/`: the door phone (`door.html` on `/door`), the TV (`tv.html`), Setup and the tally sheet. Plain ES modules, no
  build step.

The full spec, with the reasoning behind each decision, is in
[.scratch/count-dracula/spec.md](.scratch/count-dracula/spec.md).
