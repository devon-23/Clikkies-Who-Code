import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '../../shared/api.ts';
import { api, errorMessage } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';

// Two layers of "who are you":
//   session -- Supabase says you are signed in as this email
//   me      -- our API says what that account is allowed to do
// Both start undefined, meaning "still finding out".

interface SessionState {
  session: Session | null | undefined;
  me: MeResponse | null | undefined;
  meError: string | null;
  /** true after the player arrives from a password-reset email */
  recovering: boolean;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

// exported only so the development preview can stand in a fake session
export const SessionContext = Ctx;
export type { SessionState };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [me, setMe] = useState<MeResponse | null | undefined>(supabase ? undefined : null);
  const [meError, setMeError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const refreshMe = useCallback(async () => {
    if (!userId) {
      setMe(null);
      return;
    }
    try {
      setMeError(null);
      setMe(await api<MeResponse>('/me'));
    } catch (err) {
      setMe(null);
      setMeError(errorMessage(err));
    }
  }, [userId]);

  // keyed on the user, not the token, so the hourly token refresh does not
  // send everything back to a loading state
  const sessionKnown = session !== undefined;
  useEffect(() => {
    if (!sessionKnown) return;
    setMe(undefined);
    void refreshMe();
  }, [sessionKnown, refreshMe]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ session, me, meError, recovering, refreshMe, signOut }),
    [session, me, meError, recovering, refreshMe, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
