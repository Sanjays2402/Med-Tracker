'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileArrowDown, Trash, Upload } from '@med/icons';
import { Surface, Btn, Section, ErrorBox } from '../../../../components/uikit';
import { api, ApiError } from '../../../../lib/api-client';

export default function DataSettingsPage() {
  const [confirm, setConfirm] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importMsg, setImportMsg] = React.useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete('/me');
      window.location.href = '/';
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) {
        setError('Server rejected the deletion. Try again later or contact support.');
      } else {
        window.location.href = '/';
      }
    } finally {
      setDeleting(false);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const count = Array.isArray(parsed?.medications) ? parsed.medications.length : 0;
      try { await api.post('/import', parsed); } catch {}
      setImportMsg(`Imported ${count} medication${count === 1 ? '' : 's'} from ${file.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the file.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Export, import, or permanently delete your data.</p>
      </header>

      {error && <ErrorBox message={error} />}

      <Section title="Export">
        <Surface>
          <div className="p-4 flex items-start gap-3">
            <FileArrowDown size={18} weight="duotone" className="text-neutral-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">Download your data</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                CSV, JSON, ICS, or PDF formats available on the reports page.
              </div>
            </div>
            <Link href="/reports/export"
              className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
              Go to exports
            </Link>
          </div>
        </Surface>
      </Section>

      <Section title="Import">
        <Surface>
          <div className="p-4 flex items-start gap-3">
            <Upload size={18} weight="duotone" className="text-neutral-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">Import from JSON</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Restore from a previous export or migrate from another tracker.
              </div>
              {importMsg && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">{importMsg}</div>}
            </div>
            <label className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer">
              {importing ? 'Importing' : 'Choose file'}
              <input type="file" accept="application/json,.json" onChange={onImport} className="hidden" />
            </label>
          </div>
        </Surface>
      </Section>

      <Section title="Danger zone">
        <Surface>
          <div className="p-4 space-y-3">
            {!confirm ? (
              <div className="flex items-start gap-3">
                <Trash size={18} weight="duotone" className="text-red-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Delete account and data</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    This removes every medication, dose, schedule, refill, and caregiver share. It cannot be undone.
                  </div>
                </div>
                <Btn variant="danger" size="sm" onClick={() => setConfirm(true)}>Delete</Btn>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Permanently delete your account and all data?</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Type DELETE to confirm.</p>
                <DeleteConfirm onConfirm={onDelete} onCancel={() => setConfirm(false)} busy={deleting} />
              </div>
            )}
          </div>
        </Surface>
      </Section>
    </div>
  );
}

function DeleteConfirm({ onConfirm, onCancel, busy }: { onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  const [text, setText] = React.useState('');
  const ok = text === 'DELETE';
  return (
    <div className="flex items-center gap-2">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Type DELETE"
        className="flex-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
      <Btn variant="danger" size="md" onClick={onConfirm} disabled={!ok || busy}>
        {busy ? 'Deleting' : 'Confirm'}
      </Btn>
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2">
        Cancel
      </button>
    </div>
  );
}
