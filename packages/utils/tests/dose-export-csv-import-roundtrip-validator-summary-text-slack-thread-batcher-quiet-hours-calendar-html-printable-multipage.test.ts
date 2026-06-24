import { describe, it, expect } from 'vitest';
import {
  renderQuietHoursCalendarHtmlPrintableMultipage,
  summarizeQuietHoursCalendarHtmlPrintableMultipage,
  splitQuietHoursCalendarHtmlPrintableMultipage,
  detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions,
  QUIET_HOURS_CALENDAR_PRINTABLE_MULTIPAGE_FORM_FEED,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage';

const SF_REGION = {
  regionId: 'sf',
  options: {
    documentTitle: 'San Francisco — Pacific',
    defaultWindow: { startHour: 22, endHour: 7, timezone: 'America/Los_Angeles' },
    overrides: {
      sat: { kind: 'quiet-all-day' as const, timezone: 'America/Los_Angeles' },
      sun: { kind: 'quiet-all-day' as const, timezone: 'America/Los_Angeles' },
    },
  },
};

const NYC_REGION = {
  regionId: 'nyc',
  options: {
    documentTitle: 'New York — Eastern',
    defaultWindow: { startHour: 22, endHour: 7, timezone: 'America/New_York' },
    overrides: {
      wed: {
        kind: 'window' as const,
        window: { startHour: 20, endHour: 9, timezone: 'America/New_York' },
      },
    },
  },
};

const LONDON_REGION = {
  regionId: 'london',
  options: {
    documentTitle: 'London — BST',
    defaultWindow: { startHour: 21, endHour: 8, timezone: 'Europe/London' },
  },
};

describe('renderQuietHoursCalendarHtmlPrintableMultipage — happy path', () => {
  it('emits one page per region in order', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION, LONDON_REGION],
      baseOptions: { paper: 'us-letter' },
    });
    expect(result.pageCount).toBe(3);
    expect(result.pages.map((p) => p.regionId)).toEqual(['sf', 'nyc', 'london']);
    expect(result.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  it('separates pages with the form-feed character by default', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    expect(result.pageSeparator).toBe('\f');
    expect(QUIET_HOURS_CALENDAR_PRINTABLE_MULTIPAGE_FORM_FEED).toBe('\f');
    // Exactly 2 pages -> exactly 1 form-feed.
    expect(result.text.split('\f')).toHaveLength(2);
  });

  it('wraps each page as a full HTML document by default', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    const pages = result.text.split('\f');
    expect(pages[0]).toMatch(/^<!DOCTYPE html>/);
    expect(pages[0]).toContain('<title>San Francisco \u2014 Pacific</title>');
    expect(pages[1]).toMatch(/^<!DOCTYPE html>/);
    expect(pages[1]).toContain('<title>New York \u2014 Eastern</title>');
  });

  it('threads the timezone from the per-region defaultWindow through the render', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    // The SF page should show America/Los_Angeles; NYC America/New_York.
    expect(result.pages[0]!.render.cells.some((c) => c.window?.timezone === 'America/Los_Angeles')).toBe(true);
    expect(result.pages[1]!.render.cells.some((c) => c.window?.timezone === 'America/New_York')).toBe(true);
  });
});

describe('renderQuietHoursCalendarHtmlPrintableMultipage — base options merge', () => {
  it('passes the shared base options to every region', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      baseOptions: { paper: 'a4', fontFamily: 'serif' },
    });
    expect(result.paper).toBe('a4');
    expect(result.pages.every((p) => p.render.paper === 'a4')).toBe(true);
    expect(result.pages.every((p) => p.render.html.includes('210mm 297mm'))).toBe(true);
  });

  it('lets per-region options override base options on a per-field basis', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [
        SF_REGION,
        { regionId: 'sf-letter', options: { ...SF_REGION.options, paper: 'us-letter' } },
      ],
      baseOptions: { paper: 'a4' },
    });
    expect(result.pages[0]!.render.paper).toBe('a4');
    expect(result.pages[1]!.render.paper).toBe('us-letter');
  });

  it('per-region documentTitle wins over baseOptions.documentTitle', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      baseOptions: { documentTitle: 'Should Not Show' },
    });
    expect(result.pages[0]!.render.html).toContain('San Francisco');
    expect(result.pages[1]!.render.html).toContain('New York');
    expect(result.pages[0]!.render.html).not.toContain('Should Not Show');
  });

  it('per-region defaultWindow fully replaces base defaultWindow (no deep merge)', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [NYC_REGION],
      baseOptions: {
        defaultWindow: { startHour: 0, endHour: 8, timezone: 'Europe/Berlin' },
      },
    });
    // NYC explicit override wins; no Europe/Berlin in the rendered output.
    expect(result.pages[0]!.render.html).not.toContain('Europe/Berlin');
    expect(result.pages[0]!.render.html).toContain('America/New_York');
  });
});

