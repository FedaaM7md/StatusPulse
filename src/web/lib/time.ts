/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect, useState } from 'react';

/** Shared ticking clock for NOC timestamps. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatClock(epochMs: number, withSeconds = true): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}${withSeconds ? `:${pad(date.getSeconds())}` : ''}`;
}

export function formatUtcOffset(epochMs: number): string {
  const minutes = -new Date(epochMs).getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
