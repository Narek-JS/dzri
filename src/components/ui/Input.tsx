import { forwardRef } from 'react';

import type { InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-strong focus:ring-1 focus:ring-brand-strong focus:outline-none disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  },
);
