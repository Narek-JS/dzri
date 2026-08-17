import type { HTMLAttributes } from 'react';

// Vertical only, mobile only — `px-6` (horizontal) is unchanged at every
// breakpoint per the brief; `py-6` (24px) reads noticeably taller than a
// mobile Button now that Button.tsx floors at 36px, so it steps down to
// `py-4` (16px) below `md`, back to `py-6` at `md` and up.
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white px-6 py-4 shadow-sm md:py-6 ${className}`}
      {...props}
    />
  );
}
