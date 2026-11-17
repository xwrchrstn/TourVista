import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { defaultProfile } from '../shared/listing-profile.js';
import { hashPassword } from './auth.js';
import { demoCampsites } from './data.js';
import { defaultWeatherConfig, todayManila } from './features.js';

const text = (size = 255) => `VARCHAR(${size})`;
export const tables = {
  users: { id: 'INT PRIMARY KEY', name: text(100), email: 'VARCHAR(160) UNIQUE', passwordHash: text(200), role: text(20), active: 'BOOLEAN', verified: 'BOOLEAN', emailVerified: 'BOOLEAN', emailVerificationRequired: 'BOOLEAN' },
  campsites: { id: 'INT PRIMARY KEY', ownerId: 'INT', name: text(120), description: 'TEXT', price: 'DOUBLE', latitude: 'DOUBLE', longitude: 'DOUBLE', amenities: 'JSON', polygon: 'JSON', rules: 'TEXT', imageUrl: text(1000), active: 'BOOLEAN', approvalStatus: text(20), revision: 'INT', reviewId: 'INT', demoListing: 'BOOLEAN', moderationNote: 'TEXT', profile: 'JSON' },
  units: { id: 'INT PRIMARY KEY', campId: 'INT', name: text(100), capacity: 'INT', active: 'BOOLEAN' },
  reservations: { id: 'INT PRIMARY KEY', unitId: 'INT', userId: 'INT', start: 'VARCHAR(10)', end: 'VARCHAR(10)', partySize: 'INT', status: text(20), createdAt: text(40), requestKey: text(100), contactName: text(100), contactEmail: text(160), contactPhone: text(30), unitPrice: 'DOUBLE', updatedAt: text(40), campSnapshot: 'JSON' },
  closures: { id: 'INT PRIMARY KEY', unitId: 'INT', start: 'VARCHAR(10)', end: 'VARCHAR(10)', reason: text(300), active: 'BOOLEAN' },
  reviews: { id: 'INT PRIMARY KEY', reservationId: 'INT UNIQUE', userId: 'INT', rating: 'INT', text: 'TEXT', visible: 'BOOLEAN', createdAt: text(40) },
  itineraries: { id: 'INT PRIMARY KEY', userId: 'INT UNIQUE', stops: 'JSON' },
  checkins: { id: 'INT PRIMARY KEY', reservationId: 'INT UNIQUE', actorId: 'INT', method: text(30), accuracy: 'DOUBLE', reason: text(300), createdAt: text(40) },
  audit: { id: 'INT PRIMARY KEY', actorId: 'INT', action: text(80), recordId: 'INT', createdAt: text(40) },
  resetRequests: { id: 'INT PRIMARY KEY', userId: 'INT', tokenHash: text(100), expires: 'DOUBLE', resolved: 'BOOLEAN', createdAt: text(40) },
  forecasts: { id: 'INT PRIMARY KEY', campId: 'INT', start: text(10), end: text(10), fetchedAt: text(40), version: text(100), snapshot: 'JSON' },
  ownershipSubmissions: { id: 'INT PRIMARY KEY', campId: 'INT', ownerId: 'INT', revision: 'INT', status: text(20), legalName: text(160), documentType: text(100), statement: 'TEXT', documents: 'JSON', listingSnapshot: 'JSON', submittedAt: text(40), reviewedAt: text(40), reviewedBy: 'INT', reason: 'TEXT' },
  campsitePhotos: { id: 'INT PRIMARY KEY', campId: 'INT', ownerId: 'INT', file: 'JSON', createdAt: text(40) },
  emailVerifications: { id: 'INT PRIMARY KEY', userId: 'INT', email: text(160), tokenHash: text(64), expires: 'DOUBLE', resolved: 'BOOLEAN', createdAt: text(40) },
  rankings: { id: 'INT PRIMARY KEY', userId: 'INT', createdAt: text(40), details: 'JSON' }
};
export const foreignKeys = {
  emailVerifications: ['userId', 'users'], campsites: ['ownerId', 'users'], units: ['campId', 'campsites'], reservations: ['unitId', 'units'],
  closures: ['unitId', 'units'], reviews: ['reservationId', 'reservations'], itineraries: ['userId', 'users'],
  campsitePhotos: ['campId', 'campsites'], ownershipSubmissions: ['campId', 'campsites'], checkins: ['reservationId', 'reservations'], forecasts: ['campId', 'campsites']
};
export const schemaSql = [
  'CREATE TABLE IF NOT EXISTS app_lock (id INT PRIMARY KEY) ENGINE=InnoDB',
  'INSERT IGNORE INTO app_lock (id) VALUES (1)',
  'CREATE TABLE IF NOT EXISTS settings (id INT PRIMARY KEY, config JSON NOT NULL) ENGINE=InnoDB',
  ...Object.entries(tables).map(([name, columns]) => {
    const definitions = Object.entries(columns).map(([key, type]) => `\`${key}\` ${type}`);
    if (foreignKeys[name]) { const [key, parent] = foreignKeys[name]; definitions.push(`FOREIGN KEY (\`${key}\`) REFERENCES \`${parent}\`(id)`); }
    if (name === 'reservations') definitions.push('UNIQUE KEY request_identity (userId, requestKey)', 'INDEX unit_dates (unitId, start, end)');
    return `CREATE TABLE IF NOT EXISTS \`${name}\` (${definitions.join(', ')}) ENGINE=InnoDB`;
  })
];
export const nextId = (state, table) => Math.max(0, ...state[table].map((row) => row.id)) + 1;
export function upgradeState(state) {
  // Version-2 snapshots and existing local data remain usable after the flow update.
  if (!state || !Array.isArray(state.reservations)) return state;
  state.ownershipSubmissions ??= [];
  state.campsitePhotos ??= [];
  state.emailVerifications ??= [];
  for (const user of state.users || []) { user.emailVerified ??= false; user.emailVerificationRequired ??= false; }
  for (const camp of state.campsites || []) {
    // Only exact fictional seed records qualify for the demo exception. Real legacy listings enter review.
    const seeded = demoCampsites.some((sample) => sample.id === camp.id && sample.name === camp.name && sample.latitude === camp.latitude && sample.longitude === camp.longitude) && state.users?.some((user) => user.id === camp.ownerId && user.email === 'owner@tourvista.test');
    camp.demoListing ??= seeded;
    camp.approvalStatus ??= camp.adminHidden ? 'suspended' : seeded ? 'approved' : 'draft';
    if (camp.profile == null) camp.profile = defaultProfile();
    else if (typeof camp.profile === 'object' && !Array.isArray(camp.profile)) camp.profile = { ...defaultProfile(), ...camp.profile };
    camp.revision ??= 1; camp.reviewId ??= 0; camp.moderationNote ??= '';
  }
  for (const booking of state.reservations) {
    if (!booking || typeof booking !== 'object') continue;
    const user = Array.isArray(state.users) ? state.users.find((row) => row?.id === booking.userId) : null;
    const unit = Array.isArray(state.units) ? state.units.find((row) => row?.id === booking.unitId) : null;
    const camp = Array.isArray(state.campsites) ? state.campsites.find((row) => row?.id === unit?.campId) : null;
    booking.campSnapshot ??= camp ? Object.fromEntries(['id', 'ownerId', 'name', 'description', 'price', 'latitude', 'longitude', 'amenities', 'polygon', 'rules', 'imageUrl', 'active', 'demoListing'].map((key) => [key, structuredClone(camp[key])])) : {};
    booking.contactName ??= user?.name || '';
    booking.contactEmail ??= user?.email || '';
    booking.contactPhone ??= '';
    booking.unitPrice ??= camp?.price ?? 0;
    booking.updatedAt ??= booking.createdAt;
  }
  return state;
}
export function audit(state, actorId, action, recordId = null) {
  state.audit.push({ id: nextId(state, 'audit'), actorId, action, recordId, createdAt: new Date().toISOString() });
}

