import { getTranslations, setRequestLocale } from 'next-intl/server';

import { containerClassName } from '@/components/ui/Container';
import { Link } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';

/**
 * Static legal content, required by Google Play / App Store to be reachable
 * from inside the app (mobile/ loads this live page in a WebView, no
 * native-side change needed). Armenian (`messages/hy.json`) is the source
 * of truth; ru and en are a best-effort machine translation and MUST get a
 * native-speaker review pass before app store submission — same rule
 * DECISIONS.md already applies to item listings ("Item translation is a
 * manual admin step"), just done by hand here since there is no admin
 * translation queue for static pages.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<LocaleParams>;
}) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <main
      className={containerClassName({
        size: 'md',
        className: 'flex flex-1 flex-col gap-6 py-12',
      })}
    >
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{t('pages.privacy')}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t('privacy.lastUpdated')}</p>
      </div>

      <p className="text-neutral-700">{t('privacy.intro')}</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{t('privacy.collect.heading')}</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li>{t('privacy.collect.phone')}</li>
          <li>{t('privacy.collect.profile')}</li>
          <li>{t('privacy.collect.district')}</li>
          <li>{t('privacy.collect.items')}</li>
          <li>{t('privacy.collect.claims')}</li>
          <li>{t('privacy.collect.pushToken')}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">
          {t('privacy.phoneProtection.heading')}
        </h2>
        <p className="text-neutral-700">{t('privacy.phoneProtection.body')}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">
          {t('privacy.thirdParties.heading')}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li>{t('privacy.thirdParties.messaggio')}</li>
          <li>{t('privacy.thirdParties.r2')}</li>
          <li>{t('privacy.thirdParties.neon')}</li>
          <li>{t('privacy.thirdParties.vercel')}</li>
          <li>{t('privacy.thirdParties.firebase')}</li>
          <li>{t('privacy.thirdParties.resend')}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{t('privacy.retention.heading')}</h2>
        <p className="text-neutral-700">{t('privacy.retention.body')}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{t('privacy.rights.heading')}</h2>
        <p className="text-neutral-700">
          {t.rich('privacy.rights.body', {
            link: (chunks) => <Link href="/my/account">{chunks}</Link>,
          })}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{t('privacy.cookies.heading')}</h2>
        <p className="text-neutral-700">{t('privacy.cookies.body')}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{t('privacy.children.heading')}</h2>
        <p className="text-neutral-700">{t('privacy.children.body')}</p>
      </section>
    </main>
  );
}
