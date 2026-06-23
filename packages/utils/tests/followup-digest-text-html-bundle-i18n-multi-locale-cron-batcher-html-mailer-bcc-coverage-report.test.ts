import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestBccCoverageReport,
  summarizeFollowupDigestBccCoverageReport,
  topNFanoutAddresses,
  detectFollowupDigestBccMisconfiguration,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-coverage-report';
import type {
  FollowupDigestHtmlMailerBccDestination,
  FollowupDigestHtmlMailerBccEnvelope,
  FollowupDigestHtmlMailerBccResult,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
import type { FollowupDigestHtmlMailerSilentCaregiver } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer';

function makeBccResult({
  envelopeCount = 0,
  bccEnvelopeCount = 0,
  fanOutEntries = [] as Array<[string, number]>,
  primaryDroppedFromBcc = [] as string[],
  silent = [] as FollowupDigestHtmlMailerSilentCaregiver[],
}: {
  envelopeCount?: number;
  bccEnvelopeCount?: number;
  fanOutEntries?: Array<[string, number]>;
  primaryDroppedFromBcc?: string[];
  silent?: FollowupDigestHtmlMailerSilentCaregiver[];
}): FollowupDigestHtmlMailerBccResult {
  const fanOut = new Map<string, number>();
  for (const [addr, count] of fanOutEntries) fanOut.set(addr, count);
  return {
    envelopes: [] as FollowupDigestHtmlMailerBccEnvelope[],
    byCaregiverId: new Map(),
    silent,
    coverage: {
      envelopeCount,
      bccEnvelopeCount,
      fanOutByAddress: fanOut,
      primaryDroppedFromBcc,
    },
  };
}

function dest(address: string): FollowupDigestHtmlMailerBccDestination {
  return { address };
}

describe('buildFollowupDigestBccCoverageReport — empty', () => {
  it('returns zero counts when envelopeCount is 0', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}));
    expect(r.envelopeCount).toBe(0);
    expect(r.bccEnvelopeCount).toBe(0);
    expect(r.bccCoverageRatio).toBe(0);
    expect(r.totalBccHeadersShipped).toBe(0);
    expect(r.distinctBccAddressCount).toBe(0);
    expect(r.fanOutByAddress).toEqual([]);
    expect(r.topFanoutAddress).toBeNull();
    expect(r.topFanoutCount).toBe(0);
    expect(r.unusedBccAddresses).toEqual([]);
  });

  it('reports unused declared addresses even when envelopeCount is 0', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}), [
      dest('a'),
      dest('b'),
    ]);
    expect(r.unusedBccAddresses).toEqual(['a', 'b']);
  });
});

describe('buildFollowupDigestBccCoverageReport — counting + ratio', () => {
  it('computes bccCoverageRatio rounded to 4 decimal places', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 7,
        bccEnvelopeCount: 3,
        fanOutEntries: [['x', 3]],
      }),
    );
    expect(r.envelopeCount).toBe(7);
    expect(r.bccEnvelopeCount).toBe(3);
    expect(r.bccCoverageRatio).toBe(0.4286); // 3/7 = 0.42857... -> 0.4286
  });

  it('totalBccHeadersShipped is the sum of fan-out counts', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 4,
        bccEnvelopeCount: 4,
        fanOutEntries: [
          ['a', 4],
          ['b', 2],
          ['c', 1],
        ],
      }),
    );
    expect(r.totalBccHeadersShipped).toBe(7);
  });

  it('distinctBccAddressCount matches the fan-out entry count', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 4,
        fanOutEntries: [
          ['a', 1],
          ['b', 2],
          ['c', 1],
        ],
      }),
    );
    expect(r.distinctBccAddressCount).toBe(3);
  });
});

describe('buildFollowupDigestBccCoverageReport — fanOutByAddress sort order', () => {
  it('sorts by count DESC', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 6,
        fanOutEntries: [
          ['low', 1],
          ['high', 6],
          ['mid', 3],
        ],
      }),
    );
    expect(r.fanOutByAddress.map((e) => e.address)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('breaks count ties by address ASC', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        fanOutEntries: [
          ['zebra', 2],
          ['apple', 2],
          ['mango', 2],
        ],
      }),
    );
    expect(r.fanOutByAddress.map((e) => e.address)).toEqual([
      'apple',
      'mango',
      'zebra',
    ]);
  });

  it('reports topFanoutAddress + topFanoutCount from the head of the list', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 10,
        fanOutEntries: [
          ['admin@x', 10],
          ['pcp@x', 4],
        ],
      }),
    );
    expect(r.topFanoutAddress).toBe('admin@x');
    expect(r.topFanoutCount).toBe(10);
  });
});

