import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { appSettings } from '../db/schema.ts';
import { audit } from './audit.ts';

export async function isRegistrationOpen(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'public_registration'));
  return row?.value === true;
}

export async function setRegistrationOpen(db: Db, actorId: string, open: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: 'public_registration', value: open, updatedBy: actorId })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: open, updatedBy: actorId, updatedAt: new Date() },
      });
    await audit(tx, actorId, open ? 'registration.open' : 'registration.close', null);
  });
}
