import { describe, it, expect } from 'vitest';
import {
  EXPORT_FORMATS,
  getExportFormat,
  primaryRecordCount,
  estimateBytes,
  formatBytes,
  buildExportCards,
  type ExportCounts,
} from '../lib/export-formats';

const COUNTS: ExportCounts = { doses: 90, medications: 5, schedules: 6 };

describe('EXPORT_FORMATS', () => {
  it('lists the four expected formats in order', () => {
    expect(EXPORT_FORMATS.map((f) => f.format)).toEqual(['csv', 'json', 'ics', 'pdf']);
  });
  it('gives every format a non-empty summary and endpoint', () => {
    for (const f of EXPORT_FORMATS) {
      expect(f.summary.length).toBeGreaterThan(0);
      expect(f.endpoint.startsWith('/reports/export/')).toBe(true);
    }
  });
});

describe('getExportFormat', () => {
  it('finds a known format', () => {
    expect(getExportFormat('ics')?.label).toBe('Calendar');
  });
  it('returns undefined for an unknown key', () => {
    expect(getExportFormat('xml')).toBeUndefined();
  });
});

describe('primaryRecordCount', () => {
  it('counts only doses for a dose-weighted format', () => {
    expect(primaryRecordCount(getExportFormat('csv')!, COUNTS)).toBe(90);
    expect(primaryRecordCount(getExportFormat('ics')!, COUNTS)).toBe(90);
  });
  it('counts all records for an all-weighted format', () => {
    expect(primaryRecordCount(getExportFormat('json')!, COUNTS)).toBe(90 + 5 + 6);
  });
  it('floors negative counts to zero', () => {
    expect(primaryRecordCount(getExportFormat('csv')!, { doses: -10, medications: 0, schedules: 0 })).toBe(0);
  });
});

describe('estimateBytes', () => {
  it('is base + records * perRecord', () => {
    const csv = getExportFormat('csv')!;
    // base 256 + 90 * 64 = 6016
    expect(estimateBytes(csv, COUNTS)).toBe(256 + 90 * 64);
  });
  it('never drops below the base overhead', () => {
    const csv = getExportFormat('csv')!;
    expect(estimateBytes(csv, { doses: 0, medications: 0, schedules: 0 })).toBe(csv.baseBytes);
  });
  it('weighs the PDF mostly as fixed document chrome', () => {
    const pdf = getExportFormat('pdf')!;
    // base 24000 dominates over the small per-record term
    expect(estimateBytes(pdf, COUNTS)).toBe(24_000 + (90 + 5 + 6) * 40);
  });
});

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(256)).toBe('256 B');
    expect(formatBytes(0)).toBe('0 B');
  });
  it('formats KB with one decimal under 10', () => {
    expect(formatBytes(6016)).toBe('5.9 KB');
  });
  it('drops the decimal for 10 KB and up', () => {
    expect(formatBytes(20 * 1024)).toBe('20 KB');
  });
  it('formats MB', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
  });
  it('clamps negatives to 0 B', () => {
    expect(formatBytes(-50)).toBe('0 B');
  });
});

describe('buildExportCards', () => {
  it('decorates every descriptor with an estimated size', () => {
    const cards = buildExportCards(COUNTS);
    expect(cards).toHaveLength(4);
    for (const c of cards) {
      expect(c.estimatedBytes).toBeGreaterThan(0);
      expect(c.estimatedSize).toMatch(/\d+(\.\d+)? (B|KB|MB)/);
    }
  });
  it('preserves descriptor order', () => {
    expect(buildExportCards(COUNTS).map((c) => c.format)).toEqual(['csv', 'json', 'ics', 'pdf']);
  });
  it('CSV estimate matches the raw byte estimate humanised', () => {
    const cards = buildExportCards(COUNTS);
    const csv = cards.find((c) => c.format === 'csv')!;
    expect(csv.estimatedSize).toBe(formatBytes(csv.estimatedBytes));
  });
});