describe('buildFollowupDigestBccCoverageReport — unused destinations', () => {
  it('flags destinations declared but never used', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 1,
        bccEnvelopeCount: 1,
        fanOutEntries: [['used@x', 1]],
      }),
      [dest('used@x'), dest('unused@x'), dest('orphan@x')],
    );
    expect(r.unusedBccAddresses).toEqual(['orphan@x', 'unused@x']);
  });

  it('reports no unused when every declared destination is used', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        fanOutEntries: [
          ['a', 1],
          ['b', 1],
        ],
      }),
      [dest('a'), dest('b')],
    );
    expect(r.unusedBccAddresses).toEqual([]);
  });

  it('returns empty unused list when declaredDestinations omitted', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 1,
        fanOutEntries: [['a', 1]],
      }),
    );
    expect(r.unusedBccAddresses).toEqual([]);
  });

  it('dedups multiple declarations of the same address', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({ envelopeCount: 1 }),
      [
        dest('a'),
        dest('a'),
        { address: 'a', forCaregiverIds: ['c1'] },
      ],
    );
    expect(r.unusedBccAddresses).toEqual(['a']);
  });
});

describe('buildFollowupDigestBccCoverageReport — primaryDropped + silent', () => {
  it('forwards primaryDroppedFromBcc caregiver ids', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 3,
        primaryDroppedFromBcc: ['c1', 'c2'],
      }),
    );
    expect(r.primaryDroppedFromBccCaregiverIds).toEqual(['c1', 'c2']);
    expect(r.primaryDroppedFromBccCount).toBe(2);
  });

  it('forwards silent caregiver count from the underlying mailer', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        silent: [
          { caregiverId: 'cx', reason: 'silent-week' },
          { caregiverId: 'cy', reason: 'unknown-locale-skipped' },
        ],
      }),
    );
    expect(r.silentCaregiverCount).toBe(2);
  });

  it('primaryDroppedFromBccCaregiverIds is a fresh array (not aliased)', () => {
    const src = makeBccResult({
      envelopeCount: 1,
      primaryDroppedFromBcc: ['c1'],
    });
    const r = buildFollowupDigestBccCoverageReport(src);
    r.primaryDroppedFromBccCaregiverIds.push('c2');
    expect(src.coverage.primaryDroppedFromBcc).toEqual(['c1']);
  });
});

describe('summarizeFollowupDigestBccCoverageReport', () => {
  it('reports 0 envelopes cleanly', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}));
    expect(summarizeFollowupDigestBccCoverageReport(r)).toBe(
      'BCC coverage: 0 envelopes.',
    );
  });

  it('reports envelope count, BCC ratio, and header / address totals', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 6,
        bccEnvelopeCount: 4,
        fanOutEntries: [
          ['admin@x', 4],
          ['pcp@x', 4],
        ],
      }),
    );
    const summary = summarizeFollowupDigestBccCoverageReport(r);
    expect(summary).toContain('6 envelopes');
    expect(summary).toContain('4 BCC');
    expect(summary).toContain('67%');
    expect(summary).toContain('8 headers');
    expect(summary).toContain('2 addresses');
  });

  it('includes top fanout in summary when at least one address used', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        bccEnvelopeCount: 2,
        fanOutEntries: [['a@x', 2]],
      }),
    );
    expect(summarizeFollowupDigestBccCoverageReport(r)).toContain(
      'top fanout a@x (2)',
    );
  });

  it('includes unused address count when present', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        bccEnvelopeCount: 0,
      }),
      [dest('unused@x')],
    );
    expect(summarizeFollowupDigestBccCoverageReport(r)).toContain(
      '1 unused address',
    );
  });

  it('includes primary-dropped caregiver count when present', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        bccEnvelopeCount: 2,
        fanOutEntries: [['a@x', 2]],
        primaryDroppedFromBcc: ['c1'],
      }),
    );
    expect(summarizeFollowupDigestBccCoverageReport(r)).toContain(
      '1 caregiver had primary dropped',
    );
  });
});

