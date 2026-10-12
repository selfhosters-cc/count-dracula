# One sign-in block on the homepage

Type: build (AFK)
Status: done
Blocked by:

## What to build

Every way to sign in, together in the hero, the way most sites do it: **Continue with Google**, an "or" rule, then
the **email** field and **Continue with email** (when email sign-in is on). Today the page has three identical Google
forms (the top row, the `#sign-in` section, the sticky bar) and the email form sits at the foot of the page, behind
"No Google account? Use your email".

- The hero's block takes `id="sign-in"`, so `/#sign-in` (sign-out, `/setup` without a session, error pages' Try
  again) still lands on it. The signed-out and TV-waiting notes move into it.
- The `#sign-in` section at the foot goes. **Got a code?** stays where it is, linked from a line under the block.
- The **sticky bar** on phones: "Sign in or start ›" (to `#sign-in`) · "Got a code?". It shows while neither the
  block nor the code box is on screen.
- Paused sign-ups, the privacy line and the Welcome back card are unchanged.

## Acceptance criteria

- [x] One Google form and one email form on the page
- [x] `/#sign-in`, `/?signed-out=1#sign-in` and `/?pair=K7QM4X#sign-in` show the block with their notes
- [x] At 390 px and 1200 px the block reads as one group; the sticky bar scrolls to it
- [x] With email off, the block is the Google button alone
- [x] `bun test` passes

## Notes from the build

- The block is `section#sign-in.sign-in` in the hero: the signed-out and TV notes, the Google form, the email form
  (hidden until `/api/home` says email is on), the paused note, then *"New here? We make your household as you sign
  in. Already counting? You land in yours."* and the privacy line. Under it, `#code-line`: *"Got a code from a TV or
  a host? Enter it here"*. Welcome back hides both.
- The `.ways` wrapper went with the old section; at 900 px and up the code box is centred, 640 px wide.
- Checked at 390 px (block, `/?pair=K7QM4X#sign-in` note, the sticky bar showing between the block and the code box
  and taking you back up, no sideways scroll) and 1280 px (the block in the hero beside the TV).
