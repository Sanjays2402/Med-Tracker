'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pill as PillIcon, Calendar, ChartBar, Bell, CalendarCheck, Clock, Check, Pencil, X as XIcon } from '@med/icons';
import { Btn, Surface, Section, ErrorBox, SkeletonRow, Pill, StatTile, formatTime, formatDate } from '../../../../components/uikit';
import { useRouter } from 'next/navigation';
import { getMedication, listTodayDoses, listSchedules, listRefills, logDose, getAdherence, getMedicationAdherence, archiveMedication, updateMedication, listDosesForDate, type MedAdherenceRow } from '../../../../lib/data';
import type { Medication, DoseEvent, ScheduleEntry, Refill, AdherenceSummary } from '../../../../lib/types';
import { computeNextDose } from '../../../../lib/next-dose';
import { WeekStrip } from '../../../../components/WeekStrip';
import { localKey, type WeekStripDoseInput } from '../../../../lib/week-strip';
import { AdherenceRing } from '../../../../components/AdherenceRing';
import { buildMedAdherence, findMedRow } from '../../../../lib/med-adherence';
import { buildSupplyBar, daysLeftToneVar } from '../../../../lib/days-left-tone';

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
  const [medAdherence, setMedAdherence] = React.useState<MedAdherenceRow[] | null>(null);
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
      const [m, d, s, r, a, ma] = await Promise.all([getMedication(id), listTodayDoses(), listSchedules(), listRefills(), getAdherence(), getMedicationAdherence(30)]);
      setMed(m);
      setDoses(d.filter(x => x.medicationId === id));
      setSchedules(s.filter(x => x.medicationId === id));
      setRefills(r.filter(x => x.medicationId === id));
      setAdherence(a);
      setMedAdherence(ma);
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

  // Per-medication adherence over the 30d window, from the real per-med endpoint.
  // buildMedAdherence reports hasData=false honestly when this med has no
  // scheduled doses, so the ring section can show "no data yet" instead of 0%.
  const medAdView = buildMedAdherence(findMedRow(medAdherence, id ?? ''), 30);
  const adherencePct = medAdView.pct;

  const nextDose = computeNextDose(doses, now);
  const nextChip =
    nextDose.tone === 'overdue'
      ? { tone: 'danger' as const, prefix: 'overdue' }
      : nextDose.tone === 'due'
      ? { tone: 'warn' as const, prefix: 'due' }
      : nextDose.tone === 'upcoming'
      ? { tone: 'accent' as const, prefix: 'next dose' }
      : { tone: 'ok' as const, prefix: 'today' };

  // Horizontal supply-remaining bar for the hero: fills proportional to the
  // estimated days of supply left over a 30-day horizon and tones coral/amber/
  // sage by urgency, so a glance at the top of the page reads how much runway
  // this medication has before it runs dry.
  const supply = buildSupplyBar(med);

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

        {/* Supply-remaining bar — fills with the estimated days of supply left
            over a 30-day horizon, toned coral/amber/sage by urgency. Shows a
            muted track + "No supply data" when remainingDoses is unknown. */}
        <div className="px-6 sm:px-8 py-4 border-t border-[var(--line-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">Supply remaining</div>
            <div
              className="text-[12px] tabular"
              style={{ color: supply.hasData ? daysLeftToneVar(supply.daysLeft) : 'var(--ink-muted)' }}
            >
              {supply.caption}
            </div>
          </div>
          <div
            className="mt-2 h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-sunk)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={supply.horizonDays}
            aria-valuenow={supply.hasData ? (supply.daysLeft ?? 0) : undefined}
            aria-label={supply.hasData ? `${supply.caption} (of ${supply.horizonDays} day view)` : 'No supply data'}
          >
            {supply.hasData && (
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(supply.pct, supply.daysLeft && supply.daysLeft > 0 ? 4 : 0)}%`,
                  background: daysLeftToneVar(supply.daysLeft),
                  borderRadius: '9999px',
                }}
              />
            )}
          </div>
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
        <StatTile label="Adherence 30d" value={medAdView.hasData ? `${adherencePct}%` : 'n/a'} hint={medAdView.hasData ? medAdView.caption : 'no data yet'} accent={medAdView.tone} />
        <StatTile label="On hand" value={med.remainingDoses ?? 'n/a'} hint="doses remaining" accent={(med.remainingDoses ?? 0) < 10 ? 'danger' : (med.remainingDoses ?? 0) < 20 ? 'warn' : 'ok'} />
        <StatTile label="Refill in" value={`${med.refillThresholdDays ? med.refillThresholdDays + 'd' : 'n/a'}`} hint="threshold" />
      </div>

      <Section title="Adherence">
        <Surface>
          <div className="p-5 sm:p-6 flex items-center gap-6 flex-wrap">
            <AdherenceRing
              percent={medAdView.hasData ? adherencePct : 0}
              tone={medAdView.hasData ? medAdView.tone : 'accent'}
              size={132}
              stroke={12}
              label={medAdView.hasData ? `${med.name} adherence: ${adherencePct}%` : `${med.name}: no adherence data yet`}
            >
              {medAdView.hasData ? (
                <>
                  <div className="display text-[30px] leading-none tabular text-[var(--ink)]">
                    {adherencePct}
                    <span className="text-[var(--ink-muted)] text-[16px] align-top ml-0.5">%</span>
                  </div>
                  <div className="eyebrow mt-1.5">{medAdView.windowDays}d</div>
                </>
              ) : (
                <div className="text-[12px] text-[var(--ink-muted)] px-3 text-center leading-snug">No doses yet</div>
              )}
            </AdherenceRing>
            <div className="flex-1 min-w-[180px] space-y-2">
              {medAdView.hasData ? (
                <>
                  <div className="text-[14px] text-[var(--ink)]">
                    <span className="tabular font-medium">{medAdView.taken}</span>
                    <span className="text-[var(--ink-muted)]"> of </span>
                    <span className="tabular font-medium">{medAdView.scheduled}</span>
                    <span className="text-[var(--ink-muted)]"> doses taken</span>
                  </div>
                  <div className="text-[12.5px] text-[var(--ink-muted)]">Over the {medAdView.windowLabel}.</div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className={`capsule capsule-${medAdView.tone === 'ok' ? 'ok' : medAdView.tone === 'warn' ? 'warn' : 'danger'}`}>
                      {medAdView.tone === 'ok' ? 'On track' : medAdView.tone === 'warn' ? 'Slipping' : 'Needs attention'}
                    </span>
                    <Link href={`/medications/${id}/history`} className="capsule hover:text-[var(--ink)]">
                      View history
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[14px] text-[var(--ink)]">No adherence data yet</div>
                  <div className="text-[12.5px] text-[var(--ink-muted)]">
                    Log a few doses and this ring fills in over the {medAdView.windowLabel}.
                  </div>
                </>
              )}
            </div>
          </div>
        </Surface>
      </Section>

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
