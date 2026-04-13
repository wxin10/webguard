import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';
import type { DemoUser, UserRole } from '../types';

interface AuthContextValue {
  user: DemoUser | null;
  login: (username: string, role: UserRole) => Promise<void>;
  logout: () => void;
  switchRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'webguard_demo_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setUser(JSON.parse(raw));
  }, []);

  const persist = (nextUser: DemoUser | null) => {
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
    await login(user?.username || (nextRole === 'admin' ? 'admin-demo' : 'user-demo'), nextRole);
  };

  const value = useMemo(() => ({ user, login, logout, switchRole }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
