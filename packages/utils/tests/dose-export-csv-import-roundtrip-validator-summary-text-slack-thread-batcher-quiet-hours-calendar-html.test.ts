import { describe, it, expect } from 'vitest';
import {
  renderQuietHoursCalendarHtml,
  summarizeQuietHoursCalendarHtml,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';
import { buildWeekendsAllDayWeekdaysOvernightCalendar } from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar';

describe('renderQuietHoursCalendarHtml — shape', () => {
  it('emits exactly 7 cells', () => {
    const result = renderQuietHoursCalendarHtml();
    expect(result.cells).toHaveLength(7);
  });

  it('default weekStart is mon-first', () => {
    const result = renderQuietHoursCalendarHtml();
    const days = result.cells.map((c) => c.dayOfWeek);
    expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('weekStart=sun-first puts Sunday first', () => {
    const result = renderQuietHoursCalendarHtml({ weekStart: 'sun-first' });
    const days = result.cells.map((c) => c.dayOfWeek);
    expect(days).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });

  it('default rule for every day is "default" when no overrides', () => {
    const result = renderQuietHoursCalendarHtml();
    for (const c of result.cells) expect(c.rule).toBe('default');
    expect(result.ruleCounts.default).toBe(7);
  });

  it('cells carry the canonical Mon/Tue/.../Sun labels', () => {
    const result = renderQuietHoursCalendarHtml();
    const labels = result.cells.map((c) => c.label);
    expect(labels).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('renderQuietHoursCalendarHtml — overrides', () => {
  it('weekends quiet-all-day override is reflected in the cells', () => {
    const cfg = buildWeekendsAllDayWeekdaysOvernightCalendar();
    const result = renderQuietHoursCalendarHtml(cfg);
    const sat = result.cells.find((c) => c.dayOfWeek === 'sat');
    const sun = result.cells.find((c) => c.dayOfWeek === 'sun');
    expect(sat?.rule).toBe('override:all-day');
    expect(sun?.rule).toBe('override:all-day');
  });

  it('weekdays under buildWeekendsAllDayWeekdaysOvernightCalendar fall back to default', () => {
    const cfg = buildWeekendsAllDayWeekdaysOvernightCalendar();
    const result = renderQuietHoursCalendarHtml(cfg);
    const mon = result.cells.find((c) => c.dayOfWeek === 'mon');
    expect(mon?.rule).toBe('default');
    expect(mon?.window?.startHour).toBe(22);
    expect(mon?.window?.endHour).toBe(7);
  });

  it('per-day window override is reflected as override:window', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: {
        wed: {
          kind: 'window',
          window: { startHour: 9, endHour: 10, timezone: 'America/Los_Angeles' },
        },
      },
    });
    const wed = result.cells.find((c) => c.dayOfWeek === 'wed');
    expect(wed?.rule).toBe('override:window');
    expect(wed?.window?.startHour).toBe(9);
    expect(wed?.window?.endHour).toBe(10);
  });

  it('no-quiet-hours override is reflected as override:none', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: { fri: { kind: 'no-quiet-hours' } },
    });
    const fri = result.cells.find((c) => c.dayOfWeek === 'fri');
    expect(fri?.rule).toBe('override:none');
    expect(fri?.window).toBeNull();
  });

  it('ruleCounts reflects the mix of overrides', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: {
        sat: { kind: 'quiet-all-day' },
        sun: { kind: 'quiet-all-day' },
        wed: {
          kind: 'window',
          window: { startHour: 8, endHour: 10, timezone: 'America/Los_Angeles' },
        },
        fri: { kind: 'no-quiet-hours' },
      },
    });
    expect(result.ruleCounts['override:all-day']).toBe(2);
    expect(result.ruleCounts['override:window']).toBe(1);
    expect(result.ruleCounts['override:none']).toBe(1);
    expect(result.ruleCounts.default).toBe(3);
  });
});

describe('renderQuietHoursCalendarHtml — current day', () => {
  it('isCurrentDay=false on all cells when runAt is omitted', () => {
    const result = renderQuietHoursCalendarHtml();
    for (const c of result.cells) expect(c.isCurrentDay).toBe(false);
    expect(result.currentDay).toBeNull();
  });

  it('marks the matching day-of-week as the current day', () => {
    // 2026-06-20 is a Saturday in PT
    const result = renderQuietHoursCalendarHtml({
      runAt: new Date('2026-06-20T18:00:00Z'),
    });
    expect(result.currentDay).toBe('sat');
    const sat = result.cells.find((c) => c.dayOfWeek === 'sat');
    expect(sat?.isCurrentDay).toBe(true);
    const mon = result.cells.find((c) => c.dayOfWeek === 'mon');
    expect(mon?.isCurrentDay).toBe(false);
  });

  it('runAt is evaluated in the channel timezone, not UTC', () => {
    // 2026-06-20T05:00:00Z is Friday 22:00 PT (19:00-19:59 is PT;
    // 05:00 UTC on Sat is 22:00 Fri PT) — verify PT-resolved day = Fri.
    const result = renderQuietHoursCalendarHtml({
      runAt: new Date('2026-06-20T05:00:00Z'),
    });
    expect(result.currentDay).toBe('fri');
  });

  it('the HTML emits a star marker on the current cell', () => {
    const result = renderQuietHoursCalendarHtml({
      runAt: new Date('2026-06-20T18:00:00Z'),
    });
    expect(result.html).toMatch(/Sat \u2605/);
  });
});

