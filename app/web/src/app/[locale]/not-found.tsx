import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** 404 inside the locale prefix: unknown sub-paths (fr, ar and unrouted en paths) land here. */
export default async function LocaleNotFound() {
  const t = await getTranslations('appStates.notFound');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3 font-bold md:text-4">{t('title')}</h1>
      <p className="text-base-content/80">{t('text')}</p>
      <Link href="/" className="btn btn-ghost min-h-11">
        {t('back')}
      </Link>
    </main>
  );
}
