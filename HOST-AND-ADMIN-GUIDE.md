# TourVista hosting and listing review

This local capstone now separates the marketplace responsibilities: tourists request stays, campsite owners operate their own properties, and administrators review listings and ownership evidence. Sign-in stays on the existing shared page; the server determines the account's workspace.

## Start the updated service

Open this project folder in VS Code and run `npm.cmd run dev` once. Keep the terminal open. The API message includes **capstone listings v2 · email accounts v1**, and Vite must show **http://127.0.0.1:5173/**. Refresh the browser after a backend restart. If an older service is still running, the interface explains that the matching API is required before opening protected pages.

## Campsite owner

1. Register as a campsite owner, then sign in. The account does not need a separate global verification flag to prepare a draft.
2. Open **My campsites → Add campsite**. Follow the five-step editor: essentials, photos, location, guest information and review. Enter a description, accommodation type, price, amenities, full address, business contacts, arrival instructions, check-in/out times, rules and cancellation policy. Set the first unit name and guest capacity. Add up to six gallery photos by upload or HTTPS link. Place the entrance using GPS, a map click, a draggable pin or coordinate fields; explicitly confirm it. Optionally draw a valid check-in perimeter around the entrance. Use **Availability** to configure actual units, guest capacities and closures.
3. Save the draft at any point. It is private and cannot receive new tourist requests. Complete all nine readiness items before opening the ownership-proof form. New browser uploads are resized locally to at most 1,600 pixels per side and 1 MB; the server validates the file type, dimensions and checksum. Use property photos, never ownership documents, in the gallery.
4. Choose **Submit ownership evidence**. Enter the legal owner or authorized operator's name, supporting document type, and an explanation connecting the documents to this property and address. Attach **1–2 PDF, JPEG or PNG files, up to 1 MB each**. Confirm the ownership/authorization declaration and submit.
5. The status becomes **Awaiting review**. Pending submissions cannot be edited. Use **Withdraw to edit** to invalidate that submission and prepare a new revision.
6. An administrator either approves or declines the listing with a reason. Rejected and suspended listings can be corrected and submitted again, with supporting evidence.
7. Approved, active listings with an active owner and a reservable unit appear in tourist search. The host accepts or rejects guest requests in **Reservation requests**. Greedy scheduling is advice; each acceptance still checks unit capacity, dates and closures atomically.

Saving changes to an approved listing creates a new draft and removes it from public search until the new revision is reviewed. This deliberate review rule prevents approved ownership evidence from being reused to silently publish different property details. Existing reservations are retained. New reservations preserve a snapshot of the booked campsite so subsequent edits cannot move the guest's route destination or check-in boundary.

## Administrator

1. Sign in using an administrator account and open **Listing approvals**.
2. Choose an awaiting submission. Inspect its saved listing revision, coordinates, rules, legal name, explanation and supporting documents.
3. Download each private document. Match the property address, identity and authority to operate. Obtain clarification and external verification where necessary. The application checks file size, allowed type and file signature; it does not authenticate a title, permit or identity document.
4. Enter a decision reason. To approve, also confirm that the evidence and ownership/authorization checks were completed. Choose **Approve listing** or **Decline listing**.
5. A changed, withdrawn or already-reviewed submission cannot be approved using a stale page. Each decision is tied to the submitted revision.
6. In the listing register, choose **Suspend**, enter a reason, then choose **Suspend listing and cancel bookings**. This cancels pending, confirmed, and checked-in reservations, removes the campsite's saved itinerary stops and check-in records, and disables directions for affected reservations. Guests can see their cancellations in **My trips**. The owner must resubmit the listing for review.

Administrators have read-only reservation oversight. They cannot create host listings, edit host inventory, accept guest reservations, run host scheduling, or perform assisted check-in through the owner APIs. They retain account/access management, review moderation, WSI settings, reports, audit, recovery and private backup tools.

## Tourist

Browse the homepage using search, nightly price range, actual review ratings and required amenities. Public catalog results and TOPSIS candidates include approved eligible listings only. Fictional seed listings are explicitly marked as demonstrations.

Open a campsite to inspect its details, availability, WSI and map. Sign in as a tourist, review the stay/unit/contact details, and submit a reservation request. The receipt includes **Plan the road to your stay**. Choose **Use my location**, or enter starting coordinates, then **Find road route**. The same planner is available under **My reservations → Route to my booking**. Location access is requested only after the tourist chooses it. A pending request is not an approved stay; travel after the host confirms it.

The destination is derived from the holder's booking on the server; a supplied destination cannot redirect that booking. Haversine calculates geographic distances and road-edge weights; Dijkstra selects the shortest recorded distance through the available regional road graph. Solid roads and unverified first/last access connections are displayed separately. The model covers the fixed Claveria region, not nationwide navigation, live traffic or all turn restrictions. If public road data is unavailable or disconnected, the site explains this rather than inventing a road route.

## Evidence and existing records

- Evidence is stored in the private `ownershipSubmissions` table (or the private demo JSON store), with server-calculated SHA-256 checksums. It is never placed in the frontend/public directory. Dashboard responses contain metadata but omit the binary content. Download endpoints require the submitting owner or an administrator, force downloads and disable caching and inline rendering.
- Submissions and review reasons remain in the private audit/review history. Ownership documents must not be included in screenshots, public repositories or shared source archives. Private system backups contain those documents and password hashes; keep them protected. The local restore endpoint accepts backups up to 32 MB; larger installations need a separate storage/backup strategy.
- New storage fields and the submission table are created by the normal startup migration. Old real listings without review records become drafts; exact fictional starter records remain clearly marked demo listings. Existing users, units, reservations and settings are retained. Older bookings receive a snapshot from the currently stored campsite; their original historical coordinates cannot be reconstructed if previously edited.
- Use synthetic documents with the shared local demo accounts. Before accepting real documents in a public deployment, configure private production storage, access controls, retention/deletion policy, malware scanning and encrypted backups, and replace all demo credentials. The present manual review is an administrator workflow, not a legal certification service.

The existing paper algorithms remain active: Haversine, TOPSIS, Dijkstra, Greedy Interval Scheduling, Ray-Casting with GPS uncertainty, and the five-factor Weather Suitability Index (rain probability, temperature, condition, wind speed and thunderstorm risk).

## Email accounts update — 10 November 2026

New tourists and owners use email confirmation before new bookings or listing submission. Signed-in users can change their password with current-password verification; forgotten passwords use expiring single-use links. You chose local preview delivery first: no messages reach a real inbox. This is separate from ownership evidence, roles and all six campsite algorithms. Existing access is preserved. Read `EMAIL-AND-PASSWORD-GUIDE.md` for testing and later SMTP configuration.
