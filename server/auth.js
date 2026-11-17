import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, parameters);
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hex] = stored.split(':');
  const expected = Buffer.from(hex, 'hex');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64, parameters);
  return timingSafeEqual(actual, expected);
}
export const publicUser = (user) => user ? ({ id: user.id, name: user.name, email: user.email,
  role: user.role, active: Boolean(user.active), verified: Boolean(user.verified), emailVerified: Boolean(user.emailVerified), emailVerificationRequired: Boolean(user.emailVerificationRequired) }) : null;

export function createSessions({ secureCookies = false, sessionStore } = {}) {
  const sessions = new Map();
  const store = sessionStore || {
    get: (key) => sessions.get(key),
    set: (key, entry) => sessions.set(key, entry),
    delete: (key) => sessions.delete(key),
    revokeUser(userId) { for (const [key, entry] of sessions) if (entry.userId === userId) sessions.delete(key); },
    prune() { for (const [key, entry] of sessions) if (entry.expires <= Date.now()) sessions.delete(key); },
  };
  const digest = (token) => createHash('sha256').update(token).digest('hex');
  const age = 8 * 60 * 60 * 1000;
  async function issue(res, userId = null) {
    const token = randomBytes(32).toString('hex');
    const entry = { userId, csrf: randomBytes(24).toString('hex'), expires: Date.now() + age };
    await store.set(digest(token), entry);
    res.cookie('tourvista_session', token, { httpOnly: true, sameSite: 'strict', secure: secureCookies, maxAge: age, path: '/' });
    return { token, ...entry };
  }
  return {
    async middleware(req, res, next) {
      const cookie = (req.headers.cookie || '').split(';').map((item) => item.trim())
        .find((item) => item.startsWith('tourvista_session='))?.slice('tourvista_session='.length);
      const token = /^[a-f0-9]{64}$/.test(cookie || '') ? cookie : null;
      const key = token && digest(token);
      const entry = key && await store.get(key);
      if (entry && entry.expires > Date.now()) req.session = { token, ...entry };
      else { if (entry) await store.delete(key); req.session = await issue(res); }
      next();
    },
    async rotate(req, res, userId = null) {
      await store.delete(digest(req.session.token));
      req.session = await issue(res, userId);
    },
    revokeUser: (userId) => store.revokeUser(userId),
    prune: () => store.prune(),
  };
}
