/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Lang } from './lang';
import { countText, dayForms, hourForms, minuteForms } from './plural';

function locale(lang: Lang): string {
  return lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
}

function clean(value: string): string {
  return value.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatDateTime(epochMs: number, lang: Lang): string {
  try {
    return clean(
      new Intl.DateTimeFormat(locale(lang), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(epochMs)),
    );
  } catch {
    return new Date(epochMs).toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function formatDate(epochMs: number, lang: Lang): string {
  try {
    return clean(
      new Intl.DateTimeFormat(locale(lang), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(epochMs)),
    );
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

export function formatDay(isoDate: string, lang: Lang): string {
  return clean(
    new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' }).format(
      new Date(`${isoDate}T12:00:00Z`),
    ),
  );
}

export function formatRelative(epochMs: number, lang: Lang, now = Date.now()): string {
  const diff = epochMs - now;
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  if (abs < 60 * 1000) return formatter.format(0, 'second');
  if (abs < 60 * 60 * 1000) return formatter.format(Math.round(diff / (60 * 1000)), 'minute');
  if (abs < 24 * 60 * 60 * 1000) return formatter.format(Math.round(diff / (60 * 60 * 1000)), 'hour');
  if (abs < 30 * 24 * 60 * 60 * 1000) return formatter.format(Math.round(diff / (24 * 60 * 60 * 1000)), 'day');
  if (abs < 365 * 24 * 60 * 60 * 1000) {
    return formatter.format(Math.round(diff / (30 * 24 * 60 * 60 * 1000)), 'month');
  }
  return formatter.format(Math.round(diff / (365 * 24 * 60 * 60 * 1000)), 'year');
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatNumber(value: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function formatDuration(
  startMs: number,
  endMs: number | null,
  lang: Lang,
): string {
  const end = endMs ?? Date.now();
  const totalMinutes = Math.max(0, Math.round((end - startMs) / (60 * 1000)));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(countText(days, lang, dayForms));
  if (hours > 0) parts.push(countText(hours, lang, hourForms));
  if (minutes > 0 || parts.length === 0) parts.push(countText(minutes, lang, minuteForms));
  return parts.join(' · ');
}

export function toDateTimeLocalValue(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function fromDateTimeLocalValue(value: string): number {
  return new Date(value).getTime();
}
