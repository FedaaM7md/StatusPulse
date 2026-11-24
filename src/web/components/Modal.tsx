/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Spinner } from './Feedback';
import { useI18n } from '../lib/i18n';

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  busy = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/65"
        onClick={() => (!busy ? onClose() : undefined)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg animate-fade-up border border-line bg-panel p-5 shadow-lift"
      >
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-line pb-3">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted transition hover:bg-panel2 hover:text-ink disabled:opacity-50"
            aria-label={t('common.close')}
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-sm leading-relaxed text-muted">{children}</div>
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel/70">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
