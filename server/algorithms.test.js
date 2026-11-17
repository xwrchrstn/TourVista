import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, rankCampsites } from './algorithms.js';

const origin = { latitude: 0, longitude: 0 };
const camp = (id, price, longitude, amenities = ['Water']) =>
  ({ id, name: `Camp ${id}`, price, latitude: 0, longitude, amenities });

test('Haversine: same point and known equatorial one-degree separation', () => {
  assert.equal(haversineKm(origin, origin), 0);
  assert.ok(Math.abs(haversineKm(origin, { latitude: 0, longitude: 1 }) - 111.1949266) < 1e-6);
});
test('TOPSIS: cheaper, closer, better-equipped candidate is ideal', () => {
  const { results } = rankCampsites([camp(1, 10, 1, ['Water', 'Toilet']), camp(2, 20, 2)], origin,
    { price: 1, distance: 1, amenities: 1 });
  assert.equal(results[0].id, 1);
  assert.ok(Math.abs(results[0].topsisScore - 1) < 1e-10);
  assert.ok(Math.abs(results[1].topsisScore) < 1e-10);
});
test('Price-only ranking matches an independently hand-calculated middle score', () => {
  const { results } = rankCampsites([camp(1, 10, 1), camp(2, 20, 1), camp(3, 40, 1)], origin,
    { price: 1, distance: 0, amenities: 0 });
  assert.ok(Math.abs(results.find((row) => row.id === 2).topsisScore - 2 / 3) < 1e-10);
});
test('Equivalent, zero-column, and single-candidate cases stay finite', () => {
  const preferences = { price: 1, distance: 1, amenities: 1 };
  const tied = rankCampsites([camp(2, 0, 0, []), camp(1, 0, 0, [])], origin, preferences);
  assert.deepEqual(tied.results.map((row) => row.id), [1, 2]);
  assert.deepEqual(tied.results.map((row) => row.rank), [1, 1]);
  assert.ok(tied.results.every((row) => row.topsisScore === 0.5));
  assert.equal(rankCampsites([camp(1, 10, 0)], origin, preferences).results[0].topsisScore, 0.5);
});
test('Invalid preferences are rejected and missing campsite data is disclosed', () => {
  assert.throws(() => rankCampsites([], origin, { price: 0, distance: 0, amenities: 0 }));
  assert.throws(() => rankCampsites([], { latitude: 91, longitude: 0 }, { price: 1, distance: 1, amenities: 1 }));
  const { excluded, results } = rankCampsites([camp(1, NaN, 1)], origin,
    { price: 1, distance: 1, amenities: 1 });
  assert.equal(excluded.length, 1);
  assert.equal(results.length, 0);
});
