import React, { useEffect, useId, useRef, useState } from 'react';
import { Field, useApp } from './context.jsx';
import CampsiteMap from './Map.jsx';
import { AlgorithmNote, ToolHeader, ToolMessage } from './DecisionUI.jsx';
import { displayDate, drivingTime } from './decision-display.js';
import { RouteOptions, DrivingSource } from './RouteOptions.jsx';
import { RouteMapStartHint, RouteStartFields, useRouteStart } from './RouteStart.jsx';

const distance = (value) => value.toFixed(2) + ' km';

export default function Itinerary() {
  const { dashboard, campsites, session, action, api } = useApp();
  const [campId, setCampId] = useState('');
  const [date, setDate] = useState(session.today);
  const [mode, setMode] = useState('driving');
  const [pending, setPending] = useState('');
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const formId = useId();
  const resultPanel = useRef(null);
  const start = useRouteStart({ mapRef: resultPanel, onChange: () => { setRecord(null); setError(''); } });
  const { point } = start;
  const stops = dashboard?.itinerary || [];
  const chosenCampId = campsites.some((camp) => camp.id === Number(campId)) ? campId : campsites[0]?.id || '';
  const basis = JSON.stringify({ stops, point, mode });
  const route = !start.picking && record?.basis === basis ? record.result : null;
  const disabled = Boolean(pending) || start.locating;
  const campName = (id) => campsites.find((camp) => camp.id === id)?.name || `Campsite #${id}`;

  useEffect(() => {
    if (route?.available) resultPanel.current?.scrollIntoView({ block: 'start' });
  }, [route]);

  async function save(stopsToSave) {
    setPending('save');
    try {
      const saved = await action('/itinerary', { method: 'PUT', body: { stops: stopsToSave } }, 'Itinerary saved.');
      if (saved) setRecord(null);
    } finally {
      setPending('');
    }
  }

  function move(index, offset) {
    const next = [...stops];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return save(next);
  }

  async function calculate(event) {
    event.preventDefault();
    if (!start.ready || start.picking || start.locating) return;
    setPending('route');
    setError('');
    setRecord(null);
    try {
      const result = await api('/routes', {
        method: 'POST', body: { origin: point, mode, destinationIds: stops.map((stop) => stop.campId) }
      });
      if (!Array.isArray(result.legs) || (mode === 'driving' && result.mode !== 'driving')) {
        throw new Error('Restart TourVista to load the updated itinerary service.');
      }
      setRecord({ basis, result });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending('');
    }
  }

  const shownCamps = campsites.filter((camp) => stops.some((stop) => stop.campId === camp.id));
  const mapped = route?.legs.filter((leg) => leg.coordinates?.length) || [];
  const showRoute = Boolean(route?.coordinates?.length || mapped.length);
  const connectors = route?.connectors || mapped.flatMap((leg) => leg.connectors);
  return <>
    <div className="page-heading"><h1>My itinerary</h1><p>Save your stops in visit order, then check the roads between them.</p></div>
    <form className="trip-bar" onSubmit={(event) => {
      event.preventDefault();
      save([...stops, { campId: Number(chosenCampId), date }]);
    }}>
      <Field label="Campsite"><select required disabled={disabled} value={chosenCampId} onChange={(event) => setCampId(event.target.value)}>
        {campsites.map((camp) => <option key={camp.id} value={camp.id}>{camp.name}</option>)}
      </select></Field>
      <Field label="Visit date" required type="date" value={date} disabled={disabled} onChange={(event) => setDate(event.target.value)} />
      <button className="primary" disabled={disabled || !chosenCampId || stops.length >= 20}>Add destination</button>
    </form>
    <section className="panel">
      <h2>Saved stops</h2>
      {stops.length ? <ol className="itinerary-stops">{stops.map((stop, index) => <li className="list-row" key={index}>
        <div>
          <strong>{index + 1}. {campName(stop.campId)}</strong>
          <p>{displayDate(stop.date, { year: 'numeric' })}</p>
        </div>
        <div className="button-row">
          <button disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`Move stop ${index + 1} up`}>Move up</button>
          <button disabled={disabled || index === stops.length - 1} onClick={() => move(index, 1)} aria-label={`Move stop ${index + 1} down`}>Move down</button>
          <button disabled={disabled} onClick={() => save(stops.filter((_, item) => item !== index))} aria-label={`Remove stop ${index + 1}`}>Remove</button>
        </div>
      </li>)}</ol> : <p>Add a campsite here or from its details page to start planning.</p>}
      {stops.length >= 20 && <p>You have reached the limit of 20 stops.</p>}
    </section>
    {stops.length > 0 && <section className="panel decision-tool itinerary-route" aria-label="Itinerary road routes">
      <ToolHeader icon="route" eyebrow="Trip planning" title="Preview your trip"
        algorithm={mode === 'driving' ? 'Driving route' : 'Haversine + Dijkstra'}
        description="See the route from your starting point through your saved stops in order." />
      <form id={formId} onSubmit={calculate}>
        <fieldset className="form-state" disabled={disabled}>
          <RouteStartFields start={start} />
          <RouteOptions mode={mode} onChange={(value) => { setMode(value); setError(''); }} />
        </fieldset>
      </form>
      <div className="route-result-anchor" ref={resultPanel}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="arrival-map">
          <RouteMapStartHint start={start} disabled={disabled} />
          <CampsiteMap campsites={shownCamps} origin={start.ready ? point : null} originAccuracy={start.accuracy}
            originLabel={start.source === 'device' ? 'Your location' : 'Starting point'}
            onSelectOrigin={start.picking && !disabled ? start.selectOnMap : undefined}
            route={route?.coordinates} routeSegments={mapped.map((leg) => leg.coordinates)} connectors={connectors}
            roadRoute showEndpointLabels />
          <div className="map-legend">
            {start.ready && <span><i className="legend-origin" />{start.source === 'device' ? 'Your location' : 'Starting point'}</span>}
            <span><i className="legend-campsite" />Saved campsites</span>
            {showRoute && <span><i className="legend-road" />{mode === 'driving' ? 'Driving route' : 'Recorded road'}</span>}
            {connectors.length > 0 && <span><i className="legend-access" />Unverified access link</span>}
          </div>
        </div>
        <button className="primary tool-submit route-map-submit" type="submit" form={formId}
          disabled={disabled || !start.ready || start.picking}>
          {pending === 'route' ? 'Calculating the route…' : mode === 'driving' ? 'Preview driving route' : 'Preview local routes'}
        </button>
        {showRoute && mode === 'driving' && <DrivingSource source={route.source} />}
        {route && <ItineraryResult route={route} campName={campName} />}
      </div>
      <AlgorithmNote name="Haversine + Dijkstra">
        <p>Dijkstra finds the shortest connected road path for each leg using Haversine segment lengths. The order of your stops sets the order of the searches.</p>
        <p>The graph covers 8.50–8.78°N and 124.75–125.08°E. Ask the campsite owner to confirm entrance access and current road conditions before travel.</p>
      </AlgorithmNote>
    </section>}
  </>;
}

