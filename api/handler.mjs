import { attachDatabasePool, waitUntil } from '../server/vercel-functions.js';
import { createApp } from '../server/app.js';
import { createStore } from '../server/storage.js';

let initialized;
let nextPrune = 0;

async function start() {
  const url = new URL(process.env.APP_URL || 'http://localhost');
  if (url.protocol !== 'https:') throw new Error('Configure the public HTTPS APP_URL.');
  if (!process.env.DATABASE_URL) throw new Error('Configure the Supabase DATABASE_URL.');
  const store = await createStore({ mode: 'postgres' });
  try {
    attachDatabasePool(store.pool);
    const app = await createApp(store, { secureCookies: true, extendLifetime: waitUntil, httpBackupLimit: 4 * 1024 * 1024 });
    return { app, store };
  } catch (error) {
    await store.close();
    throw error;
  }
}

export default async function handler(req, res) {
  initialized ??= start().catch((error) => { initialized = undefined; throw error; });
  let runtime;
  try { runtime = await initialized; }
  catch (error) {
    console.error('TourVista startup failed: ' + (error.code || error.name));
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'TourVista could not connect. Check the deployment configuration.' }));
    return;
  }

  const request = new URL(req.url, 'http://tourvista.invalid');
  const path = request.searchParams.get('__tourvista_route');
  if (request.pathname === '/api/handler' && path && /^[a-z0-9/_-]+$/i.test(path)) request.pathname = '/api/' + path;
  request.searchParams.delete('__tourvista_route');
  req.url = request.pathname + request.search;

  if (Date.now() >= nextPrune) {
    nextPrune = Date.now() + 60_000;
    waitUntil(runtime.store.sessionStore.prune().catch((error) => console.warn('Session cleanup: ' + (error.code || error.name))));
  }
  await new Promise((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    runtime.app(req, res);
  });
}
