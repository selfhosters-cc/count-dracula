# Google's standard button

Type: build (AFK)
Status: todo
Blocked by: 01

## What to build

Continue with Google drawn as Google's own "Sign in with Google" button (its branding guidelines): white, a 1 px
`#747775` border, the four-colour **G** logo on the left, "Continue with Google" in `#1f1f1f`, medium weight. It's the
button people already know, and the guidelines ask for it.

- One shared look (`.google` and an inline SVG G), used on the homepage block and the invite page (`GET /invite`).
- Keyboard focus is visible on the dark page.

## Acceptance criteria

- [ ] The homepage and `/invite` show the white G button
- [ ] It meets the guidelines' colours, logo and wording
- [ ] `bun test` passes
