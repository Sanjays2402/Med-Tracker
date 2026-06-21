import { describe, it, expect } from 'vitest';
import {
  buildFollowupReport,
  deriveFollowupFromRecommendation,
  deriveFollowupsFromRecommendations,
  type FollowupRequirement,
  type FollowupTrackerInput,
} from '../src/appointment-followup-tracker';

const NOW = new Date(2026, 5, 21); // 2026-06-21

function req(overrides: Partial<FollowupRequirement> = {}): FollowupRequirement {
  return {
    kind: 'visit',
    title: 'Generic Visit',
    dueAt: '2026-07-15',
    ...overrides,
  };
}

describe('buildFollowupReport — status classification', () => {
  it('classifies a future visit as upcoming when beyond warnWithinDays', () => {
    const report = buildFollowupReport({
      followups: [req({ dueAt: '2026-12-01' })],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('upcoming');
    expect(report.rows[0]?.message).toBe('Upcoming on 2026-12-01');
  });

  it('classifies a near-term visit as due-soon', () => {
    const report = buildFollowupReport({
      followups: [req({ dueAt: '2026-06-28' })],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('due-soon');
    expect(report.rows[0]?.message).toBe('Due in 7 days');
  });

  it('classifies a past-due item as overdue', () => {
    const report = buildFollowupReport({
      followups: [req({ dueAt: '2026-06-01' })],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('overdue');
    expect(report.rows[0]?.message).toBe('Overdue by 20 days');
  });

  it('uses "Due today" when dueAt is today', () => {
    const report = buildFollowupReport({
      followups: [req({ dueAt: '2026-06-21' })],
      now: NOW,
    });
    expect(report.rows[0]?.message).toBe('Due today');
    expect(report.rows[0]?.status).toBe('due-soon');
  });

  it('uses "1 day" wording for the 1-day cases', () => {
    const tomorrow = buildFollowupReport({
      followups: [req({ dueAt: '2026-06-22' })],
      now: NOW,
    });
    expect(tomorrow.rows[0]?.message).toBe('Due in 1 day');
    const yesterday = buildFollowupReport({
      followups: [req({ dueAt: '2026-06-20' })],
      now: NOW,
    });
    expect(yesterday.rows[0]?.message).toBe('Overdue by 1 day');
  });

  it('escalates message beyond graceDays', () => {
    const report = buildFollowupReport({
      followups: [req({ dueAt: '2026-01-01', graceDays: 30 })],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('overdue');
    expect(report.rows[0]?.message).toMatch(/past grace window/);
  });
});

describe('buildFollowupReport — kind-specific defaults', () => {
  it('uses 7-day warn window for labs vs 14-day for visits', () => {
    const labReport = buildFollowupReport({
      followups: [req({ kind: 'lab', dueAt: '2026-07-01' })], // 10 days out
      now: NOW,
    });
    expect(labReport.rows[0]?.status).toBe('upcoming');

    const visitReport = buildFollowupReport({
      followups: [req({ kind: 'visit', dueAt: '2026-07-01' })], // 10 days out
      now: NOW,
    });
    expect(visitReport.rows[0]?.status).toBe('due-soon');
  });

  it('uses 21-day warn window for referrals', () => {
    const report = buildFollowupReport({
      followups: [req({ kind: 'referral', dueAt: '2026-07-10' })], // 19 days out
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('due-soon');
  });

  it('caller-supplied warnWithinDays overrides the kind default', () => {
    const report = buildFollowupReport({
      followups: [req({ kind: 'lab', dueAt: '2026-07-10', warnWithinDays: 30 })],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('due-soon');
  });
});

describe('buildFollowupReport — completion and cancellation', () => {
  it('marks an item completed when a completion matches by id', () => {
    const report = buildFollowupReport({
      followups: [req({ id: 'fu-1', dueAt: '2026-06-01' })],
      completions: [{ id: 'fu-1', completedAt: '2026-06-15' }],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('completed');
    expect(report.rows[0]?.message).toBe('Completed on 2026-06-15');
    expect(report.rows[0]?.completedAt).toBe('2026-06-15');
    // daysUntilDue at completion: completed 14 days late => -14
    expect(report.rows[0]?.daysUntilDue).toBe(-14);
  });

  it('completion wins over cancellation when both present', () => {
    const report = buildFollowupReport({
      followups: [req({ id: 'fu-1' })],
      completions: [{ id: 'fu-1', completedAt: '2026-06-15' }],
      cancellations: [{ id: 'fu-1', cancelledAt: '2026-06-10' }],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('completed');
  });

  it('marks an item cancelled with reason', () => {
    const report = buildFollowupReport({
      followups: [req({ id: 'fu-2' })],
      cancellations: [{ id: 'fu-2', cancelledAt: '2026-06-10', reason: 'patient declined' }],
      now: NOW,
    });
    expect(report.rows[0]?.status).toBe('cancelled');
    expect(report.rows[0]?.message).toBe('Cancelled: patient declined');
    expect(report.rows[0]?.cancellationReason).toBe('patient declined');
  });

  it('cancellation without reason gets a plain message', () => {
    const report = buildFollowupReport({
      followups: [req({ id: 'fu-3' })],
      cancellations: [{ id: 'fu-3', cancelledAt: '2026-06-10' }],
      now: NOW,
    });
    expect(report.rows[0]?.message).toBe('Cancelled');
    expect(report.rows[0]?.cancellationReason).toBeUndefined();
  });
});

describe('buildFollowupReport — id derivation', () => {
  it('derives a deterministic id from kind + dueAt + title slug', () => {
    const r1 = buildFollowupReport({
      followups: [{ kind: 'lab', title: 'INR check', dueAt: '2026-07-01' }],
      now: NOW,
    });
    const r2 = buildFollowupReport({
      followups: [{ kind: 'lab', title: 'INR check', dueAt: '2026-07-01' }],
      now: NOW,
    });
    expect(r1.rows[0]?.id).toBe(r2.rows[0]?.id);
    expect(r1.rows[0]?.id).toBe('fu_lab_2026-07-01_inr-check');
  });

  it('caller-supplied id wins over the derived one', () => {
    const r = buildFollowupReport({
      followups: [{ id: 'cardiology-rtc-q3', kind: 'visit', title: 'X', dueAt: '2026-09-01' }],
      now: NOW,
    });
    expect(r.rows[0]?.id).toBe('cardiology-rtc-q3');
  });
});

describe('buildFollowupReport — sorting and rollups', () => {
  it('sorts overdue first, then due-soon, then upcoming, then completed, then cancelled', () => {
    const followups: FollowupRequirement[] = [
      req({ id: 'a', dueAt: '2026-12-01' }), // upcoming
      req({ id: 'b', dueAt: '2026-06-01' }), // overdue
      req({ id: 'c', dueAt: '2026-06-25' }), // due-soon
      req({ id: 'd', dueAt: '2026-05-01' }), // will be completed
      req({ id: 'e', dueAt: '2026-05-15' }), // will be cancelled
    ];
    const report = buildFollowupReport({
      followups,
      completions: [{ id: 'd', completedAt: '2026-05-10' }],
      cancellations: [{ id: 'e', cancelledAt: '2026-05-20' }],
      now: NOW,
    });
    expect(report.rows.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('rollup counts match status distribution', () => {
    const followups: FollowupRequirement[] = [
      req({ id: 'a', dueAt: '2026-06-01' }),
      req({ id: 'b', dueAt: '2026-06-02' }),
      req({ id: 'c', dueAt: '2026-06-25' }),
      req({ id: 'd', dueAt: '2026-12-01' }),
    ];
    const report = buildFollowupReport({ followups, now: NOW });
    expect(report.counts.overdue).toBe(2);
    expect(report.counts['due-soon']).toBe(1);
    expect(report.counts.upcoming).toBe(1);
    expect(report.counts.completed).toBe(0);
  });

  it('needsAttention only contains overdue + due-soon, sorted by dueAt', () => {
    const followups: FollowupRequirement[] = [
      req({ id: 'a', dueAt: '2026-12-01' }), // upcoming
      req({ id: 'b', dueAt: '2026-06-25' }), // due-soon
      req({ id: 'c', dueAt: '2026-06-01' }), // overdue
    ];
    const report = buildFollowupReport({ followups, now: NOW });
    expect(report.needsAttention.map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('reports asOf as a date-only ISO string', () => {
    const r = buildFollowupReport({ followups: [], now: NOW });
    expect(r.asOf).toBe('2026-06-21');
  });
});

describe('buildFollowupReport — priority and metadata pass-through', () => {
  it('priority defaults to routine', () => {
    const r = buildFollowupReport({ followups: [req()], now: NOW });
    expect(r.rows[0]?.priority).toBe('routine');
  });

  it('within same status + dueAt, urgent sorts before routine', () => {
    const followups: FollowupRequirement[] = [
      req({ id: 'low', dueAt: '2026-06-22', priority: 'routine' }),
      req({ id: 'high', dueAt: '2026-06-22', priority: 'urgent' }),
    ];
    const r = buildFollowupReport({ followups, now: NOW });
    expect(r.rows.map((row) => row.id)).toEqual(['high', 'low']);
  });

  it('passes through recommended* + medicationId + fromNote on the row', () => {
    const r = buildFollowupReport({
      followups: [
        req({
          id: 'x',
          recommendedAt: '2026-03-01',
          recommendedBy: 'Dr Smith',
          medicationId: 'm-1',
          fromNote: 'see in 3 months',
        }),
      ],
      now: NOW,
    });
    const row = r.rows[0]!;
    expect(row.recommendedAt).toBe('2026-03-01');
    expect(row.recommendedBy).toBe('Dr Smith');
    expect(row.medicationId).toBe('m-1');
    expect(row.fromNote).toBe('see in 3 months');
  });
});

describe('buildFollowupReport — malformed input handling', () => {
  it('skips entries with an unparseable dueAt', () => {
    const r = buildFollowupReport({
      followups: [req({ dueAt: 'not-a-date' }), req({ id: 'good' })],
      now: NOW,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.id).toBe('good');
  });

  it('handles an empty input list cleanly', () => {
    const r = buildFollowupReport({ followups: [], now: NOW });
    expect(r.rows).toHaveLength(0);
    expect(r.counts.overdue).toBe(0);
    expect(r.needsAttention).toHaveLength(0);
  });
});

describe('deriveFollowupFromRecommendation', () => {
  it('translates months offset to an absolute dueAt', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'Cardio RTC',
      kind: 'visit',
      months: 3,
    });
    expect(f?.dueAt).toBe('2026-09-01');
    expect(f?.recommendedAt).toBe('2026-06-01');
  });

  it('translates weeks offset by multiplying by 7', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'X',
      kind: 'lab',
      weeks: 6,
    });
    expect(f?.dueAt).toBe('2026-07-13');
  });

  it('translates days offset directly', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'X',
      kind: 'lab',
      days: 14,
    });
    expect(f?.dueAt).toBe('2026-06-15');
  });

  it('clips day-of-month when target month is shorter', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-01-31',
      title: 'X',
      kind: 'visit',
      months: 1,
    });
    expect(f?.dueAt).toBe('2026-02-28');
  });

  it('days wins over weeks wins over months when multiple supplied', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'X',
      kind: 'visit',
      days: 10,
      weeks: 6,
      months: 3,
    });
    expect(f?.dueAt).toBe('2026-06-11');
  });

  it('explicit dueAt wins over all offsets', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'X',
      kind: 'visit',
      months: 3,
      dueAt: '2026-08-15',
    });
    expect(f?.dueAt).toBe('2026-08-15');
  });

  it('returns null when no dueAt and no offsets are provided', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'X',
      kind: 'visit',
    });
    expect(f).toBeNull();
  });

  it('passes through note + clinician + priority + medicationId', () => {
    const f = deriveFollowupFromRecommendation({
      recommendedAt: '2026-06-01',
      title: 'INR check',
      kind: 'lab',
      weeks: 4,
      note: 'see in 4 weeks',
      recommendedBy: 'Dr Smith',
      priority: 'urgent',
      medicationId: 'warfarin',
    });
    expect(f?.fromNote).toBe('see in 4 weeks');
    expect(f?.recommendedBy).toBe('Dr Smith');
    expect(f?.priority).toBe('urgent');
    expect(f?.medicationId).toBe('warfarin');
  });
});

describe('deriveFollowupsFromRecommendations', () => {
  it('translates a batch, dropping no-due recommendations silently', () => {
    const out = deriveFollowupsFromRecommendations([
      { recommendedAt: '2026-06-01', title: 'A', kind: 'visit', months: 3 },
      { recommendedAt: '2026-06-01', title: 'B', kind: 'visit' }, // dropped (no offset)
      { recommendedAt: '2026-06-01', title: 'C', kind: 'lab', weeks: 4 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.title)).toEqual(['A', 'C']);
  });
});

describe('end-to-end with relative recommendations', () => {
  it('derives + tracks a 3-month cardiology RTC across the lifecycle', () => {
    const derived = deriveFollowupsFromRecommendations([
      {
        recommendedAt: '2026-03-21',
        title: 'Cardiology RTC',
        kind: 'visit',
        months: 3,
        recommendedBy: 'Dr Smith',
      },
    ]);
    const report = buildFollowupReport({
      followups: derived,
      now: NOW,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.dueAt).toBe('2026-06-21');
    expect(report.rows[0]?.status).toBe('due-soon');
    expect(report.rows[0]?.message).toBe('Due today');
    expect(report.rows[0]?.recommendedBy).toBe('Dr Smith');
  });
});
