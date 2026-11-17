# TourVista — complete local website project

Open this folder in Visual Studio Code. This is the TourVista application, with source code and setup instructions. It is not a tutorial website.

**To enable Gmail delivery:** follow [GMAIL-SETUP.md](GMAIL-SETUP.md) and run `npm.cmd run email:setup` once. One sender handles account verification, password recovery, reservation updates, and listing review notifications.

For an online deployment and future VS Code updates, follow [Deploy and update TourVista](DEPLOYMENT.md).

## Quick start on Windows

Install **Node.js 24 LTS** from https://nodejs.org/en/download and **Visual Studio Code** from https://code.visualstudio.com/download. Close and reopen VS Code after installing Node.js.

1. Extract the ZIP completely.
2. In VS Code, select **File → Open Folder** and open `tourvista-complete` — the folder containing the root `package.json`.
3. Select **Terminal → New Terminal**.
4. Run:

```powershell
npm.cmd run setup
npm.cmd run dev
```

5. Open **http://127.0.0.1:5173** in Edge or Chrome. Both frontend and backend start from that one command.

On Windows you can also double-click **Start-TourVista.cmd**. It checks for Node.js, installs dependencies when needed, and starts the project. Keep the window open while using TourVista. Press **Ctrl+C** to stop it.

First-time dependency installation and map/forecast services require internet. The local capstone stores its records in `server/storage/capstone.json`. On first start, it carries over existing non-sample accounts and eligible campsite records from the earlier local store. The original `server/storage/demo.json` stays available as a separate archive. Sample accounts, test links and simulated check-ins stay in that archive. The root and child `package.json` files define the required packages. The setup command installs the locked frontend/backend dependencies separately, avoiding Windows workspace-link problems. The standard root npm workspace installation remains available if supported by your system.

## Run or debug inside VS Code

Open the complete `tourvista-complete` folder containing the root `package.json`, `client`, `server`, and `.vscode`. Select **Terminal → New Terminal** and run:

```powershell
npm.cmd run dev
```

Keep this terminal running. Wait for Vite at `http://127.0.0.1:5173/` and the API at `http://127.0.0.1:3001`. To view the website, open `http://127.0.0.1:5173/#/home` in your browser.

For browser debugging, press **Ctrl+Shift+D**, select **TourVista: Debug in Chrome** (or **TourVista: Debug in Edge**) from the configuration dropdown, then press **F5**. The provided `.vscode/launch.json` opens the correct website address and points source maps at `client`.

