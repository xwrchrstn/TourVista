# TourVista: understand the decision tools

The 10 November design update makes each tool answer three questions: what does it do, what does this result mean, and what can I do next? The algorithm names remain visible for capstone demonstrations. Open **How it works** for the technical explanation.

## Tourists: compare, plan and arrive

1. Browse the homepage. Search, nightly price, actual review rating and required amenities narrow the listings. Dates and maps remain inside each campsite.
2. Open a campsite and choose stay dates and guests. Read the property details, photos, rules, estimate and availability before requesting a stay.
3. Under **Find your campsite match**, expand **Personalise your comparison**. Choose Balanced, Save on budget, Stay closer or More facilities. Sliders set relative importance; displayed percentages are the normalized shares of your choices. A zero removes a preference. Choose a starting point explicitly or retain the clearly labelled example Claveria point. Select **Find my campsite matches**.
4. Read the ranked available campsites. The match index is a relative value from 0 to 1, not a review, chance of success, weather score or safety score. Equal results share a rank. A single eligible campsite cannot be meaningfully compared with another. Comparison details show the effective API weights and criteria that do not distinguish the candidates.
5. Choose **Check my stay weather** in **Weather for your stay**. The WSI brief shows the lowest daily score across the stay, including departure. Open each day for actual rain probability, temperature, wind and all five factor scores. Higher factor scores are more favourable in this project model. A rain probability of 100% is different from a rain factor score of 100/100. Missing, incomplete or stale data is never presented as a current assessment. Changing dates clears the earlier brief.
6. Sign in as a tourist and follow the reservation review steps. Submission creates a request; the campsite owner confirms it. No online payment is collected.
7. In an active booking, choose **Route to my booking**, then **Use my current location**. The blue pin shows the device's estimated location and the green pin shows the booked campsite. If the blue pin is off, choose **Adjust starting pin** and select the correct spot. Choose **Preview driving route** below the map to see the road path, distance, and estimated time. Choose **Local Dijkstra route (Claveria)** for the thesis calculation.
8. During a confirmed stay, the arrival guide explains GPS check-in. Location is requested only when you choose it. The server checks the recorded boundary and GPS uncertainty. Outside or uncertain readings need host assistance; check-out day is outside the check-in window.

GPS is optional and requires browser permission. Manual coordinates remain available. The road provider receives a fixed regional query, not the tourist's starting coordinates. Physical GPS and surveyed boundaries still require field validation.

## Campsite owners: publish and welcome guests

Your hosting workspace points to listing preparation, guest requests and arrival support. Keep details, photos, the entrance pin and optional perimeter accurate. In the map editor, the destination pin and check-in area are explained separately. Save a private draft and submit ownership evidence for administrator review; editing does not automatically publish a listing.

In **Reservation requests**, **Find a compatible schedule** uses Greedy Interval Scheduling for one unit. The suggestion shows a compatible set at that check, not a promise or automatic acceptance. Review availability and individually choose **Accept request** or **Decline request**. Other requests, closures and capacity can change. The server checks them again before approval.

The arrival guide shows whether the confirmed stay window is open. Assisted arrival requires a reason. Local simulated check-in remains explicitly labelled as a demonstration.

## Administrators: understand the model and review listings

Owners operate their campsites; administrators review ownership evidence and publication. Reservation oversight remains read-only. Role boundaries have not changed.

The **WSI settings** page names all five factors, their weights and their percentage contributions. The five weights must sum to 1. Temperature comfort thresholds, wind reference and storm cap retain the existing project definitions. A reason is required to save a new version. These are proposed capstone parameters, not official warning thresholds.

## What each algorithm contributes

| Algorithm | What users see | Meaning and practical limit |
| --- | --- | --- |
| Haversine | Geographic distance | Straight-line distance on the Earth; also weights recorded road segments. It is not driving distance. |
| TOPSIS | Campsite match order and index | Balances price and geographic distance as costs, and checklist amenity count as a benefit. Filters and available units determine the candidate set first. |
| Dijkstra | Shortest connected recorded road path | Uses the regional directed graph and recorded access/one-way rules. Traffic, surface conditions and complete turn restrictions are not modelled. No route is invented when data is unavailable. |
| Greedy Interval Scheduling | Compatible request suggestion | Earliest-finish advice for one unit, maximizing compatible unweighted intervals. It does not optimize revenue, fairness or all units together. The owner decides. |
| Ray-Casting | GPS arrival-area check | Point-in-polygon check with a separate GPS uncertainty test, using the boundary saved with the booking. |
| Weather Suitability Index | Stay brief and five daily factors | Weighted rain, temperature, condition, wind and storm factors. Classification uses unrounded scores; storm risk remains prominent. It supports planning and requires domain validation. |

All server formulas, authentication, reservation eligibility and approval rules are unchanged by this design update. Existing user records are preserved. Model details remain in PAPER-ALIGNMENT.md and ROAD-ALGORITHMS.md. Forecast condition names follow the provider's [weather-code documentation](https://open-meteo.com/en/docs).

## Load and share the update

Restart TourVista with **Ctrl+C** and `npm.cmd run dev`, then refresh the browser to load the driving preview. In **My itinerary**, save your campsite order, choose a starting point, and select **Preview driving route**. [Road setup and coverage](ROAD-ALGORITHMS.md)

The source ZIP includes this guide and the complete editable source. It excludes private settings, runtime records, uploaded ownership evidence, dependencies and generated builds. Keep the existing project folder and private records when updating your own installation.
