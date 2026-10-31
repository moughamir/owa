'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getMe } from '@/lib/bff';
import { useMessagesData } from '@/lib/messages-data';
import { getSession, isSessionExpired } from '@/lib/session';

export default function ContactsPage() {
  const t = useTranslations('contactsPage');
  const locale = useLocale();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const { chats, chatsLoading, error } = useMessagesData();

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    getMe().then((me) => setPhone(me.phone)).catch(() => undefined);
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [chats, query]);

  function formatTime(value: string | null) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return '';
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <AppHeader phone={phone} />
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-base-content/75">{t('subtitle')}</p>
      </header>

      <Card variant="bordered" className="mb-4">
        <div className="card-body gap-3">
          <label className="form-control w-full">
            <span className="label-text mb-1 text-sm font-medium">{t('searchLabel')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="input w-full"
              aria-label={t('searchLabel')}
            />
          </label>
          <p className="text-xs text-base-content/60">{t('sourceNote')}</p>
        </div>
      </Card>

      {chatsLoading ? (
        <p className="flex items-center gap-2 text-base-content/75" role="status">
          <span className="loading loading-spinner loading-sm" />
          {t('loading')}
        </p>
      ) : error ? (
        <Alert variant="error" role="alert">
          <span>{t('loadFailed')}</span>
          <Button type="button" variant="outline" className="ml-2" onClick={() => window.location.reload()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : chats.length === 0 ? (
        <Card variant="bordered">
          <div className="card-body items-center gap-2 text-center">
            <p className="text-sm text-base-content/75">{t('empty')}</p>
            <Link href="/messages" className="btn btn-primary btn-sm">
              {t('openChat')}
            </Link>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-base-content/75">{t('emptySearch')}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-base-content/60">
            {t('count', { count: filtered.length })}
          </p>
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <Card variant="bordered">
                  <div className="card-body gap-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{c.name}</span>
                      {c.unreadCount > 0 && (
                        <span className="badge badge-primary badge-sm shrink-0">{c.unreadCount}</span>
                      )}
                    </div>
                    <span className="break-all font-mono text-xs text-base-content/60">{c.id}</span>
                    {c.updatedAt && (
                      <span className="text-xs text-base-content/60">
                        {t('lastActive', { date: formatTime(c.updatedAt) })}
                      </span>
                    )}
                    <div className="card-actions justify-end">
                      <Link href="/messages" className="btn btn-ghost btn-sm">
                        {t('openChat')}
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
