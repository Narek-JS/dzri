import { forwardRef } from 'react';

import type { SelectHTMLAttributes } from 'react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`w-full appearance-none rounded border border-neutral-300 bg-white px-3 py-2 pr-8 text-sm focus:border-brand-strong focus:ring-1 focus:ring-brand-strong focus:outline-none disabled:opacity-50 ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-neutral-500"
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  },
);
