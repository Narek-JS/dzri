import { config } from 'dotenv';

/**
 * The test worker is a separate process from globalSetup, and it needs
 * the same DATABASE_URL and JWT_SECRET the server is running with — the
 * suite seeds `otp_codes` directly, and the hash it stores has to be the
 * one the server computes.
 */
config({ path: '.env.local', quiet: true });
