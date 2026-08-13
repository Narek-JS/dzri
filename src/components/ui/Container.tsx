import type { HTMLAttributes } from 'react';

export type ContainerSize = 'sm' | 'md' | 'lg';

// One shared scale so every page's content column and the header row line
// up under the same rule, instead of each screen picking its own max-w.
// `lg` (matches the feed's card grid, the widest content on the site) is
// also what the header uses, so the wordmark and the first row of cards
// share a left edge at any viewport width. Narrower screens (item detail,
// admin, my-items/my-claims, create-item, claims board) keep the reading-
// width `sm`/`md` they already had — this is a container fix, not a
// rewrite of each page's column width.
const SIZE_CLASSES: Record<ContainerSize, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-6xl',
};

export function containerClassName({
  size = 'lg',
  className = '',
}: {
  size?: ContainerSize;
  className?: string;
} = {}): string {
  return ['mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');
}

export function Container({
  size = 'lg',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: ContainerSize }) {
  return <div className={containerClassName({ size, className })} {...props} />;
}
