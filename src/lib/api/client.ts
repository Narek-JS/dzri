import type { ApiErrorBody, ApiErrorCode } from '@/lib/http';

// `import type` only — erased at compile time, so none of drizzle-orm/
// pg-core comes along with these. The status/condition unions are typed
// straight off the schema so this file cannot drift from what a route
// handler actually returns.
import type {
  ClaimRejectedReason,
  ClaimStatus,
  ItemCondition,
  ItemStatus,
} from '@/db/schema';

/**
 * A typed wrapper around `fetch` for every endpoint in API.md. One module,
 * per the brief — it stays a single file on purpose rather than splitting
 * into per-resource files, so there is exactly one place to check when an
 * endpoint's shape changes.
 *
 * Request/response types below are transcribed from the route handlers in
 * src/app/api (read directly, not guessed) and cross-checked against
 * API.md. `fetch`'s default `credentials` mode is already `same-origin`,
 * which is all the session cookie needs (API.md) — nothing here sets it
 * explicitly.
 */

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Carries the HTTP status and the stable `code` from the `{ error: { code,
 * message } }` envelope (CLAUDE.md, API.md). `message` is the server's log
 * string — never render it to a user. Map `code` through
 * `apiErrorMessageKey` to an i18n key instead.
 *
 * `retryAfterSeconds` mirrors a `Retry-After` header on a 429 (API.md: "in
 * whole seconds"). Undefined when the header is missing or not a
 * non-negative integer — callers fall back to their own default cooldown
 * rather than trusting a malformed value.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: ApiErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Whole non-negative seconds only — anything else is treated as absent. */
function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get('Retry-After');
  if (raw === null || !/^\d+$/.test(raw)) return undefined;

  return Number(raw);
}

/**
 * Every `ApiErrorCode` mapped to a key under the `errors` namespace in
 * messages/{hy,ru,en}.json. `ITEM_NOT_FOUND`, `CLAIM_NOT_FOUND` and
 * `NOT_FOUND` all land on `errors.notFound` — API.md Rule 2: several
 * endpoints return 404 where 403 would be natural, deliberately, and the
 * UI must render "not found," never "no permission," so there is no
 * "forbidden" key for these to reach for instead.
 */
const ERROR_MESSAGE_KEYS: Record<ApiErrorCode, string> = {
  INVALID_PHONE: 'errors.invalidPhone',
  RATE_LIMITED: 'errors.rateLimited',
  INVALID_CODE: 'errors.invalidCode',
  CODE_EXPIRED: 'errors.codeExpired',
  TOO_MANY_ATTEMPTS: 'errors.tooManyAttempts',
  USER_BANNED: 'errors.userBanned',
  NAME_REQUIRED: 'errors.nameRequired',
  INVALID_FILE_TYPE: 'errors.invalidFileType',
  FILE_TOO_LARGE: 'errors.fileTooLarge',
  INVALID_CATEGORY: 'errors.invalidCategory',
  INVALID_DISTRICT: 'errors.invalidDistrict',
  IMAGES_REQUIRED: 'errors.imagesRequired',
  TOO_MANY_IMAGES: 'errors.tooManyImages',
  INVALID_IMAGE_KEY: 'errors.invalidImageKey',
  IMAGE_NOT_FOUND: 'errors.imageNotFound',
  ITEM_NOT_FOUND: 'errors.notFound',
  CANNOT_CLAIM_OWN_ITEM: 'errors.cannotClaimOwnItem',
  ALREADY_CLAIMED: 'errors.alreadyClaimed',
  CLAIM_NOT_FOUND: 'errors.notFound',
  INVALID_STATUS_TRANSITION: 'errors.invalidStatusTransition',
  NOT_FOUND: 'errors.notFound',
  INVALID_BODY: 'errors.invalidBody',
  UNAUTHORIZED: 'errors.unauthorized',
  SMS_FAILED: 'errors.smsFailed',
  INTERNAL: 'errors.internal',
};

/** `t(apiErrorMessageKey(error.code))` — never `error.message`. */
export function apiErrorMessageKey(code: ApiErrorCode): string {
  return ERROR_MESSAGE_KEYS[code];
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return '';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

async function apiFetch<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      response.status,
      body?.error.code ?? 'INTERNAL',
      body?.error.message ?? 'Request failed',
      parseRetryAfterSeconds(response.headers),
    );
  }

  // No endpoint in API.md returns an empty body on success, but a future
  // 204 shouldn't throw trying to parse one.
  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

