# Google's standard button

Type: build (AFK)
Status: done
Blocked by: 01

## What to build

Continue with Google drawn as Google's own "Sign in with Google" button (its branding guidelines): white, a 1 px
`#747775` border, the four-colour **G** logo on the left, "Continue with Google" in `#1f1f1f`, medium weight. It's the
button people already know, and the guidelines ask for it.

- One shared look (`.google` and an inline SVG G), used on the homepage block and the invite page (`GET /invite`).
- Keyboard focus is visible on the dark page.

## Acceptance criteria

- [x] The homepage and `/invite` show the white G button
- [x] It meets the guidelines' colours, logo and wording
- [x] `bun test` passes

## Notes from the build

- The G is `public/google-g.svg` (Google's four-colour mark), drawn 20 px as an `<img>` in
  `<button class="google">`. The homepage's CSS and `page()`'s inline style both define `.google`; the server's
  copy of the button is `GOOGLE_BUTTON` in `server/app.js`.
- Weight 600 rather than Roboto Medium: the page's system font at 500 looked thin on the dark panel.
- Checked at 390 px on the homepage block and an invite page.
