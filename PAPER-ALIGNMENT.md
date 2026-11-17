# TourVista capstone implementation guide

The supplied **Chap1-3** is the requirements source. Its Section 3.6 and algorithm definitions in Sections 3.7.4–3.7.8 take priority over illustrative screenshots and flowchart labels. This application uses an original layout and illustrations; sample names and totals from the pictures were not copied.

## Website sequence

Visitors enter an undated campsite-catalog homepage and apply text, price-range, rating and amenity filters. Clicking a campsite opens its own detail page; dates, guests and map tools are placed there. A full details page shows amenities, rules, reviews, map, weather and unit availability. Tourist sign-in continues to that campsite's stay/contact form. A separate review stage checks availability again and presents the current accommodation estimate. Submission stores one pending request, opens its receipt and provides reservation tracking. An authorized owner approves or rejects it; confirmed holders may check in during the stay. Checked-in stays can be completed after departure, then the holder may submit one review.

Owner pages provide private listing drafts, ownership evidence submission, unit/closure management, guest decisions, weather, scheduling advice, assisted check-in and reports. Administrators review the immutable submitted listing revision and private proof before approving publication, return submissions with reasons or suspend approved listings. They retain account/access control, read-only reservation oversight, review moderation, WSI settings, recovery, audit and backup/restore. Each new booking preserves its campsite coordinates and boundary for routing, weather and check-in. The authenticated role comes from the server; a role choice after login cannot grant access.

| Paper requirement | Implemented location | Prototype limit |
| --- | --- | --- |
| FR01 Accounts/permissions | Auth forms; API role/ownership checks; admin account controls | Ownership evidence is manually reviewed per listing. Email verification, password changes and emailed reset links work in local preview mode; real inbox delivery requires SMTP setup. Existing accounts retain access, without inferring verified mailboxes. |
| FR02 Catalog | Owner drafts → private PDF/JPEG/PNG proof → admin review → approved listings; complete property/contact/arrival policies, units, uploaded photo galleries, GPS/map pin and optional perimeter | Ownership evidence accepts 1–2 files up to 1 MB each. Property galleries accept six JPEG/PNG uploads or HTTPS links; reviewed revisions are immutable. Demo records are fictional and explicitly exempt from real ownership claims. |
| FR03 Discovery | Homepage text, min/max nightly price, minimum actual rating and required amenities; stay dates/capacity in details | Ratings are from visible completed-stay reviews. Changed filters require applying again; old results are labelled. |
| FR04 TOPSIS | Eligible filtered candidate ranking; weights, directions, scores and raw criterion values | Comparisons depend on this candidate set; results are not weather safety scores. |
| FR05 WSI | Daily/stay panels, source/time/version/factors, thunderstorm flag, unavailable/stale states | Proposed parameters need domain/pilot validation. |
| FR06 Maps/routes/itinerary | In-app OSRM driving routes across cities and an optional local Dijkstra calculation over a fixed-area OSM graph, on campsite, booking and itinerary maps | Identify the two route methods separately in the defense. Check entrances and road access in the field. |
| FR07 Requests | Stay/contact form → review → pending receipt | No online payment; legacy price backfill is an estimate. |
| FR08 Decisions/schedule | Locked conflict checks; owner decisions; greedy advisory | MySQL adapter included but not tested with a live MySQL server. |
| FR09 Check-in | Holder/time checks; ray casting; GPS uncertainty; logged owner assistance | Physical GPS/field policy validation remains necessary. |
| FR10 Reviews | Completed holder only; duplicate prevention; moderation audit | Example completed stays exist for demonstration. |
| FR11 Oversight | Role workspaces, actual-record reports and audit | Reports show quotes/statuses, not collected revenue. |
| FR12 Recovery | Private export, validated timestamped backup command, recovery copy and restore | Configure daily private backups and rehearse recovery on the pilot host. |

## Six algorithms and where to demonstrate them

