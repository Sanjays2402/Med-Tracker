'use client';

import * as React from 'react';
import { safeLocalStorage } from '@med/utils';
import { STORAGE_KEYS } from '@med/config';
import { api } from './api-client';

interface AuthState {
  token: string | null;
  userId: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({ token: null, userId: null, loading: true });

  React.useEffect(() => {
    const token = safeLocalStorage.get<string | null>(STORAGE_KEYS.authToken, null);
    setState({ token, userId: null, loading: false });
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const { token } = await api.post<{ token: string }>('/auth/login', { email, password });
    safeLocalStorage.set(STORAGE_KEYS.authToken, token);
    setState((s) => ({ ...s, token }));
  }, []);

  const logout = React.useCallback(() => {
    safeLocalStorage.remove(STORAGE_KEYS.authToken);
    setState({ token: null, userId: null, loading: false });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