export function emptyState() {
  const state = Object.fromEntries(Object.keys(tables).map((name) => [name, []]));
  state.config = { ...defaultWeatherConfig };
  return state;
}

const sampleEmails = new Set(['admin@tourvista.test', 'owner@tourvista.test', 'tourist@tourvista.test']);
export const isSampleEmail = (email) => sampleEmails.has(email);
export function hasSampleRecords(state) {
  return state.users.some((user) => isSampleEmail(user.email)) || state.campsites.some((camp) => camp.demoListing) ||
    state.reservations.some((booking) => booking.campSnapshot?.demoListing) || state.checkins.some((checkin) => checkin.method === 'demo');
}

function importLocalRecords(legacy) {
  const state = emptyState();
  state.config = legacy.config || state.config;
  state.users = legacy.users.filter((user) => !sampleEmails.has(user.email));
  const userIds = new Set(state.users.map((user) => user.id));
  state.campsites = legacy.campsites.filter((camp) => !camp.demoListing && userIds.has(camp.ownerId));
  const campIds = new Set(state.campsites.map((camp) => camp.id));
  state.units = legacy.units.filter((unit) => campIds.has(unit.campId));
  const unitIds = new Set(state.units.map((unit) => unit.id));
  state.reservations = legacy.reservations.filter((booking) => userIds.has(booking.userId) && unitIds.has(booking.unitId) && !booking.campSnapshot?.demoListing);
  const reservationIds = new Set(state.reservations.map((booking) => booking.id));
  state.closures = legacy.closures.filter((row) => unitIds.has(row.unitId));
  state.reviews = legacy.reviews.filter((row) => reservationIds.has(row.reservationId) && userIds.has(row.userId));
  state.checkins = legacy.checkins.filter((row) => reservationIds.has(row.reservationId) && userIds.has(row.actorId) && row.method !== 'demo');
  state.campsitePhotos = legacy.campsitePhotos.filter((row) => campIds.has(row.campId) && userIds.has(row.ownerId));
  state.itineraries = legacy.itineraries.filter((row) => userIds.has(row.userId))
    .map((row) => ({ ...row, stops: row.stops.filter((stop) => campIds.has(stop.campId)) }));
  state.ownershipSubmissions = legacy.ownershipSubmissions.filter((row) => campIds.has(row.campId) && userIds.has(row.ownerId));
  for (const camp of state.campsites) {
    const review = state.ownershipSubmissions.find((row) => row.id === camp.reviewId);
    if (camp.approvalStatus === 'approved' && (!review || !userIds.has(review.reviewedBy))) {
      camp.approvalStatus = 'draft';
      camp.reviewId = 0;
      camp.moderationNote = 'Submit this campsite for review by your TourVista administrator.';
    }
  }
  for (const user of state.users) {
    const verification = legacy.audit.filter((row) => row.actorId === user.id &&
      ['Confirmed email in local test mode', 'Verified email address'].includes(row.action)).at(-1);
    if (verification?.action === 'Confirmed email in local test mode') user.emailVerified = false;
    if (user.role !== 'admin') user.emailVerificationRequired = true;
  }
  audit(state, null, 'Imported existing accounts and campsite records');
  return state;
}

