import { eq } from 'drizzle-orm';

import { normalizeArmenianPhone } from '../lib/phone';
import { db } from './index';
import { users } from './schema';

/**
 * Grants `is_admin` to the user with a given phone number.
 *
 * There is deliberately no way to become an admin through the API — the
 * moderation surface is seeded out of band, from a machine that already
 * holds DATABASE_URL. Run it as:
 *
 *   npm run db:make-admin -- +37477123456
 *
 * The user must have signed in at least once first: this flips a flag on an
 * existing row, it does not create an account (there is no name to give one).
 */
async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run db:make-admin -- <phone>');
    process.exit(1);
  }

  const phone = normalizeArmenianPhone(input);
  if (!phone) {
    console.error(`Not a valid Armenian (+374) phone number: ${input}`);
    process.exit(1);
  }

  const [updated] = await db
    .update(users)
    .set({ isAdmin: true })
    .where(eq(users.phone, phone))
    .returning({ id: users.id, displayName: users.displayName });

  if (!updated) {
    console.error(
      `No user with phone ${phone}. They must sign in once before they can be made an admin.`,
    );
    process.exit(1);
  }

  console.log(`${updated.displayName} (${updated.id}) is now an admin.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
