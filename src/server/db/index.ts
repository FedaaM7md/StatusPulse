/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export type Db = Database.Database;

export const DEFAULT_SETTINGS: Record<string, string> = {
  site_name_ar: 'ستاتس بالس',
  site_name_en: 'StatusPulse',
  site_description_ar: 'حالة الخدمات والأنظمة المباشرة',
  site_description_en: 'Live status of our services and systems',
  allow_private_targets: '0',
  webhook_enabled: '0',
  webhook_url: '',
  webhook_secret: '',
  public_page_enabled: '1',
};

function hasColumn(db: Db, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(SCHEMA_SQL);

  // Append-only compatibility for databases created before T-001.
  if (!hasColumn(db, 'monitors', 'demo')) {
    db.exec('ALTER TABLE monitors ADD COLUMN demo INTEGER NOT NULL DEFAULT 0');
  }
  for (const column of ['public_name_ar', 'public_name_en', 'public_group_ar', 'public_group_en']) {
    if (!hasColumn(db, 'monitors', column)) {
      db.exec(`ALTER TABLE monitors ADD COLUMN ${column} TEXT`);
    }
  }
  for (const column of ['title_ar', 'title_en']) {
    if (!hasColumn(db, 'maintenance_windows', column)) {
      db.exec(`ALTER TABLE maintenance_windows ADD COLUMN ${column} TEXT`);
    }
  }
  for (const column of ['title_ar', 'title_en', 'summary_ar', 'summary_en']) {
    if (!hasColumn(db, 'incidents', column)) {
      db.exec(`ALTER TABLE incidents ADD COLUMN ${column} TEXT`);
    }
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const seed = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, value);
    }
    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
      String(SCHEMA_VERSION),
    );
  });
  seed();
}

export function closeDb(db: Db): void {
  if (db.open) db.close();
}
