import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseEnv } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMailer, mailFailureHint } from './mail.js';
import { gmailSettings, readPrivateEnv, saveMailSettings } from './gmail-config.js';

const folder = dirname(fileURLToPath(import.meta.url)), path = join(folder, '.env');
let mailer, input;
try {
  const original = await readPrivateEnv(path), previous = parseEnv(original);
  if (process.argv.includes('--check')) {
    const env = { ...previous, ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(MAIL_|SMTP_|APP_URL$|DEMO_MODE$)/.test(key))) };
    mailer = createMailer({ demo: false, env });
    if (mailer.mode !== 'smtp') { console.log('Real email is OFF. Run npm.cmd run email:setup to connect your Gmail sender.'); process.exitCode = 1; }
    else { await mailer.verify(); console.log('SMTP sign-in and secure connection succeeded for TourVista account, reservation and listing emails. This check did not send a message.'); }
  } else {
    if (!process.stdin.isTTY) throw new Error('Run npm.cmd run email:setup directly in your VS Code terminal.');
    console.log('TourVista Gmail sender setup\nUse ONE Gmail account to send verification and reset emails to registered users.\nCreate a Google App Password first: https://myaccount.google.com/apppasswords\nKeep it private. Do not paste passwords in chat. Press Ctrl+C to cancel.\n');
    let hidden = false;
    const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
    input = createInterface({ input: process.stdin, output, terminal: true });
    const abort = new AbortController(); input.on('SIGINT', () => abort.abort());
    const ask = (query) => input.question(query, { signal: abort.signal });
    const sender = await ask('Gmail sender address: ');
    const appUrl = await ask(`Website address [${previous.APP_URL || 'http://127.0.0.1:5173'}]: `);
    process.stdout.write('Google App Password (hidden): '); hidden = true;
    let secret;
    try { secret = await ask(''); } finally { hidden = false; process.stdout.write('\n'); }
    const settings = gmailSettings(sender, secret, appUrl.trim() || previous.APP_URL || 'http://127.0.0.1:5173'); secret = '';
    const answer = await ask(`Send a test email to ${settings.SMTP_USER} and enable real sending? [y/N]: `);
    input.close(); input = null;
    if (!/^y(es)?$/i.test(answer.trim())) console.log('Cancelled. No email was sent and no settings were changed.');
    else {
      mailer = createMailer({ env: settings });
      console.log('Checking the secure Gmail connection…'); await mailer.verify();
      await mailer.send({ to: settings.SMTP_USER, subject: 'TourVista email connection test', text: 'Your TourVista Gmail sender accepted this test message. After restarting TourVista, this sender handles account, reservation and listing emails.\n\nIf you did not request this setup, revoke the Google App Password.' });
      await saveMailSettings(path, original, settings);
      console.log('Gmail accepted the test email. Check Inbox and Spam.\nPrivate settings were saved in server/.env; no password was printed.\nRestart TourVista: Ctrl+C in its server terminal, then npm.cmd run dev.\nThen use Resend verification email or Forgot password to request a fresh link. Earlier preview emails are not sent automatically.');
    }
  }
} catch (error) {
  console.error(error.name === 'AbortError' ? 'Setup cancelled. No sender settings were saved.' : error.code ? mailFailureHint(error) : error.message);
  process.exitCode = 1;
} finally { input?.close(); mailer?.close(); }
