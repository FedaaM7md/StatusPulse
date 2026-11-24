/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

const NAV_EVENT = 'sp:navigate';

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    window.addEventListener(NAV_EVENT, handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener(NAV_EVENT, handler);
    };
  }, []);
  return path;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
