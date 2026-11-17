# TourVista marketplace experience

The interface now uses familiar stay-booking patterns with TourVista's own campsite branding. The original host → ownership evidence → administrator review → tourist request process remains in place.

## Browse and save

- The homepage is a photo-led catalog with a search bar, amenity/price/rating shortcuts, sorting and a **Filters** dialog. It has no stay schedule or separate map/discover tabs.
- **Filters** combines minimum/maximum nightly unit price, minimum real review rating and required amenities. Shortcuts update the same filter object used by the existing TOPSIS comparison. They do not create new ranking criteria or invent campsite categories.
- Choose a campsite photo, name or **View campsite** to open its detail page. Public listings still require the existing approval and availability rules.
- Tourists can tap a heart to add/remove a campsite, then open **Saved campsites**. The list is stored locally in this browser under the tourist account. It is not synchronized across devices and is not part of database backups. Guests are directed to sign in; hosts and administrators do not use the tourist saved list.
- Saved lists contain at most 100 positive campsite IDs. Malformed or unavailable browser storage does not block browsing. Hidden/inactive/unapproved listings are omitted from the visible saved catalog.

## Plan and request a stay

1. Inspect the campsite photo/gallery, amenities, rules and location. Sample stock imagery is explicitly labelled and used only for fictional demo listings.
2. Use **Check dates** or the mobile **Choose dates** bar. Select check-in, check-out and guest count. The card shows the nightly unit price, night count and full accommodation estimate before continuing. No online payment or invented fees are added.
3. Choose **Check availability & reserve** (or **Check dates & sign in** for a guest). The server checks suitable units first. Guest sign-in returns to the chosen campsite and preserves the selected stay during that browsing session.
4. In the reservation form, choose a suitable unit and check the contact information. **Check availability & review request** opens a separate review stage. Nothing is submitted until the tourist checks the acknowledgement and selects **Confirm & submit request**.
5. The saved receipt shows the request status and the existing booking-bound road planner. Final confirmation comes from the campsite owner. My trips tracks decisions; check-in and completed-stay reviews retain their existing rules.

Dates, availability, WSI and maps remain on campsite details or the booking pages. The existing Haversine, TOPSIS, Dijkstra, Greedy Interval Scheduling, Ray-Casting and five-factor WSI implementations are retained. Route coverage and live data limitations are unchanged; the redesign does not turn the regional road model into nationwide or real-time traffic navigation.

## Hosting and administration

**Become a host** opens registration with the campsite-owner account type selected. It does not change an existing account's role or publish a listing automatically. Signed-in hosts use **Your hosting workspace**; administrators use **Admin workspace**. The account menu provides role-appropriate links and sign-out.

Owners maintain only their own campsites and guest requests. Administrators review private ownership evidence and approve/reject/suspend listings, with read-only reservation oversight. See [HOST-AND-ADMIN-GUIDE.md](HOST-AND-ADMIN-GUIDE.md) for the full approval process.

## Run the update

The appearance/booking-experience update changes frontend source only and adds no dependencies. Keep the existing `npm.cmd run dev` terminal running, then refresh the browser. Avoid starting a second copy. The source ZIP includes these styles, local sample images and existing VS Code configuration. Existing accounts, bookings, documents and MySQL/demo settings are preserved.

## Complete host editor — November update

The owner studio now provides a five-step editor, uploaded photo gallery, GPS/map-pin entrance and optional drawn check-in perimeter. Complete the nine-item readiness checklist before private ownership review. Approved address, business contacts and arrival instructions are public; pending revisions and ownership evidence remain private. Read `CAPSTONE-UPDATE.md` for the full sequence. The public homepage retains search, price/rating/amenity filters and campsite cards; dates and maps stay inside each campsite.

## Decision tools and panel design

The coordinated theme extends to dashboards, listing forms, reservations and all algorithm tools. **Find your campsite match** explains TOPSIS priorities, **Weather for your stay** explains five forecast factors, and **Plan your arrival** separates road distance from geographic distance. Owners can choose **Find a compatible schedule**, then individually accept or decline requests. Check-in guides explain stay dates, GPS and host assistance. Administrators can read and review each WSI factor before creating a new model version. See [SMART-TOOLS-GUIDE.md](SMART-TOOLS-GUIDE.md).
