import React from 'react';
import Icon from './Icons.jsx';
import { ToolHeader, ToolMessage, AlgorithmNote } from './DecisionUI.jsx';
import { displayDate, checkinWindow } from './decision-display.js';

export function ScheduleAdvice({ suggestion, dashboard, close }) {
  const unit = dashboard.units.find((item) => item.id === suggestion.unitId);
  return <section className="panel schedule-panel decision-tool" aria-label="Compatible booking schedule"><ToolHeader icon="calendar" eyebrow="A clearer plan for your pitch" title="Plan requests without overlaps." algorithm="Greedy Interval Scheduling" description="See a compatible set of pending requests for one unit. Review the suggestion, then make each guest decision yourself." />
    <div className="schedule-overview"><strong>{suggestion.selectedIds.length}</strong><div><h3>Compatible {suggestion.selectedIds.length === 1 ? 'request' : 'requests'} at this check</h3><p>{unit?.name || `Unit #${suggestion.unitId}`}{suggestion.generatedAt && ` · Checked ${new Date(suggestion.generatedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}`}</p></div></div>
    {suggestion.selectedIds.length ? <ol className="schedule-timeline">{suggestion.selectedIds.map((id, index) => { const booking = dashboard.reservations.find((row) => row.id === id); return <li key={id}><span>{index + 1}</span><div><strong>Request #{id}</strong><p>{booking ? `${displayDate(booking.start)} – ${displayDate(booking.end)} · ${booking.partySize} guests` : 'Request details have changed. Refresh the suggestion.'}</p></div><Icon name="calendar" size={18} /></li>; })}</ol> : <ToolMessage title="No compatible pending requests found." icon="calendar">The unit may already be occupied, closed, or have no eligible requests. Review availability and check again.</ToolMessage>}
    <ToolMessage title="Your approval is still required." icon="shield" tone="moderate">This suggestion does not accept or reject any request. Availability, guest capacity and closures are checked again when you approve. Request details may change after this check.</ToolMessage>
    <AlgorithmNote name="Greedy Interval Scheduling"><p>Eligible requests for this single unit are ordered by earliest check-out. The algorithm takes the next compatible request without overlapping a confirmed stay, closure or previously selected request. Adjacent check-out/check-in dates are allowed.</p><p>This maximizes the count of compatible unweighted intervals on one unit. It does not optimize price, fairness or allocations across every unit. {suggestion.message}</p></AlgorithmNote><button className="secondary" onClick={close}>Back to guest requests</button>
  </section>;
}
export function CheckinGuide({ booking, today, owner, working, onGps, onAssist, demoMode }) {
  const open = checkinWindow(booking, today), boundary = Array.isArray(booking.campsite.polygon) && booking.campsite.polygon.length >= 3;
  return <section className="checkin-guide decision-tool" aria-label="Arrival check-in"><ToolHeader as="h3" icon="shield" eyebrow="When it's time to arrive" title={owner ? 'Welcome your guest.' : 'Check in when you arrive.'} algorithm="Ray-Casting + GPS" description={owner ? 'Guests can check in inside the recorded campsite area. Assist them when GPS is unavailable or uncertain.' : 'Confirm your arrival using your location. Your host can help if the GPS reading is uncertain.'} />
    <div className="checkin-steps"><div><span><Icon name="check" size={18} /></span><strong>Booking confirmed</strong><p>The host has accepted this stay.</p></div><div><span><Icon name="calendar" size={18} /></span><strong>{open ? 'Stay window is open' : 'Check the stay dates'}</strong><p>{displayDate(booking.start)} – {displayDate(booking.end)}</p></div><div><span><Icon name="pin" size={18} /></span><strong>{boundary ? 'Confirm your arrival area' : 'Host assistance needed'}</strong><p>{boundary ? 'GPS is checked against the booked campsite boundary.' : 'No valid boundary was recorded for this booking.'}</p></div></div>
    {!open && <ToolMessage title="Check-in is available during the confirmed stay." icon="clock">Arrival must be on or after check-in day and before check-out day. Contact the host if your dates need attention.</ToolMessage>}
    {open && (owner ? <button className="primary compact" disabled={working} onClick={onAssist}><Icon name="user" size={16} />Help guest check in</button> : boundary ? <><button className="primary compact" disabled={working} onClick={() => onGps(false)}><Icon name="pin" size={16} />{working ? 'Checking your location…' : 'GPS check-in'}</button><p className="tool-caption">Location is requested only after you choose GPS check-in. An outside or uncertain reading is not accepted as an arrival.</p>{demoMode && <details className="checkin-demo"><summary>Local demonstration option</summary><p>This uses the sample campsite centre and records the method as demo.</p><button disabled={working} onClick={() => onGps(true)}>Simulate demo check-in</button></details>}</> : <ToolMessage title="Ask your host for assisted check-in." icon="user">A GPS arrival cannot be confirmed without a recorded boundary. Your host can record assisted arrival with a reason.</ToolMessage>)}
    <AlgorithmNote name="Ray-Casting"><p>The server checks whether the reservation holder's reported point falls inside the boundary saved with the booking. It also compares GPS accuracy with the nearest boundary edge. An uncertain reading is referred to the host instead of being treated as inside.</p><p>Only confirmed bookings within the stay dates can check in. Existing bookings keep their recorded boundary if the listing is later edited. Host assistance requires a recorded reason.</p></AlgorithmNote>
  </section>;
}
export function WorkspaceTools({ role, navigate }) {
  const tools = role === 'tourist' ? [
    ['sparkles', 'Find your campsite match', 'Balance budget, distance and facilities inside a campsite page.', 'TOPSIS + Haversine', 'home'],
    ['cloud', 'Understand your stay weather', 'Read the daily forecast and five-factor weather brief before leaving.', 'Weather Suitability Index', 'home'],
    ['route', 'Plan your arrival', 'Open your active booking to plan a recorded road route to the destination.', 'Dijkstra + Haversine', 'bookings']
  ] : role === 'owner' ? [
    ['tent', 'Make your listing complete', 'Keep property details, photos and the entrance pin ready for review.', 'Listing & location', 'listings'],
    ['calendar', 'Organise guest requests', 'Review a compatible schedule, then decide each request yourself.', 'Greedy Interval Scheduling', 'bookings'],
    ['shield', 'Welcome arriving guests', 'Support GPS check-in or help guests with an uncertain location.', 'Ray-Casting + GPS', 'bookings']
  ] : [
    ['shield', 'Review with confidence', 'Inspect the submitted listing and private ownership evidence.', 'Listing approval', 'listings'],
    ['chart', 'Understand platform activity', 'Read real booking outcomes and campsite activity in one place.', 'Reports & records', 'reports'],
    ['cloud', 'Review weather parameters', 'Understand the five factors and their configured scoring rules.', 'Weather Suitability Index', 'weather']
  ];
  return <section className="workspace-tools"><div className="workspace-tools-heading"><h2>A clearer next step.</h2></div><div className="workspace-tool-cards">{tools.map(([icon, title, description, algorithm, page]) => <button className="workspace-tool-card" key={title} onClick={() => navigate(page)}><Icon name={icon} size={23} /><strong>{title}</strong><p>{description}</p><span>{algorithm}<Icon name="arrow" size={14} /></span></button>)}</div></section>;
}
