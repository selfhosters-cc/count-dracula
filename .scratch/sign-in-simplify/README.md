# Simpler sign-in and onboarding

A review of the way in (2026-10-12) against familiar patterns, and the tickets that follow from it. They amend
[spec v2.1 §8](../multi-household/spec-v2.1.md#8-sign-up-first-run-and-the-ready-checklist) (first-run, the ready
checklist) and [§11](../multi-household/spec-v2.1.md#11-the-homepage) (the homepage, Continue with email). Built in
number order; production is live, so every one is fix-forward and migrations only add.

| # | Ticket | Why |
|---|---|---|
| 01 | [One sign-in block on the homepage](issues/01-one-sign-in-block.md) | Three Google forms; email hidden behind a link to the foot of the page |
| 02 | [Google's standard button](issues/02-google-button.md) | A plain orange button isn't the one people recognise |
| 03 | [Invites by email sign-in](issues/03-invites-by-email.md) | An invitee without Google can't accept, and email sign-in makes them a new household instead |
| 04 | [A code in the sign-in email](issues/04-email-code.md) | Ask on the laptop, read on the phone: the phone signs in |
| 05 | [One onboarding: the checklist](issues/05-one-onboarding.md) | First-run and the checklist do the same job twice, and the name and the map come before the TV |
| 06 | [The checklist remembered by the household](issues/06-checklist-on-the-server.md) | Ticks, skips and the dismissal live on one phone |
| 07 | [Pairing a TV, smoother](issues/07-tv-pairing-polish.md) | A browser `confirm()`, a type-first TV screen, and an expired code that doesn't say what to do |
