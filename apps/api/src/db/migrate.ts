import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { chmodSync, existsSync } from 'node:fs';
import { config, databasePath } from '../config';
import { acquireWriterLock, checkReady } from './lifecycle';

const release = acquireWriterLock();
try {
  if (existsSync(databasePath)) checkReady(true);
  const sqlite = new Database(databasePath);
  try {
    sqlite.pragma('busy_timeout = 15000'); sqlite.pragma('foreign_keys = ON'); sqlite.pragma('journal_mode = WAL');
    migrate(drizzle(sqlite), { migrationsFolder: config.migrations });
    if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok' || (sqlite.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migration integrity check failed');
    chmodSync(databasePath, 0o600);
  } finally { sqlite.close(); }
  checkReady();
  console.log('Drizzle migrations applied; integrity_check=ok; foreign_key_check=0');
} finally { release(); }
