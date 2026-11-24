/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { DisplayState } from '../../shared/types';
import { useI18n } from '../lib/i18n';
import { statusKey, statusTone } from '../lib/status';

export function StatusBadge({
  state,
  size = 'md',
  withDot = true,
}: {
  state: DisplayState;
  size?: 'sm' | 'md';
  withDot?: boolean;
}) {
  const { t } = useI18n();
  const tone = statusTone[state];
  return (
    <span className={`chip ${tone.chip} ${size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : ''}`}>
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />}
      {t(statusKey(state))}
    </span>
  );
}

export function StatusDot({ state, pulse = false }: { state: DisplayState; pulse?: boolean }) {
  const tone = statusTone[state];
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden="true">
      {pulse && state !== 'up' && state !== 'unknown' && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 ${tone.dot}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`} />
    </span>
  );
}