| Algorithm | Website control | Implemented rule |
| --- | --- | --- |
| TOPSIS | Campsite details → Compare campsites for this stay | Eligible dates/capacity/filters first; price and distance are costs, amenity count is a benefit. Vector normalization, normalized nonnegative weights, ideal/anti-ideal distances and relative closeness. Zero denominators, equivalence, single candidates and shared ties are handled. |
| Haversine | Stay comparison; road edge lengths and separate origin/access connections | Earth radius 6,371 km; radians; intermediate clamped to [0,1]. Geographic distance is labelled separately from recorded graph distance. |
| Proposed WSI | Details/request/reservation weather panel | R=100−P; K=clip(100−10×max(20−T,0,T−28)); Q uses Table 9 WMO mapping; W=clip(100×(1−V/40)); S=100×(1−H). Baseline weights .20; full hourly coverage; thunderstorm cap 39. |
| Dijkstra | Campsite or booking route panel → Local Dijkstra route (Claveria) | Adjacency lists plus a binary min-heap; nonnegative Haversine road lengths; directed one-way/access filtering; predecessor road path. Versioned public snapshot, disconnected/unavailable explanations and separate access connectors. |
| Greedy interval scheduling | Owner pending request → Suggest compatible requests | Per unit, reject blocked/closed intervals, order by earliest finish and retain compatible intervals. Unweighted maximum-cardinality advice; never auto-approves. |
| Ray casting | Confirmed tourist GPS check-in | Polygon segment check and consistent ray intersections. GPS uncertainty is a separate boundary-distance check. Missing/uncertain location refers to operator assistance. |

WSI classifies the unrounded score at 80/60/40, then displays rounded values. The stay score is the lowest daily value from arrival **through departure day**. Required weather values must be complete; missing factors are not hidden by renormalizing weights. Forecast snapshots include requested dates, coordinates, timezone, source, units, retrieval time and version. Cache age is one hour. A stale previous result is not represented as a current assessment. Weather supports planning and does not bypass closures, approval or official PAGASA guidance.

Occupancy instead uses half-open `[check-in, check-out)` dates, permitting adjacent stays on a unit. Demo writes are serialized and atomically persisted. MySQL writes share the application lock and locked unit rows, so approvals and closures recheck conflicts inside one transaction. Retries of the same submission, approval or check-in return the recorded result without duplicate confirmation/check-in events. Backend restarts end in-memory sessions; saved records remain.

## Capstone evaluation still required

Passing software tests do not demonstrate the paper's pilot targets. Gather authorized real campsite data/photos/boundaries and a validated road graph; test the MySQL deployment; review WSI parameters with the adviser/domain reviewers; test physical GPS and accessibility tasks; measure the stated concurrency, latency, usability and recovery targets. These outcomes are not claimed by this local prototype.

## Road planning and privacy

For the local Dijkstra preview, Overpass queries use a fixed Claveria area. For the driving preview, TourVista sends the coordinates to the OSRM service when the tourist submits the preview. The public service logs route requests. A booking route verifies tourist identity, ownership and active status before using the entrance recorded with that booking. [Road setup and coverage](ROAD-ALGORITHMS.md)

## Listing approval and algorithm eligibility

The marketplace approval extension does not change the paper’s algorithm definitions. Public search and TOPSIS exclude draft, pending, rejected, suspended, inactive or disabled-owner listings. New booking submissions and owner approvals recheck publication and availability inside the existing atomic transaction. Haversine and Dijkstra remain connected to the receipt and active-booking planner; Greedy advice remains owner-only; Ray-Casting uses the booked boundary; WSI retains all five factors and coordinate-specific forecast caching. Document upload is not an automated legal legitimacy assessment. See HOST-AND-ADMIN-GUIDE.md for review, privacy and migration behavior.

## Marketplace interface update — 21 October 2026

The public catalog now uses a photo-led grid, search bar, real amenity/price/rating shortcuts and a combined Filters dialog. The same applied filters continue to form the eligible TOPSIS candidate set. There are no home-page stay schedules or standalone discovery/map pages. Gallery stock images are explicitly illustrative and restricted to fictional demo records; they do not assert real property identity or location.

The campsite booking card shows the selected night count and accommodation estimate, and checks availability before continuing. Guest sign-in retains the selected campsite and in-session trip. The existing unit/contact form, acknowledgement, pending request, host acceptance, booking-bound route, Ray-Casting check-in and completed-stay review sequence is unchanged. Saved campsites are a browser-local convenience, not a new algorithm or a server-backed capstone claim. Account roles and ownership evidence remain enforced by the backend.

## Email accounts update — 10 November 2026

New tourists and owners use email confirmation before new bookings or listing submission. Signed-in users can change their password with current-password verification; forgotten passwords use expiring single-use links. You chose local preview delivery first: no messages reach a real inbox. This is separate from ownership evidence, roles and all six campsite algorithms. Existing access is preserved. Read `EMAIL-AND-PASSWORD-GUIDE.md` for testing and later SMTP configuration.
