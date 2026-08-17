import Image from 'next/image';

const SIZE_PX = 32;

/**
 * Circular account indicator: the signed-in user's photo when `avatarUrl`
 * is set, otherwise the uppercased first character of `displayName` on a
 * brand-tint field. `avatarUrl` is null for effectively every user today
 * (CLAUDE.md — there is no upload path for it yet), so the initial is the
 * common case this renders, not a rare fallback.
 */
export function Avatar({
  displayName,
  avatarUrl,
  className = '',
}: {
  displayName: string;
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-tint text-sm font-medium text-brand-strong ${className}`}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName}
          fill
          sizes={`${SIZE_PX}px`}
          className="object-cover"
        />
      ) : (
        displayName.charAt(0).toUpperCase()
      )}
    </span>
  );
}