type DistrictRef = { slug: string; nameHy: string; nameRu: string; nameEn: string };
type CategoryRef = { slug: string; nameHy: string; nameRu: string; nameEn: string };

export type District = DistrictRef & { id: number };
export type Category = CategoryRef & {
  id: number;
  icon: string | null;
  position: number;
};

// ---------------------------------------------------------------------------
// GET /api/reference
// ---------------------------------------------------------------------------

export type ReferenceResponse = { districts: District[]; categories: Category[] };

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type OtpRequestBody = { phone: string };
export type OtpRequestResponse = { sent: true; expiresInSeconds: number };

export type OtpVerifyBody = { phone: string; code: string; displayName?: string };
export type OtpVerifyResponse =
  { isNewUser: true } | { isNewUser: false; user: { id: string; displayName: string } };

export type Me = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  districtId: number | null;
  createdAt: string;
  lastSeenAt: string | null;
};
export type MeResponse = { user: Me };

export type LogoutResponse = { ok: true };

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export type ImageVariant = 'original' | 'thumb';
export type PresignBody = { contentType: string; contentLength: number; variant: ImageVariant };
export type PresignResponse = { uploadUrl: string; key: string; publicUrl: string };

// ---------------------------------------------------------------------------
// Items — public
// ---------------------------------------------------------------------------

export type FeedQuery = {
  district?: string;
  category?: string;
  condition?: ItemCondition;
  cursor?: string;
};

export type FeedItem = {
  id: string;
  title: string;
  condition: ItemCondition;
  createdAt: string;
  thumbnailUrl: string | null;
  district: DistrictRef;
  category: CategoryRef;
};

export type FeedResponse = { items: FeedItem[]; nextCursor: string | null };

export type ItemImageDetail = {
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  position: number;
};

export type ItemDetail = {
  id: string;
  title: string;
  description: string | null;
  condition: ItemCondition;
  pickupNotes: string | null;
  status: ItemStatus;
  createdAt: string;
  expiresAt: string;
  images: ItemImageDetail[];
  district: DistrictRef;
  category: CategoryRef;
  // Never a phone — not for the owner, not for the approved claimant. See
  // API.md and DECISIONS.md (2026-08-08, "the phone reveal is a SQL CASE").
  giver: { displayName: string; avatarUrl: string | null };
};

export type ItemDetailResponse = { item: ItemDetail };

export type RemoveItemResponse = { id: string; status: 'removed' };

// ---------------------------------------------------------------------------
// Items — authenticated
// ---------------------------------------------------------------------------

export type CreateItemImage = {
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  blurhash: string;
};

export type CreateItemBody = {
  title: string;
  description?: string | null;
  categoryId: number;
  districtId: number;
  condition: ItemCondition;
  pickupNotes?: string | null;
  images: CreateItemImage[];
};

export type CreateItemResponse = { id: string; status: ItemStatus };

export type MyItemsQuery = { cursor?: string };

export type MyItem = {
  id: string;
  title: string;
  status: ItemStatus;
  rejectionReason: string | null;
  createdAt: string;
  expiresAt: string;
  imageUrl: string | null;
  claimCount: number;
  pendingClaimCount: number;
};

export type MyItemsResponse = { items: MyItem[]; nextCursor: string | null };

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type CreateClaimBody = { message?: string | null };
export type CreateClaimResponse = { id: string; status: 'pending' };

/**
 * `phone` is optional and only ever present when `status === 'approved'` —
 * one of the three sanctioned phone-bearing shapes (CLAUDE.md, API.md Rule
 * 1). Modeled as an optional key, never a nullable one: the server omits
 * the key entirely rather than sending `null` (DECISIONS.md, 2026-08-07).
 */
export type ClaimForOwner = {
  id: string;
  status: ClaimStatus;
  message: string | null;
  createdAt: string;
  claimant: {
    displayName: string;
    avatarUrl: string | null;
    reliability: { completed: number; noShows: number };
    phone?: string;
  };
};

export type ClaimsForItemResponse = { claims: ClaimForOwner[] };

/**
 * The one response in the whole API where a phone is unconditional
 * (API.md: "the only response in the entire API that returns a phone
 * number"). Reached only on a successful `pending → approved` transition.
 */
export type ApproveClaimResponse = {
  id: string;
  status: 'approved';
  reservedUntil: string;
  giverPhone: string;
  claimantPhone: string;
};

export type RejectClaimResponse = { id: string; status: 'rejected' };
export type WithdrawClaimResponse = { id: string; status: 'withdrawn' };
export type CompleteClaimResponse = { id: string; status: 'completed' };
export type NoShowClaimResponse = { id: string; status: 'no_show' };