function ItineraryResult({ route, campName }) {
  const driving = route.mode === 'driving';
  const connected = route.legs.filter((leg) => leg.available).length;
  const title = route.available ? `${distance(route.roadKm)} total driving distance`
    : driving ? 'Driving preview unavailable' : `${connected} of ${route.legs.length} legs have a recorded road route`;
  return <div className="itinerary-result" aria-live="polite">
    <ToolMessage title={title} tone={route.available ? 'neutral' : 'moderate'}>
      {route.available && driving ? `Estimated driving time: ${drivingTime(route.durationSeconds)}. Stops follow your saved order.`
        : route.available ? 'Access distances are shown separately for each leg.'
          : route.reason || 'Review the missing connections below.'}
    </ToolMessage>
    <ol className="itinerary-stops itinerary-legs">
      {route.legs.map((leg, index) => <li className="list-row" key={index}>
        <div>
          <strong>{leg.fromCampId === null ? 'Starting point' : campName(leg.fromCampId)} → {campName(leg.toCampId)}</strong>
          {leg.available ? <p>{distance(leg.roadKm)} on roads · {driving
            ? drivingTime(leg.durationSeconds) : `${distance(leg.connectorKm)} unverified access links`}</p>
            : <p>{!driving && leg.reason + ' '}Straight-line distance: {distance(leg.geographicKm)}.</p>}
          {leg.geometryOmitted && <p>This leg exceeds the display limit for mapped points. Its measured distance is shown above.</p>}
        </div>
      </li>)}
    </ol>
    {route.graphVersion && <p className="tool-caption">
      {route.source} · {route.graphVersion} · {route.saved ? 'File updated' : 'Retrieved'} {new Date(route.fetchedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.
      {route.dataTimestamp && ` OSM data: ${route.dataTimestamp}.`}
    </p>}
  </div>;
}
