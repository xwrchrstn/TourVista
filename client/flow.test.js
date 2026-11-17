import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, routeHash, stayQuote, bookingTotals, canOpenPage } from './src/flow.js';

test('Guest reservation continuation keeps a permitted campsite destination', () => {
  const route = readRoute(routeHash('login', null, { page: 'reservation', id: 4 }));
  assert.deepEqual(route, { page: 'login', id: null, next: 'reservation', campId: 4 });
  assert.equal(readRoute('#/details/2').id, 2);
  assert.equal(readRoute('').page, 'home');
});
test('Routing rejects arbitrary redirects and invalid identifiers', () => {
  assert.equal(readRoute('#/https://example.com').page, 'home');
  assert.equal(readRoute('#/login?next=https://example.com&camp=2').next, null);
  for (const id of ['-1', '0', 'NaN', '9007199254740992']) assert.equal(readRoute('#/details/' + id).id, null);
  assert.equal(routeHash('login', null, { page: 'reservation', id: 'https://example.com' }), '#/login');
});
test('Legacy discovery and map links lead to the catalog or specific campsite details', () => {
  assert.equal(readRoute('#/explore').page, 'home');
  assert.equal(readRoute('#/map').page, 'home');
  assert.equal(readRoute('#/map/2').page, 'details');
  assert.equal(readRoute('#/map/2').id, 2);
  assert.equal(routeHash('explore'), '#/home');
  assert.equal(routeHash('map', 2), '#/details/2');
});
test('Stay estimates use half-open night counts and reject invalid calendar dates', () => {
  assert.deepEqual(stayQuote({ start: '2028-02-28', end: '2028-03-01' }, 450.25), { nights: 2, total: 900.5 });
  assert.deepEqual(stayQuote({ start: '2028-03-01', end: '2028-03-02' }, 0), { nights: 1, total: 0 });
  for (const dates of [['2027-02-29', '2027-03-01'], ['oops', '2028-03-01'], ['2028-03-02', '2028-03-01'], ['2028-03-01', '2028-03-01'], ['2028-01-01', '2028-03-01']]) {
    assert.equal(stayQuote({ start: dates[0], end: dates[1] }, 450), null);
  }
  assert.equal(stayQuote({ start: '2028-03-01', end: '2028-03-02' }, -1), null);
});
test('Reports count the recorded statuses without synthetic totals', () => {
  assert.deepEqual(bookingTotals([{ status: 'pending' }, { status: 'confirmed' }, { status: 'pending' }, { status: 'completed' }]), { pending: 2, confirmed: 1, completed: 1 });
  assert.deepEqual(bookingTotals([]), {});
});
test('Host operations, administration and tourist bookings have separate page permissions', () => {
  assert.equal(canOpenPage('admin', 'units'), false);
  assert.equal(canOpenPage('owner', 'users'), false);
  assert.equal(canOpenPage('tourist', 'listings'), false);
  assert.equal(canOpenPage('owner', 'units'), true);
  assert.equal(canOpenPage('admin', 'listings'), true);
  assert.equal(canOpenPage('tourist', 'reservation'), true);
  assert.equal(canOpenPage('admin', 'reservation'), false);
  assert.equal(readRoute('#/admin-login').page, 'login');
  assert.equal(readRoute('#/saved').page, 'saved');
  assert.equal(canOpenPage('tourist', 'saved'), true);
  assert.equal(canOpenPage('owner', 'saved'), false);
  assert.equal(routeHash('register', null, { account: 'owner' }), '#/register?role=owner');
  assert.equal(routeHash('login', null, { account: 'owner' }), '#/login');
});
