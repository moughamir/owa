'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { getAccount, getMe, type Account } from '@/lib/bff';
import type { Me } from '@/lib/bff';

export function BillingTab() {
  const t = useTranslations('admin.billing');
  const [account, setAccount] = useState<Account | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getAccount(), getMe()])
      .then(([a, m]) => {
        if (!active) return;
        setAccount(a);
        setMe(m);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-base-content/75" role="status">
        <span className="loading loading-spinner loading-sm" />
        {t('usageEmpty')}
      </p>
    );
  }

  if (error) {
    return (
      <Alert variant="error" role="alert">
        <span>{error}</span>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-warning badge-sm">{t('statusPreview')}</span>
        <span className="text-sm text-base-content/75">{t('intro')}</span>
      </div>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('accountTitle')}</h2>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-base-content/60">{t('email')}</dt>
              <dd className="break-all font-medium">{account?.email ?? me?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">{t('phone')}</dt>
              <dd className="font-mono">{account?.phone ?? me?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">{t('role')}</dt>
              <dd className="font-medium">{me?.role ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('planTitle')}</h2>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{t('planName')}</span>
            <span className="badge badge-success badge-sm">{t('planStatus')}</span>
          </div>
          <p className="text-sm text-base-content/75">{t('planNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('paymentTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('paymentEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('paymentNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('invoicesTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('invoicesEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('invoicesNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('usageTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('usageEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('usageNote')}</p>
        </div>
      </Card>
    </div>
  );
}