describe('topNFanoutAddresses', () => {
  it('returns the top N by fan-out', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 6,
        fanOutEntries: [
          ['a', 5],
          ['b', 3],
          ['c', 1],
        ],
      }),
    );
    expect(topNFanoutAddresses(r, 2)).toEqual([
      { address: 'a', count: 5 },
      { address: 'b', count: 3 },
    ]);
  });

  it('returns empty when N=0', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 1,
        fanOutEntries: [['a', 1]],
      }),
    );
    expect(topNFanoutAddresses(r, 0)).toEqual([]);
  });

  it('returns the full list when N exceeds available', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 1,
        fanOutEntries: [['a', 1]],
      }),
    );
    expect(topNFanoutAddresses(r, 10)).toHaveLength(1);
  });

  it('throws on negative N', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}));
    expect(() => topNFanoutAddresses(r, -1)).toThrow();
  });

  it('throws on non-integer N', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}));
    expect(() => topNFanoutAddresses(r, 1.5)).toThrow();
  });
});

describe('detectFollowupDigestBccMisconfiguration', () => {
  it('returns null on empty envelope set', () => {
    const r = buildFollowupDigestBccCoverageReport(makeBccResult({}));
    expect(detectFollowupDigestBccMisconfiguration(r, 0)).toBeNull();
  });

  it('returns null in the happy path', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 4,
        bccEnvelopeCount: 4,
        fanOutEntries: [
          ['a', 4],
          ['b', 4],
        ],
      }),
      [dest('a'), dest('b')],
    );
    expect(detectFollowupDigestBccMisconfiguration(r, 2)).toBeNull();
  });

  it('flags zero-BCC-headers when destinations were declared', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({ envelopeCount: 3, bccEnvelopeCount: 0 }),
      [dest('a'), dest('b')],
    );
    const msg = detectFollowupDigestBccMisconfiguration(r, 2);
    expect(msg).toContain('2 destinations declared');
    expect(msg).toContain('zero BCC headers');
  });

  it('flags unused addresses when some were declared but never used', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        bccEnvelopeCount: 2,
        fanOutEntries: [['a', 2]],
      }),
      [dest('a'), dest('orphan@x')],
    );
    const msg = detectFollowupDigestBccMisconfiguration(r, 2);
    expect(msg).toContain('unused');
    expect(msg).toContain('orphan@x');
  });

  it('flags extreme fan-out skew (>75% on one address out of 3+)', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 100,
        bccEnvelopeCount: 100,
        fanOutEntries: [
          ['mega@x', 100],
          ['some@x', 5],
          ['other@x', 5],
        ],
      }),
    );
    const msg = detectFollowupDigestBccMisconfiguration(r, 0);
    expect(msg).toContain('mega@x');
    expect(msg).toContain('>75%');
  });

  it('does NOT flag skew when only 2 distinct addresses (admin + pcp pattern)', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 100,
        bccEnvelopeCount: 100,
        fanOutEntries: [
          ['mega@x', 100],
          ['rare@x', 5],
        ],
      }),
    );
    expect(detectFollowupDigestBccMisconfiguration(r, 0)).toBeNull();
  });
});

describe('determinism + json roundtrip', () => {
  it('byte-identical output for same input', () => {
    const src = makeBccResult({
      envelopeCount: 4,
      bccEnvelopeCount: 3,
      fanOutEntries: [
        ['a', 2],
        ['b', 3],
      ],
      primaryDroppedFromBcc: ['c1'],
    });
    const a = buildFollowupDigestBccCoverageReport(src, [dest('a'), dest('b')]);
    const b = buildFollowupDigestBccCoverageReport(src, [dest('a'), dest('b')]);
    expect(a).toEqual(b);
  });

  it('report is JSON-roundtrip safe (no Maps; fanOutByAddress is an array)', () => {
    const r = buildFollowupDigestBccCoverageReport(
      makeBccResult({
        envelopeCount: 2,
        bccEnvelopeCount: 2,
        fanOutEntries: [
          ['a', 2],
          ['b', 1],
        ],
      }),
    );
    const json = JSON.stringify(r);
    const parsed = JSON.parse(json);
    expect(parsed.fanOutByAddress).toEqual([
      { address: 'a', count: 2 },
      { address: 'b', count: 1 },
    ]);
    expect(parsed.envelopeCount).toBe(2);
    expect(parsed.topFanoutAddress).toBe('a');
  });
});
