'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pill as PillIcon, Calendar, ChartBar, Bell, CalendarCheck, Clock, Check, Pencil, X as XIcon } from '@med/icons';
import { Btn, Surface, Section, ErrorBox, SkeletonRow, Pill, StatTile, formatTime, formatDate } from '../../../../components/uikit';
import { useRouter } from 'next/navigation';
import { getMedication, listTodayDoses, listSchedules, listRefills, logDose, getAdherence, archiveMedication, updateMedication, listDosesForDate } from '../../../../lib/data';
import type { Medication, DoseEvent, ScheduleEntry, Refill, AdherenceSummary } from '../../../../lib/types';
import { computeNextDose } from '../../../../lib/next-dose';
import { WeekStrip } from '../../../../components/WeekStrip';
import { localKey, type WeekStripDoseInput } from '../../../../lib/week-strip';

export default function MedicationDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [archiving, setArchiving] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [med, setMed] = React.useState<Medication | null>(null);
  const [doses, setDoses] = React.useState<DoseEvent[]>([]);
  const [schedules, setSchedules] = React.useState<ScheduleEntry[]>([]);
  const [refills, setRefills] = React.useState<Refill[]>([]);
  const [adherence, setAdherence] = React.useState<AdherenceSummary | null>(null);
  const [weekDoses, setWeekDoses] = React.useState<Record<string, WeekStripDoseInput[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [now, setNow] = React.useState(() => Date.now());

  // Inline edit-on-hover for the instructions field.
  const [editingInstr, setEditingInstr] = React.useState(false);
  const [instrDraft, setInstrDraft] = React.useState('');
  const [savingInstr, setSavingInstr] = React.useState(false);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [m, d, s, r, a] = await Promise.all([getMedication(id), listTodayDoses(), listSchedules(), listRefills(), getAdherence()]);
      setMed(m);
      setDoses(d.filter(x => x.medicationId === id));
      setSchedules(s.filter(x => x.medicationId === id));
      setRefills(r.filter(x => x.medicationId === id));
      setAdherence(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load medication.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  // Last 7 days of dose history for this med, keyed by local date, for the week strip.
  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const today = Date.now();
      const keys: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        keys.push(localKey(d));
      }
      try {
        const lists = await Promise.all(keys.map((k) => listDosesForDate(k)));
        if (cancelled) return;
        const map: Record<string, WeekStripDoseInput[]> = {};
        keys.forEach((k, i) => {
          map[k] = (lists[i] ?? [])
            .filter((dose) => dose.medicationId === id)
            .map((dose) => ({ scheduledAt: dose.scheduledAt, status: dose.status }));
        });
        setWeekDoses(map);
      } catch {
        // Non-fatal: the strip simply renders empty days if history can't load.
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function quickTake(doseId: string) {
    try {
      await logDose(doseId, 'taken');
      setDoses(prev => prev.map(d => d.id === doseId ? { ...d, status: 'taken', takenAt: new Date().toISOString() } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log dose.');
    }
  }

  function startEditInstructions() {
    setInstrDraft(med?.instructions ?? '');
    setEditingInstr(true);
  }

  async function saveInstructions() {
    if (!id) return;
    const next = instrDraft.trim();
    setSavingInstr(true);
    setError(null);
    try {
      await updateMedication(id, { instructions: next });
      setMed(prev => (prev ? { ...prev, instructions: next } : prev));
      setEditingInstr(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save instructions.');
    } finally {
      setSavingInstr(false);
    }
  }

  if (error && !med) return <ErrorBox message={error} onRetry={load} />;

  if (loading && !med) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      </div>
    );
  }

  if (!med) {
    return (
      <div className="space-y-4">
        <Link href="/medications" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">← Medications</Link>
        <ErrorBox message="Medication not found." />
      </div>
    );
  }

  // Per-med 7d view: scale the user's overall adherence window to a 7d slice for this med.
  // When the API exposes per-medication adherence we will switch to that endpoint.
  const window = adherence?.windowDays ?? 30;
  const scale = Math.min(1, 7 / window);
  const sched7d = Math.max(0, Math.round((adherence?.scheduled ?? 0) * scale / Math.max(1, ((adherence?.scheduled ?? 0) > 0 ? 1 : 1))));
  const taken7d = Math.round((adherence?.taken ?? 0) * scale);
  const sched7dEst = Math.round((adherence?.scheduled ?? 0) * scale);
  const adherencePct = sched7dEst > 0 ? Math.min(100, Math.round((taken7d / sched7dEst) * 100)) : 0;

  const nextDose = computeNextDose(doses, now);
  const nextChip =
    nextDose.tone === 'overdue'
      ? { tone: 'danger' as const, prefix: 'overdue' }
      : nextDose.tone === 'due'
      ? { tone: 'warn' as const, prefix: 'due' }
      : nextDose.tone === 'upcoming'
      ? { tone: 'accent' as const, prefix: 'next dose' }
      : { tone: 'ok' as const, prefix: 'today' };

  return (
    <div className="space-y-8">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/medications" className="hover:text-neutral-900 dark:hover:text-neutral-100">Medications</Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">{med.name}</span>
      </div>

      {/* Hero cover band */}
      <header className="sheet overflow-hidden">
        <div
          className="px-6 sm:px-8 pt-7 pb-6 relative"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 70%, var(--bg-elev)) 0%, var(--bg-elev) 62%)',
          }}
        >
          <div className="flex items-start gap-5">
            <div
              className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--accent)' }}
              aria-hidden
            >
              <PillIcon size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="display text-[30px] sm:text-[36px] leading-none tracking-tight">
                {med.name}
                {med.strength && (
                  <span className="text-[var(--ink-muted)] font-normal"> {med.strength}</span>
                )}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {med.form && <span className="capsule capitalize">{med.form}</span>}
                {med.schedule && (
                  <span className="capsule">
                    <Calendar size={12} /> <span className="tabular">{med.schedule}</span>
                  </span>
                )}
                <span className={`capsule capsule-${nextChip.tone === 'accent' ? 'accent' : nextChip.tone}`}>
                  <Clock size={12} />
                  <span className="tabular">
                    {nextDose.tone === 'none' ? 'All done today' : `${nextChip.prefix} · ${nextDose.label}`}
                  </span>
                </span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {confirmArchive ? (
                <>
                  <span className="text-xs text-[var(--ink-muted)]">Archive this medication?</span>
                  <Btn size="sm" variant="ghost" onClick={() => setConfirmArchive(false)} disabled={archiving}>Cancel</Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    disabled={archiving}
                    onClick={async () => {
                      if (!id) return;
                      setArchiving(true);
                      setError(null);
                      try {
                        await archiveMedication(id);
                        router.push('/medications');
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Could not archive.');
                        setArchiving(false);
                        setConfirmArchive(false);
                      }
                    }}
                  >
                    {archiving ? 'Archiving...' : 'Confirm'}
                  </Btn>
                </>
              ) : (
                <Btn size="sm" variant="ghost" onClick={() => setConfirmArchive(true)}>Archive</Btn>
              )}
            </div>
          </div>
        </div>

        {/* Inline edit-on-hover instructions strip */}
        <div className="group px-6 sm:px-8 py-4 border-t border-[var(--line-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">Instructions</div>
            {!editingInstr && (
              <button
                type="button"
                onClick={startEditInstructions}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Edit instructions"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>
          {editingInstr ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={instrDraft}
                onChange={(e) => setInstrDraft(e.target.value)}
                rows={3}
                autoFocus
                maxLength={400}
                placeholder="e.g. Take once daily in the morning with water."
                className="w-full text-[14px] leading-relaxed rounded-[var(--radius-capsule)] px-3 py-2 resize-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)' }}
              />
              <div className="flex items-center gap-2">
                <Btn size="sm" variant="primary" disabled={savingInstr} onClick={saveInstructions}>
                  {savingInstr ? 'Saving…' : (<span className="inline-flex items-center gap-1.5"><Check size={13} /> Save</span>)}
                </Btn>
                <Btn size="sm" variant="ghost" disabled={savingInstr} onClick={() => setEditingInstr(false)}>
                  <span className="inline-flex items-center gap-1.5"><XIcon size={13} /> Cancel</span>
                </Btn>
              </div>
            </div>
          ) : (
            <p
              className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-soft)] cursor-text"
              onClick={startEditInstructions}
            >
              {med.instructions || (
                <span className="text-[var(--ink-muted)] italic">No instructions yet — click to add.</span>
              )}
            </p>
          )}
        </div>

        {/* Mobile archive control (hidden in the hero on small screens) */}
        <div className="sm:hidden px-6 py-3 border-t border-[var(--line-soft)]">
          {confirmArchive ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ink-muted)] flex-1">Archive this medication?</span>
              <Btn size="sm" variant="ghost" onClick={() => setConfirmArchive(false)} disabled={archiving}>Cancel</Btn>
              <Btn
                size="sm"
                variant="primary"
                disabled={archiving}
                onClick={async () => {
                  if (!id) return;
                  setArchiving(true);
                  setError(null);
                  try {
                    await archiveMedication(id);
                    router.push('/medications');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not archive.');
                    setArchiving(false);
                    setConfirmArchive(false);
                  }
                }}
              >
                {archiving ? 'Archiving...' : 'Confirm'}
              </Btn>
            </div>
          ) : (
            <Btn size="sm" variant="ghost" onClick={() => setConfirmArchive(true)}>Archive medication</Btn>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Adherence 7d" value={sched7dEst > 0 ? `${adherencePct}%` : 'n/a'} hint={sched7dEst > 0 ? `${taken7d} of ${sched7dEst} doses` : 'no data yet'} accent={adherencePct >= 90 ? 'ok' : adherencePct >= 70 ? 'warn' : 'danger'} />
        <StatTile label="On hand" value={med.remainingDoses ?? 'n/a'} hint="doses remaining" accent={(med.remainingDoses ?? 0) < 10 ? 'danger' : (med.remainingDoses ?? 0) < 20 ? 'warn' : 'ok'} />
        <StatTile label="Refill in" value={`${med.refillThresholdDays ? med.refillThresholdDays + 'd' : 'n/a'}`} hint="threshold" />
      </div>

      <Section title="This week">
        <WeekStrip dosesByDay={weekDoses} />
      </Section>

      <Section title="Doses today">
        <Surface>
          {doses.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No doses scheduled today.</div>
          ) : (
            <ul>
              {doses.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).map(d => (
                <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <Bell size={16} className="text-neutral-400" />
                  <div className="flex-1 text-sm">
                    {formatTime(d.scheduledAt)}
                    {d.status === 'taken' && <Pill tone="ok"><CalendarCheck size={12} /> taken</Pill>}
                    {d.status === 'skipped' && <Pill tone="warn">skipped</Pill>}
                  </div>
                  {d.status === 'pending' && <Btn size="sm" variant="primary" onClick={() => quickTake(d.id)}>Take</Btn>}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      <Section title="Schedule">
        <Surface>
          {schedules.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No schedule configured.</div>
          ) : (
            <ul>
              {schedules.map(s => (
                <li key={s.id} className="p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 flex items-center gap-3">
                  <Calendar size={16} className="text-neutral-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.times.join(', ')}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{daysLabel(s.daysOfWeek)} {s.notes ? `, ${s.notes}` : ''}</div>
                  </div>
                  {s.endDate && <Pill tone="info">ends {formatDate(s.endDate)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      <Section title="Refills">
        <Surface>
          {refills.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No refills on file.</div>
          ) : (
            <ul>
              {refills.map(r => (
                <li key={r.id} className="p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 flex items-center gap-3">
                  <ChartBar size={16} className="text-neutral-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.pharmacy ?? 'Pharmacy not set'}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.daysSupply} day supply, refill by {formatDate(r.refillBy)}</div>
                  </div>
                  <Pill tone={r.status === 'needed' ? 'warn' : r.status === 'ready' ? 'ok' : 'info'}>{r.status.replace('_', ' ')}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      {error && <ErrorBox message={error} onRetry={() => setError(null)} />}
    </div>
  );
}

function daysLabel(days?: number[]): string {
  if (!days || days.length === 7) return 'Every day';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map(d => names[d]).join(', ');
}
