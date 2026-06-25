import { describe, it, expect } from 'vitest';
import { computeNextDose, formatDelta, toneFor, type NextDoseInput } from '../lib/next-dose';

const NOW = Date.parse('2026-06-25T12:00:00Z');
function at(offsetMin: number): string {
  return new Date(NOW + offsetMin * 60_000).toISOString();
}

describe('formatDelta', () => {
  it('formats far-future as in Xh Ym', () => {
    expect(formatDelta(130 * 60_000)).toBe('in 2h 10m');
  });
  it('formats near-future minutes', () => {
    expect(formatDelta(5 * 60_000)).toBe('in 5m');
  });
  it('formats sub-minute as now', () => {
    expect(formatDelta(20_000)).toBe('now');
  });
  it('formats overdue minutes as late', () => {
    expect(formatDelta(-30 * 60_000)).toBe('30m late');
  });
  it('formats long overdue as Xh Ym late', () => {
    expect(formatDelta(-95 * 60_000)).toBe('1h 35m late');
  });
});

describe('toneFor', () => {
  it('is upcoming when comfortably ahead', () => {
    expect(toneFor(60 * 60_000)).toBe('upcoming');
  });
  it('is due inside the grace window either side', () => {
    expect(toneFor(10 * 60_000)).toBe('due');
    expect(toneFor(-10 * 60_000)).toBe('due');
  });
  it('is overdue past the grace window', () => {
    expect(toneFor(-20 * 60_000)).toBe('overdue');
  });
});

describe('computeNextDose', () => {
  it('returns All done when nothing is pending', () => {
    const doses: NextDoseInput[] = [
      { id: 'a', scheduledAt: at(-120), status: 'taken' },
      { id: 'b', scheduledAt: at(60), status: 'skipped' },
    ];
    const r = computeNextDose(doses, NOW);
    expect(r.doseId).toBeNull();
    expect(r.tone).toBe('none');
    expect(r.label).toBe('All done');
    expect(r.deltaMs).toBeNull();
  });

  it('picks the earliest upcoming pending dose', () => {
    const doses: NextDoseInput[] = [
      { id: 'late', scheduledAt: at(120), status: 'pending' },
      { id: 'soon', scheduledAt: at(30), status: 'pending' },
    ];
    const r = computeNextDose(doses, NOW);
    expect(r.doseId).toBe('soon');
    expect(r.label).toBe('in 30m');
    expect(r.tone).toBe('upcoming');
  });

  it('skips non-pending doses', () => {
    const doses: NextDoseInput[] = [
      { id: 'taken', scheduledAt: at(10), status: 'taken' },
      { id: 'next', scheduledAt: at(45), status: 'pending' },
    ];
    expect(computeNextDose(doses, NOW).doseId).toBe('next');
  });

  it('falls back to the latest overdue dose when all are past', () => {
    const doses: NextDoseInput[] = [
      { id: 'old', scheduledAt: at(-180), status: 'pending' },
      { id: 'recent', scheduledAt: at(-40), status: 'pending' },
    ];
    const r = computeNextDose(doses, NOW);
    expect(r.doseId).toBe('recent');
    expect(r.tone).toBe('overdue');
    expect(r.label).toBe('40m late');
  });

  it('treats a dose inside the grace window as due, not overdue', () => {
    const doses: NextDoseInput[] = [{ id: 'g', scheduledAt: at(-5), status: 'pending' }];
    const r = computeNextDose(doses, NOW);
    expect(r.doseId).toBe('g');
    expect(r.tone).toBe('due');
  });

  it('ignores doses with an unparseable date', () => {
    const doses: NextDoseInput[] = [
      { id: 'bad', scheduledAt: 'not-a-date', status: 'pending' },
      { id: 'good', scheduledAt: at(15), status: 'pending' },
    ];
    expect(computeNextDose(doses, NOW).doseId).toBe('good');
  });
});
