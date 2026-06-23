/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer — BCC self-suppression policy.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc`
 * adds a `bcc` array to every envelope from a per-caregiver +
 * per-destination scope rule. It already does the right thing for
 * a single envelope: when `dropPrimaryFromBcc` (default true), the
 * envelope's own `to` address is dropped from its OWN bcc list so
 * the recipient doesn't get a double-send.
 *
 * It does NOT handle CROSS-ENVELOPE self-CC. Common household
 * pattern:
 *
 *   - Envelope #1 primary `to`: alice@example.com (caregiver Alice)
 *     bcc: [admin@example.com]    (household admin BCC'd)
 *   - Envelope #2 primary `to`: admin@example.com (caregiver Admin)
 *     bcc: [admin@example.com]    (household admin BCC'd here too;
 *                                   dropPrimaryFromBcc filters it)
 *   - Envelope #3 primary `to`: bob@example.com (caregiver Bob)
 *     bcc: [admin@example.com]    (admin still here)
 *
 * Result: admin@example.com receives envelope #1 as a BCC, envelope
 * #2 as a primary (with bcc filtered down), and envelope #3 as a
 * BCC. Three envelopes deliver to admin. The household admin is
 * effectively double-CC'd on Alice's + Bob's envelopes when they
 * already get a primary on their own envelope.
 *
 * The fix: when an address appears as a PRIMARY `to` on ANY envelope
 * in the batch, suppress it from the BCC array of ALL OTHER envelopes
 * in the batch (it's not their job to deliver to them; the address's
 * own envelope handles it).
 *
 * This module is the cross-envelope self-suppression policy. It
 * composes buildFollowupDigestHtmlMailerEnvelopesWithBcc under the
 * hood and runs a second pass that suppresses self-CCs across the
 * batch.
 *
 * Behaviour:
 *   - default policy: 'suppress-when-primary-elsewhere' — if an
 *     address is a primary on any envelope, drop it from the BCC
 *     array of ALL other envelopes;
 *   - 'preserve-all' policy: leave the BCC list untouched (compose
 *     pass-through for the test-only / opt-out case);
 *   - per-address override list `preserveAddresses` — addresses
 *     in this list are NEVER suppressed (a household admin who
 *     intentionally wants the audit trail on their parent's
 *     envelope too).
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - buildFollowupDigestHtmlMailerEnvelopesWithBcc
 */

import type {
  FollowupDigestHtmlMailerBccCoverage,
  FollowupDigestHtmlMailerBccEnvelope,
  FollowupDigestHtmlMailerBccOptions,
  FollowupDigestHtmlMailerBccResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
import { buildFollowupDigestHtmlMailerEnvelopesWithBcc } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
import type { FollowupDigestCronBatcherResult } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';

export type FollowupDigestHtmlMailerBccSelfSuppressPolicy =
  | 'suppress-when-primary-elsewhere'
  | 'preserve-all';

export interface FollowupDigestHtmlMailerBccSuppressSelfCcOptions
  extends FollowupDigestHtmlMailerBccOptions {
  /**
   * Self-suppression policy. Default 'suppress-when-primary-elsewhere'.
   */
  selfSuppressPolicy?: FollowupDigestHtmlMailerBccSelfSuppressPolicy;
  /**
   * Addresses that are NEVER suppressed even under the default
   * policy. The household admin who wants the audit trail.
   */
  preserveAddresses?: string[];
}

export interface FollowupDigestHtmlMailerBccSuppressSelfCcCoverage
  extends FollowupDigestHtmlMailerBccCoverage {
  /**
   * Per-address counts of how many envelopes were stripped of that
   * BCC because the address was a primary on another envelope in
   * the batch. Empty under 'preserve-all'.
   */
  selfCcSuppressedByAddress: Map<string, number>;
  /**
   * Total BCC entries removed by self-suppression across the batch.
   */
  totalSelfCcSuppressions: number;
  /**
   * Addresses preserved via `preserveAddresses`. Empty when no
   * preserve list applies.
   */
  preservedAddresses: string[];
}

export interface FollowupDigestHtmlMailerBccSuppressSelfCcResult {
  envelopes: FollowupDigestHtmlMailerBccEnvelope[];
  byCaregiverId: Map<string, FollowupDigestHtmlMailerBccEnvelope>;
  silent: FollowupDigestHtmlMailerBccResult['silent'];
  coverage: FollowupDigestHtmlMailerBccSuppressSelfCcCoverage;
}

/**
 * Build BCC-aware envelopes with cross-envelope self-CC suppression.
 *
 * Two passes:
 *   1. Compose buildFollowupDigestHtmlMailerEnvelopesWithBcc to get
 *      the per-envelope BCC arrays.
 *   2. Collect the set of addresses that appear as a primary `to`
 *      on ANY envelope. For each envelope, strip from its `bcc`
 *      array every address that appears in the primary set BUT is
 *      not in `preserveAddresses` AND is not the envelope's own
 *      primary (already handled by the underlying module's
 *      dropPrimaryFromBcc).
 *
 * Pure / deterministic.
 */
export function buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(
  batch: FollowupDigestCronBatcherResult,
  options: FollowupDigestHtmlMailerBccSuppressSelfCcOptions = {},
): FollowupDigestHtmlMailerBccSuppressSelfCcResult {
  const base = buildFollowupDigestHtmlMailerEnvelopesWithBcc(batch, options);
  const policy = options.selfSuppressPolicy ?? 'suppress-when-primary-elsewhere';
  const preserveSet = new Set(options.preserveAddresses ?? []);

  // Recompute fan-out + suppression telemetry from the (possibly
  // mutated) envelopes below.
  if (policy === 'preserve-all') {
    return {
      envelopes: base.envelopes,
      byCaregiverId: base.byCaregiverId,
      silent: base.silent,
      coverage: {
        ...base.coverage,
        selfCcSuppressedByAddress: new Map(),
        totalSelfCcSuppressions: 0,
        preservedAddresses: [...preserveSet].sort(),
      },
    };
  }

  // Pass 1: collect every address that is a primary on any envelope.
  const primarySet = new Set<string>();
  for (const env of base.envelopes) {
    if (typeof env.to === 'string' && env.to.length > 0) {
      primarySet.add(env.to);
    }
  }

  // Pass 2: strip self-CC from each envelope's bcc, recompute fan-out.
  const selfCcSuppressedByAddress = new Map<string, number>();
  const fanOutByAddress = new Map<string, number>();
  let totalSelfCcSuppressions = 0;

  const newEnvelopes: FollowupDigestHtmlMailerBccEnvelope[] = base.envelopes.map(
    (env) => {
      const ownTo = env.to;
      const filtered: string[] = [];
      for (const addr of env.bcc) {
        if (ownTo !== undefined && addr === ownTo) {
          // dropPrimaryFromBcc should have removed this already, but
          // defensive: a caller who passed dropPrimaryFromBcc=false
          // still expects self-suppression to remove their own primary.
          // Count it as a self-suppression for the cross-envelope case
          // ONLY if the address is ALSO a primary on another envelope
          // (which is trivially true here since it's their own primary
          // and primarySet contains it). We model this as a separate
          // policy concern: still strip it, count as a suppression.
          selfCcSuppressedByAddress.set(
            addr,
            (selfCcSuppressedByAddress.get(addr) ?? 0) + 1,
          );
          totalSelfCcSuppressions++;
          continue;
        }
        if (primarySet.has(addr) && !preserveSet.has(addr)) {
          // Cross-envelope self-CC: this BCC address is a primary
          // on a different envelope. Drop it.
          selfCcSuppressedByAddress.set(
            addr,
            (selfCcSuppressedByAddress.get(addr) ?? 0) + 1,
          );
          totalSelfCcSuppressions++;
          continue;
        }
        filtered.push(addr);
      }
      for (const addr of filtered) {
        fanOutByAddress.set(addr, (fanOutByAddress.get(addr) ?? 0) + 1);
      }
      return { ...env, bcc: filtered };
    },
  );

  const byCaregiverId = new Map<string, FollowupDigestHtmlMailerBccEnvelope>();
  for (const env of newEnvelopes) byCaregiverId.set(env.caregiverId, env);

  const preservedAddresses = [...preserveSet]
    .filter((addr) => primarySet.has(addr))
    .sort();

  return {
    envelopes: newEnvelopes,
    byCaregiverId,
    silent: base.silent,
    coverage: {
      envelopeCount: newEnvelopes.length,
      bccEnvelopeCount: newEnvelopes.filter((e) => e.bcc.length > 0).length,
      fanOutByAddress,
      primaryDroppedFromBcc: base.coverage.primaryDroppedFromBcc,
      selfCcSuppressedByAddress,
      totalSelfCcSuppressions,
      preservedAddresses,
    },
  };
}

/**
 * Convenience: one-line cron-log summary for the self-suppression.
 *
 *   "Self-CC suppression: 3 entries suppressed across 2 addresses
 *    (admin@example.com x2, pcp@example.com x1). 1 address preserved."
 *   "Self-CC suppression: none applied."
 *   "Self-CC suppression: policy preserve-all — none applied."
 */
export function summarizeSelfCcSuppression(
  result: FollowupDigestHtmlMailerBccSuppressSelfCcResult,
  options: { policyTag?: FollowupDigestHtmlMailerBccSelfSuppressPolicy } = {},
): string {
  if (options.policyTag === 'preserve-all') {
    return 'Self-CC suppression: policy preserve-all - none applied.';
  }
  const c = result.coverage;
  if (c.totalSelfCcSuppressions === 0) {
    return 'Self-CC suppression: none applied.';
  }
  const entries = [...c.selfCcSuppressedByAddress.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const detailed = entries.map(([addr, n]) => `${addr} x${n}`).join(', ');
  const preservedFragment =
    c.preservedAddresses.length > 0
      ? ` ${c.preservedAddresses.length} ${c.preservedAddresses.length === 1 ? 'address' : 'addresses'} preserved.`
      : '';
  return (
    `Self-CC suppression: ${c.totalSelfCcSuppressions} ` +
    `${c.totalSelfCcSuppressions === 1 ? 'entry' : 'entries'} suppressed ` +
    `across ${c.selfCcSuppressedByAddress.size} ` +
    `${c.selfCcSuppressedByAddress.size === 1 ? 'address' : 'addresses'} (${detailed}).` +
    preservedFragment
  );
}

/**
 * Convenience: return the addresses (sorted) that would receive at
 * least one BCC delivery after self-suppression. Useful for an SMTP
 * relay pre-warm step.
 */
export function collectPostSuppressionBccAddresses(
  result: FollowupDigestHtmlMailerBccSuppressSelfCcResult,
): string[] {
  return [...result.coverage.fanOutByAddress.keys()].sort();
}
