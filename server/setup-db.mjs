import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalMysql } from './local-mysql.mjs';
const folder = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(folder, '.env'))) process.loadEnvFile(join(folder, '.env'));
process.env.DEMO_MODE = 'false';
const { createStore } = await import('./storage.js');
const localMysql = await ensureLocalMysql(process.env);
try {
  const store = await createStore({ demo: false });
  await store.close();
  console.log('MySQL tables are ready. Run npm.cmd run admin:setup to create the first administrator.');
} finally {
  await localMysql?.close();
}
