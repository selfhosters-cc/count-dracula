# Connection caps and rate limits

Type: build (AFK)
Status: ready-for-agent
Blocked by: 19, 21, 23, 24

## What to build

The site protects itself in-process: stream caps that keep phones in first, and token-bucket rate limits. See [spec §15 Live connections and Rate limits](../spec.md#15-hosting-capacity-and-abuse).

- **Client IP** comes from `CF-Connecting-IP`, falling back to the socket address.
- **All the numbers in one constants block.**
- **Stream caps:**

| Cap | Number | When full |
|---|---|---|
| TV-link viewers per Household | 200 | "This TV is full, try again soon" on the TV page, retrying with backoff |
| Open streams per IP | 20 | 429 |
| Site-wide | 3,000 streams | New TV-link viewers refused first; phones still get in up to a hard ceiling of 3,500 |

- **Never refused by the per-Household cap:** the Household's own phones (join key or Manager session) and paired TVs ([ticket 24](24-tv-pairing.md)). They still count site-wide.
- **Rate limits** (token buckets in memory):

| What | Limit |
|---|---|
| Create a Household | 3 per IP per day, and 60 site-wide per hour (through the check from [ticket 21](21-google-sign-in.md)) |
| Google sign-in attempts | 30 per IP per hour |
| Request a TV pairing code | 30 per IP per hour |
| Redeem a TV pairing code | 10 per Manager per 10 min |
| Make an Invite link | 20 per Household per day (used by [ticket 39](39-invites.md)) |
| Taps | 10/s with bursts up to 30, per Household |
| Report this page | 5 per IP per day (used by [ticket 44](44-summary-share-links.md)) |

- **Every refusal** returns 429 (or the TV-full / sign-ups-paused page), increments a **refusal counter** that `/operator` reads, and writes **one log line**.
- The 64 KB request-body cap is Caddy's ([ticket 35](35-public-host-on-caddy.md)).

**Modules:** Guard ([spec §20](../spec.md#20-where-it-lands-in-the-code)).

## Acceptance criteria

- [ ] With a fake clock, each limit in the table refuses at the stated rate and recovers after its window
- [ ] Viewer 201 on one Household's TV link is refused, while that Household's phones and paired TV still connect
- [ ] Past 3,000 streams site-wide, a TV-link viewer is refused but a phone still connects; past 3,500 nothing does
- [ ] The 21st stream from one IP is refused
- [ ] The TV page shows "This TV is full, try again soon" and retries with backoff
- [ ] Each refusal increments the counter and writes one log line
- [ ] `bun test` passes
