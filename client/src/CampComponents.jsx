// Shared visuals and cards for TourVista's marketplace.
import React, { useState } from 'react';
import Icon from './Icons.jsx';
import { SaveButton } from './SavedControls.jsx';
import { demoPhotos } from './marketplace.js';
import { matchScore } from './decision-display.js';
import { useApp, Field, money, tomorrow } from './context.jsx';

export function CampVisual({ camp, hero = false }) {
  const [failedImage, setFailedImage] = useState('');
  const source = camp?.photos?.[0]?.src || camp?.imageUrl || (camp?.demoListing ? demoPhotos[camp.id] : '');
  if (source && failedImage !== source) return <div className={'camp-visual' + (hero ? ' camp-visual-hero' : '')}><img className={hero ? 'detail-photo' : 'camp-photo'} src={source} alt={camp.imageUrl || camp.photos?.length ? camp.name : 'Sample stock camping photograph for this fictional listing'} loading={hero ? 'eager' : 'lazy'} onError={() => setFailedImage(source)} />{!camp.imageUrl && !camp.photos?.length && <span className="photo-label">Sample photo</span>}</div>;
  const tone = (camp?.id || 1) % 3;
  const palettes = [['#d6e3d7', '#718e7c', '#274e43'], ['#e4dfcb', '#a2ae86', '#4e6950'], ['#dde5e8', '#8ba8a7', '#325d60']];
  const colors = palettes[tone];
  return <div className={'landscape ' + (hero ? 'landscape-large' : '')}>
    <svg viewBox="0 0 600 320" role="img" aria-label="Original camping landscape illustration">
      <rect width="600" height="320" fill={colors[0]} /><circle cx="459" cy="70" r="26" fill="#fbf7e8" />
      <path d="M0 190 90 91 185 167 289 69 425 164 505 111 600 178V320H0Z" fill={colors[1]} />
      <path d="m0 234 139-82 100 62 107-80 102 104 152-51v133H0Z" fill={colors[2]} />
      <path d="M0 292Q140 204 305 271T600 281V320H0Z" fill="#163d32" />
      <path d="m302 291 62-95 69 95Z" fill="#e0b46d" /><path d="m302 291 62-95v95Z" fill="#f4d497" />
      <path d="m347 291 17-44 20 44Z" fill="#21463b" /><path d="M70 294v-122m-41 83 41-73 42 73m-35 31 35-54 35 54" fill="#143b31" stroke="#143b31" strokeWidth="6" />
      <path d="M464 294v-78m-30 61 30-53 30 53" fill="#173f33" stroke="#173f33" strokeWidth="5" />
    </svg><span className="illustration-label">Illustrative campsite scene</span>
  </div>;
}
export function CampCard({ camp, weather }) {
  const { navigate } = useApp();
  const capacity = Math.max(0, ...(camp.units || camp.availableUnits || []).map((unit) => unit.capacity));
  return <article className={'card flow-card marketplace-card' + (camp.rank === 1 ? ' leading-match' : '')}><div className="market-card-image"><a className="camp-image-link" href={`#/details/${camp.id}`} aria-label={`View ${camp.name}`} onClick={(event) => { event.preventDefault(); navigate('details', camp.id); }}><CampVisual camp={camp} /></a><SaveButton camp={camp} compact />{camp.rank && <span className="market-rank">Match #{camp.rank}</span>}</div>
    <div className="market-card-title"><h3><a href={`#/details/${camp.id}`} onClick={(event) => { event.preventDefault(); navigate('details', camp.id); }}>{camp.name}</a></h3><span className="market-card-rating">{camp.rating !== null && camp.rating !== undefined ? <><Icon name="star" size={13} filled />{camp.rating.toFixed(1)} <small>({camp.reviews.length})</small></> : <small>Unrated</small>}</span></div>
    <p className="market-card-location">Claveria · {camp.units?.length || camp.availableUnits?.length || 0} reservable units{capacity > 0 && ` · up to ${capacity} guests/unit`}</p><p className="market-card-amenities">{camp.amenities.slice(0, 3).join(' · ')}{camp.amenities.length > 3 && ` +${camp.amenities.length - 3}`}</p>
    <div className="market-card-price"><strong>{money(camp.price)}</strong><span> / unit / night</span></div>{Number.isFinite(camp.distanceKm) && <p className="fine market-distance">{camp.distanceKm.toFixed(2)} km geographic distance</p>}
    {Number.isFinite(camp.topsisScore) && <div className="match-index"><span>Priority match index</span><strong>{matchScore(camp.topsisScore)}<small> / 1</small></strong><span>{camp.amenities.length} checklist amenities</span></div>}{weather && <p className="weather-chip">{weather.available ? `WSI ${weather.score.toFixed(1)}/100` : 'Weather assessment unavailable'}{weather.stale ? ' · stale' : ''}</p>}
    <button className="market-card-link" onClick={() => navigate('details', camp.id)}>View campsite <Icon name="arrow" size={15} /></button></article>;
}
export function TripFields({ trip, onChange, prefix = '' }) {
  const { session } = useApp();
  return <><Field label={prefix + 'Check-in'} type="date" required min={session.today} value={trip.start} onChange={(e) => onChange({ ...trip, start: e.target.value })} />
    <Field label={prefix + 'Check-out'} type="date" required min={tomorrow(trip.start || session.today)} value={trip.end} onChange={(e) => onChange({ ...trip, end: e.target.value })} />
    <Field label={prefix + 'Guests'} type="number" required min="1" max="100" value={trip.partySize} onChange={(e) => onChange({ ...trip, partySize: Number(e.target.value) })} /></>;
}
export function StaySteps({ active = 0 }) {
  return <ol className="stay-steps" aria-label="Reservation stages">{['Campsite details', 'Stay & contact', 'Review request', 'Track reservation'].map((label, i) => <li key={label} aria-current={active === i ? 'step' : undefined} className={i <= active ? 'reached' : ''}><span>{i + 1}</span>{label}</li>)}</ol>;
}
const StayWeather = React.lazy(() => import('./WeatherPanel.jsx'));
export function WeatherPanel(props) {
  return <React.Suspense fallback={<section className="panel"><p>Preparing your weather panel…</p></section>}><StayWeather {...props} /></React.Suspense>;
}
