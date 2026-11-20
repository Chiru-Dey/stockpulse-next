"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { api } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import type { SessionResponse, User } from "@/types/api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const loadUser = useCallback(async () => {
    const response = await api.get<{ user: User }>("/api/auth/me");
    return response.user;
  }, []);

  // A failed /me means "no session" — drop any previously loaded user.
  const { data: user, loading, reload, clear } = useAsyncData(loadUser, {
    clearOnError: true,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api.post<SessionResponse>("/api/auth/login", {
        email,
        password,
      });
      // Re-read /me so the cookie-backed session is the single source of truth.
      await reload();
      return response.user;
    },
    [reload],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/api/auth/logout");
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, reload }),
    [user, loading, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}