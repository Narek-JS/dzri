import { db } from '@/db';
import { users } from '@/db/schema';
import { normalizeArmenianPhone } from '@/lib/phone';

import friends from './seed-data/friends.json';

/**
 * One-time pre-launch seed: creates real accounts for friends of the
 * founder who agreed to have their accounts created this way, so the
 * feed isn't empty at launch. Not a general auth bypass — there is no
 * API path that does this, only this script, run by hand against
 * DATABASE_URL:
 *
 *   npm run db:seed-friends
 *
 * Idempotent: a phone that already has a row is left untouched and
 * reported as "already existed", so a partial failure can be re-run
 * safely.
 */

type Friend = { name: string; phone: string };

type Row = { name: string; phone: string; status: 'created' | 'already existed' };

function normalizeAll(entries: Friend[]): (Friend & { normalizedPhone: string })[] {
  const failures: string[] = [];
  const normalized: (Friend & { normalizedPhone: string })[] = [];

  for (const entry of entries) {
    const normalizedPhone = normalizeArmenianPhone(entry.phone);
    if (!normalizedPhone) {
      failures.push(`${entry.name} (${entry.phone}): not a valid Armenian phone number`);
      continue;
    }
    normalized.push({ ...entry, normalizedPhone });
  }

  if (failures.length > 0) {
    console.error('Aborting: the following entries failed validation:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  return normalized;
}

async function main(): Promise<void> {
  const normalized = normalizeAll(friends);
  const rows: Row[] = [];

  for (const friend of normalized) {
    const [inserted] = await db
      .insert(users)
      .values({
        phone: friend.normalizedPhone,
        displayName: friend.name,
        isAdmin: false,
        isBanned: false,
      })
      .onConflictDoNothing({ target: users.phone })
      .returning({ id: users.id });

    rows.push({
      name: friend.name,
      phone: friend.normalizedPhone,
      status: inserted ? 'created' : 'already existed',
    });
  }

  console.table(rows);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
