import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createStore } from './storage.js';
import { createApp } from './app.js';
import { todayManila } from './features.js';
import { validateBackup } from './recovery.js';
import { completeProfile } from './test-fixtures.js';

test('Paper-led discovery, quoted requests, and state progression', async (t) => {
  const store = await createStore({ demo: true, path: join(process.cwd(), 'storage', 'tests', randomUUID() + '.json') });
  const app = await createApp(store), server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
      const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.at(-1).split(';')[0];
      const result = await response.json(); if (result.csrf) csrf = result.csrf;
      return { status: response.status, body: result };
    }, async login(role) { await this.request('/session'); return this.request('/auth/login', 'POST', { email: `${role}@tourvista.test`, password: 'TourVista123!' }); } };
  }
  const guest = client(), tourist = client(), owner = client(), admin = client();
  await guest.request('/session'); await tourist.login('tourist'); await owner.login('owner'); await admin.login('admin');
  const day = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
  const trip = { start: day(15), end: day(17), partySize: 2 };
  let booking;
  await t.test('Search and criteria filters form the same eligible TOPSIS candidate set', async () => {
    const query = new URLSearchParams({ ...trip, maxPrice: 600, amenities: 'Water' });
    const catalog = await guest.request('/campsites?' + query);
    const ranking = await guest.request('/rank', 'POST', { ...trip, filters: { maxPrice: 600, amenities: ['Water'] }, origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } });
    assert.equal(catalog.status, 200); assert.equal(ranking.status, 200);
    assert.deepEqual(ranking.body.results.map((camp) => camp.id).sort(), catalog.body.campsites.map((camp) => camp.id).sort());
    assert.ok(catalog.body.campsites.length > 0 && catalog.body.campsites.every((camp) => camp.price <= 600 && camp.amenities.includes('Water')));
    assert.equal((await guest.request('/campsites?' + query + '&search=NoSuchCampXYZ')).body.campsites.length, 0);
    assert.equal((await guest.request('/campsites?maxPrice=Infinity')).status, 400);
    assert.equal((await guest.request('/campsites?amenities=MadeUp')).status, 400);
  });
  await t.test('Detail availability uses selected dates, capacity, and closures', async () => {
    assert.equal((await owner.request('/closures', 'POST', { unitId: 1, ...trip, reason: 'Testing closure' })).status, 201);
    const detail = await guest.request('/campsites/1?' + new URLSearchParams(trip));
    assert.deepEqual(detail.body.availableUnits.map((unit) => unit.id), [2]);
    assert.equal((await guest.request('/campsites/1?' + new URLSearchParams({ ...trip, partySize: 9 }))).body.availableUnits.length, 0);
    const next = await guest.request('/campsites/1?' + new URLSearchParams({ start: trip.end, end: day(18), partySize: 2 }));
    assert.deepEqual(next.body.availableUnits.map((unit) => unit.id), [1, 2]);
  });
  await t.test('Requests validate contact details and snapshot the server quote', async () => {
    const data = { ...trip, unitId: 2, requestKey: randomUUID(), contactName: 'Demo Contact', contactEmail: 'CONTACT@example.test', contactPhone: '+63 912 345 6789', expectedPrice: 450 };
    assert.equal((await tourist.request('/reservations', 'POST', { ...data, contactEmail: 'wrong' })).status, 400);
    assert.equal((await tourist.request('/reservations', 'POST', { ...data, contactPhone: 'call me' })).status, 400);
    assert.equal((await tourist.request('/reservations', 'POST', { ...data, expectedPrice: 1 })).status, 409);
    const created = await tourist.request('/reservations', 'POST', data); booking = created.body;
    assert.equal(created.status, 201); assert.equal(booking.status, 'pending'); assert.equal(booking.unitPrice, 450);
    assert.equal(booking.contactEmail, 'contact@example.test'); assert.equal(booking.contactPhone, data.contactPhone);
    assert.equal((await tourist.request('/reservations', 'POST', data)).body.id, booking.id);
    assert.equal((await tourist.request('/reservations', 'POST', { ...data, contactName: 'Changed Contact' })).status, 409);
    assert.equal((await tourist.request('/reservations', 'POST', { ...data, requestKey: randomUUID(), partySize: 3 })).status, 409);
    assert.equal((await owner.request('/campsites/1', 'PATCH', { price: 500, profile: completeProfile() })).status, 200);
    assert.equal((await guest.request('/campsites/1')).status, 404);
    const submission = await owner.request('/campsites/1/submit', 'POST', { revision: 2, legalName: 'Synthetic Operator', documentType: 'Land title or tax declaration', declaration: true,
      statement: 'Synthetic evidence for the isolated quote preservation fixture.', documents: [{ name: 'test.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\nSynthetic test only\n%%EOF').toString('base64') }] });
    assert.equal(submission.status, 201);
    assert.equal((await admin.request(`/admin/listing-reviews/${submission.body.id}`, 'PATCH', { revision: 2, decision: 'approve', evidenceReviewed: true, reason: 'Synthetic revised listing evidence reviewed.' })).status, 200);
    assert.equal((await tourist.request('/dashboard')).body.reservations.find((row) => row.id === booking.id).unitPrice, 450);
    assert.equal((await guest.request('/campsites/1')).body.contactEmail, undefined);
  });
  await t.test('Repeated owner approval returns the same state without duplicate events', async () => {
    const first = await owner.request(`/reservations/${booking.id}`, 'PATCH', { action: 'approve' });
    const repeated = await owner.request(`/reservations/${booking.id}`, 'PATCH', { action: 'approve' });
    assert.equal(first.status, 200); assert.equal(repeated.status, 200); assert.equal(repeated.body.updatedAt, first.body.updatedAt);
    assert.equal((await store.read()).audit.filter((row) => row.recordId === booking.id && row.action === 'Reservation confirmed').length, 1);
  });
  await t.test('Check-in retry is idempotent and completion requires a checked-in stay', async () => {
    const data = { method: 'demo', point: { latitude: 8.66, longitude: 124.9 }, accuracy: 5 };
    const first = await tourist.request('/reservations/2/checkin', 'POST', data);
    assert.equal(first.status, 201); assert.equal((await tourist.request('/reservations/2/checkin', 'POST', data)).body.id, first.body.id);
    await store.mutate((state) => { const row = state.reservations.find((item) => item.id === 2); row.start = day(-2); row.end = day(-1); });
    assert.equal((await owner.request('/reservations/2', 'PATCH', { action: 'complete' })).status, 200);
    assert.equal((await tourist.request('/reservations/2/checkin', 'POST', data)).body.id, first.body.id);
    await store.mutate((state) => { const row = state.reservations.find((item) => item.id === booking.id); row.start = day(-3); row.end = day(-2); });
    assert.equal((await owner.request(`/reservations/${booking.id}`, 'PATCH', { action: 'complete' })).status, 400);
    assert.equal((await store.read()).checkins.filter((row) => row.reservationId === 2).length, 1);
  });
  await t.test('Scheduling excludes pending requests that no longer fit the active unit', async () => {
    assert.equal((await owner.request('/units/5', 'PATCH', { capacity: 1 })).status, 200);
    assert.deepEqual((await owner.request('/schedule/5')).body.selectedIds, []);
    assert.equal((await owner.request('/units/5', 'PATCH', { capacity: 4 })).status, 200);
    assert.deepEqual((await owner.request('/schedule/5')).body.selectedIds, [3]);
    assert.equal((await owner.request('/units/5', 'PATCH', { active: false })).status, 200);
    assert.deepEqual((await owner.request('/schedule/5')).body.selectedIds, []);
    assert.equal((await owner.request('/units/5', 'PATCH', { active: true })).status, 200);
  });
  await t.test('Previous version-2 snapshots upgrade contact and quote fields on restore', async () => {
    const state = await store.read();
    for (const row of state.reservations) for (const key of ['contactName', 'contactEmail', 'contactPhone', 'unitPrice', 'updatedAt']) delete row[key];
    const upgraded = validateBackup({ version: 2, state });
    assert.ok(upgraded.reservations.every((row) => row.contactName && row.contactEmail && Number.isFinite(row.unitPrice) && row.updatedAt));
    const bad = structuredClone(upgraded); bad.reservations[0].contactEmail = 'invalid';
    assert.throws(() => validateBackup({ version: 2, state: bad }), /contact or quote/);
  });
});
