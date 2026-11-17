import { requireVerifiedEmail } from './account-security.js';
import { createHash } from 'node:crypto';
import { audit, nextId } from './storage.js';
import { blocking } from './features.js';
import { photoViews, requireCompleteListing } from './camp-profile.js';
import { defaultProfile } from '../shared/listing-profile.js';

export const proofTypes = ['Land title or tax declaration', 'Lease with owner authorization', 'Business permit with ownership support'];
export const proofLimit = 1024 * 1024;
export const listingStates = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
export const suspensionCancellation = 'Reservation cancelled by campsite suspension';
const ensure = (condition, message, status = 400) => { if (!condition) { const error = new Error(message); error.status = status; throw error; } };
const value = (input, min, max, label) => { ensure(typeof input === 'string' && input.trim().length >= min && input.trim().length <= max, `${label} must contain ${min}–${max} characters.`); return input.trim(); };

const activeReservation = (booking) => booking.status === 'pending' || blocking(booking);

function campsiteTrips(state, campIds) {
  const units = new Map(state.units.filter((unit) => campIds.has(unit.campId)).map((unit) => [unit.id, unit]));
  const bookings = state.reservations.filter((booking) => units.has(booking.unitId));
  return { units, bookings, bookingIds: new Set(bookings.map((booking) => booking.id)) };
}

export function clearSuspendedCampsiteTrips(state, camp, actorId = null) {
  ensure(camp.approvalStatus === 'suspended', 'Only suspended campsite trips can be cleared.', 409);
  const { units, bookings, bookingIds } = campsiteTrips(state, new Set([camp.id]));
  const now = new Date().toISOString();
  const cancelled = [];
  for (const booking of bookings.filter(activeReservation)) {
    booking.status = 'cancelled';
    booking.updatedAt = now;
    audit(state, actorId, suspensionCancellation, booking.id);
    cancelled.push({ booking, unit: units.get(booking.unitId) });
  }

  const checkInCount = state.checkins.length;
  state.checkins = state.checkins.filter((checkIn) => !bookingIds.has(checkIn.reservationId));
  let removedItineraryStops = 0;
  for (const itinerary of state.itineraries) {
    const stopCount = itinerary.stops.length;
    itinerary.stops = itinerary.stops.filter((stop) => stop.campId !== camp.id);
    removedItineraryStops += stopCount - itinerary.stops.length;
  }
  return { cancelled, summary: {
    ok: true, cancelledReservations: cancelled.length,
    removedCheckIns: checkInCount - state.checkins.length, removedItineraryStops,
  } };
}

export function reconcileSuspendedCampsites(state) {
  for (const camp of state.campsites.filter((item) => item.approvalStatus === 'suspended')) {
    const { summary } = clearSuspendedCampsiteTrips(state, camp);
    if (summary.cancelledReservations || summary.removedCheckIns || summary.removedItineraryStops) {
      audit(state, null, 'Reconciled trips for a suspended campsite', camp.id);
    }
  }
}

export async function reconcileExistingSuspensions(store) {
  const state = await store.read();
  const campIds = new Set(state.campsites.filter((camp) => camp.approvalStatus === 'suspended').map((camp) => camp.id));
  if (!campIds.size) return;
  const { bookings, bookingIds } = campsiteTrips(state, campIds);
  if (bookings.some(activeReservation) || state.checkins.some((event) => bookingIds.has(event.reservationId)) ||
      state.itineraries.some((item) => item.stops.some((stop) => campIds.has(stop.campId)))) {
    await store.mutate(reconcileSuspendedCampsites);
  }
}

