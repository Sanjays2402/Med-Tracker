import { describe, it, expect } from 'vitest';
import {
  daysUntilExpiry,
  expiryPill,
  expiryTooltip,
  type ExpiryStatus,
} from '../lib/caregiver-expiry';
import type { CaregiverShare } from '../lib/types';

// Fixed clock: 2026-06-26T12:00:00Z.
const NOW = Date.parse('2026-06-26T12:00:00Z');
const DAY = 86_400_000;

function shareWith(expiresAt: string | null): Pick<CaregiverShare, 'expiresAt'> {
  return { expiresAt };
}

function inDays(n: number): string {
  return new Date(NOW + n * DAY).toISOString();
}

describe('daysUntilExpiry', () => {
  it('is null with no expiry', () => {
    expect(daysUntilExpiry(shareWith(null), NOW)).toBeNull();
  });
  it('ceils a same-day-later expiry to 0 and tomorrow to 1', () => {
    expect(daysUntilExpiry(shareWith(new Date(NOW + 6 * 3600_000).toISOString()), NOW)).toBe(1);
    expect(daysUntilExpiry(shareWith(new Date(NOW).toISOString()), NOW)).toBe(0);
  });
  it('is positive in the future, negative in the past', () => {
    expect(daysUntilExpiry(shareWith(inDays(5)), NOW)).toBe(5);
    expect(daysUntilExpiry(shareWith(inDays(-3)), NOW)).toBe(-3);
  });
  it('returns null for an unparseable date', () => {
    expect(daysUntilExpiry(shareWith('soon-ish'), NOW)).toBeNull();
  });
});

describe('expiryPill', () => {
  it('is `none` (no label) when the share never expires', () => {
    const p = expiryPill(shareWith(null), NOW);
    expect(p.status).toBe<ExpiryStatus>('none');
    expect(p.label).toBeNull();
    expect(p.tone).toBe('ok');
  });

  it('is `active` (no label) when expiry is comfortably away', () => {
    const p = expiryPill(shareWith(inDays(30)), NOW);
    expect(p.status).toBe('active');
    expect(p.label).toBeNull();
    expect(p.tone).toBe('ok');
    expect(p.daysUntil).toBe(30);
  });

  it('is `soon` with a day-count label inside the 7-day window', () => {
    const p = expiryPill(shareWith(inDays(3)), NOW);
    expect(p.status).toBe('soon');
    expect(p.tone).toBe('warn');
    expect(p.label).toBe('Expires in 3d');
  });

  it('phrases today / tomorrow at the near edge', () => {
    expect(expiryPill(shareWith(new Date(NOW).toISOString()), NOW).label).toBe('Expires today');
    expect(expiryPill(shareWith(new Date(NOW + 6 * 3600_000).toISOString()), NOW).label).toBe('Expires tomorrow');
  });

  it('is `expired` with a danger tone once past', () => {
    const p = expiryPill(shareWith(inDays(-2)), NOW);
    expect(p.status).toBe('expired');
    expect(p.tone).toBe('danger');
    expect(p.label).toBe('Expired');
  });

  it('honours a custom soon window', () => {
    // 10 days out is not soon under the default 7d, but is under a 14d window.
    expect(expiryPill(shareWith(inDays(10)), NOW).status).toBe('active');
    expect(expiryPill(shareWith(inDays(10)), NOW, 14 * DAY).status).toBe('soon');
  });

  it('treats an unparseable expiry as `none`', () => {
    expect(expiryPill(shareWith('whenever'), NOW).status).toBe('none');
  });

  it('treats the exact 7-day boundary as soon (inclusive)', () => {
    const p = expiryPill(shareWith(new Date(NOW + 7 * DAY).toISOString()), NOW);
    expect(p.status).toBe('soon');
  });
});

describe('expiryTooltip', () => {
  it('is null without an expiry', () => {
    expect(expiryTooltip(shareWith(null), NOW)).toBeNull();
  });
  it('phrases a future expiry', () => {
    expect(expiryTooltip(shareWith(inDays(3)), NOW)).toBe('Expires in 3 days');
  });
  it('phrases a past expiry', () => {
    expect(expiryTooltip(shareWith(inDays(-2)), NOW)).toBe('Expired 2 days ago');
  });
  it('is null for an unparseable date', () => {
    expect(expiryTooltip(shareWith('nope'), NOW)).toBeNull();
  });
});
