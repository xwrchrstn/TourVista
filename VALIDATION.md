# Current-location start pin

The route planner now starts without a selected origin and requests a fresh device fix on **Use my current location**. The map labels the blue device pin and green campsite pin before the preview. The user can correct the start on the map, which clears the previous route.

An isolated browser test used a simulated Villanueva device fix with 32 m accuracy and checked both pins before drawing a live **25.66 km** route to the booked demonstration campsite. The test also verified the manual map correction. The build and **115 automated tests** passed. The simulated fix is separate from on-device GPS testing.

# In-app driving routes

The booking and itinerary previews drew live OSRM geometry inside TourVista. The demo booking from an example Cagayan de Oro starting point to Cloud View showed **50.66 km** and **1 hr 3 min**. The demo itinerary through two stops showed **59.83 km** and **1 hr 18 min**. The browser stayed on the booking and itinerary pages. The test used entered example coordinates and an isolated demo account. Device GPS and actual entrance access require field testing.

The production build and **114 automated tests** passed. New checks covered provider geometry, stop order, booking-bound destination validation, public request pacing, and unavailable results. The local Dijkstra tests passed as part of the suite.

# Previous intercity directions implementation — 11 November 2026

The campsite and active-booking arrival panels and saved itinerary stops now link to Google Maps driving directions for the selected entrance pin. Users choose their starting city in Maps. The link includes the campsite coordinates and driving mode with no traveler coordinates, reservation identifiers, or referrer.

The browser check confirmed the campsite link, the saved booking entrance, and two itinerary stop links. With a synthetic origin outside the Claveria graph, the booking showed the local coverage message while the driving directions link stayed available. The check verified the Maps link and did not request device location or calculate an external driving trip. The production build and **111 automated tests** passed.

# Itinerary and pilot verification — 11 November 2026

- **110 automated tests passed** and the production build passed. The isolated role workflow covered a synthetic owner listing and boundary, administrator approval, tourist reservation, owner confirmation, the booking-bound Dijkstra path, and uncertain and successful GPS inputs. Competing reservations were checked in the demo store.
- Browser verification used an isolated synthetic road network. The itinerary showed one connected leg and one disconnected leg in the saved order. The map drew the connected path and the panel reported the reason and straight-line distance for the missing leg. The direct public-provider check returned unavailable. Saved-file routing passed with an isolated road fixture. The pilot still needs an operator-checked road file or working provider access and a field drive to the actual entrance.
- The local catalog rehearsal handled 100 requests from 20 simultaneous simulated sessions against 100 synthetic listings using the demo store on Windows and Node 24.21.0. Median response was **58.3 ms** and p95 was **77.2 ms** against the paper's 2-second target. The run measured local HTTP responses including JSON parsing. Repeat it against the intended pilot environment for deployment evidence.
- WSI produced **88** and **39** for the paper's TC04 and TC05. The five weighting variations and sample temperature and wind variations completed. In the cool and windy example, emphasizing wind moved the score from **81.00** to **78.25** and changed the suitability category. Adviser and domain review remain pilot work.
- An isolated backup file was validated, restored and reopened with reservation and model relationships intact. The recorded restore drill took **108 ms** on the synthetic demo dataset. Daily scheduling, live MySQL recovery, delivery to a real inbox, physical GPS checks, and participant evaluation still need the pilot setup.

# Clearer design and decision tools — 10 November 2026

The frontend now uses a coordinated cream, forest and sage theme across public pages, workspace navigation, dashboards, listing forms and reservation records. Shared decision-tool components introduce each result in plain language and retain visible algorithm names with expandable explanations. No backend formulas, approval rules or account permissions were changed.

## Automated checks

- **107 tests pass**, with no failures, skips or cancellations in the final run. Six new presentation checks cover normalized user preferences, zero weights, unrounded WSI classification boundaries, missing weather and storm wording, provider condition labels, real calendar dates, relative match-index formatting and the checkout-exclusive check-in window.
- The React production build succeeds without the large-chunk warning. Comparison, weather, arrival planning, account settings, the campsite editor and reports load on demand. No dependencies or external design assets were added.
- An initial suite run hit an intermittent existing local-mail-preview fixture failure. The isolated account suite and both subsequent full runs passed; account-service code was not changed for this visual update.

