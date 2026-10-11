# Count Dracula runbook: opening day to Nov 1

Everything done by hand, in order. The plan behind it is [v2 spec §18](../.scratch/multi-household/spec.md#18-launch-and-the-night-runbook);
setting up and deploying is in [README.md](README.md). Commands run on the dev machine from the repo, unless they
say otherwise. `$PUBLIC_HOST` is the real host name from `deploy/local.env`; this file never names it.

```bash
source deploy/local.env       # once per shell, for $PUBLIC_HOST in the commands below
lxc() { ssh proxmox "pct exec 118 -- bash -c $(printf '%q' "$1")"; }   # a command on LXC 118
```

---

## 1. Opening-day checklist

Done in order. Sign-up opens at step 7.

### Step 1. `v1-final` and a copy of today's database

The tag is already pushed (on the last v1 code commit). Check it, then copy the v1 database and keep a copy here:

```bash
git ls-remote --tags origin v1-final                    # → the v1 commit (4f369ed…)
stamp=$(date +%Y%m%d-%H%M)
lxc "systemctl stop count-dracula && cp /var/lib/count-dracula/count-dracula.sqlite /var/lib/count-dracula/v1-final-$stamp.sqlite && systemctl start count-dracula"
ssh proxmox "pct pull 118 /var/lib/count-dracula/v1-final-$stamp.sqlite /tmp/v1-final-$stamp.sqlite" && scp proxmox:/tmp/v1-final-$stamp.sqlite ~/count-dracula-backups/ && ssh proxmox rm /tmp/v1-final-$stamp.sqlite
```

Practise the migration on that copy here (it's the ticket 17 check): a scratch copy opens as Household #1 with
"Halloween 2025 (counts)", the Rehearsal and its Race against.

```bash
cp ~/count-dracula-backups/v1-final-$stamp.sqlite /tmp/practice.sqlite
bun -e "
  import { Database } from 'bun:sqlite'; import { openLedger } from './server/ledger.js'
  const h = openLedger(new Database('/tmp/practice.sqlite'), {}).household(1)
  console.log(h.events().map((e) => [e.name, e.kids, e.live]), h.snapshot().ghost?.label, h.snapshot().timeZone)"
rm /tmp/practice.sqlite*
```

**`v1-final` is a rollback only until the first stranger signs up.** After that the tag and copy are kept, never used.

### Step 2. Deploy v2 and switch the public host on

1. `deploy/local.env` has all six keys (`cp deploy/local.env.example` if not; the Google ones from ticket 20).
2. Give LXC 118 its v2 size (once): `ssh proxmox pct set 118 --cores 2 --memory 1024`
3. `deploy/deploy.sh`. It copies the database, removes the v1 config's dead keys (and says so), writes
   `/etc/count-dracula/env`, and checks `/healthz`. The migration runs as the server starts.
4. Switch the public host on (ticket 35's prepared site block, on the shared Caddy, with the user's OK):
   `/opt/docker-compose/caddy-int/host-public.sh add "$PUBLIC_HOST" 192.168.5.31:3131`, then the block's own log,
   masking, `stream_close_delay 10m` and `request_body` as ticket 35 wrote them.
5. Check it's v2 and ours:
   - `https://$PUBLIC_HOST/healthz` says `ok`; `https://$PUBLIC_HOST/api/snapshot` says 403 (reads aren't open).
   - Sign in at `https://$PUBLIC_HOST/signup` → **Sign in with Google** with `HOUSEHOLD1_MANAGER_EMAIL`. `/setup` shows
     the live Rehearsal racing "Halloween 2025 (counts)" in America/Toronto.
   - Pair our TV: on the TV laptop open `https://$PUBLIC_HOST/tv`, type its code in `/setup` → **Pair a TV**.
   - Journald keeps 30 days: `lxc "systemd-analyze cat-config systemd/journald.conf | grep MaxRetentionSec"`.

### Step 3. Load check

See [section 2](#2-load-check). About 15 minutes. If it fails, lower the caps, redeploy, run it again.

### Step 4. Privacy checks

- `https://$PUBLIC_HOST/privacy` shows the real `OPERATOR_CONTACT`. Send a test email to it from another account;
  it arrives.
- A TV-link token is masked in the Caddy log. Open the TV link once, then on LXC 117 grep the Count Dracula access
  log (its path is in ticket 35's block) for `/tv/k/`: the token shows as `REDACTED`, and so does `key=`.
- OSM tiles load only after the tap: open `/setup` with the browser's network panel, filter `openstreetmap`: nothing
  until **Pick on a map**.

### Step 5. Publish the Google consent screen

Google Cloud console → **Google Auth Platform**:

1. **Clients** → the web client → Authorized redirect URIs has `https://$PUBLIC_HOST/auth/google/callback`.
2. **Branding** → app name "Count Dracula", privacy policy link `https://$PUBLIC_HOST/privacy`.
3. **Audience** → **Publish app** (from Testing to In production). Until now only the listed test users could sign in.

**This is the gate between deploying and opening.**

### Step 6. A test Household, end to end

With the second Google account, on a phone that has never opened the site, through the public URL:

1. Sign up, go through the 3 first-run screens.
2. Pair a second browser as its TV, by code, then again (after **Rotate TV link**) by scanning the QR.
3. In `/setup`, set its "Halloween 2026" **Goes live by itself at** to 10 minutes from now. Watch it go live, the TV
   following without a reload.
4. Leave it overnight. Next morning: it **ended at 3:00 am** by itself, and `/setup` says "Your night ended
   automatically at 3:00 am". (Before ticket 43 there's no summary link yet.)
5. **Delete my household**, typing its name. That tests the hard delete; `lxc "journalctl -u count-dracula | grep 'household deleted'"` shows one line.

This is the one place auto go-live and auto-end are tested before Oct 31.

### Step 7. Open sign-up

`https://$PUBLIC_HOST/operator` → **Open sign-ups** (if Pause sign-ups was on). **Sign-up is open.**

From here every deploy is fix-forward: `deploy.sh` copies the database first, and migrations only add.

---

## 2. Load check

On LXC 118, against a second, scratch instance on a spare port (never the real one, never through Cloudflare or
Caddy: the per-IP cap would stop it, and it's the server's CPU being measured):

```bash
lxc "cd /opt/count-dracula && /usr/local/bin/bun deploy/loadtest.js --port 3191"
```

It makes its own Households in a temp database, opens 200 TV-link viewers on one of them plus enough on others to
reach 3,000 streams, taps, and prints:

- **fan-out per tap** to the last of the 200: **pass under ~100 ms**
- **server RSS** with 3,000 streams: **pass under ~800 MB**

It refuses port 3131 and the real database, and deletes its scratch database when done. If either fails, lower the
caps in `server/guard.js` (`LIMITS`: `householdViewers`, `siteStreams`, `siteCeiling`) to what passes, commit,
redeploy, and run it again. (Dev box, Oct 11: 5 ms and 79 MB; LXC 118 is slower.)

---

## 3. Incident plan

| Scenario | First move |
|---|---|
| **Site down** | systemd restarts it by itself. `lxc "journalctl -u count-dracula -n 100"`; `lxc "systemctl status count-dracula"`; the `/operator` health strip once it's back |
| **Bad deploy** | `deploy/deploy.sh --rollback` (the previous build; the database isn't touched) |
| **Database file damaged** | Restore the newest backup, then re-delete (below). At most 15 minutes of taps are lost |
| **Overload** | Lower the caps in `server/guard.js` and redeploy (outside the freeze, unless the site is down). Phones keep priority by design |
| **Abuse** | `/operator` → find the Household → **Rename** (a bad name) or **Suspend** (a pattern). No warning step |
| **Suspected breach** | Wipe the sessions (every Manager signs in again), rotate every TV link and join key, rotate the Google client secret (below) |
| **Sign-up flood** | `/operator` → **Pause sign-ups** |
| **Access request by email** | [Section 4](#4-access-request) |

### Database file damaged

```bash
lxc "systemctl stop count-dracula"
lxc "ls -1t /var/lib/count-dracula/backups/ | head -3"                     # the newest copy, and its time (UTC)
lxc "cd /var/lib/count-dracula && mv count-dracula.sqlite damaged-\$(date +%s).sqlite && rm -f count-dracula.sqlite-wal count-dracula.sqlite-shm"
lxc "cp /var/lib/count-dracula/backups/<newest> /var/lib/count-dracula/count-dracula.sqlite && chown countdracula: /var/lib/count-dracula/count-dracula.sqlite"
```

**Then re-delete every Household deleted since the backup's time**, before starting. The ids are in the damaged
file's `deletions` table if it still opens, and in the journal either way (the backup's file name is its UTC time):

```bash
lxc "/usr/local/bin/bun -e \"const { Database } = require('bun:sqlite'); console.log(new Database('/var/lib/count-dracula/damaged-<time>.sqlite', { readonly: true }).query('SELECT household_id FROM deletions WHERE deleted_at > ?').all(Date.parse('<backup time, e.g. 2026-10-31T23:45:00Z>')))\""
lxc "journalctl -u count-dracula --since '<backup time, local>' | grep 'household deleted'"
lxc "cd /opt/count-dracula && /usr/local/bin/bun deploy/redelete.js /var/lib/count-dracula/count-dracula.sqlite <id> <id> …"
lxc "chown countdracula: /var/lib/count-dracula/count-dracula.sqlite* && systemctl start count-dracula"
```

### Suspected breach

```bash
lxc "systemctl stop count-dracula"
lxc "/usr/local/bin/bun -e \"const { Database } = require('bun:sqlite'); const db = new Database('/var/lib/count-dracula/count-dracula.sqlite'); db.exec('DELETE FROM sessions; DELETE FROM paired_devices'); const t = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'); const k = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join(''); for (const { id } of db.query('SELECT id FROM households').all()) db.query('UPDATE households SET tv_token = ?, join_key = ? WHERE id = ?').run(t(), k(), id)\""
lxc "systemctl start count-dracula"
```

Then a new client secret in the Google console (**Clients** → the web client → **Add secret**, delete the old one),
put it in `deploy/local.env`, and `deploy/deploy.sh`. Every TV shows pairing again and every phone needs a new join
link; every Manager signs in again.

---

## 4. Access request

Someone emails asking what we hold about them. Answer by hand, from their email:

```bash
lxc "cd /opt/count-dracula && /usr/local/bin/bun deploy/access-request.js /var/lib/count-dracula/count-dracula.sqlite 'them@example.com'"
```

It prints their Manager row, their Household (name, time zone, Location cell, dates) and its Events with kid counts,
phone names and costumes, as JSON. Paste the parts that are theirs into the reply. Display name, time zone and
Location they can fix themselves in `/setup`; deletion is **Delete my household** there, or `/operator` → Suspend
while it's sorted out by email.

---

## 5. Checked off production, on the dev box

### Restore drill (ticket 49, once, any time before Oct 31)

From the newest daily pull (it checks the off-box pull at the same time):

```bash
ls -1t ~/count-dracula-backups/count-dracula-*.sqlite | head -1            # pulled within the last day?
mkdir -p /tmp/restore-drill && cp "$(ls -1t ~/count-dracula-backups/count-dracula-*.sqlite | head -1)" /tmp/restore-drill/db.sqlite
echo '{ "port": 3192, "dbPath": "/tmp/restore-drill/db.sqlite" }' > /tmp/restore-drill/config.json
bun server/main.js /tmp/restore-drill/config.json &                         # "stop, copy into place, start"
curl -s localhost:3192/healthz                                              # ok
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('/tmp/restore-drill/db.sqlite', { readonly: true }); console.log(db.query('SELECT h.display_name, COUNT(k.id) AS kids FROM households h JOIN events e ON e.household_id = h.id LEFT JOIN kids k ON k.event_id = e.id AND k.deleted_at IS NULL GROUP BY h.id').all())"
kill %1 && rm -rf /tmp/restore-drill
```

The counts match what `/operator` showed at the copy's time.

### Nearby's ≥ 5 view (ticket 42)

On the dev box, `deploy/seed-nearby.js` makes 6 fake Households in one Area (dpz8), live on "Halloween 2026" with
recent taps: Witch everywhere, Bluey (the most kids, but only 2 Households) and a blocklisted name (3 Households).
It refuses the production database, and refuses to run with `PUBLIC_HOST` set.

```bash
mkdir -p /tmp/nearby-check
bun deploy/seed-nearby.js /tmp/nearby-check/db.sqlite                      # prints each house's TV and phone links
echo '{ "port": 3193, "dbPath": "/tmp/nearby-check/db.sqlite" }' > /tmp/nearby-check/config.json
bun server/main.js /tmp/nearby-check/config.json                           # nearby refreshes as it starts
```

Open one house's TV link (`http://localhost:3193/tv/k/…`) and its phone (`/?key=…`). The TV shows **🏘️ Near you
tonight** under the rush meter with 6 houses and **Witch on top**; the phone shows **🏘️ Near you: … · 6 houses**.
Neither Bluey nor the blocklisted name is ever the top costume. Then `rm -rf /tmp/nearby-check`.
**There are no fake Households on production**, which only ever shows the below-minimum view.

---

## 6. Support, from opening to Oct 31

- **One channel: `OPERATOR_CONTACT`**, offered as "Help: email us" in `/setup`, on `/help/tv` and on the sign-up page.
  No forum, chat, status page or banner.
- Check the inbox **once a day**, and on **Oct 31 at 3 pm and about 6 pm**. Nothing is promised during the night;
  replies come the next day.
- A question that comes up twice becomes a line on `/help/tv` (a fix-forward deploy), not a separate FAQ.

---

## 7. Household #1 before Oct 31

Household #1 was migrated, not signed up, so it has no "Halloween 2026" of its own. In `/setup`:

1. **Create an event** "Halloween 2026", **Copy costumes from** the Rehearsal.
2. Edit it: **Race against** "Halloween 2025 (counts)", **Golden tickets** 5 and **Clock shift** 0 (under Advanced),
   **Goes live by itself at** Oct 31, 4:00 pm.
3. Test our own porch like any Household's: our Rehearsal, the checklist, `/help/tv`. v1's hardware checks
   (overscan with `/tv?border`, HDMI sound, the volume ceiling, the kiosk flags) are ours to run this way.
4. **🖨 Print tally sheet**. Our porch keeps v1's last resort: the paper tally plus a Nov 1 backfill.

---

## 8. Oct 31

**Change freeze from 3 pm to midnight.** No app deploys and no Caddy changes unless the site is down
(`deploy.sh` warns and asks).

On call: the user, alone, best effort, between kids at our own door. Check `/operator` on the phone at **4 pm**
(Households went live), **6 pm**, then in lulls.

Decided in advance:

- **Near the caps, or RSS amber:** do nothing. The caps already refuse TV-link viewers first. Lowering them means a
  redeploy that drops every stream, so only do it if the process is actually restarting from memory pressure.
- **Sign-up flood:** Pause sign-ups. Otherwise sign-up stays open all night (a late sign-up's "Halloween 2026" goes
  live at once).
- **A Report or a bad name:** Rename or Suspend at the next glance. Never urgent.
- **Site down mid-evening:** phones keep counting into their outbox, and TVs freeze calmly. Make **one 10-minute
  attempt**: `lxc "journalctl -u count-dracula -n 100"`, `lxc "systemctl restart count-dracula"`, and restore the
  newest backup if the database is damaged (section 3). If it's not back by then, **stop debugging**: our porch goes
  to the paper tally, and every Household's outboxes drain when the site returns.
- **Home internet down:** nothing to do; wait.

---

## 9. Nov 1

1. Every live, non-Rehearsal night ended at 3:00 am by itself: `/operator` shows no Counting or Stale Households,
   and `lxc "journalctl -u count-dracula --since '03:00' | head"` shows no errors around then.
2. If our night ran on paper, **➕ Add missed kids** from the tally sheet first.
3. **⬇ Export** "Halloween 2026" in `/setup`, and commit the CSV to `.scratch/count-dracula/data/`.
4. Write a short "what broke" note for after Halloween.
