import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
const folder = dirname(fileURLToPath(import.meta.url));
const hosted = process.argv.includes('--hosted');
const site = join(folder, '../client/dist');
if (existsSync(join(folder, '.env'))) process.loadEnvFile(join(folder, '.env'));
const { createStore } = await import('./storage.js');
const { createApp } = await import('./app.js');
try {
  if (hosted && !existsSync(join(site, 'index.html'))) throw new Error('Run npm run build before starting the hosted app.');
  if (hosted && process.env.DEMO_MODE !== 'false') throw new Error('Set DEMO_MODE=false and configure the hosted MySQL database before starting.');
  if (hosted && !process.env.APP_URL?.startsWith('https://')) throw new Error('Set APP_URL to the HTTPS address of the hosted app.');
  const store = await createStore();
  const app = await createApp(store, { secureCookies: hosted }), port = Number(process.env.PORT || 3001);
  if (hosted) app.use(express.static(site));
  const server = app.listen(port, hosted ? '0.0.0.0' : '127.0.0.1');
  server.once('listening', () => {
    if (hosted) console.log(`TourVista website and API are listening on port ${port} (${store.mode} mode).`);
    else console.log(`TourVista API ready: http://127.0.0.1:${port} (${store.mode} mode) · capstone listings v2 · email accounts v1`);
    const mailStatus = { smtp: 'SMTP delivery configured for accounts, reservations and listing reviews.', preview: 'Local account previews enabled.', unavailable: 'Set up Gmail with npm.cmd run email:setup to enable email delivery.' };
    console.log('TourVista email: ' + mailStatus[app.locals.accounts.mode]);
  });
  const prune = setInterval(() => app.locals.sessions.prune(), 60000); prune.unref();
  async function stop() { clearInterval(prune); server.close(async () => { await app.locals.accounts.waitForEmails(); await store.close(); process.exit(0); }); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the previous backend.` : error.message); process.exit(1); });
} catch (error) { console.error(`TourVista could not start: ${error.code || error.message}. Check your server/.env and data settings.`); process.exit(1); }