## Browser checks

The public detail page displayed actual TOPSIS results for the example Claveria origin and selected stay, including the budget preset, geographic distances, candidate ranks and decimal match indices. Missing reviews remain visibly unrated. The match index is explained separately from review ratings, WSI and route distances. Presets, relative-importance sliders, explanatory disclosures and available-stay context were checked.

The Open-Meteo WSI brief returned a current cached assessment for 10–11 November during checking. Its lowest daily score, classification, condition labels, raw forecast values, all five factor scores and retrieval time rendered correctly. Changing departure date hid the earlier brief and marked the campsite comparison for recalculation. No weather was invented or shown as a safety guarantee.

Owner and administrator demo workspaces loaded. Owner requests retained individual accept/decline actions, Greedy advice displayed the actual zero-eligible-request result, and confirmed bookings outside their stay window showed check-in guidance without an arrival action. The administrator WSI panel displayed factor names, contributions, version and scoring thresholds. No booking, approval, check-in, profile, model version or credential was changed during browser verification.

The tourist booking-bound arrival panel was checked with the public example coordinates. The road provider returned unavailable; the panel explained the missing road data, kept geographic distance separate and did not draw a road path. Successful public-service route retrieval was therefore not verified in this session. Existing directed-graph and shortest-path tests pass. Location permission was not requested.

The default 1,280-pixel desktop and temporary 390-pixel mobile layouts were inspected. The mobile comparison had no document overflow, and the temporary viewport override was reset. No browser error messages were captured in the final check. Demo sessions were signed out and the preview returned to the public homepage. Clean screenshots are saved outside the source project.

## Retained limits

The WSI parameters still require domain validation; regional road data still excludes live traffic and complete turn restrictions. Physical GPS, surveyed boundaries, live MySQL and public deployment were not tested in this design update. Existing records and private settings are preserved, and source archives exclude them. Read SMART-TOOLS-GUIDE.md for the updated button labels and role-specific steps.

# Map background repair — 10 November 2026

The campsite map reproduced OpenStreetMap's blocked-request image. The global account-link `no-referrer` setting also applied to map image requests, conflicting with the tile provider's requirement for a valid website Referer. Both the public campsite/route map and the owner GPS/pin editor now explicitly use `strict-origin-when-cross-origin` on their tile images. Only the website origin is sent to the external tile server; page paths, query strings and link tokens are excluded. Account pages retain the global no-referrer setting. No proxy, alternate identity, cache-busting or provider switch was introduced.

Browser verification confirmed the error images were replaced with the normal map on the campsite detail page and in a new unsaved owner draft. Tile elements carry the intended policy, attribution remains visible, and campsite markers/perimeters remain rendered. No GPS permission was requested, no origin/road query was submitted, and no listing or booking was saved. The demo session was signed out afterward. A public campsite screenshot is stored outside the source project.

All 18 existing algorithm and road-graph checks pass, and the production build succeeds. Haversine, TOPSIS, Dijkstra, Greedy Interval Scheduling, Ray-Casting and WSI are unchanged. This repairs base-map loading; it does not change live road-data availability or the regional route coverage described below.

