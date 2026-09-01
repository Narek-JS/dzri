'use client';

import { useState } from 'react';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useTranslations } from 'next-intl';

import { Button, buttonClassName } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';

import type { ApiErrorCode } from '@/lib/http';

/**
 * Account deletion. Requires an explicit checkbox acknowledgment before the
 * delete button is even enabled, on top of a second confirm dialog — CLAUDE.md
 * asks for more than a single tap here, unlike `LogoutConfirmDialog`, because
 * this one is irreversible (DECISIONS.md, 2026-08-30).
 *
 * `ACCOUNT_HAS_RESERVED_ITEMS` gets its own copy rather than the generic
 * error string: it is the one failure with a real next step (go resolve the
 * reservation first), not just "try again."
 */
export function DeleteAccountSection() {
  const t = useTranslations();
  const router = useRouter();

  const [acknowledged, setAcknowledged] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  async function handleConfirmed() {
    if (deleting) return;

    setDeleting(true);
    setErrorCode(null);
    try {
      await api.auth.deleteAccount();
      setDialogOpen(false);
      router.push('/');
      router.refresh();
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'INTERNAL');
      setDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-red-300 bg-red-50 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-900">{t('account.delete.title')}</h2>
        <p className="text-sm text-neutral-700">{t('account.delete.intro')}</p>
      </div>

      <div className="flex flex-col gap-1 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">{t('account.delete.removedTitle')}</p>
        <ul className="list-disc pl-5">
          <li>{t('account.delete.removedPhone')}</li>
          <li>{t('account.delete.removedName')}</li>
          <li>{t('account.delete.removedListings')}</li>
          <li>{t('account.delete.removedClaims')}</li>
        </ul>
      </div>

      <div className="flex flex-col gap-1 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">{t('account.delete.keptTitle')}</p>
        <ul className="list-disc pl-5">
          <li>{t('account.delete.keptHistory')}</li>
        </ul>
      </div>

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {errorCode === 'ACCOUNT_HAS_RESERVED_ITEMS'
            ? t('account.delete.reservedError')
            : t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      <label className="flex items-start gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        {t('account.delete.acknowledge')}
      </label>

      <div className="flex">
        <Button
          type="button"
          variant="danger"
          disabled={!acknowledged || deleting}
          onClick={() => setDialogOpen(true)}
        >
          {t('account.delete.button')}
        </Button>
      </div>

      <AlertDialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            onClick={() => setDialogOpen(false)}
            className="fixed inset-0 z-50 bg-neutral-900/50"
          />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-red-300 bg-white p-6 shadow-lg">
            <AlertDialog.Title className="text-lg font-semibold text-neutral-900">
              {t('account.delete.dialog.title')}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-neutral-700">
              {t('account.delete.dialog.body')}
            </AlertDialog.Description>

            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button type="button" className={buttonClassName({ variant: 'outline' })}>
                  {t('account.delete.dialog.cancel')}
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                onClick={() => void handleConfirmed()}
                disabled={deleting}
                aria-busy={deleting}
                className={buttonClassName({ variant: 'danger' })}
              >
                {t('account.delete.dialog.confirm')}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
