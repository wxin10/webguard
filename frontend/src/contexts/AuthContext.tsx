import React, { createContext, useContext, useMemo, useState } from 'react';
import { authApi } from '../services/api';
import { readStoredAuthUser, writeStoredAuthUser } from '../services/client';
import type { DevelopmentUser, UserRole } from '../types';

interface AuthContextValue {
  user: DevelopmentUser | null;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  mockLogin: (username: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DevelopmentUser | null>(() => readStoredAuthUser());
  const initialized = true;

  const persist = (nextUser: DevelopmentUser | null) => {
    setUser(nextUser);
    writeStoredAuthUser(nextUser);
  };

  const login = async (username: string, password: string) => {
    const tokenResponse = await authApi.login({ username, password });
    const profile = tokenResponse.user || {
      username,
      role: 'user' as UserRole,
      display_name: username,
    };
    persist({
      ...profile,
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type,
      expires_in: tokenResponse.expires_in,
    });
  };

  const mockLogin = async (username: string, role: UserRole) => {
    const nextUser = await authApi.mockLogin({ username, role });
    persist(nextUser);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      persist(null);
    }
  };

  const switchRole = async () => {
    const nextRole: UserRole = user?.role === 'admin' ? 'user' : 'admin';
    await mockLogin(nextRole === 'admin' ? 'platform-admin' : 'platform-user', nextRole);
  };

  const value = useMemo(
    () => ({ user, initialized, login, mockLogin, logout, switchRole }),
    [initialized, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