async function seedState() {
  const state = emptyState();
  for (const [index, role] of ['admin', 'owner', 'tourist'].entries()) {
    state.users.push({ id: index + 1, name: `${role[0].toUpperCase()}${role.slice(1)} Demo`, email: `${role}@tourvista.test`,
      passwordHash: await hashPassword(process.env.SEED_PASSWORD || 'TourVista123!'), role, active: true, verified: true, emailVerified: true, emailVerificationRequired: false });
  }
  state.campsites = demoCampsites.map((camp) => ({ ...camp, ownerId: 2, active: true, rules: 'Sample rules: respect quiet hours and leave no litter.', imageUrl: '',
    polygon: [{ latitude: camp.latitude - 0.001, longitude: camp.longitude - 0.001 },
      { latitude: camp.latitude - 0.001, longitude: camp.longitude + 0.001 },
      { latitude: camp.latitude + 0.001, longitude: camp.longitude + 0.001 },
      { latitude: camp.latitude + 0.001, longitude: camp.longitude - 0.001 }] }));
  state.campsites.forEach((camp) => {
    state.units.push({ id: camp.id * 2 - 1, campId: camp.id, name: 'Tent pitch A', capacity: 4, active: true },
      { id: camp.id * 2, campId: camp.id, name: 'Group pitch B', capacity: 8, active: true });
  });
  const dateOffset = (days) => new Date(Date.parse(todayManila()) + days * 86400000).toISOString().slice(0, 10);
  state.reservations = [
    { id: 1, unitId: 1, userId: 3, start: dateOffset(-7), end: dateOffset(-5), partySize: 2, status: 'completed', createdAt: new Date().toISOString(), requestKey: 'seed-completed' },
    { id: 2, unitId: 3, userId: 3, start: dateOffset(0), end: dateOffset(1), partySize: 2, status: 'confirmed', createdAt: new Date().toISOString(), requestKey: 'seed-current' },
    { id: 3, unitId: 5, userId: 3, start: dateOffset(7), end: dateOffset(9), partySize: 2, status: 'pending', createdAt: new Date().toISOString(), requestKey: 'seed-pending' }
  ];
  state.itineraries.push({ id: 1, userId: 3, stops: [] });
  audit(state, 1, 'Initialized fictional local demo');
  return upgradeState(state);
}

