'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { AuthShell, Field, buttonClass } from '@/components/auth-form';
import { refreshSession, requestMagicLink, verifyMagicLinkToken } from '@/lib/bff';
import { authErrorKey } from '@/lib/auth-errors';
import { emailError, magicLinkFromUrl } from '@/lib/account-validation';
import { getSession, isSessionExpired, setSession, type Session } from '@/lib/session';
import { safeNext } from '@/lib/safe-next';

/**
 * Landing page of the Supabase sign-in e-mail (`${SITE_URL}/auth/magic`). The link arrives as
 * `#…refresh_token=…&type=…` (implicit flow) or `?token_hash=…&type=…` (PKCE flow). The token is
 * read from the address bar and removed from it so it never reaches a server log; without a
 * token the page is the "send me a link" request form.
 */
export default function MagicLinkPage() {
  const t = useTranslations('auth.magic');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  // 'reading': not read yet (first render, server); 'consuming': a token was found on this page.
  const [mode, setMode] = useState<'reading' | 'consuming' | 'form' | 'sent'>('reading');
  // A valid session in this tab: skip the form and offer to continue (request mode only).
  const [signedIn, setSignedIn] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Capture `next` BEFORE rebuilding the address so it survives the cleanup.
    const next = new URLSearchParams(window.location.search).get('next');
    const link = magicLinkFromUrl({ hash: window.location.hash, search: window.location.search });
    if (link) window.history.replaceState(null, '', window.location.pathname);
    // Reading the address needs the browser, so this cannot be computed during render.
    const session = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignedIn(session && !isSessionExpired() ? session : null);
    setMode(link ? 'consuming' : 'form');
    if (!link) return;
    const consume =
      link.kind === 'fragment'
        ? refreshSession(link.refreshToken)
        : verifyMagicLinkToken(link.tokenHash, link.type);
    consume
      .then((session) => {
        setSession(session);
        router.push(safeNext(next) ?? (session.isAdmin ? '/admin' : '/whatsapp'));
      })
      .catch((err) => {
        // A dead or used link: back to the request form with the translated error.
        setMode('form');
        setError(tAuth(authErrorKey(err)));
      });
  }, [router, tAuth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (emailError(email)) {
      setError(tAuth('errors.invalid_email'));
      return;
    }
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    setLoading(true);
    try {
      await requestMagicLink(email.trim(), next);
      setMode('sent');
    } catch (err) {
      setError(tAuth(authErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'reading' || mode === 'consuming') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base-200 p-4">
        <p role="status" className="flex items-center gap-2 text-base-content/75">
          <span className="loading loading-spinner loading-sm" />
          {t('activating')}
        </p>
      </main>
    );
  }

  if (mode === 'sent') {
    return (
      <AuthShell title={t('title')}>
        <p role="status" className="text-sm">
          {t('checkInbox')}
        </p>
        <p className="text-center text-sm">
          <button type="button" className="link link-primary" onClick={() => setMode('form')}>
            {t('sendAgain')}
          </button>
        </p>
        <p className="text-center text-sm text-base-content/75">
          <Link href="/auth/login" className="link link-primary">
            {t('backToLogin')}
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('title')}>
      {signedIn && (
        <>
          <p role="status" className="alert alert-success text-sm">
            <span>{t('signedIn')}</span>
          </p>
          <Link href={signedIn.isAdmin ? '/admin' : '/whatsapp'} className={buttonClass}>
            {t('continue')}
          </Link>
        </>
      )}
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}
      <p className="text-sm text-base-content/75">{t('intro')}</p>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label={t('email')}
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
      <p className="text-center text-sm text-base-content/75">
        <Link href="/auth/login" className="link link-primary">
          {t('backToLogin')}
        </Link>
      </p>
    </AuthShell>
  );
}
