import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

export function createMailer({ demo = true, directory, env = process.env, transportFactory = nodemailer.createTransport } = {}) {
  const mode = env.MAIL_MODE || (env.SMTP_HOST ? 'smtp' : demo ? 'preview' : 'unavailable');
  if (!['preview', 'smtp', 'unavailable'].includes(mode)) throw new Error('MAIL_MODE must be smtp or unavailable (preview is reserved for development fixtures).');
  const url = new URL(env.APP_URL || 'http://127.0.0.1:5173');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['https:', 'http:'].includes(url.protocol) || (url.protocol !== 'https:' && !local)) throw new Error('APP_URL must be the trusted HTTPS website origin, or local HTTP for development.');
  if (mode === 'preview' && !local) throw new Error('Preview emails are allowed only for local development. Configure SMTP for online use.');
  if (mode === 'preview' && !directory) throw new Error('A private preview folder is required.');
  const from = env.MAIL_FROM || (mode === 'preview' ? 'TourVista <no-reply@tourvista.test>' : '');
  if (mode !== 'unavailable' && (!from || /[\r\n]/.test(from))) throw new Error('Configure a valid MAIL_FROM sender.');
  let transport;
  if (mode === 'smtp') {
    const port = Number(env.SMTP_PORT || 587);
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.');
    transport = transportFactory({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true });
  }
  return { mode, origin: url.origin,
    async verify() { if (transport) await transport.verify(); return { mode }; },
    close() { transport?.close(); },
    async send({ to, subject, text }) {
      if (mode === 'unavailable') throw new Error('Email delivery is not configured.');
      if (mode === 'preview') {
        await mkdir(directory, { recursive: true });
        const file = `${Date.now()}-${randomBytes(8).toString('hex')}.txt`;
        await writeFile(join(directory, file), `LOCAL TEST EMAIL — NOT SENT\nTo: ${to}\nFrom: ${from}\nSubject: ${subject}\n\n${text}\n`, { flag: 'wx', mode: 0o600 });
      } else {
        const info = await transport.sendMail({ from, to, subject, text });
        if (!info.accepted?.length) throw new Error('The email provider did not accept this message.');
      }
    }
  };
}

export function createMailQueue(mailer, onFailure, extendLifetime) {
  const pending = new Set();
  return {
    push(message) {
      if (mailer.mode === 'unavailable') return;
      const { to, subject, text } = message;
      const task = Promise.resolve()
        .then(() => mailer.send({ to, subject, text }))
        .catch((error) => onFailure(message, error))
        .catch(() => {})
        .finally(() => pending.delete(task));
      pending.add(task);
      extendLifetime?.(task);
    },
    async waitForEmails() { await Promise.allSettled([...pending]); },
  };
}

export function mailFailureHint(error) {
  if (error?.code === 'EAUTH') return 'Gmail rejected the sender sign-in. Use a Google App Password from an account with 2-Step Verification; your normal Gmail password will not work.';
  if (['ETIMEDOUT', 'ECONNECTION', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code)) return 'Could not connect to the email server. Check your internet connection, SMTP host and port, then try again.';
  if (error?.code === 'ESOCKET') return 'The secure email connection failed. Check the SMTP settings, network and computer clock.';
  return 'The email could not be sent. Run npm.cmd run email:check in the project terminal to check the sender settings.';
}
