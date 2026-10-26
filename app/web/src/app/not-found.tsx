import Link from 'next/link';

/**
 * Root 404 for paths outside the locale segment. next-intl has no request locale here, so this
 * is deliberately plain English (the default locale) instead of a translated boundary; the
 * localized 404 for unknown routes under /fr, /ar and unprefixed app paths lives in
 * `app/[locale]/not-found.tsx` (WF-022).
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3 font-bold md:text-4">Page not found</h1>
      <p className="text-base-content/80">The page you asked for does not exist or has moved.</p>
      <Link href="/" className="btn btn-ghost min-h-11">
        Back to the homepage
      </Link>
    </main>
  );
}
