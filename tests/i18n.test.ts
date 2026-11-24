import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../src/shared/i18n/ar.json';
import en from '../src/shared/i18n/en.json';

const enDict = en as Record<string, string>;
const arDict = ar as Record<string, string>;
const enKeys = Object.keys(enDict).sort();
const arKeys = Object.keys(arDict).sort();

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(full);
  }
  return result;
}

describe('translation files', () => {
  it('have exactly the same keys in Arabic and English', () => {
    expect(arKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(150);
  });

  it('contain no empty values', () => {
    for (const key of enKeys) expect(enDict[key]!.trim().length, key).toBeGreaterThan(0);
    for (const key of arKeys) expect(arDict[key]!.trim().length, key).toBeGreaterThan(0);
  });

  it('use identical placeholders in both languages', () => {
    for (const key of enKeys) {
      expect(placeholders(arDict[key]!), `placeholders for ${key}`).toEqual(placeholders(enDict[key]!));
    }
  });

  it('keep Arabic strings in Arabic script for Arabic-only labels', () => {
    expect(arDict['status.up']).toMatch(/[\u0600-\u06FF]/);
    expect(arDict['login.title']).toMatch(/[\u0600-\u06FF]/);
    expect(arDict['app.tagline']).toMatch(/[\u0600-\u06FF]/);
    expect(arDict['app.name']).toBe('StatusPulse');
  });

  it('does not put the owner’s name into the product title or demo company', () => {
    for (const dict of [arDict, enDict]) {
      expect(dict['app.name']).not.toMatch(/Fedaa|فداء/);
      expect(dict['app.tagline']).not.toMatch(/Fedaa|فداء/);
    }
    expect(arDict['app.credit']).toContain('فداء محمد');
    expect(enDict['app.credit']).toBe('Designed & built by Fedaa Mohamed');
    expect(Object.keys(enDict).filter((key) => key.startsWith('legal.')).length).toBeGreaterThan(30);
    expect(arDict['app.copyright']).toContain('StatusPulse');
    expect(enDict['app.copyright']).toContain('StatusPulse');
  });
});

describe('translation usage', () => {
  it('every literal t()/messageKey key exists in both dictionaries', () => {
    const files = [...walk('src/web'), ...walk('src/server')];
    const used = new Set<string>();
    const patterns = [
      /\bt\(\s*'([a-zA-Z0-9_.]+)'/g,
      /messageKey:\s*'([a-zA-Z0-9_.]+)'/g,
      /\btranslate\([^,]+,\s*'([a-zA-Z0-9_.]+)'/g,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) used.add(match[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(80);
    const missing = [...used].filter((key) => !enDict[key] || !arDict[key]);
    expect(missing).toEqual([]);
  });

  it('covers dynamically composed key families', () => {
    const dynamicKeys = [
      'status.up',
      'status.degraded',
      'status.down',
      'status.maintenance',
      'status.unknown',
      'incidents.status.investigating',
      'incidents.status.identified',
      'incidents.status.monitoring',
      'incidents.status.resolved',
      'incidents.open',
      'incidents.resolved',
      'incidents.all',
      'monitorDetail.range24h',
      'monitorDetail.range7d',
      'monitorDetail.range30d',
      'maintenance.active',
      'maintenance.upcoming',
      'maintenance.past',
      'notifications.level.info',
      'notifications.level.success',
      'notifications.level.warning',
      'notifications.level.error',
      'notifications.event.monitorDown',
      'notifications.event.monitorRecovered',
      'notifications.event.monitorDegraded',
      'notifications.event.incidentUpdate',
      'notifications.event.maintenanceSuppressed',
      'incidents.autoOpened',
      'incidents.resolvedAutomatically',
      'nav.groupMonitor',
      'nav.groupSystem',
      'nav.noc',
      'nav.live',
      'login.previewLabel',
      'login.authEyebrow',
      'settings.publicLabel',
      'activity.ip',
      'app.version',
      'demo.badge',
      'demo.live',
      'audit.action.auth.login',
      'audit.action.auth.demo',
      'audit.action.auth.logout',
      'audit.action.auth.logout_all',
      'audit.action.monitor.create',
      'audit.action.monitor.update',
      'audit.action.monitor.delete',
      'audit.action.incident.update',
      'audit.action.maintenance.create',
      'audit.action.maintenance.delete',
      'audit.action.settings.update',
      'audit.action.demo.reset',
      'audit.action.auth.password_reset_requested',
      'audit.action.auth.password_reset_completed',
      'legal.aboutTitle',
      'legal.privacyTitle',
      'legal.termsTitle',
      'legal.helpTitle',
      'legal.changelogTitle',
      'monitors.filter',
    ];
    for (const key of dynamicKeys) {
      expect(enDict[key], `en ${key}`).toBeTruthy();
      expect(arDict[key], `ar ${key}`).toBeTruthy();
    }
  });
});

describe('self-hosted assets', () => {
  it('does not reference third-party CDNs, fonts or trackers', () => {
    const html = readFileSync('src/web/index.html', 'utf8');
    const css = readFileSync('src/web/styles.css', 'utf8');
    for (const source of [html, css]) {
      expect(source).not.toMatch(/https?:\/\/(fonts|cdn|unpkg|jsdelivr|ajax|analytics)/i);
      expect(source).not.toContain('googletagmanager');
      expect(source).not.toContain('google-analytics');
    }
  });

  it('ships the Readex Pro and JetBrains Mono files locally', () => {
    const files = readdirSync('src/web/public/fonts');
    expect(files).toEqual(
      expect.arrayContaining([
        'readex-pro-arabic.woff2',
        'readex-pro-latin.woff2',
        'jetbrains-mono-latin.woff2',
        'OFL-Readex-Pro.txt',
        'OFL-JetBrains-Mono.txt',
      ]),
    );
  });
});
