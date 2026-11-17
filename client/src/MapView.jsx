import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import Icon from './Icons.jsx';
import './map-view.css';

const views = {
  street: {
    label: 'Map',
    icon: 'foldedMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    referrerPolicy: 'strict-origin-when-cross-origin',
    maxNativeZoom: 19,
    problem: 'Some street map tiles could not load. Check your connection or try Satellite.',
  },
  satellite: {
    label: 'Satellite',
    icon: 'satellite',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: '<a href="https://cloudless.eox.at/">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
    referrerPolicy: 'no-referrer',
    maxNativeZoom: 15,
    problem: 'Some satellite imagery could not load. Switch to Map to see the street view.',
  },
};

// Call after the effect that creates the Leaflet map. Replace only its tile layer.
export function useMapView(map) {
  const [view, setView] = useState('street');
  const [failedView, setFailedView] = useState(null);

  useEffect(() => {
    const instance = map.current;
    const { url, attribution, referrerPolicy, maxNativeZoom } = views[view];
    let tileFailed = false;
    const layer = L.tileLayer(url, { attribution, referrerPolicy, maxNativeZoom, maxZoom: 19 });
    layer.on('loading', () => { tileFailed = false; });
    layer.on('tileerror', () => { tileFailed = true; setFailedView(view); });
    layer.on('load', () => { if (!tileFailed) setFailedView(null); });
    layer.addTo(instance);
    return () => { layer.remove(); layer.off(); };
  }, [map, view]);

  function change(next) {
    if (next === view) return;
    setFailedView(null);
    setView(next);
  }

  return { view, change, problem: failedView === view ? views[view].problem : '' };
}

export default function MapView({ appearance, children }) {
  return <>
    <div className="map-frame" data-map-view={appearance.view}>
      {children}
      <div className="map-style-switch" role="group" aria-label="Map view">
        {Object.entries(views).map(([key, { label, icon }]) => (
          <button key={key} type="button" aria-pressed={appearance.view === key} onClick={() => appearance.change(key)}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
    </div>
    {appearance.problem && <p className="notice-box map-tile-notice" role="status">{appearance.problem}</p>}
  </>;
}
