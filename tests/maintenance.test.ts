import { describe, expect, it } from 'vitest';
import {
  activeWindowsFor,
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  isUnderMaintenance,
  listMaintenanceWindows,
  windowIsActive,
  windowState,
} from '../src/server/services/maintenance';
import type { MaintenanceWindow } from '../src/shared/types';
import { testDb } from './helpers';

const NOW = 1_800_000_000_000;

function window(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: 1,
    title: 'Window',
    titleAr: null,
    titleEn: null,
    startsAt: NOW,
    endsAt: NOW + 60 * 60 * 1000,
    monitorId: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('maintenance window math', () => {
  it('is active from start inclusive to end exclusive', () => {
    const item = window();
    expect(windowIsActive(item, NOW - 1)).toBe(false);
    expect(windowIsActive(item, NOW)).toBe(true);
    expect(windowIsActive(item, NOW + 60 * 60 * 1000 - 1)).toBe(true);
    expect(windowIsActive(item, NOW + 60 * 60 * 1000)).toBe(false);
  });

  it('classifies windows as active, upcoming or past', () => {
    expect(windowState(window(), NOW + 1000)).toBe('active');
    expect(windowState(window({ startsAt: NOW + 5000 }), NOW)).toBe('upcoming');
    expect(windowState(window({ endsAt: NOW - 1000 }), NOW)).toBe('past');
  });

  it('applies global windows to every monitor and specific windows only to their monitor', () => {
    const windows = [
      window({ id: 1, monitorId: null }),
      window({ id: 2, monitorId: 7, startsAt: NOW + 10_000, endsAt: NOW + 20_000 }),
      window({ id: 3, monitorId: 8 }),
    ];
    expect(activeWindowsFor(windows, 7, NOW).map((item) => item.id)).toEqual([1]);
    expect(activeWindowsFor(windows, 8, NOW).map((item) => item.id)).toEqual([1, 3]);
  });
});

describe('maintenance persistence', () => {
  it('creates, lists, checks and deletes windows', () => {
    const db = testDb();
    const created = createMaintenanceWindow(
      db,
      { title: '  Database upgrade  ', startsAt: NOW + 1000, endsAt: NOW + 2000, monitorId: null },
      NOW,
    );
    expect(created.title).toBe('Database upgrade');
    expect(listMaintenanceWindows(db)).toHaveLength(1);
    expect(isUnderMaintenance(db, 99, NOW + 1500)).toBe(true);
    expect(isUnderMaintenance(db, 99, NOW + 2500)).toBe(false);
    expect(deleteMaintenanceWindow(db, created.id)).toBe(true);
    expect(listMaintenanceWindows(db)).toHaveLength(0);
  });

  it('returns false for unknown deletion', () => {
    const db = testDb();
    expect(deleteMaintenanceWindow(db, 12345)).toBe(false);
  });
});
