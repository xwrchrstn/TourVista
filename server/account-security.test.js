import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from './storage.js';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
import { verifyPassword } from './auth.js';
import { validateBackup } from './recovery.js';
import { todayManila } from './features.js';
import { completeProfile } from './test-fixtures.js';

test('Local email previews cannot run as public mail, and email links use only a trusted configured origin', () => {
  for (const env of [{ APP_URL: 'http://evil.example' }, { APP_URL: 'https://example.test', MAIL_MODE: 'preview' }, { APP_URL: 'https://user:secret@example.test', MAIL_MODE: 'smtp' }, { APP_URL: 'http://127.0.0.1:5173/?redirect=bad' }, { MAIL_MODE: 'anything' }]) assert.throws(() => createMailer({ demo: true, directory: 'unused', env }));
  assert.equal(createMailer({ demo: false, directory: 'unused', env: { MAIL_MODE: 'preview', APP_URL: 'http://127.0.0.1:5173' } }).mode, 'preview');
  assert.throws(() => createMailer({ demo: false, env: { MAIL_MODE: 'smtp', APP_URL: 'https://example.test' } }), /MAIL_FROM/);
  assert.throws(() => createMailer({ demo: false, env: { MAIL_MODE: 'smtp', APP_URL: 'https://example.test', MAIL_FROM: 'TourVista <sender@example.test>' } }), /SMTP/);
});

