/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer — BCC policy.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer`
 * builds one SMTP envelope per caregiver: subject + text + html
 * with a single `to` field. A household administration pattern
 * common in real deployments needs a secondary delivery target:
 *
 *   - the primary care physician (PCP) gets a BCC of every
 *     caregiver's weekly digest so they have visibility on what
 *     the family sees;
 *   - the household admin (often an adult child) gets a BCC of
 *     every sibling-caregiver's digest so they can audit what is
 *     being shared on their parent;
 *   - an escalation contact (a family-care manager, a clinical
 *     coordinator) gets a BCC during a defined window (e.g. the
 *     6 weeks after a hospitalisation) and is removed afterward.
 *
 * The PCP / admin / escalation destinations are NOT replacements
 * for the primary `to` field — they're parallel recipients that
 * see the SAME envelope. Most SMTP libraries support `bcc` as an
 * array of address strings; this module produces that array per
 * envelope.
 *
 * Policy is per-CAREGIVER (so a household can keep BCC on for some
 * caregivers and off for others) and per-DESTINATION (so escalation
 * contacts can be enabled selectively). Default: no BCC anywhere.
 *
 * This module is the BCC overlay. It composes
 * buildFollowupDigestHtmlMailerEnvelopes under the hood and
 * augments each envelope with a `bcc` array based on the policy:
 *
 *   {
 *     ...envelope,
 *     bcc: ['pcp@example.com', 'admin@example.com'],
 *   }
 *
 * Empty BCC array is OMITTED (rather than `bcc: []`) so SMTP
 * libraries that require a non-empty array don't choke.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupDigestHtmlMailerEnvelope,
  FollowupDigestHtmlMailerOptions,
  FollowupDigestHtmlMailerResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer';
import { buildFollowupDigestHtmlMailerEnvelopes } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer';
import type { FollowupDigestCronBatcherResult } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';

/** One BCC destination with an optional per-caregiver scope. */
export interface FollowupDigestHtmlMailerBccDestination {
  /** Email address (or other transport identifier). Required. */
  address: string;
  /**
   * If set, BCC this address only for these caregiver ids. If
   * undefined, this address is BCC'd on EVERY caregiver's envelope.
   */
  forCaregiverIds?: string[];
  /**
   * If set, do NOT BCC this address for these caregiver ids (even if
   * the destination is otherwise broadcast). Takes precedence over
   * forCaregiverIds.
   */
  excludeCaregiverIds?: string[];
}

export interface FollowupDigestHtmlMailerBccOptions
  extends FollowupDigestHtmlMailerOptions {
  /**
   * BCC destinations to apply. Default empty.
   */
  bccDestinations?: FollowupDigestHtmlMailerBccDestination[];
  /**
   * Dedup the BCC array per envelope. Default true. Useful when a
   * caregiver might be both a primary recipient AND on a global
   * BCC list (e.g. the household admin is also a caregiver) — we
   * don't want them on the bcc array of their own envelope.
   */
  dropPrimaryFromBcc?: boolean;
}

export interface FollowupDigestHtmlMailerBccEnvelope
  extends FollowupDigestHtmlMailerEnvelope {
  /**
   * BCC addresses for this envelope. Always present; empty array
   * when no BCC applies. Callers who want to splice into an SMTP
   * library that requires omission should check `.length > 0`.
   */
  bcc: string[];
}

export interface FollowupDigestHtmlMailerBccCoverage {
  /** Total envelopes produced. */
  envelopeCount: number;
  /** Envelopes whose bcc array has at least one entry. */
  bccEnvelopeCount: number;
  /**
   * Per-BCC-address fan-out count. address -> count of envelopes
   * that include this address. Sums >= envelope count when the
   * same envelope BCCs multiple addresses.
   */
  fanOutByAddress: Map<string, number>;
  /** Caregivers whose primary destination was dropped from a BCC array. */
  primaryDroppedFromBcc: string[];
}

export interface FollowupDigestHtmlMailerBccResult {
  envelopes: FollowupDigestHtmlMailerBccEnvelope[];
  /** Quick map for direct lookup by caregiverId. */
  byCaregiverId: Map<string, FollowupDigestHtmlMailerBccEnvelope>;
  /** Silent / suppressed caregivers, forwarded from the base mailer. */
  silent: FollowupDigestHtmlMailerResult['silent'];
  /** BCC fan-out telemetry. */
  coverage: FollowupDigestHtmlMailerBccCoverage;
}

function bccForCaregiver(
  caregiverId: string,
  destinations: FollowupDigestHtmlMailerBccDestination[],
): string[] {
  // Preserve declared order; dedup is performed by the caller path
  // after appending the primary address.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dest of destinations) {
    if (
      dest.excludeCaregiverIds &&
      dest.excludeCaregiverIds.includes(caregiverId)
    ) {
      continue;
    }
    if (
      dest.forCaregiverIds &&
      !dest.forCaregiverIds.includes(caregiverId)
    ) {
      continue;
    }
    if (seen.has(dest.address)) continue;
    seen.add(dest.address);
    out.push(dest.address);
  }
  return out;
}

/**
 * Build BCC-aware envelopes from a cron batch.
 *
 * Steps:
 *   1. Build the base envelopes via
 *      buildFollowupDigestHtmlMailerEnvelopes.
 *   2. For each envelope, resolve the BCC list from the per-
 *      caregiver scope rules. Drop the primary `to` address from
 *      the BCC array when dropPrimaryFromBcc is true (default).
 *   3. Roll up fan-out telemetry.
 *
 * Pure / deterministic.
 */
export function buildFollowupDigestHtmlMailerEnvelopesWithBcc(
  batch: FollowupDigestCronBatcherResult,
  options: FollowupDigestHtmlMailerBccOptions = {},
): FollowupDigestHtmlMailerBccResult {
  const base = buildFollowupDigestHtmlMailerEnvelopes(batch, options);
  const destinations = options.bccDestinations ?? [];
  const dropPrimaryFromBcc = options.dropPrimaryFromBcc ?? true;
  const fanOutByAddress = new Map<string, number>();
  const primaryDroppedFromBcc: string[] = [];

  const envelopes: FollowupDigestHtmlMailerBccEnvelope[] = base.envelopes.map(
    (env) => {
      let bcc = bccForCaregiver(env.caregiverId, destinations);
      if (dropPrimaryFromBcc && env.to !== undefined) {
        const primary = env.to;
        const before = bcc.length;
        bcc = bcc.filter((addr) => addr !== primary);
        if (bcc.length < before) {
          primaryDroppedFromBcc.push(env.caregiverId);
        }
      }
      for (const addr of bcc) {
        fanOutByAddress.set(addr, (fanOutByAddress.get(addr) ?? 0) + 1);
      }
      return { ...env, bcc };
    },
  );

  const byCaregiverId = new Map<string, FollowupDigestHtmlMailerBccEnvelope>();
  for (const env of envelopes) byCaregiverId.set(env.caregiverId, env);

  return {
    envelopes,
    byCaregiverId,
    silent: base.silent,
    coverage: {
      envelopeCount: envelopes.length,
      bccEnvelopeCount: envelopes.filter((e) => e.bcc.length > 0).length,
      fanOutByAddress,
      primaryDroppedFromBcc,
    },
  };
}

/**
 * Convenience: filter the BCC-aware result to envelopes that have at
 * least one recipient (either a primary `to` OR at least one BCC).
 * Envelopes with neither are unmailable and would normally be
 * dropped by the SMTP layer; this helper surfaces them up front.
 */
export function filterEnvelopesWithAnyRecipient(
  result: FollowupDigestHtmlMailerBccResult,
): FollowupDigestHtmlMailerBccEnvelope[] {
  return result.envelopes.filter(
    (e) => (typeof e.to === 'string' && e.to.length > 0) || e.bcc.length > 0,
  );
}

/**
 * Convenience: a one-line cron-log summary for the BCC fan-out.
 *
 *   "BCC fan-out: 4/6 envelopes had at least one BCC; 8 BCC
 *    recipients total across 2 distinct addresses."
 */
export function summarizeBccFanOut(
  result: FollowupDigestHtmlMailerBccResult,
): string {
  const c = result.coverage;
  let total = 0;
  for (const count of c.fanOutByAddress.values()) total += count;
  return (
    `BCC fan-out: ${c.bccEnvelopeCount}/${c.envelopeCount} envelopes had ` +
    `at least one BCC; ${total} BCC ${total === 1 ? 'recipient' : 'recipients'} ` +
    `total across ${c.fanOutByAddress.size} distinct ${c.fanOutByAddress.size === 1 ? 'address' : 'addresses'}.`
  );
}

/**
 * Convenience: collect ALL BCC addresses across the result into a
 * single deduped sorted list — useful when the SMTP layer needs to
 * pre-warm a relay's known-sender list before dispatch.
 */
export function collectAllBccAddresses(
  result: FollowupDigestHtmlMailerBccResult,
): string[] {
  return [...result.coverage.fanOutByAddress.keys()].sort();
}
