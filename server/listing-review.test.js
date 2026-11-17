import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createStore, nextId, upgradeState } from './storage.js';
import { createApp } from './app.js';
import { validateProof, proofTypes, suspensionCancellation } from './listing-review.js';
import { validateBackup } from './recovery.js';
import { todayManila } from './features.js';
import { completeProfile } from './test-fixtures.js';
import { createRoadRouting } from './roads.js';
import { gmailSettings } from './gmail-config.js';
import { createMailer } from './mail.js';

// Synthetic text fixture only: no real identification or property documents.
const file = { name: 'synthetic-proof.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\nSynthetic test evidence.\n%%EOF').toString('base64') };
const proof = (revision) => ({ revision, legalName: 'Synthetic Test Operator', documentType: proofTypes[0], statement: 'Synthetic test property evidence for the test campsite only.', declaration: true, documents: [file] });
test('Private evidence validates file type, contents, bounds and canonical encoding', () => {
  const result = validateProof(file); assert.equal(result.size, Buffer.from(file.data, 'base64').length); assert.equal(result.sha256.length, 64);
  for (const invalid of [{ ...file, type: 'text/html' }, { ...file, data: Buffer.from('<html>unsafe</html>').toString('base64') }, { ...file, data: 'junk!!!!' }, { ...file, data: Buffer.alloc(1024 * 1024 + 1).toString('base64') }]) assert.throws(() => validateProof(invalid));
  assert.equal(validateProof({ ...file, name: '../../bad"\r\n.pdf' }).name.includes('/'), false);
});

test('Startup repairs legacy suspended stays and their tracking once', async () => {
  const state = {
    campsites: [{ id: 1, approvalStatus: 'suspended' }, { id: 2, approvalStatus: 'approved' }],
    units: [{ id: 10, campId: 1 }, { id: 20, campId: 2 }],
    reservations: [
      { id: 101, unitId: 10, status: 'pending' },
      { id: 102, unitId: 10, status: 'completed' },
      { id: 103, unitId: 20, status: 'confirmed' },
    ],
    checkins: [{ reservationId: 102 }, { reservationId: 103 }],
    itineraries: [{ stops: [{ campId: 1 }, { campId: 2 }] }],
    audit: [],
  };
  let writes = 0;
  const store = {
    mode: 'demo',
    async read() { return structuredClone(state); },
    async mutate(operation) { writes += 1; operation(state); },
  };
  const mailer = createMailer({ demo: false, env: {} });
  await createApp(store, { mailer });
  await createApp(store, { mailer });
  assert.equal(writes, 1);
  assert.deepEqual(state.reservations.map((row) => row.status), ['cancelled', 'completed', 'confirmed']);
  assert.deepEqual(state.checkins, [{ reservationId: 103 }]);
  assert.deepEqual(state.itineraries[0].stops, [{ campId: 2 }]);
  assert.deepEqual(state.audit.filter((entry) => entry.action === suspensionCancellation).map((entry) => entry.recordId), [101]);
});

