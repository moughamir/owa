'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { CopyField } from '@/components/copy-field';
import { getMe, getWaConnectInfo, getWaSession, type WaSession } from '@/lib/bff';
import { getSession, isSessionExpired } from '@/lib/session';

export default function MCPMarketplacePage() {
  const t = useTranslations('mcpMarketplacePage');
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [session, setSession] = useState<WaSession | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    let active = true;
    Promise.all([getMe(), getWaConnectInfo()])
      .then(async ([me, ci]) => {
        if (!active) return;
        setPhone(me.phone);
        setMcpUrl(ci.mcpUrl);
        try {
          const r = await getWaSession();
          if (active) setSession(r.session);
        } catch {
          if (active) setSession(null);
        }
        if (active) setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t('loadFailed'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router, t]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4">
        <AppHeader phone={phone} />
        <p className="flex items-center gap-2 text-base-content/75" role="status">
          <span className="loading loading-spinner loading-sm" />
          {t('loading')}
        </p>
      </main>
    );
  }

  const ready = !!session && session.status === 'ready';

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <AppHeader phone={phone} />
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-base-content/75">{t('subtitle')}</p>
      </header>

      {error && (
        <Alert variant="error" role="alert" className="mb-4">
          <span>{error}</span>
        </Alert>
      )}

      <Card variant="bordered" className="mb-4">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('yourServerTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('yourServerBody')}</p>
          {ready && mcpUrl ? (
            <CopyField label={t('endpointLabel')} value={mcpUrl} />
          ) : (
            <p className="text-sm text-base-content/75">{t('noSessionHint')}</p>
          )}
          <div className="card-actions">
            <Link href="/whatsapp" className="btn btn-primary btn-sm">
              {t('openWhatsapp')}
            </Link>
          </div>
        </div>
      </Card>

      <Card variant="bordered" className="mb-4">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('emptyTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('emptyBody')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('howTitle')}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-base-content/75">
            <li>{t('howStep1')}</li>
            <li>{t('howStep2')}</li>
            <li>{t('howStep3')}</li>
          </ol>
        </div>
      </Card>
    </main>
  );
}
