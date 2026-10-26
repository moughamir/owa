import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Locale redirect for OAuth consent.
 *
 * The BFF redirects here at /oauth/consent (locale-agnostic). This RSC reads
 * the user's preferred locale and 302-redirects to /[locale]/oauth/consent,
 * preserving all query params (request, etc.).
 */
export default async function ConsentRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val) qs.set(k, val);
    }
  }
  redirect(`/${locale}/oauth/consent?${qs.toString()}`);
}
