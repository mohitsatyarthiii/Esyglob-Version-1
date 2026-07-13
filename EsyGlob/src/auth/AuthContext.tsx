import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, clearAuthTokens, clearSessionCookie } from '../api/client';
import { getCurrentUser, login, LoginInput, logout, signup, SignupInput } from '../api/auth';
import { CurrentUser, UserRole } from '../api/types';
import { appStorage, writeJson } from '../storage/appStorage';
import { useQueryClient } from '@tanstack/react-query';
import { disconnectRealtime } from '../realtime/socket';

const USER_KEY = 'auth.user';

type AuthStatus = 'checking' | 'guest' | 'authenticated';
 
type AuthContextValue = {
  user: CurrentUser | null;
  status: AuthStatus;
  activeRole: UserRole | null;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveRole: (role: UserRole) => void;
  sessionVersion: number;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function pickInitialRole(user: CurrentUser | null): UserRole | null {
  const mobileRoles = user?.roles?.filter(role => role === 'buyer' || role === 'seller') ?? [];
  return (user?.activeRole === 'buyer' || user?.activeRole === 'seller'
    ? user.activeRole
    : mobileRoles[0]) ?? null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  // Never render a persisted identity. The current session is established only
  // after the server validates the current cookie through /auth/me.
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [activeRole, setActiveRoleState] = useState<UserRole | null>(() => pickInitialRole(user));
  const [error, setError] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  const destroyLocalSession = useCallback(async () => {
    disconnectRealtime();
    await queryClient.cancelQueries();
    queryClient.clear();
    clearAuthTokens();
    clearSessionCookie();
    appStorage.clearAll();
    setSessionVersion(value => value + 1);
  }, [queryClient]);

  const commitUser = useCallback((nextUser: CurrentUser | null) => {
    setUser(nextUser);
    setActiveRoleState(pickInitialRole(nextUser));
    setStatus(nextUser ? 'authenticated' : 'guest');
    writeJson(USER_KEY, nextUser);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      commitUser(await getCurrentUser());
    } catch (nextError) {
      await destroyLocalSession();
      commitUser(null);
      if (nextError instanceof ApiError && nextError.status === 401) {
        return;
      }
      setError(getErrorMessage(nextError));
    }
  }, [commitUser, destroyLocalSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      setError(null);
      commitUser(null);
      await destroyLocalSession();
      const nextUser = await login(input);
      commitUser(nextUser);
      setSessionVersion(value => value + 1);
    },
    [commitUser, destroyLocalSession],
  );

  const signUp = useCallback(
    async (input: SignupInput) => {
      setError(null);
      commitUser(null);
      await destroyLocalSession();
      const nextUser = await signup(input);
      commitUser(nextUser);
      setSessionVersion(value => value + 1);
    },
    [commitUser, destroyLocalSession],
  );

  const signOut = useCallback(async () => {
    commitUser(null);
    disconnectRealtime();
    setSessionVersion(value => value + 1);
    try {
      await logout();
    } finally {
      await destroyLocalSession();
    }
  }, [commitUser, destroyLocalSession]);

  const setActiveRole = useCallback((role: UserRole) => {
    if (role === 'buyer' || role === 'seller') {
      setActiveRoleState(role);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      activeRole,
      error,
      refresh,
      signIn,
      signUp,
      signOut,
      setActiveRole,
      sessionVersion,
    }),
    [activeRole, error, refresh, sessionVersion, signIn, signOut, signUp, status, user, setActiveRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}

export default AuthProvider;
