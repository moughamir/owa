import { getTranslations } from 'next-intl/server';

/** Route-segment suspense boundary; keeps the locale's direction while content streams in. */
export default async function LocaleLoading() {
  const t = await getTranslations('appStates');
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <progress className="progress w-56" aria-hidden="true" />
      <p>{t('loading')}</p>
    </div>
  );
}
