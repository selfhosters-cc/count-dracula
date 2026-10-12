# A code in the sign-in email

Type: build (AFK)
Status: todo
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

- [ ] The right code signs in, once; then neither the code nor the link works
- [ ] A wrong code says so; the 5th kills the link; the address's daily limit refuses even the right code
- [ ] Send a new code sends another; Use a different email goes back to the block
- [ ] `bun test` passes
