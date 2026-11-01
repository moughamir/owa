'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';

export function CrmTab() {
  const t = useTranslations('admin.crm');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-warning badge-sm">{t('statusPreview')}</span>
        <span className="text-sm text-base-content/75">{t('intro')}</span>
      </div>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('pipelineTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('pipelineEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('pipelineNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('contactsTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('contactsEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('contactsNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('tasksTitle')}</h2>
          <p className="text-sm text-base-content/75">{t('tasksEmpty')}</p>
          <p className="text-xs text-base-content/60">{t('tasksNote')}</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">{t('linksTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin#waitlist" className="btn btn-outline btn-sm">
              {t('waitlistLink')}
            </Link>
            <Link href="/admin#allowlist" className="btn btn-outline btn-sm">
              {t('allowlistLink')}
            </Link>
            <Link href="/admin#users" className="btn btn-outline btn-sm">
              {t('usersLink')}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
