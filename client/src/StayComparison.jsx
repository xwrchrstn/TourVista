import React, { useState } from 'react';
import { useApp, Field } from './context.jsx';
import { CampCard } from './CampComponents.jsx';
import Icon from './Icons.jsx';
import { ToolHeader, ToolSteps, AlgorithmNote, ToolMessage } from './DecisionUI.jsx';
import { criteria, preferenceShares, displayDate } from './decision-display.js';

const presets = [
  { label: 'Balanced', values: { price: 100 / 3, distance: 100 / 3, amenities: 100 / 3 } },
  { label: 'Save on budget', values: { price: 60, distance: 20, amenities: 20 } },
  { label: 'Stay closer', values: { price: 20, distance: 60, amenities: 20 } },
  { label: 'More facilities', values: { price: 20, distance: 20, amenities: 60 } }
];
export default function StayComparison() {
  const { api, trip, catalogFilters, origin, setOrigin, originSource, setOriginSource, weights, setWeights } = useApp();
  const [ranking, setRanking] = useState(null), [basis, setBasis] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const currentBasis = JSON.stringify({ trip, filters: catalogFilters, origin, weights }), current = ranking && basis === currentBasis;
  const shares = preferenceShares(weights), anyWeight = Object.values(shares).some((value) => value > 0);
  function changeOrigin(patch) { setOrigin({ ...origin, ...patch }); setOriginSource('manual'); }
  function locate() {
    setError(''); if (!navigator.geolocation) { setError('Location is unavailable. Enter a starting point manually.'); return; }
    setBusy(true); navigator.geolocation.getCurrentPosition((position) => { setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setOriginSource('gps'); setBusy(false); },
      () => { setError('Location could not be obtained. Enter your starting coordinates manually.'); setBusy(false); }, { timeout: 15000, maximumAge: 0 });
  }
  async function compare(event) {
    event.preventDefault(); setBusy(true); setError(''); const requested = currentBasis;
    try { setRanking(await api('/rank', { method: 'POST', body: { ...trip, filters: catalogFilters, origin, weights } })); setBasis(requested); }
    catch (failure) { setRanking(null); setError(failure.message); } finally { setBusy(false); }
  }
  const topCount = current ? ranking.results.filter((camp) => camp.rank === ranking.results[0]?.rank).length : 0;
  return <section className="panel stay-comparison decision-tool" aria-label="Find your campsite match">
    <ToolHeader icon="sparkles" eyebrow="Made for the way you travel" title="Find your campsite match." algorithm="TOPSIS + Haversine" description="Tell us what matters most. Compare available campsites by budget, distance and facilities, using your chosen dates and filters." />
    <ToolSteps steps={['Choose your stay', 'Set your priorities', 'Compare your matches']} />
    <div className="comparison-stay"><Icon name="calendar" size={19} /><div><strong>{displayDate(trip.start)} – {displayDate(trip.end)}</strong><span>{trip.partySize} guests · Your homepage filters apply</span></div><span className="eligibility-pill"><Icon name="check" size={13} />Available stays only</span></div>
    <details className="preference-editor"><summary><span><Icon name="filters" size={18} />Personalise your comparison</span><Icon name="chevron" size={17} /></summary>
      <form onSubmit={compare}><fieldset disabled={busy} className="form-state"><div className="preference-presets" aria-label="Priority presets">{presets.map((preset) => { const presetShares = preferenceShares(preset.values), selected = criteria.every(({ key }) => Math.abs(shares[key] - presetShares[key]) < .00001); return <button type="button" key={preset.label} aria-pressed={selected} className={selected ? 'selected' : ''} onClick={() => setWeights({ ...preset.values })}>{preset.label}</button>; })}</div>
        <div className="priority-grid">{criteria.map(({ key, label, detail, icon }) => <label className={'priority-card priority-' + key} key={key}><div><span className="priority-icon"><Icon name={icon} size={20} /></span><output>{Math.round(shares[key] * 100)}<small>%</small></output></div><strong>{label}</strong><span>{detail}</span><input type="range" min="0" max="100" step="1" aria-label={label + ' importance'} value={weights[key]} onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })} /><span className="priority-scale"><small>Less important</small><small>More important</small></span></label>)}</div>
        <p className="tool-caption">Sliders set relative importance. The percentages show each priority's share of the total and adjust as you move a slider. Set a slider to zero to leave that preference out.</p>
        <div className="origin-choice"><div className="origin-choice-heading"><span className="tool-mini-icon"><Icon name="pin" size={20} /></span><div><h3>Where are you starting?</h3><p>{originSource === 'claveria' ? 'The comparison starts in Claveria. Use your location to see distances from where you are.' : 'Your selected point is used to compare geographic distances.'}</p></div></div><button type="button" className="location-action" onClick={locate}><Icon name="pin" size={16} />Use my location for comparison</button><div className="two-fields"><Field label="Comparison origin latitude" type="number" step="any" required min="-90" max="90" value={origin.latitude} onChange={(event) => changeOrigin({ latitude: event.target.value === '' ? '' : Number(event.target.value) })} /><Field label="Comparison origin longitude" type="number" step="any" required min="-180" max="180" value={origin.longitude} onChange={(event) => changeOrigin({ longitude: event.target.value === '' ? '' : Number(event.target.value) })} /></div><p className="tool-caption">GPS runs only when you choose it. Comparison uses straight-line distance; use the road planner for a recorded road route. Results and geographic distances are saved in TourVista.</p></div>
        {!anyWeight && <ToolMessage title="Choose at least one priority." tone="caution">Move a slider above zero to make a comparison.</ToolMessage>}
        <button className="primary tool-submit" type="submit" disabled={busy || !anyWeight}><Icon name="sparkles" size={18} />{busy ? 'Finding your matches…' : 'Find my campsite matches'}<Icon name="arrow" size={17} /></button>
      </fieldset></form>
    </details>
    {error && <p className="error" role="alert">{error}</p>}{ranking && !current && <ToolMessage title="Your plans changed." tone="moderate">Dates, filters, starting point or priorities changed. Compare again to get matching results.</ToolMessage>}
    {current && <div className="comparison-results" aria-live="polite"><div className="comparison-results-heading"><span className="tool-mini-icon"><Icon name="check" size={20} /></span><div><p className="eyebrow">Your comparison is ready</p><h3>{ranking.results.length === 1 ? 'One campsite fits this stay.' : topCount > 1 ? `${topCount} campsites share the leading match.` : ranking.results.length ? 'Your matches, in order.' : 'No available matches yet.'}</h3><p>{ranking.results.length} available {ranking.results.length === 1 ? 'campsite' : 'campsites'} compared for this stay.</p></div></div>
      {ranking.results.length === 1 && <ToolMessage title="Only one eligible option">There is no alternative to compare it against. Its match index is not a quality rating.</ToolMessage>}
      <div className="cards comparison-cards">{ranking.results.map((camp) => <CampCard key={camp.id} camp={camp} />)}</div>
      {!ranking.results.length && <ToolMessage title="Try a different stay or wider filters." icon="search">Change the dates, guest count or homepage filters, then compare again.</ToolMessage>}
      {ranking.results.length > 0 && <p className="tool-caption">A higher match index is closer to your selected priorities within these results. It is not a review rating, a safety score or a chance of a successful trip.</p>}
      <details className="comparison-method"><summary>See the comparison details</summary><p>Applied importance after non-distinguishing criteria are removed:</p><div className="applied-priorities">{criteria.map(({ key, label }) => <span key={key}>{label}<strong>{Object.hasOwn(ranking.weights, key) ? `${(ranking.weights[key] * 100).toFixed(1)}%` : 'Not distinguishing'}</strong></span>)}</div>{ranking.notes.map((note, index) => <p key={index}>{note}</p>)}{ranking.excluded.map((camp) => <p key={camp.id}>{camp.name}: {camp.reason}</p>)}</details>
    </div>}
    <AlgorithmNote name="TOPSIS + Haversine"><p>Only approved campsites with a suitable available unit enter the comparison. Search, price, rating and required-amenity filters apply first.</p><p>TOPSIS balances lower nightly price, shorter Haversine geographic distance and more checklist amenities. It normalizes the criteria, applies your weights and compares each option with the ideal and least-preferred option. Equal results share a rank. Ratings remain a filter.</p><p>Scores describe this candidate set. Weather and recorded road routes are assessed separately.</p></AlgorithmNote>
  </section>;
}
