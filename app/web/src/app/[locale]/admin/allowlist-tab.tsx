'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { addAllowlisted, listAllowlist, removeAllowlisted, type AllowlistEntry } from '@/lib/bff';

/** Invite allowlist: the pre-backoffice /admin page, moved into a tab with its behaviour unchanged. */
export function AllowlistTab({ canManage }: { canManage: boolean }) {
  const t = useTranslations('admin.allowlist');
  const tc = useTranslations('admin.common');
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(() => listAllowlist().then((list) => {
    setEntries(list);
    setLoadFailed(false);
  }), []);

  useEffect(() => {
    reload().catch(() => setLoadFailed(true));
  }, [reload]);

  const shownError = error ?? (loadFailed ? tc('loadFailed') : null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await addAllowlisted(phone);
      setPhone('');
    });
  }

  function onRemove(entry: AllowlistEntry) {
    const warn = entry.boundEmail
      ? t('removeQuestionBound', { phone: entry.phoneE164, email: entry.boundEmail })
      : t('removeQuestion', { phone: entry.phoneE164 });
    if (window.confirm(warn)) void run(() => removeAllowlisted(entry.phoneE164));
  }

  return (
    <>
      <h2 className="mb-4 text-xl font-bold">{t('title')}</h2>

      {canManage && <form onSubmit={onAdd} className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <label htmlFor="admin-phone" className="text-sm font-medium">
            {t('inviteLabel')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="admin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('phonePlaceholder')}
              autoComplete="tel"
              className="input w-full sm:min-w-0 sm:flex-1"
              required
            />
            <button type="submit" disabled={busy} className="btn btn-primary w-full sm:w-auto">
              {t('add')}
            </button>
          </div>
          <p className="text-xs text-base-content/75">
            {t('formatHint')}
          </p>
        </div>
      </form>}

      {shownError && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{shownError}</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="alert">
          <span>{canManage ? t('emptyCanManage') : t('empty')}</span>
        </div>
      ) : (
        <>
          {/* Table from md up */}
          <div className="hidden overflow-x-auto rounded-box border border-base-300 md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colNumber')}</th>
                  <th>{t('colStatus')}</th>
                  <th>{t('colAddedBy')}</th>
                  <th>{t('colAdded')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.phoneE164}>
                    <td className="font-mono">{e.phoneE164}</td>
                    <td>
                      {e.boundEmail ? (
                        <div>
                          <span className="badge badge-success badge-sm">{t('registered')}</span>
                          <div className="mt-1 text-xs">{e.boundEmail}</div>
                        </div>
                      ) : (
                        <span className="badge badge-ghost badge-sm">{t('invited')}</span>
                      )}
                    </td>
                    <td>{e.addedBy}</td>
                    <td className="text-xs">{new Date(e.addedAt).toLocaleDateString()}</td>
                    <td className="text-end">
                      {canManage && <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove(e)}
                        className="btn btn-ghost btn-sm text-error"
                      >
                        {t('remove')}
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below md */}
          <ul className="space-y-2 md:hidden">
            {entries.map((e) => (
              <li key={e.phoneE164} className="rounded-box border border-base-300 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-mono">{e.phoneE164}</span>
                  {e.boundEmail ? (
                    <span className="badge badge-success badge-sm shrink-0">{t('registered')}</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm shrink-0">{t('invited')}</span>
                  )}
                </div>
                {e.boundEmail && <p className="mt-1 break-all text-xs">{e.boundEmail}</p>}
                <p className="mt-1 text-xs text-base-content/75">
                  {t('addedBy', { admin: e.addedBy ?? '', date: new Date(e.addedAt).toLocaleDateString() })}
                </p>
                {canManage && <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(e)}
                  className="btn btn-ghost btn-sm mt-1 h-11 text-error"
                >
                  {t('remove')}
                </button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
