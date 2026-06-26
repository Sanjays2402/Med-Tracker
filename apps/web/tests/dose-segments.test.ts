import { describe, it, expect } from 'vitest';
import {
  minutesOfDay,
  clockLabel,
  buildDoseSegments,
  type DoseLike,
} from '../lib/dose-segments';

function at(hour: number, min = 0): string {
  return new Date(2026, 5, 25, hour, min, 0).toISOString();
}

function dose(id: string, hour: number, status: DoseLike['status'], extra: Partial<DoseLike> = {}): DoseLike {
  return {
    id,
    medicationName: extra.medicationName ?? 'Lisinopril',
    scheduledAt: at(hour),
    status,
    ...extra,
  };
}

describe('minutesOfDay', () => {
  it('reads local hour/minute as minutes since midnight', () => {
    expect(minutesOfDay(at(8, 30))).toBe(8 * 60 + 30);
    expect(minutesOfDay(at(0, 0))).toBe(0);
    expect(minutesOfDay(at(23, 59))).toBe(23 * 60 + 59);
  });
  it('returns a large sentinel for an unparseable timestamp', () => {
    expect(minutesOfDay('not-a-date')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('clockLabel', () => {
  it('formats a 12-hour AM/PM clock with padded minutes', () => {
    expect(clockLabel(8 * 60)).toBe('8:00 AM');
    expect(clockLabel(8 * 60 + 5)).toBe('8:05 AM');
    expect(clockLabel(14 * 60)).toBe('2:00 PM');
  });
  it('renders midnight and noon as 12', () => {
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(12 * 60)).toBe('12:00 PM');
  });
  it('is empty for out-of-range input', () => {
    expect(clockLabel(24 * 60)).toBe('');
    expect(clockLabel(NaN)).toBe('');
  });
});

describe('buildDoseSegments', () => {
  it('returns an empty, zeroed summary for no doses', () => {
    const s = buildDoseSegments([]);
    expect(s.segments).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.caption).toBe('Nothing scheduled today');
  });

  it('sorts segments by time of day, earliest first', () => {
    const s = buildDoseSegments([
      dose('c', 22, 'pending'),
      dose('a', 8, 'taken'),
      dose('b', 14, 'pending'),
    ]);
    expect(s.segments.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps incoming order on equal times (stable)', () => {
    const s = buildDoseSegments([
      dose('first', 8, 'taken'),
      dose('second', 8, 'pending'),
    ]);
    expect(s.segments.map((x) => x.id)).toEqual(['first', 'second']);
  });

  it('maps status to tone and fill', () => {
    const s = buildDoseSegments([
      dose('t', 8, 'taken'),
      dose('p', 9, 'pending'),
      dose('k', 10, 'skipped'),
      dose('m', 11, 'missed'),
    ]);
    const byId = Object.fromEntries(s.segments.map((x) => [x.id, x]));
    expect(byId.t).toMatchObject({ tone: 'ok', filled: true });
    expect(byId.p).toMatchObject({ tone: 'neutral', filled: false });
    expect(byId.k).toMatchObject({ tone: 'warn', filled: false });
    expect(byId.m).toMatchObject({ tone: 'danger', filled: false });
  });

  it('counts each status and computes the taken percentage', () => {
    const s = buildDoseSegments([
      dose('a', 8, 'taken'),
      dose('b', 9, 'taken'),
      dose('c', 10, 'pending'),
      dose('d', 11, 'skipped'),
    ]);
    expect(s).toMatchObject({ total: 4, taken: 2, pending: 1, skipped: 1, missed: 0 });
    expect(s.resolved).toBe(3);
    expect(s.pct).toBe(50);
    expect(s.complete).toBe(false);
  });

  it('marks complete only when nothing is pending', () => {
    const done = buildDoseSegments([
      dose('a', 8, 'taken'),
      dose('b', 9, 'skipped'),
    ]);
    expect(done.complete).toBe(true);
    const open = buildDoseSegments([
      dose('a', 8, 'taken'),
      dose('b', 9, 'pending'),
    ]);
    expect(open.complete).toBe(false);
  });

  it('builds a name + time label per segment', () => {
    const s = buildDoseSegments([
      dose('a', 8, 'taken', { medicationName: 'Metformin', strength: '500 mg' }),
    ]);
    expect(s.segments[0]!.label).toBe('8:00 AM - Metformin 500 mg');
  });

  it('omits the strength when absent', () => {
    const s = buildDoseSegments([dose('a', 14, 'pending', { medicationName: 'Vitamin D3' })]);
    expect(s.segments[0]!.label).toBe('2:00 PM - Vitamin D3');
  });

  it('captions an all-taken day distinctly', () => {
    expect(buildDoseSegments([dose('a', 8, 'taken'), dose('b', 9, 'taken')]).caption).toBe(
      'All 2 doses taken',
    );
    expect(buildDoseSegments([dose('a', 8, 'taken')]).caption).toBe('The only dose is taken');
  });

  it('captions a mixed day with the remaining work first', () => {
    const s = buildDoseSegments([
      dose('a', 8, 'taken'),
      dose('b', 9, 'pending'),
      dose('c', 10, 'pending'),
      dose('d', 11, 'missed'),
    ]);
    expect(s.caption).toBe('1 of 4 taken - 2 to go, 1 missed');
  });

  it('captions a day with only skips and takes (no pending)', () => {
    const s = buildDoseSegments([
      dose('a', 8, 'taken'),
      dose('b', 9, 'skipped'),
      dose('c', 10, 'skipped'),
    ]);
    // pending is 0 but not all taken → no "All taken", falls to head + skipped tail
    expect(s.complete).toBe(true);
    expect(s.caption).toBe('1 of 3 taken - 2 skipped');
  });
});
