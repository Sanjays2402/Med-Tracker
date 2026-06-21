import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigest,
  hasFollowupDigest,
  renderFollowupSms,
  summarizeFollowupReport,
} from '../src/followup-overdue-digest';
import {
  buildFollowupReport,
  type FollowupRequirement,
} from '../src/appointment-followup-tracker';

const NOW = new Date(2026, 5, 21); // 2026-06-21

function req(o: Partial<FollowupRequirement> & { dueAt: string }): FollowupRequirement {
  return {
    kind: 'visit',
    title: 'Visit',
    ...o,
  };
}

function reportWith(rows: FollowupRequirement[]) {
  return buildFollowupReport({ followups: rows, now: NOW });
}

describe('hasFollowupDigest', () => {
  it('false when no overdue and no due-soon', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Distant visit' })]);
    expect(hasFollowupDigest(report)).toBe(false);
  });

  it('true when at least one overdue', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    expect(hasFollowupDigest(report)).toBe(true);
  });

  it('true when at least one due-soon', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Soon' })]);
    expect(hasFollowupDigest(report)).toBe(true);
  });

  it('true when upcoming and includeUpcoming=true', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    expect(hasFollowupDigest(report, { includeUpcoming: true })).toBe(true);
  });

  it('false on empty report', () => {
    const report = reportWith([]);
    expect(hasFollowupDigest(report)).toBe(false);
  });
});

describe('buildFollowupDigest — null short-circuit', () => {
  it('returns null when patient has no follow-ups requiring attention', () => {
    const report = reportWith([]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(digest).toBeNull();
  });

  it('returns null when only upcoming rows and includeUpcoming=false', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(digest).toBeNull();
  });

  it('returns digest when upcoming included via option', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far visit' })]);
    const digest = buildFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUpcoming: true },
    );
    expect(digest).not.toBeNull();
    expect(digest?.stats.upcomingCount).toBe(1);
  });
});

describe('buildFollowupDigest — subject line', () => {
  it('1 overdue uses singular subject with title', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'Cardiology RTC' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.subject).toBe('Jane: 1 overdue follow-up (Cardiology RTC)');
  });

  it('multiple overdue uses oldest in subject', () => {
    const report = reportWith([
      req({ dueAt: '2026-04-01', title: 'Mammogram' }),
      req({ dueAt: '2026-05-15', title: 'Recent' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.subject).toContain('2 overdue');
    expect(digest.subject).toContain('Mammogram');
  });

  it('due-soon only uses count subject', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-25', title: 'Soon1' }),
      req({ dueAt: '2026-06-28', title: 'Soon2' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.subject).toContain('2 follow-ups due soon');
  });

  it('uses patient.display when present (caregiver-friendly name)', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Mary Smith', display: 'Mom' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.subject.startsWith('Mom:')).toBe(true);
  });
});

describe('buildFollowupDigest — body content', () => {
  it('opens with overdue headline citing the oldest item', () => {
    const report = reportWith([
      req({ dueAt: '2026-04-01', title: 'Mammogram' }),
      req({ dueAt: '2026-05-15', title: 'X' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).toContain('Jane has 2 overdue follow-ups');
    expect(digest.text).toContain('"Mammogram"');
  });

  it('shows both overdue and due-soon sections', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-15', title: 'Old1' }),
      req({ dueAt: '2026-06-25', title: 'Soon1' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).toContain('Overdue (1)');
    expect(digest.text).toContain('Due soon (1)');
    expect(digest.text).toContain('Old1');
    expect(digest.text).toContain('Soon1');
  });

  it('truncates with "...and N more" when over the limit', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      req({ dueAt: `2026-05-${String(i + 1).padStart(2, '0')}`, title: `Item-${i}` }),
    );
    const report = reportWith(rows);
    const digest = buildFollowupDigest(
      { patient: { name: 'Jane' }, report, weekStart: '2026-06-15', weekEnd: '2026-06-21' },
      { overdueLimit: 5 },
    )!;
    expect(digest.text).toContain('...and 10 more');
    expect(digest.rows).toHaveLength(5); // body cap
  });

  it('flags expired (past grace) items in the opener', () => {
    const report = reportWith([
      req({ dueAt: '2025-06-01', title: 'Way old', graceDays: 60 }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).toContain('past their grace window');
    expect(digest.stats.hasExpired).toBe(true);
  });

  it('includes portalUrl when provided', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: 'https://example.com/portal',
    })!;
    expect(digest.text).toContain('https://example.com/portal');
  });

  it('omits portalUrl block when not provided', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).not.toContain('mark items complete');
  });

  it('renders priority brackets only when non-routine', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-15', title: 'Urgent visit', priority: 'urgent' }),
      req({ dueAt: '2026-05-16', title: 'Routine visit' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).toContain('[urgent]');
    expect(digest.text).not.toContain('[routine]');
  });

  it('always closes with the share-revocation footer', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.text).toContain('revoke your share');
  });
});

