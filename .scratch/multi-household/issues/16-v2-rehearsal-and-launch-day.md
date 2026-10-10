# v2 rehearsal and launch-day plan

Type: grilling (HITL)
Status: claimed
Blocked by:

## Question

How does the **Oct 24 rehearsal** work as the multi-household acceptance test, and what do **Oct 25–31** look like once strangers' nights depend on us?

- **The rehearsal as acceptance test.** What has to pass on Oct 24 for the freeze to hold, and who plays which part: a second test Household (a second Google account) alongside Household #1; a stranger's phone doing the 3-screen first-run and pairing a TV by code/QR ([From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md)); many remote TV-link viewers at once; nearby and the Site-wide total with fewer than 5 real Households (fake test Households? a lowered minimum on a copy?); a Night summary shared and Reported; Operator actions (Rename, Suspend, Pause sign-ups) on `/operator`. Which of it runs against production and which on a copy.
- **Auto go-live and auto-end.** Testing "Halloween 2026" going live by itself by setting a near **Goes live at**, and the 3 am auto-end, without upsetting Household #1's real night.
- **Load.** When and where the research's appendix scripts are re-run on LXC 118 to confirm the caps ([Public hosting and abuse](11-public-hosting-and-abuse.md)), and whether that happens on Oct 24 or before.
- **Pass/fail and the freeze.** What counts as a blocker that moves sign-up from ~Oct 25, versus a known issue we ship with. Rehearsing `deploy/RUNBOOK.md` (restore from `VACUUM INTO`, the re-delete step, Pause sign-ups, the suspected-breach steps).
- **Opening sign-up (~Oct 25).** Who flips it on and in what order (Pause sign-ups off, `/privacy` with the real `OPERATOR_CONTACT`, the Google OAuth consent screen published).
- **Oct 25–31 support.** Where strangers get help (the `OPERATOR_CONTACT` address only? a status line on the sign-up page?), and how quickly we look.
- **On the night (Oct 31).** Who's on call, what's watched (`/operator` health strip), and the decisions written down in advance: when to lower caps, when to Pause sign-ups, what to do if the site goes down at 7 pm while our own porch is running on it.
- **Given** ([Privacy notice and retention](15-privacy-notice-and-retention.md)): the rehearsal should check that `/privacy` shows the real contact, that a TV link token appears masked in the Count Dracula Caddy log, and that OSM tiles only load after the tap.
