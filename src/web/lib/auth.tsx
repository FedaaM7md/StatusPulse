/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminSessionInfo } from '../../shared/types';
import { api, setCsrfToken } from './api';
import { readBootstrap } from './bootstrap';

interface AuthValue {
  session: AdminSessionInfo | null;
  loading: boolean;
  demoMode: boolean;
  demoResetMinutes: number;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const boot = readBootstrap();
  const [demoMode, setDemoMode] = useState(boot?.config?.demoMode ?? false);
  const [demoResetMinutes, setDemoResetMinutes] = useState(boot?.config?.demoResetMinutes ?? 60);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicConfig()
      .then((config) => {
        if (cancelled) return;
        setDemoMode(config.demoMode);
        setDemoResetMinutes(config.demoResetMinutes);
      })
      .catch(() => {
        // The config endpoint is public; a failure only hides the demo button.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((info) => {
        if (cancelled) return;
        setCsrfToken(info.csrfToken);
        setSession(info);
      })
      .catch(() => {
        if (cancelled) return;
        setCsrfToken(null);
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setCsrfToken(null);
      setSession(null);
    };
    window.addEventListener('sp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sp:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const info = await api.login(email, password);
    setCsrfToken(info.csrfToken);
    setSession(info);
  }, []);

  const loginDemo = useCallback(async () => {
    const info = await api.demoLogin();
    setCsrfToken(info.csrfToken);
    setSession(info);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setCsrfToken(null);
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, loading, demoMode, demoResetMinutes, login, loginDemo, logout }),
    [session, loading, demoMode, demoResetMinutes, login, loginDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
