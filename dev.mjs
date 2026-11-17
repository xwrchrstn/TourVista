import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ensureLocalMysql } from './server/local-mysql.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(join(root, 'client', 'package.json'));
const vite = join(dirname(requireClient.resolve('vite/package.json')), 'bin', 'vite.js');

if (process.argv.includes('--restart')) {
  if (process.platform !== 'win32') {
    console.error('Stop TourVista with Ctrl+C in its running terminal, then run npm run dev.');
    process.exit(1);
  }

  const script = await readFile(new URL('./server/restart-tourvista-dev.ps1', import.meta.url), 'utf8');
  const command = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], {
      env: { ...process.env, TOURVISTA_RESTART_VITE: vite, TOURVISTA_RESTART_LAUNCHER: join(root, 'dev.mjs') }, windowsHide: true,
    });
    if (stdout) process.stdout.write(stdout);
  } catch (error) {
    console.error(error.stdout?.trim() || 'TourVista could not check the running Windows processes.');
    process.exit(1);
  }
}

const localMysql = await ensureLocalMysql();
const children = [
  spawn(process.execPath, ['server.js'], { cwd: join(root, 'server'), stdio: 'inherit' }),
  spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: join(root, 'client'), stdio: 'inherit' })
];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  process.exitCode = code;
  await localMysql?.close();
}
children.forEach((child) => {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 0); });
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
