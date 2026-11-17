import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { roadGraph, routeInGraph, createRoadRouter, createRoadRouting, roadRegion } from './roads.js';
import { dijkstra } from './features.js';
import { haversineKm } from './algorithms.js';
import { createDrivingRouting } from './driving.js';

test('Driving preview uses the provider path, travel time, and stop order for an intercity trip', async () => {
  const start = { latitude: 8.4767, longitude: 124.647 };
  const camps = [{ id: 3, latitude: 8.63, longitude: 124.95 }, { id: 2, latitude: 8.66, longitude: 124.9 }];
  const path = [[124.647, 8.4767], [124.75, 8.50], [124.95, 8.63], [124.9, 8.66]];
  const routing = createDrivingRouting({ fetcher: async (url) => {
    assert.match(url.pathname, /124\.64700,8\.47670;124\.95000,8\.63000;124\.90000,8\.66000$/);
    assert.equal(url.searchParams.get('geometries'), 'geojson');
    assert.equal(url.searchParams.get('radiuses'), '2000;2000;2000');
    return Response.json({
      code: 'Ok',
      waypoints: [path[0], path[2], path[3]].map((location) => ({ location })),
      routes: [{
        distance: 70000, duration: 5400, geometry: { type: 'LineString', coordinates: path },
        legs: [{ distance: 55000, duration: 4200 }, { distance: 15000, duration: 1200 }]
      }]
    });
  } });
  const trip = await routing.itinerary(start, camps);
  assert.equal(trip.available, true);
  assert.equal(trip.roadKm, 70);
  assert.equal(trip.durationSeconds, 5400);
  assert.deepEqual(trip.coordinates, path.map(([lng, lat]) => [lat, lng]));
  assert.deepEqual(trip.legs.map((leg) => [leg.fromCampId, leg.toCampId, leg.durationSeconds]), [[null, 3, 4200], [3, 2, 1200]]);
});

test('Driving preview keeps unavailable routes off the map and paces public requests', async () => {
  let calls = 0, clock = 0;
  const routing = createDrivingRouting({ now: () => clock, fetcher: async () => {
    calls++;
    return calls === 1 ? Response.json({ code: 'NoSegment' }, { status: 400 }) : Response.json({ code: 'Ok', routes: [] });
  } });
  const missing = await routing.route(origin, destination);
  assert.equal(missing.available, false);
  assert.match(missing.reason, /too far from a mapped driving road/);
  assert.equal(missing.coordinates, undefined);
  assert.match((await routing.route(origin, destination)).reason, /busy/);
  assert.equal(calls, 1);
  clock += 1001;
  const malformed = await routing.route(origin, destination);
  assert.equal(calls, 2);
  assert.equal(malformed.available, false);
  assert.equal(malformed.coordinates, undefined);
  assert.equal(malformed.roadKm, undefined);
});

const origin = { latitude: 8.61, longitude: 124.88 }, destination = { latitude: 8.61, longitude: 124.90 };
const nodes = [{ type: 'node', id: 1, lat: 8.61, lon: 124.88 }, { type: 'node', id: 2, lat: 8.61, lon: 124.89 },
  { type: 'node', id: 3, lat: 8.61, lon: 124.90 }, { type: 'node', id: 4, lat: 8.62, lon: 124.89 }];
const way = (id, ids, tags = {}) => ({ type: 'way', id, nodes: ids, tags: { highway: 'residential', name: 'Test road', ...tags } });
const fixture = { elements: [...nodes, way(10, [1, 2, 3]), way(11, [1, 4, 3], { name: 'Longer road' })], osm3s: { timestamp_osm_base: '2026-01-01T00:00:00Z' } };