export async function createStore(options = {}) {
  const mode = options.mode ?? (options.demo === true ? 'demo'
    : process.env.DATABASE_URL ? 'postgres' : options.demo === false || process.env.DEMO_MODE === 'false' ? 'mysql' : 'local');
  if (mode === 'postgres') return (await import('./postgres-store.js')).createPostgresStore(options);
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'storage');
  if (mode !== 'mysql') {
    const path = options.path || join(directory, mode === 'demo' ? 'demo.json' : 'capstone.json');
    await mkdir(dirname(path), { recursive: true });
    let state;
    try { state = upgradeState(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (mode === 'demo') state = await seedState();
      else {
        state = emptyState();
        const legacyPath = options.legacyPath ?? (!options.path ? join(directory, 'demo.json') : null);
        if (legacyPath) {
          try { state = importLocalRecords(upgradeState(JSON.parse(await readFile(legacyPath, 'utf8')))); }
          catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
        }
      }
      await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    }
    if (mode === 'local' && hasSampleRecords(state)) throw new Error('The capstone data file contains sample records. Use a clean capstone store.');
    let tail = Promise.resolve();
    return {
      mode, mailPreviewDirectory: join(dirname(path), 'mail-preview'),
      async read() { await tail.catch(() => {}); return structuredClone(state); },
      mutate(operation) {
        const task = tail.catch(() => {}).then(async () => {
          const draft = structuredClone(state);
          const result = await operation(draft);
          await writeFile(path + '.tmp', JSON.stringify(draft));
          await rename(path + '.tmp', path);
          state = draft;
          return result;
        });
        tail = task; return task;
      },
      async close() { await tail.catch(() => {}); }
    };
  }
  const pool = mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'tourvista_dev',
    connectionLimit: 5, connectTimeout: 5000 });
  const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
  async function load(connection) {
    const state = {};
    for (const [name, columns] of Object.entries(tables)) {
      const [rows] = await connection.query(`SELECT * FROM \`${name}\` ORDER BY id`);
      state[name] = rows.map((row) => Object.fromEntries(Object.entries(columns).map(([key, type]) =>
        [key, type === 'JSON' ? json(row[key]) : type === 'BOOLEAN' ? (row[key] == null ? null : Boolean(row[key])) : row[key]])));
    }
    const [settings] = await connection.query('SELECT config FROM settings WHERE id = 1');
    state.config = settings.length ? json(settings[0].config) : { ...defaultWeatherConfig };
    return upgradeState(state);
  }
  async function save(connection, state, replace = false) {
    // Restore can remove records. Delete absent children before their parents, under the same transaction.
    for (const name of Object.keys(tables).reverse()) {
      if (replace) { await connection.query(`DELETE FROM \`${name}\``); continue; }
      const [existing] = await connection.query(`SELECT id FROM \`${name}\``);
      const missing = existing.map((row) => row.id).filter((id) => !state[name].some((row) => row.id === id));
      if (missing.length) await connection.execute(`DELETE FROM \`${name}\` WHERE id IN (${missing.map(() => '?').join(',')})`, missing);
    }
    for (const [name, columns] of Object.entries(tables)) {
      const keys = Object.keys(columns), quoted = keys.map((key) => `\`${key}\``);
      const update = keys.filter((key) => key !== 'id').map((key) => `\`${key}\`=VALUES(\`${key}\`)`).join(',');
      for (const row of state[name]) await connection.execute(
        `INSERT INTO \`${name}\` (${quoted.join(',')}) VALUES (${keys.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${update}`,
        keys.map((key) => row[key] === undefined ? null : columns[key] === 'JSON' ? JSON.stringify(row[key]) : row[key])
      );
    }
    await connection.execute('INSERT INTO settings (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config=VALUES(config)', [JSON.stringify(state.config)]);
  }
  try {
  for (const statement of schemaSql) await pool.query(statement);
  // CREATE TABLE does not add new columns to an already initialized database.
  const [reservationColumns] = await pool.query('SHOW COLUMNS FROM reservations');
  for (const column of ['contactName', 'contactEmail', 'contactPhone', 'unitPrice', 'updatedAt', 'campSnapshot']) {
    if (!reservationColumns.some((item) => item.Field === column)) {
      await pool.query(`ALTER TABLE reservations ADD COLUMN \`${column}\` ${tables.reservations[column]} NULL`);
    }
  }
  const [campColumns] = await pool.query('SHOW COLUMNS FROM campsites');
  for (const column of ['approvalStatus', 'revision', 'reviewId', 'demoListing', 'moderationNote', 'profile']) {
    if (!campColumns.some((item) => item.Field === column)) await pool.query(`ALTER TABLE campsites ADD COLUMN \`${column}\` ${tables.campsites[column]} NULL`);
  }
  const [userColumns] = await pool.query('SHOW COLUMNS FROM users');
  for (const column of ['emailVerified', 'emailVerificationRequired']) if (!userColumns.some((item) => item.Field === column)) await pool.query(`ALTER TABLE users ADD COLUMN \`${column}\` BOOLEAN NULL`);
  const initial = await pool.getConnection();
  try {
    await initial.beginTransaction();
    await initial.query('SELECT id FROM app_lock WHERE id = 1 FOR UPDATE');
    const [users] = await initial.query('SELECT id FROM users LIMIT 1');
    if (!users.length) await save(initial, emptyState());
    else if (hasSampleRecords(await load(initial))) throw new Error('This MySQL database contains sample records. Choose a fresh capstone database in server/.env.');
    await initial.commit();
  } catch (error) { await initial.rollback(); throw error; } finally { initial.release(); }
  } catch (error) { await pool.end(); throw error; }
  return {
    mode: 'mysql',
    async read() {
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const state = await load(connection); await connection.commit(); return state; }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async mutate(operation, { replace = false } = {}) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // Coarse serialization keeps every update consistent in this local prototype.
        // Lock unit rows too; approvals, closures, cancellation and date changes use this same transaction path.
        await connection.query('SELECT id FROM app_lock WHERE id = 1 FOR UPDATE');
        await connection.query('SELECT id FROM units ORDER BY id FOR UPDATE');
        const state = await load(connection), result = await operation(state);
        await save(connection, state, replace); await connection.commit(); return result;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    close: () => pool.end()
  };
}
