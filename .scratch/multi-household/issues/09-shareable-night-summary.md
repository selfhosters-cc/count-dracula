# Shareable night summary

Type: prototype (HITL)
Status: claimed
Blocked by:

## Question

What does a night summary built to screenshot and share look like?

v1 ruled a shareable recap out ("a photo of the TV does the job"). It's back in scope because households will want to post their nights. Prototype and react:

- **Format**: a page laid out for a phone screenshot (9:16), a downloadable image the server renders, a share link whose preview card (Open Graph image) does the job, or a combination. Rendering an image server-side with no npm dependency is a real constraint (SVG → PNG? canvas in the browser and download?).
- **Content**: start from the v1 end-of-night recap (final count and verdict, the race, peak half-hour, biggest crew, costume of the night, golden numbers). Add a neighbourhood line ("3rd busiest of 12 homes nearby") if nearby exists? Household name shown or not?
- **When and who**: available once the night is ended? Shareable by link without signing in?

Link the prototype branch from the answer.