References: [OpenStreetMap tile usage and Referer requirements](https://operations.osmfoundation.org/policies/tiles/), and the installed Leaflet 1.9.4 TileLayer `referrerPolicy` option. This is a frontend correction; the backend does not need restarting.

# Password recovery link visibility — 10 November 2026

Every shared sign-in form now places a keyboard-accessible Forgot password link directly below the password field, beside Show password and above Sign in. Browser checks confirmed the main tourist login, owner/admin login aliases and the sign-in shown before a reservation. Each opens the existing recovery page; a booking continuation keeps its original campsite destination. Seven existing navigation/account-link checks and the production build pass. No live recovery email, credential change or account mutation was submitted. This frontend update needs only a browser refresh.

# Gmail connection and basic account flows — 10 November 2026

The complete suite now has **101 passing tests**, no failures/skips/cancellations, and a successful React production build. Five new checks cover the Gmail preset, App Password/input validation, preserving unrelated and concurrent environment configuration, TLS-protected SMTP transport, sanitized failure hints, and registration/reset routing for both account types. SMTP transports are replaced in memory during automated tests: no real Gmail message or credential is used.

The private setup command verifies the sender connection, asks before sending a single connection test to the selected sender address, then atomically updates only mail settings. Its secret prompt is masked. Normal email links now supply their token automatically; manual token entry is confined to a collapsed local-preview fallback. Email preview versus real SMTP mode is explicitly logged at startup.

Browser checks confirmed that a synthetic reset-link token is handled without showing a code field, while the Forgot password page presents a single email field and Send reset link. No password was entered and no recovery request was submitted in the live site. A screenshot of the basic recovery form is saved outside the source project.

Automatic approval review rejected executing the interactive sender setup because it could save an App Password and send a test before sender/recipient authorization. It was not rerun through another method. Configuration and SMTP behavior were tested with synthetic inputs only; the account holder must complete the private credential step and confirm real receipt. No `server/.env` with actual sender credentials was created by the agent.

# Email and password verification — earlier checks on 10 November 2026

**96 tests pass** with no failures, skips or cancellations. The React production build succeeds. The 82 earlier checks remain in the suite. The new account suite and link parser use synthetic accounts, private test outboxes and isolated stores.

- Both tourist and owner registration validate email, normalization, duplicate ownership restrictions and matching confirmation. Email and property-ownership status remain separate, and request-supplied verified/admin flags cannot grant access.
- New unconfirmed tourists cannot submit bookings; new owners can prepare drafts but cannot submit ownership evidence. Confirming the linked address permits the appropriate role action.
- Verification messages contain random 256-bit one-use links valid for 24 hours. Database values contain hashes only. Expiry, invalid tokens, reuse, resending, relationship checks and persistence are exercised.
- Password change requires an active session, the current password, a different 10–128-character new password and matching confirmation. Tests for both roles check wrong credentials, mismatches, session revocation, invalidated reset links and subsequent old/new-password sign-in behavior.
- Forgot password returns the same body for known/unknown accounts and validates CSRF. Reset tokens expire after 15 minutes, survive only as hashes, are single use and are consumed atomically even during competing requests. Notifications never contain passwords.
- Tests cover rate limits, private preview files, trusted APP_URL origin despite incoming forwarded-host headers, failed delivery without credential leakage, retries, legacy upgrades and backup relationships. Restore invalidates outstanding account links.
- Nodemailer 10.4.0 was added, with exact workspace lockfiles. A Windows workspace-link restriction required separate frontend/backend installation; the portable `npm.cmd run setup` and launcher support that layout.
- A fresh source-only copy successfully completed `npm.cmd run setup` and the production build. The targeted restore suite also passes with explicit assertions that outstanding verification/reset links are invalidated.

Browser verification confirmed both tourist and owner settings, registration account-type selection, current/new/confirm password fields, verification guidance, Forgot password and reset-form navigation against the matching `email-accounts-1` API in preview mode. No live passwords, listings, bookings or ownership documents were changed. A demo-only account screenshot is saved outside the source project. The browser was returned to the signed-out homepage.

Real inbox delivery was deliberately not configured or tested, following the user's local-testing choice. Preview confirmation is a simulation, not mailbox ownership proof. SMTP transport configuration is included and requires a provider and later end-to-end delivery checks. MySQL schema and startup migrations are supplied but still need live database integration testing. Source ZIPs exclude preview messages, runtime records, provider secrets and dependencies.

# TourVista verification record — 5 November 2026

The complete listing editor and approval-only publication update passes **82 tests**, with no failed, skipped or cancelled tests. The production React build succeeds; the editor loads separately from the initial bundle. No dependencies were added.

## New checks

- Complete owner draft creation, custom first-unit capacity, editing, nine-item submission readiness and explicit entrance confirmation.
- JPEG/PNG signatures, dimensions, byte limits and checksums; actual-owner upload permission, matching revisions, immutable pending galleries and cross-property reference rejection.
- Private draft images/details, saved review dossiers, decline with feedback, correction/resubmission and administrator-only approval. Approved business address, contacts and arrival instructions become public as explicitly requested; ownership evidence and original file names remain private.
- Approved-only TOPSIS eligibility, an independently dominating price/distance/amenity fixture, and booking snapshots of approved photos, price and location.
- Later unapproved edits cannot leak new details or media. Existing booking holders retain the original recorded image and route destination, while other tourists cannot access private draft media.
- Boundary validation rejects self-crossings, repeated points, collinearity and invalid coordinates before Ray-Casting. A submitted perimeter must contain the entrance.
- Backup validation retains photo hashes and snapshot relationships, rejects tampered media, and accepts genuine legacy records without inventing guest policies.
- All earlier algorithm, account, role, booking, scheduling, weather, check-in, recovery and road-graph tests remain in the 82-test suite. Workflow changes use isolated stores and synthetic proof, not live approval decisions.

## Current verification limits

Browser verification used the matching `capstone-listings-2` API. The owner studio, five editor steps, manual coordinate entry, entrance confirmation, map tiles, gallery controls and disabled incomplete submission were checked. The 1,280×900 desktop and default narrow layouts had no document overflow; the temporary size override was reset. The admin review register loaded and no live listing decision or reservation was made. Combined ₱400–₱600 and Parking filters returned the matching campsite, then filters were cleared. The site was returned to its signed-out homepage and a screenshot saved outside the source project. Actual GPS permission was not requested.

MySQL migrations and schema are included but were not exercised against a live MySQL server. Physical GPS, surveyed boundaries, road access and document authenticity require real-world validation. Manual admin approval is not legal certification. Live road-data availability, traffic and turn restrictions remain as described below. Public deployment was not performed.

Gallery files remain in the protected prototype store to preserve old submissions and bookings: up to six active photos and forty retained uploads per campsite. Removing a gallery reference does not delete historical bytes. Administrator JSON restore is limited to 32 MB; larger galleries need a production media and backup strategy. Source archives exclude all runtime records, media uploads, ownership evidence, secrets and backups.

# Previous verification records

Marketplace interface, booking experience and retained host/tourist separation checked on 21 October 2026 in the local Windows workspace.

## Automated verification

- **71 tests passed**, no failed, skipped or cancelled tests. All existing algorithm, session, booking, catalog, review, recovery and routing checks remain in the suite. New checks use synthetic documents and isolated persistent stores; they do not approve live bookings or upload personal evidence.
- New workflow tests cover draft creation by unverified owners, forged ownership/approval fields, private unpublished details, search and TOPSIS eligibility, file type/signature/size validation, required declaration, immutable pending submissions, revision checks, rejection/resubmission, withdrawal/concurrent review, admin-only decisions, required evidence-review acknowledgement and reason, suspension, account scopes and private downloads.
- Dashboard checks require administrators to see all listings while hosts see only their own. Tourists cannot obtain ownership evidence. Binary content is absent from public and dashboard responses; authorized downloads force attachment handling with no-store caching.
- New-booking and host-approval guards require publication eligibility and availability. Hosts cannot accept another owner's booking; administrators have read-only reservation oversight and cannot use host inventory, scheduling or check-in APIs. Booking routes bind their destination to the holder's recorded booking, even if a different destination is sent by the client.
- Later listing edits do not move the booked destination or replace the recorded check-in boundary. Booking forecast requests use the booked location; forecast cache entries match coordinates as well as dates/configuration.
- Recovery validates evidence hashes, size/type metadata, relationships and matching approval revisions. Existing version-2 backups gain missing fields safely; real legacy listings without evidence enter draft review. Fictional seed listings remain explicitly labelled demonstrations.
- The production React build completes successfully. No dependencies were added. Generated MySQL schema matches the storage definitions. The startup log reports ready only after the actual listening event, avoiding Express's error-callback false ready message.

## Marketplace update verification

- Five added tests cover tourist-specific saved-list keys, bounded/validated stored IDs, corrupt/disabled storage, persistence isolation, real filter shortcuts and stock-image eligibility. The complete 71-test suite passes.
- Browser checks exercised combined ₱400–₱600 and Parking filters (one matching public campsite), sample gallery opening/selection/closing, a three-night estimate of ₱1,650 at ₱550/night, public availability checks, guest sign-in continuation and the reservation review stage. The final submit acknowledgement remained unchecked; no live booking was created or approved.
- The existing five-factor WSI panel displayed available forecast data during the review check, including daily scores and thunderstorm flags. The redesigned interface continues to show the algorithms and availability protections.
- Saved-list testing added one demo favourite, verified persistence after a refresh, and removed that test favourite. Other account data was not changed. Host registration opens with Campsite owner selected; this does not change an existing role.
- The default narrow browser layout and the 1,280×900 desktop breakpoint were inspected. The desktop booking card fits beside the campsite details; the default layout includes a mobile date-selection bar. The temporary viewport override was reset.
- The final production build passes. Four credited demo photos are served locally, with explicit sample-image disclosures. No dependencies or backend storage schemas changed in this visual update.

## Algorithm checks retained

Haversine known distances; TOPSIS normalized cost/benefit criteria, eligibility, ties and degenerate cases; Dijkstra known shortest paths, invalid weights, disconnected routes and a 10,000-node graph; OSM directed edges, access, one-way/reverse/roundabout directions, incomplete data, fixed-area download, bounds, deduplication, versioning, cache/backoff and unavailable handling; half-open interval conflicts and Greedy earliest-finish advice; Ray-Casting with GPS uncertainty; WSI chapter examples, five factors, thunderstorm cap and complete hourly coverage.

## Browser verification

The existing TourVista tab loads the new interface and matching `listing-review-1` API after the old duplicate services are stopped. Demo sign-in, the administrator review queue, owner workspace/listing stages, draft editor and the preserved search/filter homepage were exercised. Supporting evidence uploads and consequential review/booking decisions were verified in isolated API fixtures, not against the user's live records. Screenshots are saved outside the source project and contain demo information only.

After the final restart, browser checks confirmed all four existing fictional campsites in the administrator register and all five existing reservations in read-only oversight. The tourist demo receipt for an existing confirmed booking shows the Haversine/Dijkstra road planner with empty starting coordinates; no GPS permission or new live reservation was requested. The website was returned to the signed-out homepage.

## Limits

- A live request for the fixed Claveria road dataset on 21 October returned the application's unavailable result. Successful public-service road retrieval and field driving directions were not verified. Test road networks verify the implemented routing logic. The UI clearly reports unavailable data, distinguishes road/geographic/access distances and does not fabricate a road path.
- Road coverage remains regional; the graph does not model complete turn restrictions, traffic, surface quality or current closures. This is shortest recorded distance, not a guarantee of the fastest, safest or most convenient physical journey.
- No live MySQL instance was exercised. Setup/migration and transaction adapters require integration testing with the user's database. Private documents currently share the prototype's persistent state and protected backups; production storage, retention, malware scanning and security validation remain deployment work.
- Physical GPS permissions, surveyed boundaries, document authenticity, public deployment, email verification, online payment and WSI domain/pilot validation were not performed. Ownership review is a manual administrator process.
- Automatic approval review rejected an optional Google Maps link because it would disclose the tourist's precise coordinates to an external service without specific authorization. That patch was not applied; no alternate disclosure path was added.

The ZIP excludes dependencies, builds, backend secrets and all runtime/test storage, including ownership evidence and private backups. Existing live users, campsites, reservations and settings are preserved.
