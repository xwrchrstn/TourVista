import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Field } from './context.jsx';
import Icon from './Icons.jsx';
import { AlgorithmNote } from './DecisionUI.jsx';
import { listingBoundaryProblem } from '../../shared/listing-profile.js';
import MapView, { useMapView } from './MapView.jsx';

export default function LocationEditor({ point, polygon, confirmed, onPoint, onPolygon, onConfirmed }) {
  const element = useRef(null), map = useRef(null), pin = useRef(null), shape = useRef(null), dots = useRef(null), callbacks = useRef({});
  const dialog = useRef(null), expandButton = useRef(null), closeButton = useRef(null);
  const [drawing, setDrawing] = useState(false), [locating, setLocating] = useState(false), [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  callbacks.current = { point, polygon, drawing, onPoint, onPolygon };
  const valid = Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
  useEffect(() => {
    const sheet = dialog.current;
    sheet.show();
    const start = valid ? [point.latitude, point.longitude] : [8.61, 124.89];
    map.current = L.map(element.current, { scrollWheelZoom: false, zoomAnimation: false }).setView(start, 14);
    const icon = L.divIcon({ className: 'owner-location-marker', html: '<span aria-hidden="true"></span>', iconSize: [30, 38], iconAnchor: [15, 37] });
    pin.current = L.marker(start, { draggable: true, icon, title: 'Campsite entrance: drag to adjust' }).addTo(map.current);
    pin.current.on('dragend', () => { const p = pin.current.getLatLng(); callbacks.current.onPoint({ latitude: Number(p.lat.toFixed(6)), longitude: Number(p.lng.toFixed(6)) }); });
    shape.current = L.layerGroup().addTo(map.current); dots.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (event) => {
      const value = { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(L.Util.wrapNum(event.latlng.lng, [-180, 180], true).toFixed(6)) }, current = callbacks.current;
      if (current.drawing) { if (current.polygon.length < 100) current.onPolygon([...current.polygon, value]); }
      else current.onPoint(value);
    });
    const observer = new ResizeObserver(() => map.current?.invalidateSize({ pan: false }));
    observer.observe(element.current);
    return () => { observer.disconnect(); sheet.close(); map.current?.remove(); map.current = null; };
  }, []);
  const appearance = useMapView(map);
  useEffect(() => { if (expanded) closeButton.current?.focus(); }, [expanded]);
  useEffect(() => {
    if (!map.current || !valid) return;
    const next = L.latLng(point.latitude, point.longitude); pin.current.setLatLng(next);
    if (!map.current.getBounds().contains(next)) map.current.setView(next, 15);
  }, [point.latitude, point.longitude, valid]);
  useEffect(() => {
    if (!shape.current) return; shape.current.clearLayers(); dots.current.clearLayers();
    const points = polygon.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => [p.latitude, p.longitude]);
    if (points.length >= 3) L.polygon(points, { color: '#c47b32', weight: 2, fillOpacity: .16 }).addTo(shape.current);
    else if (points.length) L.polyline(points, { color: '#c47b32', dashArray: '5 4', weight: 2 }).addTo(shape.current);
    points.forEach((p) => L.circleMarker(p, { radius: 4, color: '#9b5b20', fillColor: '#fff', fillOpacity: 1 }).addTo(dots.current));
  }, [polygon]);
  function locate() {
    setMessage(''); if (!navigator.geolocation) { setMessage('GPS is unavailable. Move the pin or enter coordinates manually.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      onPoint({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) });
      setMessage(`GPS accuracy is about ${Math.round(position.coords.accuracy)} m. Adjust the pin to the campsite entrance, then confirm it below.`); setLocating(false);
    }, () => { setMessage('GPS could not be obtained. Allow location access, or set the pin manually.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function resizeMap(next) {
    const sheet = dialog.current;
    sheet.close();
    if (next) sheet.showModal();
    else {
      sheet.show();
      expandButton.current?.focus();
    }
    setExpanded(next);
  }
  const problem = listingBoundaryProblem({ ...point, polygon });
  function finishAndClose() {
    setDrawing(false);
    resizeMap(false);
  }
  return <div className="location-editor"><div className="location-tools"><div><strong>{drawing ? 'Draw the check-in boundary' : 'Place the campsite entrance'}</strong><p>{drawing ? 'Tap around the property perimeter, then finish the boundary.' : 'Tap the map or drag the pin to the actual campsite entrance.'}</p></div><button type="button" disabled={locating} onClick={locate}><Icon name="pin" size={17} />{locating ? 'Getting GPS…' : 'Use GPS location'}</button></div>
    <button ref={expandButton} type="button" className="owner-map-expand" onClick={() => resizeMap(true)}><Icon name="expand" size={18} /> Expand map</button>
    <dialog ref={dialog} className={'owner-map-dialog' + (expanded ? ' is-expanded' : '')} aria-label="Campsite entrance and check-in boundary"
      onCancel={(event) => { event.preventDefault(); resizeMap(false); }}>
      {expanded && <div className="owner-map-toolbar">
        <div><strong>{drawing ? 'Draw the check-in boundary' : 'Place the campsite entrance'}</strong><p>{drawing ? 'Tap around the perimeter to add points.' : 'Tap the map or drag the pin. Use + and − to zoom.'}</p></div>
        <button ref={closeButton} type="button" onClick={() => resizeMap(false)}><Icon name="close" size={18} /> Close map</button>
      </div>}
      <MapView appearance={appearance}>
        <div ref={element} className={'owner-location-map' + (drawing ? ' is-drawing' : '')} aria-label="Set campsite entrance and check-in boundary map" />
      </MapView>
      {expanded && <div className="owner-map-toolbar owner-map-footer">
        <button type="button" onClick={() => setDrawing(!drawing)}>{drawing ? 'Finish drawing' : polygon.length ? 'Add boundary points' : 'Draw boundary'}</button>
        {drawing && <button type="button" disabled={!polygon.length} onClick={() => onPolygon(polygon.slice(0, -1))}>Undo point</button>}
        {polygon.length > 0 && <button type="button" className="primary compact owner-map-done" onClick={finishAndClose}>
          <Icon name="check" size={18} />{drawing ? 'Finish & close map' : 'Done and close map'}
        </button>}
      </div>}
    </dialog>
    {message && <p className="notice-box" role="status">{message}</p>}
    <label className="location-confirm"><input type="checkbox" checked={confirmed} disabled={!valid} onChange={(e) => onConfirmed(e.target.checked)} /><span>This pin marks my campsite entrance.</span></label>
    {problem && <p className="error">{problem}</p>}
    <div className="editor-optional">
      <details>
        <summary>Coordinates and optional check-in boundary <Icon name="chevron" size={17} /></summary>
        <div className="editor-optional-content">
          <div className="two-fields"><Field label="Entrance latitude" type="number" min="-90" max="90" step="any" value={point.latitude} onChange={(e) => onPoint({ ...point, latitude: e.target.value === '' ? '' : Number(e.target.value) })} /><Field label="Entrance longitude" type="number" min="-180" max="180" step="any" value={point.longitude} onChange={(e) => onPoint({ ...point, longitude: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
          <div className="boundary-tools"><div><strong>GPS check-in boundary</strong><p>Draw the campsite perimeter if you want guests to check in using GPS.</p></div><div className="button-row"><button type="button" onClick={() => setDrawing(!drawing)}>{drawing ? 'Finish drawing' : polygon.length ? 'Add boundary points' : 'Draw boundary'}</button><button type="button" disabled={!polygon.length} onClick={() => onPolygon(polygon.slice(0, -1))}>Undo point</button><button type="button" disabled={!polygon.length} onClick={() => { onPolygon([]); setDrawing(false); }}>Clear boundary</button></div><p className="fine">{polygon.length ? `${polygon.length} boundary points recorded. Keep the entrance pin inside the perimeter.` : 'No check-in boundary recorded.'}</p></div>
          <AlgorithmNote name="Ray-Casting"><p>The entrance pin marks the destination. The boundary is a separate shape: Ray-Casting checks whether a guest's reported GPS point lies inside it. An uncertain GPS reading is referred to the host.</p><p>A boundary needs at least three valid points and must not cross itself. Existing bookings keep their recorded boundary when the listing changes.</p></AlgorithmNote>
        </div>
      </details>
    </div>
    <p className="fine">GPS runs only when you choose it. Map backgrounds load from OpenStreetMap; coordinates are saved to TourVista when you save the listing.</p>
  </div>;
}
