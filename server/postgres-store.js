import pg from 'pg';
import { emptyState, foreignKeys, hasSampleRecords, tables, upgradeState } from './storage.js';

const { Pool } = pg;
const quote = (name) => '"' + name + '"';
const table = (name) => 'tourvista.' + quote(name);
const databaseType = (type) => ({ JSON: 'JSONB', DOUBLE: 'DOUBLE PRECISION' }[type] || type);
const tableNames = Object.keys(tables);
const schema = [
  'CREATE SCHEMA IF NOT EXISTS tourvista',
  'REVOKE ALL ON SCHEMA tourvista FROM PUBLIC',
  'CREATE TABLE IF NOT EXISTS tourvista.app_lock (id INT PRIMARY KEY)',
  'INSERT INTO tourvista.app_lock (id) VALUES (1) ON CONFLICT DO NOTHING',
  'CREATE TABLE IF NOT EXISTS tourvista.settings (id INT PRIMARY KEY, config JSONB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tourvista.recovery (id INT PRIMARY KEY, snapshot JSONB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tourvista.sessions (token TEXT PRIMARY KEY, "userId" INT, csrf TEXT NOT NULL, expires DOUBLE PRECISION NOT NULL)',
  'CREATE INDEX IF NOT EXISTS session_expiry ON tourvista.sessions (expires)',
  'CREATE INDEX IF NOT EXISTS tourvista_sessions_user_id ON tourvista.sessions ("userId")',
  ...tableNames.map((name) => {
    const columns = Object.entries(tables[name]).map(([key, type]) => quote(key) + ' ' + databaseType(type));
    if (foreignKeys[name]) {
      const [key, parent] = foreignKeys[name];
      columns.push('FOREIGN KEY (' + quote(key) + ') REFERENCES ' + table(parent) + '(id)');
    }
    if (name === 'reservations') columns.push('UNIQUE ("userId", "requestKey")');
    return 'CREATE TABLE IF NOT EXISTS ' + table(name) + ' (' + columns.join(', ') + ')';
  }),
  'CREATE INDEX IF NOT EXISTS unit_dates ON tourvista.reservations ("unitId", "start", "end")',
].join(';\n');

async function load(client) {
  const state = emptyState();
  for (const name of tableNames) {
    state[name] = (await client.query('SELECT * FROM ' + table(name) + ' ORDER BY id')).rows;
  }
  const config = (await client.query('SELECT config FROM tourvista.settings WHERE id = 1')).rows[0];
  if (config) state.config = config.config;
  return upgradeState(state);
}

async function save(client, state, replace) {
  for (const name of [...tableNames].reverse()) {
    if (replace) await client.query('DELETE FROM ' + table(name));
    else await client.query('DELETE FROM ' + table(name) + ' WHERE NOT (id = ANY($1::int[]))', [state[name].map((row) => row.id)]);
  }
  for (const name of tableNames) {
    if (!state[name].length) continue;
    const columns = Object.keys(tables[name]).map(quote);
    const changes = columns.filter((column) => column !== '"id"');
    await client.query('INSERT INTO ' + table(name) + ' AS stored (' + columns.join(', ') + ') SELECT ' +
      columns.join(', ') + ' FROM jsonb_populate_recordset(NULL::' + table(name) + ', $1::jsonb)' +
      ' ON CONFLICT (id) DO UPDATE SET ' + changes.map((column) => column + ' = EXCLUDED.' + column).join(', ') +
      ' WHERE (' + changes.map((column) => 'stored.' + column).join(', ') + ') IS DISTINCT FROM (' +
      changes.map((column) => 'EXCLUDED.' + column).join(', ') + ')', [JSON.stringify(state[name])]);
  }
  await client.query('INSERT INTO tourvista.settings (id, config) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config', [JSON.stringify(state.config)]);
}

export async function createPostgresStore({ pool, connectionString = process.env.DATABASE_URL } = {}) {
  if (!pool) {
    if (!connectionString) throw new Error('Configure the Supabase DATABASE_URL.');
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
    for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    const ca = process.env.POSTGRES_CA_CERT?.replaceAll('\\n', '\n');
    pool = new Pool({
      connectionString: url.href, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000,
    });
    pool.on('error', (error) => console.warn('Postgres idle connection closed: ' + (error.code || error.name)));
  }
  async function withClient(operation, begin) {
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query(begin);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  }
  try {
    await withClient(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(194711170)');
      await client.query(schema);
      if (hasSampleRecords(await load(client))) throw new Error('Use an empty capstone database or approved capstone records.');
    }, 'BEGIN');
  } catch (error) { await pool.end(); throw error; }
  const sessionStore = {
    async get(token) {
      return (await pool.query('SELECT "userId", csrf, expires FROM tourvista.sessions WHERE token = $1', [token])).rows[0];
    },
    set(token, entry) {
      return pool.query('INSERT INTO tourvista.sessions (token, "userId", csrf, expires) VALUES ($1, $2, $3, $4)', [token, entry.userId, entry.csrf, entry.expires]);
    },
    delete: (token) => pool.query('DELETE FROM tourvista.sessions WHERE token = $1', [token]),
    revokeUser: (userId) => pool.query('DELETE FROM tourvista.sessions WHERE "userId" = $1', [userId]),
    prune: () => pool.query('DELETE FROM tourvista.sessions WHERE expires <= $1', [Date.now()]),
  };
  return {
    mode: 'postgres', pool, sessionStore,
    read: () => withClient(load, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    mutate(operation, { replace = false, preserveBefore = false } = {}) {
      return withClient(async (client) => {
        await client.query('SELECT id FROM tourvista.app_lock WHERE id = 1 FOR UPDATE');
        const state = await load(client);
        if (preserveBefore) await client.query('INSERT INTO tourvista.recovery (id, snapshot) VALUES (1, $1::jsonb) ' +
          'ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot', [JSON.stringify({ version: 2, state })]);
        const result = await operation(state);
        await save(client, state, replace);
        return result;
      }, 'BEGIN');
    },
    close: () => pool.end(),
  };
}
