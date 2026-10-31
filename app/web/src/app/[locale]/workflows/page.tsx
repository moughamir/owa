'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { getSession, isSessionExpired } from '@/lib/session';
import { listWorkflows, setWorkflowEnabled, type WorkflowView } from '@/lib/workflows-api';

export default function WorkflowsPage() {
  const t = useTranslations('workflows');
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    listWorkflows()
      .then(setWorkflows)
      .catch(() => setLoadFailed(true));
  }, [router]);

  async function toggle(workflow: WorkflowView) {
    setBusy(workflow.id);
    setError(null);
    setUpdateFailed(false);
    try {
      setWorkflows(await setWorkflowEnabled(workflow.id, !workflow.enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
      setUpdateFailed(!(err instanceof Error));
    } finally {
      setBusy(null);
    }
  }

  const shownError = error ?? (loadFailed ? t('loadFailed') : updateFailed ? t('updateFailed') : null);

  return (
    <div className="p-4">
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-4 text-base-content/60">
        {t('subtitle')}
      </p>
      {shownError && <p className="mb-2 text-red-500">{shownError}</p>}
      <ul className="space-y-3">
        {workflows.map((workflow) => (
          <li key={workflow.id} className="flex items-center justify-between rounded-sm border p-3">
            <div>
              <p className="font-semibold">{workflow.id}</p>
              <p className="text-sm text-base-content/60">{workflow.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={workflow.enabled}
              aria-label={t('toggleLabel', { name: workflow.id, state: workflow.enabled ? t('on') : t('off') })}
              disabled={busy === workflow.id}
              onClick={() => void toggle(workflow)}
              className={`rounded px-3 py-1 text-white disabled:opacity-50 ${
                workflow.enabled ? 'bg-success' : 'bg-base-300'
              }`}
            >
              {workflow.enabled ? t('on') : t('off')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
