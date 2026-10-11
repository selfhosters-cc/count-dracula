# Location picker

Type: build (AFK)
Status: ready-for-agent
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

- [ ] Opening `/setup` makes no request to `tile.openstreetmap.org` until "Pick on a map" is tapped (checked in the network panel)
- [ ] Use my location and hand-panning both give a shaded cell; the request body holds only the 5-character cell
- [ ] The server refuses coordinates, longer or shorter geohashes, and non-geohash text
- [ ] Change and Remove leave only the new cell, or nothing, in the DB
- [ ] Leaflet's licence notice is in `public/vendor/`
- [ ] `bun test` passes
