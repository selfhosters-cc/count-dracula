# Invites and Managers leaving

Type: build (AFK)
Status: ready-for-agent
Blocked by: 21, 31

## What to build

More Managers join a Household by Invite link, and Managers can leave or be removed. The Operator gets the recovery invite. See [spec §3 Managers](../spec.md#3-identity-and-tenancy) and [§13](../spec.md#13-operator). This is the first ticket after the opening line, so its migration only adds.

- **Invite** (any Manager) makes a **single-use** link valid **7 days**. It opens the share sheet (`navigator.share({ url })`), with **Copy link** as the fallback.
- At most **20 per Household per day** (the bucket from [ticket 28](28-caps-and-rate-limits.md)).
- **Unused invites** are listed in `/setup` and can be **revoked**.
- **Opening one:** Google sign-in, then the person joins as a Manager.
  - An account that already manages a Household is told so and doesn't join (one Household per Manager).
  - A used, expired or revoked link says so.
- **Managers list** in `/setup`. Any Manager can **remove** another.
- **Leave:** the last Manager can't leave, and is pointed at Delete my Household instead.
- **Leaving or being removed hard-deletes** that Manager's Google id, email, name and sessions at once. The Household and its nights stay. Invites they made stay until used or revoked.
- **Operator:** **Make an Invite link** in the `/operator` detail view, an ordinary invite the Operator copies and sends themselves. It writes one audit log line.
- Delete my Household also deletes invites.
- Invite tokens appear only in a URL shape that [ticket 35](35-public-host-on-caddy.md)'s masking covers; add the shape there if it's new.

## Acceptance criteria

- [ ] A second Google account opens an invite and becomes an equal Manager; the same link then fails
- [ ] An expired (fake clock) or revoked invite fails
- [ ] An account that already manages a Household can't join another
- [ ] The 21st invite in a day is refused
- [ ] Remove and Leave leave no row with that Manager's id, email or sessions; the last Manager can't leave
- [ ] The Operator's invite works and is logged
- [ ] The share sheet opens on a phone, and Copy works on desktop (checked in the browser)
- [ ] `bun test` passes
