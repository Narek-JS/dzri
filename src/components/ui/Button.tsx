import { forwardRef } from 'react';

import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center font-medium transition-colors cursor-pointer disabled:cursor-not-allowed';

// BRAND.md contrast rule: a filled #E8894A (bg-brand) fill carries
// near-black text, never white — neutral-900 is a built-in Tailwind
// token, not a raw hex, so it doesn't trip the no-raw-hex rule. White
// text is only safe on the darker brand-strong fill.
//
// `outline` and `danger` are bordered, unfilled buttons — the shape every
// cancel/delete/withdraw/reject/no-show/load-more action on the site had
// been hand-rolling identically instead of sharing. BRAND.md: red means
// destructive/error, never the brand hue, so `danger` is the only variant
// that reaches for it.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'rounded bg-brand text-neutral-900 hover:brightness-95 disabled:opacity-50',
  secondary: 'rounded bg-brand-strong text-white hover:brightness-110 disabled:opacity-50',
  ghost: 'text-brand-strong hover:underline disabled:text-neutral-400 disabled:no-underline',
  outline:
    'rounded border border-neutral-300 text-neutral-800 hover:bg-neutral-50 disabled:opacity-50',
  danger: 'rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50',
};

// `min-h-9` (36px) is the tap-target floor, mobile only — `md:min-h-0`
// steps out of the way and `md:py-*` reproduces exactly today's desktop
// padding, so nothing above `md` moves. Below `md`, the floor — not the
// tightened `py-*` — is what actually produces the rendered 36px: `md`'s
// own padding (py-2) already lands on exactly 36px with text-sm's 20px
// line-height, and `sm`'s (py-1.5) already lands under it at 32px, so
// neither size had slack to shrink below 36px in the first place. Both
// get tighter mobile `py-*` regardless, so the floor is what's carrying
// the height, not leftover desktop padding — the moment text-sm gets any
// shorter pairing or the floor drops, these values start doing real work
// instead of being inert.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-9 px-4 py-1.5 text-sm md:min-h-0 md:py-2',
  sm: 'min-h-9 px-3 py-1 text-sm md:min-h-0 md:py-1.5',
};

// `ghost` renders as bare text with zero padding today (BASE has no
// padding, VARIANT_CLASSES.ghost has none, and `SIZE_CLASSES` was never
// applied to it) — 20px tall at text-sm, well under the floor. Rather
// than adding real padding, this is the floor doing the entire job: pure
// `min-h-9`, so the extra 16px is invisible space split by `items-center`
// (BASE), not a visible padding change to a variant that's deliberately
// plain text.
const GHOST_SIZE_CLASS = 'min-h-9 text-sm md:min-h-0';

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  const sizeClass = variant === 'ghost' ? GHOST_SIZE_CLASS : SIZE_CLASSES[size];
  return [BASE, VARIANT_CLASSES[variant], sizeClass, className].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', ...props },
  ref,
) {
  return <button ref={ref} className={buttonClassName({ variant, size, className })} {...props} />;
});
