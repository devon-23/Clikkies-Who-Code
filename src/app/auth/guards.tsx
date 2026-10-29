import { Navigate, Outlet, useLocation } from 'react-router';
import { authConfigured } from '../lib/supabase.ts';
import { LinkFailed, Linking, Unconfigured } from '../components/States.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { useSession } from './session.tsx';

// These decide what to SHOW. What a player is actually allowed to do is
// decided again by the API on every request -- a guard skipped in the
// browser unlocks nothing.

export function RequireAccess() {
  const { session, me, meError, refreshMe } = useSession();
  const location = useLocation();

  if (!authConfigured) return <Unconfigured />;
  if (session === undefined || (session && me === undefined)) return <Linking />;
  if (!session) return <Navigate to="/enter" replace state={{ from: location.pathname }} />;
  if (!me) return <LinkFailed message={meError} onRetry={() => void refreshMe()} />;
  if (me.access === 'denied') return <Navigate to="/denied" replace />;
  if (me.access === 'needs_profile') return <Navigate to="/intake" replace />;
  return <Outlet />;
}

// signed in, but not necessarily through intake yet: /intake and /denied
export function RequireSession() {
  const { session } = useSession();
  if (!authConfigured) return <Unconfigured />;
  if (session === undefined) return <Linking />;
  if (!session) return <Navigate to="/enter" replace />;
  return <Outlet />;
}

// a non-admin sees the same 404 as a page that does not exist
export function RequireAdmin() {
  const { me } = useSession();
  return me?.profile?.role === 'admin' ? <Outlet /> : <NotFound />;
}
