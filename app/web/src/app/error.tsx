'use client';

import { useEffect } from 'react';

/**
 * Root error boundary for segments outside the locale prefix (e.g. /oauth, /blog). There is no
 * translated message catalog outside it at this depth, so this stays plain English (WF-022).
 */
export default function RootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest gives the operator a trace id; the message may leak internals, so it stays off the page.
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
      <h1 className="text-3 font-bold md:text-4">Something went wrong</h1>
      <p className="text-base-content/80">An unexpected error occurred. You can try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary min-h-11">
        Try again
      </button>
    </main>
  );
}
