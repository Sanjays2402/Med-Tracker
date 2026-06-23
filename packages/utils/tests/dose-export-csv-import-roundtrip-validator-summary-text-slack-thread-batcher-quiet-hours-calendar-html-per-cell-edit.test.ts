import { describe, it, expect } from 'vitest';
import {
  renderQuietHoursCalendarHtmlPerCellEdit,
  buildQuietHoursCalendarHtmlPerCellEditLinks,
  summarizeQuietHoursCalendarHtmlPerCellEdit,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit';

const DEFAULT_WINDOW = {
  startHour: 22,
  endHour: 7,
  timezone: 'America/Los_Angeles',
} as const;

describe('renderQuietHoursCalendarHtmlPerCellEdit — shape', () => {
  it('renders 7 cells (one per weekday)', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin/quiet-hours/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.cells).toHaveLength(7);
    expect(out.editLinks).toHaveLength(7);
  });

  it('emits anchor tags for every editable cell', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin/quiet-hours/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const anchorCount = (out.html.match(/<a class="qh-cal-cell qh-cal-cell-link/g) ?? []).length;
    expect(anchorCount).toBe(7);
  });

  it('editLinks has hrefs for every cell when no predicate', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin/quiet-hours/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    for (const link of out.editLinks) {
      expect(link.href).not.toBeNull();
    }
  });

  it('editableCellCount + nonEditableCellCount sums to total cells', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin/quiet-hours/{day}',
      isCellEditable: (c) => c.dayOfWeek !== 'sat',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.editableCellCount + out.nonEditableCellCount).toBe(7);
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — URL interpolation', () => {
  it('interpolates {day} into the URL', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin/quiet-hours/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const monLink = out.editLinks.find((l) => l.dayOfWeek === 'mon')!;
    expect(monLink.href).toBe('/admin/quiet-hours/mon');
  });

  it('interpolates {dayLabel}', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/edit?d={dayLabel}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const wedLink = out.editLinks.find((l) => l.dayOfWeek === 'wed')!;
    expect(wedLink.href).toBe('/edit?d=Wed');
  });

  it('interpolates {rule}', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/edit/{day}/{rule}',
      defaultWindow: DEFAULT_WINDOW,
      overrides: { sat: { kind: 'quiet-all-day' } },
    });
    const satLink = out.editLinks.find((l) => l.dayOfWeek === 'sat')!;
    // 'override:all-day' percent-encoded
    expect(satLink.href).toBe('/edit/sat/override%3Aall-day');
  });

  it('URI-encodes day label values', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/?day={day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    for (const link of out.editLinks) {
      expect(link.href).not.toContain(' ');
    }
  });

  it('supports multiple placeholders in one template', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/admin?day={day}&label={dayLabel}&rule={rule}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const monLink = out.editLinks.find((l) => l.dayOfWeek === 'mon')!;
    expect(monLink.href).toContain('day=mon');
    expect(monLink.href).toContain('label=Mon');
    expect(monLink.href).toContain('rule=');
  });

  it('throws when editUrlTemplate is empty', () => {
    expect(() =>
      renderQuietHoursCalendarHtmlPerCellEdit({
        editUrlTemplate: '',
        defaultWindow: DEFAULT_WINDOW,
      }),
    ).toThrow(/non-empty string/);
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — isCellEditable predicate', () => {
  it('renders non-editable cells as <div> (no anchor)', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      isCellEditable: (c) => c.dayOfWeek === 'mon',
      defaultWindow: DEFAULT_WINDOW,
    });
    const anchorCount = (out.html.match(/<a class="qh-cal-cell qh-cal-cell-link/g) ?? []).length;
    expect(anchorCount).toBe(1);
  });

  it('href is null for non-editable cells', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      isCellEditable: (c) => c.dayOfWeek !== 'sun',
      defaultWindow: DEFAULT_WINDOW,
    });
    const sun = out.editLinks.find((l) => l.dayOfWeek === 'sun')!;
    expect(sun.href).toBeNull();
  });

  it('editableCellCount tracks predicate correctly', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      isCellEditable: (c) => c.dayOfWeek === 'mon' || c.dayOfWeek === 'tue',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.editableCellCount).toBe(2);
    expect(out.nonEditableCellCount).toBe(5);
  });

  it('all-non-editable: zero anchors', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      isCellEditable: () => false,
      defaultWindow: DEFAULT_WINDOW,
    });
    // No <a> elements (CSS still mentions the class, but no anchor markup uses it).
    expect(out.html).not.toMatch(/<a\s/);
    expect(out.editableCellCount).toBe(0);
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — aria-label', () => {
  it('default aria-label describes the day + rule', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const mon = out.editLinks.find((l) => l.dayOfWeek === 'mon')!;
    expect(mon.ariaLabel).toBe('Edit quiet hours for Mon (currently Default)');
  });

  it('reflects override rule in aria-label', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      overrides: { sat: { kind: 'quiet-all-day' } },
    });
    const sat = out.editLinks.find((l) => l.dayOfWeek === 'sat')!;
    expect(sat.ariaLabel).toContain('Quiet all day');
  });

  it('honours custom buildAriaLabel', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      buildAriaLabel: (cell) => `Customise ${cell.label}`,
    });
    const tue = out.editLinks.find((l) => l.dayOfWeek === 'tue')!;
    expect(tue.ariaLabel).toBe('Customise Tue');
  });

  it('aria-label is emitted in HTML for editable cells', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.html).toContain('aria-label="Edit quiet hours for Mon');
  });

  it('aria-label is emitted in HTML for non-editable cells', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      isCellEditable: (c) => c.dayOfWeek !== 'sat',
    });
    expect(out.html).toContain('aria-label="Edit quiet hours for Sat');
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — HTML structure', () => {
  it('preserves the base cells + cell ordering', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const days = out.cells.map((c) => c.dayOfWeek);
    expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('respects weekStart sun-first', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      weekStart: 'sun-first',
    });
    expect(out.cells[0]?.dayOfWeek).toBe('sun');
    expect(out.editLinks[0]?.dayOfWeek).toBe('sun');
  });

  it('emits the section wrapper + grid', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.html).toContain('<section class="qh-cal-wrapper">');
    expect(out.html).toContain('<div class="qh-cal-grid">');
  });

  it('wrapHtmlDocument emits a full HTML document', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      wrapHtmlDocument: true,
    });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<title>');
  });

  it('exposes ruleCounts from base', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      overrides: { sat: { kind: 'quiet-all-day' }, sun: { kind: 'quiet-all-day' } },
    });
    expect(out.ruleCounts.default).toBe(5);
    expect(out.ruleCounts['override:all-day']).toBe(2);
  });

  it('focus styling is in CSS', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.html).toContain('.qh-cal-cell-link:focus');
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — openInNewTab', () => {
  it('omits target attribute by default', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(out.html).not.toContain('target="_blank"');
  });

  it('emits target="_blank" rel="noopener" when openInNewTab=true', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      openInNewTab: true,
    });
    expect(out.html).toContain('target="_blank"');
    expect(out.html).toContain('rel="noopener"');
  });

  it('non-editable cells do not get target attribute', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      openInNewTab: true,
      isCellEditable: (c) => c.dayOfWeek !== 'sat',
    });
    // count target appearances - should be 6 not 7
    const targetCount = (out.html.match(/target="_blank"/g) ?? []).length;
    expect(targetCount).toBe(6);
  });
});

