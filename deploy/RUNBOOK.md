# Count Dracula runbook: opening day to Nov 1

Everything done by hand, in order. The plan behind it is [v2 spec §18](../.scratch/multi-household/spec.md#18-launch-and-the-night-runbook),
as changed by [v2.1 §12](../.scratch/multi-household/spec-v2.1.md#12-household-1-and-the-opening-line);
setting up and deploying is in [README.md](README.md). Commands run on the dev machine from the repo, unless they
say otherwise. `$PUBLIC_HOST` is the real host name from `deploy/local.env`; this file never names it.

```bash
source deploy/local.env       # once per shell, for $PUBLIC_HOST in the commands below
lxc() { ssh proxmox "pct exec 118 -- bash -c $(printf '%q' "$1")"; }   # a command on LXC 118
```

---

## 1. Opening-day checklist

Done in order. Sign-up opens at step 7.

v2's steps 1–4 were done on Oct 11 (v2 on the public host, Household #1 migrated from v1, the load check and the
privacy checks). For v2.1 production is **rebuilt**: the v2 database is copied and set aside, v2.1 starts on a fresh
one, and Household #1 **signs up again at `/`** like any Household. Steps 1–4 below are that redo (ticket 62). The
public host, its Caddy site block, the LXC's size and the Google client stay as they are.

What's dropped: v2's 314 test taps on Household #1 (they stay in the copy), the old join key, TV link and paired TVs.
Our TV pairs again, and our helper phones join again. `v1-final` (tag and copy) stays, kept and never used.

### Step 1. Copy the v2 database

A `VACUUM INTO` copy (`deploy/copy-db.js`) on LXC 118, pulled into `~/count-dracula-backups/`. Not with `cp`: the
database is in WAL mode, and until a checkpoint its rows live in the `-wal` file beside it, so a copied `.sqlite`
alone can be empty (Oct 11's `cp` gave a 4 KB file).

```bash
ssh proxmox "cat > /tmp/copy-db.js && pct push 118 /tmp/copy-db.js /tmp/copy-db.js && rm /tmp/copy-db.js" < deploy/copy-db.js
copy=$(lxc "/usr/local/bin/bun /tmp/copy-db.js /etc/count-dracula/config.json /var/lib/count-dracula/v2-final && rm /tmp/copy-db.js"); echo "$copy"
name=v2-final-${copy##*count-dracula-}                                    # not count-dracula-*: pull-backup.sh prunes those
mkdir -p ~/count-dracula-backups
ssh proxmox "pct pull 118 $copy /tmp/$name" && scp -q proxmox:/tmp/$name ~/count-dracula-backups/$name && ssh proxmox "rm /tmp/$name"
ls -l ~/count-dracula-backups/$name
bun -e "import { Database } from 'bun:sqlite'; console.log(new Database('$HOME/count-dracula-backups/$name', { readonly: true }).query('SELECT household_id, name, (SELECT COUNT(*) FROM kids k WHERE k.event_id = e.id) AS kids FROM events e ORDER BY e.id').all())"
```

**Check:** `$copy` is a path under `/var/lib/count-dracula/v2-final/`; the pulled file is well over 4 KB (v1-final was
88 KB); the query lists Household 1's "Halloween 2025 (counts)" and its v2 test night with 300-odd kids. The copy
stays on LXC 118 and here, kept and never used, like `v1-final`.

### Step 2. Deploy v2.1 on a fresh database, and sign Household #1 up

1. On the dev machine: `main` checked out with tickets 50–61, and `deploy/local.env` with the five keys
   `deploy/local.env.example` lists. Delete any line for a key the example no longer has (v2.1 retired one;
   `deploy.sh` sends only the five anyway).
2. Stop the service and move the database and its `-wal` / `-shm` aside:

   ```bash
   lxc "systemctl stop count-dracula"
   lxc "cd /var/lib/count-dracula && mkdir v2-aside && for f in count-dracula.sqlite count-dracula.sqlite-wal count-dracula.sqlite-shm; do if [ -e \$f ]; then mv \$f v2-aside/; fi; done && ls -l v2-aside && ls"
   ```

   **Check:** `v2-aside/` holds `count-dracula.sqlite` (and the `-wal` / `-shm`, if any were left), and the listing
   after it has no `count-dracula.sqlite*` any more. (`mkdir` refuses if `v2-aside` already exists: look before
   going on.)
3. `deploy/deploy.sh`. It starts the service on no database, so the schema is built from nothing.
   **Check:** it says `no database yet (first deploy)` at "Copying the database", and ends with `==> Deployed`. Then:

   ```bash
   lxc "/usr/local/bin/bun -e \"const { Database } = require('bun:sqlite'); const db = new Database('/var/lib/count-dracula/count-dracula.sqlite', { readonly: true }); console.log(db.query('PRAGMA user_version').get(), db.query('SELECT COUNT(*) AS households FROM households').get())\""
   ```

   **Check:** `{ user_version: 15 } { households: 0 }`.
4. **Sign up Household #1** in a desktop browser, with the main Google account: `https://$PUBLIC_HOST/` →
   **Continue with Google** (since Oct 11 there's no name field: first-run's first screen names it). The consent screen is still in **Testing**,
   so only its listed test users can sign in at all. That is the real gate until step 6: a fresh database has Pause
   sign-ups **off**.
5. **First-run** (it opens by itself in `/setup`). Before its Location screen, open the browser's network panel and
   filter `openstreetmap`: nothing loads until **Pick on a map** is tapped (step 4's check, done here). Pick our
   Location. On **Put it on your TV**: the TV laptop's kiosk launcher opens a bare `https://$PUBLIC_HOST/tv`, which
   shows a code (its old pairing is refused and forgotten); type the code and **Pair**.
   **Check:** first-run says "✓ Your TV is showing *Test night*".
6. Household #1's id and time zone:

   ```bash
   lxc "/usr/local/bin/bun -e \"const { Database } = require('bun:sqlite'); console.log(new Database('/var/lib/count-dracula/count-dracula.sqlite', { readonly: true }).query('SELECT id, display_name, time_zone FROM households').all())\""
   ```

   **Check:** one row, `id: 1`, our name, `time_zone: "America/Toronto"` (from the browser).
7. **Import the real 2025 night** (`deploy/import-past-counts.js`, in the deploy tarball; safe with the service
   running):

   ```bash
   lxc "cd /opt/count-dracula && /usr/local/bin/bun deploy/import-past-counts.js /var/lib/count-dracula/count-dracula.sqlite 1"
   lxc "chown countdracula: /var/lib/count-dracula/count-dracula.sqlite*"   # in case root made a file there
   ```

   **Check:** it prints `imported "Halloween 2025 (counts)" (346 kids) for household 1 as event <id>`. Run twice, it
   refuses (`already has`) and adds nothing.
8. **Set the Race against** by hand: reload `/setup` → **Nights** → **Halloween 2026** → Settings → **Race against**
   "Halloween 2025 (counts)" → **Save settings**. Leave Household → **Last year (estimated)** empty, and in the
   checklist's item 3 use Expected kids or **Skip**, never **Race it**: an estimate would set itself on every night
   racing None.
9. **Checks:**
   - **Tonight:** the door card is "Test night", Live, and the TV shows it.
   - **Nights:** "Halloween 2025 (counts)" under Past, "346 kids · imported counts"; "Halloween 2026" Upcoming,
     "Goes live by itself" Sat, Oct 31 at 4:00 pm, and its screen's Race against is "Halloween 2025 (counts)". The
     TV's chart will label that ghost "2025" (the year in its name).
   - The old door URL lands on `/door`:
     `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://$PUBLIC_HOST/?key=runbook-check"` prints
     `302 https://…/door?key=runbook-check`.
   - Our helper phones: opening their old door link says "This phone's link no longer works…"; **OK**, then join
     again from **Tonight** → **➕ Add a helper** (scan the QR). A tap on one ticks the checklist's item 2.
   - `/operator` (the main account is on `OPERATOR_EMAILS`) loads, shows our Household as **Waiting** or
     **Counting**, and its switch button reads **Pause sign-ups** (so sign-ups are not paused).
   - Journald still keeps 30 days: `lxc "systemd-analyze cat-config systemd/journald.conf | grep MaxRetentionSec"`.

**If step 2 goes wrong** and can't be fixed forward, put v2 back: `lxc "systemctl stop count-dracula"`, move the new
`count-dracula.sqlite*` into a `v21-aside/`, move `v2-aside/`'s files back, `chown countdracula:` them, then
`deploy/deploy.sh --rollback` (the previous build, restarted). Never roll back the build alone: v2's code can't read
the v2.1 schema.

### Step 3. Load check, again

See [section 2](#2-load-check). About 15 minutes. It's run again because the hub changed in v2.1 (every write names
its Event, a TV follows one Event). If it fails, lower the caps, redeploy, run it again.

### Step 4. Privacy checks: only the new parts

- `/door?key=` is masked in the Caddy log (the site block's `key=` regexp already covers any path):

  ```bash
  curl -s -o /dev/null "https://$PUBLIC_HOST/door?key=runbook-secret-1"
  ssh root@$CADDY_IP "grep -o '\"uri\":\"[^\"]*' /var/log/caddy/count-dracula.log | grep /door | tail -3"   # /door?key=REDACTED
  ssh root@$CADDY_IP "grep -c runbook-secret-1 /var/log/caddy/count-dracula.log"                          # 0
  ```

- So is the key in the `/?key=` redirect's `Location` header (masked since Oct 11's step 4 found it in the clear):

  ```bash
  curl -s -o /dev/null "https://$PUBLIC_HOST/?key=runbook-secret-2"
  ssh root@$CADDY_IP "grep -o '\"Location\":\[\"[^\"]*' /var/log/caddy/count-dracula.log | tail -1"   # /door?key=REDACTED
  ssh root@$CADDY_IP "grep -c runbook-secret-2 /var/log/caddy/count-dracula.log"                         # 0
  ```

- OSM tiles load only after the tap: checked in step 2's first-run. To check again: `/setup` → **Household** →
  Location, network panel filtered on `openstreetmap`: nothing until **Pick on a map** (or **Change on a map**).
- Standing as done on Oct 11: `/privacy` shows the real `OPERATOR_CONTACT` and a test email arrived; the TV link's
  `/tv/k/` is masked; none of our requests are in the shared `public-access.log`.

### Step 5. A test Household, end to end

While the consent screen is still in Testing, with the second Google account (a test user), on a phone that has
never opened the site, through `https://$PUBLIC_HOST/`:

1. **Start counting**, sign up, and go through first-run's 3 screens. `/setup` → **Tonight** shows a live
   "Test night" and the checklist; **Nights** shows "Halloween 2026", Upcoming, going live Sat, Oct 31 at 4:00 pm.
2. Pair a second browser as its TV, by code, then again (after **Rotate TV link**) by scanning the QR.
3. **Count on this device**, then **+1 Kid** on `/door`: the checklist's item 2 ticks.
4. **Nights** → Halloween 2026 → **Goes live by itself at** 10 minutes from now → **Save settings**. Watch it go live
   on its own: the TV and the phone follow it with no reload, and the Test night shows under **Also open**.
5. Leave it overnight. Next morning: **both** nights **ended at 3:00 am** by themselves, each with "Ended
   automatically at 3:00 am. Late kids still count until noon." After noon, both are **Past** under Nights, and the
   Test night's ✨ Night summary opens (it has step 3's kid).
6. **Household** → **Delete my household…**, typing its name. That tests the hard delete;
   `lxc "journalctl -u count-dracula | grep 'household deleted'"` shows one line.

This is the one place auto go-live, the 3 am end and the noon Past are tested before Oct 31. It comes before
publishing so no stranger can sign up while it runs overnight.

### Step 6. Publish the Google consent screen

Google Cloud console → **Google Auth Platform**:

1. **Clients** → the web client → Authorized redirect URIs has `https://$PUBLIC_HOST/auth/google/callback`.
2. **Branding** → app name "Count Dracula", privacy policy link `https://$PUBLIC_HOST/privacy`.
3. **Audience** → **Publish app** (from Testing to In production). Until now only the listed test users could sign in.

**This is the gate between deploying and opening**: until it, only the listed test users can sign in.

### Step 7. Open sign-up

`https://$PUBLIC_HOST/operator`: the switch reads **Pause sign-ups** (a fresh database starts open). If it reads
**Open sign-ups**, press it. **Sign-up is open.**

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
redeploy, and run it again. (Oct 11, on v2: dev box 5 ms and 79 MB; LXC 118 a median of 3.8 ms, worst 7.8 ms, and
64 MB.)

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

### Nearby's view (tickets 42, 56, 63)

On the dev box, `deploy/seed-nearby.js` makes fake Households live on "Halloween 2026" (over their Test night)
with recent taps: Witch everywhere, Bluey (the most kids, but only 2 Households) and a blocklisted name (3
Households). By default it puts 6 in one Area (dpz8); pass `2` for the smallest "near you" (no minimum crowd since
v2.1), `edge` for 2 houses either side of an Area edge (dpz8r and dpzb2), or `corner` for 2 diagonally across an
Area corner (dpz8z and dpzc0). It refuses the production database, and refuses to run with `PUBLIC_HOST` set.

```bash
mkdir -p /tmp/nearby-check
bun deploy/seed-nearby.js /tmp/nearby-check/db.sqlite 2                    # 2 houses in one Area; prints each house's links
echo '{ "port": 3193, "dbPath": "/tmp/nearby-check/db.sqlite" }' > /tmp/nearby-check/config.json
bun server/main.js /tmp/nearby-check/config.json                           # nearby refreshes as it starts
```

**The check: 2 houses in one Area show "near you".** Open each house's TV link (`http://<dev box>:3193/tv/k/…`) and
phone (`/door?key=…`): both TVs show **🏘️ Near you tonight** under the rush meter with "2 houses counting" and no
top costume, and both phones **🏘️ Near you: … · 2 houses**. Then, with a fresh `/tmp/nearby-check` and the default 6:
6 houses and **Witch on top**; neither Bluey nor the blocklisted name is ever the top costume.

**Then across an edge and a corner (ticket 63).** Stop the server, and with a fresh `/tmp/nearby-check` each time,
seed `edge`, start the server, and open both phones; then the same with `corner`:

```bash
rm -rf /tmp/nearby-check && mkdir -p /tmp/nearby-check
bun deploy/seed-nearby.js /tmp/nearby-check/db.sqlite edge                 # or: corner
echo '{ "port": 3193, "dbPath": "/tmp/nearby-check/db.sqlite" }' > /tmp/nearby-check/config.json
bun server/main.js /tmp/nearby-check/config.json
```

Each time, the two houses are in different Areas and **both phones show the same 🏘️ Near you: … · 2 houses** (and
both TVs "2 houses counting"). If it fails by Oct 31 at 3 pm, `"nearbyEdges": false` goes into `switches` in
`/etc/count-dracula/config.json` (then a restart, outside the freeze): "near you" is then the Household's own Area,
which is the one-Area check above (with `edge` or `corner`, neither phone shows "near you"). Then
`rm -rf /tmp/nearby-check`.

**There are no fake Households on production.**

---

## 6. Support, from opening to Oct 31

- **One channel: `OPERATOR_CONTACT`**, offered as "Help: email us" in `/setup`, on `/help/tv` and on the homepage.
  No forum, chat, status page or banner.
- Check the inbox **once a day**, and on **Oct 31 at 3 pm and about 6 pm**. Nothing is promised during the night;
  replies come the next day.
- A question that comes up twice becomes a line on `/help/tv` (a fix-forward deploy), not a separate FAQ.

---

## 7. Household #1 before Oct 31

"Halloween 2026" came from Household #1's sign-up (step 2): 5 golden tickets, Clock shift 0, the starter costumes,
going live Oct 31 at 4:00 pm. Nothing to create. In `/setup`:

1. **Nights** → **Halloween 2026**: its **Race against** is still "Halloween 2025 (counts)", and its **Costumes** are
   the ones we want (add or remove there).
2. **Test our own porch** like any Household's: the checklist, `/help/tv`, and v1's hardware checks (overscan with
   `/tv?border`, HDMI sound, the volume ceiling, the kiosk flags). On our Test night while it's still Live (it ends by
   itself at the first 3 am after sign-up); after that, **Nights** → **Make a night** (e.g. "Porch test") → **Go
   live**, test, then **End** and **Close now** (or **↺ Reset** to use it again, or Delete it). Keep fewer than 3 nights
   open: at the cap of 3 Live nights Halloween 2026 waits instead of going live.
3. **🖨 Tally sheet** on Halloween 2026, printed. Our porch keeps v1's last resort: the paper tally plus a Nov 1
   backfill (before noon, section 9).

---

## 8. Oct 31

**Change freeze from 3 pm to midnight.** No app deploys and no Caddy changes unless the site is down
(`deploy.sh` warns and asks).

Before 3 pm: our `/setup` → **Tonight** has no test night left open (End and Close now any), and **Nights** shows
Halloween 2026 Upcoming, going live by itself at 4:00 pm, racing "Halloween 2025 (counts)".

On call: the user, alone, best effort, between kids at our own door. Check `/operator` on the phone at **4 pm**
(every Household's Halloween 2026 went live by itself: rows turn **Waiting**, then **Counting**), **6 pm**, then in
lulls.

Decided in advance:

- **Near the caps, or RSS amber:** do nothing. The caps already refuse TV-link viewers first. Lowering them means a
  redeploy that drops every stream, so only do it if the process is actually restarting from memory pressure.
- **Sign-up flood:** Pause sign-ups. Otherwise sign-up stays open all night (a late sign-up's "Halloween 2026" goes
  live at once).
- **A Report or a bad name:** Rename or Suspend at the next glance. Never urgent.
- **A Household's Halloween didn't go live at 4 pm:** it had 3 nights Live (the cap), so it waits, and its own
  `/setup` says so ("Couldn't go live at 4:00 pm: 3 nights are open…") and goes live once one ends. Nothing for us
  to do. (With fewer than 3 Live, the tick closed its oldest Ended night to make room, and said that instead.)
- **Site down mid-evening:** phones keep counting into their outbox, and TVs freeze calmly. Make **one 10-minute
  attempt**: `lxc "journalctl -u count-dracula -n 100"`, `lxc "systemctl restart count-dracula"`, and restore the
  newest backup if the database is damaged (section 3). If it's not back by then, **stop debugging**: our porch goes
  to the paper tally, and every Household's outboxes drain when the site returns.
- **Home internet down:** nothing to do; wait.

---

## 9. Nov 1

Every Event still Live at 3:00 am (each Household's own time) is ended by itself, **every one, ours included**. Ended
nights still take late kids until **noon**, when each goes **Past** by itself. The freeze is over at midnight.

1. **In the morning, the 3 am end:** `/operator` shows **no Counting, Stale or Waiting rows**, only **Ended** and
   **No night**. `lxc "journalctl -u count-dracula --since '03:00' | head"` shows no errors around then. If we left
   ours Live, Halloween 2026 says "Ended automatically at 3:00 am. Late kids still count until noon."
2. **Before noon**, if our night ran on paper: **Nights** → Halloween 2026 → **➕ Add missed kids** from the tally
   sheet. A Past night takes no more kids, and can't be resumed or reset.
3. **After noon:** every Ended night went Past by itself: `/operator` shows only **No night** rows (unless a
   Household has gone live on something new), and our Halloween 2026 is under **Past** in Nights.
4. **⬇ CSV** on Halloween 2026's screen in `/setup`, and commit the CSV to `.scratch/count-dracula/data/`.
5. Write a short "what broke" note for after Halloween.
