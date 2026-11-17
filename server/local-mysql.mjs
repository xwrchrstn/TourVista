import { readFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv, promisify } from 'node:util';
import mysql from 'mysql2/promise';

const exec = promisify(execFile);
const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
export const envFile = join(serverDirectory, '.env');
export const mysqlDirectory = join(serverDirectory, 'storage', 'mysql-local');
export const mysqlDataDirectory = join(mysqlDirectory, 'data');
export const mysqlAdminFile = join(mysqlDirectory, 'admin.cnf');

export async function readBackendEnv() {
  let source = '';
  try { source = await readFile(envFile, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { ...parseEnv(source), ...process.env };
}

export function mysqlRuntime(env) {
  const base = resolve(mysqlDirectory, env.DB_LOCAL_RUNTIME);
  return { base, server: join(base, 'bin', 'mysqld.exe'), admin: join(base, 'bin', 'mysqladmin.exe') };
}

export function localMysqlOptions(env) {
  const { base } = mysqlRuntime(env);
  return ['--no-defaults', `--basedir=${base}`, `--datadir=${mysqlDataDirectory}`,
    '--bind-address=127.0.0.1', `--port=${env.DB_PORT}`, '--mysqlx=OFF', '--innodb-buffer-pool-size=128M',
    '--max-connections=25', `--log-error=${join(mysqlDirectory, 'server.err')}`];
}

export async function verifyLocalMysql(env) {
  const connection = await mysql.createConnection({
    host: '127.0.0.1', port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD,
    database: env.DB_NAME, connectTimeout: 2000,
  });
  try {
    const [[{ dataDirectory }]] = await connection.query('SELECT @@datadir AS dataDirectory');
    if (resolve(dataDirectory).toLowerCase() !== resolve(mysqlDataDirectory).toLowerCase()) {
      throw new Error('The MySQL port belongs to a different data directory.');
    }
  } finally { await connection.end(); }
}

export async function startLocalMysql(env, extraOptions = []) {
  const { server, admin } = mysqlRuntime(env);
  const child = spawn(server, [...localMysqlOptions(env), ...extraOptions], { stdio: 'ignore', windowsHide: true });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });

  async function close() {
    if (child.exitCode !== null || child.signalCode !== null || spawnError) return;
    try {
      await exec(admin, [`--defaults-file=${mysqlAdminFile}`, 'shutdown'], { windowsHide: true, timeout: 15000 });
    } catch {
      child.kill();
    }
  }

  try {
    for (let attempt = 0; attempt < 75; attempt += 1) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Local MySQL could not start. Check server/storage/mysql-local/server.err.');
      }
      try { await verifyLocalMysql(env); return { close }; }
      catch (error) {
        if (!['ECONNREFUSED', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(error.code)) throw error;
      }
      await delay(400);
    }
    throw new Error('Local MySQL did not become ready. Check server/storage/mysql-local/server.err.');
  } catch (error) {
    await close();
    throw error;
  }
}

export async function ensureLocalMysql(env = undefined) {
  env ??= await readBackendEnv();
  if (!env.DB_LOCAL_RUNTIME || env.DEMO_MODE !== 'false') return null;
  try { await verifyLocalMysql(env); return null; }
  catch (error) { if (error.code !== 'ECONNREFUSED') throw error; }
  return startLocalMysql(env);
}
