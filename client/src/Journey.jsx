import React, { useEffect, useRef, useState } from 'react';
import { useApp, Field, money } from './context.jsx';
import { CampVisual, TripFields, WeatherPanel, StaySteps } from './CampComponents.jsx';
import { stayQuote } from './flow.js';
import RoadPlanner from './RoadPlanner.jsx';
const StayComparison = React.lazy(() => import('./StayComparison.jsx'));
import { Status } from './Dashboards.jsx';
import Icon from './Icons.jsx';
import { CampGallery, QuoteBreakdown } from './MarketplaceUI.jsx';
import { SaveButton } from './SavedControls.jsx';
import CampsiteFacts from './CampsiteFacts.jsx';

function useCampsite(id) {
  const { api } = useApp(); const [camp, setCamp] = useState(null), [failure, setFailure] = useState('');
  useEffect(() => { let live = true; setCamp(null); setFailure(''); api(`/campsites/${id}`).then((result) => { if (live) setCamp(result); }).catch((error) => { if (live) setFailure(error.message); }); return () => { live = false; }; }, [id]);
  return { camp, setCamp, failure };
}
export function DetailsPage() {
  const { route, session, trip, setTrip, dashboard, navigate, api, action, setError } = useApp();
  const { camp, setCamp, failure } = useCampsite(route.id);
  const [available, setAvailable] = useState(null), [busy, setBusy] = useState(false), stayForm = useRef(null);
  useEffect(() => { setAvailable(null); }, [trip.start, trip.end, trip.partySize, route.id]);
  if (failure) return <section className="panel empty"><h2>Campsite unavailable</h2><p>{failure}</p><button onClick={() => navigate('home')}>Return to campsite search</button></section>;
  if (!camp) return <p className="panel">Loading campsite details…</p>;
  const quote = stayQuote(trip, camp.price), tourist = !session.user || session.user.role === 'tourist';
  const maximum = Math.max(0, ...camp.units.map((unit) => unit.capacity));
  function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function check(continueToRequest = false) {
    if (busy || !stayForm.current.reportValidity()) return;
    setBusy(true); setError('');
    try {
      const fresh = await api(`/campsites/${camp.id}?` + new URLSearchParams(trip)); setCamp(fresh); setAvailable(fresh.availableUnits);
      if (continueToRequest && fresh.availableUnits.length && tourist) {
        if (!session.user) navigate('login', null, { page: 'reservation', id: camp.id }); else navigate('reservation', camp.id);
      }
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function itinerary() { await action('/itinerary', { method: 'PUT', body: { stops: [...(dashboard?.itinerary || []), { campId: camp.id, date: trip.start }] } }, 'Campsite added to your itinerary.'); }
  return <section className="market-detail"><div className="breadcrumbs"><button onClick={() => navigate('home')}>Campsites</button><span>/ Claveria</span></div>
    <div className="market-detail-heading"><div><h1>{camp.name}</h1><p><Icon name="pin" size={15} />Claveria, Misamis Oriental<span>·</span>{camp.rating ? <><Icon name="star" size={14} filled />{camp.rating.toFixed(1)} · {camp.reviews.length} reviews</> : 'No guest reviews yet'}</p></div><SaveButton camp={camp} /></div><CampGallery camp={camp} />
    <nav className="detail-section-nav" aria-label="Campsite sections"><button onClick={() => scrollTo('campsite-about')}>Overview</button><button onClick={() => scrollTo('campsite-stay')}><Icon name="calendar" size={16} /> Dates</button><button onClick={() => scrollTo('campsite-location')}><Icon name="route" size={16} /> Directions</button><button onClick={() => scrollTo('campsite-reviews')}>Reviews</button></nav>
    <div className="journey-layout"><div className="detail-content"><section id="campsite-about" className="panel detail-about"><div className="detail-host-line"><div><h2>About this campsite</h2><p>{camp.units.length} reservable {camp.units.length === 1 ? 'unit' : 'units'} · up to {maximum} guests per unit</p></div><span className="host-avatar"><Icon name="tent" size={28} /></span></div>
      <div className="detail-features"><div><Icon name="shield" /><span><strong>{camp.listingReview}</strong><small>{camp.demoListing ? 'Sample data, photos and boundaries for the capstone.' : camp.listingReview === 'Listing approved by TourVista' ? 'The submitted property and ownership evidence were reviewed.' : 'This listing is not currently approved for public booking.'}</small></span></div><div><Icon name="calendar" /><span><strong>Your stay, confirmed by the host</strong><small>Choose a unit and dates. The host accepts your reservation request.</small></span></div></div>
      <p>{camp.description}</p><h3>What this place offers</h3><div className="amenities detail-amenities">{camp.amenities.map((item) => <span key={item}><Icon name="check" size={15} />{item}</span>)}</div><h3>House rules</h3><p>{camp.rules || 'Contact the campsite owner for current rules and access instructions.'}</p><CampsiteFacts camp={camp} />
    </section><section className="panel route-card" id="campsite-location"><RoadPlanner camp={camp} /><p className="map-note">{camp.demoListing ? 'The location and check-in boundary for this demo are illustrative.' : 'Confirm the entrance, access road and campsite instructions with the host.'}</p>{session.user?.role === 'tourist' && <button onClick={itinerary}>Add to my itinerary</button>}</section>
      <React.Suspense fallback={<section className="panel"><p>Preparing campsite comparison…</p></section>}><StayComparison /></React.Suspense><section className="panel" id="campsite-reviews"><h2><Icon name="star" size={23} /> {camp.rating ? `${camp.rating.toFixed(1)} · ${camp.reviews.length} guest reviews` : 'Guest reviews'}</h2>{camp.reviews.length ? camp.reviews.map((review) => <blockquote key={review.id}><strong>{review.author} · {'★'.repeat(review.rating)}</strong><p>{review.text}</p></blockquote>) : <p>Be among the first to share a stay here. Reviews are available after a completed reservation.</p>}</section></div>
      <aside className="journey-sidebar"><section className="panel stay-panel" id="campsite-stay"><h2 className="stay-title">Check dates</h2><div className="stay-price"><strong>{money(camp.price)}</strong><span> / unit / night</span></div><form ref={stayForm} onSubmit={(event) => { event.preventDefault(); check(true); }}><fieldset className="form-state" disabled={busy}><div className="stay-fields"><TripFields trip={trip} onChange={setTrip} /></div>{available && <div className={available.length ? 'availability-result' : 'notice-box'} role="status">{available.length ? <><Icon name="check" size={17} /><span>{available.length} suitable {available.length === 1 ? 'unit' : 'units'} for your stay</span></> : 'No suitable units for these dates and guests. Try another stay.'}</div>}
        {tourist ? <button className="primary" type="submit">{busy ? 'Checking availability…' : session.user ? 'Continue to reservation' : 'Check dates & sign in'}</button> : <p className="notice-box">Use a tourist account to request a stay.</p>}<button type="button" className="stay-check-only" onClick={() => check(false)}>Check availability only</button></fieldset></form><QuoteBreakdown trip={trip} price={camp.price} quote={quote} /><p className="fine">Review your stay before sending a request to the host.</p></section><WeatherPanel campId={camp.id} trip={trip} /></aside></div>
    {tourist && <div className="mobile-stay-bar"><div><strong>{money(camp.price)}</strong><span> / unit / night</span></div><button className="stay-route-link" onClick={() => scrollTo('campsite-location')}><Icon name="route" size={16} /> Directions</button><button className="primary compact" onClick={() => scrollTo('campsite-stay')}>Check dates</button></div>}
  </section>;
}


export function ReservationPage() {
  const { route, session, trip, setTrip, api, reload, navigate, setError } = useApp();
  const { camp, setCamp, failure } = useCampsite(route.id);
  const [form, setForm] = useState({ ...trip, unitId: '', contactName: session.user.name, contactEmail: session.user.email, contactPhone: '' });
  const [step, setStep] = useState('form'), [available, setAvailable] = useState([]), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  const submissionKey = useRef(crypto.randomUUID());
  if (session.user.role !== 'tourist') return <section className="panel empty"><h2>Tourist reservation accounts</h2><p>This account manages campsites or system records. Use a tourist account to request a stay.</p><button onClick={() => navigate('details', route.id)}>Back to campsite details</button></section>;
  if (failure) return <p className="error">{failure}</p>;
  if (!camp) return <p className="panel">Loading your reservation…</p>;
  const quote = stayQuote(form, camp.price);
  function change(changes) { const next = { ...form, ...changes }; setForm(next); setStep('form'); setConfirmed(false); submissionKey.current = crypto.randomUUID(); setTrip({ start: next.start, end: next.end, partySize: next.partySize }); }
  async function review(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const fresh = await api(`/campsites/${camp.id}?` + new URLSearchParams({ start: form.start, end: form.end, partySize: form.partySize }));
      setCamp(fresh); setAvailable(fresh.availableUnits);
      if (!fresh.availableUnits.length) throw new Error('No suitable units are available for your dates and guests. Choose another stay.');
      const unit = fresh.availableUnits.find((item) => item.id === Number(form.unitId));
      if (!unit && form.unitId) throw new Error('Your selected unit is no longer available. Choose one of the available units and review again.');
      setForm({ ...form, unitId: unit?.id || fresh.availableUnits[0].id }); setStep('review'); setConfirmed(false);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function submit() {
    if (!confirmed || busy) return; setBusy(true); setError('');
    try { const result = await api('/reservations', { method: 'POST', body: { ...form, unitId: Number(form.unitId), expectedPrice: camp.price, requestKey: submissionKey.current } });
      await reload(); navigate('confirmation', result.id);
    } catch (error) { setError(error.message); setConfirmed(false); } finally { setBusy(false); }
  }
  const unit = camp.units.find((item) => item.id === Number(form.unitId));
  return <section className="reservation-journey"><div className="breadcrumbs"><button onClick={() => navigate('details', camp.id)}>{camp.name}</button><span>/ Reservation request</span></div><StaySteps active={step === 'review' ? 2 : 1} /><div className="page-heading"><p className="eyebrow">Your next stay</p><h1>{step === 'review' ? 'Review your reservation request.' : 'Plan your reservation.'}</h1><p>{step === 'review' ? 'Check the details below. Nothing is submitted until you confirm and send your request.' : 'Choose a suitable unit, dates, guests, and the contact details the owner can use.'}</p></div>
    <div className="journey-layout"><div className="booking-content">{step === 'form' ? <form className="reservation-form" onSubmit={review} aria-busy={busy}><fieldset className="form-state" disabled={busy}>
      <section className="panel"><h2>When are you staying?</h2><div className="form-grid"><TripFields trip={form} onChange={(value) => change(value)} /></div><Field label="Preferred reservable unit"><select value={form.unitId} onChange={(e) => change({ unitId: e.target.value })}><option value="">Choose an available unit at review</option>{(available.length ? available : camp.units).filter((item) => item.capacity >= form.partySize).map((item) => <option key={item.id} value={item.id}>{item.name} · capacity {item.capacity}</option>)}</select></Field></section>
      <section className="panel"><h2>Contact information</h2><Field label="Contact full name" required minLength="2" maxLength="100" autoComplete="name" value={form.contactName} onChange={(e) => change({ contactName: e.target.value })} /><div className="two-fields"><Field label="Contact email" type="email" required maxLength="160" autoComplete="email" value={form.contactEmail} onChange={(e) => change({ contactEmail: e.target.value })} /><Field label="Phone number (optional)" type="tel" maxLength="30" autoComplete="tel" placeholder="09xx xxx xxxx" value={form.contactPhone} onChange={(e) => change({ contactPhone: e.target.value })} /></div></section><button className="primary" disabled={busy || !quote}>{busy ? 'Checking your stay…' : 'Review request'}</button></fieldset>
    </form> : <section className="panel review-panel"><h2>Your request details</h2><dl className="reservation-facts"><dt>Campsite</dt><dd>{camp.name}</dd><dt>Reservable unit</dt><dd>{unit?.name}</dd><dt>Check-in / check-out</dt><dd>{form.start} → {form.end}</dd><dt>Guests</dt><dd>{form.partySize} · capacity {unit?.capacity}</dd><dt>Contact name</dt><dd>{form.contactName}</dd><dt>Contact email</dt><dd>{form.contactEmail}</dd><dt>Phone</dt><dd>{form.contactPhone || 'Not provided'}</dd></dl><p className="notice-box">The host will review your request. You can check their decision in My trips.</p><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have reviewed my dates, guests, unit, and contact details.</label><div className="button-row"><button onClick={() => { setStep('form'); setConfirmed(false); }}>Edit request</button><button className="primary compact" disabled={!confirmed || busy} onClick={submit}>{busy ? 'Submitting…' : 'Send reservation request'}</button></div></section>}
    <WeatherPanel campId={camp.id} trip={form} automatic /></div><aside className="journey-sidebar"><section className="panel reservation-summary"><h2>Reservation summary</h2><CampVisual camp={camp} /><h3>{camp.name}</h3><p>{unit?.name || 'Unit selected during availability check'}</p><dl className="reservation-facts"><dt>Nightly unit price</dt><dd>{money(camp.price)}</dd><dt>Number of nights</dt><dd>{quote?.nights || 'Choose valid dates'}</dd><dt>Guests</dt><dd>{form.partySize}</dd><dt className="total">Accommodation estimate</dt><dd className="total">{quote ? money(quote.total) : '—'}</dd></dl><p className="fine">No online payment is collected. The server checks the current nightly price before accepting your request.</p><button className="secondary" onClick={() => navigate('details', camp.id)}>Back to campsite details</button></section></aside></div></section>;
}

export function ConfirmationPage() {
  const { route, dashboard, navigate, session } = useApp();
  const booking = dashboard?.reservations.find((item) => item.id === route.id);
  if (!dashboard) return <p className="panel">Loading your reservation…</p>;
  if (!booking) return <section className="panel empty"><h2>Reservation unavailable</h2><p>This reservation is not available to your account.</p><button onClick={() => navigate('bookings')}>View my reservations</button></section>;
  const quote = stayQuote(booking, booking.unitPrice ?? booking.campsite.price);
  return <><StaySteps active={3} /><section className="confirmation-card panel"><span className="confirmation-mark" aria-hidden="true">✓</span><p className="eyebrow">Reservation #{booking.id}</p><h1>{booking.status === 'pending' ? 'Your request is with the owner.' : 'Your reservation status.'}</h1><Status value={booking.status} /><p>{booking.cancelledBySuspension ? 'TourVista cancelled this reservation because the campsite was suspended.' : booking.status === 'pending' ? 'Your request was saved successfully. The owner will review the unit, dates, and capacity before confirming.' : 'This is the latest recorded status of your reservation.'}</p><dl className="reservation-facts"><dt>Campsite / unit</dt><dd>{booking.campsite.name} · {booking.unit.name}</dd><dt>Your stay</dt><dd>{booking.start} → {booking.end} · {booking.partySize} guests</dd><dt>Accommodation quote</dt><dd>{quote ? money(quote.total) : '—'} · {quote?.nights || 0} nights</dd><dt>Contact</dt><dd>{booking.contactName || booking.touristName}<br />{booking.contactEmail || booking.touristEmail}</dd></dl><div className="button-row"><button className="primary compact" onClick={() => navigate('bookings')}>Go to My trips</button><button onClick={() => navigate('home')}>Continue browsing</button></div>{!booking.cancelledBySuspension && <p className="fine">Your reservation page updates as the owner records a decision. Confirmed stays show check-in controls during the stay dates; reviews become available after completion.</p>}</section>{session.user.role === 'tourist' && ['pending', 'confirmed', 'checked_in'].includes(booking.status) && <section className="panel booking-route-panel"><p className="eyebrow">Your journey to {booking.campsite.name}</p><h2>Plan the road to your stay.</h2><p>Your request is saved. Choose your current location below to calculate the shortest recorded road route to this booking. Travel after the host confirms your stay.</p><RoadPlanner key={booking.id} camp={booking.campsite} reservationId={booking.id} /></section>}</>;
}
