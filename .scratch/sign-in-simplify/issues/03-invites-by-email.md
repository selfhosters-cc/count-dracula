# Invites by email sign-in

Type: build (AFK)
Status: todo
Blocked by: 01

## What to build

An Invite link works with either way in. Today `/invite` offers only Google and an email link can't carry an
invite: someone without a Google account can't accept, and if they sign in by email they get a new household of
their own, and the invite then refuses them ("One household each").

- `/invite` shows the same block as the homepage: Continue with Google and, when email is on, Continue with email,
  both carrying the invite.
- The email link (and ticket 04's code) carries the invite as the Google state does: `email_links.invite`
  (migration 17, adds a column). Finishing by email lands like Google: an unknown address joins the invited
  household, a known one in another household is refused as before.
- The invite is checked when the link is asked for, too: a dead invite says so at once instead of after the email.
- Setup's Managers line drops "for a Google account"; the refusal "One household each" talks about an email
  address, not a Google account.

## Acceptance criteria

- [ ] An invite accepted by email makes a Manager of the invited household and uses the invite up
- [ ] A used, expired or revoked invite refuses by email as it does by Google
- [ ] A Manager of another household who follows an invite by email is refused, and the invite stays unused
- [ ] `bun test` passes