describe('buildFollowupDigest — stats', () => {
  it('returns correct counts for each status', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'O1' }),
      req({ dueAt: '2026-05-02', title: 'O2' }),
      req({ dueAt: '2026-06-25', title: 'D1' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.stats.overdueCount).toBe(2);
    expect(digest.stats.dueSoonCount).toBe(1);
    expect(digest.stats.upcomingCount).toBe(0);
  });

  it('mostOverdueDays/Title pick the LOWEST daysUntilDue', () => {
    const report = reportWith([
      req({ dueAt: '2026-04-01', title: 'Older' }),
      req({ dueAt: '2026-06-10', title: 'Newer' }),
    ]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.stats.mostOverdueTitle).toBe('Older');
    expect(digest.stats.mostOverdueDays).toBeLessThan(-50);
  });

  it('mostOverdueTitle is null when no overdue rows', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Soon' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    expect(digest.stats.mostOverdueTitle).toBeNull();
    expect(digest.stats.mostOverdueDays).toBeNull();
  });
});

describe('renderFollowupSms', () => {
  it('returns null when nothing actionable', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'X' })]);
    expect(renderFollowupSms({ name: 'Jane' }, report)).toBeNull();
  });

  it('returns null on empty report', () => {
    const report = reportWith([]);
    expect(renderFollowupSms({ name: 'Jane' }, report)).toBeNull();
  });

  it('overdue-led SMS cites the oldest item', () => {
    const report = reportWith([
      req({ dueAt: '2026-04-01', title: 'Mammogram' }),
      req({ dueAt: '2026-05-15', title: 'X' }),
      req({ dueAt: '2026-06-25', title: 'Soon' }),
    ]);
    const sms = renderFollowupSms({ name: 'Jane' }, report)!;
    expect(sms).toContain('2 overdue');
    expect(sms).toContain('1 due soon');
    expect(sms).toContain('Mammogram');
  });

  it('due-soon-only SMS cites the next-up item', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-25', title: 'Sooner' }),
      req({ dueAt: '2026-06-30', title: 'Later' }),
    ]);
    const sms = renderFollowupSms({ name: 'Jane' }, report)!;
    expect(sms).toContain('2 follow-ups due soon');
    expect(sms).toContain('Sooner');
  });

  it('respects display name', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const sms = renderFollowupSms({ name: 'Mary', display: 'Mom' }, report)!;
    expect(sms.startsWith('Mom:')).toBe(true);
  });

  it('singular phrasing for count=1', () => {
    const report = reportWith([req({ dueAt: '2026-05-15', title: 'X' })]);
    const sms = renderFollowupSms({ name: 'Jane' }, report)!;
    expect(sms).toContain('1 overdue follow-up'); // singular
    expect(sms).not.toContain('follow-ups');
  });
});

describe('summarizeFollowupReport', () => {
  it('returns a shallow copy of the status counts', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-15', title: 'O' }),
      req({ dueAt: '2026-06-25', title: 'D' }),
    ]);
    const counts = summarizeFollowupReport(report);
    expect(counts.overdue).toBe(1);
    expect(counts['due-soon']).toBe(1);
    expect(counts.upcoming).toBe(0);
  });
});

describe('end-to-end caregiver workflow', () => {
  it('full pipeline: requirements -> report -> digest', () => {
    const report = buildFollowupReport({
      followups: [
        { kind: 'lab', title: 'INR check', dueAt: '2026-04-15' }, // overdue
        { kind: 'visit', title: 'Cardiology RTC', dueAt: '2026-06-25' }, // due-soon
        { kind: 'imaging', title: 'Annual mammogram', dueAt: '2026-12-01' }, // upcoming
      ],
      now: NOW,
    });
    const digest = buildFollowupDigest({
      patient: { name: 'Mary Smith', display: 'Mom' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: 'https://med.example.com/p/mary',
    })!;
    expect(digest).not.toBeNull();
    expect(digest.subject).toContain('Mom');
    expect(digest.subject).toContain('1 overdue');
    expect(digest.text).toContain('INR check');
    expect(digest.text).toContain('Cardiology RTC');
    expect(digest.text).toContain('https://med.example.com/p/mary');
    // Upcoming is excluded by default
    expect(digest.text).not.toContain('Upcoming');
  });
});
