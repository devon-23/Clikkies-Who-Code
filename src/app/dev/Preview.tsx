// DEVELOPMENT ONLY. Renders the signed-in pages with a fake session and fake
// admin data, so the design can be worked on before Supabase is set up.
// router.tsx only registers this under import.meta.env.DEV, which Vite
// replaces with `false` in production builds -- so none of this ships.

import type { Session } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import type { AdminOverview, MeResponse } from '../../shared/api.ts';
import { SessionContext, type SessionState } from '../auth/session.tsx';

const ADMIN_FIXTURE: AdminOverview = {
  registrationOpen: false,
  counts: { profiles: 3, admins: 1, activeTesters: 2, invited: 2, revoked: 1 },
  testers: [
    { email: 'warden@example.com', status: 'active', source: 'bootstrap', note: 'first administrator', username: 'warden', createdAt: '2026-10-20T10:00:00Z', revokedAt: null },
    { email: 'resident@example.com', status: 'active', source: 'invite', note: 'from the OSU show', username: 'resident_42', createdAt: '2026-10-22T10:00:00Z', revokedAt: null },
    { email: 'friend@example.com', status: 'invited', source: 'invite', note: null, username: null, createdAt: '2026-10-25T10:00:00Z', revokedAt: null },
    { email: 'a.very.long.address.for.layout.testing@example-university.edu', status: 'invited', source: 'invite', note: null, username: null, createdAt: '2026-10-26T10:00:00Z', revokedAt: null },
    { email: 'gone@example.com', status: 'revoked', source: 'invite', note: null, username: 'gone', createdAt: '2026-10-21T10:00:00Z', revokedAt: '2026-10-27T10:00:00Z' },
  ],
  audit: [
    { id: 3, action: 'tester.revoke', target: 'gone@example.com', actor: 'warden', createdAt: '2026-10-27T10:00:00Z' },
    { id: 2, action: 'tester.invite', target: 'friend@example.com', actor: 'warden', createdAt: '2026-10-25T10:00:00Z' },
    { id: 1, action: 'registration.close', target: null, actor: 'warden', createdAt: '2026-10-20T10:00:00Z' },
  ],
};

let fetchPatched = false;
function patchAdminFetch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/admin/')) {
      return new Response(JSON.stringify(ADMIN_FIXTURE), { headers: { 'content-type': 'application/json' } });
    }
    return real(input, init);
  };
}

export function PreviewSession() {
  const [params] = useSearchParams();
  const role = params.get('as') === 'admin' ? 'admin' : 'player';
  const access = (params.get('access') ?? 'granted') as MeResponse['access'];
  patchAdminFetch();

  const value = useMemo<SessionState>(() => ({
    session: { user: { id: 'preview-user' } } as unknown as Session,
    me: {
      id: 'b5c1e7a0-preview',
      email: 'resident@example.com',
      access,
      reason: access === 'denied' ? (params.get('reason') as 'revoked' | null) ?? 'not_invited' : null,
      profile: access === 'needs_profile' ? null : {
        username: role === 'admin' ? 'warden' : 'resident_42',
        role,
        introSeenAt: '2026-10-28T03:14:00Z',
        createdAt: '2026-10-28T03:14:00Z',
      },
    },
    meError: null,
    recovering: false,
    refreshMe: async () => {},
    signOut: async () => {},
  }), [role, access, params]);

  return (
    <SessionContext.Provider value={value}>
      <Outlet />
    </SessionContext.Provider>
  );
}
