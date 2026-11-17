import React, { useEffect, useRef, useState } from 'react';
import { useApp, money } from './context.jsx';
import { CampCard, CampVisual } from './CampComponents.jsx';
import { photosForCamp } from './marketplace.js';
import Icon from './Icons.jsx';

export function Modal({ title, close, children, className = '' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current, previous = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = 'hidden';
    return () => { if (element.open) element.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className={'market-modal ' + className} onClose={close} aria-label={title} onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}><div className="modal-heading"><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => dialog.current.close()}><Icon name="close" size={20} /></button><h2>{title}</h2></div>{children}</dialog>;
}
export function CampGallery({ camp }) {
  const photos = photosForCamp(camp), [open, setOpen] = useState(false), [index, setIndex] = useState(0), [failed, setFailed] = useState(false);
  if (!photos.length || failed) return <CampVisual camp={camp} hero />;
  return <><div className={'camp-gallery ' + (photos.length > 1 ? 'camp-gallery-multiple' : '')}><button className="gallery-main" aria-label={`Open photos of ${camp.name}`} onClick={() => { setIndex(0); setOpen(true); }}><img src={photos[0].src} alt={photos[0].sample ? 'Sample camping scene for this fictional listing' : camp.name} onError={() => setFailed(true)} /></button>{photos.slice(1).map((photo, i) => <button key={photo.src} className="gallery-side" aria-label={`Open ${photo.sample ? "sample " : ""}photo ${i + 2}`} onClick={() => { setIndex(i + 1); setOpen(true); }}><img src={photo.src} alt={photo.sample ? "Illustrative camping landscape" : `${camp.name} photo ${i + 2}`} loading="lazy" /></button>)}<button className="gallery-open" onClick={() => { setIndex(0); setOpen(true); }}>View {photos[0].sample ? 'sample ' : ''}{photos.length === 1 ? 'photo' : 'photos'}</button></div>{photos[0].sample && <p className="photo-disclosure">Sample stock photos for a fictional demonstration listing. They do not show this campsite's actual location.</p>}
    {open && <Modal title={photos[0].sample ? 'Sample campsite photos' : camp.name} close={() => setOpen(false)} className="photo-modal"><div className="photo-modal-body"><img src={photos[index].src} alt={photos[index].sample ? 'Sample stock camping photograph' : camp.name} />{photos.length > 1 && <div className="photo-thumbnails">{photos.map((photo, i) => <button key={photo.src} aria-label={`Show photo ${i + 1}`} aria-pressed={index === i} onClick={() => setIndex(i)}><img src={photo.src} alt="" /></button>)}</div>}{photos[0].sample && <p className="fine">Illustrative stock photographs. Ask the campsite owner for current photos before travel.</p>}</div></Modal>}
  </>;
}
export function SavedPage() {
  const { campsites, savedIds, navigate } = useApp(); const rows = campsites.filter((camp) => savedIds.includes(camp.id));
  return <section className="market-saved"><div className="page-heading"><p className="eyebrow">Your shortlist</p><h1>Saved campsites</h1><p>A little inspiration for your next escape. Your list is saved in this browser for your tourist account.</p></div>{rows.length ? <><p className="results-count">{rows.length} saved {rows.length === 1 ? 'campsite' : 'campsites'}</p><div className="market-grid">{rows.map((camp) => <CampCard key={camp.id} camp={camp} />)}</div></> : <div className="saved-empty"><span><Icon name="heart" size={34} /></span><h2>Keep the places you love.</h2><p>Tap the heart on a campsite to add it to your list. Only listings currently available in the public catalog appear here.</p><button className="primary compact" onClick={() => navigate('home')}>Explore campsites</button></div>}</section>;
}
export function QuoteBreakdown({ trip, price, quote }) {
  return <div className="stay-estimate">{quote ? <><div><span>{money(price)} × {quote.nights} {quote.nights === 1 ? 'night' : 'nights'}</span><span>{money(quote.total)}</span></div><div className="estimate-total"><strong>Accommodation estimate</strong><strong>{money(quote.total)}</strong></div><p className="fine">For {trip.partySize} {trip.partySize === 1 ? 'guest' : 'guests'}. No online payment collected.</p></> : <p className="help">Choose valid dates to see your accommodation estimate.</p>}</div>;
}
