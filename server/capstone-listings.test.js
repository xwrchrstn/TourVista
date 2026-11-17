import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createStore } from './storage.js';
import { createApp } from './app.js';
import { validatePhoto, validateProfile } from './camp-profile.js';
import { completeProfile } from './test-fixtures.js';
import { validateBackup } from './recovery.js';
import { todayManila } from './features.js';
import { amenityChecklist } from './algorithms.js';
import { defaultInitialUnit, defaultProfile } from '../shared/listing-profile.js';

const photo = { name: 'synthetic-property-photo.jpg', type: 'image/jpeg', data: (await readFile(new URL('../client/public/images/camp-valley.jpg', import.meta.url))).toString('base64') };
const secondPhoto = { name: 'synthetic-updated-photo.jpg', type: 'image/jpeg', data: (await readFile(new URL('../client/public/images/camp-sunrise.jpg', import.meta.url))).toString('base64') };
const proofFile = { name: 'synthetic-ownership.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\nSynthetic test document only\n%%EOF').toString('base64') };
const evidence = (revision) => ({ revision, legalName: 'Synthetic Private Evidence Name', documentType: 'Land title or tax declaration', statement: 'Synthetic private ownership explanation for isolated tests only.', declaration: true, documents: [proofFile] });

test('Photo validation checks real image dimensions and rejects disguised, oversized or broken files', () => {
  const checked = validatePhoto(photo); assert.ok(checked.width > 0 && checked.height > 0); assert.equal(checked.sha256.length, 64);
  for (const invalid of [{ ...photo, type: 'image/svg+xml' }, { ...photo, type: 'image/png' }, { ...photo, data: Buffer.from('<html>not an image</html>').toString('base64') }, { ...photo, data: Buffer.alloc(1048577).toString('base64') }, { ...photo, data: photo.data.slice(0, -4) }]) assert.throws(() => validatePhoto(invalid));
  assert.throws(() => validateProfile(completeProfile({ contactEmail: 'wrong' }), { campsitePhotos: [] }, 1), /email/);
  assert.throws(() => validateProfile(completeProfile({ checkInTime: '25:99' }), { campsitePhotos: [] }, 1), /time/);
  assert.throws(() => validateProfile(completeProfile({ photos: [{ kind: 'url', src: 'http://example.test/photo.jpg' }] }), { campsitePhotos: [] }, 1), /HTTPS/);
});

