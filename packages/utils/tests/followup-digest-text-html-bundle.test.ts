import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestBundle,
  hasFollowupDigestBundle,
  toFollowupDigestMimeEnvelope,
} from '../src/followup-digest-text-html-bundle';
import {
  buildFollowupReport,
  type FollowupRequirement,
} from '../src/appointment-followup-tracker';
import { buildFollowupDigest } from '../src/followup-overdue-digest';
import { buildFollowupDigestHtml } from '../src/followup-digest-html';

const NOW = new Date(2026, 5, 21);

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

describe('buildFollowupDigestBundle — null short-circuit', () => {
  it('returns null on a silent week', () => {
    const report = reportWith([]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out).toBeNull();
  });

  it('returns null when only upcoming rows and includeUpcoming=false', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out).toBeNull();
  });

  it('returns a bundle when there is an overdue row', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out).not.toBeNull();
  });
});

describe('buildFollowupDigestBundle — text / html parity', () => {
  it('produces the same subject as the underlying text digest', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-04-15', title: 'Older' }),
    ]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const ref = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.subject).toBe(ref!.subject);
  });

  it('returns text equal to the underlying text digest body', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const ref = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.text).toBe(ref!.text);
  });

  it('returns html equal to the renderFollowupDigestHtml render', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-04-15', title: 'Older' }),
    ]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const ref = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.html).toBe(ref!.html);
  });

  it('passes section limits to BOTH text and html bodies', () => {
    const rows: FollowupRequirement[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(req({ dueAt: `2026-05-0${(i % 9) + 1}`, title: `Visit ${i}` }));
    }
    const out = buildFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report: reportWith(rows),
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { overdueLimit: 5 },
    );
    expect(out).not.toBeNull();
    if (!out) return;
    expect(out.text).toContain('Overdue (15)');
    expect(out.text).toContain('...and 10 more');
    expect(out.html).toContain('Overdue (15)');
    expect(out.html).toContain('10 more not shown');
  });

  it('respects includeUpcoming + upcomingLimit across both bodies', () => {
    const rows: FollowupRequirement[] = [
      req({ dueAt: '2026-05-01', title: 'Overdue1' }),
      req({ dueAt: '2026-12-01', title: 'Future1' }),
      req({ dueAt: '2026-12-02', title: 'Future2' }),
      req({ dueAt: '2026-12-03', title: 'Future3' }),
    ];
    const out = buildFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report: reportWith(rows),
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUpcoming: true, upcomingLimit: 1 },
    );
    expect(out).not.toBeNull();
    if (!out) return;
    expect(out.text).toContain('Upcoming (3)');
    expect(out.html).toContain('Upcoming (3)');
  });
});

describe('buildFollowupDigestBundle — html-only options threaded through', () => {
  it('respects brandColor in the HTML body without affecting text', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { brandColor: '#ff00ff' },
    );
    expect(out!.html).toContain('#ff00ff');
    expect(out!.text).not.toContain('#ff00ff');
  });

  it('omits the unsubscribe footer in HTML when disabled', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUnsubscribeFooter: false },
    );
    expect(out!.html).not.toContain('To stop receiving updates');
  });

  it('honours fontFamily override in the HTML body only', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { fontFamily: 'Comic Sans MS' },
    );
    expect(out!.html).toContain('Comic Sans MS');
    expect(out!.text).not.toContain('Comic Sans MS');
  });
});

describe('buildFollowupDigestBundle — row set parity', () => {
  it('emits the same rows array as the underlying text digest', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-06-25', title: 'Soon' }),
    ]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const ref = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.rows).toEqual(ref!.rows);
  });

  it('shares stats with the underlying digest', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'A' }),
      req({ dueAt: '2026-04-15', title: 'B' }),
    ]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.stats.overdueCount).toBe(2);
    expect(out!.stats.mostOverdueTitle).toBe('B');
  });
});

describe('hasFollowupDigestBundle', () => {
  it('returns false on a silent week', () => {
    const report = reportWith([]);
    expect(hasFollowupDigestBundle({ report })).toBe(false);
  });

  it('returns true when overdue rows exist', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    expect(hasFollowupDigestBundle({ report })).toBe(true);
  });

  it('honours includeUpcoming option', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    expect(hasFollowupDigestBundle({ report }, { includeUpcoming: false })).toBe(false);
    expect(hasFollowupDigestBundle({ report }, { includeUpcoming: true })).toBe(true);
  });
});

describe('toFollowupDigestMimeEnvelope', () => {
  it('produces both top-level fields and alternatives', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const bundle = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const env = toFollowupDigestMimeEnvelope(bundle!);
    expect(env.subject).toBe(bundle!.subject);
    expect(env.text).toBe(bundle!.text);
    expect(env.html).toBe(bundle!.html);
    expect(env.alternatives).toHaveLength(2);
    expect(env.alternatives[0]!.contentType).toBe('text/plain');
    expect(env.alternatives[1]!.contentType).toBe('text/html');
    expect(env.alternatives[0]!.body).toBe(bundle!.text);
    expect(env.alternatives[1]!.body).toBe(bundle!.html);
  });

  it('forwards stats from the bundle', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const bundle = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const env = toFollowupDigestMimeEnvelope(bundle!);
    expect(env.stats.overdueCount).toBe(1);
  });
});

describe('buildFollowupDigestBundle — portalUrl threading', () => {
  it('includes the portal URL in both text and html when provided', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: 'https://med-tracker.example/portal/abc',
    });
    expect(out!.text).toContain('https://med-tracker.example/portal/abc');
    expect(out!.html).toContain('https://med-tracker.example/portal/abc');
  });

  it('omits the portal section from both bodies when portalUrl is absent', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const out = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(out!.text).not.toContain('To mark items complete');
    expect(out!.html).not.toContain('Mark items complete');
  });
});
