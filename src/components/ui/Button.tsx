import { forwardRef } from 'react';

import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'md' | 'sm';

const BASE = 'inline-flex items-center justify-center font-medium transition-colors';

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

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-sm',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  const sizeClass = variant === 'ghost' ? 'text-sm' : SIZE_CLASSES[size];
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
