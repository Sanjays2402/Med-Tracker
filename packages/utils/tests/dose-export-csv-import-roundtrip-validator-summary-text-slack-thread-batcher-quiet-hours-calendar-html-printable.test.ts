import { describe, it, expect } from 'vitest';
import {
  renderQuietHoursCalendarHtmlPrintable,
  summarizeQuietHoursCalendarHtmlPrintable,
  extractQuietHoursCalendarHtmlPrintableLines,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable';

// Happy path tests ----------------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — happy path', () => {
  it('renders a full HTML document by default', () => {
    const r = renderQuietHoursCalendarHtmlPrintable();
    expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(r.html).toContain('<title>');
    expect(r.html).toContain('</html>');
  });

  it('emits a fragment when wrapHtmlDocument=false', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    expect(r.html.startsWith('<!DOCTYPE html>')).toBe(false);
    expect(r.html).toContain('<section class="qh-cal-wrapper">');
  });

  it('uses the monochrome palette (no colour backgrounds in inline style)', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    // No coloured backgrounds in the inline style attribute. Only
    // the white background is allowed.
    expect(r.html).not.toMatch(/background:\s*#e5e7eb/);
    expect(r.html).not.toMatch(/background:\s*#fde68a/);
    expect(r.html).not.toMatch(/background:\s*#fecaca/);
    expect(r.html).not.toMatch(/background:\s*#bbf7d0/);
    // The CSS overlay re-asserts white as !important.
    expect(r.html).toContain('background: #ffffff !important');
  });

  it('emits cells in week order (Monday first by default)', () => {
    const r = renderQuietHoursCalendarHtmlPrintable();
    const days = r.cells.map((c) => c.dayOfWeek);
    expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('emits cells in Sunday-first order when requested', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      weekStart: 'sun-first',
    });
    const days = r.cells.map((c) => c.dayOfWeek);
    expect(days).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });
});

// Current-day suppression tests ---------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — current-day suppression', () => {
  it('strips the current-day star from the day label', () => {
    // runAt = Saturday 2026-06-27 noon UTC
    const r = renderQuietHoursCalendarHtmlPrintable({
      runAt: new Date('2026-06-27T12:00:00Z'),
      wrapHtmlDocument: false,
    });
    // No star character should remain in the HTML.
    expect(r.html).not.toContain('\u2605');
  });

  it('strips the current-day outline via CSS override', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      runAt: new Date('2026-06-27T12:00:00Z'),
      wrapHtmlDocument: false,
    });
    // The overlay CSS suppresses the outline.
    expect(r.html).toContain('outline: none !important');
  });
});

// Bold rule label tests -----------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — bold non-default labels', () => {
  it('bolds the "Quiet all day" rule label by default', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: { sat: { kind: 'quiet-all-day' } },
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain('<strong>Quiet all day</strong>');
    expect(r.cells.find((c) => c.dayOfWeek === 'sat')?.rule).toBe(
      'override:all-day',
    );
  });

  it('bolds the "Custom window" rule label', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: {
        wed: {
          kind: 'window',
          window: {
            startHour: 14,
            endHour: 16,
            timezone: 'America/Los_Angeles',
          },
        },
      },
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain('<strong>Custom window</strong>');
  });

  it('bolds the "No quiet hours" rule label', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: { fri: { kind: 'no-quiet-hours' } },
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain('<strong>No quiet hours</strong>');
  });

  it('does NOT bold the "Default" rule label', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    expect(r.html).not.toContain('<strong>Default</strong>');
  });

  it('suppresses bolding when suppressNonDefaultBold=true', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: { sat: { kind: 'quiet-all-day' } },
      suppressNonDefaultBold: true,
      wrapHtmlDocument: false,
    });
    expect(r.html).not.toContain('<strong>');
  });
});

// Printed-on footer tests ---------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — printed-on footer', () => {
  it('emits a printed-on line when printedAt is supplied', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      printedAt: new Date('2026-06-23T19:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
      wrapHtmlDocument: false,
    });
    expect(r.printedAtIso).toBe('2026-06-23');
    expect(r.html).toContain('Printed 2026-06-23');
  });

  it('omits the printed-on line when printedAt is undefined', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    expect(r.printedAtIso).toBeNull();
    expect(r.html).not.toContain('Printed');
  });

  it('omits the printed-on line when suppressPrintedAt=true', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      printedAt: new Date('2026-06-23T19:00:00Z'),
      suppressPrintedAt: true,
      wrapHtmlDocument: false,
    });
    expect(r.printedAtIso).toBeNull();
    expect(r.html).not.toContain('Printed');
  });

  it('uses the default footer text', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain('snapshot of the configured quiet-hours rules');
  });

  it('respects a custom footer text', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      footerText: 'Reviewed by Dr. Foo on rounds.',
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain('Reviewed by Dr. Foo on rounds.');
    expect(r.html).not.toContain('snapshot of the configured quiet-hours rules');
  });

  it('suppresses the footer element entirely when footerText=""', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      footerText: '',
      wrapHtmlDocument: false,
    });
    // The CSS rule for the footer remains in the stylesheet (cheap)
    // but no rendered <div> instance is emitted.
    expect(r.html).not.toContain('<div class="qh-cal-print-footer">');
  });

  it('escapes HTML in the footer text', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      footerText: 'Reviewed by <Dr. Smith> & "team".',
      wrapHtmlDocument: false,
    });
    expect(r.html).toContain(
      '&lt;Dr. Smith&gt; &amp; &quot;team&quot;',
    );
    expect(r.html).not.toContain('<Dr. Smith>');
  });
});

