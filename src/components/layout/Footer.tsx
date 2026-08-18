import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('shell');

  return (
    <footer className="px-6 py-4 text-xs text-neutral-500">
      <p>{t('footer.tagline')}</p>
    </footer>
  );
}
