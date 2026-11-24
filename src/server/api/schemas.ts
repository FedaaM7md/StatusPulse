/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { z } from 'zod';
import { DNS_RECORD_TYPES, INCIDENT_STATUSES, KEYWORD_MODES, MONITOR_TYPES } from '../../shared/types';

// Validation messages are translation keys. The web client translates them when
// it can, and falls back to the raw string for non-UI API consumers.

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.hostname.length > 0 &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'monitors.invalidUrl');

const hostname = z
  .string()
  .trim()
  .min(1, 'monitors.invalidHost')
  .max(253, 'monitors.invalidHost')
  .refine((value) => /^[a-zA-Z0-9._:[\]-]+$/.test(value), 'monitors.invalidHost');

export const monitorSchema = z
  .object({
    name: z.string().trim().min(1, 'monitors.nameRequired').max(120, 'monitors.nameRequired'),
    type: z.enum(MONITOR_TYPES),
    url: httpUrl.nullable().optional(),
    host: hostname.nullable().optional(),
    port: z.number().int().min(1, 'monitors.invalidPort').max(65535, 'monitors.invalidPort').nullable().optional(),
    recordType: z.enum(DNS_RECORD_TYPES).nullable().optional(),
    expectedValue: z.string().trim().max(500).nullable().optional(),
    httpMethod: z.enum(['GET', 'HEAD']).default('GET'),
    expectedStatus: z.number().int().min(100, 'errors.validation').max(599, 'errors.validation').nullable().optional(),
    keyword: z.string().trim().max(200).nullable().optional(),
    keywordMode: z.enum(KEYWORD_MODES).default('none'),
    latencyThresholdMs: z
      .number()
      .int()
      .min(50, 'monitors.latencyRange')
      .max(600000, 'monitors.latencyRange')
      .nullable()
      .optional(),
    sslWarnDays: z.number().int().min(0, 'monitors.sslWarnRange').max(365, 'monitors.sslWarnRange').default(14),
    intervalSeconds: z.number().int().min(1, 'monitors.intervalRange').max(3600, 'monitors.intervalRange').default(60),
    timeoutMs: z.number().int().min(500, 'monitors.timeoutRange').max(60000, 'monitors.timeoutRange').default(10000),
    retries: z.number().int().min(0, 'monitors.retriesRange').max(5, 'monitors.retriesRange').default(1),
    groupName: z.string().trim().max(80).default('General'),
    enabled: z.boolean().default(true),
    allowPrivate: z.boolean().default(false),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'http' && !value.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'monitors.invalidUrl' });
    }
    if (value.type === 'http' && value.keywordMode !== 'none' && !value.keyword?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keyword'], message: 'monitors.keywordHelp' });
    }
    if (value.type === 'tcp') {
      if (!value.host) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message: 'monitors.invalidHost' });
      if (!value.port) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['port'], message: 'monitors.invalidPort' });
    }
    if (value.type === 'dns') {
      if (!value.host) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message: 'monitors.invalidHost' });
      if (!value.recordType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recordType'], message: 'monitors.expectedValueRequired' });
      }
    }
    if (value.type === 'ssl' && !value.host) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message: 'monitors.invalidHost' });
    }
  });

export type MonitorSchemaInput = z.infer<typeof monitorSchema>;

export const settingsSchema = z.object({
  siteNameAr: z.string().trim().min(1).max(80),
  siteNameEn: z.string().trim().min(1).max(80),
  siteDescriptionAr: z.string().trim().max(300),
  siteDescriptionEn: z.string().trim().max(300),
  allowPrivateTargets: z.boolean(),
  webhookEnabled: z.boolean(),
  webhookUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (value === '') return true;
      try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
      } catch {
        return false;
      }
    }, 'settings.webhookUrlInvalid'),
  webhookSecret: z.string().max(200),
  publicPageEnabled: z.boolean(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(200),
  password: z.string().min(12, 'errors.weakPassword').max(200),
});

export const maintenanceSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    monitorId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'maintenance.invalidRange' });
    }
  });

export const incidentUpdateSchema = z.object({
  message: z.string().trim().min(1, 'incidents.updateRequired').max(2000, 'incidents.updateRequired'),
  status: z.enum(INCIDENT_STATUSES),
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