// Paper preset tests --------------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — paper presets', () => {
  it('defaults to us-letter @page CSS', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      wrapHtmlDocument: false,
    });
    expect(r.paper).toBe('us-letter');
    expect(r.html).toContain('size: 8.5in 11in');
  });

  it('emits a4 @page CSS when paper=a4', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      paper: 'a4',
      wrapHtmlDocument: false,
    });
    expect(r.paper).toBe('a4');
    expect(r.html).toContain('size: 210mm 297mm');
    expect(r.html).not.toContain('size: 8.5in 11in');
  });
});

// Cell datum mirror tests --------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintable — cell datum', () => {
  it('mirrors the per-cell datum from the dashboard render', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: {
        sat: { kind: 'quiet-all-day' },
        sun: { kind: 'quiet-all-day' },
        wed: {
          kind: 'window',
          window: {
            startHour: 14,
            endHour: 16,
            timezone: 'America/Los_Angeles',
          },
        },
      },
    });
    expect(r.cells.length).toBe(7);
    expect(r.cells.find((c) => c.dayOfWeek === 'sat')?.rule).toBe(
      'override:all-day',
    );
    expect(r.cells.find((c) => c.dayOfWeek === 'sun')?.rule).toBe(
      'override:all-day',
    );
    expect(r.cells.find((c) => c.dayOfWeek === 'wed')?.rule).toBe(
      'override:window',
    );
  });

  it('mirrors the per-rule counts', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: {
        sat: { kind: 'quiet-all-day' },
        sun: { kind: 'quiet-all-day' },
        wed: { kind: 'no-quiet-hours' },
      },
    });
    expect(r.ruleCounts.default).toBe(4); // mon, tue, thu, fri
    expect(r.ruleCounts['override:all-day']).toBe(2);
    expect(r.ruleCounts['override:none']).toBe(1);
    expect(r.ruleCounts['override:window']).toBe(0);
  });
});

// summarizeQuietHoursCalendarHtmlPrintable tests ----------------------

describe('summarizeQuietHoursCalendarHtmlPrintable', () => {
  it('reports the paper preset and per-rule counts', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: { sat: { kind: 'quiet-all-day' }, sun: { kind: 'quiet-all-day' } },
    });
    const s = summarizeQuietHoursCalendarHtmlPrintable(r);
    expect(s).toContain('(printable, us-letter)');
    expect(s).toContain('5 default');
    expect(s).toContain('2 quiet-all-day');
  });

  it('appends the printed-on date when supplied', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      printedAt: new Date('2026-06-23T19:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
    });
    const s = summarizeQuietHoursCalendarHtmlPrintable(r);
    expect(s).toContain('printed 2026-06-23');
  });

  it('falls back to "7 default" when no rules are non-default', () => {
    // No overrides + no defaultWindow -> every cell resolves to 'default'.
    const r = renderQuietHoursCalendarHtmlPrintable();
    const s = summarizeQuietHoursCalendarHtmlPrintable(r);
    expect(s).toBe('Quiet-hours calendar (printable, us-letter): 7 default.');
  });

  it('reports a4 paper preset', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({ paper: 'a4' });
    const s = summarizeQuietHoursCalendarHtmlPrintable(r);
    expect(s).toContain('(printable, a4)');
  });
});

// extractQuietHoursCalendarHtmlPrintableLines tests -------------------

describe('extractQuietHoursCalendarHtmlPrintableLines', () => {
  it('emits one line per day in week order', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      defaultWindow: {
        startHour: 22,
        endHour: 7,
        timezone: 'America/Los_Angeles',
      },
      overrides: { sat: { kind: 'quiet-all-day' } },
    });
    const lines = extractQuietHoursCalendarHtmlPrintableLines(r);
    expect(lines.length).toBe(7);
    expect(lines[0]).toContain('Mon:');
    expect(lines[5]).toContain('Sat: Quiet all day');
  });

  it('emits em-dash for cells without a window', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      overrides: { wed: { kind: 'no-quiet-hours' } },
    });
    const lines = extractQuietHoursCalendarHtmlPrintableLines(r);
    const wed = lines.find((l) => l.startsWith('Wed:'));
    expect(wed).toBeDefined();
    expect(wed).toContain('No quiet hours');
    expect(wed).toContain('\u2014');
  });

  it('emits window time spans with zero-padded hours', () => {
    const r = renderQuietHoursCalendarHtmlPrintable({
      defaultWindow: {
        startHour: 22,
        endHour: 7,
        timezone: 'America/New_York',
      },
    });
    const lines = extractQuietHoursCalendarHtmlPrintableLines(r);
    expect(lines[0]).toContain('22:00\u201307:00 America/New_York');
  });
});