test('Road graph uses Haversine lengths and Dijkstra selects the shorter connected road path', () => {
  const graph = roadGraph(fixture), result = routeInGraph(graph, origin, destination, { graphVersion: 'fixture-1' });
  assert.equal(result.available, true); assert.equal(result.graphVersion, 'fixture-1');
  assert.deepEqual(result.coordinates, [[8.61, 124.88], [8.61, 124.89], [8.61, 124.90]]);
  assert.ok(Math.abs(result.roadKm - haversineKm(origin, destination)) < .000001);
  assert.equal(result.connectorKm, 0); assert.equal(result.roads.length, 1);
  assert.deepEqual(result.connectors[0], [[8.61, 124.88], [8.61, 124.88]]);
});
test('OSM one-way, reverse, roundabout, and explicit overrides form directed edges', () => {
  for (const tags of [{ oneway: 'yes' }, { junction: 'roundabout' }, { highway: 'motorway' }]) {
    const graph = roadGraph({ elements: [...nodes, way(10, [1, 2, 3], tags)] });
    assert.equal(routeInGraph(graph, origin, destination).available, true);
    assert.equal(routeInGraph(graph, destination, origin).available, false);
  }
  const reverse = roadGraph({ elements: [...nodes, way(10, [1, 2, 3], { oneway: '-1' })] });
  assert.equal(routeInGraph(reverse, destination, origin).available, true);
  assert.equal(routeInGraph(reverse, origin, destination).available, false);
  assert.equal(roadGraph({ elements: [...nodes, way(10, [1, 2, 3], { junction: 'roundabout', oneway: 'no' })] }).edges.length, 4);
});
test('Private, non-motor, conditional, barrier, and incomplete road records do not become usable connections', () => {
  for (const tags of [{ access: 'private' }, { motor_vehicle: 'no' }, { highway: 'footway' }, { 'access:conditional': 'no @ (Mo-Fr)' }]) {
    assert.equal(roadGraph({ elements: [...nodes, way(10, [1, 2, 3], tags)] }).edges.length, 0);
  }
  assert.equal(roadGraph({ elements: [...nodes, way(10, [1, 2], { access: 'no', motorcar: 'yes' })] }).edges.length, 2);
  assert.equal(roadGraph({ elements: [...nodes.filter((node) => node.id !== 2), way(10, [1, 2, 3])] }).edges.length, 0);
  const gated = nodes.map((node) => node.id === 2 ? { ...node, tags: { barrier: 'gate' } } : node);
  assert.equal(roadGraph({ elements: [...gated, way(10, [1, 2, 3])] }).edges.length, 0);
  assert.throws(() => roadGraph({ ...fixture, remark: 'Query timed out' }), /Incomplete/);
});
test('Disconnected graphs and distant access nodes return unavailable without a fabricated straight-line route', () => {
  const graph = roadGraph({ elements: [...nodes, way(10, [1, 2]), way(11, [3, 4])] });
  assert.equal(routeInGraph(graph, origin, destination).available, false);
  const far = routeInGraph(roadGraph(fixture), { latitude: 8.70, longitude: 124.80 }, destination);
  assert.equal(far.available, false); assert.match(far.reason, /2 km/); assert.equal(far.coordinates, undefined);
});
test('Road download is fixed-area, deduplicated, versioned, and expires after one hour', async () => {
  let calls = 0, clock = Date.parse('2026-01-01T00:00:00Z'); const queries = [];
  const router = createRoadRouter({ now: () => clock, fetcher: async (_url, options) => { calls++; queries.push(options.body.get('data')); return new Response(JSON.stringify(fixture)); } });
  const [first, second] = await Promise.all([router(origin, destination), router({ latitude: 8.61001, longitude: 124.88001 }, destination)]);
  assert.equal(calls, 1); assert.equal(first.available, true); assert.equal(second.graphVersion, first.graphVersion);
  assert.match(queries[0], new RegExp(roadRegion.join(',').replaceAll('.', '\\.')));
  assert.equal(queries[0].includes('8.61001'), false); assert.equal(queries[0].includes('124.88001'), false);
  assert.equal((await router(origin, destination)).cached, true);
  clock += 3_600_001; assert.equal((await router(origin, destination)).cached, false); assert.equal(calls, 2);
  assert.equal(queries[0], queries[1]); assert.ok(first.dataTimestamp);
  const outside = await router({ latitude: 14.6, longitude: 121 }, destination);
  assert.equal(outside.available, false); assert.equal(calls, 2); assert.match(outside.reason, /fixed Claveria/);
});
test('Unavailable, incomplete, and oversized public-data responses never reuse a stale graph as current', async () => {
  for (const response of [new Response('', { status: 429 }), new Response('not JSON'),
    new Response(JSON.stringify({ ...fixture, remark: 'Timed out' })), new Response('x'.repeat(12_000_001))]) {
    const result = await createRoadRouter({ fetcher: async () => response })(origin, destination);
    assert.equal(result.available, false); assert.equal(result.coordinates, undefined); assert.match(result.reason, /could not be retrieved/);
  }
  let clock = 0, fail = false;
  const router = createRoadRouter({ now: () => clock, fetcher: async () => { if (fail) throw new Error('offline'); return new Response(JSON.stringify(fixture)); } });
  assert.equal((await router(origin, destination)).available, true); clock = 3_600_001; fail = true;
  assert.equal((await router(origin, destination)).available, false);
});
test('Dijkstra validates all weights and solves a substantial graph without scanning every node for each step', () => {
  const graphNodes = Array.from({ length: 10000 }, (_, id) => ({ id }));
  const edges = graphNodes.slice(1).map(({ id }) => ({ from: id - 1, to: id, km: 1 }));
  edges.push({ from: 0, to: 9999, km: 20000 });
  const result = dijkstra(graphNodes, edges, 0, 9999);
  assert.equal(result.km, 9999); assert.equal(result.path.length, 10000);
  assert.throws(() => dijkstra(graphNodes, [...edges, { from: 9999, to: 0, km: -1 }], 0, 0), /nonnegative/);
  assert.throws(() => dijkstra([{ id: 1 }], [{ from: 1, to: 2, km: 1 }], 1, 1), /endpoints/);
});
test('Failed road downloads back off for 30 seconds rather than repeatedly calling the public service', async () => {
  let clock = 0, calls = 0;
  const router = createRoadRouter({ now: () => clock, fetcher: async () => { calls++; return new Response('', { status: 429 }); } });
  assert.equal((await router(origin, destination)).available, false);
  assert.equal((await router(origin, destination)).available, false); assert.equal(calls, 1);
  clock = 30001; assert.equal((await router(origin, destination)).available, false); assert.equal(calls, 2);
});

