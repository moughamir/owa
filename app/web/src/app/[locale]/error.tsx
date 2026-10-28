'use client';

import { useTranslations } from 'next-intl';

/** Route-segment error boundary for everything under the locale prefix (WF-022). */
export default function LocaleErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('appStates.error');
  // The digest gives the operator a trace id; the message itself may leak internals, so it is
  // not printed on the page.
  console.error(error);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
      <h1 className="text-3 font-bold md:text-4">{t('title')}</h1>
      <p className="text-base-content/80">{t('text')}</p>
      <button type="button" onClick={reset} className="btn btn-primary min-h-11">
        {t('retry')}
      </button>
    </main>
  );
}
