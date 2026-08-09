'use client';

import { useState, type FormEvent } from 'react';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';
import { useSession } from '@/lib/auth/sessionContext';

import type { ApiErrorCode } from '@/lib/http';

/** API.md: optional message, max 300 chars. An empty body is a valid claim. */
const MAX_MESSAGE_LENGTH = 300;

/**
 * "I want this." Never rendered for the owner or for an entitled claimant
 * (the page decides that — see [id]/page.tsx) — this component only has to
 * handle the two remaining cases: signed out, and signed in but not yet
 * decided.
 *
 * Signed out: the button is a link to `/login`, `next` set to the
 * locale-less item path (`resolveSafeNext`'s contract), rather than an
 * inline prompt — the page itself stays open to anonymous browsing (Rule
 * 4), only the tap to claim asks for a session.
 *
 * There is no endpoint to ask ahead of time whether this viewer already
 * claimed the item (TODO.md), so `ALREADY_CLAIMED` from the POST itself is
 * the first time this component can know — handled as its own state,
 * indistinguishable in the UI from a fresh success, since either way the
 * right next action is the same: wait for the giver.
 */
export function ClaimButton({ itemId }: { itemId: string }) {
  const t = useTranslations();
  const session = useSession();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'alreadyClaimed'>('idle');
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  if (!session) {
    return (
      <Link
        href={{ pathname: '/login', query: { next: `/items/${itemId}` } }}
        className="inline-block w-fit rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900"
      >
        {t('itemDetail.claim.submit')}
      </Link>
    );
  }

  if (status === 'sent' || status === 'alreadyClaimed') {
    return (
      <div className="flex flex-col gap-1 rounded border border-brand-strong bg-brand-tint p-4">
        <p className="text-sm font-medium text-brand-strong">
          {status === 'sent'
            ? t('itemDetail.claim.success.title')
            : t('itemDetail.claim.alreadyClaimed.title')}
        </p>
        <p className="text-sm text-neutral-700">
          {status === 'sent'
            ? t('itemDetail.claim.success.description')
            : t('itemDetail.claim.alreadyClaimed.description')}
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === 'submitting') return;

    setStatus('submitting');
    setErrorCode(null);
    try {
      await api.claims.create(itemId, { message: message.trim() || undefined });
      setStatus('sent');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'ALREADY_CLAIMED') {
        setStatus('alreadyClaimed');
        return;
      }

      setErrorCode(error instanceof ApiClientError ? error.code : 'INTERNAL');
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="claim-message" className="text-sm font-medium">
        {t('itemDetail.claim.message.label')}
      </label>
      <textarea
        id="claim-message"
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t('itemDetail.claim.message.placeholder')}
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-fit rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {t('itemDetail.claim.submit')}
      </button>
    </form>
  );
}
