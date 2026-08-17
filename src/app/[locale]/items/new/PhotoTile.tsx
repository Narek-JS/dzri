'use client';

import { useTranslations } from 'next-intl';

export type PhotoStatus = 'preparing' | 'uploading' | 'done' | 'error';

type PhotoTileProps = {
  previewUrl: string;
  status: PhotoStatus;
  errorMessage: string | null;
  isCover: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

/**
 * One photo in the create-item form's grid: the preview the browser can
 * already show (an object URL of the file itself — accurate immediately,
 * no need to wait on `prepareImage` or a round trip for something already
 * sitting in memory), a status badge, and the controls API.md's photo UI
 * needs: remove, and reorder via up/down rather than drag-and-drop — no
 * dropzone library is allowed for this task, and up/down buttons are fully
 * keyboard-accessible where a drag handle would not be.
 */
export function PhotoTile({
  previewUrl,
  status,
  errorMessage,
  isCover,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
}: PhotoTileProps) {
  const t = useTranslations('createItem.photos');

  return (
    <div className="relative flex flex-col gap-1">
      <div className="relative aspect-square overflow-hidden rounded border border-neutral-300 bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- a transient
            blob: object URL, never a remote image; next/image has nothing
            to optimize here. */}
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />

        {isCover && (
          <span className="absolute top-1 left-1 rounded bg-brand-strong px-1.5 py-0.5 text-xs font-medium text-white">
            {t('cover')}
          </span>
        )}

        {(status === 'preparing' || status === 'uploading') && (
          <span className="absolute inset-x-0 bottom-0 bg-neutral-900/70 px-1.5 py-0.5 text-center text-xs text-white">
            {status === 'preparing' ? t('status.preparing') : t('status.uploading')}
          </span>
        )}

        {status === 'error' && (
          <span className="absolute inset-0 flex items-center justify-center bg-neutral-900/70 px-1 text-center text-xs text-white">
            {errorMessage}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={t('moveUp')}
            className="cursor-pointer rounded border border-neutral-300 px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={t('moveDown')}
            className="cursor-pointer rounded border border-neutral-300 px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-red-700 hover:underline"
        >
          {t('remove')}
        </button>
      </div>
    </div>
  );
}
