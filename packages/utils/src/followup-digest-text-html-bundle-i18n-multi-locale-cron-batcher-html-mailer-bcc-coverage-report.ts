/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC — COVERAGE REPORT companion.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc`
 * produces an envelope stream with BCC arrays + a coverage struct
 * (envelopeCount, bccEnvelopeCount, fanOutByAddress, primaryDroppedFromBcc).
 * The cron's monitoring pipeline wants STRUCTURED telemetry in a
 * JSON-friendly shape — Map values don't round-trip cleanly through
 * the standard JSON serialiser, and operations dashboards need a few
 * derived metrics (top-fanout addresses, addresses-with-no-fanout,
 * total BCC headers shipped) that don't live on the basic coverage
 * struct.
 *
 * This module is the coverage-report companion. Given a BCC result,
 * it produces a JSON-serialisable report:
 *
 *   {
 *     envelopeCount,
 *     bccEnvelopeCount,
 *     bccCoverageRatio,                  // bccEnvelopeCount / envelopeCount
 *     totalBccHeadersShipped,            // sum of fan-out counts
 *     distinctBccAddressCount,
 *     fanOutByAddress: [ { address, count }, ... ],   // sorted desc, JSON-friendly
 *     primaryDroppedFromBccCaregiverIds,
 *     primaryDroppedFromBccCount,
 *     silentCaregiverCount,
 *     unusedBccAddresses: string[],
 *     topFanoutAddress: string | null,
 *     topFanoutCount: number,
 *   }
 *
 * Pure / deterministic. Map -> array transform.
 *
 * Composes:
 *   - buildFollowupDigestHtmlMailerEnvelopesWithBcc result shape
 */

import type {
  FollowupDigestHtmlMailerBccDestination,
  FollowupDigestHtmlMailerBccResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';

export interface FollowupDigestBccCoverageReportFanOutEntry {
  /** BCC address. */
  address: string;
  /** Envelope count this address appeared on. */
  count: number;
}

export interface FollowupDigestBccCoverageReport {
  /** Total envelopes built. */
  envelopeCount: number;
  /** Envelopes that ended up with at least one BCC. */
  bccEnvelopeCount: number;
  /**
   * bccEnvelopeCount / envelopeCount, rounded to 4 decimal places.
   * 0 when envelopeCount is 0.
   */
  bccCoverageRatio: number;
  /** Sum of fan-out counts across all addresses. */
  totalBccHeadersShipped: number;
  /** Number of distinct BCC addresses observed. */
  distinctBccAddressCount: number;
  /**
   * Per-address fan-out, sorted by count DESC then address ASC.
   * JSON-friendly array shape (the underlying coverage uses a Map).
   */
  fanOutByAddress: FollowupDigestBccCoverageReportFanOutEntry[];
  /**
   * Caregivers whose primary `to` address was dropped from their
   * own BCC array (the dropPrimaryFromBcc=true path in the basic
   * BCC module).
   */
  primaryDroppedFromBccCaregiverIds: string[];
  /** Count of caregivers in primaryDroppedFromBccCaregiverIds. */
  primaryDroppedFromBccCount: number;
  /** Silent caregivers from the underlying mailer (forwarded). */
  silentCaregiverCount: number;
  /**
   * Declared BCC destinations whose address never appeared on any
   * envelope (because per-caregiver scope or dedup filtering
   * removed them). Sorted alphabetically. Empty when every
   * declared destination matched something.
   */
  unusedBccAddresses: string[];
  /** Highest-fanout address, or null when no addresses were used. */
  topFanoutAddress: string | null;
  /** Count for the top-fanout address; 0 when none. */
  topFanoutCount: number;
}

function roundTo(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

/**
 * Build the structured BCC coverage report from a BCC result.
 *
 * The `declaredDestinations` argument is optional — when omitted,
 * `unusedBccAddresses` is always empty (we can only know what was
 * unused if the caller tells us what was declared in the first
 * place). Most production callers have this list on hand from the
 * options bag.
 *
 * Pure / deterministic.
 */
export function buildFollowupDigestBccCoverageReport(
  bccResult: FollowupDigestHtmlMailerBccResult,
  declaredDestinations: FollowupDigestHtmlMailerBccDestination[] = [],
): FollowupDigestBccCoverageReport {
  const c = bccResult.coverage;

  // Sort fan-out by count DESC, then address ASC for deterministic output.
  const fanOutEntries: FollowupDigestBccCoverageReportFanOutEntry[] = [
    ...c.fanOutByAddress.entries(),
  ]
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.address.localeCompare(b.address);
    });

  let totalBccHeadersShipped = 0;
  for (const entry of fanOutEntries) {
    totalBccHeadersShipped += entry.count;
  }

  const bccCoverageRatio =
    c.envelopeCount === 0
      ? 0
      : roundTo(c.bccEnvelopeCount / c.envelopeCount, 4);

  const declaredAddresses = new Set(declaredDestinations.map((d) => d.address));
  const usedAddresses = new Set(fanOutEntries.map((e) => e.address));
  const unusedBccAddresses = [...declaredAddresses]
    .filter((a) => !usedAddresses.has(a))
    .sort();

  const topEntry = fanOutEntries[0];
  const topFanoutAddress = topEntry ? topEntry.address : null;
  const topFanoutCount = topEntry ? topEntry.count : 0;

  return {
    envelopeCount: c.envelopeCount,
    bccEnvelopeCount: c.bccEnvelopeCount,
    bccCoverageRatio,
    totalBccHeadersShipped,
    distinctBccAddressCount: fanOutEntries.length,
    fanOutByAddress: fanOutEntries,
    primaryDroppedFromBccCaregiverIds: [...c.primaryDroppedFromBcc],
    primaryDroppedFromBccCount: c.primaryDroppedFromBcc.length,
    silentCaregiverCount: bccResult.silent.length,
    unusedBccAddresses,
    topFanoutAddress,
    topFanoutCount,
  };
}

/**
 * Convenience: a one-line summary for the cron log paired with the
 * structured report.
 *
 *   "BCC coverage: 6 envelopes (4 BCC'd, 67%); 8 headers, 2 addresses;
 *    top fanout admin@x (4); 1 unused address; 1 caregiver had primary dropped."
 */
export function summarizeFollowupDigestBccCoverageReport(
  report: FollowupDigestBccCoverageReport,
): string {
  if (report.envelopeCount === 0) {
    return 'BCC coverage: 0 envelopes.';
  }
  const pct = Math.round(report.bccCoverageRatio * 100);
  const parts: string[] = [];
  parts.push(
    `BCC coverage: ${report.envelopeCount} ${report.envelopeCount === 1 ? 'envelope' : 'envelopes'} ` +
      `(${report.bccEnvelopeCount} BCC'd, ${pct}%)`,
  );
  parts.push(
    `${report.totalBccHeadersShipped} ${report.totalBccHeadersShipped === 1 ? 'header' : 'headers'}, ` +
      `${report.distinctBccAddressCount} ${report.distinctBccAddressCount === 1 ? 'address' : 'addresses'}`,
  );
  if (report.topFanoutAddress !== null) {
    parts.push(
      `top fanout ${report.topFanoutAddress} (${report.topFanoutCount})`,
    );
  }
  if (report.unusedBccAddresses.length > 0) {
    parts.push(
      `${report.unusedBccAddresses.length} unused ${report.unusedBccAddresses.length === 1 ? 'address' : 'addresses'}`,
    );
  }
  if (report.primaryDroppedFromBccCount > 0) {
    parts.push(
      `${report.primaryDroppedFromBccCount} ${report.primaryDroppedFromBccCount === 1 ? 'caregiver' : 'caregivers'} had primary dropped`,
    );
  }
  return parts.join('; ') + '.';
}

