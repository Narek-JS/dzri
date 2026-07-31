/**
 * Unit tests import modules that build a database client and read the
 * auth secret at import time — `src/lib/auth/otp.ts` pulls in `@/db` for
 * its query helpers even though the hashing functions under test never
 * touch it.
 *
 * So: fixed, obviously-fake values. Nothing here connects to anything.
 * The secret is a constant rather than whatever happens to be in
 * .env.local so that hash assertions do not depend on the machine.
 */
process.env.DATABASE_URL = 'postgresql://unit:test@127.0.0.1:5432/unit-tests-never-connect';
process.env.JWT_SECRET = 'unit-test-secret-not-used-for-anything-real';
