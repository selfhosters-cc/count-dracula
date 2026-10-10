# Geocoding and location-fuzzing options

Type: research (AFK)
Status: open
Blocked by:

## Question

How can a household give us a location that we store and show only **approximately**, without a paid service or an npm dependency?

- **Input routes**: postal code (Canada FSA/full postcode, US ZIP, others), typed address, browser geolocation, map pin. For each: which free data source or service turns it into coordinates (e.g. Nominatim, Photon, GeoNames postal-code dumps), its **usage policy** (rate limits, attribution, bulk/automated-use rules), and licence.
- **Fuzzing techniques**: snapping to a grid cell or geohash of a given precision, a fixed random offset per household, postal-area centroids. What cell sizes each gives at ~45–50° latitude, and known pitfalls (re-identification by averaging repeated random noise, edge effects, sparse rural cells).
- **Minimum-crowd rules**: established practice for not revealing a single home in an area aggregate (k-anonymity thresholds used by public dashboards, e.g. small-count suppression).
- **Showing it on a map**: OpenStreetMap tile usage policy for a small public app, and vendorable map libraries (e.g. Leaflet) that fit the no-build, vendored-in-`public/vendor/` setup. Or whether a map is avoidable.

Findings go to `research/02-geocoding-and-fuzzing-options.md`, every claim cited to a primary source.
