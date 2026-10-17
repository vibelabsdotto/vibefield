import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { existsSync, mkdirSync, openSync, writeFileSync, readFileSync, unlinkSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { config, databasePath } from '../config';

export function acquireWriterLock(): () => void {
  const path = join(config.home, 'writer.lock');
  mkdirSync(config.home, { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('VibeField writer lock is unreadable. Verify no process is running before removing it.');
    try { process.kill(pid, 0); throw new Error('Another VibeField API or migrator owns this data directory. Stop it first.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    unlinkSync(path);
  }
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
  return () => { if (existsSync(path) && readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); };
}
export function checkReady(allowPending = false): void {
  if (!existsSync(databasePath)) throw new Error('Database is not initialized. Run npm run db:migrate first.');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const expected = readMigrationFiles({ migrationsFolder: config.migrations });
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get();
    if (!exists) {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (allowPending && tables.length === 0) return;
      throw new Error('Migration ledger is missing. Run npm run db:migrate.');
    }
    const applied = db.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').all() as Array<{ hash: string; created_at: number }>;
    if (!expected.length || applied.length > expected.length || (!allowPending && applied.length !== expected.length) || applied.some((m, i) => expected[i]?.hash !== m.hash || expected[i]?.folderMillis !== Number(m.created_at))) throw new Error('Database migrations are pending or diverged. Run npm run db:migrate.');
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Database foreign key integrity check failed.');
  } finally { db.close(); }
}