These browser debugging profiles open a browser; they do not start the frontend or API. Start them with the terminal command first. Stop the server with **Ctrl+C** when finished. There is no need to use Live Server for this React/Node project. The old generic `localhost:8080` configuration targeted a different port and has been replaced. See the official [VS Code browser debugging guide](https://code.visualstudio.com/docs/nodejs/browser-debugging).

## Prepare the real accounts and catalog

1. Stop the running TourVista terminal with **Ctrl+C**.
2. Run `npm.cmd run admin:setup` once. Enter the administrator's name, email, and chosen password in the terminal.
3. Run `npm.cmd run email:check` to check the configured sender. If the sender has yet to be configured, use `npm.cmd run email:setup` and follow [GMAIL-SETUP.md](GMAIL-SETUP.md).
4. Start TourVista with `npm.cmd run dev`. Use **Sign in** for the administrator account. Tourists and campsite owners use **Create an account** and verify their email.
5. Have an owner submit their campsite with its location, reservable spaces and proof of ownership. The site appears on the homepage after the administrator approves it.

For phone testing, forward port 5173 privately through the VS Code **Ports** panel and open its HTTPS address on the phone. For account links opened on the phone, the configured `APP_URL` must be a trusted HTTPS address reachable by that phone.

## Marketplace appearance and booking experience

See **[MARKETPLACE-GUIDE.md](MARKETPLACE-GUIDE.md)** for the updated photo-led catalog, price/rating/amenity filter dialog, saved campsites, account menu, host registration entry and campsite booking card. The estimate updates with the selected nights and guests; availability is checked before sign-in/reservation continuation. The existing separate request-review stage remains in place.

The phone layout brings search, filters and trip access within reach. Campsite pages provide quick access to dates and directions. The saved list is local to this browser and tourist account. See [ASSET-CREDITS.md](ASSET-CREDITS.md).

## Hosting and administrator approval

See **[HOST-AND-ADMIN-GUIDE.md](HOST-AND-ADMIN-GUIDE.md)** for the complete owner → ownership evidence → administrator review → approved listing → tourist booking flow. New owner listings are private drafts. Supporting PDF/JPEG/PNG documents are private to the submitting owner and administrators. Only approved, active listings enter public search and TOPSIS. Owners handle guest acceptance; administrators review listings and have read-only reservation oversight. The existing shared sign-in page is retained.

Restart the existing terminal after backend changes. The matching API prints **capstone listings v2**; the interface detects an older API and prevents opening protected pages against it.

## Included pages and functions

- Catalog homepage with text search, minimum/maximum nightly price, minimum actual review rating, required amenities, sorting and pagination. Campsite details contain dates, guests, availability, weather, location and route planning. There are no separate Discover or Map tabs. Stay/contact form, request review, reservation receipt and status tracking are included. The supplied pictures guide the sequence; the original interface follows the paper's functional requirements.
- Login, tourist/owner registration with email verification, logout, current-password-verified changes, expiring recovery links, SMTP delivery for account emails.
- Tourist dashboard, reservation requests, booking status, cancellation, GPS check-in, reviews after completed stays, and ordered itinerary management.
- Owner dashboard, private campsite drafts, supporting evidence submission, approval/rejection feedback, listing revisions, image URLs, boundary polygons, reservable units and capacity, closure dates, reservation approval/rejection/cancellation, stay weather, compatible-request advice, assisted check-in, checked-in stay completion after departure, and reports from actual records.
- Administrator dashboard, private ownership evidence review, listing approval/rejection/suspension, role/access management, read-only reservation oversight, review moderation, versioned WSI configuration, recovery requests, audit history, private backup export, and backup restoration with a server recovery copy.
- Haversine geographic distance and TOPSIS ranking of candidates available for selected dates and party size. Calculation weights and scores are shown; ranking records retain candidate IDs, raw values, results and algorithm version.
- Greedy earliest-finish advice for compatible pending requests. The advice does not automatically approve bookings.
- Open-Meteo forecast retrieval on request, daily and stay WSI, raw forecast factors, thunderstorm caps, retrieval time, version, a one-hour cache, unavailable/stale handling, and a PAGASA advisory link.
- In-app driving previews use OSRM to show the recommended road path, distance, and estimated travel time on the TourVista map, including routes from outside Claveria. TourVista also offers a local Dijkstra option that calculates the shortest recorded path using Haversine edge lengths. Bookings use the saved campsite entrance, and itineraries follow the saved order.
- Ray-casting boundaries with a separate GPS uncertainty check. Coordinates are not retained in the check-in event; method, accuracy, actor, time and assistance reason are retained.

Reservations use half-open dates `[check-in, check-out)`. Adjacent stays do not overlap. Approvals and closures use the same atomic update path. In local capstone mode, writes are serialized and persisted atomically to a local JSON file. In MySQL mode, writes use a transaction, a shared application lock and locked unit rows. This coarse locking favors correctness over large-scale throughput in a local prototype.

## Try a complete booking flow

1. On the homepage, search campsites and apply price, rating and amenity filters. Choose a sorting order. No stay dates are needed to browse.
2. Click a campsite image, name or **View campsite**. Its own page shows amenities, reviews and map, with check-in/check-out dates and guests under **Check dates**.
3. Check unit availability and **Check my stay weather**. For recommendations, expand **Personalise your comparison**, enter your origin and criterion importance, then choose **Find my campsite matches**. TOPSIS uses the same homepage filters, plus dates and guest capacity; WSI remains a separate weather assessment.
4. Sign in as a tourist and choose **Continue to reservation**. Guest visitors are directed to sign-in and then back to that campsite's request form. On campsite details, **Use my location** or manual coordinates can also start a road plan.
5. Choose a unit and enter contact details. Select **Review request**. Read the quote, dates and contact details; check the review box and choose **Send reservation request**. The saved receipt shows pending status, links to **My reservations**, and immediately provides the booking road planner. Choose your location explicitly to calculate a route; travel after host confirmation.
6. Sign out, then sign in as the owner.
7. Open **Reservation requests**, locate the request and choose **Accept request**. Compatible-request suggestions are advice, and never approve requests automatically.
8. Sign in as the tourist again and check that the reservation is confirmed. In **My reservations**, choose **Route to my booking**, then **Use my current location**. Check the blue start pin and green campsite pin on the map. If the device gives an inaccurate estimate, choose **Adjust starting pin** and tap the correct spot. Choose **Preview driving route** below the map. Select **Local Dijkstra route (Claveria)** to demonstrate the local graph calculation.

For reviews, use a completed stay. For GPS check-in, use a confirmed reservation during its stay dates and grant browser location permission.

To try ownership review, register an owner and create a draft under **My campsites**. Submit authorized supporting documents, then sign in as admin and open **Listing approvals**. Review the saved revision and evidence, give a reason and approve or return it. Account flags do not publish a listing. Owners can operate only their own properties; tourists cannot access owner or administrator actions.

Registration prepares an email-verification link and shows an account-created screen. Confirm the email before a new tourist submits a booking or a new owner submits ownership evidence. Owners can prepare private drafts beforehand. Sign in and open Account settings to resend a verification email. After sign-in, the server-assigned role opens the appropriate workspace. Open reservation pages refresh their data every 15 seconds while the tab is visible. The configured sender emails verified account addresses when reservations and listings change. See [GMAIL-SETUP.md](GMAIL-SETUP.md) for recipients and setup.

New requests store the current nightly price and contact details. A price change between review and submission asks the tourist to review again. Existing records from the earlier version receive contact details from the account and a price estimate from the current campsite price; those older estimates are not historical payment records. Accommodation quotes do not include invented fees or taxes. Reports summarize recorded requests and quotes, not revenue or payment receipts.

## MySQL database

When MySQL is configured, `npm.cmd run dev` starts TourVista and the bundled local MySQL Server, if installed under `server/storage/mysql-local` and selected in `server/.env`. Wait for the API line to show **mysql mode**. The database accepts connections from this computer. TourVista reads and writes its MySQL tables, and a previous `server/storage/capstone.json` can be retained as a copy of the original local records.

### Configure a separate MySQL installation

The following steps apply when using a separately installed MySQL Server. The local runtime and private `server/.env` are machine-specific. A source-only copy needs its own database configuration.

1. Install and configure **MySQL Community Server**, preferably a maintained MySQL 8.4 LTS release, and **MySQL Workbench**.
2. In Workbench, connect to your local server as your database administrator and execute:

```sql
CREATE DATABASE IF NOT EXISTS tourvista_capstone
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'tourvista_app'@'127.0.0.1'
IDENTIFIED BY 'YOUR_CHOSEN_LOCAL_PASSWORD';

GRANT ALL PRIVILEGES ON tourvista_capstone.*
TO 'tourvista_app'@'127.0.0.1';
```

Use an account name and password that you manage locally. If `tourvista_app` already exists, use its existing password or deliberately update it with ALTER USER instead of rerunning CREATE USER.

3. Copy `server/.env.example` to `server/.env` and edit:

```dotenv
DEMO_MODE=false
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tourvista_app
DB_PASSWORD="YOUR_CHOSEN_LOCAL_PASSWORD"
DB_NAME=tourvista_capstone
```

4. From the project root, run:

```powershell
npm.cmd run db:setup
npm.cmd run admin:setup
npm.cmd run dev
```

The setup command creates empty tables. The server also ensures its schema exists at startup. The SQL schema is provided in `database/schema.sql` for inspection or manual setup. It uses a new database name so it does not overwrite the earlier starter's learning database.

Startup migrations preserve existing records and add the campsite `profile` JSON column and `campsitePhotos` table, alongside ownership-review and booking-snapshot fields. Earlier reservation migrations add: `contactName`, `contactEmail`, `contactPhone`, `unitPrice`, and `updatedAt`. The database account needs the ALTER privilege for that migration. Preserve an administrator backup before switching versions. MySQL integration still needs verification against your local server.

The local capstone and MySQL stores are separate. The administrator's backup and restore workflow can transfer a capstone snapshot to another configured database.

## Where to edit the code

| File | Purpose |
| --- | --- |
| `client/src/App.jsx` | App shell, role navigation and session state |
| `client/src/api-client.js` | API requests and automatic renewal of stale account sessions |
| `client/src/AuthPages.jsx` | Sign-in, registration, email verification and emailed recovery forms |
| `client/src/AccountSettings.jsx` | Email status, resend and current-password-verified change form |
| `server/account-security.js` | One-use links, expiry, throttles, session revocation and account notifications |
| `server/mail.js` | Private local email previews and TLS-protected SMTP transport |
| `client/src/Home.jsx` | Undated campsite catalog, search, price/rating/amenity filters and sorting |
| `client/src/CampsiteEditor.jsx` | Five-step owner editor, photo preparation, draft saving and readiness |
| `client/src/LocationEditor.jsx` | GPS, draggable entrance pin, coordinates and optional perimeter drawing |
| `client/src/CampsiteFacts.jsx` | Approved address, business contacts and arrival/cancellation policies |
| `client/src/capstone.css` | Forest, ivory and brass responsive design |
| `shared/listing-profile.js` | Shared listing fields, readiness and perimeter validation |
| `client/src/StayComparison.jsx` | Eligible stay-specific TOPSIS comparison within campsite details |
| `client/src/RoadPlanner.jsx` | Tourist origin selection, road results and booking-bound map |
| `client/src/Journey.jsx` | Campsite details, stay/contact form, review and receipt |
| `client/src/CampComponents.jsx` | Original campsite illustrations, trip controls and daily WSI display |
| `client/src/flow.js` | Routes, permitted sign-in continuation and night/quote calculations |
| `client/src/Reports.jsx` | Owner/admin reports calculated from authorized records |
| `client/src/Dashboards.jsx` | Dashboard, bookings, check-in, reviews and itinerary |
| `client/src/Management.jsx` | Owner and administrator management pages |
| `client/src/Map.jsx` | Leaflet campsite markers and route display |
| `client/src/styles.css` | Appearance and responsive layout |
| `server/app.js` | API endpoints, validation and role/ownership checks |
| `server/camp-profile.js` | Listing completeness, gallery references and image validation |
| `server/camp-photos.js` | Owner uploads and approval/booking-scoped image access |
| `server/auth.js` | Salted scrypt password hashing, session cookies and token rotation |
| `server/storage.js` | Persistent demo storage, relational tables and MySQL transactions |
| `server/algorithms.js` | Haversine and TOPSIS |
| `server/features.js` | Scheduling, ray casting, GPS uncertainty, WSI and Dijkstra |
| `server/weather.js` | Forecast service, snapshots and freshness handling |
| `server/roads.js` | Fixed-area OSM road retrieval, directed graph, cache and shortest road paths |
| `server/recovery.js` | Backup validation before restoration |

Frontend edits refresh through Vite. Restart `npm.cmd run dev` after changing backend code or `.env`. Database passwords belong only in the backend `.env` file. That file and runtime storage are excluded from Git and from the delivered archive.

## Checks and build

From the root folder:

```powershell
npm.cmd test
npm.cmd run build
```

Tests cover algorithms, accounts, CSRF, role restrictions, ownership, duplicate submission, competing approvals, closures, check-in, review moderation, itinerary, recovery and restoration. The build creates `client/dist`; it does not deploy the backend or database.

Read `EMAIL-AND-PASSWORD-GUIDE.md` for local verification, password changes, recovery and later SMTP setup. Read `CAPSTONE-UPDATE.md` for the complete owner editor, gallery, GPS/map pin and approval workflow. Read `VALIDATION.md` for checks actually performed, including any verification limits. `ROAD-ALGORITHMS.md` explains the road model, privacy choices and mathematical integration. `PAPER-ALIGNMENT.md` maps the flow and six algorithms to the supplied chapters.

## Local prototype boundaries

This project runs locally and binds to `127.0.0.1`. Before a real pilot, provide authorized and validated campsite records, prices, unit capacities and boundary polygons. Road planning uses a regional OpenStreetMap snapshot whose connections and entrances still need field validation. WSI uses the paper's proposed formulas and needs adviser or domain review.

Ownership review is administrator-assisted. Account settings provides current-password-verified password changes; Forgot password provides expiring, single-use reset links. Local preview mode saves test messages in `server/storage/mail-preview`; real inbox delivery requires SMTP configuration. Preview confirmation is a local simulation, not proof of real mailbox ownership. Public campsite galleries accept up to six JPEG/PNG uploads or HTTPS image links; private ownership evidence accepts PDF/JPEG/PNG files. Online payment is excluded, matching the document's scope. Sessions are held in memory and expire after eight hours or a backend restart; records remain saved.

Map tiles and forecasts need internet and an appropriate service arrangement for public traffic. The local prototype has not been audited or configured as a production deployment. There is no need to publish anything to try it on your computer.

## Troubleshooting

- **Node/npm not recognized:** install Node.js 24 LTS and reopen VS Code. Use `npm.cmd` in PowerShell if `npm.ps1` is blocked.
- **Package.json not found:** open the root `tourvista-complete` folder rather than one source file or the enclosing ZIP folder.
- **Port already used:** stop the previous TourVista terminal with Ctrl+C. Ports are 5173 for the frontend and 3001 for the backend.
- **Backend cannot start in MySQL mode:** check your MySQL service, credentials, account host, database and grants, or remove the `DEMO_MODE=false` setting to use the local capstone store.
- **A request is forbidden:** sign in with the required role. Owners can create private drafts; each complete listing needs ownership evidence and admin approval before publication.
- **Your session changed:** sign-in and registration now renew stale sessions automatically. Reload once after installing this update. If a protected action reports that your sign-in changed, sign in again before saving it. Sessions reset when the backend restarts or an administrator changes access.
- **No matching homepage campsites:** widen the price/rating range or reduce required amenities. Unreviewed campsites are excluded by positive minimum-rating filters.
- **No available stay candidates:** choose different dates or fewer guests; confirmed stays and closures block units.
- **Local road preview unavailable:** use **Recommended driving route** for a starting point outside the local Claveria graph. If the driving service is unavailable, try again after a short wait. For an entrance outside the recorded roads, confirm access with the owner.
- **Weather unavailable:** dates must be within the forecast horizon and complete provider data must be available. Core bookings still work.
- **Map shows Access blocked:** update/refresh the frontend. Both Leaflet map components set an origin-only referrer policy for map tiles, while account pages keep their privacy setting. Do not remove that tile option or add cache-busting requests. Internet and tile-provider availability are still required.
- **GPS check-in uncertain:** ask the owner to perform assisted check-in with a recorded reason.
- **Backing up local capstone records:** use the administrator's backup tool or run `npm.cmd run backup:create`.

## Clearer design and algorithm panels — 10 November 2026

The site now uses a coordinated forest, cream and sage theme across visitor and account pages. Each decision tool explains its result and next action before offering an expandable algorithm explanation. Read **[SMART-TOOLS-GUIDE.md](SMART-TOOLS-GUIDE.md)** for tourist, host and administrator steps. All six existing algorithms and backend permission checks are retained. This frontend update requires a browser refresh, not a backend restart.

## Itinerary and pilot checks

Restart the TourVista terminal after installing the driving preview update. Press **Ctrl+C**, run `npm.cmd run dev`, and refresh the page. In **My itinerary**, add your stops in visit order, set your starting point, and choose **Preview driving route**. The map shows the ordered route and estimates for each leg. [Road setup and coverage](ROAD-ALGORITHMS.md)

| Command | What it does |
| --- | --- |
| `npm.cmd run pilot:weather` | Runs the paper's WSI weighting exercise and sample temperature and wind variations on synthetic cases. Prints scores, category changes, and the equal-weight baselines. |
| `npm.cmd run pilot:catalog` | Measures local catalog responses from 20 simultaneous simulated sessions and 100 synthetic listings in an isolated demo store. Prints the median and p95 against the 2-second target. |
| `npm.cmd run backup:create` | Writes a validated, timestamped application backup for the configured demo or MySQL store. Defaults to `server/storage/backups`. Set `TOURVISTA_BACKUP_DIR` in `server/.env` to use a private backup location. |

Run the backup command daily on the pilot host and record a timed restore in an isolated environment. The browser restore accepts files up to 32 MiB. For larger MySQL pilots, rehearse the database-level recovery process. The backup contains private account, booking, and listing records, so keep the destination restricted.

For the first field run, have one participating owner confirm the campsite details, entrance, boundary and road access. Record the listing approval, tourist request, owner confirmation, route and on-site check-in on a phone. Check the verification and password-reset links using your pilot address and mail sender. Use the paper's planned participants and usability measures for the full evaluation. The local rehearsals above provide repeatable technical checks. See [VALIDATION.md](VALIDATION.md).
