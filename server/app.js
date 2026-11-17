import express from 'express';
import { createMailer, createMailQueue, mailFailureHint } from './mail.js';
import { createNotifications } from './notifications.js';
import { installAccountSecurity, requireVerifiedEmail } from './account-security.js';
import { randomBytes, createHash } from 'node:crypto';
import { createSessions, hashPassword, verifyPassword, publicUser } from './auth.js';
import { audit, hasSampleRecords, isSampleEmail, nextId } from './storage.js';
import { amenityChecklist, rankCampsites, validatePreferences } from './algorithms.js';
import { todayManila, validateTrip, dateValid, availableUnits, blocking, overlaps, greedySchedule, geofence } from './features.js';
import { getWeather } from './weather.js';
import { validateBackup } from './recovery.js';
import { getRoadRoute, getItineraryRoadRoute } from './roads.js';
import { getDrivingRoute, getDrivingItinerary } from './driving.js';
import { validateProfile, photoViews } from './camp-profile.js';
import { listingChecklist, boundaryProblem, defaultInitialUnit } from '../shared/listing-profile.js';
import { installCampPhotos } from './camp-photos.js';
import { isPublished, canReadCamp, publicCamp, proofMetadata, installListingReview, suspensionCancellation, reconcileExistingSuspensions, reconcileSuspendedCampsites } from './listing-review.js';
import { haversineKm } from './algorithms.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class HttpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const requireThat = (condition, message, status = 400) => { if (!condition) throw new HttpError(message, status); };
const text = (value, min, max, label) => {
  requireThat(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
};
const email = (value) => {
  const result = text(value, 3, 160, 'Email').toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Enter a valid email address.'); return result;
};
const password = (value) => { requireThat(typeof value === 'string' && value.length >= 10 && value.length <= 128, 'Password must contain 10–128 characters.'); return value; };
const record = (state, table, id) => {
  const row = state[table].find((item) => item.id === Number(id));
  requireThat(row, 'Record not found.', 404); return row;
};
function actor(state, req, roles = ['tourist', 'owner', 'admin']) {
  const user = state.users.find((item) => item.id === req.session.userId && item.active);
  requireThat(user, 'Please sign in.', 401);
  requireThat(roles.includes(user.role), 'This action is not available to your account.', 403);
  return user;
}
function manageCamp(state, user, campId) {
  const camp = record(state, 'campsites', campId);
  requireThat(user.role === 'owner' && camp.ownerId === user.id, 'You can manage only your own campsites.', 403);
  return camp;
}
function campView(state, camp, viewerId = null) {
  const reviews = state.reviews.filter((review) => review.visible && state.units.find((unit) => unit.id ===
    state.reservations.find((reservation) => reservation.id === review.reservationId)?.unitId)?.campId === camp.id)
    .map((review) => ({ ...review, author: state.users.find((user) => user.id === review.userId)?.name || 'Tourist' }));
  const viewer = state.users.find((user) => user.id === viewerId && user.active);
  const privateView = viewer && (viewer.role === 'admin' || (viewer.role === 'owner' && camp.ownerId === viewer.id));
  return { ...publicCamp(camp, state), ...(privateView ? { profile: camp.profile, photos: photoViews(state, camp), imageUrl: camp.imageUrl } : {}), units: state.units.filter((unit) => unit.campId === camp.id && unit.active), reviews,
    rating: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null };
}
function bookingView(state, booking) {
  const unit = state.units.find((item) => item.id === booking.unitId), camp = state.campsites.find((item) => item.id === unit?.campId);
  const user = state.users.find((item) => item.id === booking.userId);
  return { ...booking, unit, campsite: booking.campSnapshot || publicCamp(camp, state), touristName: user?.name, touristEmail: user?.email,
    cancelledBySuspension: booking.status === 'cancelled' && state.audit.some((event) => event.recordId === booking.id && event.action === suspensionCancellation),
    review: state.reviews.find((item) => item.reservationId === booking.id) || null,
    checkin: state.checkins.find((item) => item.reservationId === booking.id) || null };
}
function queryTrip(query) {
  if (!query.start && !query.end) return null;
  validateTrip(query.start, query.end, Number(query.partySize || 1));
  return { start: query.start, end: query.end, partySize: Number(query.partySize || 1) };
}
function catalogFilters(input = {}) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Invalid search filters.');
  const query = text(input.search || '', 0, 120, 'Search').toLowerCase();
  const unrestricted = input.maxPrice === undefined || input.maxPrice === null || input.maxPrice === '';
  const maxPrice = unrestricted ? Infinity : Number(input.maxPrice);
  requireThat(unrestricted || (Number.isFinite(maxPrice) && maxPrice >= 0 && maxPrice <= 1000000), 'Enter a valid maximum nightly price.');
  const minPrice = input.minPrice === undefined || input.minPrice === '' ? 0 : Number(input.minPrice);
  const minRating = input.minRating === undefined || input.minRating === '' ? 0 : Number(input.minRating);
  requireThat(Number.isFinite(minPrice) && minPrice >= 0 && minPrice <= 1000000 && minPrice <= maxPrice, 'Minimum price must be between 0 and 1000000, and no greater than the maximum.');
  requireThat(Number.isFinite(minRating) && minRating >= 0 && minRating <= 5, 'Minimum rating must be between 0 and 5.');
  requireThat(input.amenities === undefined || typeof input.amenities === 'string' || Array.isArray(input.amenities), 'Invalid amenity filters.');
  const amenities = Array.isArray(input.amenities) ? input.amenities : (input.amenities || '').split(',').filter(Boolean);
  requireThat(amenities.every((item) => amenityChecklist.includes(item)), 'Choose amenities from the common checklist.');
  return { query, minPrice, maxPrice, minRating, amenities };
}
function catalog(state, trip, filters = catalogFilters()) {
  return state.campsites.filter((camp) => isPublished(state, camp) && camp.price >= filters.minPrice && camp.price <= filters.maxPrice &&
    `${camp.name} ${camp.description} ${camp.profile?.address || ''} ${camp.profile?.locality || ''} ${camp.profile?.siteType || ''} ${camp.amenities.join(' ')}`.toLowerCase().includes(filters.query) &&
    filters.amenities.every((item) => camp.amenities.includes(item))).map((camp) => ({ ...campView(state, camp),
    availableUnits: trip ? availableUnits(state, camp.id, trip.start, trip.end, trip.partySize) : state.units.filter((unit) => unit.campId === camp.id && unit.active) }))
    .filter((camp) => camp.availableUnits.length && (!filters.minRating || (camp.rating !== null && camp.rating >= filters.minRating)));
}

