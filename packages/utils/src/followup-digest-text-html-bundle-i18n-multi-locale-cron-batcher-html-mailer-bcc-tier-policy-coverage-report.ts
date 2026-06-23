/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC TIER-POLICY — COVERAGE REPORT companion.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy`
 * adds tier-aware filtering on top of the BCC envelopes. It exposes a
 * coverage struct (envelopeCount, countsByTier, bccEnvelopeCountByTier,
 * fanOutByAddress, unusedDestinations) and a one-line summary
 * (`summarizeBccTierPolicy`). Operations teams running the cron want
 * STRUCTURED telemetry the analytics pipeline can ingest:
 *
 *   - how is the tier distribution shifting week-over-week?
 *   - is the household admin getting too many critical pings?
 *   - which tier-restricted addresses never matched ANY envelope
 *     (misconfigured destination)?
 *   - which tier policy is the dominant one (most addresses, most
 *     fan-out)?
 *
 * The basic coverage struct doesn't answer those questions directly
 * because (a) Map values don't round-trip cleanly through JSON, (b)
 * per-tier fan-out isn't broken out, and (c) the misconfiguration
 * flags are derived metrics.
 *
 * This module is the coverage-report companion. Given a tier-policy
 * result, it produces a JSON-serialisable report:
 *
 *   {
 *     envelopeCount,
 *     countsByTier,                         // {routine, actionable, critical}
 *     bccEnvelopeCountByTier,
 *     tierDistribution,                     // ratio per tier, summed to 1.0 (or 0 when empty)
 *     totalBccHeadersShipped,
 *     distinctBccAddressCount,
 *     fanOutByAddress,                      // sorted desc; JSON-friendly array
 *     fanOutByTier,                         // per-tier per-address breakdown
 *     unusedDestinations,
 *     escalationOnlyAddresses,              // addresses that only fired on a single tier
 *     topFanoutAddress, topFanoutCount,
 *     dominantTier,                         // tier with most envelopes; null on tie or empty
 *     tierIsAlwaysRoutine, tierIsAlwaysActionable, tierIsAlwaysCritical,
 *   }
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - FollowupDigestHtmlMailerBccTierPolicyResult shape
 */

import type {
  FollowupDigestHtmlMailerBccTier,
  FollowupDigestHtmlMailerBccTieredEnvelope,
  FollowupDigestHtmlMailerBccTierPolicyResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy';

export interface FollowupDigestBccTierPolicyCoverageFanOutEntry {
  address: string;
  count: number;
}

export interface FollowupDigestBccTierPolicyCoverageReport {
  /** Total envelopes built. */
  envelopeCount: number;

  /** Counts per tier (mirrored from the underlying coverage). */
  countsByTier: Record<FollowupDigestHtmlMailerBccTier, number>;

  /** BCC envelope count per tier (envelopes that ended up with at least one BCC). */
  bccEnvelopeCountByTier: Record<FollowupDigestHtmlMailerBccTier, number>;

  /**
   * Per-tier ratio of total envelopes. Rounded to 4 decimals. Sums to
   * approximately 1.0 (modulo rounding). 0 across the board when
   * envelopeCount is 0.
   */
  tierDistribution: Record<FollowupDigestHtmlMailerBccTier, number>;

  /** Sum of fan-out counts across all addresses. */
  totalBccHeadersShipped: number;

  /** Number of distinct BCC addresses observed. */
  distinctBccAddressCount: number;

  /**
   * Per-address fan-out, sorted by count DESC then address ASC.
   * JSON-friendly array.
   */
  fanOutByAddress: FollowupDigestBccTierPolicyCoverageFanOutEntry[];

  /**
   * Per-tier per-address fan-out. Each tier has an array of {address,
   * count} entries, sorted by count DESC then address ASC.
   */
  fanOutByTier: Record<
    FollowupDigestHtmlMailerBccTier,
    FollowupDigestBccTierPolicyCoverageFanOutEntry[]
  >;

  /** Destinations declared in input that never matched any envelope. */
  unusedDestinations: string[];

  /**
   * Addresses that only fired on a single tier (escalation-only
   * destinations). Sorted by address ASC.
   */
  escalationOnlyAddresses: string[];

  /** Address with the highest fan-out, or null when none. */
  topFanoutAddress: string | null;
  /** Count for topFanoutAddress (0 when none). */
  topFanoutCount: number;

  /**
   * Tier with the most envelopes; null on a tie or empty input.
   */
  dominantTier: FollowupDigestHtmlMailerBccTier | null;

  /** True when every envelope was classified routine. */
  tierIsAlwaysRoutine: boolean;
  /** True when every envelope was classified actionable. */
  tierIsAlwaysActionable: boolean;
  /** True when every envelope was classified critical. */
  tierIsAlwaysCritical: boolean;
}

function buildPerTierFanOut(
  envelopes: FollowupDigestHtmlMailerBccTieredEnvelope[],
): Record<
  FollowupDigestHtmlMailerBccTier,
  FollowupDigestBccTierPolicyCoverageFanOutEntry[]
> {
  const counts: Record<FollowupDigestHtmlMailerBccTier, Map<string, number>> = {
    routine: new Map(),
    actionable: new Map(),
    critical: new Map(),
  };
  for (const env of envelopes) {
    const m = counts[env.tier];
    for (const addr of env.bcc) {
      m.set(addr, (m.get(addr) ?? 0) + 1);
    }
  }
  const out: Record<
    FollowupDigestHtmlMailerBccTier,
    FollowupDigestBccTierPolicyCoverageFanOutEntry[]
  > = {
    routine: mapToSortedFanOut(counts.routine),
    actionable: mapToSortedFanOut(counts.actionable),
    critical: mapToSortedFanOut(counts.critical),
  };
  return out;
}

function mapToSortedFanOut(
  m: Map<string, number>,
): FollowupDigestBccTierPolicyCoverageFanOutEntry[] {
  return [...m.entries()]
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.address.localeCompare(b.address);
    });
}

function computeDistribution(
  counts: Record<FollowupDigestHtmlMailerBccTier, number>,
  total: number,
): Record<FollowupDigestHtmlMailerBccTier, number> {
  if (total === 0) return { routine: 0, actionable: 0, critical: 0 };
  const round = (n: number) => Math.round((n / total) * 10000) / 10000;
  return {
    routine: round(counts.routine),
    actionable: round(counts.actionable),
    critical: round(counts.critical),
  };
}

function pickDominantTier(
  counts: Record<FollowupDigestHtmlMailerBccTier, number>,
  total: number,
): FollowupDigestHtmlMailerBccTier | null {
  if (total === 0) return null;
  const entries: Array<[FollowupDigestHtmlMailerBccTier, number]> = [
    ['routine', counts.routine],
    ['actionable', counts.actionable],
    ['critical', counts.critical],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0]!;
  const second = entries[1]!;
  // Tie -> null (no dominant tier).
  if (top[1] === second[1]) return null;
  if (top[1] === 0) return null;
  return top[0];
}

/**
 * Build the JSON-friendly coverage report from a tier-policy result.
 *
 * Pure / deterministic.
 */
export function buildBccTierPolicyCoverageReport(
  result: FollowupDigestHtmlMailerBccTierPolicyResult,
): FollowupDigestBccTierPolicyCoverageReport {
  const coverage = result.coverage;
  const envelopeCount = coverage.envelopeCount;
  const countsByTier = coverage.countsByTier;
  const bccEnvelopeCountByTier = coverage.bccEnvelopeCountByTier;
  const tierDistribution = computeDistribution(countsByTier, envelopeCount);

  // Array form of the Map<address, count>, sorted desc.
  const fanOutByAddress = mapToSortedFanOut(coverage.fanOutByAddress);
  const totalBccHeadersShipped = fanOutByAddress.reduce(
    (sum, e) => sum + e.count,
    0,
  );

  const fanOutByTier = buildPerTierFanOut(result.envelopes);

  // Escalation-only addresses: appeared in exactly one tier's fan-out.
  // We walk fanOutByTier (which only includes addresses that actually
  // fired) and pick those whose tier-membership-count is 1.
  const tierCountByAddress = new Map<string, number>();
  for (const tier of ['routine', 'actionable', 'critical'] as const) {
    for (const entry of fanOutByTier[tier]) {
      tierCountByAddress.set(
        entry.address,
        (tierCountByAddress.get(entry.address) ?? 0) + 1,
      );
    }
  }
  const escalationOnlyAddresses = [...tierCountByAddress.entries()]
    .filter(([, n]) => n === 1)
    .map(([addr]) => addr)
    .sort((a, b) => a.localeCompare(b));

  const topFanoutAddress =
    fanOutByAddress.length > 0 ? fanOutByAddress[0]!.address : null;
  const topFanoutCount =
    fanOutByAddress.length > 0 ? fanOutByAddress[0]!.count : 0;

  const dominantTier = pickDominantTier(countsByTier, envelopeCount);
  const tierIsAlwaysRoutine =
    envelopeCount > 0 && countsByTier.routine === envelopeCount;
  const tierIsAlwaysActionable =
    envelopeCount > 0 && countsByTier.actionable === envelopeCount;
  const tierIsAlwaysCritical =
    envelopeCount > 0 && countsByTier.critical === envelopeCount;

  return {
    envelopeCount,
    countsByTier: { ...countsByTier },
    bccEnvelopeCountByTier: { ...bccEnvelopeCountByTier },
    tierDistribution,
    totalBccHeadersShipped,
    distinctBccAddressCount: fanOutByAddress.length,
    fanOutByAddress,
    fanOutByTier,
    unusedDestinations: [...coverage.unusedDestinations].sort(),
    escalationOnlyAddresses,
    topFanoutAddress,
    topFanoutCount,
    dominantTier,
    tierIsAlwaysRoutine,
    tierIsAlwaysActionable,
    tierIsAlwaysCritical,
  };
}

/**
 * Convenience: a one-line cron-log summary of the coverage report.
 *
 *   "BCC tier-policy coverage: 6 envelopes (50% routine, 33% actionable,
 *    17% critical); dominant=routine; top fan-out admin@example.com (5);
 *    1 escalation-only address; 1 unused destination."
 *
 * Designed for human ops review on a single line; the full JSON is for
 * the analytics pipeline.
 */
export function summarizeBccTierPolicyCoverageReport(
  report: FollowupDigestBccTierPolicyCoverageReport,
): string {
  const e = report.envelopeCount;
  const td = report.tierDistribution;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const distribution = `${pct(td.routine)} routine, ${pct(td.actionable)} actionable, ${pct(td.critical)} critical`;
  const dom = report.dominantTier ?? 'none';
  const topPart =
    report.topFanoutAddress === null
      ? 'no BCC fan-out'
      : `top fan-out ${report.topFanoutAddress} (${report.topFanoutCount})`;
  const esc = report.escalationOnlyAddresses.length;
  const escPart = `${esc} escalation-only ${esc === 1 ? 'address' : 'addresses'}`;
  const un = report.unusedDestinations.length;
  const unPart = `${un} unused ${un === 1 ? 'destination' : 'destinations'}`;
  return (
    `BCC tier-policy coverage: ${e} ${e === 1 ? 'envelope' : 'envelopes'} ` +
    `(${distribution}); dominant=${dom}; ${topPart}; ${escPart}; ${unPart}.`
  );
}

/**
 * Convenience: detect misconfiguration warnings on the report and
 * return human-readable warning strings. Returns an empty array
 * when nothing is amiss.
 *
 *   - "Channel always routine" — tier classifier never fires
 *     actionable / critical (possible classifier bug);
 *   - "Channel always critical" — every envelope critical
 *     (possible upstream digest bug producing too many overdues);
 *   - "Unused destination: <addr>" — declared destination never
 *     matched any envelope.
 */
export function detectBccTierPolicyCoverageWarnings(
  report: FollowupDigestBccTierPolicyCoverageReport,
): string[] {
  const out: string[] = [];
  if (report.tierIsAlwaysRoutine) out.push('Channel always routine');
  if (report.tierIsAlwaysActionable) out.push('Channel always actionable');
  if (report.tierIsAlwaysCritical) out.push('Channel always critical');
  for (const addr of report.unusedDestinations) {
    out.push(`Unused destination: ${addr}`);
  }
  return out;
}
