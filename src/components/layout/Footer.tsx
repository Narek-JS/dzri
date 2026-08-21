import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations('shell');

  return (
    <footer className="px-6 py-4 text-xs text-neutral-500">
      <p>{t('footer.tagline')}</p>
      <Link href="/privacy" className="mt-1 inline-block hover:text-brand-strong hover:underline">
        {t('footer.privacyLink')}
      </Link>
    </footer>
  );
}