describe('renderQuietHoursCalendarHtml — HTML output', () => {
  it('emits a section wrapper by default (fragment, not document)', () => {
    const result = renderQuietHoursCalendarHtml();
    expect(result.html).toContain('<section class="qh-cal-wrapper">');
    expect(result.html).not.toContain('<!DOCTYPE html>');
  });

  it('wrapHtmlDocument=true emits a full HTML document', () => {
    const result = renderQuietHoursCalendarHtml({ wrapHtmlDocument: true });
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<title>');
  });

  it('uses the documentTitle in <title> and <h2>', () => {
    const result = renderQuietHoursCalendarHtml({
      documentTitle: 'QA on-call calendar',
      wrapHtmlDocument: true,
    });
    expect(result.html).toContain('<title>QA on-call calendar</title>');
    expect(result.html).toContain('QA on-call calendar');
  });

  it('escapes special characters in the caption', () => {
    const result = renderQuietHoursCalendarHtml({
      caption: 'Channel: <on-call> & "QA"',
    });
    expect(result.html).toContain('&lt;on-call&gt;');
    expect(result.html).toContain('&amp;');
    expect(result.html).toContain('&quot;QA&quot;');
  });

  it('omits the caption block when caption is undefined', () => {
    const result = renderQuietHoursCalendarHtml();
    // The .qh-cal-caption class still appears as a CSS rule definition
    // inside <style>; only the actual <div class="qh-cal-caption">
    // element should be missing.
    expect(result.html).not.toContain('<div class="qh-cal-caption">');
  });

  it('includes a colour swatch on every cell', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: { sat: { kind: 'quiet-all-day' } },
    });
    // default palette includes amber/red/green/grey
    expect(result.html).toContain('#fecaca'); // red-200 for all-day
    expect(result.html).toContain('#e5e7eb'); // gray-200 for default
  });

  it('honours custom palette overrides', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: { sat: { kind: 'quiet-all-day' } },
      palette: { 'override:all-day': '#ff0000' },
    });
    expect(result.html).toContain('#ff0000');
    expect(result.html).not.toContain('#fecaca');
  });

  it('renders the rule label inside each cell', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: {
        wed: {
          kind: 'window',
          window: { startHour: 8, endHour: 10, timezone: 'UTC' },
        },
      },
    });
    expect(result.html).toContain('Custom window');
    expect(result.html).toContain('Default'); // other days
  });

  it('renders the window range in HH:00-HH:00 timezone form', () => {
    const result = renderQuietHoursCalendarHtml({
      defaultWindow: { startHour: 22, endHour: 7, timezone: 'America/Los_Angeles' },
    });
    expect(result.html).toContain('22:00\u201307:00 America/Los_Angeles');
  });

  it('renders an em-dash for cells with no window (override:none)', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: { fri: { kind: 'no-quiet-hours' } },
    });
    expect(result.html).toContain('\u2014');
  });

  it('outputs a 7-column CSS grid', () => {
    const result = renderQuietHoursCalendarHtml();
    expect(result.html).toContain('grid-template-columns: repeat(7, 1fr)');
  });

  it('marks the current cell with the qh-cal-cell--current class', () => {
    const result = renderQuietHoursCalendarHtml({
      runAt: new Date('2026-06-20T18:00:00Z'),
    });
    expect(result.html).toContain('qh-cal-cell--current');
  });
});

describe('summarizeQuietHoursCalendarHtml', () => {
  it('produces a one-line summary', () => {
    const result = renderQuietHoursCalendarHtml();
    const summary = summarizeQuietHoursCalendarHtml(result);
    expect(summary).toBe('Quiet-hours calendar: 7 default.');
    expect(summary).not.toContain('\n');
  });

  it('combines multiple rule counts', () => {
    const cfg = buildWeekendsAllDayWeekdaysOvernightCalendar();
    const result = renderQuietHoursCalendarHtml(cfg);
    const summary = summarizeQuietHoursCalendarHtml(result);
    expect(summary).toContain('5 default');
    expect(summary).toContain('2 quiet-all-day');
  });

  it('reports the current day when runAt is supplied', () => {
    const cfg = buildWeekendsAllDayWeekdaysOvernightCalendar();
    const result = renderQuietHoursCalendarHtml({
      ...cfg,
      runAt: new Date('2026-06-20T18:00:00Z'),
    });
    const summary = summarizeQuietHoursCalendarHtml(result);
    expect(summary).toContain('today = Sat');
  });

  it('omits the today part when runAt is omitted', () => {
    const result = renderQuietHoursCalendarHtml({
      overrides: { mon: { kind: 'quiet-all-day' } },
    });
    const summary = summarizeQuietHoursCalendarHtml(result);
    expect(summary).not.toContain('today =');
  });
});

describe('renderQuietHoursCalendarHtml — HTML escaping', () => {
  it('escapes XSS attempts in the caption', () => {
    const result = renderQuietHoursCalendarHtml({
      caption: '<script>alert("xss")</script>',
    });
    expect(result.html).not.toContain('<script>alert("xss")</script>');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('escapes XSS attempts in the document title', () => {
    const result = renderQuietHoursCalendarHtml({
      documentTitle: '"><script>x</script>',
      wrapHtmlDocument: true,
    });
    expect(result.html).not.toContain('"><script>x</script>');
    expect(result.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
