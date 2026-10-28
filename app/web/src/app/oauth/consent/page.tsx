import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { Metadata } from 'next';
import { OAuthConsent } from '@/components/oauth-consent';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Locale-stable OAuth consent at the path the BFF's oauth/authorize redirects to
 * (/oauth/consent, locale-unaware). Renders 200 directly — no redirect into the
 * [locale] tree, which next-intl would immediately strip back for the default
 * locale (a 307 ping-pong inside IdP-framed flows). Locale is read from the
 * next-intl cookie set by the locale routes, falling back to the default.
 *
 * The root layout has no NextIntlClientProvider (it lives in the [locale] layout),
 * so this page provides one: the consent view navigates via next-intl's useRouter.
 */
export default async function ConsentPage() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider messages={messages}>
      <OAuthConsent locale={locale} />
    </NextIntlClientProvider>
  );
}
