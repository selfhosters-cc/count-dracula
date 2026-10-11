# Location picker

Type: build (AFK)
Status: done
Blocked by: 21

## What to build

A Household can give an approximate Location, picked on a map, with only a ~5 km cell ever leaving the browser. See [spec §10](../spec.md#10-location).

- **Vendor Leaflet 1.9.4** in `public/vendor/`, keeping its BSD-2 notice.
- A **geohash encoder** in the browser (a few lines in `shared/`; no library).
- **The picker,** in `/setup` and as first-run screen 2:
  - It loads **nothing from OSM until "Pick on a map" is tapped**.
  - Then the map opens, with the OSM credit visible and **Use my location** (browser geolocation). Pan and zoom work worldwide.
  - The chosen point is snapped to a **5-character geohash cell**, shown **shaded, never as a pin**.
  - Only the cell id is sent.
  - The line *"Only a ~5 km square is saved · Privacy"* (the link arrives with [ticket 33](33-privacy-page.md)).
- **Change** replaces the cell with no history kept. **Remove** clears it.
- **Server:** accepts only a 5-character geohash (base32), and stores nothing else.
- No postal codes and no typed addresses.

## Acceptance criteria

- [x] Opening `/setup` makes no request to `tile.openstreetmap.org` until "Pick on a map" is tapped (checked in the network panel)
- [x] Use my location and hand-panning both give a shaded cell; the request body holds only the 5-character cell
- [x] The server refuses coordinates, longer or shorter geohashes, and non-geohash text
- [x] Change and Remove leave only the new cell, or nothing, in the DB
- [x] Leaflet's licence notice is in `public/vendor/`
- [x] `bun test` passes

## Notes from the build

- Leaflet 1.9.4 from npm (integrity checked against the registry) in `public/vendor/leaflet/`: the UMD build plus an ES-module face, `leaflet.css`, `images/` and the BSD-2 `LICENSE`. It's loaded with a dynamic `import()` only when "Pick on a map" is tapped.
- `shared/geohash.js`: `encodeGeohash`, `cellBounds`, `isCell`. The server's `setLocation` Setup command takes `{ cell }` (a cell, or `null` to remove) and refuses anything else.
- `public/location-picker.js` is the picker as a module (`createLocationPicker(container, { cell, save, onSkip })`), so first-run screen 2 (ticket 27) can reuse it with a Skip button.
- Choosing: tap the map, or Use my location; either snaps to the cell and shades it. No pins.
- Checked in the browser: no OSM or Leaflet request on opening `/setup`; after the tap, tiles load with the credit; Use my location (Toronto) sent only `{"type":"setLocation","cell":"dpz83"}`; tapping the map sent only its cell.
- The "Privacy" in the picker's line becomes a link with ticket 33.
