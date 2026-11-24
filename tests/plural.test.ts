import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/web/lib/format';
import {
  activeCheckForms,
  countForm,
  countText,
  dayForms,
  incidentForms,
  minuteForms,
  monitorForms,
  updateForms,
} from '../src/web/lib/plural';

const now = 1_800_000_000_000;

describe('Arabic count agreement', () => {
  it('uses singular, dual, few and many forms', () => {
    expect(countText(1, 'ar', activeCheckForms)).toBe('1 فحص نشط');
    expect(countText(2, 'ar', activeCheckForms)).toBe('2 فحصان نشطان');
    expect(countText(6, 'ar', activeCheckForms)).toBe('6 فحوصات نشطة');
    expect(countText(11, 'ar', activeCheckForms)).toBe('11 فحصاً نشطاً');
  });

  it('uses the last two digits for 3–10 agreement', () => {
    expect(countForm(103, 'ar', monitorForms)).toBe('مراقبات');
    expect(countForm(111, 'ar', monitorForms)).toBe('مراقبة');
    expect(countText(2, 'ar', incidentForms)).toBe('2 حادثان');
    expect(countText(7, 'ar', updateForms)).toBe('7 تحديثات');
  });

  it('keeps English singular and plural forms', () => {
    expect(countText(1, 'en', activeCheckForms)).toBe('1 active check');
    expect(countText(6, 'en', activeCheckForms)).toBe('6 active checks');
    expect(countText(2, 'en', monitorForms)).toBe('2 monitors');
  });
});

describe('localised durations', () => {
  it('includes minutes when hours are present', () => {
    expect(formatDuration(now, now + 107 * 60_000, 'ar')).toBe('1 ساعة · 47 دقيقة');
    expect(formatDuration(now, now + 185 * 60_000, 'ar')).toBe('3 ساعات · 5 دقائق');
  });

  it('uses the dual and plural forms for short durations', () => {
    expect(formatDuration(now, now + 23 * 60_000, 'ar')).toBe('23 دقيقة');
    expect(formatDuration(now, now + 2 * 60_000, 'ar')).toBe('2 دقيقتان');
    expect(formatDuration(now, now + 2 * 24 * 60 * 60_000, 'ar')).toBe('2 يومان');
    expect(formatDuration(now, now + 107 * 60_000, 'en')).toBe('1 hour · 47 minutes');
  });
});

describe('day and minute forms', () => {
  it('agree with the count', () => {
    expect(countText(1, 'ar', dayForms)).toBe('1 يوم');
    expect(countText(2, 'ar', dayForms)).toBe('2 يومان');
    expect(countText(14, 'ar', dayForms)).toBe('14 يوماً');
    expect(countText(2, 'ar', minuteForms)).toBe('2 دقيقتان');
  });
});