/**
 * Convenience: returns the top-N addresses by fan-out for the
 * dashboard's "loudest BCC addresses" widget.
 */
export function topNFanoutAddresses(
  report: FollowupDigestBccCoverageReport,
  n: number,
): FollowupDigestBccCoverageReportFanOutEntry[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('n must be a non-negative integer.');
  }
  return report.fanOutByAddress.slice(0, n);
}

/**
 * Convenience: detect misconfigurations from the report (returns
 * null when nothing looks wrong).
 *
 * Conditions surfaced:
 *   - one or more declared destinations were unused;
 *   - the fan-out skew is extreme (top address fan-out is > 75% of
 *     total headers AND there are 3+ distinct addresses — suggests a
 *     destination configured to broadcast that shouldn't be);
 *   - bccCoverageRatio is exactly 0 despite declared destinations
 *     (every scope filter matched nothing).
 */
export function detectFollowupDigestBccMisconfiguration(
  report: FollowupDigestBccCoverageReport,
  declaredDestinationCount: number,
): string | null {
  if (report.envelopeCount === 0) return null;
  if (declaredDestinationCount > 0 && report.totalBccHeadersShipped === 0) {
    return (
      `BCC misconfig: ${declaredDestinationCount} ${declaredDestinationCount === 1 ? 'destination' : 'destinations'} ` +
      `declared but zero BCC headers shipped (scope filters may be too narrow).`
    );
  }
  if (report.unusedBccAddresses.length > 0) {
    return (
      `BCC misconfig: ${report.unusedBccAddresses.length} unused ` +
      `${report.unusedBccAddresses.length === 1 ? 'address' : 'addresses'} ` +
      `(${report.unusedBccAddresses.join(', ')}); per-caregiver scope likely filters them out.`
    );
  }
  if (
    report.distinctBccAddressCount >= 3 &&
    report.totalBccHeadersShipped > 0 &&
    report.topFanoutCount / report.totalBccHeadersShipped > 0.75
  ) {
    return (
      `BCC misconfig: top address ${report.topFanoutAddress} accounts for ` +
      `${report.topFanoutCount}/${report.totalBccHeadersShipped} headers (>75%); ` +
      `consider scoping it down.`
    );
  }
  return null;
}
