import test from 'node:test';
import assert from 'node:assert/strict';
import { readDeviceStart, validRouteStart } from './src/route-start.js';
import { remainingRoadKm, routeProgress } from './src/live-distance.js';
import { preferenceShares, weatherMeaning, weatherCondition, weatherIcon, displayDate, matchScore, checkinWindow, drivingTime } from './src/decision-display.js';

test('Estimated driving duration stays readable below one minute and across hours', () => {
  assert.equal(drivingTime(15), '< 1 min');
  assert.equal(drivingTime(42 * 60), '42 min');
  assert.equal(drivingTime(60 * 60), '1 hr');
  assert.equal(drivingTime(92 * 60), '1 hr 32 min');
  assert.equal(drivingTime(undefined), '—');
});

test('Preference percentages describe user choices without inventing a score or dividing by zero', () => {
  assert.deepEqual(preferenceShares({ price: 60, distance: 20, amenities: 20 }), { price: .6, distance: .2, amenities: .2 });
  assert.deepEqual(preferenceShares({ price: 3, distance: 1, amenities: 1 }), preferenceShares({ price: 60, distance: 20, amenities: 20 }));
  assert.deepEqual(preferenceShares({ price: 0, distance: 0, amenities: 0 }), { price: 0, distance: 0, amenities: 0 });
  assert.equal(preferenceShares({ price: 1, distance: 0, amenities: 1 }).distance, 0);
});
test('Weather wording follows unrounded threshold values and never treats missing data as favourable', () => {
  assert.equal(weatherMeaning(79.999).label, 'Moderate suitability'); assert.equal(weatherMeaning(80).label, 'Higher suitability');
  assert.equal(weatherMeaning(59.999).label, 'Lower suitability'); assert.equal(weatherMeaning(60).label, 'Moderate suitability');
  assert.equal(weatherMeaning(39.999).label, 'Very low suitability'); assert.equal(weatherMeaning(40).label, 'Lower suitability');
  for (const value of [null, undefined, NaN, Infinity, -1, 101]) assert.equal(weatherMeaning(value).label, 'Not assessed');
  assert.equal(weatherMeaning(95, true).label, 'Thunderstorm indicated'); assert.equal(weatherMeaning(95, true).tone, 'caution');
});
test('Condition labels keep unknown provider codes visibly unavailable', () => {
  assert.equal(weatherCondition(0), 'Clear sky'); assert.equal(weatherCondition(65), 'Heavy rain'); assert.match(weatherCondition(95), /Thunderstorm/);
  for (const value of [undefined, null, 999, '0']) assert.equal(weatherCondition(value), 'Condition unavailable');
});
test('Forecast icons follow daily codes and show hourly thunder risk with priority', () => {
  for (const [code, icon] of [[0, 'sun'], [2, 'partlyCloudy'], [3, 'cloud'], [45, 'fog'], [65, 'rain'], [77, 'snow'], [99, 'storm'], [undefined, 'info']]) {
    assert.equal(weatherIcon(code), icon);
  }
  assert.equal(weatherIcon(2, true), 'storm');
});
test('Road distance decreases along the previewed route and falls back for off-route or inaccurate GPS fixes', () => {
  const route = routeProgress([[8.6, 124.8], [8.62, 124.8], [8.64, 124.8]], 5);
  const point = (latitude, longitude = 124.8) => ({ latitude, longitude });
  assert.equal(remainingRoadKm(point(8.6), 15, route), 5);
  assert.ok(Math.abs(remainingRoadKm(point(8.62), 15, route) - 2.5) < 1e-6);
  assert.equal(remainingRoadKm(point(8.64), 15, route), 0);
  assert.equal(remainingRoadKm(point(8.62, 124.81), 15, route), null);
  assert.equal(remainingRoadKm(point(8.62), 500, route), null);
  assert.equal(routeProgress([[8.6, 124.8], [8.6, 124.8]], 0), null);
});
test('Readable stay dates preserve calendar days and reject impossible dates', () => {
  assert.match(displayDate('2026-11-10'), /10/); assert.match(displayDate('2028-02-29'), /29/);
  for (const value of ['2027-02-29', '2026-02-30', '2026-13-01', 'bad-date', undefined]) assert.equal(displayDate(value), 'Date unavailable');
});
test('Match indices retain their relative decimal scale rather than becoming a success percentage', () => {
  assert.equal(matchScore(.87654), '0.877'); assert.equal(matchScore(.5), '0.500'); assert.equal(matchScore(1), '1.000');
  for (const value of [undefined, NaN, -1, 1.1]) assert.equal(matchScore(value), '—');
});
test('Arrival actions respect confirmed status and the check-out-exclusive stay window', () => {
  const stay = { status: 'confirmed', start: '2026-11-10', end: '2026-11-12' };
  assert.equal(checkinWindow(stay, '2026-11-09'), false); assert.equal(checkinWindow(stay, '2026-11-10'), true);
  assert.equal(checkinWindow(stay, '2026-11-11'), true); assert.equal(checkinWindow(stay, '2026-11-12'), false);
  assert.equal(checkinWindow({ ...stay, status: 'pending' }, '2026-11-10'), false);
});
test('Route starts use a fresh device fix and its accuracy', async () => {
  const coordinates = { latitude: 8.587, longitude: 124.774, accuracy: 32 };
  const position = await readDeviceStart({
    getCurrentPosition(success, _failure, options) {
      assert.equal(options.maximumAge, 0);
      assert.equal(options.enableHighAccuracy, true);
      success({ coords: coordinates });
    }
  });
  assert.deepEqual(position, { point: { latitude: 8.587, longitude: 124.774 }, accuracy: 32 });
  assert.equal(validRouteStart({ latitude: '', longitude: 124.774 }), false);
  await assert.rejects(readDeviceStart({ getCurrentPosition(_success, failure) { failure(); } }), /could not get your location/);
});

