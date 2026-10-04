import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getSession, onSessionChange } from '../api/client';
import type { Session } from '../api/types';

interface AuthValue {
  session: Session | null;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession());

  // The client clears the session when a refresh fails, which can happen while the
  // operator is reading a screen rather than in response to anything they did. React
  // has to hear about that, or the console would keep rendering a signed-in shell
  // whose every request is refused.
  useEffect(() => onSessionChange(setSession), []);

  const signIn = useCallback(async (phone: string, password: string) => {
    setSession(await api.signIn(phone, password));
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
