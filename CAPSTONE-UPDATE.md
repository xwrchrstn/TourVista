# TourVista — complete listing and approval update

Open this existing project folder in VS Code. Run `npm.cmd run dev` once and keep the terminal open. Visit http://127.0.0.1:5173/. The API startup line includes **capstone listings v2 · email accounts v1**. Backend edits require restarting that terminal; frontend edits refresh through Vite.

## Owner: create, edit and publish

1. Sign in as a campsite owner and open **My campsites → Add a campsite**.
2. **The essentials:** describe the property, choose accommodation type, nightly unit price, locality and amenities. Set the first unit name and capacity. More units and closures are managed under **Availability**.
3. **Photos & gallery:** select JPEG/PNG property photos or add HTTPS photo links, up to six in total. The first saved photo is the cover. Uploads are prepared locally before saving. Save new uploads, then reorder them if you want another cover. Ownership documents belong in the separate private proof form.
4. **Location & boundary:** enter the full address. Click the map, drag the pin or enter coordinates. **Use GPS location** requests browser permission only when clicked; use it at the property and adjust to the actual guest entrance. Confirm the pin. An optional drawn perimeter supports Ray-Casting check-in. It must form a non-crossing polygon containing the entrance. No continuous tracking occurs.
5. **Guest information:** enter business phone or email, check-in/out times, access instructions, house rules and cancellation/change terms.
6. **Review your listing:** complete all nine checklist items. Save an unfinished draft whenever needed, or **Save & prepare submission** when ready.
7. Submit private ownership/authorization evidence and declaration. An awaiting-review revision is frozen; withdraw it to edit. The admin reviews the saved listing and documents, then approves or declines with a reason. Correct declined details and resubmit.
8. Once approved and active, the campsite appears publicly. Saving later edits creates a draft requiring review again. Existing bookings keep their recorded location, price, boundary and gallery; the owner handles their requests in **Reservation requests**.

Approved listings show their full street address, business contacts and arrival instructions to all visitors, as requested. Draft and pending details/photos stay private. Legal names, statements and ownership documents are visible only to the owner and admin. Existing demo records are preserved; missing policies are not invented.

## Admin and tourist

Admins use **Listing approvals** to inspect the submitted gallery, property details and private evidence. Approval requires an evidence-review acknowledgement and decision reason; declining also records feedback. Admins do not operate hosts' inventory or accept their guest bookings.

Tourists browse the homepage, search and filter by price, actual rating and amenities, then open a campsite. Dates, availability, map, guest policies, weather and **Compare campsites for this stay** appear inside the detail page. Sign in to request a stay, review the quote and submit. The host decides the request. The receipt and **My reservations** provide the booking-bound road planner; choose GPS or enter a starting point there. A pending request is not a confirmed stay.

## Algorithms remain integrated

| Algorithm | Role in TourVista |
| --- | --- |
| TOPSIS | Ranks approved eligible stay candidates using price/distance as costs and amenity count as a benefit; users control weights. Ratings remain a filter. |
| Haversine | Geographic distance and road-edge lengths; straight-line and road distances are labelled separately. |
| Dijkstra | Shortest recorded road distance through the available directed Claveria road graph; unavailable/disconnected data produces an unavailable result. |
| Greedy Interval Scheduling | Earliest-finish compatible-request advice for one unit; actual host acceptance still performs atomic conflict checks. |
| Ray-Casting | Tests the booking holder's check-in point against the recorded property perimeter, with GPS uncertainty handling and owner assistance. |
| WSI | Evaluates rain probability, temperature, weather condition, wind and thunderstorm risk, retaining the paper's proposed weighting and cap rules. |

The new forest, ivory and brass design includes a photographic homepage, owner studio, guided editor, property gallery, clear readiness and approval states, and responsive layouts. Stock images are explicitly illustrative and used only for demo records. See `PAPER-ALIGNMENT.md`, `ROAD-ALGORITHMS.md` and `VALIDATION.md` for formulas, assumptions and verified limits. This is a more complete capstone implementation; a production launch still needs real data, field checks and deployment testing.
