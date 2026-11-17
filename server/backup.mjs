import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './storage.js';
import { writeVerifiedBackup } from './recovery.js';
import { ensureLocalMysql } from './local-mysql.mjs';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const settings = resolve(serverDirectory, '.env');
if (existsSync(settings)) process.loadEnvFile(settings);
const directory = resolve(serverDirectory, process.env.TOURVISTA_BACKUP_DIR || 'storage/backups');

let store, localMysql;
try {
  localMysql = await ensureLocalMysql(process.env);
  store = await createStore();
  const { path, bytes } = await writeVerifiedBackup(await store.read(), directory);
  console.log(`Saved a validated ${store.mode} backup to ${path} (${bytes} bytes).`);
  if (bytes > 32 * 1024 * 1024) {
    console.log('This file exceeds the browser restore limit. Use your database recovery procedure for large pilot backups.');
  }
} catch (error) {
  console.error(`Backup failed: ${error.code || 'check the backup directory and database configuration'}.`);
  process.exitCode = 1;
} finally {
  await store?.close();
  await localMysql?.close();
}