export type MyClaimsQuery = { cursor?: string };

/**
 * `giver.phone` — optional, present only when `status === 'approved'`.
 * `rejectedReason` — optional, present only when `status === 'rejected'`.
 */
export type MyClaim = {
  id: string;
  status: ClaimStatus;
  rejectedReason?: ClaimRejectedReason;
  message: string | null;
  createdAt: string;
  item: { id: string; title: string; status: ItemStatus; thumbnailUrl: string | null };
  giver: { displayName: string; phone?: string };
};

export type MyClaimsResponse = { claims: MyClaim[]; nextCursor: string | null };

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type PendingItemsQuery = { cursor?: string };

export type PendingItem = {
  id: string;
  title: string;
  description: string | null;
  condition: ItemCondition;
  pickupNotes: string | null;
  createdAt: string;
  images: string[];
  district: DistrictRef;
  category: CategoryRef;
  giver: { displayName: string; approvedCount: number; rejectedCount: number };
};

export type PendingItemsResponse = { items: PendingItem[]; nextCursor: string | null };

export type ApproveItemResponse = { id: string; status: 'active' };

export type RejectItemBody = { reason: string };
export type RejectItemResponse = { id: string; status: 'rejected' };

export type AdminStatsResponse = {
  counts: Record<ItemStatus, number>;
  pendingCount: number;
  oldestPendingAt: string | null;
  oldestPendingAgeSeconds: number | null;
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const api = {
  reference: {
    get: () => apiFetch<ReferenceResponse>('/api/reference'),
  },

  auth: {
    requestOtp: (body: OtpRequestBody) =>
      apiFetch<OtpRequestResponse>('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    verifyOtp: (body: OtpVerifyBody) =>
      apiFetch<OtpVerifyResponse>('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    me: () => apiFetch<MeResponse>('/api/auth/me'),

    logout: () => apiFetch<LogoutResponse>('/api/auth/logout', { method: 'POST' }),
  },

  images: {
    presign: (body: PresignBody) =>
      apiFetch<PresignResponse>('/api/images/presign', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  items: {
    feed: (query: FeedQuery = {}) => apiFetch<FeedResponse>(`/api/items${buildQuery(query)}`),

    get: (id: string) => apiFetch<ItemDetailResponse>(`/api/items/${id}`),

    create: (body: CreateItemBody) =>
      apiFetch<CreateItemResponse>('/api/items', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    remove: (id: string) => apiFetch<RemoveItemResponse>(`/api/items/${id}`, { method: 'DELETE' }),

    mine: (query: MyItemsQuery = {}) =>
      apiFetch<MyItemsResponse>(`/api/items/mine${buildQuery(query)}`),
  },

  claims: {
    create: (itemId: string, body: CreateClaimBody = {}) =>
      apiFetch<CreateClaimResponse>(`/api/items/${itemId}/claims`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    listForItem: (itemId: string) => apiFetch<ClaimsForItemResponse>(`/api/items/${itemId}/claims`),

    approve: (id: string) =>
      apiFetch<ApproveClaimResponse>(`/api/claims/${id}/approve`, { method: 'POST' }),

    reject: (id: string) =>
      apiFetch<RejectClaimResponse>(`/api/claims/${id}/reject`, { method: 'POST' }),

    withdraw: (id: string) =>
      apiFetch<WithdrawClaimResponse>(`/api/claims/${id}/withdraw`, { method: 'POST' }),

    complete: (id: string) =>
      apiFetch<CompleteClaimResponse>(`/api/claims/${id}/complete`, { method: 'POST' }),

    noShow: (id: string) =>
      apiFetch<NoShowClaimResponse>(`/api/claims/${id}/no-show`, { method: 'POST' }),

    mine: (query: MyClaimsQuery = {}) =>
      apiFetch<MyClaimsResponse>(`/api/claims/mine${buildQuery(query)}`),
  },

  admin: {
    pendingItems: (query: PendingItemsQuery = {}) =>
      apiFetch<PendingItemsResponse>(`/api/admin/items/pending${buildQuery(query)}`),

    approveItem: (id: string) =>
      apiFetch<ApproveItemResponse>(`/api/admin/items/${id}/approve`, { method: 'POST' }),

    rejectItem: (id: string, body: RejectItemBody) =>
      apiFetch<RejectItemResponse>(`/api/admin/items/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    stats: () => apiFetch<AdminStatsResponse>('/api/admin/stats'),
  },
};
