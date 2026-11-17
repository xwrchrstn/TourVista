import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
if (!process.env.npm_execpath) { console.error('Run npm.cmd run setup from the project folder.'); process.exit(1); }
for (const folder of ['server', 'client']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--prefix', join(root, folder), '--workspaces=false', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) { console.error('Dependency setup did not finish. Check the message above.'); process.exit(result.status || 1); }
}
console.log('TourVista dependencies are ready. Run npm.cmd run dev.');
