'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useTranslations } from 'next-intl';

import { buttonClassName } from '@/components/ui/Button';

/**
 * Radix AlertDialog, not Dialog — this gates a real state change (the
 * session ends), which is exactly what the "alert" semantics are for.
 * Its `Content` hardcodes `preventDefault` on outside pointer/interact
 * events (checked against the package source), so an overlay click would
 * otherwise not dismiss it the way the plain scrim-click drawers elsewhere
 * in this app do — the `Overlay`'s own `onClick` below closes it directly
 * instead of relying on that built-in outside-dismiss behavior. Escape
 * still closes it on its own; only outside-pointer-down is overridden.
 */
export function LogoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('session.logoutConfirm');

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-50 bg-neutral-900/50"
        />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brand-tint bg-white p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-semibold text-neutral-900">
            {t('title')}
          </AlertDialog.Title>

          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button type="button" className={buttonClassName({ variant: 'outline' })}>
                {t('cancel')}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={buttonClassName({ variant: 'secondary' })}
              >
                {t('confirm')}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
