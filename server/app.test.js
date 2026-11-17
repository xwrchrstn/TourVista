import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createStore, hasSampleRecords } from './storage.js';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
import { todayManila } from './features.js';
import { createRoadRouting } from './roads.js';
import { writeVerifiedBackup } from './recovery.js';

test('the capstone imports existing accounts and private drafts while excluding the demo catalog', async (t) => {
  const prefix = join(process.cwd(), 'storage', 'tests', randomUUID());
  const legacyPath = prefix + '-legacy.json', path = prefix + '-capstone.json';
  const legacy = await createStore({ demo: true, path: legacyPath });
  await legacy.mutate((state) => {
    state.users.push({ ...state.users[1], id: 4, email: 'existing-host@example.test', emailVerified: true });
    state.campsites.push({ ...state.campsites[0], id: 20, ownerId: 4, demoListing: false, approvalStatus: 'draft' });
    state.audit.push({ actorId: 4, action: 'Confirmed email in local test mode' });
  });
  const original = await readFile(legacyPath, 'utf8');
  const store = await createStore({ mode: 'local', path, legacyPath });
  const mailer = createMailer({ demo: false, env: {} });
  const app = await createApp(store, { mailer }), server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await legacy.close();
    await Promise.all([unlink(path), unlink(legacyPath)]);
  });
  const state = await store.read();
  assert.equal(hasSampleRecords(state), false);
  assert.deepEqual(state.users.map(({ id, emailVerified }) => [id, emailVerified]), [[4, false]]);
  assert.deepEqual(state.campsites.map(({ id, approvalStatus }) => [id, approvalStatus]), [[20, 'draft']]);
  assert.equal(await readFile(legacyPath, 'utf8'), original);
  const address = `http://127.0.0.1:${server.address().port}/api`;
  assert.deepEqual(await (await fetch(address + '/campsites')).json(), { campsites: [], mode: 'local' });
  assert.equal((await (await fetch(address + '/session')).json()).mailMode, 'unavailable');
});

