/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';
import { useI18n } from '../lib/i18n';

export function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  void dark;
  const base =
    'px-2 py-1 font-mono text-[10px] font-medium transition focus-visible:outline-offset-0';
  return (
    <div
      className="inline-flex items-center border border-line bg-panel p-0.5"
      role="group"
      aria-label={t('aria.languageSwitch')}
    >
      <button
        type="button"
        onClick={() => setLang('ar')}
        aria-pressed={lang === 'ar'}
        className={`${base} ${lang === 'ar' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`}
      >
        AR
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`${base} ${lang === 'en' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`}
      >
        EN
      </button>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative border border-dashed border-line bg-panel2/50 px-6 py-12 text-center">
      <span className="pointer-events-none absolute start-3 top-3 font-mono text-[10px] text-faint">[</span>
      <span className="pointer-events-none absolute end-3 top-3 font-mono text-[10px] text-faint">]</span>
      <span className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center border border-line bg-panel text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface ToastValue {
  show: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  const show = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((previous) => [...previous.slice(-2), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id));
    }, 5200);
    timers.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex animate-fade-up items-start gap-3 border bg-panel px-3.5 py-3 text-sm shadow-lift ${
              item.tone === 'success'
                ? 'border-up/40 text-ink'
                : item.tone === 'error'
                  ? 'border-down/40 text-ink'
                  : 'border-line text-ink'
            }`}
          >
            <span
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border ${
                item.tone === 'success'
                  ? 'border-up/40 bg-up/10 text-up'
                  : item.tone === 'error'
                    ? 'border-down/40 bg-down/10 text-down'
                    : 'border-line bg-panel2 text-muted'
              }`}
            >
              <Icon
                name={item.tone === 'success' ? 'check' : item.tone === 'error' ? 'alert' : 'terminal'}
                className="h-3 w-3"
              />
            </span>
            <span className="leading-snug">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
