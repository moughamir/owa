'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from '@/i18n/navigation';
import {
  ApiError,
  approveOAuthRequest,
  denyOAuthRequest,
  getOAuthRequest,
  type OAuthRequestInfo,
} from '@/lib/bff';
import { getSession, isSessionExpired } from '@/lib/session';
import { useTranslations } from 'next-intl';
import { useClientValue, useHydrated } from '@/lib/use-client-value';

const readRequestId = () => new URLSearchParams(window.location.search).get('request');

/**
 * OAuth consent for MCP connectors (Claude). Reached from api.<zone>/oauth/authorize with a
 * short-lived request id; approving sends the browser back to the app's registered redirect URI.
 *
 * Shared by the locale-first route (/[locale]/oauth/consent) and the locale-stable route
 * (/oauth/consent, the path the BFF's oauth/authorize redirect targets). The locale comes in as
 * a prop: next-intl's request locale for the shim route, the URL segment for [locale] routes.
 */
export function OAuthConsent({ locale }: { locale: string }) {
  const router = useRouter();
  const t = useTranslations('consent');
  // The request id comes from the URL, read after hydration (null on the server).
  const hydrated = useHydrated();
  const requestId = useClientValue(readRequestId, null);
  const [info, setInfo] = useState<OAuthRequestInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = hydrated && !requestId ? t('missingRequest') : failure;

  useEffect(() => {
    const id = requestId;
    if (!id) return;
    const here = `/${locale}/oauth/consent?request=${encodeURIComponent(id)}`;
    if (!getSession() || isSessionExpired()) {
      router.push(`/${locale}/auth/login?next=${encodeURIComponent(here)}`);
      return;
    }
    getOAuthRequest(id)
      .then(setInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/${locale}/auth/login?next=${encodeURIComponent(here)}`);
        } else {
          setFailure(err instanceof Error ? err.message : t('invalidRequest'));
        }
      });
  }, [router, requestId, locale]);

  async function decide(approve: boolean) {
    if (!requestId) return;
    setBusy(true);
    setFailure(null);
    try {
      const { redirectTo } = approve ? await approveOAuthRequest(requestId) : await denyOAuthRequest(requestId);
      window.location.assign(redirectTo);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Request failed');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('title')}</h1>
      {error && <p className="mb-4 rounded-sm border border-red-300 p-2 text-sm text-red-600">{error}</p>}
      {!info && !error && <p className="text-base-content/60">{t('loading')}</p>}
      {info && (
        <>
          <p className="mb-3">
            {t.rich('wantsAccess', { client: info.clientName, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
          <ul className="mb-4 list-disc pl-5 text-sm">
            <li>{t('scopeRead')}</li>
            <li>{t('scopeSend')}</li>
            <li>{t('scopeSession')}</li>
          </ul>
          <p className="mb-4 text-sm">
            {t.rich('redirectBack', { host: info.redirectHost, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
          {info.loopback && (
            <p className="mb-4 rounded-sm border border-yellow-400 p-2 text-sm">
              {t('loopbackWarning', { host: info.redirectHost })}
            </p>
          )}
          {!info.hasSession ? (
            <p className="mb-4 text-sm">
              {t.rich('noSession', { link: (chunks) => <Link href="/whatsapp" className="text-primary underline">{chunks}</Link> })}
            </p>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(true)}
                className="btn btn-primary btn-sm disabled:opacity-50"
              >
                {t('allow')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(false)}
                className="rounded-sm border px-4 py-2 disabled:opacity-50"
              >
                {t('deny')}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
