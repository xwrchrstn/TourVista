import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from './context.jsx';
import CampsiteMap from './Map.jsx';
import Icon from './Icons.jsx';
import { ToolHeader, ToolMessage, AlgorithmNote } from './DecisionUI.jsx';
import { RouteOptions, DrivingSource } from './RouteOptions.jsx';
import { drivingTime } from './decision-display.js';
import { RouteMapStartHint, RouteStartFields, useRouteStart } from './RouteStart.jsx';
import { useLiveDistance } from './LiveDistance.jsx';
import { remainingRoadKm, routeProgress } from './live-distance.js';
import { haversineKm } from '../../shared/geography.js';

const km = (value) => Number.isFinite(value) ? value.toFixed(2) + ' km' : '—';
const liveKm = (value) => value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
const empty = [];

export default function ArrivalPlanner({ camp, reservationId }) {
  const { session, api, navigate } = useApp();
  const [mode, setMode] = useState('driving');
  const [lookup, setLookup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();
  const mapResult = useRef(null);
  const start = useRouteStart({ mapRef: mapResult, onChange: () => { setLookup(null); setError(''); } });
  const { point } = start;
  const basis = JSON.stringify({ point, mode, campId: camp.id, latitude: camp.latitude, longitude: camp.longitude, reservationId });
  const result = !start.picking && lookup?.basis === basis ? lookup.result : null;
  const connected = Boolean(result?.available);
  const driving = mode === 'driving';
  const tourist = session.user?.role === 'tourist';
  const liveEnabled = Boolean(tourist && reservationId);
  const live = useLiveDistance(liveEnabled);
  const [liveCenter, setLiveCenter] = useState(0);
  const mapCamps = useMemo(() => [camp], [camp]);
  const route = useMemo(() => connected ? routeProgress(result.coordinates, result.roadKm) : null, [connected, result]);
  const livePoint = live.fix?.point;
  const straightDistance = livePoint ? haversineKm(livePoint, camp) : null;
  const roadDistance = livePoint ? remainingRoadKm(livePoint, live.fix.accuracy, route) : null;

  useEffect(() => {
    if (connected) {
      mapResult.current?.focus({ preventScroll: true });
      mapResult.current?.scrollIntoView({ block: 'start' });
    }
  }, [result, connected]);

  async function plan(event) {
    event.preventDefault();
    if (!start.ready || start.picking || start.locating) return;
    setBusy(true);
    setError('');
    setLookup(null);
    try {
      const path = reservationId ? '/reservations/' + reservationId + '/route' : '/routes/road';
      const response = await api(path, { method: 'POST', body: { campId: camp.id, origin: point, mode } });
      if (driving && response.mode !== 'driving') throw new Error('Restart TourVista to load the new driving preview.');
      setLookup({ basis, result: response });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="road-planner decision-tool" aria-label="Plan your arrival">
    <ToolHeader icon="route" title="Directions to the campsite" as="h2"
      description="Choose your starting point, then preview the drive on this map." />
    <div className="arrival-destination">
      <span><Icon name="tent" size={23} /></span>
      <div><small>Your destination</small><strong>{camp.name}</strong>{camp.demoListing && <small>Illustrative entrance pin</small>}</div>
      {reservationId && <span className="booking-destination-label"><Icon name="shield" size={14} />Booking #{reservationId}</span>}
    </div>
    {tourist ? <form id={formId} onSubmit={plan}>
      <fieldset disabled={busy || start.locating} className="form-state">
        <RouteStartFields start={start} />
        <details className="route-coordinate-fields"><summary>Route options</summary><RouteOptions mode={mode} onChange={(value) => { setMode(value); setError(''); }} /></details>
      </fieldset>
    </form> : !session.user && <ToolMessage title="Sign in to preview the drive" icon="user">
      <button className="primary compact" onClick={() => navigate('login')}>Sign in <Icon name="arrow" size={14} /></button>
    </ToolMessage>}

    <div className="route-result-anchor" tabIndex={-1} ref={mapResult}>
      {error && <p className="error" role="alert">{error}</p>}
      {lookup && !result && !start.picking && <p className="tool-caption">Preview again to update the route for your new settings.</p>}
      {result && !connected && <div aria-live="polite">
        <ToolMessage title={driving ? 'Driving preview unavailable' : 'Local road preview unavailable'} icon="route" tone="moderate">
          <p>{result.reason}</p>
          {Number.isFinite(result.geographicKm) && <p>Straight-line distance: {km(result.geographicKm)}.</p>}
        </ToolMessage>
      </div>}
      {connected && <div className="route-result" aria-live="polite">
        <h4>{driving ? 'Recommended driving route' : 'Shortest recorded route near Claveria'}</h4>
        <div className="route-metrics">
          <div><Icon name="route" size={20} /><strong>{km(result.roadKm)}</strong><span>Road distance</span></div>
          <div><Icon name={driving ? 'clock' : 'pin'} size={20} />
            <strong>{driving ? drivingTime(result.durationSeconds) : km(result.geographicKm)}</strong>
            <span>{driving ? 'Estimated driving time' : 'Straight-line distance'}</span></div>
          <div><Icon name="info" size={20} /><strong>{km(result.connectorKm)}</strong><span>Unverified access links</span></div>
        </div>
      </div>}
      {liveEnabled && <div className="live-route-controls">
        <button type="button" className={live.tracking ? 'secondary compact' : 'primary compact'} onClick={live.tracking ? live.stop : live.start}>
          <Icon name="pin" size={18} />{live.tracking ? 'Stop live distance' : 'Start live distance'}
        </button>
        {live.fix && <>
          <button type="button" className="secondary compact" onClick={() => setLiveCenter((value) => value + 1)}>Center on my location</button>
          <button type="button" className="secondary compact" disabled={busy || start.locating} onClick={() => start.useFix(live.fix)}>Use live pin as route start</button>
        </>}
        {live.error ? <p className="error" role="alert">{live.error}</p> : live.tracking && !live.fix
          ? <p className="tool-caption" role="status">Getting your live location…</p>
          : !live.tracking && <p className="tool-caption">See the distance to your campsite as you move.</p>}
      </div>}
      <div className="arrival-map">
        {(!live.fix || start.picking) && <RouteMapStartHint start={start} disabled={busy || start.locating} />}
        <CampsiteMap campsites={mapCamps} origin={start.ready ? point : null} originAccuracy={start.accuracy}
          originLabel={start.source === 'device' && !live.tracking ? 'Your location' : 'Starting point'}
          onSelectOrigin={start.picking && !busy ? start.selectOnMap : undefined}
          route={connected ? result.coordinates : empty} connectors={connected ? result.connectors : empty} roadRoute showBoundary showEndpointLabels
          liveFix={live.fix} liveCenter={liveCenter}
          overlay={livePoint && <div className="live-distance-overlay" role="group" aria-label="Live distance to campsite">
            <span><i /> Live distance</span>
            <strong>{liveKm(roadDistance ?? straightDistance)}</strong>
            <small>{roadDistance !== null ? 'Estimated road distance remaining' : 'Straight-line distance to entrance'}</small>
          </div>} />
        <div className="map-legend" aria-label="Map legend">
          {start.ready && <span><i className={live.fix ? 'legend-origin legend-route-start' : 'legend-origin'} />{start.source === 'device' && !live.tracking ? 'Your location' : 'Starting point'}</span>}
          {live.fix && <span><i className="legend-origin" />Your live location</span>}
          <span><i className="legend-campsite" />Campsite</span>
          <span><i className="legend-boundary" />Check-in boundary</span>
          {connected && <>
            <span><i className="legend-road" />{driving ? 'Driving route' : 'Recorded road'}</span>
            {result.connectors.length > 0 && <span><i className="legend-access" />Unverified access link</span>}
          </>}
        </div>
      </div>
      {livePoint && connected && roadDistance === null && <p className="tool-caption">For an updated road estimate, use your live pin as the route start and preview again when stopped.</p>}
      {tourist && driving && <p className="tool-caption route-privacy">Previewing sends the two map pins to the OSRM routing service.</p>}
      {tourist && <button className="primary tool-submit route-map-submit" type="submit" form={formId}
        disabled={busy || start.locating || !start.ready || start.picking}>
        <Icon name="route" size={18} />{busy ? 'Calculating the route…' : driving ? 'Preview driving route' : 'Preview local route'}
        <Icon name="arrow" size={17} />
      </button>}
    </div>

    {connected && driving && <DrivingSource source={result.source} />}
    {connected && result.connectorKm >= 0.02 && <p className="tool-caption">Confirm the final access road with the campsite owner.</p>}
    {connected && !driving && result.roads?.length > 0 && <details className="route-road-list">
      <summary>See roads on this route</summary>
      <ol>{result.roads.map((road, index) => <li key={index}><span>{road.name}</span><strong>{km(road.km)}</strong></li>)}</ol>
    </details>}
    {result?.graphVersion && <details className="route-data-details">
      <summary>Local road data and calculation details</summary>
      <p>{result.message}</p>
      <p>{result.source} · {result.saved ? 'File updated' : 'Retrieved'} {new Date(result.fetchedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {result.graphVersion}</p>
    </details>}
    <AlgorithmNote name="Driving routes and local Dijkstra">
      <p>The driving preview uses OSRM's recommended car route across mapped roads. Its time estimate uses the road profile.</p>
      <p>TourVista's local Dijkstra preview uses Haversine edge lengths to find the shortest recorded path within 8.50–8.78°N and 124.75–125.08°E.</p>
      {reservationId && <p>The destination uses the entrance pin saved with your booking.</p>}
    </AlgorithmNote>
  </section>;
}
