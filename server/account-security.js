import { randomBytes, createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';
import { audit, nextId } from './storage.js';

const digest = (token) => createHash('sha256').update(token).digest('hex');
export function requireVerifiedEmail(user) {
  if (user.emailVerificationRequired && !user.emailVerified) { const error = new Error('Verify your email from Account settings before booking or submitting a listing.'); error.status = 403; throw error; }
}
export function installAccountSecurity(app, store, sessions, mailer, { actor, requireThat, email, password, throttle, mailQueue }) {
  const limits = new Map();
  function queue(user, subject, message) {
    mailQueue.push({ to: user.email, subject, text: message, userId: user.id, recordId: user.id, type: 'Account' });
  }
  function limit(req, key, max = 5) {
    const now = Date.now();
    for (const [id, value] of limits) if (value.until <= now) limits.delete(id);
    for (const [id, cap] of [[`ip:${req.ip}`, 50], [`action:${key}`, max]]) {
      const value = limits.get(id) || { count: 0, until: now + 900000 }; value.count++; limits.set(id, value);
      requireThat(value.count <= cap, 'Too many account requests. Try again in 15 minutes.', 429);
    }
  }
  async function issueVerification(userId) {
    const token = randomBytes(32).toString('hex');
    const user = await store.mutate((state) => {
      const current = state.users.find((row) => row.id === userId && row.active);
      requireThat(current, 'Please sign in.', 401);
      if (current.emailVerified) return null;
      for (const row of state.emailVerifications) if (row.userId === userId) row.resolved = true;
      state.emailVerifications.push({ id: nextId(state, 'emailVerifications'), userId, email: current.email, tokenHash: digest(token), expires: Date.now() + 86400000, resolved: false, createdAt: new Date().toISOString() });
      audit(state, userId, 'Requested email verification', userId); return current;
    });
    if (user) queue(user, 'Verify your TourVista email', `Welcome to TourVista.\n\nConfirm this email address using the link below, then choose Verify email on the page:\n${mailer.origin}/#/verify-email?token=${token}\n\nThis one-use link expires in 24 hours. If you did not request this account, ignore this message. ${mailer.mode === 'preview' ? 'This is a local test and does not prove real mailbox ownership.' : ''}`);
  }
  app.post('/api/auth/resend-verification', async (req, res) => {
    const user = actor(req.state, req); limit(req, `verify:${user.id}`);
    requireThat(user.emailVerified || mailer.mode !== 'unavailable', 'Email delivery is currently unavailable. Please try again later.', 503);
    await issueVerification(user.id);
    res.json({ message: user.emailVerified ? 'Your email is already verified.' : mailer.mode === 'preview' ? 'A local verification email was prepared in server/storage/mail-preview. No email was sent.' : 'A verification email was queued. Check your inbox and spam folder.' });
  });
  app.post('/api/auth/verify-email', async (req, res) => {
    limit(req, `verify-token:${req.ip}`, 20);
    requireThat(typeof req.body.token === 'string' && /^[a-f0-9]{64}$/.test(req.body.token), 'Verification link is invalid or expired.');
    await store.mutate((state) => {
      const row = state.emailVerifications.find((item) => item.tokenHash === digest(req.body.token) && !item.resolved && item.expires > Date.now());
      const user = row && state.users.find((item) => item.id === row.userId && item.active && item.email === row.email);
      requireThat(user, 'Verification link is invalid or expired.');
      user.emailVerified = true;
      for (const item of state.emailVerifications) if (item.userId === user.id) item.resolved = true;
      audit(state, user.id, mailer.mode === 'preview' ? 'Confirmed email in local test mode' : 'Verified email address', user.id);
    });
    res.json({ message: mailer.mode === 'preview' ? 'Email confirmed for this local test. You can now continue using TourVista.' : 'Your email is verified. You can now sign in and continue.' });
  });
  app.post('/api/auth/request-reset', async (req, res) => {
    requireThat(mailer.mode !== 'unavailable', 'Password reset email is currently unavailable. Please try again later.', 503);
    throttle(req); const address = email(req.body.email); limit(req, `reset:${address}`);
    const token = randomBytes(32).toString('hex');
    const user = await store.mutate((state) => {
      const current = state.users.find((row) => row.email === address && row.active); if (!current) return null;
      const last = state.resetRequests.filter((row) => row.userId === current.id).at(-1);
      if (last && !last.resolved && last.tokenHash && Date.now() - Date.parse(last.createdAt) < 60000) return null;
      for (const row of state.resetRequests) if (row.userId === current.id) row.resolved = true;
      state.resetRequests.push({ id: nextId(state, 'resetRequests'), userId: current.id, tokenHash: digest(token), expires: Date.now() + 900000, resolved: false, createdAt: new Date().toISOString() });
      audit(state, null, 'Requested password reset email', current.id); return current;
    });
    if (user) queue(user, 'Reset your TourVista password', `Reset your password using the link below:\n${mailer.origin}/#/reset?token=${token}\n\nThis one-use link expires in 15 minutes. If you did not request it, ignore this email. Your password has not changed.`);
    res.json({ message: mailer.mode === 'preview' ? 'If an active account matches, a local reset email will appear in server/storage/mail-preview. No email was sent.' : 'If an active account matches, a password-reset email will be sent. Check your inbox and spam folder.' });
  });
  app.post('/api/auth/reset', async (req, res) => {
    limit(req, `reset-token:${req.ip}`, 15);
    requireThat(typeof req.body.token === 'string' && /^[a-f0-9]{64}$/.test(req.body.token), 'Reset link is invalid or expired.');
    const nextPassword = password(req.body.password);
    requireThat(req.body.confirmPassword === nextPassword, 'The new passwords must match.');
    const passwordHash = await hashPassword(nextPassword);
    const user = await store.mutate(async (state) => {
      const row = state.resetRequests.find((item) => item.tokenHash === digest(req.body.token) && !item.resolved && item.expires > Date.now());
      const current = row && state.users.find((item) => item.id === row.userId && item.active);
      requireThat(current, 'Reset link is invalid or expired.');
      requireThat(!(await verifyPassword(nextPassword, current.passwordHash)), 'Choose a password different from your current password.');
      current.passwordHash = passwordHash;
      for (const item of state.resetRequests) if (item.userId === current.id) item.resolved = true;
      audit(state, current.id, 'Reset password', current.id); return current;
    });
    await sessions.revokeUser(user.id); await sessions.rotate(req, res);
    queue(user, 'Your TourVista password changed', 'Your TourVista password was reset. All previous sessions were signed out. If you did not make this change, contact the TourVista administrator immediately.');
    res.json({ message: 'Password updated. Sign in with your new password.', csrf: req.session.csrf });
  });
  app.post('/api/auth/change-password', async (req, res) => {
    const user = actor(req.state, req); limit(req, `change:${user.id}`);
    requireThat(typeof req.body.currentPassword === 'string' && req.body.currentPassword.length <= 128, 'Enter your current password.');
    const nextPassword = password(req.body.password);
    requireThat(nextPassword === req.body.confirmPassword, 'The new passwords must match.');
    const passwordHash = await hashPassword(nextPassword);
    const changed = await store.mutate(async (state) => {
      const current = actor(state, req);
      requireThat(await verifyPassword(req.body.currentPassword, current.passwordHash), 'Your current password is incorrect.');
      requireThat(nextPassword !== req.body.currentPassword, 'Choose a password different from your current password.');
      current.passwordHash = passwordHash;
      for (const row of state.resetRequests) if (row.userId === current.id) row.resolved = true;
      audit(state, current.id, 'Changed own password', current.id); return current;
    });
    await sessions.revokeUser(changed.id); await sessions.rotate(req, res);
    queue(changed, 'Your TourVista password changed', 'Your TourVista password was changed from Account settings. All previous sessions were signed out. If you did not make this change, contact the TourVista administrator immediately.');
    res.json({ message: 'Password changed. Sign in again with your new password.', csrf: req.session.csrf });
  });
  const service = { issueVerification, mode: mailer.mode, waitForEmails: mailQueue.waitForEmails };
  app.locals.accounts = service;
  return service;
}
