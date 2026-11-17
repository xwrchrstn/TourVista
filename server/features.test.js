import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, greedySchedule, geofence, pointInPolygon, weatherScore, dijkstra, dateValid } from './features.js';

test('Adjacent half-open stays do not overlap; crossing stays do', () => {
  assert.equal(overlaps({ start: '2026-10-08', end: '2026-10-09' }, { start: '2026-10-09', end: '2026-10-10' }), false);
  assert.equal(overlaps({ start: '2026-10-08', end: '2026-10-10' }, { start: '2026-10-09', end: '2026-10-11' }), true);
  assert.equal(dateValid('2026-02-30'), false);
});
test('Greedy advisory chooses the maximum-cardinality earliest-finish subset', () => {
  const pending = [{ id: 1, start: '01', end: '05' }, { id: 2, start: '01', end: '03' }, { id: 3, start: '03', end: '04' }, { id: 4, start: '04', end: '05' }];
  assert.deepEqual(greedySchedule(pending), [2, 3, 4]);
  assert.deepEqual(greedySchedule(pending, [{ start: '01', end: '03' }]), [3, 4]);
});
test('Ray casting and GPS uncertainty distinguish inside, boundary, uncertain, and outside', () => {
  const polygon = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: .01 }, { latitude: .01, longitude: .01 }, { latitude: .01, longitude: 0 }];
  assert.equal(pointInPolygon({ latitude: .005, longitude: .005 }, polygon), true);
  assert.equal(pointInPolygon({ latitude: 0, longitude: 0 }, polygon), true);
  assert.equal(geofence({ latitude: .005, longitude: .005 }, 10, polygon), 'inside');
  assert.equal(geofence({ latitude: .005, longitude: .005 }, 1000, polygon), 'uncertain');
  assert.equal(geofence({ latitude: .02, longitude: .02 }, 10, polygon), 'outside');
});
test('WSI reproduces the chapter examples 88 and capped 39 and rejects missing hours', () => {
  const day = { rain: 20, temperature: 24, wind: 8, code: 2, hourlyCodes: Array(24).fill(2) };
  assert.equal(weatherScore(day).score, 88);
  const storm = weatherScore({ ...day, code: 95, hourlyCodes: Array(24).fill(95) });
  assert.equal(storm.raw, 56); assert.equal(storm.score, 39); assert.equal(storm.label, 'Very low suitability');
  assert.equal(weatherScore({ ...day, hourlyCodes: Array(23).fill(2) }), null);
  assert.equal(weatherScore({ ...day, code: 999 }), null);
});
test('Dijkstra chooses a known shortest path and reports a disconnected node', () => {
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const edges = [{ from: 1, to: 3, km: 10 }, { from: 1, to: 2, km: 2 }, { from: 2, to: 3, km: 2 }];
  const result = dijkstra(nodes, edges, 1, 3);
  assert.equal(result.km, 4); assert.deepEqual(result.path.map((node) => node.id), [1, 2, 3]);
  assert.equal(dijkstra(nodes, edges, 1, 4), null);
});
