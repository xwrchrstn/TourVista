import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createStore } from './storage.js';
import { createApp } from './app.js';
import { todayManila } from './features.js';

test('Catalog filters, stay ranking, and authenticated booking road planning', async (t) => {
  const store = await createStore({ demo: true, path: join(process.cwd(), 'storage', 'tests', randomUUID() + '.json') });
  await store.mutate((state) => state.users.push({ ...state.users.find((user) => user.role === 'tourist'), id: 4, name: 'Other Tourist', email: 'other@tourvista.test' }));
  const calls = [], drivingCalls = [];
  const app = await createApp(store, {
    roadRouter: async (origin, camp) => { calls.push({ origin, camp }); return { available: true, destinationId: camp.id, roadKm: 2 }; },
    drivingRouter: async (origin, camp) => {
      drivingCalls.push({ origin, camps: [camp.id], destination: [camp.latitude, camp.longitude] });
      return { mode: 'driving', available: true, roadKm: 50, durationSeconds: 3600 };
    },
    drivingItinerary: async (origin, camps) => {
      drivingCalls.push({ origin, camps: camps.map((camp) => camp.id) });
      return { mode: 'driving', available: true, legs: camps.map((camp) => ({ toCampId: camp.id })) };
    }
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
      const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.at(-1).split(';')[0];
      const result = await response.json(); if (result.csrf) csrf = result.csrf; return { status: response.status, body: result };
    }, async login(role) { await this.request('/session'); assert.equal((await this.request('/auth/login', 'POST', { email: `${role}@tourvista.test`, password: 'TourVista123!' })).status, 200); } };
  }
  const guest = client(), tourist = client(), other = client(), owner = client();
  await guest.request('/session'); await tourist.login('tourist'); await other.login('other'); await owner.login('owner');
  await t.test('Undated home catalog uses price ranges, real ratings, text, and required amenities', async () => {
    let result = await guest.request('/campsites?minPrice=400&maxPrice=600');
    assert.deepEqual(result.body.campsites.map((camp) => camp.id), [1, 3]);
    assert.ok(result.body.campsites.every((camp) => camp.rating === null));
    assert.deepEqual((await guest.request('/campsites?minRating=4')).body.campsites, []);
    assert.equal((await tourist.request('/reviews', 'POST', { reservationId: 1, rating: 5, text: 'Test review from a completed stay.' })).status, 201);
    result = await guest.request('/campsites?minPrice=400&maxPrice=600&minRating=4.5&search=Pine&amenities=Water');
    assert.deepEqual(result.body.campsites.map((camp) => camp.id), [1]); assert.equal(result.body.campsites[0].rating, 5);
    await store.mutate((state) => { state.reviews[0].visible = false; });
    assert.deepEqual((await guest.request('/campsites?minRating=4')).body.campsites, []);
    await store.mutate((state) => { state.reviews[0].visible = true; });
    for (const query of ['minPrice=-1', 'minPrice=700&maxPrice=500', 'minPrice=1000001', 'minRating=5.1', 'minRating=NaN']) assert.equal((await guest.request('/campsites?' + query)).status, 400);
  });
  await t.test('The same filters are applied before TOPSIS with selected stay dates and guests', async () => {
    const date = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
    const trip = { start: date(20), end: date(22), partySize: 2 }, filters = { minPrice: 400, maxPrice: 600, minRating: 4.5, amenities: ['Water'] };
    const catalog = await guest.request('/campsites?' + new URLSearchParams({ ...trip, ...filters, amenities: 'Water' }));
    const rank = await guest.request('/rank', 'POST', { ...trip, filters, origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } });
    assert.equal(rank.status, 200); assert.deepEqual(rank.body.results.map((camp) => camp.id), catalog.body.campsites.map((camp) => camp.id));
    assert.equal(rank.body.results.length, 1); assert.ok(rank.body.results[0].availableUnits.length);
    await store.mutate((state) => state.units.filter((unit) => unit.campId === 1).forEach((unit) => { unit.active = false; }));
    assert.deepEqual((await guest.request('/campsites?minRating=4.5')).body.campsites, []);
    assert.deepEqual((await guest.request('/rank', 'POST', { ...trip, filters, origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } })).body.results, []);
    await store.mutate((state) => state.units.filter((unit) => unit.campId === 1).forEach((unit) => { unit.active = true; }));
  });
  await t.test('Haversine distance is optional and never treated as road distance', async () => {
    assert.equal((await guest.request('/campsites')).body.campsites[0].distanceKm, undefined);
    const result = await guest.request('/campsites?originLatitude=8.61&originLongitude=124.88');
    assert.equal(result.status, 200); assert.equal(result.body.campsites[0].distanceKm, 0);
    assert.ok(result.body.campsites[1].distanceKm > 0);
    for (const query of ['originLatitude=8', 'originLatitude=&originLongitude=124', 'originLatitude=100&originLongitude=124']) assert.equal((await guest.request('/campsites?' + query)).status, 400);
  });
  await t.test('Only a tourist can request a road route and invalid origins are rejected before routing', async () => {
    const body = { campId: 1, origin: { latitude: 8.61, longitude: 124.89 } };
    assert.equal((await guest.request('/routes/road', 'POST', body)).status, 401);
    assert.equal((await owner.request('/routes/road', 'POST', body)).status, 403);
    assert.equal((await tourist.request('/routes/road', 'POST', { ...body, origin: { latitude: '', longitude: 124 } })).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await tourist.request('/routes/road', 'POST', body)).body.destinationId, 1);
    assert.equal(calls.length, 1);
  });
  await t.test('Intercity preview preserves booked destinations, stop order and role restrictions', async () => {
    const origin = { latitude: 8.4767, longitude: 124.647 };
    const body = { origin, mode: 'driving', campId: 4 };
    assert.equal((await other.request('/reservations/2/route', 'POST', body)).status, 403);
    assert.equal((await owner.request('/routes/road', 'POST', body)).status, 403);
    assert.equal((await tourist.request('/routes/road', 'POST', { ...body, mode: 'unexpected' })).status, 400);
    assert.deepEqual(drivingCalls, []);

    const route = await tourist.request('/reservations/2/route', 'POST', body);
    assert.equal(route.status, 200);
    assert.equal(route.body.mode, 'driving');
    assert.equal(route.body.durationSeconds, 3600);
    assert.deepEqual(drivingCalls[0], { origin, camps: [2], destination: [8.66, 124.9] });

    const itinerary = await tourist.request('/routes', 'POST', { origin, mode: 'driving', destinationIds: [3, 1, 2] });
    assert.equal(itinerary.status, 200);
    assert.deepEqual(itinerary.body.legs.map((leg) => leg.toCampId), [3, 1, 2]);
    assert.deepEqual(drivingCalls[1], { origin, camps: [3, 1, 2] });
  });
  await t.test('Booking routes bind the campsite server-side, enforce holder ownership, and reject ended bookings', async () => {
    const body = { campId: 4, origin: { latitude: 8.61, longitude: 124.89 } };
    assert.equal((await guest.request('/reservations/2/route', 'POST', body)).status, 401);
    assert.equal((await owner.request('/reservations/2/route', 'POST', body)).status, 403);
    assert.equal((await other.request('/reservations/2/route', 'POST', body)).status, 403);
    assert.equal((await tourist.request('/reservations/1/route', 'POST', body)).status, 409);
    const result = await tourist.request('/reservations/2/route', 'POST', body);
    assert.equal(result.status, 200); assert.equal(result.body.destinationId, 2); assert.equal(calls.at(-1).camp.id, 2);
    assert.equal((await tourist.request('/reservations/2', 'PATCH', { action: 'cancel' })).status, 200);
    const count = calls.length;
    assert.equal((await tourist.request('/reservations/2/route', 'POST', body)).status, 409); assert.equal(calls.length, count);
  });
});
