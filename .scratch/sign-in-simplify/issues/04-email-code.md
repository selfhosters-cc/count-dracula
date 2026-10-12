# A code in the sign-in email

Type: build (AFK)
Status: done
Blocked by: 03

## What to build

The sign-in email carries a **6-digit code** as well as the link, and "Check your email" has a box for it, so
someone who asks on a laptop and reads their mail on a phone types the code on the laptop (Slack, Notion and Linear
do this). The link still works, and still needs its Sign in press.

- The code belongs to the same link: using either uses both up, within the same 15 minutes. It's kept hashed
  (`email_links.code_hash`, migration 18).
- **Guessing is limited:** 5 wrong codes kill that link; 10 wrong codes per address per day (the Guard's
  `emailCode` rule) refuse every code for that address until the day refills. A wrong code says so and how to get
  a new one.
- "Check your email" says: the address, *"Enter the code from the email, or open its link on this device"*, the
  code box, **Send a new code** and **Use a different email**. The code box suits one-time codes:
  `inputmode="numeric"`, `autocomplete="one-time-code"`, 6 digits.
- The email's subject becomes *"Your Count Dracula sign-in code: 123456"*, and the body gives the code before the
  link.

## Acceptance criteria

- [x] The right code signs in, once; then neither the code nor the link works
- [x] A wrong code says so; the 5th kills the link; the address's daily limit refuses even the right code
- [x] Send a new code sends another; Use a different email goes back to the block
- [x] `bun test` passes

## Notes from the build

- **Limits as built:** 5 wrong codes stop that link's *code*, never its link (the link is 256 bits, and killing it would
  let anyone who knows an address spoil its email). The Guard's `emailCode` is 10 **tries** per address a day, right
  or wrong, taken before anything is looked up, so a 429 never says whether the code was right. With 6 digits
  that's 10 guesses in a million a day.
- Migration 18: `email_links.code_hash` (sha-256 of the link's token hash and the code, so equal codes on two links
  never match each other's) and `tries`. A code matches any of the address's live links (each of the last few
  emails has its own); a wrong one counts against all of them. Spaces and dashes in a typed code are ignored.
- `accounts.finishEmailCode({ email, code, ip })` → `useLink()`, the same path as the link's Sign in button, so a
  code carries the TV and the invite.
- **Check your email** (`checkEmail()` in `server/app.js`) carries the ask (address, zone, TV, invite) in hidden
  fields, so Send a new code is the same ask again and a wrong code shows the page again with the problem. Use a
  different email goes to `/#sign-in`, or back to the invite. `Cache-Control: no-store`.
- The email's subject is *"Your Count Dracula sign-in code: 123456"*; the code comes first (large, in the HTML part),
  then the link, then who asked. The privacy notice says "sign-in code".
- Checked in the browser: a wrong code said so on the page, then the right one typed as "830 818" signed in.