export function publicCamp(camp, state) {
  const { id, ownerId, name, description, price, latitude, longitude, amenities, polygon, rules, imageUrl, active, demoListing } = camp;
  const source = { ...defaultProfile(), ...camp.profile };
  const profile = {};
  // The user authorized these business fields for public display only after approval.
  if (state && isPublished(state, camp)) for (const key of ['siteType', 'locality', 'checkInTime', 'checkOutTime', 'cancellationPolicy', 'address', 'contactPhone', 'contactEmail', 'accessInstructions']) profile[key] = source[key];
  const published = state && isPublished(state, camp);
  return { id, ownerId, name, description, price, latitude, longitude, amenities, polygon, rules, imageUrl: published ? imageUrl : '', active, demoListing, profile, photos: published ? photoViews(state, camp) : [],
    listingReview: demoListing ? 'Fictional demonstration listing' : camp.approvalStatus === 'approved' ? 'Listing approved by TourVista' : 'Listing awaiting approval' };
}
export function isPublished(state, camp) {
  return Boolean(camp?.active && camp.approvalStatus === 'approved' && state.users.some((user) => user.id === camp.ownerId && user.role === 'owner' && user.active));
}
export function canReadCamp(state, camp, userId) {
  const user = state.users.find((item) => item.id === userId && item.active);
  return isPublished(state, camp) || Boolean(user && (user.role === 'admin' || (user.role === 'owner' && camp.ownerId === user.id) ||
    (camp.approvalStatus !== 'suspended' && state.reservations.some((booking) => booking.userId === user.id &&
      state.units.some((unit) => unit.id === booking.unitId && unit.campId === camp.id)))));
}
export function proofMetadata(submission) {
  const { documents, ...metadata } = submission;
  return { ...metadata, documents: documents.map(({ data, ...file }) => file) };
}
export function validateProof(input) {
  ensure(input && typeof input === 'object', 'Select a supporting document.');
  let name = value(input.name, 1, 120, 'File name').replace(/[^a-zA-Z0-9._ -]/g, '_');
  ensure(['application/pdf', 'image/jpeg', 'image/png'].includes(input.type), 'Documents must be PDF, JPEG, or PNG.');
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[input.type];
  if (!name.toLowerCase().endsWith(extension)) name = name.slice(0, 115) + extension;
  ensure(typeof input.data === 'string' && input.data.length <= Math.ceil(proofLimit / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data), 'Invalid or oversized document. Limit: 1 MB each.');
  const bytes = Buffer.from(input.data, 'base64');
  ensure(bytes.length >= 12 && bytes.length <= proofLimit && bytes.toString('base64') === input.data, 'Invalid or oversized document. Limit: 1 MB each.');
  const signatures = { 'application/pdf': bytes.subarray(0, 5).equals(Buffer.from('%PDF-')), 'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) };
  ensure(signatures[input.type], 'The file contents do not match its document type.');
  return { name, type: input.type, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: input.data };
}
export function installListingReview(app, store, { actor, record, manageCamp, requireThat, notifications }) {
  app.post('/api/campsites/:id/submit', async (req, res) => {
    const { result, messages } = await store.mutate((state) => {
      const user = actor(state, req, ['owner']), camp = manageCamp(state, user, req.params.id);
      requireVerifiedEmail(user);
      requireThat(['draft', 'rejected', 'suspended'].includes(camp.approvalStatus), 'Edit a draft before submitting, or withdraw the pending submission.', 409);
      requireThat(req.body.revision === camp.revision, 'This listing changed. Refresh and submit the latest revision.', 409);
      requireCompleteListing(camp);
      requireThat(req.body.declaration === true, 'Confirm that you are authorized to operate this campsite and that the evidence is accurate.');
      requireThat(proofTypes.includes(req.body.documentType), 'Choose a supported ownership document type.');
      requireThat(Array.isArray(req.body.documents) && req.body.documents.length >= 1 && req.body.documents.length <= 2, 'Attach 1–2 supporting documents.');
      const submission = { id: nextId(state, 'ownershipSubmissions'), campId: camp.id, ownerId: user.id, revision: camp.revision,
        status: 'pending', legalName: value(req.body.legalName, 2, 160, 'Legal owner or operator name'), documentType: req.body.documentType,
        statement: value(req.body.statement, 20, 2000, 'Ownership or authorization explanation'), documents: req.body.documents.map(validateProof),
        listingSnapshot: { ...publicCamp(camp, state), profile: structuredClone(camp.profile), imageUrl: camp.imageUrl, photos: photoViews(state, camp) }, submittedAt: new Date().toISOString(), reviewedAt: '', reviewedBy: 0, reason: '' };
      state.ownershipSubmissions.push(submission); camp.approvalStatus = 'pending'; camp.reviewId = submission.id; camp.demoListing = false;
      audit(state, user.id, 'Submitted listing and private ownership proof', camp.id);
      return { result: proofMetadata(submission), messages: notifications.listing(state, camp, 'pending') };
    });
    notifications.send(messages);
    res.status(201).json(result);
  });
  app.post('/api/campsites/:id/withdraw', async (req, res) => {
    await store.mutate((state) => {
      const user = actor(state, req, ['owner']), camp = manageCamp(state, user, req.params.id);
      requireThat(camp.approvalStatus === 'pending' && req.body.revision === camp.revision, 'The submission changed. Refresh this page.', 409);
      const submission = record(state, 'ownershipSubmissions', camp.reviewId);
      submission.status = 'withdrawn'; camp.approvalStatus = 'draft'; camp.revision += 1;
      audit(state, user.id, 'Withdrew listing for changes', camp.id);
    }); res.json({ ok: true });
  });
  app.get('/api/ownership-submissions/:id/documents/:index', async (req, res) => {
    const user = actor(req.state, req, ['owner', 'admin']), submission = record(req.state, 'ownershipSubmissions', req.params.id);
    requireThat(user.role === 'admin' || submission.ownerId === user.id, 'This evidence is private to its owner and administrators.', 403);
    const index = Number(req.params.index);
    requireThat(Number.isInteger(index) && index >= 0 && index < submission.documents.length, 'Document not found.', 404);
    const file = submission.documents[index];
    await store.mutate((state) => { actor(state, req, ['owner', 'admin']); audit(state, user.id, 'Downloaded private ownership evidence', submission.id); });
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(Buffer.from(file.data, 'base64'));
  });
  app.patch('/api/admin/listing-reviews/:id', async (req, res) => {
    const { result, messages } = await store.mutate((state) => {
      const admin = actor(state, req, ['admin']), submission = record(state, 'ownershipSubmissions', req.params.id), camp = record(state, 'campsites', submission.campId);
      requireThat(submission.status === 'pending' && camp.approvalStatus === 'pending' && camp.reviewId === submission.id &&
        camp.revision === submission.revision && req.body.revision === submission.revision, 'This submission changed or was already reviewed. Refresh before deciding.', 409);
      requireThat(['approve', 'reject'].includes(req.body.decision), 'Choose approve or reject.');
      const reason = value(req.body.reason, 5, 1000, 'Review decision reason');
      if (req.body.decision === 'approve') {
        requireCompleteListing(camp);
        requireThat(req.body.evidenceReviewed === true, 'Confirm that you reviewed the supporting evidence and checked the ownership or authorization.');
        const owner = record(state, 'users', camp.ownerId); requireThat(owner.active && owner.role === 'owner', 'The campsite owner account must be active.', 409);
      }
      submission.status = req.body.decision === 'approve' ? 'approved' : 'rejected'; camp.approvalStatus = submission.status;
      submission.reason = reason; submission.reviewedBy = admin.id; submission.reviewedAt = new Date().toISOString();
      audit(state, admin.id, `Listing evidence review: ${submission.status}`, camp.id);
      return { result: proofMetadata(submission), messages: notifications.listing(state, camp, submission.status) };
    });
    notifications.send(messages);
    res.json(result);
  });
  app.patch('/api/admin/campsites/:id/suspend', async (req, res) => {
    const { summary, messages } = await store.mutate((state) => {
      const admin = actor(state, req, ['admin']), camp = record(state, 'campsites', req.params.id);
      requireThat(camp.approvalStatus === 'approved' && req.body.revision === camp.revision, 'This listing changed or is no longer approved.', 409);
      const reason = value(req.body.reason, 5, 1000, 'Suspension reason');
      camp.approvalStatus = 'suspended'; camp.moderationNote = reason;
      audit(state, admin.id, 'Suspended public campsite listing', camp.id);
      const { summary, cancelled } = clearSuspendedCampsiteTrips(state, camp, admin.id);
      const messages = [
        ...notifications.listing(state, camp, 'suspended'),
        ...cancelled.flatMap(({ booking, unit }) => notifications.reservation(state, booking, unit, { campsiteSuspended: true })),
      ];
      return { summary, messages };
    });
    notifications.send(messages);
    res.json(summary);
  });
}
