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

// Vertical only, mobile only — horizontal padding is unchanged at every
// breakpoint per the brief. `sm`/`md`/`lg` each step their `py-*` down
// one notch below `md` (matching Button.tsx's new mobile height) and
// restore today's value at `md` and up. `compact` is left alone: at
// `py-2` (8px) it's already tighter than any of the other three even
// before this pass, so there's no "reads as tall" case to fix there.
const SIZE_CLASSES: Record<NoticeSize, string> = {
  sm: 'px-3 py-2 md:py-3',
  md: 'px-4 py-3 md:py-4',
  lg: 'px-6 py-4 md:py-6',
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
