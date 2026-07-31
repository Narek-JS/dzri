import { spawn, type ChildProcess } from 'node:child_process';

import { config } from 'dotenv';

/**
 * Provides a running server for the integration suite. Integration tests
 * hit real route handlers over HTTP against a real Neon branch
 * (CLAUDE.md) — nothing here is mocked.
 *
 * Without DATABASE_URL this is a no-op and the suite skips itself, so the
 * tests stay runnable on a machine with no secrets.
 *
 * Its own port and its own build directory, so a run never collides with
 * a dev server the developer already has open — Next allows a second dev
 * server only when it is not writing to the same `distDir`. The
 * separation also means the force-kill in `teardown` can only ever
 * truncate files under `.next-test`, which nothing else reads. Killing a
 * server that shares `.next` corrupts generated types often enough to
 * break `npm run typecheck` and the following run.
 */

const PORT = 3100;

/** Must stay in sync with `distDir` in next.config.ts. */
const DIST_DIR = '.next-test';

export const TEST_BASE_URL = `http://127.0.0.1:${PORT}`;

/** A cold `next dev` also has to compile the route on first request. */
const READY_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;

let server: ChildProcess | undefined;

/** Kept so a server that dies on startup reports why, instead of timing out. */
let serverOutput = '';

/** Any HTTP response means something is serving this app. */
async function isServerUp(timeoutMs: number): Promise<boolean> {
  try {
    await fetch(`${TEST_BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(exited: AbortSignal): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (exited.aborted) {
      throw new Error(`Next dev server exited before it became ready:\n${serverOutput}`);
    }

    if (await isServerUp(PROBE_TIMEOUT_MS)) return;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Next dev server was not ready within ${READY_TIMEOUT_MS}ms:\n${serverOutput}`);
}

export async function setup(): Promise<void> {
  config({ path: '.env.local', quiet: true });

  if (!process.env.DATABASE_URL) {
    console.warn(
      '\n  DATABASE_URL is not set — skipping integration tests.\n' +
        '  Point it at a Neon *branch*, not production: these tests write and delete rows.\n',
    );
    return;
  }

  process.env.TEST_BASE_URL = TEST_BASE_URL;

  // Only happens if a previous run leaked its server. Reuse it rather
  // than failing on a port collision, and leave it alone at teardown —
  // it is not this run's to kill.
  if (await isServerUp(PROBE_TIMEOUT_MS)) {
    console.log(`\n  Reusing the server already listening on ${TEST_BASE_URL}\n`);
    return;
  }

  const exited = new AbortController();

  server = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
    env: { ...process.env, NEXT_DIST_DIR: DIST_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  const record = (chunk: Buffer): void => {
    serverOutput += chunk.toString();
  };
  server.stdout?.on('data', record);
  server.stderr?.on('data', record);

  server.once('exit', () => exited.abort());

  await waitForServer(exited.signal);
}

export async function teardown(): Promise<void> {
  // Undefined when the suite skipped, or when it reused a server someone
  // else started — that one is not ours to kill.
  if (!server?.pid) return;

  const child = server;
  server = undefined;

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

  if (process.platform === 'win32') {
    // `shell: true` means the pid is the shell's. Without /T the actual
    // node process survives and holds the port.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }

  // Wait for it to actually go, so a run started straight afterwards does
  // not find the port still held.
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
}
