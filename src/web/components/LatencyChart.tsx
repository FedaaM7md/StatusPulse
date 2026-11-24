/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useId } from 'react';
import type { CheckResultView } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatDateTime, formatMs } from '../lib/format';

export function LatencyChart({ results, height = 200 }: { results: CheckResultView[]; height?: number }) {
  const { t, lang } = useI18n();
  const gradientId = `lat-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const withLatency = results.filter(
    (result): result is CheckResultView & { latencyMs: number } =>
      result.latencyMs !== null && Number.isFinite(result.latencyMs),
  );

  if (withLatency.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-line bg-panel2/40 px-4 text-center text-sm text-muted">
        {t('chart.noData')}
      </div>
    );
  }

  const step = Math.max(1, Math.ceil(withLatency.length / 280));
  const sampled = withLatency.filter((_, index) => index % step === 0);
  if (sampled[sampled.length - 1] !== withLatency[withLatency.length - 1]) {
    sampled.push(withLatency[withLatency.length - 1]!);
  }

  const width = 680;
  const pad = { top: 12, right: 10, bottom: 24, left: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(...sampled.map((point) => point.latencyMs), 50);
  const niceMax = Math.ceil(maxValue / 50) * 50;

  const x = (index: number) => pad.left + (index / Math.max(sampled.length - 1, 1)) * innerWidth;
  const y = (value: number) => pad.top + (1 - value / niceMax) * innerHeight;

  const line = sampled
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.latencyMs).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(sampled.length - 1).toFixed(1)},${(height - pad.bottom).toFixed(1)} L${x(0).toFixed(1)},${(height - pad.bottom).toFixed(1)} Z`;

  const gridValues = [0, niceMax / 2, niceMax];
  const labelIndexes = [0, Math.floor((sampled.length - 1) / 2), sampled.length - 1];

  return (
    <div className="w-full" dir="ltr">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={t('aria.chart')}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(value)}
              y2={y(value)}
              stroke="rgb(var(--c-line))"
              strokeWidth="1"
              strokeDasharray={value === 0 ? undefined : '3 3'}
            />
            <text
              x={pad.left - 6}
              y={y(value) + 3}
              textAnchor="end"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
              fill="rgb(var(--c-faint))"
            >
              {Math.round(value)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--c-accent))"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {sampled.map((point, index) => (
          <circle
            key={`${point.id}-${index}`}
            cx={x(index)}
            cy={y(point.latencyMs)}
            r="1.8"
            fill="rgb(var(--c-accent))"
            opacity="0.7"
          >
            <title>{`${formatDateTime(point.checkedAt, lang)} · ${formatMs(point.latencyMs)}`}</title>
          </circle>
        ))}

        {labelIndexes.map((index) => {
          const point = sampled[index];
          if (!point) return null;
          return (
            <text
              key={`label-${index}`}
              x={x(index)}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === sampled.length - 1 ? 'end' : 'middle'}
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
              fill="rgb(var(--c-faint))"
            >
              {new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                ...(sampled[sampled.length - 1]!.checkedAt - sampled[0]!.checkedAt > 26 * 60 * 60 * 1000
                  ? { day: 'numeric', month: 'short' }
                  : {}),
              }).format(new Date(point.checkedAt))}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
