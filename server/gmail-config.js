import { parseEnv } from 'node:util';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export function gmailSettings(sender, appPassword, appUrl = 'http://127.0.0.1:5173') {
  const email = sender.trim().toLowerCase(), secret = appPassword.replace(/\s/g, '');
  if (email.length > 160 || !/^[^\s@<>"\r\n]+@[^\s@<>"\r\n]+\.[^\s@<>"\r\n]+$/.test(email)) throw new Error('Enter the email address of your Gmail or Google Workspace sender account.');
  if (!/^[A-Za-z0-9]{16}$/.test(secret)) throw new Error('Use the 16-character Google App Password. It is different from your Gmail sign-in password.');
  const url = new URL(appUrl.trim());
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !local)) throw new Error('Use your website HTTPS origin, or http://127.0.0.1:5173 for local testing.');
  return { MAIL_MODE: 'smtp', APP_URL: url.origin, MAIL_FROM: `TourVista <${email}>`, SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: email, SMTP_PASS: secret };
}
export function mergeMailSettings(source, settings) {
  const written = new Set(), lines = [];
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key && Object.hasOwn(settings, key)) { if (!written.has(key)) lines.push(`${key}=${JSON.stringify(settings[key])}`); written.add(key); }
    else lines.push(line);
  }
  for (const [key, value] of Object.entries(settings)) if (!written.has(key)) lines.push(`${key}=${JSON.stringify(value)}`);
  return lines.join('\n').trimEnd() + '\n';
}
export async function readPrivateEnv(path) { try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } }
export async function saveMailSettings(path, original, settings) {
  const latest = await readPrivateEnv(path), before = parseEnv(original), now = parseEnv(latest);
  if (Object.keys(settings).some((key) => before[key] !== now[key])) throw new Error('Email settings changed during setup. Run setup again to avoid overwriting those changes.');
  const folder = join(dirname(path), 'storage', 'mail-setup'); await mkdir(folder, { recursive: true });
  const temp = join(folder, randomBytes(16).toString('hex') + '.tmp');
  try { await writeFile(temp, mergeMailSettings(latest, settings), { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
