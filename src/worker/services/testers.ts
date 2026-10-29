import { count, desc, eq } from 'drizzle-orm';
import type { AdminOverview, Tester } from '../../shared/api.ts';
import type { Db } from '../db/client.ts';
import { adminAuditLog, profiles, testerAccess } from '../db/schema.ts';
import { ApiError } from '../lib/http.ts';
import { audit } from './audit.ts';
import { isRegistrationOpen } from './settings.ts';

export async function adminOverview(db: Db): Promise<AdminOverview> {
  const testerRows = await db
    .select({ t: testerAccess, username: profiles.username })
    .from(testerAccess)
    .leftJoin(profiles, eq(profiles.userId, testerAccess.userId))
    .orderBy(desc(testerAccess.createdAt));

  const auditRows = await db
    .select({ a: adminAuditLog, actor: profiles.username })
    .from(adminAuditLog)
    .leftJoin(profiles, eq(profiles.userId, adminAuditLog.actorId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(25);

  const roleCounts = await db
    .select({ role: profiles.role, n: count() })
    .from(profiles)
    .groupBy(profiles.role);

  const testers: Tester[] = testerRows.map(({ t, username }) => ({
    email: t.email,
    status: t.status,
    source: t.source,
    note: t.note,
    username,
    createdAt: t.createdAt.toISOString(),
    revokedAt: t.revokedAt?.toISOString() ?? null,
  }));

  const n = (role: string) => roleCounts.find((r) => r.role === role)?.n ?? 0;
  const by = (status: string) => testers.filter((t) => t.status === status).length;

  return {
    registrationOpen: await isRegistrationOpen(db),
    testers,
    audit: auditRows.map(({ a, actor }) => ({
      id: a.id,
      action: a.action,
      target: a.target,
      actor,
      createdAt: a.createdAt.toISOString(),
    })),
    counts: {
      profiles: n('player') + n('admin'),
      admins: n('admin'),
      activeTesters: by('active'),
      invited: by('invited'),
      revoked: by('revoked'),
    },
  };
}

export async function inviteTester(db: Db, actorId: string, email: string, note?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(testerAccess)
      .values({ email, note: note || null, invitedBy: actorId })
      .onConflictDoNothing()
      .returning({ email: testerAccess.email });
    if (!row) throw new ApiError(409, 'conflict', 'That address is already on the list.');
    await audit(tx, actorId, 'tester.invite', email);
  });
}

export async function setTesterRevoked(
  db: Db, actorId: string, actorEmail: string, email: string, revoked: boolean,
): Promise<void> {
  if (revoked && email === actorEmail) {
    throw new ApiError(400, 'invalid', 'You cannot revoke your own access.');
  }

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(testerAccess).where(eq(testerAccess.email, email));
    if (!current) throw new ApiError(404, 'not_found', 'No tester with that address.');

    // restoring puts them back where they were: active if they ever made an
    // account, invited if they never got that far
    const status = revoked ? 'revoked' : current.userId ? 'active' : 'invited';
    await tx
      .update(testerAccess)
      .set({ status, revokedAt: revoked ? new Date() : null, updatedAt: new Date() })
      .where(eq(testerAccess.email, email));
    await audit(tx, actorId, revoked ? 'tester.revoke' : 'tester.restore', email);
  });
}
