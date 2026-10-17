import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { assetsPath, config, databasePath, temporaryPath } from '../config';
import { fail } from '../errors';
import * as schema from './schema';
import { type TableName, type Row, type Insert, tables } from './schema';
import { acquireWriterLock, checkReady } from './lifecycle';

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly sqlite: Database.Database;
  readonly orm: BetterSQLite3Database<typeof schema>;
  private readonly release: () => void;
  constructor() {
    checkReady();
    this.release = acquireWriterLock();
    try {
      this.sqlite = new Database(databasePath);
      this.sqlite.pragma('busy_timeout = 15000'); this.sqlite.pragma('foreign_keys = ON'); this.sqlite.pragma('journal_mode = WAL');
      this.orm = drizzle(this.sqlite, { schema });
      mkdirSync(assetsPath, { recursive: true, mode: 0o700 }); mkdirSync(temporaryPath, { recursive: true, mode: 0o700 });
      if (!this.find('settings', 'videoCap') || process.env.VIBEFIELD_VIDEO_SUBMISSION_CAP !== undefined) this.setting('videoCap', config.videoCap);
    } catch (error) { this.release(); throw error; }
  }
  onApplicationShutdown() { this.sqlite.close(); this.release(); }
  transaction<T>(fn: () => T): T { return this.sqlite.transaction(fn).immediate(); }
  all<K extends TableName>(name: K): Row<K>[] { return this.orm.select().from(tables[name]).all() as Row<K>[]; }
  find<K extends TableName>(name: K, key: string): Row<K> | undefined { return this.orm.select().from(tables[name]).where(sql`${tables[name].id} = ${key}`).get() as Row<K> | undefined; }
  get<K extends TableName>(name: K, key: string): Row<K> { return this.find(name, key) ?? fail('NOT_FOUND', `${name} record not found`, 404); }
  insert<K extends TableName>(name: K, value: Insert<K>): Row<K> { this.orm.insert(tables[name]).values(value as never).run(); return this.get(name, value.id); }
  update<K extends TableName>(name: K, key: string, value: Partial<Insert<K>>): Row<K> { this.get(name, key); this.orm.update(tables[name]).set(value as never).where(sql`${tables[name].id} = ${key}`).run(); return this.get(name, key); }
  remove<K extends TableName>(name: K, key: string) { this.get(name, key); this.orm.delete(tables[name]).where(sql`${tables[name].id} = ${key}`).run(); }
  audit(actor: string, entityType: string, entityId: string, action: string, payload: Record<string, unknown> = {}) {
    this.insert('history', { id: id('hst'), at: now(), actor, entityType, entityId, action, payload });
  }
  setting(key: string, value: unknown) { this.orm.insert(schema.settings).values({ id: key, value }).onConflictDoUpdate({ target: schema.settings.id, set: { value } }).run(); }
  settingValue<T>(key: string, fallback: T): T { return (this.find('settings', key)?.value as T | undefined) ?? fallback; }
  budget() {
    const submissions = this.all('submissions').filter(row => row.kind === 'video');
    const cap = this.settingValue('videoCap', 5);
    return { cap, used: submissions.length, remaining: Math.max(0, cap - submissions.length), enabled: config.videoEnabled, submissions };
  }
}
