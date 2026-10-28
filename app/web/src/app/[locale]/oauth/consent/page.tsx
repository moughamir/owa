import type { Metadata } from 'next';
import { OAuthConsent } from '@/components/oauth-consent';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Locale-prefixed OAuth consent. The BFF redirects to /oauth/consent (locale-stable, 200);
 * this route exists so next-intl-navigated flows (auth/login round-trip) land on a valid
 * /fr|/ar path instead of a 404 (WF-005).
 */
export default async function ConsentRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <OAuthConsent locale={locale} />;
}
