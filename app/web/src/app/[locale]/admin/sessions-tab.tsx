'use client';

import { Fragment, useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  adminRevokeGrant,
  adminRevokeKey,
  listAdminSessions,
  setSessionLimits,
  type AdminSession,
} from '@/lib/admin-api';
import {
  SEND_LIMIT_BOUNDS,
  formatDuration,
  formatPhone,
  overrideToForm,
  statusBadgeClass,
  statusLabel,
  usageLevel,
  usagePercent,
  validateOverrideForm,
  type FieldErrors,
  type OverrideForm,
} from '@/lib/admin-format';
import { InlineConfirm } from './inline-confirm';

const PROGRESS_CLASS = { ok: 'progress-primary', warn: 'progress-warning', full: 'progress-error' } as const;

/** Every WhatsApp session with today's API usage, its per-session cap override, keys and Claude grants. */
export function SessionsTab({ canManageLimits, canRevokeKeys, canRevokeGrants }: { canManageLimits: boolean; canRevokeKeys: boolean; canRevokeGrants: boolean }) {
  const t = useTranslations('admin.sessions');
  const tc = useTranslations('admin.common');
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(() => listAdminSessions().then((list) => {
    setSessions(list);
    setLoadFailed(false);
  }), []);

  useEffect(() => {
    reload().catch(() => setLoadFailed(true));
  }, [reload]);

  const shownError = error ?? (loadFailed ? tc('loadFailed') : null);

  /** Run a mutation, then refetch so usage, caps and lists reflect the server. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('requestFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <p className="text-sm text-base-content/75">
          {t('intro')}
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => void run(async () => {})} className="btn btn-outline">
        {tc('refresh')}
      </button>
    </div>
  );

  if (!sessions) {
    return (
      <>
        {header}
        {shownError ? (
          <div role="alert" className="alert alert-error">
            <span>{shownError}</span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-base-content/75">
            <span className="loading loading-spinner loading-sm" />
            {tc('loading')}
          </p>
        )}
      </>
    );
  }

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <>
      {header}
      {shownError && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{shownError}</span>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="alert">
          <span>{t('empty')}</span>
        </div>
      ) : (
        <>
          {/* Table from md up; "Manage" expands a detail row under the session. */}
          <div className="hidden overflow-x-auto rounded-box border border-base-300 md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colUser')}</th>
                  <th>{t('colSession')}</th>
                  <th>{t('colStatus')}</th>
                  <th className="min-w-48">{t('colUsage')}</th>
                  <th>{t('colResets')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <Fragment key={s.openwaSessionId}>
                    <tr>
                      <td>
                        <div className="break-all">{s.email ?? '—'}</div>
                        <div className="font-mono text-xs text-base-content/75">{formatPhone(s.phone)}</div>
                      </td>
                      <td>
                        <div>{s.name}</div>
                        <div className="font-mono text-xs text-base-content/75">{s.openwaSessionId}</div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>
                        <UsageBar session={s} />
                      </td>
                      <td className="whitespace-nowrap text-sm">{formatDuration(s.usage.resetsInSeconds)}</td>
                      <td className="text-end">
                        <ManageButton
                          session={s}
                          controls={`session-detail-t-${s.openwaSessionId}`}
                          open={open === s.openwaSessionId}
                          onToggle={toggle}
                          canManage={canManageLimits || canRevokeKeys || canRevokeGrants}
                        />
                      </td>
                    </tr>
                    {open === s.openwaSessionId && (
                      <tr id={`session-detail-t-${s.openwaSessionId}`} className="bg-base-200/40">
                        <td colSpan={6}>
                          <SessionDetail session={s} busy={busy} run={run} canManageLimits={canManageLimits} canRevokeKeys={canRevokeKeys} canRevokeGrants={canRevokeGrants} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below md */}
          <ul className="space-y-2 md:hidden">
            {sessions.map((s) => (
              <li key={s.openwaSessionId} className="rounded-box border border-base-300 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{s.email ?? '—'}</p>
                    <p className="font-mono text-xs text-base-content/75">{formatPhone(s.phone)}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 break-all text-xs text-base-content/75">
                  {s.name} · <span className="font-mono">{s.openwaSessionId}</span>
                </p>
                <div className="mt-2">
                  <UsageBar session={s} />
                  <p className="mt-1 text-xs text-base-content/75">
                    {t('resetsIn', { duration: formatDuration(s.usage.resetsInSeconds) })}
                  </p>
                </div>
                <div className="mt-1">
                  <ManageButton
                    session={s}
                    controls={`session-detail-c-${s.openwaSessionId}`}
                    open={open === s.openwaSessionId}
                    onToggle={toggle}
                    canManage={canManageLimits || canRevokeKeys || canRevokeGrants}
                  />
                </div>
                {open === s.openwaSessionId && (
                  <div id={`session-detail-c-${s.openwaSessionId}`} className="mt-2 border-t border-base-300 pt-3">
                    <SessionDetail session={s} busy={busy} run={run} canManageLimits={canManageLimits} canRevokeKeys={canRevokeKeys} canRevokeGrants={canRevokeGrants} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  return <span className={`badge badge-sm shrink-0 whitespace-nowrap ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

function UsageBar({ session }: { session: AdminSession }) {
  const t = useTranslations('admin.sessions');
  const { today, perDay, perMinute } = session.usage;
  const level = usageLevel(today, perDay);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="font-semibold">{today.toLocaleString()}</span> / {perDay.toLocaleString()}
        </span>
        {session.override && <span className="badge badge-outline badge-sm">{t('overrideBadge')}</span>}
      </div>
      <progress
        className={`progress h-2 w-full ${PROGRESS_CLASS[level]}`}
        value={usagePercent(today, perDay)}
        max={100}
        aria-label={t('usageAria', { today, perDay })}
      />
      <p className="text-xs text-base-content/75">{t('perMinute', { count: perMinute.toLocaleString() })}</p>
    </div>
  );
}

function ManageButton({
  session,
  controls,
  open,
  onToggle,
  canManage,
}: {
  session: AdminSession;
  /** Id of the detail region; table and card layouts each render their own. */
  controls: string;
  open: boolean;
  onToggle: (id: string) => void;
  canManage: boolean;
}) {
  const t = useTranslations('admin.sessions');
  return (
    <button
      type="button"
      onClick={() => onToggle(session.openwaSessionId)}
      aria-expanded={open}
      aria-controls={controls}
      className="btn btn-ghost btn-sm h-11 min-h-11"
    >
      {open ? t('close') : canManage ? t('manage') : t('view')}
      <span className="sr-only"> {session.email ?? session.name}</span>
    </button>
  );
}

function SessionDetail({
  session,
  busy,
  run,
  canManageLimits,
  canRevokeKeys,
  canRevokeGrants,
}: {
  session: AdminSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  canManageLimits: boolean;
  canRevokeKeys: boolean;
  canRevokeGrants: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OverrideEditor session={session} busy={busy} run={run} canManage={canManageLimits} />
      <div className="space-y-4">
        <KeysList session={session} busy={busy} run={run} canRevoke={canRevokeKeys} />
        <GrantsList session={session} busy={busy} run={run} canRevoke={canRevokeGrants} />
      </div>
    </div>
  );
}

function OverrideEditor({
  session,
  busy,
  run,
  canManage,
}: {
  session: AdminSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  canManage: boolean;
}) {
  const uid = useId();
  const t = useTranslations('admin.sessions');
  const [form, setForm] = useState<OverrideForm>(() => overrideToForm(session.override));
  const [errors, setErrors] = useState<FieldErrors<keyof OverrideForm>>({});

  // Follow the server when the stored override changes (compared by value, so a refresh after
  // revoking a key does not wipe an unsaved edit). Adjusted while rendering, React's pattern
  // for "reset on prop change", rather than with a setState inside an effect.
  const perDay = session.override?.perDay ?? null;
  const perMinute = session.override?.perMinute ?? null;
  const [synced, setSynced] = useState({ perDay, perMinute });
  if (synced.perDay !== perDay || synced.perMinute !== perMinute) {
    setSynced({ perDay, perMinute });
    setForm(overrideToForm({ perDay, perMinute }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateOverrideForm(form);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    await run(() => setSessionLimits(session.openwaSessionId, r.value));
  }

  const fields: Array<{ key: keyof OverrideForm; label: string }> = [
    { key: 'perDay', label: t('perDay') },
    { key: 'perMinute', label: t('perMinuteLabel') },
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <h3 className="text-sm font-semibold">{t('capTitle')}</h3>
      <p className="text-xs text-base-content/75">{t('capIntro')}</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ key, label }) => {
          const id = `${uid}-${key}`;
          const err = errors[key];
          const b = SEND_LIMIT_BOUNDS[key];
          return (
            <div key={key} className="flex flex-col">
              <label htmlFor={id} className="flex select-none items-center justify-between px-1 pt-2 pb-1">
                <span className="text-sm text-base-content">{label}</span>
              </label>
              <input
                id={id}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                readOnly={!canManage}
                placeholder={t('globalPlaceholder')}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                aria-invalid={err ? true : undefined}
                aria-describedby={`${id}-help`}
                className={`input w-full ${err ? 'input-error' : ''}`}
              />
              <p id={`${id}-help`} className={`mt-1 text-xs ${err ? 'text-error' : 'text-base-content/75'}`}>
                {err ?? `${b.min.toLocaleString('en-US')}–${b.max.toLocaleString('en-US')}`}
              </p>
            </div>
          );
        })}
      </div>
      {canManage && <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary btn-sm h-11 min-h-11">
          {t('saveOverride')}
        </button>
        {session.override && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setErrors({});
              void run(() => setSessionLimits(session.openwaSessionId, { perDay: null, perMinute: null }));
            }}
            className="btn btn-ghost btn-sm h-11 min-h-11"
          >
            {t('clearOverride')}
          </button>
        )}
      </div>}
    </form>
  );
}

function KeysList({
  session,
  busy,
  run,
  canRevoke,
}: {
  session: AdminSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  canRevoke: boolean;
}) {
  const t = useTranslations('admin.sessions');
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{t('apiKeys')}</h3>
      {session.keys.length === 0 ? (
        <p className="text-sm text-base-content/75">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-base-300">
          {session.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <span className="font-mono text-xs">{k.keyPrefix}…</span>
                <p className="text-xs text-base-content/75">
                  {k.revokedAt
                    ? t('createdRevoked', {
                        date: new Date(k.createdAt).toLocaleString(),
                        revokedAt: new Date(k.revokedAt).toLocaleString(),
                      })
                    : t('created', { date: new Date(k.createdAt).toLocaleString() })}
                </p>
              </div>
              {k.revokedAt ? (
                <span className="badge badge-ghost badge-sm">{t('revokedBadge')}</span>
              ) : canRevoke ? (
                <InlineConfirm
                  label={t('revoke')}
                  question={t('revokeKeyQuestion', { prefix: k.keyPrefix })}
                  disabled={busy}
                  onConfirm={() => void run(() => adminRevokeKey(k.id))}
                />
              ) : <span className="badge badge-success badge-sm">{t('active')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GrantsList({
  session,
  busy,
  run,
  canRevoke,
}: {
  session: AdminSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  canRevoke: boolean;
}) {
  const t = useTranslations('admin.sessions');
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{t('claudeConnectors')}</h3>
      {session.grants.length === 0 ? (
        <p className="text-sm text-base-content/75">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-base-300">
          {session.grants.map((g) => (
            <li key={g.grantId} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <span className="wrap-break-word font-medium">{g.clientName}</span>
                <p className="text-xs text-base-content/75">
                  {[
                    t('connected', { date: new Date(g.createdAt).toLocaleString() }),
                    g.lastUsedAt
                      ? t('lastUsed', { date: new Date(g.lastUsedAt).toLocaleString() })
                      : t('neverUsed'),
                  ].join(' · ')}
                </p>
              </div>
              {canRevoke && <InlineConfirm
                label={t('revoke')}
                question={t('disconnectQuestion', { client: g.clientName })}
                disabled={busy}
                onConfirm={() => void run(() => adminRevokeGrant(g.grantId))}
              />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