test('Host evidence → administrator approval → tourist booking, private road route and GPS check-in', async (t) => {
  const store = await createStore({ demo: true, path: join(process.cwd(), 'storage', 'tests', randomUUID() + '.json') });
  const fixture = { elements: [
    { type: 'node', id: 1, lat: 8.611, lon: 124.89 },
    { type: 'node', id: 2, lat: 8.61, lon: 124.89 },
    { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential', name: 'Synthetic test road' } }
  ] };
  const roads = createRoadRouting({ fetcher: async () => Response.json(fixture) });
  const sentMail = [];
  const mailer = createMailer({
    env: gmailSettings('sender@gmail.com', 'abcdefghijklmnop', 'https://tourvista.example'),
    transportFactory: () => ({ async sendMail(message) {
      if (message.to === 'tourist@tourvista.test' && message.subject.endsWith('Reservation cancelled')) {
        return { accepted: [] };
      }
      sentMail.push(message);
      return { accepted: [message.to] };
    } }),
  });
  let routeGate;
  const routed = [], app = await createApp(store, { mailer, roadRouter: async (origin, camp) => {
    routed.push({ origin, campId: camp.id, latitude: camp.latitude });
    if (routeGate) {
      routeGate.started.resolve();
      await routeGate.resume.promise;
    }
    return roads.route(origin, camp);
  } });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await app.locals.accounts.waitForEmails(); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body, binary = false) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
      const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.at(-1).split(';')[0];
      const result = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json(); if (result.csrf) csrf = result.csrf;
      return { status: response.status, body: result, headers: response.headers };
    }, async login(role) { await this.request('/session'); assert.equal((await this.request('/auth/login', 'POST', { email: `${role}@tourvista.test`, password: 'TourVista123!' })).status, 200); } };
  }
  const guest = client(), owner = client(), otherOwner = client(), tourist = client(), otherTourist = client(), admin = client();
  await guest.request('/session'); await owner.login('owner'); await tourist.login('tourist'); await admin.login('admin');
  for (const [user, role] of [[otherOwner, 'owner'], [otherTourist, 'tourist']]) { await user.request('/session'); assert.equal((await user.request('/auth/register', 'POST', { name: `Other ${role}`, email: `other-${role}@example.test`, password: 'TourVista123!', role })).status, 201); }
  const listing = { name: 'Synthetic Review Camp', description: 'Synthetic campsite address and description for isolated tests.', price: 777, latitude: 8.61, longitude: 124.89, amenities: ['Water'], rules: 'Testing only', imageUrl: '', profile: completeProfile(),
    polygon: [
      { latitude: 8.609, longitude: 124.889 }, { latitude: 8.609, longitude: 124.891 },
      { latitude: 8.611, longitude: 124.891 }, { latitude: 8.611, longitude: 124.889 }
    ]
  };
  // Isolate ownership review from email verification, which has its own end-to-end tests.
  await store.mutate((state) => { for (const user of state.users) if (user.email.endsWith('@example.test')) user.emailVerified = true; });
  const day = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
  const trip = { start: day(0), end: day(2), partySize: 2 };
  let camp, submission, unit, booking;
  await t.test('Unverified owners can prepare drafts; role and ownership cannot be forged', async () => {
    const created = await otherOwner.request('/campsites', 'POST', { ...listing, ownerId: 2, approvalStatus: 'approved', demoListing: true });
    assert.equal(created.status, 201); camp = created.body; assert.notEqual(camp.ownerId, 2); assert.equal(camp.approvalStatus, 'draft'); assert.equal(camp.demoListing, false);
    assert.equal((await tourist.request('/campsites', 'POST', listing)).status, 403); assert.equal((await admin.request('/campsites', 'POST', listing)).status, 403);
    assert.equal((await owner.request(`/campsites/${camp.id}`, 'PATCH', { price: 1 })).status, 403);
    assert.equal((await admin.request(`/campsites/${camp.id}`, 'PATCH', { price: 1 })).status, 403);
    assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
    assert.equal((await admin.request('/dashboard')).body.campsites.some((item) => item.id === camp.id), true);
    assert.equal((await owner.request('/dashboard')).body.campsites.some((item) => item.id === camp.id), false);
    unit = (await otherOwner.request('/dashboard')).body.units.find((item) => item.campId === camp.id);
    assert.equal((await tourist.request('/reservations', 'POST', { ...trip, unitId: unit.id, requestKey: randomUUID() })).status, 409);
    assert.equal((await guest.request('/campsites')).body.campsites.some((item) => item.id === camp.id), false);
  });
  await t.test('Evidence and declaration are required; pending listings remain private and immutable', async () => {
    for (const invalid of [{ ...proof(1), documents: [] }, { ...proof(1), declaration: false }, { ...proof(1), revision: 0 }, { ...proof(1), documents: [{ ...file, type: 'text/html' }] }]) assert.ok([400, 409].includes((await otherOwner.request(`/campsites/${camp.id}/submit`, 'POST', invalid)).status));
    assert.equal((await owner.request(`/campsites/${camp.id}/submit`, 'POST', proof(1))).status, 403);
    const sent = await otherOwner.request(`/campsites/${camp.id}/submit`, 'POST', proof(1)); assert.equal(sent.status, 201); submission = sent.body;
    await app.locals.accounts.waitForEmails();
    const notices = sentMail.filter((message) => message.subject.endsWith('Campsite submitted for review'));
    assert.deepEqual(notices.map((message) => message.to), ['admin@tourvista.test']);
    assert.match(notices[0].text, /https:\/\/tourvista\.example\/#\/listings/);
    for (const secret of [file.data, file.name, 'Synthetic Test Operator']) assert.equal(notices[0].text.includes(secret), false);
    assert.equal(submission.documents[0].data, undefined);
    assert.equal((await otherOwner.request(`/campsites/${camp.id}`, 'PATCH', { price: 999 })).status, 409);
    assert.equal((await otherOwner.request(`/campsites/${camp.id}/submit`, 'POST', proof(1))).status, 409);
    assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
    const rank = await guest.request('/rank', 'POST', { origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } });
    assert.equal(rank.body.results.some((item) => item.id === camp.id), false);
    assert.equal((await tourist.request('/routes/road', 'POST', { campId: camp.id, origin: { latitude: 8.61, longitude: 124.89 } })).status, 404);
  });
  await t.test('Only the submitting owner and admins can download evidence; no inline rendering or caching', async () => {
    const url = `/ownership-submissions/${submission.id}/documents/0`;
    assert.equal((await guest.request(url)).status, 401); assert.equal((await tourist.request(url)).status, 403); assert.equal((await owner.request(url)).status, 403);
    for (const user of [otherOwner, admin]) { const download = await user.request(url, 'GET', undefined, true); assert.equal(download.status, 200); assert.equal(download.body.toString('base64'), file.data); assert.equal(download.headers.get('cache-control'), 'private, no-store'); assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.equal(download.headers.get('content-type'), 'application/octet-stream'); }
    assert.equal((await admin.request(`/ownership-submissions/${submission.id}/documents/-1`)).status, 404);
    assert.equal((await owner.request('/dashboard')).body.ownershipSubmissions.length, 0);
    for (const user of [tourist, otherTourist, otherOwner, admin]) assert.equal(JSON.stringify((await user.request('/dashboard')).body).includes(file.data), false);
  });
  await t.test('Only admins decide with reviewed evidence and reason; stale and repeated decisions fail', async () => {
    const url = `/admin/listing-reviews/${submission.id}`, decision = { decision: 'approve', revision: 1, reason: 'Synthetic evidence inspected in isolated test.', evidenceReviewed: true };
    assert.equal((await otherOwner.request(url, 'PATCH', decision)).status, 403);
    assert.equal((await tourist.request(url, 'PATCH', decision)).status, 403);
    assert.equal((await admin.request(url, 'PATCH', { ...decision, evidenceReviewed: false })).status, 400);
    assert.equal((await admin.request(url, 'PATCH', { ...decision, reason: '' })).status, 400);
    assert.equal((await admin.request(url, 'PATCH', { ...decision, revision: 2 })).status, 409);
    assert.equal((await admin.request(url, 'PATCH', decision)).status, 200);
    assert.equal((await admin.request(url, 'PATCH', decision)).status, 409);
    await app.locals.accounts.waitForEmails();
    assert.deepEqual(sentMail.filter((message) => message.subject.endsWith('Campsite listing approved')).map((message) => message.to), ['other-owner@example.test']);
    const detail = await guest.request(`/campsites/${camp.id}`); assert.equal(detail.status, 200); assert.equal(detail.body.listingReview, 'Listing approved by TourVista');
    for (const path of ['/campsites', `/campsites/${camp.id}`]) { const data = JSON.stringify((await guest.request(path)).body); for (const secret of [file.data, 'Synthetic Test Operator', 'legalName', 'listingSnapshot', 'documents']) assert.equal(data.includes(secret), false); }
  });
  await t.test('Tourists book approved sites, only the actual host accepts, destination is booking bound', async () => {
    const request = { ...trip, unitId: unit.id, requestKey: randomUUID(), contactEmail: 'alternate-contact@example.test', contactPhone: '09171234567' };
    const created = await tourist.request('/reservations', 'POST', request); assert.equal(created.status, 201); booking = created.body;
    const repeated = await Promise.all([
      tourist.request('/reservations', 'POST', request),
      tourist.request('/reservations', 'POST', { ...request, requestKey: randomUUID() }),
    ]);
    assert.deepEqual(repeated.map((result) => result.body.id), [booking.id, booking.id]);
    const path = `/reservations/${booking.id}`;
    assert.equal((await admin.request(path, 'PATCH', { action: 'approve' })).status, 403);
    assert.equal((await owner.request(path, 'PATCH', { action: 'approve' })).status, 403);
    assert.equal((await otherOwner.request(path, 'PATCH', { action: 'approve' })).status, 200);
    assert.equal((await otherOwner.request(path, 'PATCH', { action: 'approve' })).status, 200);
    await app.locals.accounts.waitForEmails();
    const receipts = sentMail.filter((message) => message.subject.endsWith('Reservation request received'));
    assert.deepEqual(receipts.map((message) => message.to).sort(), ['other-owner@example.test', 'tourist@tourvista.test']);
    assert.ok(receipts.every((message) => !message.text.includes(request.contactPhone) && !message.text.includes(request.contactEmail)));
    const confirmations = sentMail.filter((message) => message.subject.endsWith('Reservation confirmed'));
    assert.deepEqual(confirmations.map((message) => message.to), ['tourist@tourvista.test']);
    assert.ok(confirmations[0].text.includes(`https://tourvista.example/#/confirmation/${booking.id}`));
    assert.deepEqual((await otherOwner.request(`/schedule/${unit.id}`)).body.selectedIds, []);
    assert.equal((await admin.request(`/schedule/${unit.id}`)).status, 403);
    assert.equal((await admin.request('/units', 'POST', { campId: camp.id, capacity: 4, name: 'Unauthorized' })).status, 403);
    assert.equal((await otherTourist.request(`${path}/route`, 'POST', { origin: { latitude: 8.61, longitude: 124.89 } })).status, 403);
    const route = await tourist.request(`${path}/route`, 'POST', { campId: 1, origin: { latitude: 8.611, longitude: 124.89 } });
    assert.equal(route.status, 200);
    assert.equal(route.body.available, true);
    assert.deepEqual(route.body.coordinates, [[8.611, 124.89], [8.61, 124.89]]);
    assert.equal(routed.at(-1).campId, camp.id);
    assert.equal(JSON.stringify((await tourist.request('/dashboard')).body).includes('Synthetic Test Operator'), false);
  });
  await t.test('The booked boundary checks an uncertain fix before accepting an accurate fix', async () => {
    const endpoint = `/reservations/${booking.id}/checkin`;
    const position = { method: 'gps', point: { latitude: 8.61, longitude: 124.89 }, accuracy: 5 };
    assert.equal((await otherTourist.request(endpoint, 'POST', position)).status, 403);
    assert.equal((await tourist.request(endpoint, 'POST', { ...position, accuracy: 300 })).status, 409);
    const checkedIn = await tourist.request(endpoint, 'POST', position);
    assert.equal(checkedIn.status, 201);
    assert.equal((await tourist.request(endpoint, 'POST', position)).body.id, checkedIn.body.id);
    await app.locals.accounts.waitForEmails();
    const arrivals = sentMail.filter((message) => message.subject.endsWith('Campsite check-in recorded'));
    assert.deepEqual(arrivals.map((message) => message.to).sort(), ['other-owner@example.test', 'tourist@tourvista.test']);
    assert.ok(arrivals.every((message) => !message.text.includes('124.89')));
    const record = (await tourist.request('/dashboard')).body.reservations.find((item) => item.id === booking.id);
    assert.equal(record.status, 'checked_in');
    assert.equal(record.checkin.method, 'gps');
    assert.equal(record.checkin.point, undefined);
  });
  await t.test('Declines and cancellations notify the appropriate accounts and a mail failure preserves the saved status', async () => {
    const newBooking = async (offset) => {
      const response = await tourist.request('/reservations', 'POST', { ...trip, unitId: unit.id, requestKey: randomUUID(), start: day(offset), end: day(offset + 1) });
      assert.equal(response.status, 201);
      return response.body.id;
    };
    const declinedId = await newBooking(5), cancelledId = await newBooking(6);
    assert.equal((await otherOwner.request(`/reservations/${declinedId}`, 'PATCH', { action: 'reject' })).body.status, 'rejected');
    assert.equal((await tourist.request(`/reservations/${cancelledId}`, 'PATCH', { action: 'cancel' })).body.status, 'cancelled');
    await app.locals.accounts.waitForEmails();
    assert.deepEqual(sentMail.filter((message) => message.subject.endsWith('Reservation request declined')).map((message) => message.to), ['tourist@tourvista.test']);
    assert.deepEqual(sentMail.filter((message) => message.subject.endsWith('Reservation cancelled')).map((message) => message.to), ['other-owner@example.test']);
    const state = await store.read();
    assert.equal(state.reservations.find((row) => row.id === cancelledId).status, 'cancelled');
    assert.ok(state.audit.some((row) => row.recordId === cancelledId && row.action === 'Reservation email delivery failed'));
  });
  await t.test('Suspension cancels all active stays, clears campsite tracking, and rejects routes already in progress', async () => {
    const requestStay = async (account, unitId, offset) => {
      const result = await account.request('/reservations', 'POST', {
        ...trip, start: day(offset), end: day(offset + 1), unitId, requestKey: randomUUID(),
      });
      assert.equal(result.status, 201);
      return result.body.id;
    };
    const pendingId = await requestStay(otherTourist, unit.id, 8);
    const confirmedId = await requestStay(tourist, unit.id, 10);
    assert.equal((await otherOwner.request(`/reservations/${confirmedId}`, 'PATCH', { action: 'approve' })).body.status, 'confirmed');
    const otherCamp = (await guest.request('/campsites')).body.campsites.find((item) => item.id !== camp.id);
    const otherUnit = (await guest.request(`/campsites/${otherCamp.id}`)).body.units[0];
    const unaffected = await requestStay(otherTourist, otherUnit.id, 8);
    const completedId = await store.mutate((state) => {
      const id = nextId(state, 'reservations');
      state.reservations.push({ ...booking, id, requestKey: randomUUID(), start: day(-8), end: day(-7), status: 'completed' });
      const checkIn = state.checkins.find((item) => item.reservationId === booking.id);
      state.checkins.push({ ...checkIn, id: nextId(state, 'checkins'), reservationId: id });
      return id;
    });
    const suspendedStop = { campId: camp.id, date: day(8) }, remainingStop = { campId: otherCamp.id, date: day(9) };
    assert.equal((await tourist.request('/itinerary', 'PUT', { stops: [suspendedStop, remainingStop] })).status, 200);
    assert.equal((await otherTourist.request('/itinerary', 'PUT', { stops: [suspendedStop] })).status, 200);

    const suspensionPath = `/admin/campsites/${camp.id}/suspend`;
    const reason = 'Synthetic ownership concern requires another review.';
    const gate = { started: Promise.withResolvers(), resume: Promise.withResolvers() };
    routeGate = gate;
    const routePath = `/reservations/${booking.id}/route`, origin = { latitude: 8.61, longitude: 124.89 };
    const inFlight = tourist.request(routePath, 'POST', { origin });
    try {
      await Promise.race([gate.started.promise, inFlight.then(() => assert.fail('The route must start before the campsite is suspended.'))]);
      assert.equal((await otherOwner.request(suspensionPath, 'PATCH', { revision: 1, reason })).status, 403);
      const result = await admin.request(suspensionPath, 'PATCH', { revision: 1, reason });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { ok: true, cancelledReservations: 3, removedCheckIns: 2, removedItineraryStops: 2 });
    } finally {
      routeGate = null;
      gate.resume.resolve();
    }
    assert.equal((await inFlight).status, 409);
    assert.equal((await admin.request(suspensionPath, 'PATCH', { revision: 1, reason })).status, 409);
    assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
    assert.equal((await tourist.request(`/campsites/${camp.id}`)).status, 404);
    assert.equal((await tourist.request('/reservations', 'POST', { ...trip, start: day(15), end: day(16), unitId: unit.id, requestKey: randomUUID() })).status, 409);
    assert.equal((await tourist.request(routePath, 'POST', { origin })).status, 409);
    assert.equal((await tourist.request('/routes', 'POST', { origin, destinationIds: [camp.id] })).status, 404);
    assert.equal((await tourist.request(`/reservations/${booking.id}/checkin`, 'POST', { method: 'gps', point: origin, accuracy: 5 })).status, 409);
    const touristDashboard = (await tourist.request('/dashboard')).body;
    const otherDashboard = (await otherTourist.request('/dashboard')).body;
    const reservations = [...touristDashboard.reservations, ...otherDashboard.reservations];
    for (const id of [booking.id, confirmedId, pendingId]) {
      const cancelled = reservations.find((item) => item.id === id);
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.cancelledBySuspension, true);
      assert.equal(cancelled.checkin, null);
    }
    assert.equal(reservations.find((item) => item.id === completedId).status, 'completed');
    assert.equal(reservations.find((item) => item.id === completedId).checkin, null);
    assert.equal(reservations.find((item) => item.id === unaffected).status, 'pending');
    assert.deepEqual(touristDashboard.itinerary, [remainingStop]);
    assert.deepEqual(otherDashboard.itinerary, []);
    assert.equal((await tourist.request('/itinerary', 'PUT', { stops: [suspendedStop, remainingStop] })).status, 400);
    await app.locals.accounts.waitForEmails();
    const cancellationEmails = sentMail.filter((message) => message.text.includes('TourVista suspended this campsite and cancelled'));
    assert.deepEqual(cancellationEmails.map((message) => message.to).sort(),
      ['other-owner@example.test', 'other-owner@example.test', 'other-owner@example.test', 'other-tourist@example.test']);
    const movedBoundary = listing.polygon.map((point) => ({ ...point, latitude: point.latitude + 0.01 }));
    const edited = await otherOwner.request(`/campsites/${camp.id}`, 'PATCH', { revision: 1, price: 800, latitude: 8.62, polygon: movedBoundary });
    assert.equal(edited.body.approvalStatus, 'draft'); assert.equal(edited.body.revision, 2);
    assert.equal((await tourist.request(routePath, 'POST', { origin })).status, 409);
    assert.equal((await tourist.request('/dashboard')).body.reservations.find((item) => item.id === booking.id).campsite.latitude, 8.61);
    assert.equal((await otherTourist.request(`/reservations/${booking.id}/weather`)).status, 403);
    const sent = await otherOwner.request(`/campsites/${camp.id}/submit`, 'POST', proof(2)); assert.equal(sent.status, 201); submission = sent.body;
    assert.equal((await admin.request(`/admin/listing-reviews/${submission.id}`, 'PATCH', { revision: 2, decision: 'reject', reason: 'Please supply authorization covering this property.' })).status, 200);
    assert.equal((await otherOwner.request('/dashboard')).body.ownershipSubmissions.find((item) => item.id === submission.id).status, 'rejected');
  });
  await t.test('Withdraw and concurrent review cannot publish a stale revision', async () => {
    const sent = await otherOwner.request(`/campsites/${camp.id}/submit`, 'POST', proof(2)); submission = sent.body;
    const results = await Promise.all([otherOwner.request(`/campsites/${camp.id}/withdraw`, 'POST', { revision: 2 }), admin.request(`/admin/listing-reviews/${submission.id}`, 'PATCH', { revision: 2, decision: 'approve', evidenceReviewed: true, reason: 'Synthetic concurrency fixture reviewed.' })]);
    assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
    camp = (await otherOwner.request('/dashboard')).body.campsites.find((item) => item.id === camp.id);
    if (camp.approvalStatus === 'approved') { camp = (await otherOwner.request(`/campsites/${camp.id}`, 'PATCH', { revision: camp.revision, description: 'Edited property details now require review again.' })).body; }
    assert.equal(camp.approvalStatus, 'draft'); assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
  });
  await t.test('Private recovery preserves evidence checksums; legacy real listings require review', async () => {
    const state = await store.read(), validated = validateBackup({ version: 2, state }); assert.equal(validated.ownershipSubmissions.length, state.ownershipSubmissions.length);
    const corrupted = structuredClone(state); corrupted.ownershipSubmissions[0].documents[0].sha256 = 'bad'; assert.throws(() => validateBackup({ version: 2, state: corrupted }), /checksum/);
    const legacy = structuredClone(state); delete legacy.ownershipSubmissions;
    for (const item of legacy.campsites) for (const key of ['approvalStatus', 'revision', 'reviewId', 'demoListing', 'moderationNote']) delete item[key];
    const upgraded = upgradeState(legacy); assert.equal(upgraded.campsites.find((item) => item.id === camp.id).approvalStatus, 'draft'); assert.equal(upgraded.campsites[0].demoListing, true);
    assert.ok(state.audit.some((item) => item.action === 'Downloaded private ownership evidence'));
  });
});
