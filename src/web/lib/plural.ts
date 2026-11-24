/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Lang } from './lang';

export interface CountForms {
  ar: { one: string; two: string; few: string; many: string };
  en: { one: string; other: string };
}

/**
 * Pick the Arabic count form for a noun: singular (1), dual (2), few (3–10)
 * and the 11+ form. English uses the usual singular/plural pair.
 */
export function countForm(count: number, lang: Lang, forms: CountForms): string {
  const value = Math.abs(Math.trunc(count));
  if (lang === 'ar') {
    if (value === 1) return forms.ar.one;
    if (value === 2) return forms.ar.two;
    const remainder = value % 100;
    if (remainder >= 3 && remainder <= 10) return forms.ar.few;
    return forms.ar.many;
  }
  return value === 1 ? forms.en.one : forms.en.other;
}

/** Format a number with the matching localised noun, e.g. "6 فحوصات نشطة". */
export function countText(count: number, lang: Lang, forms: CountForms): string {
  const value = Math.abs(Math.trunc(count));
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB').format(value);
  return `${number} ${countForm(value, lang, forms)}`;
}

export const checkForms: CountForms = {
  ar: { one: 'فحص', two: 'فحصان', few: 'فحوصات', many: 'فحصاً' },
  en: { one: 'check', other: 'checks' },
};

export const activeCheckForms: CountForms = {
  ar: { one: 'فحص نشط', two: 'فحصان نشطان', few: 'فحوصات نشطة', many: 'فحصاً نشطاً' },
  en: { one: 'active check', other: 'active checks' },
};

export const downCheckForms: CountForms = {
  ar: { one: 'فحص متوقف', two: 'فحصان متوقفان', few: 'فحوصات متوقفة', many: 'فحصاً متوقفاً' },
  en: { one: 'down check', other: 'down checks' },
};

export const monitorForms: CountForms = {
  ar: { one: 'مراقبة', two: 'مراقبتان', few: 'مراقبات', many: 'مراقبة' },
  en: { one: 'monitor', other: 'monitors' },
};

export const pausedMonitorForms: CountForms = {
  ar: { one: 'متوقفة', two: 'متوقفتان', few: 'متوقفات', many: 'متوقفة' },
  en: { one: 'paused', other: 'paused' },
};

export const incidentForms: CountForms = {
  ar: { one: 'حادث', two: 'حادثان', few: 'حوادث', many: 'حادثاً' },
  en: { one: 'incident', other: 'incidents' },
};

export const updateForms: CountForms = {
  ar: { one: 'تحديث', two: 'تحديثان', few: 'تحديثات', many: 'تحديثاً' },
  en: { one: 'update', other: 'updates' },
};

export const dayForms: CountForms = {
  ar: { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يوماً' },
  en: { one: 'day', other: 'days' },
};

export const hourForms: CountForms = {
  ar: { one: 'ساعة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' },
  en: { one: 'hour', other: 'hours' },
};

export const minuteForms: CountForms = {
  ar: { one: 'دقيقة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' },
  en: { one: 'minute', other: 'minutes' },
};

export const actionForms: CountForms = {
  ar: { one: 'إجراء مسجل', two: 'إجراءان مسجلان', few: 'إجراءات مسجلة', many: 'إجراءاً مسجلاً' },
  en: { one: 'recorded action', other: 'recorded actions' },
};

export const notificationForms: CountForms = {
  ar: { one: 'إشعار غير مقروء', two: 'إشعاران غير مقروءان', few: 'إشعارات غير مقروءة', many: 'إشعاراً غير مقروء' },
  en: { one: 'unread notification', other: 'unread notifications' },
};
