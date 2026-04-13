import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';
import type { DevelopmentUser, UserRole } from '../types';

interface AuthContextValue {
  user: DevelopmentUser | null;
  login: (username: string, role: UserRole) => Promise<void>;
  logout: () => void;
  switchRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'webguard_dev_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DevelopmentUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setUser(JSON.parse(raw));
  }, []);

  const persist = (nextUser: DevelopmentUser | null) => {
    setUser(nextUser);
    if (nextUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const login = async (username: string, role: UserRole) => {
    const nextUser = await authApi.mockLogin({ username, role });
    persist(nextUser);
  };

  const logout = () => persist(null);

  const switchRole = async () => {
    const nextRole: UserRole = user?.role === 'admin' ? 'user' : 'admin';
    await login(user?.username || (nextRole === 'admin' ? 'admin-dev' : 'user-dev'), nextRole);
  };

  const value = useMemo(() => ({ user, login, logout, switchRole }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
