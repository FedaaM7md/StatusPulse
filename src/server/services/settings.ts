/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type { AppSettings } from '../../shared/types';

const KEY_MAP: Record<keyof AppSettings, string> = {
  siteNameAr: 'site_name_ar',
  siteNameEn: 'site_name_en',
  siteDescriptionAr: 'site_description_ar',
  siteDescriptionEn: 'site_description_en',
  allowPrivateTargets: 'allow_private_targets',
  webhookEnabled: 'webhook_enabled',
  webhookUrl: 'webhook_url',
  webhookSecret: 'webhook_secret',
  publicPageEnabled: 'public_page_enabled',
};

export function getSettings(db: Db): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    siteNameAr: map.get('site_name_ar') ?? 'ستاتس بالس',
    siteNameEn: map.get('site_name_en') ?? 'StatusPulse',
    siteDescriptionAr: map.get('site_description_ar') ?? '',
    siteDescriptionEn: map.get('site_description_en') ?? '',
    allowPrivateTargets: map.get('allow_private_targets') === '1',
    webhookEnabled: map.get('webhook_enabled') === '1',
    webhookUrl: map.get('webhook_url') ?? '',
    webhookSecret: map.get('webhook_secret') ?? '',
    publicPageEnabled: map.get('public_page_enabled') !== '0',
  };
}

export function updateSettings(db: Db, patch: Partial<AppSettings>): AppSettings {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const write = db.transaction(() => {
    for (const [key, value] of Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>) {
      const column = KEY_MAP[key];
      if (!column || value === undefined) continue;
      const serialized = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
      upsert.run(column, serialized);
    }
  });
  write();
  return getSettings(db);
}

export function isPrivateTargetsAllowed(db: Db): boolean {
  return getSettings(db).allowPrivateTargets;
}
