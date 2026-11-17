import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './context.jsx';
import Icon from './Icons.jsx';
import { ToolHeader, AlgorithmNote, ToolMessage } from './DecisionUI.jsx';
import { weatherMeaning, weatherCondition, weatherIcon, weatherFactors, displayDate } from './decision-display.js';

const number = (value, decimals = 0) => Number.isFinite(value) ? value.toFixed(decimals) : '—';
export default function StayWeather({ campId, trip, automatic = false, reservationId }) {
  const { api } = useApp();
  const path = reservationId ? `/reservations/${reservationId}/weather` : `/weather/${campId}?` + new URLSearchParams({ start: trip.start, end: trip.end });
  const basis = JSON.stringify({ path, start: trip.start, end: trip.end });
  const [record, setRecord] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sequence = useRef(0), weather = record?.basis === basis ? record.data : null;
  async function load() {
    const request = ++sequence.current, requestedPath = path, requestedBasis = basis; setBusy(true); setError('');
    try { const data = await api(requestedPath); if (sequence.current === request) setRecord({ basis: requestedBasis, data }); }
    catch (failure) { if (sequence.current === request) { setRecord(null); setError(failure.message); } }
    finally { if (sequence.current === request) setBusy(false); }
  }
  useEffect(() => {
    sequence.current++; setRecord(null); setError(''); setBusy(false);
    if (automatic && trip.start && trip.end) load();
    return () => { sequence.current++; };
  }, [basis, automatic]);
  const storm = weather?.available && weather.days.some((day) => day.thunderstorm), meaning = weatherMeaning(weather?.available ? weather.score : null, storm);
  return <section className="panel weather-panel decision-tool" aria-label="Weather for your stay">
    <ToolHeader icon="cloud" eyebrow="A clearer view of your outdoors" title="Weather for your stay." algorithm="Weather Suitability Index" description="Five forecast factors, explained in one place. Check what the weather could mean for your camping plans." />
    <div className="weather-stay"><Icon name="calendar" size={17} /><span>{displayDate(trip.start)} – {displayDate(trip.end)}<small>Including departure day</small></span></div>
    {!weather && !error && <div className="weather-waiting"><div className="weather-icon-scene" aria-hidden="true"><Icon name="cloud" size={48} /><span /></div><h3>{busy ? 'Putting your weather brief together…' : 'A little planning goes a long way.'}</h3><p>{busy ? 'Checking the available forecast for these dates.' : 'See the daily outlook and the least favourable assessed day of your stay.'}</p><div className="weather-factor-preview">{weatherFactors.map((item) => <span key={item.code}><Icon name={item.icon} size={15} />{item.label}</span>)}</div></div>}
    {error && <ToolMessage title="We couldn't assess these dates." icon="cloud" tone="caution">{error} Your reservation options are still available.</ToolMessage>}
    {weather && (weather.available ? <div className="weather-result" aria-live="polite"><div className={'weather-summary tone-' + meaning.tone}><div className="weather-score-ring" style={{ '--weather-progress': `${Math.max(0, Math.min(100, weather.score)) * 3.6}deg` }}><div><strong>{number(weather.score, 1)}</strong><span>WSI / 100</span></div></div><div><span className="weather-label">{meaning.label}</span><h3>{meaning.title}</h3><p>{meaning.advice}</p></div></div><p className="weather-index-explainer"><Icon name="info" size={15} /><span>This is the <strong>lowest daily score</strong> across your stay. It is a planning index, not a safety guarantee or a probability.</span></p>
      <div className="weather-daily-title"><strong>Your daily outlook</strong><span>Open a day for all five factors</span></div>
      <div className="weather-days">{weather.days.map((day) => {
        const daily = weatherMeaning(day.score, day.thunderstorm);
        const icon = weatherIcon(day.code, day.thunderstorm);
        return <details className={'weather-day tone-' + daily.tone} key={day.date}><summary>
          <span className="weather-condition-icon" data-condition={icon}><Icon name={icon} size={24} /></span>
          <span className="weather-day-date">{displayDate(day.date, { weekday: 'short' })}<small>{weatherCondition(day.code)}{day.thunderstorm && weatherIcon(day.code) !== 'storm' ? ' · Thunderstorm risk' : ''}</small></span>
          <span className="weather-day-score">{number(day.score, 1)}<small>/100</small></span><Icon name="chevron" size={16} />
        </summary><div className="weather-day-body"><span className="weather-label">{daily.label}</span>{day.thunderstorm && <ToolMessage icon="storm" title="Thunderstorm in the forecast" tone="caution">Check official advisories before travel. The project's storm cap is applied to this day's WSI.</ToolMessage>}<div className="forecast-values"><div><Icon name="rain" size={18} /><strong>{number(day.rain)}%</strong><span>Peak rain chance</span></div><div><Icon name="thermometer" size={18} /><strong>{number(day.temperature, 1)}°C</strong><span>Mean temperature</span></div><div><Icon name="wind" size={18} /><strong>{number(day.wind, 1)}<small> km/h</small></strong><span>Maximum wind</span></div></div>
        <div className="weather-factor-bars">{weatherFactors.map((factor, index) => { const value = day.factors?.[index]; return <div key={factor.code}><span><Icon name={factor.icon} size={15} />{factor.label}</span><div className="factor-track"><i style={{ width: `${Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0}%` }} /></div><strong>{number(value)}<small>/100</small></strong></div>; })}</div><p className="tool-caption">Higher factor scores are more favourable in this project model. Storm flag: {day.thunderstorm ? 'Present' : 'No thunderstorm code in the supplied forecast'}.</p></div></details>; })}</div>
      <p className="forecast-source">{weather.provider} · Updated {new Date(weather.fetchedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p><details className="forecast-method"><summary>Forecast source & model version</summary><p>{weather.message}</p><p>Model version: {weather.version}. Sky conditions use the provider's weather codes.</p></details>
    </div> : <ToolMessage title="No complete weather assessment yet." icon="cloud" tone="moderate">{weather.message}{weather.previous ? ' An earlier result is outdated and is not shown as current.' : ''} Check nearer your stay or try again later.</ToolMessage>)}
    <button className="secondary weather-load" onClick={load} disabled={busy}><Icon name="cloud" size={18} />{busy ? 'Getting forecast…' : weather ? 'Refresh weather outlook' : 'Check my stay weather'}<Icon name="arrow" size={16} /></button>
    <AlgorithmNote name="WSI"><p>The Weather Suitability Index combines rain probability, temperature comfort, weather condition, wind speed and thunderstorm risk using the project's configured weights. It assesses complete daily/hourly forecasts and applies the configured thunderstorm cap.</p><p>The lowest daily score represents the whole stay, including departure day. Scores are separate from campsite matching. These proposed parameters support planning and still need domain validation.</p></AlgorithmNote>
    <a className="official-advisory" href="https://www.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer"><Icon name="shield" size={16} />Check official PAGASA advisories <Icon name="arrow" size={14} /></a>
  </section>;
}
