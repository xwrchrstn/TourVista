import { haversineKm } from './algorithms.js';

const publicRouter = 'https://routing.openstreetmap.de/routed-car';
const snapRadiusMeters = 2000;
const maxResponseBytes = 2_500_000;
const maxRoutePoints = 50_000;
const noRoad = 'The driving service found no connected road route. Check the starting point and campsite entrance.';
const noRoadNearPin = 'A starting point or stop is too far from a mapped driving road. Check the pin or ask the host for the entrance.';
const unavailable = 'The driving service is temporarily unavailable. Try the preview again in a moment.';

function routerBase(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('DRIVING_ROUTER_URL must be an HTTPS OSRM base URL or a local HTTP OSRM instance.');
  }
  return url.href.replace(/\/+$/, '');
}

function latLng(point) {
  if (!Array.isArray(point) || point.length !== 2) throw new Error('Invalid route coordinate.');
  const [longitude, latitude] = point;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Invalid route coordinate.');
  return [latitude, longitude];
}

async function readRouteResponse(response) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxResponseBytes) throw new Error('Route response exceeds its size limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function measurement(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid route measurement.');
  return value;
}

function mapRoute(data, points, legs, source) {
  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString' ||
      !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > maxRoutePoints ||
      !Array.isArray(route.legs) || route.legs.length !== legs.length ||
      !Array.isArray(data.waypoints) || data.waypoints.length !== points.length) throw new Error('Incomplete driving route.');

  const snaps = data.waypoints.map((waypoint, index) => {
    const position = latLng(waypoint.location);
    const input = points[index];
    const km = haversineKm(input, { latitude: position[0], longitude: position[1] });
    if (km > snapRadiusMeters / 1000 + 0.05) throw new Error('Driving route snapped outside its access radius.');
    return { km, line: [[input.latitude, input.longitude], position] };
  });
  const geometry = coordinates.map(latLng);
  const endpoints = [[geometry[0], snaps[0].line[1]], [geometry.at(-1), snaps.at(-1).line[1]]];
  for (const [[latitude, longitude], [snapLatitude, snapLongitude]] of endpoints) {
    if (haversineKm({ latitude, longitude }, { latitude: snapLatitude, longitude: snapLongitude }) > 0.05) {
      throw new Error('Driving geometry does not meet its routed endpoints.');
    }
  }

  return {
    available: true,
    mode: 'driving',
    source,
    roadKm: measurement(route.distance) / 1000,
    durationSeconds: measurement(route.duration),
    coordinates: geometry,
    connectors: snaps.filter((snap) => snap.km >= 0.02).map((snap) => snap.line),
    connectorKm: snaps.reduce((total, snap) => total + snap.km, 0),
    legs: legs.map((leg, index) => ({
      ...leg,
      available: true,
      roadKm: measurement(route.legs[index].distance) / 1000,
      durationSeconds: measurement(route.legs[index].duration)
    }))
  };
}

export function createDrivingRouting({ baseUrl = publicRouter, fetcher = fetch, now = Date.now } = {}) {
  const base = routerBase(baseUrl);
  const hostname = new URL(base).hostname;
  const usesPublicService = ['routing.openstreetmap.de', 'router.project-osrm.org'].includes(hostname);
  const source = usesPublicService ? 'FOSSGIS OSRM' : 'Configured OSRM';
  let nextPublicRequest = 0;
  let publicRequestInFlight = false;

  async function itinerary(origin, destinations) {
    const points = [origin, ...destinations];
    const legs = destinations.map((camp, index) => ({
      fromCampId: index ? destinations[index - 1].id : null,
      toCampId: camp.id,
      geographicKm: haversineKm(points[index], camp)
    }));
    const failed = (reason) => ({
      available: false,
      mode: 'driving',
      source,
      reason,
      legs: legs.map((leg) => ({ ...leg, available: false, reason }))
    });

    if (usesPublicService && (publicRequestInFlight || now() < nextPublicRequest)) {
      return failed('The driving service is busy. Wait a moment and preview again.');
    }

    const coordinates = points.map(({ longitude, latitude }) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`).join(';');
    const url = new URL(`${base}/route/v1/driving/${coordinates}`);
    url.search = new URLSearchParams({
      overview: 'simplified',
      geometries: 'geojson',
      steps: 'false',
      generate_hints: 'false',
      radiuses: points.map(() => snapRadiusMeters).join(';')
    });

    if (usesPublicService) {
      publicRequestInFlight = true;
      nextPublicRequest = now() + 1000;
    }
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'TourVista-Capstone/2.0 (in-app driving preview)' }
      });
      if (!response.ok && response.status !== 400) {
        if (usesPublicService && response.status === 429) nextPublicRequest = now() + 30_000;
        await response.body?.cancel();
        return failed(unavailable);
      }
      const data = await readRouteResponse(response);
      if (data.code === 'NoRoute') return failed(noRoad);
      if (data.code === 'NoSegment') return failed(noRoadNearPin);
      if (!response.ok) return failed(unavailable);
      return mapRoute(data, points, legs, source);
    } catch {
      return failed(unavailable);
    } finally {
      if (usesPublicService) publicRequestInFlight = false;
    }
  }

  async function route(origin, destination) {
    const { legs, ...result } = await itinerary(origin, [destination]);
    return { ...result, geographicKm: legs[0].geographicKm };
  }

  return { route, itinerary };
}

export const { route: getDrivingRoute, itinerary: getDrivingItinerary } = createDrivingRouting({
  baseUrl: process.env.DRIVING_ROUTER_URL?.trim() || publicRouter
});
