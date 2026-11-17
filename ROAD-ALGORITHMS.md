# TourVista algorithm integration

The homepage is a catalog. Search, minimum/maximum unit price, minimum actual review rating and required amenities reduce the candidate set. Ratings are never manufactured for sample campsites. Dates and guests are selected on campsite details, where available-unit checks exclude confirmed/checked-in stays and closures.

Use **Map** for street labels or **Satellite** for overhead imagery on campsite, booking, itinerary, and owner location maps. Changing the background preserves the pins, route, and check-in boundary. Satellite uses the EOxCloudless 2025 Sentinel mosaic under its non-commercial license for capstone use. At close zooms, the imagery enlarges without gaining detail. [Imagery attribution and license](https://cloudless.eox.at/license-non-commercial)

## Haversine and TOPSIS

Haversine uses R = 6,371 km and coordinates in radians:

```
a = sin²(Δφ/2) + cos(φ1) cos(φ2) sin²(Δλ/2)
d = 2R asin(sqrt(clamp(a, 0, 1)))
```

This measures geographic distance, not road travel distance. Stay comparison applies the homepage filters and date/capacity eligibility first, then TOPSIS compares price and geographic distance as costs and checklist amenity count as a benefit. It normalizes criterion vectors, removes non-distinguishing columns, normalizes active importance weights, calculates ideal/anti-ideal separation and ranks by closeness. Equivalent scores share ranks. Rating remains a filter; WSI remains a separate assessment.

## Dijkstra road planning

On campsite details, a signed-in tourist chooses an origin manually or presses **Use my location**. On **My reservations**, **Route to my booking** binds the destination to that tourist's active booked unit on the server.

1. Fetch the same fixed regional OpenStreetMap area for every user: south 8.50, west 124.75, north 8.78, east 125.08. No tourist origin coordinates are inserted into this public query.
2. Build directed edges between consecutive recorded nodes of motor-road ways. Respect supported one-way values and motorcar/motor-vehicle/vehicle/general access precedence. Exclude explicitly restricted roads, unsupported conditional permissions and most barriers conservatively. Missing coordinates do not create bridging edges.
3. Weight each edge with its Haversine length in km. Build adjacency lists and use a binary minimum heap in Dijkstra to obtain the shortest recorded distance between the selected road nodes.
4. Snap each location to its nearest routable node within 2 km. Display these geographic access connections separately as dashed lines; the computed road path is solid. Access connections are not verified entrance roads.
5. Show road names, road distance, geographic distance, separate connector distance, snapshot source/time and a content-hash graph version. Cache successful fixed-area snapshots for one hour, deduplicate concurrent downloads, limit response/graph size, time out requests and back off after failed retrieval.

No route is returned for missing/disconnected data, excessive access distance or origins outside coverage. No straight line is substituted for a missing road route. The public service may be busy or unavailable. Starting coordinates and completed road routes are not persisted by this endpoint; map tiles request the displayed geographic area. TOPSIS records retain comparison distances/scores separately.

The algorithm optimizes distance between the snapped nodes in the recorded graph. **My itinerary** uses the same graph for every leg in the saved stop order. Connected legs appear separately on the map. The total road distance appears when all legs connect. Confirm entrances, surface conditions and access with the owner, particularly when using demonstration campsite coordinates.

### Driving from another city

**Preview driving route** requests a car route from the OSRM service and displays the returned road geometry on the TourVista map. The route follows the selected start, booked entrance, or saved itinerary order. OSRM uses its driving profile to estimate time. The map separates short, unverified links from the routed roads when the provider snaps an entrance or start to the nearest mapped road. [OSRM route service](https://project-osrm.org/docs/v5.22.0/api/#route-service)

TourVista sends rounded starting and destination coordinates only after the traveler submits the driving preview. The public provider logs route requests. The default FOSSGIS instance is intended for light, non-commercial testing. TourVista spaces public requests at least one second apart. For broader pilot traffic, set `DRIVING_ROUTER_URL` in `server/.env` to an operator-approved OSRM service base URL. The local Dijkstra route uses the separate Claveria graph and fixed-area Overpass queries. [FOSSGIS service policy](https://routing.openstreetmap.de/about.html) · [OSRM demo service](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)

### Use a saved pilot road snapshot

Save an operator-checked OpenStreetMap Overpass JSON export for the fixed Claveria area, with its road ways and referenced nodes. This query produces the expected shape:

```text
[out:json][timeout:20];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$"](8.50,124.75,8.78,125.08);
(._;>;);
out body;
```

Place the file at `server/storage/roads/claveria-overpass.json` and set `ROAD_SNAPSHOT_PATH=storage/roads/claveria-overpass.json` in `server/.env`. After restart, both route planners read the configured file. The application labels the saved source and shows the available OSM data timestamp and file update time. Check its age and the campsite entrances before the pilot. The planner accepts files up to 12 MB. Keep OpenStreetMap attribution and its database license with any copy of the data. [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)

The query and direction/access handling follow the primary [Overpass QL documentation](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL), [one-way tags](https://wiki.openstreetmap.org/wiki/Key:oneway) and [access tags](https://wiki.openstreetmap.org/wiki/Key:access). Public-service usage should follow the [Overpass API instance guidance](https://wiki.openstreetmap.org/wiki/Overpass_API); a public deployment needs a suitable service arrangement.

## Greedy interval scheduling and allocation

Owners select **Suggest compatible requests** for one unit. Eligible pending requests must fit the current capacity and active listing/unit, and avoid confirmed stays and closures. Sort by earliest finish, break ties deterministically, then retain a request when its start is at or after the last chosen finish. Under the unweighted single-unit assumptions this selects a maximum-cardinality compatible subset. It does not optimize revenue or fairness and does not automatically approve requests. Approval performs the conflict/capacity checks again inside the storage transaction/lock. Occupancy is half-open `[check-in, check-out)`.

## Ray Casting and check-in

Only the current confirmed reservation holder may use GPS check-in during the stay. Ray Casting counts polygon ray intersections with explicit segment handling. A separate GPS-accuracy test checks whether the uncertainty radius fits inside the boundary. Outside, missing and uncertain locations are not silently accepted. Owners can record assisted check-in with a reason. Demo simulation is distinctly recorded as `demo`.

## Weather Suitability Index

WSI uses the paper's five factors:

| Factor | Proposed score |
| --- | --- |
| Rain probability P (%) | R = 100 − P |
| Mean temperature T (°C) | K = clip(100 − 10 × max(20 − T, 0, T − 28)) |
| Weather condition | Q from the paper's WMO-code mapping |
| Maximum wind V (km/h) | W = clip(100 × (1 − V/40)) |
| Any hourly thunderstorm flag H | S = 100 × (1 − H) |

`WSI = .20R + .20K + .20Q + .20W + .20S`, capped at 39 on a thunderstorm day. Clip scores to 0–100. Require complete daily factors and 24 valid hourly codes, classify the unrounded result, and use the lowest daily score from arrival through departure day. Panels show factor values, provider, retrieval time, version and unavailable/stale states. Administrator changes are versioned. WSI is the proposed descriptive model; it is not a validated safety probability and does not bypass owner decisions, closures or official advisories.
