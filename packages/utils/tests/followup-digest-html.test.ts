import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestHtml,
  renderFollowupDigestHtml,
  hasFollowupDigestHtml,
} from '../src/followup-digest-html';
import {
  buildFollowupReport,
  type FollowupRequirement,
} from '../src/appointment-followup-tracker';
import { buildFollowupDigest } from '../src/followup-overdue-digest';

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

describe('buildFollowupDigestHtml — null short-circuit', () => {
  it('returns null when patient has no follow-ups requiring attention', () => {
    const report = reportWith([]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html).toBeNull();
  });

  it('returns null when only upcoming rows and includeUpcoming=false', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html).toBeNull();
  });

  it('returns HTML when there is an overdue row', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'Old' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html).not.toBeNull();
  });
});

describe('buildFollowupDigestHtml — subject parity with text digest', () => {
  it('emits the same subject as the text digest', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-04-15', title: 'Older', priority: 'urgent' }),
    ]);
    const text = buildFollowupDigest({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.subject).toBe(text?.subject);
  });
});

describe('buildFollowupDigestHtml — body structure', () => {
  it('includes the patient name and the most-overdue title in the opener', () => {
    const report = reportWith([
      req({ dueAt: '2026-04-01', title: 'Cardiology RTC' }),
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('Jane Doe');
    expect(html?.html).toContain('Cardiology RTC');
  });

  it('renders an Overdue section with the row count', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'A' }),
      req({ dueAt: '2026-04-01', title: 'B' }),
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('Overdue (2)');
  });

  it('renders a Due soon section when there are due-soon rows', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-25', title: 'Soon' }),
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('Due soon (1)');
  });

  it('hides Upcoming section unless includeUpcoming=true', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-12-01', title: 'Far' }),
    ]);
    const html = buildFollowupDigestHtml(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUpcoming: false },
    );
    expect(html?.html).not.toContain('Upcoming');
  });

  it('shows Upcoming section when includeUpcoming=true', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Old' }),
      req({ dueAt: '2026-12-01', title: 'Far' }),
    ]);
    const html = buildFollowupDigestHtml(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUpcoming: true },
    );
    expect(html?.html).toContain('Upcoming (1)');
    expect(html?.html).toContain('Far');
  });

  it('renders an "...and N more" overflow row when truncating', () => {
    const reqs: FollowupRequirement[] = [];
    for (let i = 0; i < 15; i++) {
      reqs.push(req({ dueAt: '2026-05-01', title: `O${i}` }));
    }
    const report = reportWith(reqs);
    const html = buildFollowupDigestHtml(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { overdueLimit: 5 },
    );
    expect(html?.html).toContain('and 10 more');
  });
});

describe('buildFollowupDigestHtml — status chips', () => {
  it('emits an OVERDUE chip for overdue rows', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toMatch(/OVERDUE\s+-\d+d/);
    // Red text colour for overdue chip.
    expect(html?.html).toContain('#991b1b');
  });

  it('emits a DUE chip for due-soon rows', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Soon' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toMatch(/DUE \+\d+d/);
    expect(html?.html).toContain('#854d0e'); // amber text
  });

  it('emits an UPCOMING chip when includeUpcoming=true', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'O' }),
      req({ dueAt: '2026-12-01', title: 'Far' }),
    ]);
    const html = buildFollowupDigestHtml(
      {
        patient: { name: 'Jane' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUpcoming: true },
    );
    expect(html?.html).toContain('UPCOMING');
    expect(html?.html).toContain('#1e3a8a'); // blue text
  });
});

describe('buildFollowupDigestHtml — expired advisory', () => {
  it('renders the re-referral advisory when an overdue item is past grace', () => {
    const report = reportWith([
      req({ dueAt: '2026-01-01', title: 'Way overdue' }), // > 60d grace
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('re-referral');
  });

  it('does not render the advisory when no item is past grace', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Recently overdue' }),
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).not.toContain('re-referral');
  });
});

describe('buildFollowupDigestHtml — portal CTA and unsubscribe', () => {
  it('includes a portal link when portalUrl is set', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: 'https://app.example.com/patient/jane',
    });
    expect(html?.html).toContain('href="https://app.example.com/patient/jane"');
    expect(html?.html).toContain('Mark items complete or cancel them');
  });

  it('omits portal block when portalUrl is missing or blank', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: '   ',
    });
    expect(html?.html).not.toContain('Mark items complete');
  });

  it('includes the unsubscribe footer by default', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('stop receiving updates');
  });

  it('omits the unsubscribe footer when disabled', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml(
      {
        patient: { name: 'Jane' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { includeUnsubscribeFooter: false },
    );
    expect(html?.html).not.toContain('stop receiving updates');
  });
});

describe('buildFollowupDigestHtml — HTML-escape', () => {
  it('escapes HTML metacharacters in patient name', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: '<script>alert(1)</script>' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).not.toContain('<script>alert(1)</script>');
    expect(html?.html).toContain('&lt;script&gt;');
  });

  it('escapes HTML metacharacters in row titles', () => {
    const report = reportWith([
      req({ dueAt: '2026-05-01', title: 'Visit & <follow-up>' }),
    ]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    expect(html?.html).toContain('Visit &amp; &lt;follow-up&gt;');
  });

  it('escapes the portal URL', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const html = buildFollowupDigestHtml({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
      portalUrl: 'https://example.com/?q="hi"',
    });
    expect(html?.html).toContain('&quot;hi&quot;');
  });
});

describe('renderFollowupDigestHtml — standalone render', () => {
  it('renders an existing digest without re-walking the report', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    const digest = buildFollowupDigest({
      patient: { name: 'Jane' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    })!;
    const html = renderFollowupDigestHtml(
      digest,
      { patient: { name: 'Jane' }, weekStart: '2026-06-15', weekEnd: '2026-06-21' },
    );
    expect(html.subject).toBe(digest.subject);
    expect(html.html).toContain('Overdue');
  });
});

describe('hasFollowupDigestHtml', () => {
  it('false on empty report', () => {
    const report = reportWith([]);
    expect(hasFollowupDigestHtml(report)).toBe(false);
  });
  it('true with overdue', () => {
    const report = reportWith([req({ dueAt: '2026-05-01', title: 'A' })]);
    expect(hasFollowupDigestHtml(report)).toBe(true);
  });
  it('true with due-soon', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Soon' })]);
    expect(hasFollowupDigestHtml(report)).toBe(true);
  });
  it('true with upcoming + includeUpcoming flag', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    expect(hasFollowupDigestHtml(report, { includeUpcoming: true })).toBe(true);
  });
  it('false with upcoming and no includeUpcoming flag', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    expect(hasFollowupDigestHtml(report)).toBe(false);
  });
});