test('Complete owner listing, private draft media, admin decisions, public approved details and TOPSIS eligibility', async (t) => {
  const store = await createStore({ demo: true, path: join(process.cwd(), 'storage', 'tests', randomUUID() + '.json') });
  const routeCalls = [], app = await createApp(store, { roadRouter: async (_origin, camp) => { routeCalls.push(camp); return { available: true, destinationId: camp.id }; } });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body, binary = false) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().at(-1).split(';')[0];
      const result = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json(); if (result.csrf) csrf = result.csrf;
      return { status: response.status, body: result, headers: response.headers };
    }, async login(role) { await this.request('/session'); assert.equal((await this.request('/auth/login', 'POST', { email: `${role}@tourvista.test`, password: 'TourVista123!' })).status, 200); } };
  }
  const guest = client(), owner = client(), otherOwner = client(), tourist = client(), otherTourist = client(), admin = client();
  await guest.request('/session'); await owner.login('owner'); await tourist.login('tourist'); await admin.login('admin');
  for (const [account, role] of [[otherOwner, 'owner'], [otherTourist, 'tourist']]) { await account.request('/session'); assert.equal((await account.request('/auth/register', 'POST', { name: 'Synthetic ' + role, email: role + '-additional@example.test', password: 'TourVista123!', role })).status, 201); }
  let camp, uploadId, unit, submission, booking;
  await store.mutate((state) => { for (const user of state.users) if (user.email.endsWith('@example.test')) user.emailVerified = true; });
  const day = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
  const input = { name: 'Synthetic Complete Campsite', description: 'A detailed synthetic property used only in isolated capstone tests.', price: 99, latitude: 8.61, longitude: 124.89, amenities: [...amenityChecklist], rules: 'Synthetic rules: respect the other guests.', imageUrl: '', profile: completeProfile({ photos: [], locationConfirmed: false }), initialUnit: { name: 'Synthetic family pitch', capacity: 5 } };
  await t.test('Owner details and unit capacity save as a private draft; incomplete submissions are blocked', async () => {
    const created = await owner.request('/campsites', 'POST', input); assert.equal(created.status, 201); camp = created.body;
    unit = (await owner.request('/dashboard')).body.units.find((item) => item.campId === camp.id); assert.equal(unit.capacity, 5); assert.equal(unit.name, input.initialUnit.name);
    assert.equal((await owner.request(`/campsites/${camp.id}/submit`, 'POST', evidence(camp.revision))).status, 409);
    assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
    assert.equal((await otherOwner.request(`/campsites/${camp.id}`)).status, 404);
    assert.equal((await admin.request(`/campsites/${camp.id}`)).body.profile.address, input.profile.address);
    assert.equal((await owner.request('/campsites', 'POST', { ...input, initialUnit: { capacity: 0 } })).status, 400);
    assert.equal((await owner.request(`/campsites/${camp.id}`, 'PATCH', { profile: completeProfile({ contactEmail: 'invalid' }) })).status, 400);
  });
  await t.test('Photo uploads require the actual owner and matching revision; draft image bytes are private', async () => {
    const path = `/campsites/${camp.id}/photos`, body = { revision: camp.revision, file: photo };
    assert.equal((await otherOwner.request(path, 'POST', body)).status, 403); assert.equal((await admin.request(path, 'POST', body)).status, 403); assert.equal((await tourist.request(path, 'POST', body)).status, 403);
    assert.equal((await owner.request(path, 'POST', { ...body, revision: 999 })).status, 409);
    const uploaded = await owner.request(path, 'POST', body); assert.equal(uploaded.status, 201); camp = uploaded.body.camp; uploadId = uploaded.body.photo.id;
    const url = `/campsites/${camp.id}/photos/${uploadId}`;
    assert.equal((await guest.request(url)).status, 404); assert.equal((await tourist.request(url)).status, 404); assert.equal((await otherOwner.request(url)).status, 404);
    for (const account of [owner, admin]) { const file = await account.request(url, 'GET', undefined, true); assert.equal(file.status, 200); assert.equal(file.body.toString('base64'), photo.data); assert.equal(file.headers.get('content-type'), 'image/jpeg'); assert.equal(file.headers.get('x-content-type-options'), 'nosniff'); }
    assert.equal(JSON.stringify((await owner.request('/dashboard')).body).includes(photo.data), false);
    assert.equal((await owner.request('/campsites', 'POST', { ...input, profile: completeProfile({ photos: [{ kind: 'upload', id: uploadId }] }) })).status, 403);
  });
  await t.test('Complete submission freezes the reviewed gallery and exposes the full dossier only to its owner/admin', async () => {
    const updated = await owner.request(`/campsites/${camp.id}`, 'PATCH', {
      revision: camp.revision, profile: { ...camp.profile, locationConfirmed: true },
    });
    assert.equal(updated.status, 200);
    camp = updated.body;
    const sent = await owner.request(`/campsites/${camp.id}/submit`, 'POST', evidence(camp.revision)); assert.equal(sent.status, 201); submission = sent.body;
    assert.equal(submission.listingSnapshot.profile.address, input.profile.address); assert.equal(submission.listingSnapshot.photos[0].id, uploadId);
    assert.equal((await owner.request(`/campsites/${camp.id}/photos`, 'POST', { revision: camp.revision, file: secondPhoto })).status, 409);
    assert.equal((await guest.request('/campsites')).body.campsites.some((item) => item.id === camp.id), false);
    const ranked = await guest.request('/rank', 'POST', { origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } }); assert.equal(ranked.body.results.some((item) => item.id === camp.id), false);
    assert.equal((await tourist.request('/dashboard')).body.ownershipSubmissions.length, 0);
  });
  await t.test('Decline records feedback, owner edits/resubmits, and admin approval alone makes the business details public', async () => {
    const review = (id, revision, decision) => admin.request(`/admin/listing-reviews/${id}`, 'PATCH', { revision, decision, reason: 'Synthetic review decision with checked supporting evidence.', evidenceReviewed: true });
    assert.equal((await review(submission.id, camp.revision, 'reject')).status, 200);
    const edited = await owner.request(`/campsites/${camp.id}`, 'PATCH', { revision: camp.revision, description: input.description + ' Revised after feedback.' }); assert.equal(edited.status, 200); camp = edited.body;
    submission = (await owner.request(`/campsites/${camp.id}/submit`, 'POST', evidence(camp.revision))).body;
    assert.equal((await review(submission.id, camp.revision, 'approve')).status, 200);
    const detail = (await guest.request(`/campsites/${camp.id}`)).body;
    for (const key of ['address', 'contactEmail', 'accessInstructions', 'checkInTime', 'checkOutTime', 'cancellationPolicy']) assert.equal(detail.profile[key], input.profile[key]);
    assert.equal(detail.photos[0].id, uploadId); assert.equal(JSON.stringify(detail).includes('Synthetic Private Evidence Name'), false); assert.equal(JSON.stringify(detail).includes(proofFile.data), false);
    assert.equal((await guest.request(`/campsites/${camp.id}/photos/${uploadId}`, 'GET', undefined, true)).status, 200);
    assert.equal((await guest.request('/campsites?search=' + encodeURIComponent('Synthetic Test Road'))).body.campsites[0].id, camp.id);
  });
  await t.test('TOPSIS ranks the eligible low-cost, nearby, fully equipped fixture and booking captures approved location/media', async () => {
    const ranked = await tourist.request('/rank', 'POST', { start: day(20), end: day(22), partySize: 2, origin: { latitude: 8.61, longitude: 124.89 }, weights: { price: 1, distance: 1, amenities: 1 } });
    assert.equal(ranked.status, 200); assert.equal(ranked.body.results[0].id, camp.id); assert.ok(Number.isFinite(ranked.body.results[0].topsisScore));
    const result = await tourist.request('/reservations', 'POST', { unitId: unit.id, start: day(20), end: day(22), partySize: 2, requestKey: randomUUID() }); assert.equal(result.status, 201); booking = result.body;
    assert.equal(booking.campSnapshot.photos[0].id, uploadId); assert.equal(booking.campSnapshot.profile.address, input.profile.address);
    assert.equal((await owner.request(`/reservations/${booking.id}`, 'PATCH', { action: 'approve' })).status, 200);
  });
  await t.test('Unapproved edits cannot expose new business details or images; booked snapshots and routes stay fixed', async () => {
    const updated = await owner.request(`/campsites/${camp.id}`, 'PATCH', { revision: camp.revision, latitude: 8.62, profile: completeProfile({ address: 'NEW PRIVATE DRAFT ADDRESS', contactEmail: 'new-private@example.test', photos: [] }) }); assert.equal(updated.status, 200); camp = updated.body;
    const newImage = await owner.request(`/campsites/${camp.id}/photos`, 'POST', { revision: camp.revision, file: secondPhoto }); assert.equal(newImage.status, 201); camp = newImage.body.camp;
    assert.equal((await guest.request(`/campsites/${camp.id}`)).status, 404);
    const heldView = await tourist.request(`/campsites/${camp.id}`); assert.equal(heldView.status, 200); assert.equal(heldView.body.profile.address, undefined); assert.deepEqual(heldView.body.photos, []);
    assert.equal((await tourist.request(`/campsites/${camp.id}/photos/${newImage.body.photo.id}`)).status, 404);
    assert.equal((await tourist.request(`/campsites/${camp.id}/photos/${uploadId}`, 'GET', undefined, true)).status, 200); assert.equal((await otherTourist.request(`/campsites/${camp.id}/photos/${uploadId}`)).status, 404);
    const holder = (await tourist.request('/dashboard')).body.reservations.find((item) => item.id === booking.id); assert.equal(holder.campsite.profile.address, input.profile.address); assert.equal(holder.campsite.latitude, input.latitude);
    assert.equal((await tourist.request(`/reservations/${booking.id}/route`, 'POST', { origin: { latitude: 8.61, longitude: 124.89 } })).status, 200); assert.equal(routeCalls.at(-1).latitude, input.latitude);
    assert.equal((await guest.request('/campsites')).body.campsites.some((item) => item.id === camp.id), false);
  });
  await t.test('Malformed map boundaries cannot be saved; backup validation retains photo checksums and rejects tampering', async () => {
    const cross = [{ latitude: 8.61, longitude: 124.88 }, { latitude: 8.63, longitude: 124.9 }, { latitude: 8.61, longitude: 124.9 }, { latitude: 8.63, longitude: 124.88 }];
    assert.equal((await owner.request(`/campsites/${camp.id}`, 'PATCH', { revision: camp.revision, polygon: cross })).status, 400);
    const state = await store.read(); assert.equal(validateBackup({ version: 2, state }).campsitePhotos.length, 2);
    const corrupted = structuredClone(state); corrupted.campsitePhotos[0].file.sha256 = 'bad'; assert.throws(() => validateBackup({ version: 2, state: corrupted }), /checksum/);
    const wrongOwner = structuredClone(state); wrongOwner.campsitePhotos[0].ownerId = 999; assert.throws(() => validateBackup({ version: 2, state: wrongOwner }), /photo owner/);
    const legacy = structuredClone(state); legacy.campsitePhotos = []; legacy.campsites.forEach((item) => { delete item.profile; }); legacy.ownershipSubmissions = []; legacy.campsites.filter((item) => !item.demoListing).forEach((item) => { item.approvalStatus = 'draft'; item.reviewId = 0; }); legacy.reservations.forEach((item) => { delete item.campSnapshot.photos; delete item.campSnapshot.profile; });
    assert.equal(validateBackup({ version: 2, state: legacy }).campsites[0].profile.checkInTime, '');
  });
  await t.test('A basic draft can use the default unit and be reviewed with only the required listing details', async () => {
    const created = await owner.request('/campsites', 'POST', {
      name: 'Synthetic Basic Camp', price: 450, latitude: 8.61, longitude: 124.89, amenities: [],
    });
    assert.equal(created.status, 201);
    const draft = created.body;
    assert.equal(draft.description, '');
    const defaultUnit = (await owner.request('/dashboard')).body.units.find((item) => item.campId === draft.id);
    assert.equal(defaultUnit.name, defaultInitialUnit.name);
    assert.equal(defaultUnit.capacity, defaultInitialUnit.capacity);
    const incomplete = await owner.request(`/campsites/${draft.id}/submit`, 'POST', evidence(draft.revision));
    assert.equal(incomplete.status, 409);
    assert.match(incomplete.body.error, /entrance pin/);

    const updated = await owner.request(`/campsites/${draft.id}`, 'PATCH', {
      revision: draft.revision, profile: { ...defaultProfile(), locationConfirmed: true },
    });
    assert.equal(updated.status, 200);
    const current = updated.body;
    const sent = await owner.request(`/campsites/${draft.id}/submit`, 'POST', evidence(current.revision));
    assert.equal(sent.status, 201);
    assert.equal((await guest.request(`/campsites/${draft.id}`)).status, 404);
    const approved = await admin.request(`/admin/listing-reviews/${sent.body.id}`, 'PATCH', {
      revision: current.revision, decision: 'approve', reason: 'Ownership evidence reviewed.', evidenceReviewed: true,
    });
    assert.equal(approved.status, 200);
    const detail = await guest.request(`/campsites/${draft.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.description, '');
    assert.equal(detail.body.profile.address, '');
    assert.deepEqual(detail.body.photos, []);
    assert.deepEqual(detail.body.amenities, []);
    assert.equal(detail.body.profile.checkInTime, '');
  });
});
