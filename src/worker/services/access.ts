// Who is allowed in. Every protected route goes through resolveAccess, so the
// rules live in exactly one place:
//
//   1. Admins are always in.
//   2. A revoked tester is always out -- even with public registration on.
//   3. An invited or active tester is in.
//   4. With public registration on, anyone with an account is in.
//   5. Everyone else is signed in but not authorized.
//
// Being "in" without a profile means the player still has to pick a username.

import { and, eq, or, sql } from 'drizzle-orm';
import type { AccessState, DenialReason, Profile } from '../../shared/api.ts';
import type { Db } from '../db/client.ts';
import { profiles, testerAccess } from '../db/schema.ts';
import type { AuthUser } from '../env.ts';
import { ApiError, isUniqueViolation } from '../lib/http.ts';
import { isRegistrationOpen } from './settings.ts';

export interface AccessResult {
  state: AccessState;
  reason: DenialReason | null;
  profile: Profile | null;
}

type ProfileRow = typeof profiles.$inferSelect;
type TesterRow = typeof testerAccess.$inferSelect;

export function toProfile(row: ProfileRow): Profile {
  return {
    username: row.username,
    role: row.role,
    introSeenAt: row.introSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// the row tied to this account wins over one that merely shares its address
async function findTester(db: Db, user: AuthUser): Promise<TesterRow | undefined> {
  const rows = await db
    .select()
    .from(testerAccess)
    .where(or(eq(testerAccess.userId, user.id), eq(testerAccess.email, user.email)));
  return rows.find((r) => r.userId === user.id) ?? rows[0];
}

export async function resolveAccess(db: Db, user: AuthUser): Promise<AccessResult> {
  const [profileRow] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const profile = profileRow ? toProfile(profileRow) : null;

  if (profile?.role === 'admin') return { state: 'granted', reason: null, profile };

  const tester = await findTester(db, user);
  if (tester?.status === 'revoked') return { state: 'denied', reason: 'revoked', profile };

  const allowed = tester !== undefined || (await isRegistrationOpen(db));
  if (!allowed) return { state: 'denied', reason: 'not_invited', profile };

  return { state: profile ? 'granted' : 'needs_profile', reason: null, profile };
}

export async function createProfile(db: Db, user: AuthUser, username: string): Promise<Profile> {
  const access = await resolveAccess(db, user);
  if (access.profile) throw new ApiError(409, 'profile_exists', 'You already have a profile.');
  if (access.state === 'denied') {
    throw new ApiError(403, access.reason ?? 'not_invited', denialMessage(access.reason));
  }

  const [taken] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(sql`lower(${profiles.username}) = ${username.toLowerCase()}`);
  if (taken) throw new ApiError(409, 'username_taken', 'That username is already taken.');

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(profiles).values({ userId: user.id, username }).returning();

      // an invitation becomes an active tester; an open-registration signup
      // gets a row too, so it can be revoked like anyone else's
      const [claimed] = await tx
        .update(testerAccess)
        .set({ status: 'active', userId: user.id, updatedAt: new Date() })
        .where(and(eq(testerAccess.email, user.email), eq(testerAccess.status, 'invited')))
        .returning({ email: testerAccess.email });
      if (!claimed) {
        await tx
          .insert(testerAccess)
          .values({ email: user.email, status: 'active', source: 'public', userId: user.id })
          .onConflictDoNothing();
      }

      return toProfile(row!);
    });
  } catch (err) {
    // two people racing for the same name: the unique index settles it
    if (isUniqueViolation(err)) throw new ApiError(409, 'username_taken', 'That username is already taken.');
    throw err;
  }
}

export function denialMessage(reason: DenialReason | null): string {
  return reason === 'revoked'
    ? 'Access for this account has been withdrawn.'
    : 'The archive is invitation-only right now.';
}
