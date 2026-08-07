import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting is not optional (see DECISIONS.md — an unthrottled OTP
 * endpoint is a direct SMS bill). In production, missing Upstash
 * credentials are a hard failure: the endpoint refuses to run rather
 * than running unmetered. Locally the limiters fall back to an
 * in-process counter so `npm run dev` works without a Redis account,
 * with the same semantics from the handler's point of view.
 *
 * Every env read is lazy. Reading at module scope would make `next
 * build` fail on a machine that has no secrets.
 */

export type RateLimitVerdict = {
  success: boolean;
  /** Unix ms at which the caller may retry. */
  reset: number;
};

export interface Limiter {
  limit(identifier: string): Promise<RateLimitVerdict>;
}

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

type LimiterSpec = {
  /** Redis key namespace. Distinct per limiter or budgets bleed together. */
  prefix: string;
  tokens: number;
  window: Window;
  windowMs: number;
};

/** 3 codes per phone per hour. */
const OTP_REQUEST_PER_PHONE: LimiterSpec = {
  prefix: 'otp:req:phone',
  tokens: 3,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

/** 10 codes per IP per hour — one attacker walking a range of numbers. */
const OTP_REQUEST_PER_IP: LimiterSpec = {
  prefix: 'otp:req:ip',
  tokens: 10,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

/** Anti-double-tap. Checked before the hourly budgets are spent. */
const OTP_REQUEST_COOLDOWN: LimiterSpec = {
  prefix: 'otp:req:cooldown',
  tokens: 1,
  window: '30 s',
  windowMs: 30 * 1000,
};

/**
 * Verify is limited too (CLAUDE.md). The 5-attempt cap already kills an
 * individual code; this stops someone burning through freshly requested
 * codes, and caps the DB reads an anonymous caller can force.
 */
const OTP_VERIFY_PER_PHONE: LimiterSpec = {
  prefix: 'otp:vfy:phone',
  tokens: 10,
  window: '15 m',
  windowMs: 15 * 60 * 1000,
};

const OTP_VERIFY_PER_IP: LimiterSpec = {
  prefix: 'otp:vfy:ip',
  tokens: 30,
  window: '15 m',
  windowMs: 15 * 60 * 1000,
};

/**
 * Image upload is one of the endpoints CLAUDE.md requires a limiter on.
 * Each presign hands out write access to R2 for one object; without a cap a
 * single authenticated account could mint thousands of upload URLs. The
 * per-IP budget is the looser of the two so a couple of real users behind
 * one NAT do not throttle each other.
 *
 * Doubled when the two-variant pipeline landed: every photo is now an original
 * *and* a thumb, so six photos cost twelve presigns and one full item costs
 * twelve of a budget that used to be thirty. The old 60/IP would have become
 * the binding limit for two people on one connection posting normal listings,
 * which is a throttle on real use rather than on abuse.
 */
const IMAGE_PRESIGN_PER_USER: LimiterSpec = {
  prefix: 'img:presign:user',
  tokens: 60,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

const IMAGE_PRESIGN_PER_IP: LimiterSpec = {
  prefix: 'img:presign:ip',
  tokens: 120,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

/**
 * Item create is on the CLAUDE.md list of endpoints that must be limited.
 * Each accepted item is a moderation-queue entry and a set of R2 objects
 * bound into a listing, so an unthrottled create is a spam vector. Per-user
 * is the tighter budget; per-IP is looser so two real users behind one NAT
 * do not throttle each other.
 */
const ITEM_CREATE_PER_USER: LimiterSpec = {
  prefix: 'item:create:user',
  tokens: 10,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

const ITEM_CREATE_PER_IP: LimiterSpec = {
  prefix: 'item:create:ip',
  tokens: 20,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

/**
 * Claim create is on the CLAUDE.md list of endpoints that must be limited. A
 * claim is a notification to a giver and a row in their decision list, so an
 * unthrottled create lets one account bury every listing on the platform. The
 * budget is deliberately looser than item create — claiming is the cheap side
 * of the interaction and a keen user browsing the feed genuinely does claim
 * several things in a sitting. Per-IP is looser again so a couple of real
 * users behind one NAT do not throttle each other.
 */
const CLAIM_CREATE_PER_USER: LimiterSpec = {
  prefix: 'claim:create:user',
  tokens: 20,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

const CLAIM_CREATE_PER_IP: LimiterSpec = {
  prefix: 'claim:create:ip',
  tokens: 40,
  window: '1 h',
  windowMs: 60 * 60 * 1000,
};

/**
 * The public feed is anonymous and indexable, so its only budget is per-IP.
 * Set high on purpose (DECISIONS.md-style reasoning in the route): a stranger
 * off a TikTok link scrolling the feed must never be throttled, while a script
 * hammering it still hits a ceiling. This is a read against a short shared
 * cache, so most hits never reach the handler at all — the limiter is the
 * floor under the cache, not the primary defense.
 */
const FEED_PER_IP: LimiterSpec = {
  prefix: 'feed:ip',
  tokens: 120,
  window: '1 m',
  windowMs: 60 * 1000,
};

/** Fixed-window counter used only when there is no Redis (local dev). */
class InMemoryLimiter implements Limiter {
  private readonly counters = new Map<string, { count: number; reset: number }>();

  constructor(private readonly spec: LimiterSpec) {}

  async limit(identifier: string): Promise<RateLimitVerdict> {
    const now = Date.now();
    const existing = this.counters.get(identifier);

    if (!existing || existing.reset <= now) {
      const reset = now + this.spec.windowMs;
      this.counters.set(identifier, { count: 1, reset });
      return { success: true, reset };
    }

    existing.count += 1;
    return { success: existing.count <= this.spec.tokens, reset: existing.reset };
  }
}

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    redis = new Redis({ url, token });
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
        'Rate limiting cannot be skipped in production.',
    );
  } else {
    redis = null;
  }

  return redis;
}

const limiters = new Map<string, Limiter>();

function getLimiter(spec: LimiterSpec): Limiter {
  const cached = limiters.get(spec.prefix);
  if (cached) return cached;

  const client = getRedis();
  const limiter: Limiter = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(spec.tokens, spec.window),
        prefix: spec.prefix,
        analytics: false,
      })
    : new InMemoryLimiter(spec);

  limiters.set(spec.prefix, limiter);
  return limiter;
}

export const otpRequestPerPhone = (): Limiter => getLimiter(OTP_REQUEST_PER_PHONE);
export const otpRequestPerIp = (): Limiter => getLimiter(OTP_REQUEST_PER_IP);
export const otpRequestCooldown = (): Limiter => getLimiter(OTP_REQUEST_COOLDOWN);
export const otpVerifyPerPhone = (): Limiter => getLimiter(OTP_VERIFY_PER_PHONE);
export const otpVerifyPerIp = (): Limiter => getLimiter(OTP_VERIFY_PER_IP);
export const imagePresignPerUser = (): Limiter => getLimiter(IMAGE_PRESIGN_PER_USER);
export const imagePresignPerIp = (): Limiter => getLimiter(IMAGE_PRESIGN_PER_IP);
export const itemCreatePerUser = (): Limiter => getLimiter(ITEM_CREATE_PER_USER);
export const itemCreatePerIp = (): Limiter => getLimiter(ITEM_CREATE_PER_IP);
export const claimCreatePerUser = (): Limiter => getLimiter(CLAIM_CREATE_PER_USER);
export const claimCreatePerIp = (): Limiter => getLimiter(CLAIM_CREATE_PER_IP);
export const feedPerIp = (): Limiter => getLimiter(FEED_PER_IP);

/**
 * Vercel sets `x-forwarded-for`; the left-most entry is the client. The
 * fallback only ever applies locally — behind the platform proxy the
 * header is always present and cannot be spoofed past it.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** `Retry-After` is in whole seconds, and must be at least 1. */
export function retryAfterHeader(reset: number): Record<string, string> {
  const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { 'Retry-After': String(seconds) };
}
