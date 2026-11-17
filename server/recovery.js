import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tables, upgradeState } from './storage.js';
import { validateProfile, validatePhoto } from './camp-profile.js';
import { boundaryProblem } from '../shared/listing-profile.js';
import { listingStates, proofTypes, validateProof } from './listing-review.js';
import { amenityChecklist } from './algorithms.js';
import { dateValid, overlaps, blocking } from './features.js';

export async function writeVerifiedBackup(state, directory) {
  const exportedAt = new Date().toISOString();
  const snapshot = { version: 2, exportedAt, state };
  validateBackup(snapshot);
  const content = JSON.stringify(snapshot);
  const stamp = exportedAt.replaceAll(':', '-').replaceAll('.', '-');
  const path = join(directory, `tourvista-${stamp}-${randomUUID()}.json`);
  const temporary = path + '.tmp';
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return { path, bytes: Buffer.byteLength(content) };
}

export function validateBackup(backup, { requireAdmin = true } = {}) {
  const fail = (message) => { throw new Error('Invalid backup: ' + message); };
  if (!backup || backup.version !== 2 || !backup.state) fail('expected TourVista backup version 2.');
  const state = upgradeState(structuredClone(backup.state));
  for (const [name, columns] of Object.entries(tables)) {
    if (!Array.isArray(state[name]) || state[name].length > 50000) fail(`${name} must be an array of at most 50,000 records.`);
    const ids = new Set();
    for (const row of state[name]) {
      if (!row || !Number.isInteger(row.id) || row.id < 1 || ids.has(row.id)) fail(`invalid or duplicate ${name} ID.`);
      ids.add(row.id);
      for (const [key, type] of Object.entries(columns)) {
        const value = row[key];
        if (value === null && ((name === 'audit' && ['actorId', 'recordId'].includes(key)) || (name === 'rankings' && key === 'userId') ||
          (name === 'resetRequests' && key === 'tokenHash') || (name === 'checkins' && key === 'accuracy'))) continue;
        if (type.startsWith('INT') && !Number.isInteger(value)) fail(`${name}.${key} must be an integer.`);
        if (type === 'DOUBLE' && !Number.isFinite(value)) fail(`${name}.${key} must be finite.`);
        if (type === 'BOOLEAN' && typeof value !== 'boolean') fail(`${name}.${key} must be boolean.`);
        if ((type.startsWith('VARCHAR') || type === 'TEXT') && typeof value !== 'string') fail(`${name}.${key} must be text.`);
        if (type === 'JSON' && (!value || typeof value !== 'object')) fail(`${name}.${key} must contain structured JSON.`);
      }
    }
  }
  const exists = (table, id) => state[table].some((row) => row.id === id);
  const emails = new Set();
  for (const user of state.users) {
    if (!['tourist', 'owner', 'admin'].includes(user.role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || emails.has(user.email) ||
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash)) fail('invalid account or password hash.');
    emails.add(user.email);
  }
  if (requireAdmin && !state.users.some((user) => user.role === 'admin' && user.active)) fail('at least one active administrator is required.');
  for (const camp of state.campsites) if (!exists('users', camp.ownerId) || camp.price < 0 || Math.abs(camp.latitude) > 90 || Math.abs(camp.longitude) > 180 ||
    !Array.isArray(camp.amenities) || camp.amenities.some((item) => !amenityChecklist.includes(item)) || !Array.isArray(camp.polygon)) fail('invalid campsite.');
  for (const photo of state.campsitePhotos) {
    const camp = state.campsites.find((item) => item.id === photo.campId);
    if (!camp || camp.ownerId !== photo.ownerId || !Number.isFinite(Date.parse(photo.createdAt))) fail('invalid campsite photo owner.');
    const checked = validatePhoto(photo.file);
    if (checked.sha256 !== photo.file.sha256 || checked.size !== photo.file.size || checked.width !== photo.file.width || checked.height !== photo.file.height) fail('campsite photo checksum or dimensions mismatch.');
  }
  for (const camp of state.campsites) { validateProfile(camp.profile, state, camp.id); if (boundaryProblem(camp.polygon)) fail('invalid campsite boundary.'); }
  function validateSnapshotPhotos(snapshot, campId) {
    if (snapshot.photos === undefined) return;
    if (!Array.isArray(snapshot.photos) || snapshot.photos.length > 6) fail('invalid saved photo gallery.');
    for (const photo of snapshot.photos) {
      if (photo.id !== undefined) {
        if (!state.campsitePhotos.some((row) => row.id === photo.id && row.campId === campId) || photo.src !== `/api/campsites/${campId}/photos/${photo.id}`) fail('saved gallery references a missing or unrelated photo.');
      } else {
        let url; try { url = new URL(photo.src); } catch { fail('invalid saved photo URL.'); }
        if (url.protocol !== 'https:' || url.username || url.password) fail('invalid saved photo URL.');
      }
    }
  }
  for (const booking of state.reservations) validateSnapshotPhotos(booking.campSnapshot, booking.campSnapshot.id);
  for (const submission of state.ownershipSubmissions) {
    const camp = state.campsites.find((item) => item.id === submission.campId);
    if (!camp || camp.ownerId !== submission.ownerId || !['pending', 'approved', 'rejected', 'withdrawn'].includes(submission.status) || !proofTypes.includes(submission.documentType) ||
      submission.revision < 1 || !Array.isArray(submission.documents) || submission.documents.length < 1 || submission.documents.length > 2 || !Number.isFinite(Date.parse(submission.submittedAt))) fail('invalid ownership submission.');
    validateSnapshotPhotos(submission.listingSnapshot, camp.id);
    if (submission.listingSnapshot.profile) validateProfile(submission.listingSnapshot.profile, state, camp.id);
    for (const file of submission.documents) { const checked = validateProof(file); if (checked.sha256 !== file.sha256 || checked.size !== file.size || checked.name !== file.name) fail('ownership document checksum or metadata mismatch.'); }
    if (['approved', 'rejected'].includes(submission.status) && (!exists('users', submission.reviewedBy) || !Number.isFinite(Date.parse(submission.reviewedAt)) || submission.reason.trim().length < 5)) fail('invalid listing decision.');
  }
  for (const camp of state.campsites) {
    if (!listingStates.includes(camp.approvalStatus) || camp.revision < 1) fail('invalid listing approval state.');
    const submission = state.ownershipSubmissions.find((item) => item.id === camp.reviewId);
    if (['pending', 'approved', 'rejected'].includes(camp.approvalStatus) && !(camp.demoListing && camp.approvalStatus === 'approved') &&
      (!submission || submission.campId !== camp.id || submission.revision !== camp.revision || submission.status !== camp.approvalStatus)) fail('listing approval must match its evidence review.');
    if (camp.demoListing && camp.reviewId !== 0) fail('demo listing cannot impersonate an evidence review.');
  }
  for (const unit of state.units) if (!exists('campsites', unit.campId) || unit.capacity < 1 || unit.capacity > 100) fail('invalid unit.');
  const keys = new Set();
  for (const booking of state.reservations) {
    if (booking.unitPrice < 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.contactEmail) || booking.contactName.trim().length < 2 ||
      booking.contactName.length > 100 || booking.contactEmail.length > 160 || booking.contactPhone.length > 30 || !Number.isFinite(Date.parse(booking.updatedAt))) fail('invalid reservation contact or quote.');
    const destination = booking.campSnapshot, bookedUnit = state.units.find((item) => item.id === booking.unitId);
    if (!destination || destination.id !== bookedUnit?.campId || !Number.isFinite(destination.latitude) || Math.abs(destination.latitude) > 90 || !Number.isFinite(destination.longitude) || Math.abs(destination.longitude) > 180 || !Array.isArray(destination.polygon)) fail('invalid booked campsite snapshot.');
    const key = booking.userId + ':' + booking.requestKey;
    if (!exists('users', booking.userId) || !exists('units', booking.unitId) || !dateValid(booking.start) || !dateValid(booking.end) || booking.start >= booking.end ||
      booking.partySize < 1 || !['pending', 'confirmed', 'checked_in', 'completed', 'rejected', 'cancelled'].includes(booking.status) || keys.has(key)) fail('invalid reservation.');
    keys.add(key);
    if (blocking(booking) && state.reservations.some((other) => other.id !== booking.id && other.unitId === booking.unitId && blocking(other) && overlaps(booking, other))) fail('overlapping confirmed reservations.');
  }
  for (const closure of state.closures) if (!exists('units', closure.unitId) || !dateValid(closure.start) || !dateValid(closure.end) || closure.start >= closure.end ||
    (closure.active && state.reservations.some((booking) => booking.unitId === closure.unitId && blocking(booking) && overlaps(booking, closure)))) fail('invalid closure.');
  const uniqueReview = new Set(), uniqueCheckin = new Set(), uniqueItinerary = new Set();
  for (const review of state.reviews) {
    const booking = state.reservations.find((item) => item.id === review.reservationId);
    if (!booking || booking.userId !== review.userId || booking.status !== 'completed' || review.rating < 1 || review.rating > 5 || uniqueReview.has(review.reservationId)) fail('invalid review.');
    uniqueReview.add(review.reservationId);
  }
  for (const event of state.checkins) { if (!exists('reservations', event.reservationId) || !exists('users', event.actorId) || uniqueCheckin.has(event.reservationId)) fail('invalid check-in.'); uniqueCheckin.add(event.reservationId); }
  for (const itinerary of state.itineraries) {
    if (!exists('users', itinerary.userId) || uniqueItinerary.has(itinerary.userId) || !Array.isArray(itinerary.stops) || itinerary.stops.some((stop) => !exists('campsites', stop.campId) || !dateValid(stop.date))) fail('invalid itinerary.');
    uniqueItinerary.add(itinerary.userId);
  }
  for (const request of state.resetRequests) if (!exists('users', request.userId) || (request.tokenHash !== null && !/^[a-f0-9]{64}$/.test(request.tokenHash)) || request.expires < 0 || !Number.isFinite(Date.parse(request.createdAt))) fail('invalid recovery request.');
  for (const request of state.emailVerifications) {
    const user = state.users.find((row) => row.id === request.userId);
    if (!user || request.email !== user.email || !/^[a-f0-9]{64}$/.test(request.tokenHash) || request.expires < 0 || !Number.isFinite(Date.parse(request.createdAt))) fail('invalid email verification request.');
  }
  for (const forecast of state.forecasts) if (!exists('campsites', forecast.campId)) fail('invalid forecast.');
  const config = state.config;
  if (!config || typeof config.version !== 'string' || !Array.isArray(config.weights) || config.weights.length !== 5 ||
    config.weights.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(config.weights.reduce((a, b) => a + b, 0) - 1) > 1e-8 ||
    ![config.minTemperature, config.maxTemperature, config.windReference, config.thunderstormCap].every(Number.isFinite) ||
    config.minTemperature >= config.maxTemperature || config.windReference <= 0 || config.thunderstormCap < 0 || config.thunderstormCap > 100) fail('invalid WSI configuration.');
  return structuredClone(state);
}
