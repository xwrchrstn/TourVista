import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapView, { useMapView } from './MapView.jsx';

const empty = [];

export default function CampsiteMap({
  campsites, origin, originAccuracy, originLabel = 'Starting point', onSelectOrigin, showEndpointLabels = false,
  route = empty, routeSegments = empty, connectors = empty, roadRoute = false, showBoundary = false,
  liveFix, liveCenter, overlay
}) {
  const element = useRef(null);
  const map = useRef(null);
  const markers = useRef(null);
  const liveMarkers = useRef(null);
  const liveCentered = useRef(false);
  const focusRequest = useRef(0);
  const frameBounds = useRef(null);
  const hasLiveFix = Boolean(liveFix);

  useEffect(() => {
    map.current = L.map(element.current, { zoomAnimation: false }).setView([8.64, 124.92], 11);
    markers.current = L.layerGroup().addTo(map.current);
    liveMarkers.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);
  const appearance = useMapView(map);

  useEffect(() => {
    if (!onSelectOrigin) return;
    const instance = map.current;
    const select = ({ latlng }) => onSelectOrigin({ latitude: latlng.lat, longitude: L.Util.wrapNum(latlng.lng, [-180, 180]) });
    instance.on('click', select);
    return () => instance.off('click', select);
  }, [onSelectOrigin]);

  useEffect(() => {
    markers.current.clearLayers();
    const points = [];
    campsites.forEach((camp) => {
      if (!Number.isFinite(camp.latitude) || !Number.isFinite(camp.longitude)) return;
      const point = [camp.latitude, camp.longitude];
      points.push(point);
      // textContent displays data as text rather than interpreting it as HTML.
      const popup = document.createElement('span');
      popup.textContent = `${camp.name} · PHP ${camp.price} per night`;
      const marker = L.circleMarker(point, { radius: 8, color: '#fff', weight: 2, fillColor: '#17644d', fillOpacity: 1 })
        .bindPopup(popup).addTo(markers.current);
      if (showEndpointLabels && campsites.length === 1) marker.bindTooltip('Campsite', { permanent: true, direction: 'top', offset: [0, -7] });
      if (showBoundary && camp.polygon?.length >= 3) {
        const boundary = camp.polygon.map((item) => [item.latitude, item.longitude]);
        L.polygon(boundary, { color: '#17644d', fillOpacity: 0.12, weight: 2 }).bindPopup('Recorded check-in boundary').addTo(markers.current);
        points.push(...boundary);
      }
    });
    if (origin && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)) {
      const point = [origin.latitude, origin.longitude];
      points.push(point);
      if (!hasLiveFix && Number.isFinite(originAccuracy) && originAccuracy > 0) {
        L.circle(point, { radius: originAccuracy, color: '#2263a9', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(markers.current);
      }
      const marker = L.circleMarker(point, { radius: hasLiveFix ? 6 : 8, color: '#fff', weight: 2, fillColor: hasLiveFix ? '#63726c' : '#2263a9', fillOpacity: 1 })
        .bindPopup(originLabel).addTo(markers.current);
      if (showEndpointLabels && !hasLiveFix) marker.bindTooltip(originLabel, { permanent: true, direction: 'top', offset: [0, -7] });
    }
    for (const segment of routeSegments.length ? routeSegments : [route]) {
      if (!segment.length) continue;
      const pattern = roadRoute ? {} : { dashArray: '8 6' };
      L.polyline(segment, { color: '#fff8e9', weight: 7, opacity: 0.95, interactive: false, ...pattern }).addTo(markers.current);
      L.polyline(segment, { color: '#b65728', weight: 4, ...pattern }).addTo(markers.current);
      for (const point of segment) points.push(point);
    }
    connectors.forEach((line) => { L.polyline(line, { color: '#577870', weight: 3, dashArray: '5 6' }).addTo(markers.current); points.push(...line); });
    frameBounds.current = points.length ? L.latLngBounds(points) : null;
    if (frameBounds.current) map.current.fitBounds(frameBounds.current, { padding: [30, 30], maxZoom: 13, animate: false });
  }, [campsites, origin, originAccuracy, originLabel, showEndpointLabels, route, routeSegments, connectors, roadRoute, showBoundary, hasLiveFix]);

  useEffect(() => {
    const layer = liveMarkers.current;
    layer.clearLayers();
    if (!liveFix) {
      liveCentered.current = false;
      return;
    }
    const { point, accuracy } = liveFix;
    const center = [point.latitude, point.longitude];
    if (Number.isFinite(accuracy) && accuracy > 0) {
      L.circle(center, { radius: accuracy, color: '#2263a9', weight: 1, fillOpacity: .14, interactive: false }).addTo(layer);
    }
    L.circleMarker(center, { radius: 9, color: '#fff', weight: 3, fillColor: '#2263a9', fillOpacity: 1 })
      .bindTooltip('Your live location', { permanent: true, direction: 'top', offset: [0, -7] }).addTo(layer);
    if (liveCenter !== focusRequest.current) {
      map.current.panTo(center, { animate: false });
      liveCentered.current = true;
      focusRequest.current = liveCenter;
      return;
    }
    if (liveCentered.current) return;
    const bounds = L.latLngBounds([center]);
    if (frameBounds.current) bounds.extend(frameBounds.current);
    map.current.fitBounds(bounds, { paddingTopLeft: [30, 60], paddingBottomRight: [35, 105], maxZoom: 15, animate: false });
    liveCentered.current = true;
  }, [liveFix, liveCenter]);

  return <MapView appearance={appearance}>
    <div ref={element} className={onSelectOrigin ? 'map map-pick-origin' : 'map'} aria-label="Campsite location and route map" />
    {overlay}
  </MapView>;
}
