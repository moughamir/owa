'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getAdminSettings, updateAdminSettings, type AdminSettings } from '@/lib/admin-api';
import {
  SEND_LIMIT_BOUNDS,
  WORKFLOW_BOUNDS,
  diffSettings,
  formatMs,
  parseIntInRange,
  settingsToForm,
  validateSettingsForm,
  type Bounds,
  type FieldErrors,
  type SettingsField,
  type SettingsForm,
} from '@/lib/admin-format';

interface FieldSpec {
  key: SettingsField;
  bounds: Bounds;
  /** Show a "= 2 s" style hint under millisecond fields. */
  ms?: boolean;
}

const LIMIT_FIELDS: FieldSpec[] = [
  { key: 'perDay', bounds: SEND_LIMIT_BOUNDS.perDay },
  { key: 'perMinute', bounds: SEND_LIMIT_BOUNDS.perMinute },
];

const WORKFLOW_FIELDS: FieldSpec[] = [
  { key: 'minGapMs', bounds: WORKFLOW_BOUNDS.minGapMs, ms: true },
  { key: 'maxPerMinuteSession', bounds: WORKFLOW_BOUNDS.maxPerMinuteSession },
  { key: 'maxPerMinuteContact', bounds: WORKFLOW_BOUNDS.maxPerMinuteContact },
  { key: 'backoffMs', bounds: WORKFLOW_BOUNDS.backoffMs, ms: true },
];

export function SendLimitsTab({ canManage }: { canManage: boolean }) {
  const t = useTranslations('admin.limits');
  const tc = useTranslations('admin.common');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors<SettingsField>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function apply(s: AdminSettings) {
    setSettings(s);
    setForm(settingsToForm(s));
    setErrors({});
  }

  useEffect(() => {
    getAdminSettings()
      .then(apply)
      .catch(() => setLoadFailed(true));
  }, []);

  const shownError = error ?? (loadFailed ? tc('loadFailed') : null);

  function onChange(key: SettingsField, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(null);
    // Clear a field's error as soon as it becomes valid; new errors wait for submit.
    if (errors[key]) {
      const spec = [...LIMIT_FIELDS, ...WORKFLOW_FIELDS].find((f) => f.key === key);
      if (spec && parseIntInRange(value, spec.bounds).ok) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !settings) return;
    setError(null);
    setSaved(null);
    const result = validateSettingsForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      if (first) document.getElementById(`limits-${first}`)?.focus();
      return;
    }
    setErrors({});
    const patch = diffSettings(settings, result.value);
    if (!patch) {
      setSaved(tc('noChanges'));
      return;
    }
    setBusy(true);
    try {
      apply(await updateAdminSettings(patch));
      setSaved(tc('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!form || !settings) {
    return shownError ? (
      <div role="alert" className="alert alert-error">
        <span>{shownError}</span>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-base-content/75">
        <span className="loading loading-spinner loading-sm" />
        {tc('loading')}
      </p>
    );
  }

  const pristine = settingsToForm(settings);
  const dirty = (Object.keys(pristine) as SettingsField[]).some((k) => pristine[k] !== form[k].trim());

  function field(spec: FieldSpec) {
    const id = `limits-${spec.key}`;
    const err = errors[spec.key];
    const raw = form?.[spec.key] ?? '';
    const parsed = parseIntInRange(raw, spec.bounds);
    return (
      <div key={spec.key} className="flex w-full flex-col">
        <label htmlFor={id} className="flex select-none items-center justify-between px-1 pt-2 pb-1">
          <span className="text-sm font-medium text-base-content">{t(`fields.${spec.key}.label`)}</span>
        </label>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          readOnly={!canManage}
          value={raw}
          onChange={(e) => onChange(spec.key, e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-help${err ? ` ${id}-err` : ''}`}
          className={`input w-full ${err ? 'input-error' : ''}`}
        />
        <p id={`${id}-help`} className="mt-1 text-xs text-base-content/75">
          {t(`fields.${spec.key}.help`)} {spec.bounds.min.toLocaleString('en-US')}–
          {spec.bounds.max.toLocaleString('en-US')}
          {spec.ms && parsed.ok ? ` · ${formatMs(parsed.value)}` : ''}
        </p>
        {err && (
          <p id={`${id}-err`} className="mt-1 text-xs text-error">
            {err}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="mb-1 text-xl font-bold">{t('title')}</h2>
      <p className="mb-4 text-sm text-base-content/75">{t('countingNote')}</p>

      {shownError && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{shownError}</span>
        </div>
      )}

      <section aria-labelledby="limits-caps-title" className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h3 id="limits-caps-title" className="card-title text-lg">
            {t('capsTitle')}
          </h3>
          <p className="text-sm text-base-content/75">{t('capsIntro')}</p>
          <div className="grid gap-3 sm:grid-cols-2">{LIMIT_FIELDS.map(field)}</div>
        </div>
      </section>

      <section aria-labelledby="limits-pacing-title" className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h3 id="limits-pacing-title" className="card-title text-lg">
            {t('pacingTitle')}
          </h3>
          <p className="text-sm text-base-content/75">{t('pacingIntro')}</p>
          <div className="grid gap-3 sm:grid-cols-2">{WORKFLOW_FIELDS.map(field)}</div>
        </div>
      </section>

      {canManage ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="submit" disabled={busy || !dirty} className="btn btn-primary w-full sm:w-auto">
          {busy && <span className="loading loading-spinner loading-sm" />}
          {tc('save')}
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setForm(settingsToForm(settings));
            setErrors({});
            setSaved(null);
          }}
          className="btn btn-ghost w-full sm:w-auto"
        >
          {tc('reset')}
        </button>
        <span role="status" className="text-sm text-base-content/75">
          {saved}
        </span>
      </div> : <p className="text-sm text-base-content/70">{tc('readOnly')}</p>}
      {settings.updatedAt && (
        <p className="mt-3 text-xs text-base-content/75">
          {settings.updatedBy
            ? t('lastChangedBy', { date: new Date(settings.updatedAt).toLocaleString(), admin: settings.updatedBy })
            : t('lastChanged', { date: new Date(settings.updatedAt).toLocaleString() })}
        </p>
      )}
    </form>
  );
}
