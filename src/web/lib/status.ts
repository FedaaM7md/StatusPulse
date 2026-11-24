/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { DisplayState, IncidentStatus } from '../../shared/types';

export interface StatusTone {
  dot: string;
  chip: string;
  text: string;
  bar: string;
  panel: string;
}

export const statusTone: Record<DisplayState, StatusTone> = {
  up: {
    dot: 'bg-up',
    chip: 'chip-up',
    text: 'text-up',
    bar: 'bg-up',
    panel: 'border-up/30 bg-up/10',
  },
  degraded: {
    dot: 'bg-degraded',
    chip: 'chip-degraded',
    text: 'text-degraded',
    bar: 'bg-degraded',
    panel: 'border-degraded/35 bg-degraded/10',
  },
  down: {
    dot: 'bg-down',
    chip: 'chip-down',
    text: 'text-down',
    bar: 'bg-down',
    panel: 'border-down/35 bg-down/10',
  },
  maintenance: {
    dot: 'bg-maint',
    chip: 'chip-maint',
    text: 'text-maint',
    bar: 'bg-maint',
    panel: 'border-maint/35 bg-maint/10',
  },
  unknown: {
    dot: 'bg-faint',
    chip: 'chip-unknown',
    text: 'text-muted',
    bar: 'bg-line',
    panel: 'border-line bg-panel2',
  },
};

export function statusKey(state: DisplayState): string {
  return `status.${state}`;
}

export function overallKey(state: DisplayState): string {
  switch (state) {
    case 'up':
      return 'status.operational';
    case 'degraded':
      return 'status.partial';
    case 'down':
      return 'status.major';
    case 'maintenance':
      return 'status.maintenanceActive';
    default:
      return 'common.unknown';
  }
}

export const incidentTone: Record<IncidentStatus, string> = {
  investigating: 'chip-down',
  identified: 'chip-degraded',
  monitoring: 'chip-maint',
  resolved: 'chip-up',
};

export const incidentDot: Record<IncidentStatus, string> = {
  investigating: 'bg-down',
  identified: 'bg-degraded',
  monitoring: 'bg-maint',
  resolved: 'bg-up',
};

export function barTone(uptime: number | null): string {
  if (uptime === null) return 'bg-line';
  if (uptime >= 99.5) return 'bg-up';
  if (uptime >= 98) return 'bg-up/70';
  if (uptime >= 95) return 'bg-degraded';
  if (uptime >= 80) return 'bg-degraded/70';
  return 'bg-down';
}

export const levelTone: Record<string, { chip: string; dot: string }> = {
  info: { chip: 'chip-maint', dot: 'bg-maint' },
  success: { chip: 'chip-up', dot: 'bg-up' },
  warning: { chip: 'chip-degraded', dot: 'bg-degraded' },
  error: { chip: 'chip-down', dot: 'bg-down' },
};

export const monitorTypeKey: Record<string, string> = {
  http: 'monitors.typeHttp',
  tcp: 'monitors.typeTcp',
  dns: 'monitors.typeDns',
  ssl: 'monitors.typeSsl',
};

export const monitorTypeBadge: Record<string, string> = {
  http: 'border-accent/30 bg-accent/10 text-accent',
  tcp: 'border-line bg-panel2 text-muted',
  dns: 'border-line bg-panel2 text-muted',
  ssl: 'border-line bg-panel2 text-muted',
};