describe('renderQuietHoursCalendarHtmlPrintableMultipage — edge cases', () => {
  it('handles a single region (no separator emitted)', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION],
    });
    expect(result.pageCount).toBe(1);
    expect(result.text.includes('\f')).toBe(false);
  });

  it('handles zero regions (empty text, zero pages)', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [],
    });
    expect(result.pageCount).toBe(0);
    expect(result.text).toBe('');
    expect(result.pages).toEqual([]);
  });

  it('falls back to us-letter when neither base nor regions specify a paper', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [],
    });
    expect(result.paper).toBe('us-letter');
  });

  it('reads paper from the first region when base does not specify one', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [
        { regionId: 'a4-region', options: { ...SF_REGION.options, paper: 'a4' } },
        { regionId: 'letter-region', options: { ...NYC_REGION.options, paper: 'us-letter' } },
      ],
    });
    expect(result.paper).toBe('a4');
  });
});

describe('renderQuietHoursCalendarHtmlPrintableMultipage — separator override', () => {
  it('honours a custom page separator', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      pageSeparator: '\n<!-- PAGEBREAK -->\n',
    });
    expect(result.pageSeparator).toBe('\n<!-- PAGEBREAK -->\n');
    expect(result.text).toContain('<!-- PAGEBREAK -->');
    expect(result.text).not.toContain('\f');
  });

  it('suppresses the separator when set to empty string', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      pageSeparator: '',
    });
    expect(result.text.includes('\f')).toBe(false);
    // Both bodies still present.
    expect(result.text).toContain('San Francisco');
    expect(result.text).toContain('New York');
  });
});

describe('renderQuietHoursCalendarHtmlPrintableMultipage — wrapEachPageAsDocument=false', () => {
  it('emits fragments instead of full documents', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      wrapEachPageAsDocument: false,
    });
    // No DOCTYPE on either fragment.
    const pages = result.text.split('\f');
    expect(pages[0]).not.toMatch(/^<!DOCTYPE/);
    expect(pages[1]).not.toMatch(/^<!DOCTYPE/);
    // Still has the section content.
    expect(pages[0]).toContain('qh-cal');
  });

  it('still separates fragments with the form-feed', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      wrapEachPageAsDocument: false,
    });
    expect(result.text.split('\f')).toHaveLength(2);
  });
});

describe('splitQuietHoursCalendarHtmlPrintableMultipage', () => {
  it('splits the concatenated text back into the per-page documents', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION, LONDON_REGION],
    });
    const split = splitQuietHoursCalendarHtmlPrintableMultipage(result);
    expect(split).toHaveLength(3);
    expect(split[0]).toBe(result.pages[0]!.render.html);
    expect(split[1]).toBe(result.pages[1]!.render.html);
    expect(split[2]).toBe(result.pages[2]!.render.html);
  });

  it('returns a single-element array when the separator is suppressed', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
      pageSeparator: '',
    });
    const split = splitQuietHoursCalendarHtmlPrintableMultipage(result);
    expect(split).toHaveLength(1);
  });
});

describe('detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions', () => {
  it('returns regions whose calendar has zero non-default cells', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, LONDON_REGION],
    });
    const empty = detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions(result);
    // SF has Sat+Sun overrides; London has none.
    expect(empty.map((p) => p.regionId)).toEqual(['london']);
  });

  it('returns empty array when every region has at least one override', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    expect(detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions(result)).toEqual([]);
  });

  it('returns every region when every region is plain default', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [
        { regionId: 'a', options: { defaultWindow: { startHour: 22, endHour: 7, timezone: 'America/Los_Angeles' } } },
        { regionId: 'b', options: { defaultWindow: { startHour: 23, endHour: 6, timezone: 'America/New_York' } } },
      ],
    });
    const empty = detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions(result);
    expect(empty.map((p) => p.regionId)).toEqual(['a', 'b']);
  });
});

describe('summarizeQuietHoursCalendarHtmlPrintableMultipage', () => {
  it('summarises a multi-region payload in one line', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION, LONDON_REGION],
      baseOptions: { paper: 'us-letter' },
    });
    expect(summarizeQuietHoursCalendarHtmlPrintableMultipage(result)).toBe(
      'Quiet-hours calendar multipage (us-letter): 3 pages (sf, nyc, london).',
    );
  });

  it('uses singular for one page', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION],
      baseOptions: { paper: 'a4' },
    });
    expect(summarizeQuietHoursCalendarHtmlPrintableMultipage(result)).toBe(
      'Quiet-hours calendar multipage (a4): 1 page (sf).',
    );
  });

  it('summarises an empty payload', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({ regions: [] });
    expect(summarizeQuietHoursCalendarHtmlPrintableMultipage(result)).toBe(
      'Quiet-hours calendar multipage (us-letter): 0 pages.',
    );
  });
});

describe('renderQuietHoursCalendarHtmlPrintableMultipage — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    const b = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [SF_REGION, NYC_REGION],
    });
    expect(a.text).toBe(b.text);
  });

  it('preserves input order independent of identifier alphabet', () => {
    const result = renderQuietHoursCalendarHtmlPrintableMultipage({
      regions: [
        { regionId: 'zzz-last', options: SF_REGION.options },
        { regionId: 'aaa-first', options: NYC_REGION.options },
      ],
    });
    expect(result.pages.map((p) => p.regionId)).toEqual(['zzz-last', 'aaa-first']);
  });
});