describe('buildQuietHoursCalendarHtmlPerCellEditLinks', () => {
  it('returns the same editLinks as the full render', () => {
    const opts = {
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    };
    const links = buildQuietHoursCalendarHtmlPerCellEditLinks(opts);
    const fullRender = renderQuietHoursCalendarHtmlPerCellEdit(opts);
    expect(links).toEqual(fullRender.editLinks);
  });

  it('returns 7 entries', () => {
    const links = buildQuietHoursCalendarHtmlPerCellEditLinks({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    expect(links).toHaveLength(7);
  });
});

describe('summarizeQuietHoursCalendarHtmlPerCellEdit', () => {
  it('all-editable summary', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
    });
    const line = summarizeQuietHoursCalendarHtmlPerCellEdit(out);
    expect(line).toBe(
      'Quiet-hours calendar (edit overlay): 7 cells (all editable).',
    );
  });

  it('mixed editable summary', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      isCellEditable: (c) => c.dayOfWeek !== 'sat' && c.dayOfWeek !== 'sun',
    });
    const line = summarizeQuietHoursCalendarHtmlPerCellEdit(out);
    expect(line).toContain('5 editable, 2 read-only');
  });

  it('all-read-only summary', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      isCellEditable: () => false,
    });
    const line = summarizeQuietHoursCalendarHtmlPerCellEdit(out);
    expect(line).toBe(
      'Quiet-hours calendar (edit overlay): 7 cells (all read-only).',
    );
  });

  it('appends today when runAt is supplied', () => {
    const out = renderQuietHoursCalendarHtmlPerCellEdit({
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      runAt: new Date('2026-06-22T12:00:00-07:00'), // Monday PT
    });
    const line = summarizeQuietHoursCalendarHtmlPerCellEdit(out);
    expect(line).toContain('today = Mon');
  });
});

describe('renderQuietHoursCalendarHtmlPerCellEdit — determinism', () => {
  it('two identical inputs produce identical HTML', () => {
    const opts = {
      editUrlTemplate: '/x/{day}',
      defaultWindow: DEFAULT_WINDOW,
      overrides: { wed: { kind: 'window' as const, window: DEFAULT_WINDOW } },
    };
    const a = renderQuietHoursCalendarHtmlPerCellEdit(opts);
    const b = renderQuietHoursCalendarHtmlPerCellEdit(opts);
    expect(a.html).toBe(b.html);
    expect(a.editLinks).toEqual(b.editLinks);
  });
});
