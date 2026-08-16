import type { HTMLAttributes } from 'react';

export type NoticeTone = 'brand' | 'neutral' | 'error' | 'subtle' | 'strong';
export type NoticeSize = 'sm' | 'md' | 'lg' | 'compact';

// Border + background only — text color and layout (flex/gap) are left to
// the caller via `className`, the same split Button.tsx's VARIANT_CLASSES
// keeps from its BASE layout classes.
const TONE_CLASSES: Record<NoticeTone, string> = {
  brand: 'border-brand-strong bg-brand-tint',
  neutral: 'border-neutral-300 bg-neutral-50',
  error: 'border-red-300 bg-red-50',
  subtle: 'border-neutral-300 bg-white',
  strong: 'border-neutral-400 bg-white',
};

const SIZE_CLASSES: Record<NoticeSize, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  compact: 'px-4 py-2',
};

export function noticeClassName({
  tone = 'neutral',
  size = 'md',
  className = '',
}: {
  tone?: NoticeTone;
  size?: NoticeSize;
  className?: string;
} = {}): string {
  return ['rounded border', TONE_CLASSES[tone], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');
}

export function Notice({
  tone = 'neutral',
  size = 'md',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone; size?: NoticeSize }) {
  return <div className={noticeClassName({ tone, size, className })} {...props} />;
}