test('Tourist and owner email confirmation, private previews, password change and emailed recovery', async (t) => {
  const tests = join(process.cwd(), 'storage', 'tests'); await mkdir(tests, { recursive: true });
  const folder = await mkdtemp(join(tests, 'email-')), path = join(folder, 'state.json'), directory = join(folder, 'mail');
  const store = await createStore({ demo: true, path });
  const realMailer = createMailer({ demo: true, directory, env: { MAIL_MODE: 'preview', APP_URL: 'http://127.0.0.1:5173' } });
  let failDelivery = false;
  const mailer = { mode: realMailer.mode, origin: realMailer.origin, send: (message) => failDelivery ? Promise.reject(new Error('SYNTHETIC_PROVIDER_SECRET')) : realMailer.send(message) };
  const app = await createApp(store, { mailer }), server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await app.locals.accounts.waitForEmails(); await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function client() {
    let cookie = '', csrf = '';
    return { async request(route, method = 'GET', body, extra = {}) {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().at(-1).split(';')[0];
      const result = await response.json(); if (result.csrf) csrf = result.csrf;
      return { status: response.status, body: result };
    }, async login(address, password = 'TourVista123!') { await this.request('/session'); return this.request('/auth/login', 'POST', { email: address, password }); } };
  }
  async function messages(to) {
    await app.locals.accounts.waitForEmails();
    const names = await readdir(directory).catch(() => []), rows = [];
    for (const name of names) { const text = await readFile(join(directory, name), 'utf8'); if (text.includes(`To: ${to}\n`)) rows.push({ name, text }); }
    return rows;
  }
  async function tokenFor(to, page) {
    const rows = (await messages(to)).filter((row) => row.text.includes(`/#/${page}?token=`)).sort((a, b) => a.name.localeCompare(b.name));
    assert.ok(rows.length); return rows.at(-1).text.match(new RegExp(`/#/${page}\\?token=([a-f0-9]{64})`))[1];
  }
  const guest = client(); await guest.request('/session');
  const accounts = {};
  const day = (offset) => new Date(Date.parse(todayManila()) + offset * 86400000).toISOString().slice(0, 10);
  const booking = { unitId: 1, start: day(15), end: day(16), partySize: 2, requestKey: randomUUID() };

  await t.test('Registration requires a valid unique email and blocks mismatched confirmation or admin escalation', async () => {
    for (const address of ['', 'not-an-email']) assert.equal((await guest.request('/auth/register', 'POST', { name: 'Synthetic Test', email: address, password: 'TourVista123!', role: 'tourist' })).status, 400);
    assert.equal((await guest.request('/auth/register', 'POST', { name: 'Synthetic Test', email: 'badconfirm@example.test', password: 'TourVista123!', confirmPassword: 'Different123!', role: 'tourist' })).status, 400);
    assert.equal((await guest.request('/auth/register', 'POST', { name: 'Synthetic Test', email: 'badadmin@example.test', password: 'TourVista123!', role: 'admin' })).status, 400);
  });
  for (const role of ['tourist', 'owner']) await t.test(`${role}: registration prepares a private email; its one-use token alone confirms that account`, async () => {
    const account = client(), address = `synthetic-${role}@example.test`; await account.request('/session');
    const created = await account.request('/auth/register', 'POST', { name: 'Synthetic ' + role, email: address.toUpperCase(), password: 'TourVista123!', confirmPassword: 'TourVista123!', role, emailVerified: true, verified: true });
    assert.equal(created.status, 201); assert.equal(created.body.user.email, address); assert.equal(created.body.user.emailVerified, false); assert.equal(created.body.user.emailVerificationRequired, true); assert.equal(created.body.user.verified, false);
    assert.equal('token' in created.body, false); assert.equal('passwordHash' in created.body.user, false);
    accounts[role] = { account, address, id: created.body.user.id };
    if (role === 'tourist') assert.equal((await account.request('/reservations', 'POST', booking)).status, 403);
    else {
      const camp = await account.request('/campsites', 'POST', { name: 'Synthetic Email Camp', description: 'A synthetic property used to verify that email and ownership checks are separate.', price: 345, latitude: 8.61, longitude: 124.89, amenities: ['Water'], rules: 'Synthetic house rules only.', imageUrl: '', profile: completeProfile() });
      assert.equal(camp.status, 201); accounts.owner.campId = camp.body.id; accounts.owner.revision = camp.body.revision;
      assert.equal((await account.request(`/campsites/${camp.body.id}/submit`, 'POST', {})).status, 403);
    }
    const token = await tokenFor(address, 'verify-email');
    const before = await store.read(); assert.ok(before.emailVerifications.some((row) => row.userId === created.body.user.id && row.tokenHash !== token));
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token: 'f'.repeat(64) })).status, 400);
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token, userId: 1 })).status, 200);
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token })).status, 400);
    const own = (await account.request('/session')).body.user; assert.equal(own.emailVerified, true); assert.equal(own.verified, false);
    assert.ok((await messages(address)).every((row) => row.text.startsWith('LOCAL TEST EMAIL — NOT SENT')));
    const other = (await store.read()).users.find((row) => row.id === 1); assert.equal(other.email, 'admin@tourvista.test');
  });
  await t.test('Email confirmation enables a new tourist request without granting owner/admin access', async () => {
    const result = await accounts.tourist.account.request('/reservations', 'POST', booking); assert.equal(result.status, 201);
    assert.equal((await accounts.tourist.account.request('/admin/backup')).status, 403);
    const resultOwner = await accounts.owner.account.request(`/campsites/${accounts.owner.campId}/submit`, 'POST', { revision: accounts.owner.revision });
    assert.equal(resultOwner.status, 400); assert.match(resultOwner.body.error, /authorized/);
    const reopened = await createStore({ demo: true, path }); assert.ok((await reopened.read()).users.find((row) => row.id === accounts.owner.id).emailVerified); await reopened.close();
  });
  await t.test('Forgot password is generic for existing/unknown emails, validates CSRF and never returns links publicly', async () => {
    const known = await guest.request('/auth/request-reset', 'POST', { email: accounts.tourist.address }, { 'X-Forwarded-Host': 'evil.example' });
    const unknown = await guest.request('/auth/request-reset', 'POST', { email: 'unknown@example.test' });
    assert.equal(known.status, 200); assert.deepEqual(known.body, unknown.body); assert.equal('token' in known.body, false);
    assert.equal((await guest.request('/auth/request-reset', 'POST', { email: accounts.tourist.address }, { 'X-CSRF-Token': 'bad' })).status, 403);
    const list = await messages(accounts.tourist.address); assert.ok(list.some((row) => row.text.includes('http://127.0.0.1:5173/#/reset?token='))); assert.ok(list.every((row) => !row.text.includes('evil.example')));
    assert.equal((await messages('unknown@example.test')).length, 0);
    assert.equal((await guest.request('/auth/resend-verification', 'POST', {})).status, 401);
  });
  for (const role of ['tourist', 'owner']) await t.test(`${role}: changing a password verifies the old one, requires matching confirmation and revokes sessions/reset links`, async () => {
    const { account, address } = accounts[role], otherSession = client(); await otherSession.login(address);
    await guest.request('/auth/request-reset', 'POST', { email: address }); const oldReset = await tokenFor(address, 'reset');
    assert.equal((await account.request('/auth/change-password', 'POST', { currentPassword: 'wrong-password', password: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!' })).status, 400);
    assert.equal((await account.request('/auth/change-password', 'POST', { currentPassword: 'TourVista123!', password: 'ChangedPassword123!', confirmPassword: 'Mismatch123!' })).status, 400);
    assert.equal((await account.request('/auth/change-password', 'POST', { currentPassword: 'TourVista123!', password: 'TourVista123!', confirmPassword: 'TourVista123!' })).status, 400);
    const changed = await account.request('/auth/change-password', 'POST', { currentPassword: 'TourVista123!', password: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!', userId: 1 });
    assert.equal(changed.status, 200); assert.equal((await otherSession.request('/dashboard')).status, 401); assert.equal((await account.request('/session')).body.user, null);
    assert.equal((await guest.request('/auth/reset', 'POST', { token: oldReset, password: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!' })).status, 400);
    assert.equal((await otherSession.login(address)).status, 401); assert.equal((await otherSession.login(address, 'ChangedPassword123!')).status, 200);
    const state = await store.read(), current = state.users.find((row) => row.id === accounts[role].id);
    assert.ok(await verifyPassword('ChangedPassword123!', current.passwordHash)); assert.ok(await verifyPassword('TourVista123!', state.users.find((row) => row.id === 1).passwordHash));
    assert.ok((await messages(address)).some((row) => row.text.includes('Your TourVista password changed')));
  });
  await t.test('Recovery links expire and a fresh link can reset only once, including competing requests', async () => {
    const { address } = accounts.tourist;
    await guest.request('/auth/request-reset', 'POST', { email: address }); const expired = await tokenFor(address, 'reset');
    await store.mutate((state) => { for (const row of state.resetRequests) if (row.userId === accounts.tourist.id && !row.resolved) { row.expires = Date.now() - 1; row.createdAt = new Date(Date.now() - 61000).toISOString(); } });
    const payload = { token: expired, password: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!' };
    assert.equal((await guest.request('/auth/reset', 'POST', payload)).status, 400);
    assert.equal((await guest.request('/auth/request-reset', 'POST', { email: address })).status, 200); const token = await tokenFor(address, 'reset'); assert.notEqual(token, expired);
    assert.equal((await guest.request('/auth/reset', 'POST', { ...payload, token, confirmPassword: 'Mismatch123!' })).status, 400);
    const second = client(); await second.request('/session');
    const results = await Promise.all([guest.request('/auth/reset', 'POST', { ...payload, token }), second.request('/auth/reset', 'POST', { ...payload, token })]);
    assert.deepEqual(results.map((row) => row.status).sort(), [200, 400]);
    assert.equal((await guest.login(address, 'RecoveredPassword123!')).status, 200);
    for (const { text } of await messages(address)) for (const secret of ['TourVista123!', 'ChangedPassword123!', 'RecoveredPassword123!']) assert.equal(text.includes(secret), false);
  });
  await t.test('Expired verification links fail; resending replaces earlier links and is rate limited', async () => {
    const account = client(), address = 'expiry@example.test'; await account.request('/session');
    await account.request('/auth/register', 'POST', { name: 'Synthetic Expiry', email: address, password: 'TourVista123!', role: 'owner' });
    const token = await tokenFor(address, 'verify-email');
    await store.mutate((state) => { state.emailVerifications.find((row) => row.email === address && !row.resolved).expires = Date.now() - 1; });
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token })).status, 400);
    assert.equal((await account.request('/auth/resend-verification', 'POST', {})).status, 200);
    const latest = await tokenFor(address, 'verify-email'); assert.notEqual(latest, token);
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token: latest })).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await account.request('/auth/resend-verification', 'POST', {})).status, 200);
    assert.equal((await account.request('/auth/resend-verification', 'POST', {})).status, 429);
  });
  await t.test('Delivery failures retain the account, leak no provider secret and can be retried', async () => {
    failDelivery = true;
    const account = client(), address = 'retry@example.test'; await account.request('/session');
    const result = await account.request('/auth/register', 'POST', { name: 'Synthetic Retry', email: address, password: 'TourVista123!', role: 'tourist' });
    assert.equal(result.status, 201); await app.locals.accounts.waitForEmails();
    assert.ok((await store.read()).audit.some((row) => row.action.includes('email delivery failed'))); assert.equal(JSON.stringify(await store.read()).includes('SYNTHETIC_PROVIDER_SECRET'), false);
    failDelivery = false; assert.equal((await account.request('/auth/resend-verification', 'POST', {})).status, 200);
    assert.equal((await guest.request('/auth/verify-email', 'POST', { token: await tokenFor(address, 'verify-email') })).status, 200);
  });
  await t.test('Backups validate email token relationships while legacy accounts retain access without claiming verified mailboxes', async () => {
    const backup = { version: 2, state: await store.read() }; assert.ok(validateBackup(backup));
    const invalid = structuredClone(backup); invalid.state.emailVerifications[0].email = 'someone-else@example.test'; assert.throws(() => validateBackup(invalid), /verification/);
    const legacy = structuredClone(backup); delete legacy.state.emailVerifications;
    for (const user of legacy.state.users) { delete user.emailVerified; delete user.emailVerificationRequired; }
    const checked = validateBackup(legacy); assert.ok(checked.users.every((row) => row.emailVerified === false && row.emailVerificationRequired === false));
    const publicData = await guest.request('/campsites'); assert.equal(JSON.stringify(publicData.body).includes('tokenHash'), false);
    assert.equal((await guest.request('/mail-preview')).status, 404);
  });
});
