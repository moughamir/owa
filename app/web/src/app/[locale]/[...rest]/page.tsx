import { notFound } from 'next/navigation';

/**
 * The App Router renders the root not-found for any unknown path below a dynamic segment, which
 * loses the locale (WF-022). This empty catch-all catches those routes inside the locale prefix
 * and raises the local 404 boundary instead, where the request locale is still known.
 */
export default function LocaleCatchAll() {
  notFound();
}
