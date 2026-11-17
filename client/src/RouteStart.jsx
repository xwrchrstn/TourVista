import React, { useRef, useState } from 'react';
import { Field } from './context.jsx';
import Icon from './Icons.jsx';
import { readDeviceStart, validRouteStart } from './route-start.js';

const blank = { latitude: '', longitude: '' };

export function useRouteStart({ mapRef, onChange }) {
  const [point, setPoint] = useState(blank);
  const [source, setSource] = useState('manual');
  const [accuracy, setAccuracy] = useState(null);
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const ready = validRouteStart(point);

  function apply(next, nextSource, nextAccuracy = null) {
    setPoint(next);
    setSource(nextSource);
    setAccuracy(nextAccuracy);
    setError('');
    setPicking(false);
    onChange();
  }

  async function locate() {
    const pending = ++request.current;
    apply(blank, 'manual');
    setLocating(true);
    try {
      const fix = await readDeviceStart(navigator.geolocation);
      if (request.current !== pending) return;
      apply(fix.point, 'device', fix.accuracy);
      mapRef.current?.scrollIntoView({ block: 'start' });
    } catch (failure) {
      if (request.current === pending) setError(failure.message);
    } finally {
      if (request.current === pending) setLocating(false);
    }
  }

  function changeCoordinate(field, value) {
    apply({ ...point, [field]: value === '' ? '' : Number(value) }, 'manual');
  }

  function chooseOnMap() {
    setError('');
    setPicking(!picking);
    if (!picking) mapRef.current?.scrollIntoView({ block: 'start' });
  }

  return {
    point, ready, source, accuracy, locating, picking, error,
    locate, changeCoordinate, chooseOnMap,
    useFix: (fix) => apply(fix.point, 'device', fix.accuracy),
    selectOnMap: (next) => apply(next, 'manual')
  };
}

export function RouteStartFields({ start }) {
  const { point, source, accuracy, locating, picking, ready, error } = start;
  const accuracyText = accuracy === null ? '' : accuracy >= 1000
    ? ` within about ${(accuracy / 1000).toFixed(1)} km` : ` within about ${Math.max(1, Math.round(accuracy))} m`;

  return <>
    <button type="button" className="location-action" onClick={start.locate}>
      <Icon name="pin" size={18} />{locating ? 'Getting your location…' : 'Use my current location'}
    </button>
    <div className="route-start-actions">
      {!ready && !picking && <button type="button" className="secondary compact" onClick={start.chooseOnMap}>
        Set start on map
      </button>}
      <p className="tool-caption" role="status">
        {locating ? 'Waiting for your device location.'
          : picking ? 'Tap the map where you want to start.'
            : ready && source === 'device' ? `Device location marked${accuracyText}. Check the blue pin before previewing.`
              : ready ? 'Your selected starting point is marked in blue.' : 'Choose where your drive should start.'}
      </p>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <details className="route-coordinate-fields">
      <summary>Enter coordinates manually</summary>
      <div className="two-fields">
        <Field label="Starting latitude" type="number" step="any" min="-90" max="90"
          value={point.latitude} onChange={(event) => start.changeCoordinate('latitude', event.target.value)} />
        <Field label="Starting longitude" type="number" step="any" min="-180" max="180"
          value={point.longitude} onChange={(event) => start.changeCoordinate('longitude', event.target.value)} />
      </div>
    </details>
  </>;
}

export function RouteMapStartHint({ start, disabled }) {
  if (!start.ready && !start.picking) return null;

  return <div className="route-map-start-hint">
    <p role="status">{start.picking ? 'Tap the map to place your starting point.'
      : start.source === 'device' ? 'Check that the blue pin matches your current location.'
        : 'The blue pin is your selected starting point.'}</p>
    <button type="button" className="secondary compact" disabled={disabled} onClick={start.chooseOnMap}>
      {start.picking ? 'Cancel map selection' : 'Adjust starting pin'}
    </button>
  </div>;
}
