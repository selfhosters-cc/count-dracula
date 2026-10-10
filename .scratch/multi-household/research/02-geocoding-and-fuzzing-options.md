# Geocoding and location-fuzzing options: findings

Answers [issue 02](../issues/02-geocoding-and-fuzzing-options.md). Researched 2026-10-10. Every policy below was read on that date. Policies can change without notice: the Nominatim policy says so outright [N1]. Numbers in square brackets point to the [Sources](#sources) list at the end. Lines marked **(computed)** are arithmetic or file inspection done for this note, with the method given. Lines marked **(spot check)** come from a handful of manual requests made on 2026-10-10.

This is a recommendation, not a decision. Input method, fuzz size, opt-in and who sees what belong to [07 Fuzzy location](../issues/07-fuzzy-location.md).

---

## Bottom line

**Simplest route that is free, follows every policy and adds no dependencies:**

1. **Turn a postal code into coordinates from a lookup table we keep, not from a web service.** Ship two static files that the Bun server reads at start-up:
   - **Canada:** the GeoNames `CA.zip` table of FSAs, the first three characters of a postal code. It has 1,657 rows, about 126 KB unzipped, under CC BY 4.0, which needs a credit line to GeoNames [G1][G2] **(computed)**.
   - **US:** the Census Bureau's ZCTA Gazetteer. It has 33,791 rows with one internal point per ZIP-like area, about 2.4 MB unzipped, and is public domain [C1][C2][C3] **(computed)**.

   This needs no runtime calls, API keys or rate limits, and it keeps working on the night if outbound internet fails. Typing an address would need a geocoding service. The public Nominatim service asks callers not to send personal data [N1], and a home address is personal data, so skip address entry.
2. **"Use my location"** (the browser Geolocation API) needs no geocoder at all. The browser returns coordinates after the user gives permission, and only on HTTPS [W1]. **Snap the point to a cell in the browser**, so the precise point never reaches the server.
3. **Fuzz before saving and never store the precise point.** Store only an area key. The simplest single model is a **5-character geohash cell**, about 4.9 km north–south by 3.1–3.5 km east–west at 45–50° latitude (table below). The cell is computed from the postal-area centroid or from the snapped browser point. Encoding a geohash is about 20 lines of plain JavaScript. A grid works better here than random offsets: a cell is deterministic, so averaging repeated views reveals nothing new. For "nearby", group a cell together with its 8 neighbours (about 15 × 10 km). That also removes the edge effect where a household sits just across a cell boundary.
4. **Minimum crowd:** show no area figure until it covers at least *k* distinct households. Published practice ranges from <5 to <16 for counts, and a population of at least 40 for whole areas [S1][S2][S3][S4]. Also block **differencing**: hiding small numbers fails if they can be worked out from other figures [S1]. Suggested starting point for 07: *k* = 5 households, with kid totals rounded to a multiple of 5.
5. **A map is not needed for the freeze.** Nearby works as a text or number card, or as an inline-SVG grid with no basemap. If a map is wanted later, **Leaflet 1.9.4** works with the vendored, no-build setup: BSD-2 licence, a single ~148 KB script, or ~43 KB gzipped [L1][L2] **(computed)**. **tile.openstreetmap.org** tiles are allowed for normal interactive viewing, with a visible attribution, a valid Referer header, no prefetching and no offline use [T1].

### Cell sizes at ~45–50° latitude

**(computed)** A geohash of *n* characters uses 5*n* bits, split between longitude (ceil(5n/2) bits) and latitude (floor(5n/2) bits) [E1]. North–south size = 180°/2^latbits × 111.13 km. East–west size = 360°/2^lonbits × 111.32 km × cos(latitude). At the equator these match Elastic's published geohash table [E1]. Decimal-degree grids use the same scaling.

| Scheme | N–S | E–W at 45° | E–W at 50° | Area at 45° / 50° | Notes |
|---|---|---|---|---|---|
| geohash 4 | 19.5 km | 27.7 km | 25.2 km | 541 / 491 km² | City-region; too coarse for "nearby" |
| **geohash 5** | **4.9 km** | **3.5 km** | **3.1 km** | **17 / 15 km²** | Suggested default cell |
| geohash 6 | 0.61 km | 0.87 km | 0.79 km | 0.53 / 0.48 km² | A few streets; risky in rural areas |
| geohash 7 | 153 m | 108 m | 98 m | 0.02 / 0.01 km² | Roughly a block; too fine |
| 0.1° grid | 11.1 km | 7.9 km | 7.2 km | 87 / 80 km² | Plain `Math.floor(lat*10)` |
| 0.05° grid | 5.6 km | 3.9 km | 3.6 km | 22 / 20 km² | Close to geohash 5 |
| 0.02° grid | 2.2 km | 1.6 km | 1.4 km | 3.5 / 3.2 km² | |
| 0.01° grid | 1.1 km | 0.79 km | 0.72 km | 0.87 / 0.80 km² | "~1 km cell" |
| H3 res 7 (library) | edge 1.41 km avg | | | 5.16 km² avg | Needs `h3-js`, so it breaks the zero-deps rule [H1] |
| H3 res 8 (library) | edge 0.53 km avg | | | 0.74 km² avg | Same [H1] |
| Canada FSA | varies | | | varies | 1,643 census FSAs [SC2]; rural ones are huge, e.g. `T0A` "Eastern Alberta" [G2] |
| US ZCTA | varies | | | median 90 km² (10th–90th pct: 3.5–474 km²) | **(computed)** from the 2026 Gazetteer `ALAND` column [C2] |

---

## 1. Input routes: data source, usage policy, licence

### 1a. Postal code: Canada (FSA or full postcode)

| Source | What it gives | Usage policy | Licence |
|---|---|---|---|
| **GeoNames `CA.zip`** (in allCountries or as a per-country file) | One row per FSA with place name, province and lat/lon [G1]. 1,657 rows; `CA.zip` is 37 KB, dated 2026-10-10 [G2] **(computed)** | Static download, so no rate limit applies at lookup time. "Provided 'as is' without warranty or any representation of accuracy" [G1] | **CC BY 4.0**: "you can use the dump as long as you give credit to geonames (a link on your website to www.geonames.org is ok)" [G1]. The readme links to a CC BY 3.0 URL, so the version number is inconsistent [G1] |
| GeoNames `CA_full.csv.zip` | Full 6-character postal codes, 900,676 rows, 6.1 MB [G1][G2] **(computed)** | Same as above | CC BY per the readme [G1], but **its provenance is not stated**. Canada Post sells postal-code lat/lon data under licence [CP1], and StatCan's postal-code file forbids redistribution [SC3]. Treat as a legal risk; there is no need for full codes anyway |
| StatCan **Census FSA boundary file** 92-179-X (2021) | 1,643 CFSA polygons as SHP, GML or FGDB in Lambert conformal conic projection, NAD83 [SC2] | Static download | **Statistics Canada Open Licence**, with attribution "Source: Statistics Canada, …" (or "Adapted from…" for value-added products). It forbids linking to other data to identify individuals [SC1][SC2]. Using it means computing our own centroids offline: more work than GeoNames, but an authoritative source |
| Canada Post "Postal Code Latitude/Longitude Data" | Coordinates for each full postal code | Paid licence; Canada Post sends an agreement and pricing on request [CP1] | Proprietary; out of scope ("no paid service") |
| StatCan **PCCF** (Postal Code Conversion File) | Postal code → census geography | Licensed; "shall not … distribute, make public" and no derived products for external distribution [SC3] | Ruled out |
| Nominatim / Photon (OSM) | Free-text or structured postcode search [N2][P2] | See 1c | ODbL (see 1c) |

**Spot check (2026-10-10, 4 Nominatim queries and 1 Photon query):** Nominatim found `K1A 0A6` but returned nothing for `M5V 2T6` or for the bare FSA `K1A`. Photon returned *other* postcodes (`M5V 2T3`, `M5C 2T6`) for `M5V 2T6`. OSM-based postcode lookup in Canada is patchy. Nominatim fills postcode gaps from optional per-country CSV files [N3], and its download page offers extra postcode files only for GB and the US [N4]. **For Canada, a local FSA table is more reliable than OSM.**

**Data quality caveat:** about 41% of GeoNames `CA.txt` rows have accuracy `1` (estimated) and 26% have `6` (centroid of addresses or shape) **(computed)**. Per the readme, 1 means estimated, 4 means taken from a GeoNames place and 6 means a centroid [G1]. That is plenty for a several-kilometre cell.

### 1b. Postal code: US ZIP

| Source | What it gives | Licence |
|---|---|---|
| **Census Gazetteer, ZCTA file** (`2026_Gaz_zcta_national.zip`, ~1.0 MB) [C2] | `GEOID`, land and water area, `INTPTLAT`/`INTPTLONG` = "latitude/longitude of the internal point" [C3]. 33,791 rows, pipe-delimited [C2] **(computed)** | US federal work: "Copyright protection under this title is not available for any work of the United States Government" [C4] |
| GeoNames `US.zip` (619 KB) [G2] | 41,489 ZIPs, but 96% have accuracy `4`, meaning the coordinates are a *place* from GeoNames, not a ZIP centroid [G1] **(computed)** | CC BY 4.0 [G1] |

**Caveat:** ZCTAs are Census statistical areas built from census blocks. They are not USPS ZIP Codes, and "not all valid ZIP Codes are represented by a 2020 ZCTA" [C1]. For PO-box-only or single-building ZIPs, fall back to GeoNames `US.zip`, then to "use my location".

### 1c. Typed address (and anything else via a geocoding service)

**Nominatim (nominatim.openstreetmap.org)**. Per the [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), which itself requires that anyone suggesting the service point to it prominently and explain its restrictions [N1]:

- "an absolute maximum of 1 request per second", counted as **the sum of traffic from all your users** [N1].
- "Provide a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries will not do)" [N1].
- "Clearly display attribution as suitable for your medium" [N1]. Data is under ODbL [N1].
- Use "directly triggered by the end-user … is ok". Apps should "set up a proxy and also enable caching", must be able to "switch the service at our request at any time", and "periodic requests from apps are considered bulk geocoding" [N1].
- **Forbidden:** client-side **auto-complete** ("you must not implement such a service on the client side"), systematic and grid queries ("searching for complete lists of postcodes"), and scraping [N1].
- "Please do not submit personal data or other confidential material to any of our services." [N1] A household's street address is personal data, which is the main reason **not** to offer typed addresses through public Nominatim.
- There is no SLA, and the policy "may change without notice" [N1].
- Structured search supports `postalcode=` and `countrycodes=` [N2].

**Photon (photon.komoot.io)**:

- "You can use the API for your project, but please be fair - extensive usage will be throttled." "We do not guarantee for the availability" [P2]. The README adds "Extensive usage will be throttled or completely banned" [P1]. No numeric limit is published [P2].
- Code is Apache 2.0 [P1]. The data is OSM, "Made with OpenStreetMap" [P2], so OSM attribution applies [O3].
- Self-hosting a planet-wide index needs about 95 GB of disk and 64 GB RAM recommended, plus Java 21+ [P1], which is out of proportion for this app.

**ODbL and storing results:** per the OSMF Geocoding Guideline (board-endorsed 2017-08-24), individual geocoding results "may be stored and used together with other proprietary or third party data" without share-alike, unless results are collected into a database holding "the whole or a substantial part" of OSM. "Applications that incorporate a geocoder must credit OpenStreetMap." [O3]

**Verdict:** typed address is technically possible within policy: server-side proxy, cache, a global queue of at most 1 request per second, no autocomplete, attribution. But it sends personal data to a third party, which that third party asks us not to do [N1]. It is also the riskiest route on the night, with no SLA [N1][P2], and it collects far more than a fuzzy area needs. Recommend not offering it.

### 1d. Browser geolocation ("use my location")

- Needs no third-party service. Only works in a secure context (HTTPS) [W1], and "requires express permission from an end-user before any location data is shared" [W1].
- Returns `accuracy` in metres at "the 95% confidence level" [W1]. `enableHighAccuracy` is only a hint [W1].
- The spec advises: "Recipients ought to only request position information when necessary" [W1]. That supports snapping in the browser and posting only the cell ID.
- Gotcha: desktop and laptop (porch kiosk) fixes may be IP- or Wi-Fi-based and can be off by kilometres. Show the resulting area name so the household can check it. **(design note, no source)**

### 1e. Map pin

Needs a map (section 4) but **no geocoder**. The pin's coordinates are snapped just like geolocation. To label the area ("near K1A" or "near 10001"), use the nearest-centroid lookup against the local postal tables. That is a *local* reverse geocode: running the public Nominatim on a grid of points is forbidden as a "systematic" query [N1], and a lookup per pin is unnecessary.

### 1f. Other countries

GeoNames postal files cover "nearly 100 countries" (`allCountries.zip`, 19 MB) under the same CC BY licence [G1][G2]. Some countries have only partial codes for copyright reasons (Chile, Ireland, Malta; Brazil major codes only) [G1]. Fallback for unsupported countries: "use my location" or a map pin.

---

## 2. Fuzzing techniques

### 2a. Snap to a grid cell or geohash (recommended)

- **How:** geohash splits the world into 32 cells, then each of those into 32, and so on. "The longer the shared prefix, the closer they are" [E2]. Cell sizes are in the table above [E1] **(computed)**. A plain decimal-degree grid (`Math.floor(lat/step)`) is even simpler, with no encoding.
- **Prefix property:** geohash supports a **coarser fallback for free**. If the 5-character cell (or block of cells) has fewer than *k* households, try the 4-character parent [E2]. A decimal grid needs a second grid to do the same.
- **Pitfall: edge effects.** "Two locations that are right next to each other may have completely different geohashes" [E2]. For "nearby", use the cell **plus its 8 neighbours** rather than the cell alone. Also do not let a household re-snap freely: if two slightly different entries land in two cells, together they reveal a boundary. Store one cell per household and change it only when the household explicitly changes its location. **(design note)**
- **Pitfall: sparse rural cells.** A 0.5 km² cell (geohash 6) may contain only one or two homes in the country. A deterministic cell does not hide a household that is the only home in it. Mitigate with a coarse default (geohash 5) plus the minimum-crowd rule (section 3).
- **Pitfall: displayed point.** If a point must be drawn, draw the **cell centre or outline**, not the household's own point.

### 2b. Random offset per household

- **Fresh noise on every view is unsafe.** Geo-indistinguishability (Andrés et al., ACM CCS 2013) shows that noise applied *n* times independently to the same point yields only *nε* privacy, a level that "scales linearly with n". "Having two observations about the same point reduces the level of privacy". The authors call the approach "only useful when the number of points is small" [A1]. Averaging many noisy copies converges on the true point.
- **A fixed offset per household** (drawn once and stored) avoids averaging, but its spread is still bounded. The true home lies within *r* of the shown point, and on a sparse road that circle can hold very few homes. **(design note)**
- It also gives no aggregation key: grouping "nearby" households still needs cells. So the grid does both jobs, and the offset does only one.
- If something must be stored precisely for computing distances, beware proximity oracles. Polakis et al. (ACM CCS 2015) located Facebook users to within 5 m and 90% of Foursquare users to within 15 m using only "is near / how far" answers. Both companies then switched to **spatial cloaking** (snapping) [A2]. **Never compute "nearby" from a stored precise point that strangers can query**, because fake sign-ups could trilaterate a home.

### 2c. Postal-area centroids

- Store the FSA or ZIP and use its centroid [G1][C3]. It is free, deterministic and immune to averaging.
- **Sizes vary enormously:** urban FSAs and ZCTAs are a few km². Rural ones are hundreds of km², e.g. FSA `T0A` "Eastern Alberta (St. Paul)" [G2], and the ZCTA 90th percentile is about 474 km² **(computed)** [C2]. Fine for privacy, but coarse for "nearby".
- **StatCan caveat:** census FSAs follow *reported* postal codes, so "some respondents' postal codes may fall outside the FSA in which their dwelling is located" [SC2]. That is irrelevant at this precision.
- **Combining with 2a:** map the postal centroid to its geohash-5 cell. Then postal-code users and geolocation users share one area model.

---

## 3. Minimum-crowd rules (small-count suppression)

| Agency | Rule | Source |
|---|---|---|
| CMS (US Medicare/Medicaid) | "no cell … containing a value of 1 to 10 can be reported directly". Also "no cell can be reported that allows a value of 1 to 10 to be derived from other reported cells or information". "A value of zero does not violate" the policy | [S1] (current version 2024-01-26) |
| CDC WONDER | "Statistics representing fewer than ten persons (0-9) are suppressed" (sub-national) | [S2] |
| CDC U.S. Cancer Statistics | "Statistics based on counts below 16 are not shown"; 16 is "more than sufficient to protect patient confidentiality" | [S3] |
| Statistics Canada, 2021 Census | **Area suppression:** areas with population < 40 are suppressed; the threshold is 100 for six-character postal-code areas and block-built areas; income needs ≥ 250 people or ≥ 40 households. **Random rounding:** values, "including totals, are randomly rounded either up or down to a multiple of '5' or '10'" | [S4][S5]. The 2021 Census Guide ch. 10 returned a bot-check (HTTP 403) to direct fetches on 2026-10-10, so its wording here comes from the search-engine excerpt of that page |
| k-anonymity (Sweeney 2002) | Each record "cannot be distinguished from at least k-1 individuals whose information also appears in the release". The paper also warns that releases meeting k-anonymity can still be re-identified "unless accompanying policies are respected" | [S6] |

**What this means for nearby households (proposals for 07, not decisions):**

- The unit is the **household**, not the kid. Publish nothing for an area (cell plus neighbours) until **≥ k distinct active households** are in it. Agency thresholds for people run 5–16 [S1][S2][S3]. With households, and a "live" signal more sensitive than a yearly statistic, *k* = 5 is a defensible floor and *k* = 10 a cautious one.
- **Block differencing** (CMS's "derived" clause [S1]). A household always knows its own numbers, so with *k* = 2 it learns the other household's numbers exactly. *k* ≥ 3 is the logical minimum, and ≥ 5 is safer. Also avoid nested or overlapping areas whose difference isolates a small group: geohash-5 with neighbours *and* geohash-4 shown together could do that. Show one level only.
- **Round kid counts**, e.g. to a multiple of 5 the way StatCan does [S5], and/or **delay** the live signal (e.g. last 30 minutes, refreshed every 10) so "kids at this door right now" cannot be tied to a home. **(design note)**
- **Fallback when below *k*:** a wider area via the geohash parent [E2], or the site-wide total. Never "1 household near you".

---

## 4. Showing it on a map

### 4a. OpenStreetMap standard tiles (tile.openstreetmap.org)

From the [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) [T1]:

- **Allowed:** "Normal interactive viewing by a human where the client requests only the tiles needed for the current viewport" [T1].
- **Attribution:** "Show OpenStreetMap licence attribution clearly on the map (typically bottom-right)". "Do not hide attribution beneath UI, behind toggles, or off-screen" [T1]. The OSMF Attribution Guidelines (adopted 2021-06-25) accept "OpenStreetMap" linked to openstreetmap.org/copyright, in any corner. They let the credit collapse after 5 seconds or on interaction, provided it can still be reached [O2]. The copyright page also requires making "clear that the data is available under the Open Database License" [O1].
- **Headers:** "Browsers are expected to send a valid `Referer` header". "Do not set a restrictive Referrer-Policy that prevents the `Referer` header being sent" [T1]. The app sets no Referrer-Policy or CSP today **(checked: no matches in `server/` and `public/`)**. If ticket 11 adds a CSP, it must allow `img-src https://tile.openstreetmap.org` and keep the Referer.
- **Caching:** never send no-cache headers; honour server caching headers. If a cache cannot read them, keep tiles for at least 7 days [T1].
- **Forbidden:** bulk downloading or prefetching ("any pre-emptive fetching of tiles other than those a user is actively viewing", "download for offline" buttons, "preloading entire towns") [T1]. "Offline use is not permitted on `tile.openstreetmap.org`" [T1].
- "Availability is best-effort: there is no SLA". "We may block access, without notice, if your usage degrades the service" [T1].
- **Fit:** a small public app with a few hundred interactive viewers fits "normal interactive viewing". The porch TV is a single static view, so it loads few tiles. But tiles are an **external, no-SLA dependency on Halloween night**, while v1's rule is no CDN on the night (`public/vendor/README.md`). A map must degrade to the text card when tiles fail. **(design note)**

### 4b. Vendorable map library

**Leaflet 1.9.4** (latest stable, released 2023-05-18; 2.0 is only at `2.0.0-alpha.1`, 2025-08-16 [L1][L3]):

- Licence: **BSD 2-Clause**, © 2010-2026 Volodymyr Agafonkin and © 2010-2011 CloudMade. Redistributions must keep the notice [L2], which is consistent with the MIT and ISC libraries already vendored.
- The download has `leaflet.js` (minified), `leaflet-src.js`, `leaflet.css` and `images/`. The `images/` folder "must stay in the same directory as `leaflet.css`" [L1]. No build step is needed for the dist files [L1].
- Size **(computed, from unpkg `leaflet@1.9.4`)**: `leaflet.js` is 147,552 bytes (42,578 gzipped) and `leaflet.css` is 14,806 bytes. 1.9.4 also ships `dist/leaflet-src.esm.js`, which matches the repo's "plain ES modules" convention [L3].
- Do not vendor the 2.0 alpha: it is a pre-release [L1][L3].

### 4c. Is a map avoidable? Yes, and that is recommended for the freeze

- "Nearby" (ticket 08) is an **aggregate**. A text or number card ("8 households trick-or-treating near you · ~240 kids in the last 30 min") needs no map, tiles, attribution or external dependency. The privacy floor is the same. **(design note)**
- If a visual is wanted, draw the cell and its 8 neighbours as an **inline-SVG 3×3 heat grid** with no basemap. That needs no tiles and works offline. Credit GeoNames wherever postal data is used [G1].
- A real map (Leaflet + OSM tiles) adds 160 KB of vendored assets, mandatory attribution and a no-SLA external call on the night [T1][L1]. Keep it for after Halloween unless 07 or 08 decides it is essential.

---

## Sources

All accessed 2026-10-10.

**OpenStreetMap / OSMF**
- [N1] OSMF, *Nominatim Usage Policy*: https://operations.osmfoundation.org/policies/nominatim/ (no last-updated date shown)
- [N2] Nominatim docs, *Search*: https://nominatim.org/release-docs/latest/api/Search/
- [N3] Nominatim docs, *External postcode data*: https://nominatim.org/release-docs/latest/customize/Postcodes/
- [N4] Nominatim, *Downloads* (extra postcode data for GB, US): https://nominatim.org/downloads/
- [T1] OSMF, *Tile Usage Policy*: https://operations.osmfoundation.org/policies/tiles/ (no last-updated date shown)
- [O1] OpenStreetMap, *Copyright and License*: https://www.openstreetmap.org/copyright
- [O2] OSMF, *Attribution Guidelines* (adopted 2021-06-25): https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- [O3] OSMF, *Geocoding – Guideline* (endorsed 2017-08-24): https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline

**Photon**
- [P1] komoot/photon README: https://github.com/komoot/photon
- [P2] Photon public API page: https://photon.komoot.io/

**GeoNames**
- [G1] GeoNames postal code readme: https://download.geonames.org/export/zip/readme.txt
- [G2] GeoNames postal code downloads (file listing dated 2026-10-10): https://download.geonames.org/export/zip/

**Statistics Canada / Canada Post**
- [SC1] Statistics Canada Open Licence: https://www.statcan.gc.ca/en/reference/licence
- [SC2] *Census Forward Sortation Area Boundary File, Reference Guide, 2021* (92-179-G2021001): https://www150.statcan.gc.ca/n1/pub/92-179-g/92-179-g2021001-eng.htm
- [SC3] Statistics Canada, *Postal Code OM Conversion File (PCCF) Access, licence terms*: https://www.statcan.gc.ca/en/microdata/dli/application/section1
- [CP1] Canada Post, *Request for Licensed Data Products* (form DK20442, 2022-01): https://origin-www.canadapost.ca/cpc/doc/en/business/request-for-licensed-data-products-form-en.pdf

**US Census Bureau / US law**
- [C1] Census Bureau, *ZIP Code Tabulation Areas (ZCTAs)*: https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html
- [C2] Census Bureau, *2026 Gazetteer Files* (ZCTA national file): https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html
- [C3] Census Bureau, *Gazetteer File Record Layouts*: https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts.html
- [C4] 17 U.S.C. § 105: https://www.law.cornell.edu/uscode/text/17/105

**Geolocation, geohash, H3**
- [W1] W3C, *Geolocation* (Candidate Recommendation Snapshot, 2026-03-26): https://www.w3.org/TR/geolocation/
- [E1] Elastic, *Geohash grid aggregation* (cell-size table): https://www.elastic.co/guide/en/elasticsearch/reference/8.4/search-aggregations-bucket-geohashgrid-aggregation.html
- [E2] Elastic, *Geohashes* (prefix property, edge caveat): https://www.elastic.co/guide/en/elasticsearch/guide/current/geohashes.html. geohash.org, the original 2008 description, did not resolve on 2026-10-10.
- [H1] H3, *Tables of cell statistics across resolutions*: https://h3geo.org/docs/core-library/restable/

**Leaflet**
- [L1] Leaflet, *Download*: https://leafletjs.com/download.html
- [L2] Leaflet `LICENSE`: https://github.com/Leaflet/Leaflet/blob/main/LICENSE
- [L3] npm registry, `leaflet` dist-tags (latest 1.9.4, alpha 2.0.0-alpha.1): https://registry.npmjs.org/leaflet, and `leaflet@1.9.4/dist/` on unpkg

**Privacy research and suppression practice**
- [A1] Andrés, Bordenabe, Chatzikokolakis, Palamidessi, *Geo-Indistinguishability: Differential Privacy for Location-Based Systems*, ACM CCS 2013: https://arxiv.org/abs/1212.1984 (§3.3, §5.3)
- [A2] Polakis, Argyros, Petsios, Sivakorn, Keromytis, *Where's Wally? Precise User Discovery Attacks in Location Proximity Services*, ACM CCS 2015: https://www.cs.columbia.edu/~angelos/Papers/2015/ccsfp064-polakis.pdf
- [S1] ResDAC (CMS), *CMS Cell Size Suppression Policy* (version 2024-01-26): https://resdac.org/node/1506
- [S2] CDC WONDER, *Underlying Cause of Death help, suppression*: https://wonder.cdc.gov/wonder/help/ucd.html
- [S3] CDC, *U.S. Cancer Statistics: Suppression of Rates and Counts*: https://www.cdc.gov/cancer/uscs/technical_notes/stat_methods/suppression.htm
- [S4] Statistics Canada, *Guide to the Census of Population, 2021, Chapter 10*: https://www12.statcan.gc.ca/census-recensement/2021/ref/98-304/2021001/chap10-eng.cfm (bot-check blocked direct fetch; wording from the search-index excerpt)
- [S5] Statistics Canada, *About data tables, 2021 Census of Population* (random rounding): https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/dt-td/about.cfm (same caveat)
- [S6] Sweeney, *k-anonymity: a model for protecting privacy*, Int. J. Uncertainty, Fuzziness and Knowledge-Based Systems 10(5):557–570, 2002: https://dataprivacylab.org/projects/kanonymity/
