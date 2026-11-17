import React, { useState } from 'react';
import { useApp, Field, money } from './context.jsx';
import RoadPlanner from './RoadPlanner.jsx';
import { WeatherPanel } from './CampComponents.jsx';
import { stayQuote } from './flow.js';
import { ScheduleAdvice, CheckinGuide, WorkspaceTools } from './BookingTools.jsx';
import { displayDate, bookingStatusLabel } from './decision-display.js';

export function Overview() {
  const { session, dashboard, navigate } = useApp();
  if (!dashboard) return <p>Loading dashboard…</p>;
  const bookings = dashboard.reservations;
  const stats = [['Total reservations', bookings.length], ['Pending requests', bookings.filter((item) => item.status === 'pending').length],
    ['Confirmed / checked in', bookings.filter((item) => ['confirmed', 'checked_in'].includes(item.status)).length],
    [session.user.role === 'tourist' ? 'Completed stays' : session.user.role === 'admin' ? 'Accounts' : 'My campsites', session.user.role === 'tourist' ? bookings.filter((item) => item.status === 'completed').length : session.user.role === 'admin' ? dashboard.users.length : dashboard.campsites.length]];
  return <><div className="page-heading"><p className="eyebrow">{session.user.role === 'tourist' ? 'Your travel space' : session.user.role === 'owner' ? 'Your hosting overview' : 'Platform overview'}</p><h1>Hello, {session.user.name.split(' ')[0]}.</h1><p>Manage your {session.user.role === 'tourist' ? 'next trip and recent stays' : session.user.role === 'admin' ? 'listing reviews and platform records' : 'campsites, guests, and requests'}.</p></div>
    {session.user.role !== 'tourist' && <section className="workspace-intro"><div><p className="eyebrow">{session.user.role === 'admin' ? 'Review before publishing' : 'Your hosting journey'}</p><h2>{session.user.role === 'admin' ? `${(dashboard.ownershipSubmissions || []).filter((item) => item.status === 'pending').length} listings awaiting review` : `${dashboard.campsites.filter((item) => item.approvalStatus === 'approved').length} approved campsites`}</h2><p>{session.user.role === 'admin' ? 'Check the submitted campsite and private ownership evidence. Hosts manage their own availability and guests.' : 'Create your listing, submit proof of ownership, and accept guests once the administrator approves it.'}</p></div><button className="primary compact" onClick={() => navigate('listings')}>{session.user.role === 'admin' ? 'Review listings' : 'Manage my listings'}</button></section>}<div className="stats">{stats.map(([label, value]) => <div className="stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="dashboard-grid"><section className="panel"><h2>Recent reservations</h2>{bookings.slice(0, 5).map((booking) => <div className="list-row" key={booking.id}><div><strong>{booking.campsite.name}</strong><p>{booking.start} → {booking.end}</p></div><Status value={booking.status} /></div>)}<button className="secondary" onClick={() => navigate('bookings')}>View all reservations</button></section>
      <section className="panel"><p className="eyebrow">Your next step</p><h2>{session.user.role === 'tourist' ? 'Find your next campsite.' : 'Keep your records up to date.'}</h2><p>{session.user.role === 'tourist' ? 'Compare available campsites and request a stay. Keep track of host decisions, arrival plans and past stays.' : session.user.role === 'admin' ? 'Review ownership submissions, manage platform accounts, and monitor reservation records.' : 'Review guest requests, maintain unit capacity, and add closure dates when needed.'}</p><button className="primary" onClick={() => navigate(session.user.role === 'tourist' ? 'home' : 'listings')}>{session.user.role === 'tourist' ? 'Browse campsites' : 'Manage campsites'}</button></section></div>
    <WorkspaceTools role={session.user.role} navigate={navigate} />
  </>;
}
export function Status({ value }) { return <span className={'status status-' + value}>{bookingStatusLabel(value)}</span>; }

export function Bookings() {
  const { dashboard, session, action, api, setError, navigate } = useApp();
  const [filter, setFilter] = useState('all'), [review, setReview] = useState(null), [rating, setRating] = useState(5), [reviewText, setReviewText] = useState('');
  const [assisted, setAssisted] = useState(null), [reason, setReason] = useState(''), [working, setWorking] = useState(null);
  const [suggestion, setSuggestion] = useState(null), [weather, setWeather] = useState(null), [routeBooking, setRouteBooking] = useState(null);
  if (!dashboard) return <p>Loading…</p>;
  const owner = session.user.role === 'owner', tourist = session.user.role === 'tourist', admin = session.user.role === 'admin';
  async function transition(booking, command) { setWorking(booking.id); await action(`/reservations/${booking.id}`, { method: 'PATCH', body: { action: command } }, `Reservation ${command === 'approve' ? 'confirmed' : command === 'complete' ? 'completed' : command === 'reject' ? 'rejected' : 'cancelled'}.`); setWorking(null); }
  async function gps(booking, demo = false) {
    setWorking(booking.id);
    const run = async (point, accuracy) => { await action(`/reservations/${booking.id}/checkin`, { method: 'POST', body: { method: demo ? 'demo' : 'gps', point, accuracy } }, 'Check-in recorded.'); setWorking(null); };
    if (demo) return run({ latitude: booking.campsite.latitude, longitude: booking.campsite.longitude }, 5);
    if (!navigator.geolocation) { setError('Location unavailable. Ask the owner for assisted check-in.'); setWorking(null); return; }
    navigator.geolocation.getCurrentPosition((position) => run({ latitude: position.coords.latitude, longitude: position.coords.longitude }, position.coords.accuracy),
      () => { setError('Location could not be obtained. Ask the owner for assisted check-in.'); setWorking(null); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function schedule(unitId) {
    try { const data = await api(`/schedule/${unitId}`); setSuggestion({ ...data, unitId, generatedAt: new Date().toISOString() }); }
    catch (failure) { setError(failure.message); }
  }
  const rows = dashboard.reservations.filter((booking) => filter === 'all' || booking.status === filter);
  return <><div className="page-heading"><p className="eyebrow">{admin ? 'Platform oversight' : owner ? 'Guest management' : 'Your stays'}</p><h1>{admin ? 'Reservation overview.' : owner ? 'Reservation requests.' : 'My reservations.'}</h1><p>{admin ? 'Read-only reservation records. Campsite owners handle acceptance and guest check-in. ' : ''}Requests become confirmed after an owner checks availability and approves them. This page checks for status updates every 15 seconds while open.</p></div>
    {owner && suggestion && <ScheduleAdvice suggestion={suggestion} dashboard={dashboard} close={() => setSuggestion(null)} />}
    <Field label="Filter by status"><select value={filter} onChange={(event) => setFilter(event.target.value)}>{['all', 'pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'rejected'].map((value) => <option value={value} key={value}>{bookingStatusLabel(value)}</option>)}</select></Field>
    <div className="booking-list">{rows.map((booking) => <article className="panel booking-card" key={booking.id}>
      <div className="results-heading"><div><p className="eyebrow">Reservation #{booking.id}</p><h2>{booking.campsite.name}</h2></div><Status value={booking.status} /></div>
      {booking.cancelledBySuspension && <p className="notice-box">TourVista cancelled this reservation because the campsite was suspended.</p>}
      <div className="booking-facts"><div><small>Your stay</small><strong>{displayDate(booking.start)} – {displayDate(booking.end)}</strong></div><div><small>Reservable unit</small><strong>{booking.unit.name}</strong></div><div><small>Guests</small><strong>{booking.partySize} {booking.partySize === 1 ? 'guest' : 'guests'}</strong></div></div>
      {owner && <p className="fine">Contact: {booking.contactName || booking.touristName} · {booking.contactEmail || booking.touristEmail}{booking.contactPhone && ` · ${booking.contactPhone}`}</p>}
      <p className="fine">Accommodation quote: {money(stayQuote(booking, booking.unitPrice ?? booking.campsite.price)?.total || 0)} · no online payment collected</p>
      <div className="button-row">
        <button onClick={() => navigate('confirmation', booking.id)}>View reservation details</button>
        <button onClick={() => setWeather(weather === booking.id ? null : booking.id)}>{weather === booking.id ? 'Hide weather outlook' : 'Stay weather outlook'}</button>
        {tourist && ['pending', 'confirmed', 'checked_in'].includes(booking.status) && <button onClick={() => setRouteBooking(routeBooking === booking.id ? null : booking.id)}>{routeBooking === booking.id ? 'Hide road planner' : 'Route to my booking'}</button>}
        {owner && booking.status === 'pending' && <><button disabled={working === booking.id} onClick={() => transition(booking, 'approve')}>Accept request</button><button disabled={working === booking.id} onClick={() => transition(booking, 'reject')}>Decline request</button><button onClick={() => schedule(booking.unitId)}>Find a compatible schedule</button></>}
        {!admin && ['pending', 'confirmed'].includes(booking.status) && <button disabled={working === booking.id} onClick={() => transition(booking, 'cancel')}>Cancel request / booking</button>}

        {owner && booking.status === 'checked_in' && booking.end <= session.today && <button disabled={working === booking.id} onClick={() => transition(booking, 'complete')}>Mark stay completed</button>}
        {tourist && booking.status === 'completed' && !booking.review && <button onClick={() => { setReview(booking.id); setReviewText(''); }}>Write a review</button>}
      </div>
      {weather === booking.id && <WeatherPanel campId={booking.campsite.id} trip={booking} reservationId={booking.id} automatic />}
      {tourist && routeBooking === booking.id && ['pending', 'confirmed', 'checked_in'].includes(booking.status) && <RoadPlanner key={booking.id} camp={booking.campsite} reservationId={booking.id} />}
      {!admin && booking.status === 'confirmed' && <CheckinGuide booking={booking} today={session.today} owner={owner} working={working === booking.id} demoMode={session.mode === 'demo'} onGps={(demo) => gps(booking, demo)} onAssist={() => { setAssisted(booking.id); setReason(''); }} />}
      {booking.checkin && <p className="fine">Checked in: {booking.checkin.method} · {new Date(booking.checkin.createdAt).toLocaleString()}</p>}
      {booking.review && <p className="fine">Your review: {'★'.repeat(booking.review.rating)} · {booking.review.text}</p>}
      {review === booking.id && <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); const result = await action('/reviews', { method: 'POST', body: { reservationId: booking.id, rating, text: reviewText } }, 'Review submitted.'); if (result) setReview(null); }}>
        <Field label="Rating"><select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></Field>
        <Field label="Review"><textarea required minLength="5" maxLength="2000" value={reviewText} onChange={(event) => setReviewText(event.target.value)} /></Field><button className="primary">Submit review</button>
      </form>}
      {assisted === booking.id && booking.status === 'confirmed' && <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); const result = await action(`/reservations/${booking.id}/checkin`, { method: 'POST', body: { method: 'assisted', reason } }, 'Assisted check-in recorded.'); if (result) setAssisted(null); }}><Field label="Reason for assisted check-in" required minLength="5" maxLength="300" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="primary">Record assisted check-in</button></form>}
    </article>)}</div>{!rows.length && <div className="panel empty">No reservations with this status.</div>}
  </>;
}

