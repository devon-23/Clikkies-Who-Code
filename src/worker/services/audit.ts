import type { Db } from '../db/client.ts';
import { adminAuditLog } from '../db/schema.ts';

// Takes a transaction as readily as a db, so the record is written alongside
// the change it describes or not at all.
export async function audit(
  db: Pick<Db, 'insert'>,
  actorId: string,
  action: string,
  target: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(adminAuditLog).values({ actorId, action, target, detail });
}
