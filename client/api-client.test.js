import test from 'node:test';
import assert from 'node:assert/strict';
import { requestApi } from './src/api-client.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createStore } from '../server/storage.js';
import { createApp } from '../server/app.js';

const expired = { status: 403, body: { error: 'Your session changed. Refresh the page and try again.' } };
const fresh = { status: 200, body: { user: null, csrf: 'fresh-token', mode: 'demo' } };
function fixture(replies) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const next = replies.shift();
    assert.ok(next, 'No extra requests are allowed');
    return { status: next.status, ok: next.status >= 200 && next.status < 300, json: async () => next.body };
  } };
}

test('An expired sign-in session refreshes once and resends the same form with the fresh token', async () => {
  const mock = fixture([expired, fresh, { status: 200, body: { user: { id: 3 }, csrf: 'signed-in-token' } }]);
  let renewed;
  const data = { email: 'tourist@tourvista.test', password: 'TourVista123!' };
  const result = await requestApi('/auth/login', { method: 'POST', body: data }, {
    session: { user: null, csrf: 'old-token' }, onSession: (value) => { renewed = value; }, ...mock
  });
  assert.equal(result.user.id, 3);
  assert.equal(renewed.csrf, 'fresh-token');
  assert.deepEqual(mock.calls.map((call) => call.url), ['/api/auth/login', '/api/session', '/api/auth/login']);
  assert.equal(mock.calls[0].options.headers['X-CSRF-Token'], 'old-token');
  assert.equal(mock.calls[2].options.headers['X-CSRF-Token'], 'fresh-token');
  assert.equal(mock.calls[0].options.body, mock.calls[2].options.body);
  assert.equal(mock.calls[1].options.credentials, 'same-origin');
});

test('An expired registration session preserves the chosen account fields', async () => {
  const mock = fixture([expired, fresh, { status: 201, body: { user: { id: 4, role: 'owner' } } }]);
  const body = { name: 'Sample Owner', email: 'owner-new@test.com', password: 'TestPassword123!', role: 'owner' };
  assert.equal((await requestApi('/auth/register', { method: 'POST', body }, { session: { csrf: 'old' }, ...mock })).user.role, 'owner');
  assert.deepEqual(JSON.parse(mock.calls[2].options.body), body);
});

test('A protected action is not replayed after the signed-in account changes', async () => {
  const mock = fixture([expired, { status: 200, body: { user: { id: 2 }, csrf: 'other-account' } }]);
  await assert.rejects(requestApi('/itinerary', { method: 'PUT', body: { stops: [] } }, {
    session: { user: { id: 3 }, csrf: 'old' }, ...mock
  }), /Your sign-in changed/);
  assert.equal(mock.calls.length, 2);
});

test('A renewed session with the same account can retry a pre-action CSRF rejection', async () => {
  const mock = fixture([expired, { status: 200, body: { user: { id: 3 }, csrf: 'fresh' } }, { status: 200, body: { saved: true } }]);
  assert.equal((await requestApi('/itinerary', { method: 'PUT', body: { stops: [] } }, {
    session: { user: { id: 3 }, csrf: 'old' }, ...mock
  })).saved, true);
  assert.equal(mock.calls[2].options.headers['X-CSRF-Token'], 'fresh');
});

test('Ordinary credential failures, permission errors, and server errors are never replayed', async () => {
  for (const status of [401, 403, 503]) {
    const mock = fixture([{ status, body: { error: 'Operation failed.' } }]);
    await assert.rejects(requestApi('/auth/login', { method: 'POST', body: {} }, { ...mock }), /Operation failed/);
    assert.equal(mock.calls.length, 1);
  }
});

test('Repeated session mismatches stop after one retry', async () => {
  const mock = fixture([expired, fresh, expired]);
  await assert.rejects(requestApi('/auth/login', { method: 'POST', body: {} }, { ...mock }), /Your session changed/);
  assert.equal(mock.calls.length, 3);
});

test('Real API login succeeds for all demo roles after their page session expires', async (t) => {
  const store = await createStore({ demo: true, path: join(process.cwd(), 'storage', 'tests', randomUUID() + '.json') });
  const app = await createApp(store), server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['tourist', 'owner', 'admin']) {
    let cookie = '';
    const statuses = [];
    const fetchImpl = async (url, options) => {
      const response = await fetch(base + url, { ...options, headers: { ...options.headers, Cookie: cookie } });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) cookie = cookies.at(-1).split(';')[0];
      statuses.push(response.status);
      return response;
    };
    const pageSession = await requestApi('/session', {}, { fetchImpl });
    app.locals.sessions.revokeUser(null);
    const signedIn = await requestApi('/auth/login', { method: 'POST', body: {
      email: `${role}@tourvista.test`, password: 'TourVista123!'
    } }, { session: pageSession, fetchImpl });
    assert.equal(signedIn.user.role, role);
    assert.deepEqual(statuses, [200, 403, 200, 200]);
    assert.equal((await requestApi('/dashboard', {}, { fetchImpl })).user.role, role);
  }
});
