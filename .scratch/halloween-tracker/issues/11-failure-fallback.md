# Failure fallback

Type: grilling (HITL)
Status: open
Blocked by: 

## Question

What happens when something breaks mid-night, and what is the manual fallback?

Already covered: Wi-Fi blips (phone outbox + snapshot on reconnect, see Live-update stack), and display crashes (server and data live in the LXC, see Hosting and phone access). Decide:

- **Server/LXC down:** do phones keep counting offline into their outbox until it returns, how long that can last, and how the TV signals "reconnecting" to the porch without looking broken.
- **Everything down:** the manual fallback (a paper tally by the door?) and how missed kids get **backfilled** afterwards (a bulk "add N kids between 6:40–6:55" action?) so the chart and ghost race stay honest. Should backfilled kids celebrate? (Probably not.)
- **Data safety:** is a Proxmox backup or a simple SQLite file copy after the night enough, so 2026 is kept as next year's ghost line?