test('Ordered itinerary uses one directed graph and leaves a missing leg separate', async () => {
  let fetches = 0;
  const graphData = { elements: [...nodes, way(10, [1, 2, 3], { oneway: 'yes' })] };
  const roads = createRoadRouting({ fetcher: async () => {
    fetches++;
    return Response.json(graphData);
  } });
  const stops = [{ ...destination, id: 3 }, { ...origin, id: 1 }, { ...destination, id: 3 }];
  const result = await roads.itinerary(origin, stops);
  assert.equal(fetches, 1);
  assert.deepEqual(result.legs.map((leg) => [leg.fromCampId, leg.toCampId, leg.available]), [[null, 3, true], [3, 1, false], [1, 3, true]]);
  assert.equal(result.roadKm, null);
  assert.equal(result.legs[1].coordinates, undefined);
  assert.equal(result.legs[0].coordinates.length, 3);
  assert.equal((await roads.route(origin, destination)).graphVersion, result.graphVersion);
  assert.equal(fetches, 1);
  const offline = createRoadRouting({ fetcher: async () => new Response(null, { status: 503 }) });
  const missing = await offline.itinerary(origin, stops);
  assert.ok(missing.legs.every((leg) => !leg.available && !leg.coordinates));
});

test('Configured pilot snapshot serves both planners with its version and source while offline', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'tourvista-road-'));
  const filePath = join(folder, 'roads.json');
  await writeFile(filePath, JSON.stringify(fixture));
  t.after(async () => { await unlink(filePath); await rmdir(folder); });
  let fetches = 0;
  const roads = createRoadRouting({ filePath, fetcher: async () => { fetches++; throw new Error('offline'); } });
  const result = await roads.itinerary(origin, [{ ...destination, id: 3 }]);
  assert.equal(result.available, true);
  assert.equal(result.saved, true);
  assert.match(result.source, /saved pilot snapshot/);
  assert.equal(result.dataTimestamp, fixture.osm3s.timestamp_osm_base);
  assert.equal((await roads.route(origin, destination)).graphVersion, result.graphVersion);
  assert.equal(fetches, 0);
  const invalid = createRoadRouting({ filePath: join(folder, 'missing.json') });
  assert.match((await invalid.route(origin, destination)).reason, /configured road snapshot/);
});
