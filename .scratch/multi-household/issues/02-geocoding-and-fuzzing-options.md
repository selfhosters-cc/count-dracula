# Geocoding and location-fuzzing options

Type: research (AFK)
Status: resolved
Blocked by:

## Question

How can a household give us a location that we store and show only **approximately**, without a paid service or an npm dependency?

- **Input routes**: postal code (Canada FSA/full postcode, US ZIP, others), typed address, browser geolocation, map pin. For each: which free data source or service turns it into coordinates (e.g. Nominatim, Photon, GeoNames postal-code dumps), its **usage policy** (rate limits, attribution, bulk/automated-use rules), and licence.
- **Fuzzing techniques**: snapping to a grid cell or geohash of a given precision, a fixed random offset per household, postal-area centroids. What cell sizes each gives at ~45–50° latitude, and known pitfalls (re-identification by averaging repeated random noise, edge effects, sparse rural cells).
- **Minimum-crowd rules**: established practice for not revealing a single home in an area aggregate (k-anonymity thresholds used by public dashboards, e.g. small-count suppression).
- **Showing it on a map**: OpenStreetMap tile usage policy for a small public app, and vendorable map libraries (e.g. Leaflet) that fit the no-build, vendored-in-`public/vendor/` setup. Or whether a map is avoidable.

Findings go to `research/02-geocoding-and-fuzzing-options.md`, every claim cited to a primary source.

## Answer

Resolved 2026-10-10 (AFK). Findings, with a citation on every claim: [`research/geocoding-and-fuzzing:.scratch/multi-household/research/02-geocoding-and-fuzzing-options.md`](https://github.com/selfhosters-cc/count-dracula/blob/research/geocoding-and-fuzzing/.scratch/multi-household/research/02-geocoding-and-fuzzing-options.md) (`git show research/geocoding-and-fuzzing:.scratch/multi-household/research/02-geocoding-and-fuzzing-options.md`).

Recommendations for [Fuzzy location](07-fuzzy-location.md) to decide:

- **Postal code looked up locally, no web geocoder.** Canada: GeoNames `CA.zip`, 1,657 FSAs (first three characters), CC BY 4.0 with attribution. US: Census ZCTA Gazetteer, 33,791 points, public domain. Loaded at start-up: no keys, no rate limits, works if the internet is flaky. OSM geocoders (Nominatim, Photon) handled Canadian postcodes badly in a spot check.
- **Full Canadian postcodes are a licence risk.** Canada Post licenses them; StatCan's file can't be redistributed; GeoNames' full-postcode file has no stated source. FSA only.
- **"Use my location"** needs no geocoder: snap in the browser, so the precise point never reaches the server.
- **No typed addresses.** Nominatim's policy (1 req/s for the whole app, no client autocomplete, no personal data) rules it out.
- **Fuzz before saving:** store a **5-character geohash** (~4.9 km × 3.1–3.5 km at 45–50°). "Nearby" = that cell + its 8 neighbours (~15 × 10 km), which also handles homes near a cell edge. Not per-view random offsets (they average away) and never a stored precise point (distance queries pinpoint it).
- **Minimum crowd:** agencies suppress below 5–16; start with **≥ 5 households before an area shows anything**, round kid counts to 5s, one area level only, never a single household.
- **No map before the freeze:** a text card or an inline-SVG 3×3 grid. Later: Leaflet 1.9.4 (BSD-2, ~43 KB gz) + OSM tiles within the tile policy, with no uptime guarantee on the night.