test('TourVista role workflows and server-enforced restrictions', async (t) => {
  const storePath = join(process.cwd(), 'storage', 'tests', randomUUID() + '.json');
  const store = await createStore({ demo: true, path: storePath });
  const fixtureRoads = { elements: [
    { type: 'node', id: 1, lat: 8.61, lon: 124.89 },
    { type: 'node', id: 2, lat: 8.61, lon: 124.88 },
    { type: 'node', id: 3, lat: 8.66, lon: 124.90 },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Synthetic test road' } }
  ] };
  const roads = createRoadRouting({ fetcher: async () => Response.json(fixtureRoads) });
  const app = await createApp(store, { itineraryRouter: roads.itinerary }), server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body, badCsrf = false) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': badCsrf ? 'bad' : csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
      const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.at(-1).split(';')[0];
      const result = await response.json(); if (result.csrf) csrf = result.csrf;
      return { status: response.status, body: result };
    }, async login(role) { await this.request('/session'); return this.request('/auth/login', 'POST', { email: `${role}@tourvista.test`, password: 'TourVista123!' }); } };
  }
  const tourist = client(), owner = client(), admin = client(), guest = client();
  await tourist.login('tourist'); await owner.login('owner'); await admin.login('admin'); await guest.request('/session');
  const day = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
  let bookingA, bookingB, secondTourist, secondOwner, reviewId, snapshot;
  await t.test('Accounts, CSRF, role escalation, and public data secrecy', async () => {
    assert.equal((await guest.request('/dashboard')).status, 401);
    assert.equal((await guest.request('/auth/login', 'POST', { email: 'admin@tourvista.test', password: 'wrong' })).status, 401);
    assert.equal((await guest.request('/auth/register', 'POST', { name: 'Fake Admin', email: 'bad@test.com', password: 'long-enough-password', role: 'admin' })).status, 400);
    assert.equal((await tourist.request('/reservations', 'POST', {}, true)).status, 403);
    assert.equal((await tourist.request('/admin/backup')).status, 403);
    const data = await admin.request('/dashboard'); assert.equal(data.status, 200);
    assert.ok(data.body.users.every((user) => !('passwordHash' in user) && !('password' in user)));
  });
  await t.test('Registration, private listing drafts, and listing ownership', async () => {
    secondOwner = client(); await secondOwner.request('/session');
    const registered = await secondOwner.request('/auth/register', 'POST', { name: 'Second Owner', email: 'second-owner@test.com', password: 'TourVista123!', role: 'owner' });
    assert.equal(registered.status, 201); assert.equal(registered.body.user.verified, false);
    const listing = { name: 'Second Owner Camp', description: 'Another fictional testing campsite.', price: 300, latitude: 8.6, longitude: 124.9, amenities: ['Water'], rules: '', imageUrl: '' };
    const draft = await secondOwner.request('/campsites', 'POST', listing);
    assert.equal(draft.status, 201); assert.equal(draft.body.approvalStatus, 'draft');
    assert.equal((await guest.request(`/campsites/${draft.body.id}`)).status, 404);
    assert.equal((await secondOwner.request('/campsites/1', 'PATCH', { price: 1 })).status, 403);
    assert.equal((await admin.request(`/admin/users/${registered.body.user.id}`, 'PATCH', { verified: true })).status, 200);
    await secondOwner.request('/auth/login', 'POST', { email: 'second-owner@test.com', password: 'TourVista123!' });
    assert.equal((await secondOwner.request('/campsites', 'POST', listing)).status, 201);
    secondTourist = client(); await secondTourist.request('/session');
    assert.equal((await secondTourist.request('/auth/register', 'POST', { name: 'Second Tourist', email: 'second-tourist@test.com', password: 'TourVista123!', role: 'tourist' })).status, 201);
    // This suite tests booking roles; the dedicated account suite verifies the confirmation link flow.
    await store.mutate((state) => { state.users.find((user) => user.email === 'second-tourist@test.com').emailVerified = true; });
  });
  await t.test('Idempotent requests and concurrent conflicting approvals', async () => {
    const data = { unitId: 1, start: day(3), end: day(5), partySize: 2, requestKey: randomUUID() };
    const first = await tourist.request('/reservations', 'POST', data); bookingA = first.body.id; assert.equal(first.status, 201);
    assert.equal((await tourist.request('/reservations', 'POST', data)).body.id, bookingA);
    bookingB = (await secondTourist.request('/reservations', 'POST', { ...data, requestKey: randomUUID() })).body.id;
    const results = await Promise.all([owner.request(`/reservations/${bookingA}`, 'PATCH', { action: 'approve' }), owner.request(`/reservations/${bookingB}`, 'PATCH', { action: 'approve' })]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const state = await store.read(); assert.equal(state.reservations.filter((booking) => [bookingA, bookingB].includes(booking.id) && booking.status === 'confirmed').length, 1);
    assert.equal((await secondTourist.request(`/reservations/${bookingA}`, 'PATCH', { action: 'cancel' })).status, 403);
  });
  await t.test('Closures, capacity, and adjacent reservations', async () => {
    assert.equal((await owner.request('/closures', 'POST', { unitId: 1, start: day(3), end: day(4), reason: 'Maintenance' })).status, 409);
    assert.equal((await tourist.request('/reservations', 'POST', { unitId: 1, start: day(3), end: day(4), partySize: 99, requestKey: randomUUID() })).status, 409);
    const adjacent = await tourist.request('/reservations', 'POST', { unitId: 1, start: day(5), end: day(6), partySize: 2, requestKey: randomUUID() });
    assert.equal(adjacent.status, 201); assert.equal((await owner.request(`/reservations/${adjacent.body.id}`, 'PATCH', { action: 'approve' })).status, 200);
    assert.equal((await owner.request(`/reservations/${adjacent.body.id}`, 'PATCH', { action: 'complete' })).status, 400);
  });
  await t.test('GPS check-in handles outside and uncertain points before accepting demo point', async () => {
    assert.equal((await tourist.request('/reservations/2/checkin', 'POST', { method: 'demo', point: { latitude: 0, longitude: 0 }, accuracy: 5 })).status, 409);
    assert.equal((await tourist.request('/reservations/2/checkin', 'POST', { method: 'demo', point: { latitude: 8.66, longitude: 124.9 }, accuracy: 500 })).status, 409);
    const first = await tourist.request('/reservations/2/checkin', 'POST', { method: 'demo', point: { latitude: 8.66, longitude: 124.9 }, accuracy: 5 });
    const repeat = await tourist.request('/reservations/2/checkin', 'POST', { method: 'demo', point: { latitude: 8.66, longitude: 124.9 }, accuracy: 5 });
    assert.equal(first.status, 201); assert.equal(repeat.status, 201); assert.equal(repeat.body.id, first.body.id);
    assert.equal((await store.read()).checkins.filter((item) => item.reservationId === 2).length, 1);
  });
  await t.test('Only completed holders can review, and admin moderation affects public listing', async () => {
    assert.equal((await secondTourist.request('/reviews', 'POST', { reservationId: 1, rating: 5, text: 'A great stay.' })).status, 403);
    const result = await tourist.request('/reviews', 'POST', { reservationId: 1, rating: 5, text: 'A great sample stay.' }); reviewId = result.body.id; assert.equal(result.status, 201);
    assert.equal((await tourist.request('/reviews', 'POST', { reservationId: 1, rating: 5, text: 'Duplicate review.' })).status, 409);
    assert.equal((await admin.request(`/admin/reviews/${reviewId}`, 'PATCH', { visible: false })).status, 200);
    assert.equal((await guest.request('/campsites/1')).body.reviews.length, 0);
  });
  await t.test('Itinerary and route functions persist ordered stops', async () => {
    const result = await tourist.request('/itinerary', 'PUT', { stops: [{ campId: 1, date: day(3) }, { campId: 2, date: day(5) }] }); assert.equal(result.status, 200);
    assert.equal((await tourist.request('/dashboard')).body.itinerary.length, 2);
    const routeRequest = { origin: { latitude: 8.61, longitude: 124.89 }, destinationIds: [1, 2] };
    assert.equal((await guest.request('/routes', 'POST', routeRequest)).status, 401);
    assert.equal((await owner.request('/routes', 'POST', routeRequest)).status, 403);
    const route = await tourist.request('/routes', 'POST', routeRequest);
    assert.equal(route.status, 200); assert.equal(route.body.available, true);
    assert.deepEqual(route.body.legs.map((leg) => [leg.fromCampId, leg.toCampId]), [[null, 1], [1, 2]]);
    assert.deepEqual(route.body.legs[1].coordinates, [[8.61, 124.88], [8.66, 124.90]]);
    const newCamp = (await store.read()).campsites.find((camp) => camp.name === 'Second Owner Camp');
    assert.equal((await tourist.request('/routes', 'POST', { ...routeRequest, destinationIds: [newCamp.id] })).status, 404);
    const retained = (await tourist.request('/dashboard')).body.itinerary[1];
    await store.mutate((state) => { state.campsites.find((camp) => camp.id === retained.campId).active = false; });
    try {
      assert.equal((await tourist.request('/itinerary', 'PUT', { stops: [retained] })).status, 200);
      assert.equal((await tourist.request('/itinerary', 'PUT', { stops: [retained, retained] })).status, 400);
      assert.equal((await tourist.request('/itinerary', 'PUT', { stops: [] })).status, 200);
    } finally {
      await store.mutate((state) => { state.campsites.find((camp) => camp.id === retained.campId).active = true; });
    }
  });
  await t.test('Weather horizon, versioned settings, and private backup validation', async () => {
    assert.equal((await guest.request(`/weather/1?start=${day(40)}&end=${day(41)}`)).body.available, false);
    assert.equal((await tourist.request('/admin/weather-config', 'PUT', {})).status, 403);
    const state = await store.read(); assert.equal((await admin.request('/admin/weather-config', 'PUT', { ...state.config, weights: [.4, .15, .15, .15, .15], reason: 'Sensitivity test configuration' })).status, 200);
    const response = await admin.request('/admin/backup'); assert.equal(response.status, 200); snapshot = response.body;
    const bad = structuredClone(snapshot); bad.state.users = [];
    assert.equal((await admin.request('/admin/restore', 'POST', bad)).status, 400);
  });
  await t.test('Single-use password recovery invalidates old sessions', async () => {
    assert.equal((await guest.request('/auth/request-reset', 'POST', { email: 'tourist@tourvista.test' })).status, 200);
    const requests = (await admin.request('/dashboard')).body.resetRequests;
    const token = (await admin.request(`/admin/reset-token/${requests[0].id}`, 'POST', {})).body.token;
    assert.equal((await guest.request('/auth/reset', 'POST', { token, password: 'NewPassword123!', confirmPassword: 'NewPassword123!' })).status, 200);
    assert.equal((await tourist.request('/dashboard')).status, 401);
    assert.equal((await guest.request('/auth/reset', 'POST', { token, password: 'AgainPassword123!', confirmPassword: 'AgainPassword123!' })).status, 400);
  });
  await t.test('A disk backup restores relationships, persists after reopening, and signs sessions out', async (restoreTest) => {
    const folder = await mkdtemp(join(dirname(storePath), 'backup-'));
    const backup = await writeVerifiedBackup(snapshot.state, folder);
    restoreTest.after(async () => { await unlink(backup.path); await rmdir(folder); });
    const started = performance.now();
    const fromDisk = JSON.parse(await readFile(backup.path, 'utf8'));
    assert.equal((await admin.request('/admin/restore', 'POST', fromDisk)).status, 200);
    assert.equal((await admin.request('/dashboard')).status, 401);
    const restored = await store.read(); assert.equal(restored.reservations.length, snapshot.state.reservations.length);
    assert.ok(restored.emailVerifications.every((request) => request.resolved));
    assert.ok(restored.resetRequests.every((request) => request.resolved));
    assert.equal((await tourist.login('tourist')).status, 200);
    assert.ok(restored.audit.some((event) => event.action === 'Restored system backup'));
    const reopened = await createStore({ demo: true, path: storePath });
    try {
      const persisted = await reopened.read();
      assert.deepEqual(persisted.reservations, restored.reservations);
      assert.deepEqual(persisted.config, restored.config);
    } finally {
      await reopened.close();
    }
    restoreTest.diagnostic(`Isolated demo restore drill took ${Math.round(performance.now() - started)} ms.`);
  });
});
