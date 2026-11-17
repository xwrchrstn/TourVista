import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { audit, createStore, isSampleEmail, nextId } from './storage.js';
import { ensureLocalMysql } from './local-mysql.mjs';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
const postgresOnly = process.argv.includes('--postgres');
const hosted = postgresOnly || process.argv.includes('--hosted');
const guard = createServer((connection) => connection.destroy());
let store, input, localMysql;

try {
  if (!process.stdin.isTTY) throw new Error('Run npm.cmd run admin:setup directly in your VS Code terminal.');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (postgresOnly && !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the Supabase administrator setup.');
  if (hosted && !process.env.DATABASE_URL && process.env.DEMO_MODE !== 'false') throw new Error('Hosted administrator setup requires the hosted database settings.');
  console.log(hosted ? 'TourVista administrator setup for the configured hosted database.' : 'TourVista administrator setup. Stop TourVista before continuing.');
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  input = createInterface({ input: process.stdin, output, terminal: true });
  const abort = new AbortController();
  input.on('SIGINT', () => abort.abort());
  const ask = (prompt) => input.question(prompt, { signal: abort.signal });
  async function askPassword(prompt) {
    process.stdout.write(prompt);
    hidden = true;
    try { return await ask(''); }
    finally { hidden = false; process.stdout.write('\n'); }
  }

  const name = (await ask('Administrator name: ')).trim();
  const email = (await ask('Administrator email: ')).trim().toLowerCase();
  if (name.length < 2 || name.length > 100) throw new Error('Enter a name between 2 and 100 characters.');
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || isSampleEmail(email)) throw new Error('Enter your administrator email address.');
  const password = await askPassword('New password (hidden): ');
  if (password.length < 10 || password.length > 128) throw new Error('Enter a password between 10 and 128 characters.');
  if (password !== await askPassword('Confirm password (hidden): ')) throw new Error('The passwords must match.');
  input.close();
  input = null;

  if (!hosted) {
    await new Promise((resolve, reject) => {
      guard.once('error', reject);
      guard.listen(Number(process.env.PORT || 3001), '127.0.0.1', resolve);
    });
    localMysql = await ensureLocalMysql(process.env);
  }
  store = await createStore();
  const passwordHash = await hashPassword(password);
  await store.mutate((state) => {
    if (state.users.some((user) => user.role === 'admin')) throw new Error('An administrator account already exists. Sign in with that account.');
    if (state.users.some((user) => user.email === email)) throw new Error('That email already has a TourVista account. Choose another email for the administrator.');
    const id = nextId(state, 'users');
    state.users.push({ id, name, email, passwordHash, role: 'admin', active: true, verified: true, emailVerified: false, emailVerificationRequired: false });
    audit(state, id, 'Created initial administrator from local setup', id);
  });
  console.log(hosted ? 'Administrator created. Sign in on the hosted website.' : 'Administrator created. Start TourVista and sign in with your new account.');
} catch (error) {
  console.error(error.name === 'AbortError' ? 'Setup cancelled.' : error.code === 'EADDRINUSE' ? 'Stop TourVista in its running terminal, then try administrator setup again.' : error.message);
  process.exitCode = 1;
} finally {
  input?.close();
  if (guard.listening) guard.close();
  await store?.close();
  await localMysql?.close();
}
