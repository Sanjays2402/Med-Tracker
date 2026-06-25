import { describe, it, expect } from 'vitest';
import {
  relativeTime,
  isExpired,
  isExpiringSoon,
  buildActivityFeed,
  scopeLabel,
  summarizeActivity,
} from '../lib/caregiver-activity';
import type { CaregiverShare } from '../lib/types';

const NOW = Date.parse('2026-06-25T12:00:00Z');
const DAY = 86_400_000;

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe('relativeTime', () => {
  it('collapses sub-minute differences to "just now"', () => {
    expect(relativeTime(iso(-10_000), NOW)).toBe('just now');
    expect(relativeTime(iso(20_000), NOW)).toBe('just now');
  });
  it('phrases recent past as "... ago"', () => {
    expect(relativeTime(iso(-2 * 60_000), NOW)).toBe('2 minutes ago');
    expect(relativeTime(iso(-3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(relativeTime(iso(-2 * DAY), NOW)).toBe('2 days ago');
  });
  it('phrases future as "in ..."', () => {
    expect(relativeTime(iso(3 * DAY), NOW)).toBe('in 3 days');
    expect(relativeTime(iso(2 * 7 * DAY), NOW)).toBe('in 2 weeks');
    expect(relativeTime(iso(90 * DAY), NOW)).toBe('in 3 months');
  });
  it('handles singular units', () => {
    expect(relativeTime(iso(-1 * DAY), NOW)).toBe('1 day ago');
    expect(relativeTime(iso(1 * 3_600_000), NOW)).toBe('in 1 hour');
  });
  it('scales to years', () => {
    expect(relativeTime(iso(-400 * DAY), NOW)).toBe('1 year ago');
  });
  it('returns "unknown" for an unparseable input', () => {
    expect(relativeTime('not a date', NOW)).toBe('unknown');
  });
});

describe('isExpired / isExpiringSoon', () => {
  it('detects past expiry', () => {
    expect(isExpired({ expiresAt: iso(-DAY) }, NOW)).toBe(true);
    expect(isExpired({ expiresAt: iso(DAY) }, NOW)).toBe(false);
  });
  it('null expiry never expires', () => {
    expect(isExpired({ expiresAt: null }, NOW)).toBe(false);
    expect(isExpired({ expiresAt: undefined }, NOW)).toBe(false);
  });
  it('flags expiring within 7 days, not beyond', () => {
    expect(isExpiringSoon({ expiresAt: iso(3 * DAY) }, NOW)).toBe(true);
    expect(isExpiringSoon({ expiresAt: iso(10 * DAY) }, NOW)).toBe(false);
  });
  it('already-expired is not "expiring soon"', () => {
    expect(isExpiringSoon({ expiresAt: iso(-DAY) }, NOW)).toBe(false);
  });
});

describe('buildActivityFeed', () => {
  const share: CaregiverShare = {
    id: 'cg_1',
    label: 'Dr. Reyes',
    scopes: ['view-meds', 'view-adherence'],
    createdAt: iso(-14 * DAY),
    expiresAt: iso(30 * DAY),
    lastViewedAt: iso(-2 * DAY),
  };

  it('leads with last-viewed, then created, then expires', () => {
    const feed = buildActivityFeed(share, NOW);
    expect(feed.map((e) => e.kind)).toEqual(['viewed', 'created', 'expires']);
  });

  it('uses a never-viewed marker when lastViewedAt is null', () => {
    const feed = buildActivityFeed({ ...share, lastViewedAt: null }, NOW);
    expect(feed[0]!.kind).toBe('never-viewed');
    expect(feed[0]!.relative).toBe('never opened');
    expect(feed[0]!.at).toBeNull();
  });

  it('omits the expiry event when there is no expiry', () => {
    const feed = buildActivityFeed({ ...share, expiresAt: null }, NOW);
    expect(feed.map((e) => e.kind)).toEqual(['viewed', 'created']);
  });

  it('marks an expired share with a danger tone and "Expired" label', () => {
    const feed = buildActivityFeed({ ...share, expiresAt: iso(-DAY) }, NOW);
    const last = feed[feed.length - 1]!;
    expect(last.kind).toBe('expired');
    expect(last.label).toBe('Expired');
    expect(last.tone).toBe('danger');
  });

  it('marks an expiring-soon share with a warn tone', () => {
    const feed = buildActivityFeed({ ...share, expiresAt: iso(3 * DAY) }, NOW);
    const last = feed[feed.length - 1]!;
    expect(last.kind).toBe('expires');
    expect(last.tone).toBe('warn');
  });

  it('carries relative timestamps on each event', () => {
    const feed = buildActivityFeed(share, NOW);
    expect(feed.find((e) => e.kind === 'viewed')!.relative).toBe('2 days ago');
    expect(feed.find((e) => e.kind === 'created')!.relative).toBe('2 weeks ago');
    expect(feed.find((e) => e.kind === 'expires')!.relative).toBe('in 1 month');
  });
});

describe('scopeLabel', () => {
  it('maps known scopes to friendly labels', () => {
    expect(scopeLabel('view-meds')).toBe('View medications');
    expect(scopeLabel('request-refill')).toBe('Request refills');
  });
  it('title-cases an unknown slug', () => {
    expect(scopeLabel('view-labs')).toBe('View Labs');
    expect(scopeLabel('custom_scope')).toBe('Custom Scope');
  });
});

describe('summarizeActivity', () => {
  const share: CaregiverShare = {
    id: 'cg_2',
    label: 'Mom',
    scopes: ['view-meds'],
    createdAt: iso(-60 * DAY),
    expiresAt: null,
    lastViewedAt: iso(-9 * DAY),
  };

  it('summarizes view + expiry state', () => {
    const s = summarizeActivity(share, NOW);
    expect(s.viewed).toBe(true);
    expect(s.expired).toBe(false);
    expect(s.expiringSoon).toBe(false);
    expect(s.daysSinceViewed).toBe(9);
    expect(s.events).toHaveLength(2); // viewed + created (no expiry)
  });

  it('reports null daysSinceViewed for a never-viewed share', () => {
    const s = summarizeActivity({ ...share, lastViewedAt: null }, NOW);
    expect(s.viewed).toBe(false);
    expect(s.daysSinceViewed).toBeNull();
  });
});
