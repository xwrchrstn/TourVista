import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineKm, validatePreferences } from './algorithms.js';
import { prepareDijkstra } from './features.js';

// Every public-data request uses this fixed area. Tourist coordinates stay local.
export const roadRegion = Object.freeze([8.50, 124.75, 8.78, 125.08]);
const endpoint = 'https://overpass-api.de/api/interpreter';
const motorRoad = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(?:_link)?$/;
const denied = new Set(['no', 'private', 'destination', 'customers', 'delivery', 'agricultural', 'forestry', 'permit']);
const limits = { bytes: 12_000_000, nodes: 100_000, edges: 300_000 };
const explanation = 'Shortest distance in this fetched road graph. Turn restrictions, traffic, road surface, and current closures are not modeled. This is a planning route, not turn-by-turn driving guidance.';
const coverageReason = 'Road planning covers the fixed Claveria region only. Select a starting point within the displayed coverage or contact the owner for directions.';

function inRegion(point) {
  const [south, west, north, east] = roadRegion;
  return point.latitude >= south && point.latitude <= north && point.longitude >= west && point.longitude <= east;
}

function validatePoint(point) {
  validatePreferences(point, { price: 1, distance: 1, amenities: 1 });
}

async function readRoadData(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    if (bytes > limits.bytes) throw new Error('Road snapshot exceeds its size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function permitted(tags = {}) {
  if (['motorcar:conditional', 'motor_vehicle:conditional', 'vehicle:conditional', 'access:conditional', 'oneway:conditional'].some((key) => tags[key])) return false;
  return !denied.has(tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access);
}
export function roadGraph(data) {
  if (!Array.isArray(data?.elements) || data.remark) throw new Error('Incomplete road snapshot.');
  const all = new Map();
  for (const node of data.elements.filter((item) => item.type === 'node')) {
    if (!Number.isSafeInteger(node.id) || !Number.isFinite(node.lat) || !Number.isFinite(node.lon) || Math.abs(node.lat) > 90 || Math.abs(node.lon) > 180) continue;
    if (!permitted(node.tags) || (node.tags?.barrier && !['cattle_grid', 'toll_booth', 'border_control', 'entrance'].includes(node.tags.barrier))) continue;
    all.set(node.id, { id: node.id, latitude: node.lat, longitude: node.lon });
  }
  if (all.size > limits.nodes) throw new Error('Road snapshot too large.');
  const nodes = new Map(), edges = [];
  for (const way of data.elements.filter((item) => item.type === 'way')) {
    const tags = way.tags || {};
    if (!motorRoad.test(tags.highway || '') || !permitted(tags) || !Array.isArray(way.nodes)) continue;
    const direction = String(tags.oneway ?? ((tags.junction === 'roundabout' || tags.highway === 'motorway') ? 'yes' : 'no')).toLowerCase();
    if (!['yes', '1', 'true', '-1', 'reverse', 'no', '0', 'false'].includes(direction)) continue;
    for (let i = 1; i < way.nodes.length; i++) {
      const a = all.get(way.nodes[i - 1]), b = all.get(way.nodes[i]);
      if (!a || !b || a.id === b.id) continue;
      const km = haversineKm(a, b), name = String(tags.name || tags.ref || 'Unnamed road').slice(0, 160);
      nodes.set(a.id, a); nodes.set(b.id, b);
      if (!['-1', 'reverse'].includes(direction)) edges.push({ from: a.id, to: b.id, km, name, wayId: way.id });
      if (!['yes', '1', 'true'].includes(direction)) edges.push({ from: b.id, to: a.id, km, name, wayId: way.id });
      if (edges.length > limits.edges) throw new Error('Road snapshot too large.');
    }
  }
  return { nodes: [...nodes.values()], edges };
}
export function routeInGraph(graph, origin, destination, metadata = {}, search = prepareDijkstra(graph.nodes, graph.edges)) {
  const geographicKm = haversineKm(origin, destination);
  const base = { ...metadata, geographicKm, algorithm: 'Dijkstra with Haversine edge lengths', message: explanation };
  if (!graph.nodes.length) return { ...base, available: false, reason: 'No routable motor roads were recorded in this area.' };
  const nearest = (point) => graph.nodes.reduce((best, node) => {
    const km = haversineKm(point, node); return !best || km < best.km ? { node, km } : best;
  }, null);
  const from = nearest(origin), to = nearest(destination);
  if (from.km > 2 || to.km > 2) return { ...base, available: false, reason: 'A selected location is more than 2 km from a recorded road node. Choose a road-access location or contact the owner for access directions.' };
  const result = search(from.node.id, to.node.id);
  if (!result) return { ...base, available: false, reason: 'No connected route was found in this regional road snapshot. One-way roads, missing connections, or roads beyond the fetched area may prevent a route.' };
  const roads = [];
  for (const edge of result.edges) {
    if (roads.at(-1)?.name === edge.name) roads.at(-1).km += edge.km;
    else roads.push({ name: edge.name, km: edge.km });
  }
  return { ...base, available: true, roadKm: result.km, connectorKm: from.km + to.km,
    coordinates: result.path.map((node) => [node.latitude, node.longitude]),
    connectors: [[[origin.latitude, origin.longitude], [from.node.latitude, from.node.longitude]],
      [[to.node.latitude, to.node.longitude], [destination.latitude, destination.longitude]]], roads,
    connectorNote: 'Dashed first and last connections are geographic links to the nearest road nodes; they are not verified access roads.' };
}
export function createRoadRouting({ fetcher = fetch, now = () => Date.now(), filePath } = {}) {
  let cached = null, pending = null, retryAfter = 0;
  const source = filePath ? 'OpenStreetMap, saved pilot snapshot' : 'OpenStreetMap via Overpass API';
  const missingData = filePath
    ? 'The configured road snapshot could not be loaded. Ask the TourVista administrator to check the pilot road file.'
    : 'Road data could not be retrieved completely. The public service may be busy or offline. Try again later or ask the owner for access directions.';

  async function sourceData() {
    if (filePath) {
      const info = await stat(filePath);
      if (!info.isFile() || info.size > limits.bytes) throw new Error('Invalid road snapshot file.');
      return { raw: await readRoadData(createReadStream(filePath)), fetchedAt: info.mtime.toISOString() };
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const query = `[out:json][timeout:20];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$"](${roadRegion.join(',')});(._;>;);out body;`;
      const response = await fetcher(endpoint, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'TourVista-Local-Capstone/2.1' }, body: new URLSearchParams({ data: query }) });
      if (!response.ok) throw new Error('Road service unavailable.');
      return { raw: await readRoadData(response.body), fetchedAt: new Date(now()).toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }

  async function snapshot() {
    if (cached && now() - cached.time < 3_600_000) return { ...cached.value, cached: true };
    if (pending) return pending;
    if (now() < retryAfter) throw new Error('Road service retry cooldown.');
    pending = (async () => {
      const { raw, fetchedAt } = await sourceData();
      const data = JSON.parse(raw);
      const graph = roadGraph(data);
      const search = prepareDijkstra(graph.nodes, graph.edges);
      const value = { graph, search, cached: false, graphVersion: 'osm-dijkstra-2-' + createHash('sha256').update(raw).digest('hex').slice(0, 12),
        fetchedAt, dataTimestamp: data.osm3s?.timestamp_osm_base || null, source, saved: Boolean(filePath), bounds: roadRegion };
      cached = { time: now(), value };
      return value;
    })();
    try { return await pending; } catch (error) { retryAfter = now() + 30000; throw error; } finally { pending = null; }
  }
  function unavailable(origin, destination, reason) {
    return { available: false, geographicKm: haversineKm(origin, destination), source, reason };
  }

  async function route(origin, destination) {
    validatePoint(origin);
    validatePoint(destination);
    if (!inRegion(origin) || !inRegion(destination)) return unavailable(origin, destination, coverageReason);
    const data = await snapshot().catch(() => null);
    if (!data) return unavailable(origin, destination, missingData);
    const { graph, search, ...metadata } = data;
    return routeInGraph(graph, origin, destination, metadata, search);
  }

  async function itinerary(origin, destinations) {
    const points = [origin, ...destinations];
    points.forEach(validatePoint);
    const pairs = destinations.map((to, index) => ({ from: points[index], to }));
    const needsGraph = pairs.some(({ from, to }) => inRegion(from) && inRegion(to));
    const data = needsGraph ? await snapshot().catch(() => null) : null;
    const { graph, search, ...metadata } = data || {};
    let remainingPoints = limits.nodes;
    const legs = pairs.map(({ from, to }, index) => {
      const leg = { fromCampId: index ? from.id : null, toCampId: to.id };
      if (!inRegion(from) || !inRegion(to)) return { ...leg, ...unavailable(from, to, coverageReason) };
      if (!data) return { ...leg, ...unavailable(from, to, missingData) };
      const result = routeInGraph(graph, from, to, {}, search);
      if (!result.available) return { ...leg, available: false, geographicKm: result.geographicKm, reason: result.reason };
      const { roadKm, geographicKm, connectorKm, coordinates, connectors } = result;
      const geometryOmitted = coordinates.length > remainingPoints;
      if (!geometryOmitted) remainingPoints -= coordinates.length;
      return { ...leg, available: true, roadKm, geographicKm, connectorKm, geometryOmitted,
        ...(geometryOmitted ? {} : { coordinates, connectors }) };
    });
    const available = legs.every((leg) => leg.available);
    return { ...metadata, source, available, legs,
      roadKm: available ? legs.reduce((sum, leg) => sum + leg.roadKm, 0) : null,
      message: explanation };
  }

  return { route, itinerary };
}

export function createRoadRouter(options) {
  return createRoadRouting(options).route;
}

const configuredFile = process.env.ROAD_SNAPSHOT_PATH?.trim();
const filePath = configuredFile && resolve(fileURLToPath(new URL('.', import.meta.url)), configuredFile);
export const { route: getRoadRoute, itinerary: getItineraryRoadRoute } = createRoadRouting({ filePath });
