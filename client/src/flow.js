// Public browsing and role-specific marketplace routes.
export const publicPages = new Set(['home', 'details', 'login', 'register', 'forgot', 'reset', 'account-created', 'verify-email']);
const allowed = new Set([...publicPages, 'account', 'saved', 'reservation', 'confirmation', 'dashboard', 'bookings', 'itinerary', 'listings', 'units', 'users', 'reviews', 'weather', 'audit', 'reports']);
const positiveId = (value) => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function readRoute(hash = '') {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name, identifier] = path.split('/');
  const params = new URLSearchParams(query);
  const id = positiveId(identifier), alias = ['admin-login', 'owner-login'].includes(name) ? 'login' : name === 'explore' ? 'home' : name === 'map' ? (id ? 'details' : 'home') : name;
  return { page: allowed.has(alias) ? alias : 'home', id: ['explore', 'map'].includes(name) && alias === 'home' ? null : id,
    next: params.get('next') === 'reservation' ? 'reservation' : null,
    campId: positiveId(params.get('camp')) };
}
export function routeHash(page, id, next) {
  if (page === 'explore') { page = 'home'; id = null; }
  if (page === 'map') page = Number.isSafeInteger(id) && id > 0 ? 'details' : 'home';
  if (!allowed.has(page)) page = 'home';
  return `#/${page}${Number.isSafeInteger(id) && id > 0 ? '/' + id : ''}${next?.page === 'reservation' && Number.isSafeInteger(next.id) && next.id > 0 ? '?next=reservation&camp=' + next.id : page === 'register' && next?.account === 'owner' ? '?role=owner' : ''}`;
}
// Workspace permissions mirror the server's role boundaries.
export function canOpenPage(role, page) {
  if (publicPages.has(page)) return true;
  if (['account', 'dashboard', 'bookings', 'confirmation'].includes(page)) return ['tourist', 'owner', 'admin'].includes(role);
  if (['saved', 'reservation', 'itinerary'].includes(page)) return role === 'tourist';
  if (['listings', 'reports'].includes(page)) return ['owner', 'admin'].includes(role);
  if (page === 'units') return role === 'owner';
  return ['users', 'reviews', 'weather', 'audit'].includes(page) && role === 'admin';
}
export function stayQuote(trip, unitPrice) {
  const parse = (date) => { const value = Date.parse(date); return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : NaN; };
  const nights = (parse(trip.end) - parse(trip.start)) / 86400000;
  return Number.isInteger(nights) && nights > 0 && nights <= 30 && Number.isFinite(unitPrice) && unitPrice >= 0 ?
    { nights, total: Math.round(unitPrice * nights * 100) / 100 } : null;
}
export function bookingTotals(bookings) {
  return bookings.reduce((totals, booking) => { totals[booking.status] = (totals[booking.status] || 0) + 1; return totals; }, {});
}
