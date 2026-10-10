# Failure fallback

Type: grilling (HITL)
Status: resolved
Blocked by: 

## Question

What happens when something breaks mid-night, and what is the manual fallback?

Already covered: Wi-Fi blips (phone outbox + snapshot on reconnect, see Live-update stack), and display crashes (server and data live in the LXC, see Hosting and phone access). Decide:

- **Server/LXC down:** do phones keep counting offline into their outbox until it returns, how long that can last, and how the TV signals "reconnecting" to the porch without looking broken.
- **Everything down:** the manual fallback (a paper tally by the door?) and how missed kids get **backfilled** afterwards (a bulk "add N kids between 6:40–6:55" action?) so the chart and ghost race stay honest. Should backfilled kids celebrate? (Probably not.)
- **Bulk add for the rehearsal:** the same bulk-add action, or a dev-only route, also lets the rehearsal reach BEAT LAST YEAR without 347 taps (from [Event setup and phone menu](09-event-setup-and-phone-menu.md)). Decide whether it's one feature or two.
- **Data safety:** is a Proxmox backup or a simple SQLite file copy after the night enough, so 2026 is kept as next year's ghost line?

## Answer

Resolved 2026-10-10 by grilling.

**Server or LXC down: phones keep counting**

- A phone whose page is already open keeps working normally: count, costume buttons, Undo and Recent all run locally against the localStorage outbox. **No time limit**, since the outbox holds the whole night.
- After about **5 s of failed sends**, an amber **"⏳ N waiting to send"** pill appears at the top. It clears with a brief "✓ sent" once the outbox drains.
- If it stays up for more than about **2 minutes**, a line is added under it: **"Server's down — keep tapping, don't reload."** Over plain HTTP there's no service worker, so a reload while the server is down gives a blank page. That's the one thing that turns a blip into the paper fallback.
- Recent shows queued kids with a faint ⏳. Undo on a queued tap just removes it from the outbox.
- Default assumption: the Bun service runs under systemd with `Restart=always`, so a crashed process is back in seconds. Only a down LXC or host goes down the long-outage path.

**Server or LXC down: the TV stays calm**

- The TV keeps the **frozen Scoreboard** up: no error screen, spinner or red. A paused count reads as a quiet moment from the porch.
- After **20 s disconnected**, a small decorative corner chip appears: **"🦇 catching up…"**.
- The **idle teaser is held** while disconnected, because its ghost-line line would be computed against a stale count. **Ambience keeps playing.**
- **On reconnect:** the usual snapshot. Every backlogged tap is more than 10 s late, so the count does **one quiet roll-up** to the new total (about 2 s, one soft tick) instead of many tick-ups. The chart and leaderboard update in the same pass, and the chip goes away.
- Kiosk rule: don't reload the TV while the 🦇 chip is up.

**Big moments hit by late taps**

These follow the existing "more than 10 s late" threshold from [Live-update stack](02-live-update-stack.md), so an outage backlog and a single straggler on bad Wi-Fi behave the same way. There's no separate outage mode.

- **#100 / #200 / #300 milestones** crossed by late taps are **skipped**, because the next live kid isn't #100.
- **Beat last year**, if crossed by late taps, **fires on the next live tap** as "WE BEAT LAST YEAR! 🏆", without a kid number.
- **A golden ticket** whose number goes to a late tap **rolls forward to the next live kid** (the same mechanism as Release remaining), so a real kid at the door wins: "KID #172 WINS!". The recap's golden card shows the original number as "rolled forward".

**Paper fallback**

- It's only needed if every door phone loses the page (reloaded, dead battery or closed tab while the server is down).
- **A printed tally sheet and pen** taped inside the door at setup: **15-minute rows from 5:30 to 9:00**, tally marks only, no costumes. The header says **"Phone blank or dead? Tally here. Write the time you started."**
- `/setup` gets a **"🖨 Print tally sheet"** link: a tiny static page with the event name and rows pre-filled.

**Backfill and rehearsal bulk add are one feature**

- **"➕ Add missed kids"** in `/setup`, behind the admin PIN, not in the ☰ door menu. It shows a **grid with the same 15-minute rows as the tally sheet**; you type a count per row.
- The server spreads each row's count **evenly across that slot** as untagged kids marked **`source: backfill`**, saved as one batch.
- **No celebration:** backfilled kids are late taps, so the TV does the quiet roll-up, and the milestone and golden rules above apply. The chart, ghost race and recap all include them.
- **Each batch can be removed:** Setup lists "+38 kids, 6:30–7:00 · Remove".
- Rows can't be later than "now" on the event's clock. Rows are in the event's clock, so **Clock shift** applies, and timestamps are stored in real time as usual.
- **It replaces the dev-only bulk-add route** handed on from [Event setup and phone menu](09-event-setup-and-phone-menu.md). The rehearsal backfills 340 kids, then taps live up to #347.

**Data safety**

- **"⬇ Export event"** in `/setup`'s past-events list, next to "View recap", downloads a CSV with one row per kid (timestamp, tag, source, deleted) plus a half-hour count summary. On Nov 1 it's committed to this repo's `data/` folder next to `2025-counts.md`. It's the same shape next year's ghost-line seed reads.
- **The existing scheduled Proxmox backup job** covers the full database. It needs to include the new LXC: automatic if the job backs up "all" guests, otherwise add the ID.
- **No backups during the night:** SQLite WAL on one LXC is very unlikely to lose data over four hours, and a copy on the same disk adds little.

**Handed on to [Dress rehearsal plan](12-dress-rehearsal-plan.md):** switching to the paper sheet once; backfilling 340 kids, then live taps to #347, including a golden roll-forward; exporting the rehearsal event once; confirming the backup job includes the new LXC; "don't reload the TV while the 🦇 chip is up" on the checklist.