export async function createApp(store, {
  roadRouter = getRoadRoute,
  itineraryRouter = getItineraryRoadRoute,
  drivingRouter = getDrivingRoute,
  drivingItinerary = getDrivingItinerary,
  secureCookies = false,
  mailer
} = {}) {
  const app = express(), sessions = createSessions({ secureCookies }), attempts = new Map();
  const demo = store.mode === 'demo';
  const mailEnv = !demo && process.env.MAIL_MODE === 'preview' ? { ...process.env, MAIL_MODE: 'unavailable' } : process.env;
  mailer ||= createMailer({ demo, env: mailEnv, directory: store.mailPreviewDirectory || join(dirname(fileURLToPath(import.meta.url)), 'storage', 'mail-preview') });
  const mailQueue = createMailQueue(mailer, async (message, error) => {
    if (mailer.mode === 'smtp') console.warn('TourVista email: ' + mailFailureHint(error));
    await store.mutate((state) => {
      if (state.users.some((user) => user.id === message.userId)) {
        audit(state, message.userId, message.type + ' email delivery failed', message.recordId);
      }
    });
  });
  const notifications = createNotifications(mailer, mailQueue);
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  await reconcileExistingSuspensions(store);
  app.disable('x-powered-by');
  app.use('/api/admin/restore', express.json({ limit: '32mb' }));
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', sessions.middleware);
  app.use('/api', async (req, _res, next) => {
    req.state = await store.read();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) requireThat(req.headers['x-csrf-token'] === req.session.csrf,
      'Your session changed. Refresh the page and try again.', 403);
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  installListingReview(app, store, { actor, record, manageCamp, requireThat, notifications });
  installCampPhotos(app, store, { actor, record, manageCamp, requireThat });
  function throttle(req) {
    const key = `${req.ip}:${String(req.body?.email || '').toLowerCase().slice(0, 160)}`, now = Date.now();
    for (const [id, entry] of attempts) if (now - entry.time > 900000) attempts.delete(id);
    for (const [id, maximum] of [[key, 15], [`ip:${req.ip}`, 100]]) {
      const entry = attempts.get(id) || { time: now, count: 0 };
      entry.count += 1; attempts.set(id, entry);
      requireThat(entry.count <= maximum, 'Too many attempts. Please try again in 15 minutes.', 429);
    }
  }
  const accounts = installAccountSecurity(app, store, sessions, mailer, { actor, requireThat, email, password, throttle, mailQueue });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: store.mode, workflowVersion: 'capstone-listings-2', accountVersion: 'email-accounts-1', mailMode: mailer.mode, suspensionCancelsReservations: true }));
  app.get('/api/session', (req, res) => {
    const user = req.state.users.find((user) => user.id === req.session.userId && user.active);
    res.json({ user: publicUser(user), csrf: req.session.csrf, mode: store.mode, workflowVersion: 'capstone-listings-2', accountVersion: 'email-accounts-1', mailMode: mailer.mode, today: todayManila(), amenities: amenityChecklist, suspensionCancelsReservations: true });
  });
  app.post('/api/auth/login', async (req, res) => {
    throttle(req);
    const address = email(req.body.email), submitted = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';
    const user = req.state.users.find((item) => item.email === address);
    const valid = await verifyPassword(submitted, user?.passwordHash || dummyHash);
    requireThat(valid && user?.active, 'Email or password is incorrect, or this account is inactive.', 401);
    const current = (await store.read()).users.find((row) => row.id === user.id && row.active);
    requireThat(current?.passwordHash === user.passwordHash, 'Your account changed. Please sign in again.', 401);
    sessions.rotate(req, res, user.id);
    res.json({ user: publicUser(user), csrf: req.session.csrf });
  });
  app.post('/api/auth/register', async (req, res) => {
    throttle(req);
    requireThat(mailer.mode !== 'unavailable', 'New accounts are temporarily unavailable while email verification is being set up.', 503);
    const name = text(req.body.name, 2, 100, 'Name'), address = email(req.body.email), role = req.body.role;
    requireThat(store.mode === 'demo' || !isSampleEmail(address), 'Use an email address where you can receive the verification link.');
    requireThat(['tourist', 'owner'].includes(role), 'Choose tourist or campsite owner.');
    requireThat(req.body.confirmPassword === undefined || req.body.confirmPassword === req.body.password, 'The passwords must match.');
    const passwordHash = await hashPassword(password(req.body.password));
    const user = await store.mutate((state) => {
      requireThat(!state.users.some((user) => user.email === address), 'An account already uses this email.', 409);
      const created = { id: nextId(state, 'users'), name, email: address, role, passwordHash, active: true, verified: false, emailVerified: false, emailVerificationRequired: true };
      state.users.push(created); audit(state, created.id, 'Registered account', created.id); return publicUser(created);
    });
    await accounts.issueVerification(user.id);
    sessions.rotate(req, res, user.id); res.status(201).json({ user, csrf: req.session.csrf, mailMode: mailer.mode });
  });
  app.post('/api/auth/logout', (req, res) => { sessions.rotate(req, res); res.json({ csrf: req.session.csrf }); });
  app.get('/api/campsites', (req, res) => {
    let origin;
    if (req.query.originLatitude !== undefined || req.query.originLongitude !== undefined) {
      origin = { latitude: Number(req.query.originLatitude), longitude: Number(req.query.originLongitude) };
      requireThat(req.query.originLatitude !== '' && req.query.originLongitude !== '', 'Enter both origin coordinates.');
      validatePreferences(origin, { price: 1, distance: 1, amenities: 1 });
    }
    const rows = catalog(req.state, queryTrip(req.query), catalogFilters(req.query));
    res.json({ campsites: origin ? rows.map((camp) => ({ ...camp, distanceKm: haversineKm(origin, camp) })) : rows, mode: store.mode });
  });
  app.get('/api/campsites/:id', (req, res) => {
    const camp = record(req.state, 'campsites', req.params.id); requireThat(canReadCamp(req.state, camp, req.session.userId), 'This listing is not available publicly.', 404);
    const trip = queryTrip(req.query);
    res.json({ ...campView(req.state, camp, req.session.userId), ...(trip ? { availableUnits: isPublished(req.state, camp) ? availableUnits(req.state, camp.id, trip.start, trip.end, trip.partySize) : [] } : {}) });
  });
  app.post('/api/rank', async (req, res) => {
    const { origin, weights, start, end, partySize } = req.body;
    validatePreferences(origin, weights);
    let trip = null; if (start || end) { validateTrip(start, end, partySize); trip = { start, end, partySize }; }
    const candidates = catalog(req.state, trip, catalogFilters(req.body.filters)), result = rankCampsites(candidates, origin, weights);
    await store.mutate((state) => {
      state.rankings.push({ id: nextId(state, 'rankings'), userId: req.session.userId || null, createdAt: new Date().toISOString(),
        details: { candidateIds: candidates.map((camp) => camp.id), weights: result.weights,
          matrix: result.results.map((camp) => [camp.id, camp.price, camp.distanceKm, camp.amenities.length]),
          results: result.results.map((camp) => ({ id: camp.id, score: camp.topsisScore, rank: camp.rank })), version: 'TOPSIS-1' } });
    });
    res.json({ ...result, mode: store.mode });
  });
  app.get('/api/weather/:id', async (req, res) => {
    const camp = record(req.state, 'campsites', req.params.id); requireThat(canReadCamp(req.state, camp, req.session.userId), 'Listing unavailable.', 404);
    res.json(await getWeather(store, camp, req.query.start, req.query.end));
  });
  const routeRequests = new Map();
  function routeMode(value = 'local') {
    requireThat(value === 'local' || value === 'driving', 'Choose a supported route preview.');
    return value;
  }
  function reserveRouteSearch(userId, cost = 1) {
    const now = Date.now();
    for (const [id, entry] of routeRequests) if (now - entry.time > 600000) routeRequests.delete(id);
    const entry = routeRequests.get(userId) || { time: now, count: 0 };
    requireThat(entry.count + cost <= 20, 'Please wait before requesting more road routes.', 429);
    entry.count += cost;
    routeRequests.set(userId, entry);
  }
  function publishedRouteCamp(state, id, message = 'This listing is unavailable.') {
    const camp = record(state, 'campsites', id);
    requireThat(isPublished(state, camp), message, 404);
    return camp;
  }
  function reservationRouteCamp(state, userId, id) {
    const booking = record(state, 'reservations', id);
    requireThat(booking.userId === userId, 'You can plan routes only for your own reservations.', 403);
    requireThat(booking.status === 'pending' || blocking(booking), 'This reservation is no longer active.', 409);
    const unit = record(state, 'units', booking.unitId);
    const camp = record(state, 'campsites', unit.campId);
    requireThat(camp.approvalStatus !== 'suspended', 'This campsite is suspended.', 409);
    return booking.campSnapshot || camp;
  }
  async function roadRoute(req, res, user, selectCamp) {
    const camp = selectCamp(req.state);
    const { origin, mode } = req.body || {};
    validatePreferences(origin, { price: 1, distance: 1, amenities: 1 });
    const findRoute = routeMode(mode) === 'driving' ? drivingRouter : roadRouter;
    reserveRouteSearch(user.id);
    const route = await findRoute(origin, camp);
    selectCamp(await store.read());
    res.json(route);
  }
  app.post('/api/routes', async (req, res) => {
    const user = actor(req.state, req, ['tourist']);
    const { origin, destinationIds, mode } = req.body || {};
    validatePreferences(origin, { price: 1, distance: 1, amenities: 1 });
    const findItinerary = routeMode(mode) === 'driving' ? drivingItinerary : itineraryRouter;
    requireThat(Array.isArray(destinationIds) && destinationIds.length >= 1 && destinationIds.length <= 20, 'Choose 1–20 destinations.');
    const selectCamps = (state) => destinationIds.map((id) => publishedRouteCamp(state, id, 'A destination is unavailable. Remove it from your itinerary and try again.'));
    const camps = selectCamps(req.state);
    reserveRouteSearch(user.id, Math.ceil(camps.length / 4));
    const route = await findItinerary(origin, camps);
    selectCamps(await store.read());
    res.json(route);
  });
  app.post('/api/routes/road', async (req, res) => {
    const user = actor(req.state, req, ['tourist']);
    await roadRoute(req, res, user, (state) => publishedRouteCamp(state, req.body.campId));
  });
  app.post('/api/reservations/:id/route', async (req, res) => {
    const user = actor(req.state, req, ['tourist']);
    await roadRoute(req, res, user, (state) => reservationRouteCamp(state, user.id, req.params.id));
  });
  app.get('/api/reservations/:id/weather', async (req, res) => {
    const user = actor(req.state, req), booking = record(req.state, 'reservations', req.params.id), unit = record(req.state, 'units', booking.unitId);
    if (user.role === 'tourist') requireThat(booking.userId === user.id, 'This reservation is private.', 403);
    else if (user.role === 'owner') manageCamp(req.state, user, unit.campId);
    res.json(await getWeather(store, booking.campSnapshot || record(req.state, 'campsites', unit.campId), booking.start, booking.end));
  });
  app.get('/api/dashboard', (req, res) => {
    const user = actor(req.state, req), state = req.state;
    const campsites = state.campsites.filter((camp) => user.role === 'admin' || (user.role === 'owner' && camp.ownerId === user.id));
    const units = state.units.filter((unit) => campsites.some((camp) => camp.id === unit.campId));
    const reservations = state.reservations.filter((booking) => user.role === 'tourist' ? booking.userId === user.id : units.some((unit) => unit.id === booking.unitId))
      .sort((a, b) => b.id - a.id).map((booking) => bookingView(state, booking));
    res.json({ user: publicUser(user), reservations, campsites: user.role === 'tourist' ? [] : campsites.map((camp) => ({ ...camp, photos: photoViews(state, camp), checklist: listingChecklist(camp) })),
      units: user.role === 'tourist' ? [] : units, closures: user.role === 'tourist' ? [] : state.closures.filter((closure) => units.some((unit) => unit.id === closure.unitId) && closure.active),
      itinerary: state.itineraries.find((item) => item.userId === user.id)?.stops || [],
      users: user.role === 'admin' ? state.users.map(publicUser) : [],
      reviews: user.role === 'admin' ? state.reviews.map((review) => ({ ...review, author: state.users.find((item) => item.id === review.userId)?.name })) : [],
      audit: user.role === 'admin' ? state.audit.slice(-100).reverse() : [],
      config: user.role === 'admin' ? state.config : null,
      resetRequests: user.role === 'admin' ? state.resetRequests.filter((item) => !item.resolved).map((item) => ({ id: item.id, userId: item.userId, createdAt: item.createdAt, email: state.users.find((user) => user.id === item.userId)?.email })) : [],
      weatherStatus: user.role === 'admin' ? { snapshots: state.forecasts.length, latest: state.forecasts.at(-1)?.fetchedAt || null } : null,
      ownershipSubmissions: user.role === 'tourist' ? [] : state.ownershipSubmissions.filter((item) => user.role === 'admin' || item.ownerId === user.id).map(proofMetadata),
      today: todayManila(), mode: store.mode });
  });
  app.post('/api/reservations', async (req, res) => {
    const { unitId, start, end, partySize, requestKey } = req.body;
    validateTrip(start, end, partySize); text(requestKey, 8, 100, 'Request key');
    const { booking, messages } = await store.mutate((state) => {
      const user = actor(state, req, ['tourist']), unit = record(state, 'units', unitId), camp = record(state, 'campsites', unit.campId);
      requireVerifiedEmail(user);
      const contactName = text(req.body.contactName ?? user.name, 2, 100, 'Contact name');
      const contactEmail = email(req.body.contactEmail ?? user.email);
      requireThat(req.body.contactPhone === undefined || typeof req.body.contactPhone === 'string', 'Enter a contact number as text, or leave it blank.');
      const contactPhone = typeof req.body.contactPhone === 'string' ? req.body.contactPhone.trim() : '';
      const phoneDigits = contactPhone.replace(/\D/g, '').length;
      requireThat(!contactPhone || (/^[+()\d\s-]{7,30}$/.test(contactPhone) && phoneDigits >= 7 && phoneDigits <= 15), 'Enter a valid contact number, or leave it blank.');
      const previous = state.reservations.find((booking) => booking.userId === user.id && booking.requestKey === requestKey);
      if (previous) { requireThat(previous.unitId === Number(unitId) && previous.start === start && previous.end === end && previous.partySize === partySize,
        'This submission key was already used for a different request.', 409);
        requireThat(previous.contactName === contactName && previous.contactEmail === contactEmail && previous.contactPhone === contactPhone, 'This submission key was already used with different contact details.', 409); return { booking: previous, messages: [] }; }
      const duplicate = state.reservations.find((booking) => booking.userId === user.id && booking.unitId === Number(unitId) && booking.start === start && booking.end === end && ['pending', 'confirmed', 'checked_in'].includes(booking.status));
      if (duplicate) {
        requireThat(duplicate.partySize === partySize && duplicate.contactName === contactName && duplicate.contactEmail === contactEmail && duplicate.contactPhone === contactPhone,
          'You already have a request for this unit and these dates. View it in My reservations; cancel it before sending changed details.', 409);
        return { booking: duplicate, messages: [] };
      }
      requireThat(isPublished(state, camp) && availableUnits(state, camp.id, start, end, partySize).some((item) => item.id === unit.id), 'This unit is unavailable for your dates or party size.', 409);
      requireThat(req.body.expectedPrice === undefined || req.body.expectedPrice === camp.price, 'The nightly price changed. Check availability and review the updated price before submitting.', 409);
      const booking = { id: nextId(state, 'reservations'), unitId: unit.id, userId: user.id, start, end, partySize, requestKey,
        status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        contactName, contactEmail, contactPhone, unitPrice: camp.price, campSnapshot: publicCamp(camp, state) };
      state.reservations.push(booking); audit(state, user.id, 'Requested reservation', booking.id);
      return { booking, messages: notifications.reservation(state, booking, unit) };
    });
    notifications.send(messages);
    res.status(201).json(booking);
  });
  app.patch('/api/reservations/:id', async (req, res) => {
    const { booking, messages } = await store.mutate((state) => {
      const user = actor(state, req), booking = record(state, 'reservations', req.params.id), unit = record(state, 'units', booking.unitId);
      if (user.role === 'tourist') {
        requireThat(booking.userId === user.id, 'You can change only your own reservation.', 403);
        requireThat(req.body.action === 'cancel' && ['pending', 'confirmed'].includes(booking.status), 'This reservation cannot be cancelled.');
        booking.status = 'cancelled';
      } else {
        requireThat(user.role === 'owner', 'Campsite owners manage guest bookings. Administrators review listings.', 403);
        const camp = manageCamp(state, user, unit.campId);
        if (req.body.action === 'approve') {
          if (booking.status === 'confirmed') return { booking, messages: [] };
          requireThat(booking.status === 'pending', 'Only pending requests can be approved.');
          requireThat(booking.start >= todayManila(), 'This request is in the past.');
          requireThat(isPublished(state, camp) && availableUnits(state, camp.id, booking.start, booking.end, booking.partySize).some((item) => item.id === unit.id), 'Another booking or closure conflicts with these dates.', 409);
          booking.status = 'confirmed';
        } else if (req.body.action === 'reject') {
          requireThat(booking.status === 'pending', 'Only pending requests can be rejected.'); booking.status = 'rejected';
        } else if (req.body.action === 'cancel') {
          requireThat(['pending', 'confirmed'].includes(booking.status), 'This booking cannot be cancelled.'); booking.status = 'cancelled';
        } else if (req.body.action === 'complete') {
          requireThat(booking.status === 'checked_in' && booking.end <= todayManila(), 'Only checked-in stays can be completed on or after check-out.'); booking.status = 'completed';
        } else throw new HttpError('Unknown booking action.');
      }
      booking.updatedAt = new Date().toISOString();
      audit(state, user.id, `Reservation ${booking.status}`, booking.id);
      return { booking, messages: notifications.reservation(state, booking, unit) };
    });
    notifications.send(messages);
    res.json(booking);
  });
  app.post('/api/reservations/:id/checkin', async (req, res) => {
    const { event, messages } = await store.mutate((state) => {
      const user = actor(state, req), booking = record(state, 'reservations', req.params.id), unit = record(state, 'units', booking.unitId), camp = record(state, 'campsites', unit.campId);
      const assisted = req.body.method === 'assisted';
      if (assisted) { requireThat(user.role === 'owner', 'Only the campsite operator can assist check-in.', 403); manageCamp(state, user, camp.id); }
      else {
        requireThat(user.role === 'tourist' && booking.userId === user.id, 'Only the reservation holder can request GPS check-in.', 403);
      }
      requireThat(camp.approvalStatus !== 'suspended', 'This campsite is suspended. Check-in is unavailable.', 409);
      const existing = state.checkins.find((event) => event.reservationId === booking.id);
      if (['checked_in', 'completed'].includes(booking.status) && existing) return { event: existing, messages: [] };
      requireThat(booking.status === 'confirmed' && booking.start <= todayManila() && todayManila() < booking.end, 'Check-in requires a confirmed reservation during its stay dates.');
      if (assisted) text(req.body.reason, 5, 300, 'Assistance reason');
      else {
        validatePreferences(req.body.point, { price: 1, distance: 1, amenities: 1 });
        requireThat(req.body.method === 'gps' || (req.body.method === 'demo' && store.mode === 'demo'), 'Invalid check-in method.');
        const result = geofence(req.body.point, req.body.accuracy, (booking.campSnapshot || camp).polygon);
        requireThat(result === 'inside', result === 'outside' ? 'Your reported position is outside the campsite boundary.' : 'Location is uncertain. Ask the owner for assisted check-in.', 409);
      }
      const event = { id: nextId(state, 'checkins'), reservationId: booking.id, actorId: user.id,
        method: assisted ? 'assisted' : req.body.method, accuracy: assisted ? null : req.body.accuracy,
        reason: assisted ? req.body.reason.trim() : '', createdAt: new Date().toISOString() };
      state.checkins.push(event); booking.status = 'checked_in'; booking.updatedAt = event.createdAt;
      audit(state, user.id, 'Recorded check-in', booking.id);
      return { event, messages: notifications.reservation(state, booking, unit) };
    });
    notifications.send(messages);
    res.status(201).json(event);
  });
  app.post('/api/reviews', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['tourist']), booking = record(state, 'reservations', req.body.reservationId);
      requireThat(booking.userId === user.id && booking.status === 'completed', 'Reviews require your own completed stay.', 403);
      requireThat(!state.reviews.some((review) => review.reservationId === booking.id), 'This stay already has a review.', 409);
      requireThat(Number.isInteger(req.body.rating) && req.body.rating >= 1 && req.body.rating <= 5, 'Rating must be 1–5.');
      const review = { id: nextId(state, 'reviews'), reservationId: booking.id, userId: user.id, rating: req.body.rating,
        text: text(req.body.text, 5, 2000, 'Review'), visible: true, createdAt: new Date().toISOString() };
      state.reviews.push(review); audit(state, user.id, 'Submitted review', review.id); return review;
    }); res.status(201).json(result);
  });
  app.put('/api/itinerary', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['tourist']);
      requireThat(Array.isArray(req.body?.stops) && req.body.stops.length <= 20, 'An itinerary can contain up to 20 stops.');
      let itinerary = state.itineraries.find((item) => item.userId === user.id);
      const retained = [...(itinerary?.stops || [])];
      const stops = req.body.stops.map((stop) => {
        requireThat(stop && dateValid(stop.date), 'Each stop needs a valid date.');
        const camp = record(state, 'campsites', stop.campId);
        if (!isPublished(state, camp)) {
          const existing = retained.findIndex((item) => item.campId === camp.id && item.date === stop.date);
          requireThat(existing >= 0, 'Only available campsites can be added.');
          retained.splice(existing, 1);
        }
        return { campId: camp.id, date: stop.date };
      });
      if (!itinerary) { itinerary = { id: nextId(state, 'itineraries'), userId: user.id, stops }; state.itineraries.push(itinerary); }
      else itinerary.stops = stops;
      audit(state, user.id, 'Updated itinerary', itinerary.id); return itinerary;
    }); res.json(result);
  });
  app.post('/api/campsites', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']);
      const ownerId = user.id;
      const owner = record(state, 'users', ownerId); requireThat(owner.role === 'owner' && owner.active, 'Select an active campsite owner.');
      const polygon = req.body.polygon ?? [];
      requireThat(Array.isArray(polygon) && (polygon.length === 0 || polygon.length >= 3) && polygon.length <= 100, 'Boundary must be empty or contain 3–100 coordinates.');
      polygon.forEach((point) => validatePreferences(point, { price: 1, distance: 1, amenities: 1 }));
      requireThat(!boundaryProblem(polygon), boundaryProblem(polygon));
      requireThat(req.body.active === undefined || typeof req.body.active === 'boolean', 'Active must be true or false.');
      const camp = { id: nextId(state, 'campsites'), ownerId, active: req.body.active ?? true, polygon, ...validateCamp(req.body), approvalStatus: 'draft', revision: 1, reviewId: 0, demoListing: false, moderationNote: '', profile: validateProfile(req.body.profile, state, 0) };
      const capacity = req.body.initialUnit?.capacity ?? defaultInitialUnit.capacity;
      requireThat(Number.isInteger(capacity) && capacity >= 1 && capacity <= 100, 'Initial unit capacity must be 1–100.');
      const unitName = text(req.body.initialUnit?.name ?? defaultInitialUnit.name, 2, 100, 'Initial unit name');
      state.campsites.push(camp); state.units.push({ id: nextId(state, 'units'), campId: camp.id, name: unitName, capacity, active: true });
      audit(state, user.id, 'Created campsite', camp.id); return camp;
    }); res.status(201).json(result);
  });
  app.patch('/api/campsites/:id', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']), camp = manageCamp(state, user, req.params.id);
      requireThat(camp.approvalStatus !== 'pending', 'Withdraw this pending submission before editing it.', 409);
      requireThat(req.body.revision === undefined || req.body.revision === camp.revision, 'This listing changed. Refresh before saving.', 409);
      Object.assign(camp, validateCamp({ ...camp, ...req.body }));
      camp.profile = validateProfile(req.body.profile ?? camp.profile, state, camp.id);
      camp.approvalStatus = 'draft'; camp.demoListing = false; camp.revision += 1; camp.moderationNote = '';
      if ('active' in req.body) { requireThat(typeof req.body.active === 'boolean', 'Active must be true or false.'); camp.active = req.body.active; }
      if ('polygon' in req.body) {
        requireThat(Array.isArray(req.body.polygon) && (req.body.polygon.length === 0 || req.body.polygon.length >= 3) && req.body.polygon.length <= 100, 'Boundary must be empty or contain 3–100 coordinates.');
        req.body.polygon.forEach((point) => validatePreferences(point, { price: 1, distance: 1, amenities: 1 }));
        requireThat(!boundaryProblem(req.body.polygon), boundaryProblem(req.body.polygon)); camp.polygon = req.body.polygon;
      }
      audit(state, user.id, 'Updated campsite', camp.id); return camp;
    }); res.json(result);
  });
  app.post('/api/units', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']); manageCamp(state, user, req.body.campId);
      requireThat(Number.isInteger(req.body.capacity) && req.body.capacity > 0 && req.body.capacity <= 100, 'Capacity must be 1–100.');
      const unit = { id: nextId(state, 'units'), campId: Number(req.body.campId), name: text(req.body.name, 2, 100, 'Unit name'), capacity: req.body.capacity, active: true };
      state.units.push(unit); audit(state, user.id, 'Created unit', unit.id); return unit;
    }); res.status(201).json(result);
  });
  app.patch('/api/units/:id', async (req, res) => {
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']), unit = record(state, 'units', req.params.id); manageCamp(state, user, unit.campId);
      const capacity = req.body.capacity ?? unit.capacity, active = req.body.active ?? unit.active;
      requireThat(Number.isInteger(capacity) && capacity > 0 && capacity <= 100 && typeof active === 'boolean', 'Invalid unit settings.');
      requireThat(!state.reservations.some((booking) => booking.unitId === unit.id && blocking(booking) && booking.end > todayManila() && (!active || booking.partySize > capacity)), 'These changes would invalidate a confirmed stay.', 409);
      unit.name = text(req.body.name ?? unit.name, 2, 100, 'Unit name'); unit.capacity = capacity; unit.active = active;
      audit(state, user.id, 'Updated unit', unit.id); return unit;
    }); res.json(result);
  });
  app.post('/api/closures', async (req, res) => {
    validateTrip(req.body.start, req.body.end, 1);
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']), unit = record(state, 'units', req.body.unitId); manageCamp(state, user, unit.campId);
      requireThat(!state.reservations.some((booking) => booking.unitId === unit.id && blocking(booking) && overlaps(booking, req.body)), 'A confirmed stay conflicts with this closure.', 409);
      const closure = { id: nextId(state, 'closures'), unitId: unit.id, start: req.body.start, end: req.body.end, reason: text(req.body.reason, 3, 300, 'Closure reason'), active: true };
      state.closures.push(closure); audit(state, user.id, 'Added closure', closure.id); return closure;
    }); res.status(201).json(result);
  });
  app.patch('/api/closures/:id', async (req, res) => {
    await store.mutate((state) => {
      const user = actor(state, req, ['owner']), closure = record(state, 'closures', req.params.id), unit = record(state, 'units', closure.unitId); manageCamp(state, user, unit.campId);
      closure.active = false; audit(state, user.id, 'Removed closure', closure.id);
    }); res.json({ ok: true });
  });
  app.get('/api/schedule/:unitId', (req, res) => {
    const user = actor(req.state, req, ['owner']), unit = record(req.state, 'units', req.params.unitId), camp = manageCamp(req.state, user, unit.campId);
    const requests = req.state.reservations.filter((booking) => unit.active && isPublished(req.state, camp) && booking.partySize <= unit.capacity && booking.unitId === unit.id && booking.status === 'pending' && booking.start >= todayManila());
    res.json({ selectedIds: greedySchedule(requests, req.state.reservations.filter((booking) => booking.unitId === unit.id && blocking(booking)), req.state.closures.filter((closure) => closure.unitId === unit.id && closure.active)),
      message: 'Earliest-finish compatible requests. This is an advisory; each approval still checks conflicts.' });
  });
  app.patch('/api/admin/users/:id', async (req, res) => {
    let revoke = false;
    const result = await store.mutate((state) => {
      const admin = actor(state, req, ['admin']), target = record(state, 'users', req.params.id);
      const role = req.body.role ?? target.role, active = req.body.active ?? target.active, verified = req.body.verified ?? target.verified;
      requireThat(['tourist', 'owner', 'admin'].includes(role) && typeof active === 'boolean' && typeof verified === 'boolean', 'Invalid account settings.');
      requireThat(target.id !== admin.id || (role === 'admin' && active), 'You cannot deactivate or demote your current administrator account.');
      requireThat(target.role !== 'owner' || role === 'owner' || !state.campsites.some((camp) => camp.ownerId === target.id), 'Transfer owned listings before changing this owner role.');
      revoke = role !== target.role || active !== target.active;
      Object.assign(target, { role, active, verified }); audit(state, admin.id, 'Updated account role or access', target.id); return publicUser(target);
    }); if (revoke && Number(req.params.id) !== req.session.userId) sessions.revokeUser(Number(req.params.id)); res.json(result);
  });
  app.patch('/api/admin/reviews/:id', async (req, res) => {
    await store.mutate((state) => { const user = actor(state, req, ['admin']), review = record(state, 'reviews', req.params.id);
      requireThat(typeof req.body.visible === 'boolean', 'Visible must be true or false.'); review.visible = req.body.visible; audit(state, user.id, 'Moderated review', review.id); }); res.json({ ok: true });
  });
  app.put('/api/admin/weather-config', async (req, res) => {
    await store.mutate((state) => {
      const user = actor(state, req, ['admin']), config = req.body;
      requireThat(Array.isArray(config.weights) && config.weights.length === 5 && config.weights.every((value) => Number.isFinite(value) && value >= 0) && Math.abs(config.weights.reduce((a, b) => a + b, 0) - 1) < 1e-8, 'Five weather weights must be nonnegative and sum to one.');
      requireThat([config.minTemperature, config.maxTemperature, config.windReference, config.thunderstormCap].every(Number.isFinite) && config.minTemperature < config.maxTemperature && config.windReference > 0 && config.thunderstormCap >= 0 && config.thunderstormCap <= 100, 'Invalid weather parameters.');
      text(config.reason, 5, 300, 'Change reason');
      state.config = { weights: config.weights, minTemperature: config.minTemperature, maxTemperature: config.maxTemperature,
        windReference: config.windReference, thunderstormCap: config.thunderstormCap, version: `proposed-${Date.now()}`, reason: config.reason.trim() };
      audit(state, user.id, 'Updated proposed WSI configuration', null);
    }); res.json({ ok: true });
  });
  app.post('/api/admin/reset-token/:id', async (req, res) => {
    requireThat(mailer.mode === 'preview', 'Use the emailed recovery link. Administrator token issuance is available only in local preview mode.', 403);
    const token = randomBytes(32).toString('hex');
    await store.mutate((state) => {
      const admin = actor(state, req, ['admin']), request = record(state, 'resetRequests', req.params.id);
      requireThat(!request.resolved, 'This request was resolved.'); request.tokenHash = createHash('sha256').update(token).digest('hex'); request.expires = Date.now() + 900000;
      audit(state, admin.id, 'Issued short-lived account reset token', request.userId);
    }); res.json({ token, expiresInMinutes: 15 });
  });
  app.get('/api/admin/backup', async (req, res) => {
    const user = actor(req.state, req, ['admin']);
    await store.mutate((state) => audit(state, user.id, 'Exported private system backup'));
    res.setHeader('Content-Disposition', 'attachment; filename="tourvista-backup.json"');
    res.json({ version: 2, exportedAt: new Date().toISOString(), state: await store.read() });
  });
  app.post('/api/admin/restore', async (req, res) => {
    actor(req.state, req, ['admin']); const restored = validateBackup(req.body);
    requireThat(store.mode === 'demo' || !hasSampleRecords(restored), 'Use a capstone backup without sample records.');
    await store.mutate(async (state) => {
      const admin = actor(state, req, ['admin']);
      const folder = join(dirname(fileURLToPath(import.meta.url)), 'storage', 'recovery');
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, `before-restore-${Date.now()}.json`), JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), state }));
      const priorUsers = state.users.map((user) => user.id);
      Object.keys(state).forEach((key) => { delete state[key]; }); Object.assign(state, restored);
      for (const request of [...state.resetRequests, ...state.emailVerifications]) request.resolved = true;
      reconcileSuspendedCampsites(state);
      const restoredAdmin = state.users.find((user) => user.email === admin.email && user.role === 'admin' && user.active);
      audit(state, restoredAdmin?.id || null, 'Restored system backup'); priorUsers.forEach((id) => sessions.revokeUser(id));
    }, { replace: true });
    sessions.rotate(req, res); res.json({ ok: true, csrf: req.session.csrf });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : error.code ? 503 : 400);
    res.status(status).json({ error: error.code ? 'Storage operation failed. Check your database connection.' : error.message || 'Request failed.' });
  });
  app.locals.sessions = sessions;
  return app;
}

function validateCamp(body) {
  requireThat(Number.isFinite(body.price) && body.price >= 0 && body.price <= 1000000, 'Price must be between 0 and 1,000,000.');
  validatePreferences({ latitude: body.latitude, longitude: body.longitude }, { price: 1, distance: 1, amenities: 1 });
  requireThat(Array.isArray(body.amenities) && body.amenities.every((item) => amenityChecklist.includes(item)), 'Use amenities from the common checklist.');
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  requireThat(imageUrl.length <= 1000 && (!imageUrl || /^https:\/\//i.test(imageUrl)), 'Image URL must be blank or use HTTPS.');
  return { name: text(body.name, 3, 120, 'Campsite name'), description: text(body.description ?? '', 0, 4000, 'Description'),
    price: body.price, latitude: body.latitude, longitude: body.longitude, amenities: [...new Set(body.amenities)],
    rules: typeof body.rules === 'string' ? body.rules.trim().slice(0, 2000) : '', imageUrl };
}
