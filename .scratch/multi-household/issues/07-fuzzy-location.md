# Fuzzy location

Type: grilling (HITL)
Status: open
Blocked by: 02

## Question

How does a household set its location, how fuzzy is it, and who sees what?

- **Input**: postal code, address, "use my location", or a map pin. Choose from what [Geocoding and location-fuzzing options](02-geocoding-and-fuzzing-options.md) shows is free and allowed.
- **Fuzz**: method and size (e.g. a ~1 km grid cell, a postal-area centroid). Do we ever store the precise point, or fuzz before saving?
- **Opt-in**: is location required at sign-up, optional, or only needed to appear in nearby?
- **Who sees it**: other households, shared-TV viewers, the operator dashboard, the public. With a minimum number of households per area before anything shows.
- **The live signal**: "kids at this door right now" plus an area could tell someone a home is busy (or that its people are at the door). Is anything live shown per household, or only area totals, or delayed?
- Settle **Location** / **Area** in [CONTEXT.md](../../../CONTEXT.md).
