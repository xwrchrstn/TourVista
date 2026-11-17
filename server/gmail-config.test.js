import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { gmailSettings, mergeMailSettings, readPrivateEnv, saveMailSettings } from './gmail-config.js';
import { createMailer, mailFailureHint } from './mail.js';
import { createStore } from './storage.js';
import { createApp } from './app.js';

const settings = gmailSettings('Sender@Gmail.com', 'abcd efgh ijkl mnop');
test('Gmail setup validates the sender, app password and trusted link origin', () => {
  assert.equal(settings.SMTP_USER, 'sender@gmail.com'); assert.equal(settings.SMTP_PASS, 'abcdefghijklmnop');
  assert.equal(settings.MAIL_MODE, 'smtp'); assert.equal(settings.SMTP_HOST, 'smtp.gmail.com'); assert.equal(settings.SMTP_PORT, '465');
  assert.equal(gmailSettings('sender@example.test', 'abcdefghijklmnop', 'https://tourvista.example').APP_URL, 'https://tourvista.example');
  for (const [sender, secret, url] of [['not-email', 'abcdefghijklmnop'], ['a@example.test\r\nBcc: x@example.test', 'abcdefghijklmnop'], ['a@example.test', 'normalpassword!'], ['a@example.test', 'abcdefghijklmnop', 'http://remote.example'], ['a@example.test', 'abcdefghijklmnop', 'https://user:pass@remote.example']]) assert.throws(() => gmailSettings(sender, secret, url));
});
test('Sender settings preserve database configuration and remove conflicting email duplicates', async () => {
  const source = '# keep this comment\nDEMO_MODE=true\nDB_PASSWORD="synthetic-database-secret"\nMAIL_MODE=preview\nMAIL_MODE=preview\n';
  const merged = mergeMailSettings(source, settings), parsed = parseEnv(merged);
  assert.equal(parsed.DB_PASSWORD, 'synthetic-database-secret'); assert.equal(parsed.DEMO_MODE, 'true'); assert.equal(parsed.MAIL_MODE, 'smtp');
  assert.ok(merged.startsWith('# keep this comment')); assert.equal(merged.match(/^MAIL_MODE=/gm).length, 1);
  const parent = join(process.cwd(), 'storage', 'tests'); await mkdir(parent, { recursive: true });
  const path = join(await mkdtemp(join(parent, 'gmail-config-')), '.env'); await writeFile(path, source);
  await saveMailSettings(path, source, settings); assert.equal(parseEnv(await readPrivateEnv(path)).SMTP_USER, 'sender@gmail.com');
  await assert.rejects(() => saveMailSettings(path, source, settings), /changed/);
});
test('Real SMTP transport verifies, sends the verification/reset content and retains TLS protections', async () => {
  const calls = [], options = [];
  const mailer = createMailer({ env: settings, transportFactory: (config) => { options.push(config); return { async verify() { calls.push('verify'); }, async sendMail(message) { calls.push(message); return { accepted: [message.to] }; }, close() { calls.push('close'); } }; } });
  await mailer.verify();
  for (const purpose of ['verify-email', 'reset']) await mailer.send({ to: 'recipient@gmail.com', subject: purpose, text: `http://127.0.0.1:5173/#/${purpose}?token=${'a'.repeat(64)}` });
  mailer.close(); assert.equal(calls[0], 'verify'); assert.equal(calls[1].to, 'recipient@gmail.com'); assert.ok(calls[2].text.includes('/#/reset?token=')); assert.equal(calls[3], 'close');
  assert.equal(options[0].secure, true); assert.equal(options[0].requireTLS, true); assert.equal(options[0].disableFileAccess, true); assert.equal(options[0].disableUrlAccess, true);
  const rejected = createMailer({ env: settings, transportFactory: () => ({ async sendMail() { return { accepted: [] }; } }) });
  await assert.rejects(() => rejected.send({ to: 'recipient@gmail.com', subject: 'test', text: 'test' }), /not accept/);
});
test('Email diagnostic hints do not echo provider responses, credentials or recipients', () => {
  for (const code of ['EAUTH', 'ETIMEDOUT', 'ESOCKET', 'UNEXPECTED']) {
    const hint = mailFailureHint({ code, message: 'synthetic-secret@example.test abcdefghijklmnop', response: 'private response' });
    assert.equal(hint.includes('abcdefghijklmnop'), false); assert.equal(hint.includes('private response'), false); assert.equal(hint.includes('synthetic-secret'), false);
  }
});
test('Registration and Forgot password for both roles reach SMTP at each registered recipient', async (t) => {
  // The transport is replaced in memory: no network email or real credential is used.
  const messages = [], parent = join(process.cwd(), 'storage', 'tests'); await mkdir(parent, { recursive: true });
  const store = await createStore({ demo: true, path: join(await mkdtemp(join(parent, 'smtp-flow-')), 'state.json') });
  const mailer = createMailer({ env: settings, transportFactory: () => ({ async sendMail(message) { messages.push(message); return { accepted: [message.to] }; } }) });
  const app = await createApp(store, { mailer }), server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await app.locals.accounts.waitForEmails(); await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`; let cookie = '', csrf = '';
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
    if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().at(-1).split(';')[0];
    const value = await response.json(); if (value.csrf) csrf = value.csrf; return response.status;
  }
  await request('/session');
  for (const role of ['tourist', 'owner']) {
    const email = `recipient-${role}@example.test`;
    assert.equal(await request('/auth/register', { name: 'Synthetic ' + role, email, role, password: 'TourVista123!' }), 201);
    assert.equal(await request('/auth/request-reset', { email }), 200); await app.locals.accounts.waitForEmails();
    assert.ok(messages.some((message) => message.to === email && message.subject === 'Verify your TourVista email' && message.text.includes('/#/verify-email?token=')));
    assert.ok(messages.some((message) => message.to === email && message.subject === 'Reset your TourVista password' && message.text.includes('/#/reset?token=')));
  }
  assert.ok(messages.every((message) => message.from === 'TourVista <sender@gmail.com>' && !message.text.includes('TourVista123!')));
});
