/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC — TIER-AWARE policy.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc`
 * applies a single global BCC list to every envelope, with per-
 * caregiver scope rules. In practice clinical-records on-call
 * doesn't want every digest BCC'd to the PCP and the escalation
 * contact:
 *
 *   - the household admin (an adult child) wants to see EVERY
 *     digest (routine + actionable) — they are the family-side
 *     accountability point;
 *   - the PCP only wants to see ACTIONABLE digests (real overdue
 *     follow-ups, real refusal trends) — they don't want a
 *     weekly "everything is fine" ping;
 *   - the family escalation contact (a relative living far away)
 *     only wants to see CRITICAL digests (something is wrong;
 *     the family needs to act) — they get the rare 911-level ping.
 *
 * This module is the tier-aware overlay. It composes
 * buildFollowupDigestHtmlMailerEnvelopesWithBcc and adds:
 *
 *   - per-DESTINATION tier filters: each BCC destination can
 *     declare `tiers: ['routine', 'actionable', 'critical']` and
 *     only be included when the envelope's tier matches;
 *   - per-ENVELOPE tier classification: a default classifier
 *     (no actionable items -> 'routine'; has actionable items ->
 *     'actionable'; has actionable items AND any urgency==='overdue'
 *     -> 'critical'); overridable per envelope by passing a
 *     classifier function;
 *   - per-envelope tier mirrored into the result so the SMTP
 *     layer can log "envelope X went routine -> only admin BCC'd".
 *
 * Tier classification rules:
 *
 *   - 'routine'    -> caregiverEnvelope has no actionable items
 *                     (textBody contains "no follow-ups requiring attention").
 *   - 'actionable' -> at least one actionable item but no overdue.
 *   - 'critical'   -> at least one actionable item AND at least one
 *                     marked 'overdue' in the underlying digest.
 *
 * (The exact source data isn't visible inside the envelope — the
 * envelope has subject + text + html, no raw digest. The default
 * classifier inspects text + subject for the canonical phrases
 * the upstream builder emits. Callers wanting precise classification
 * pass a classifier that looks at the digest directly.)
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - buildFollowupDigestHtmlMailerEnvelopesWithBcc
 */

import type {
  FollowupDigestHtmlMailerBccDestination,
  FollowupDigestHtmlMailerBccEnvelope,
  FollowupDigestHtmlMailerBccOptions,
  FollowupDigestHtmlMailerBccResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
import { buildFollowupDigestHtmlMailerEnvelopesWithBcc } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
import type { FollowupDigestCronBatcherResult } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';

export type FollowupDigestHtmlMailerBccTier =
  | 'routine'
  | 'actionable'
  | 'critical';

/**
 * Tier-aware BCC destination. Adds an `eligibleTiers` filter on top
 * of the basic BCC destination.
 */
export interface FollowupDigestHtmlMailerBccTierDestination
  extends FollowupDigestHtmlMailerBccDestination {
  /**
   * Tiers this destination is eligible for. Defaults to ALL tiers
   * (matching the unfiltered behaviour of the basic BCC module).
   */
  eligibleTiers?: FollowupDigestHtmlMailerBccTier[];
}

export type FollowupDigestHtmlMailerBccTierClassifier = (
  envelope: FollowupDigestHtmlMailerBccEnvelope,
) => FollowupDigestHtmlMailerBccTier;

export interface FollowupDigestHtmlMailerBccTierPolicyOptions
  extends Omit<FollowupDigestHtmlMailerBccOptions, 'bccDestinations'> {
  /**
   * Tier-aware BCC destinations.
   */
  bccDestinations?: FollowupDigestHtmlMailerBccTierDestination[];
  /**
   * Custom tier classifier. Defaults to the text/subject heuristic
   * documented above.
   */
  classifyTier?: FollowupDigestHtmlMailerBccTierClassifier;
}

export interface FollowupDigestHtmlMailerBccTieredEnvelope
  extends FollowupDigestHtmlMailerBccEnvelope {
  /** Classified tier for this envelope. */
  tier: FollowupDigestHtmlMailerBccTier;
}

export interface FollowupDigestHtmlMailerBccTierPolicyCoverage {
  envelopeCount: number;
  /** Counts per tier across all envelopes. */
  countsByTier: Record<FollowupDigestHtmlMailerBccTier, number>;
  /** BCC envelope count by tier (envelopes that ended up with at least one BCC). */
  bccEnvelopeCountByTier: Record<FollowupDigestHtmlMailerBccTier, number>;
  /**
   * Per-address fan-out count (rolled up across all tiers). Same
   * shape as the basic BCC coverage's fanOutByAddress.
   */
  fanOutByAddress: Map<string, number>;
  /**
   * Destinations that were declared in input but never matched ANY
   * envelope (because none of their eligible tiers came up). Useful
   * for noticing a misconfigured destination ("you set tier='critical'
   * but had zero critical digests").
   */
  unusedDestinations: string[];
}

export interface FollowupDigestHtmlMailerBccTierPolicyResult {
  envelopes: FollowupDigestHtmlMailerBccTieredEnvelope[];
  byCaregiverId: Map<string, FollowupDigestHtmlMailerBccTieredEnvelope>;
  silent: FollowupDigestHtmlMailerBccResult['silent'];
  coverage: FollowupDigestHtmlMailerBccTierPolicyCoverage;
}

/**
 * Default heuristic classifier. Inspects subject + textBody for
 * canonical phrases the upstream digest emits.
 *
 * Phrasing reference (matches the followup-digest text builder
 * conventions):
 *   - "No follow-ups requiring attention" -> routine
 *   - any "overdue"                       -> critical
 *   - everything else                     -> actionable
 *
 * Callers should override this if they want precise classification
 * from the underlying digest data.
 */
export function defaultClassifyFollowupDigestTier(
  envelope: FollowupDigestHtmlMailerBccEnvelope,
): FollowupDigestHtmlMailerBccTier {
  const blob = `${envelope.subject ?? ''} ${envelope.text ?? ''}`.toLowerCase();
  const overdue = /overdue/.test(blob);
  const noActionable = /no follow-ups requiring attention/.test(blob);
  if (overdue) return 'critical';
  if (noActionable) return 'routine';
  return 'actionable';
}

function destinationMatchesTier(
  dest: FollowupDigestHtmlMailerBccTierDestination,
  tier: FollowupDigestHtmlMailerBccTier,
): boolean {
  if (!dest.eligibleTiers || dest.eligibleTiers.length === 0) {
    return true;
  }
  return dest.eligibleTiers.includes(tier);
}

/**
 * Build tier-filtered BCC envelopes from a cron batch.
 *
 * Steps:
 *   1. Build the base BCC envelopes via
 *      buildFollowupDigestHtmlMailerEnvelopesWithBcc, passing
 *      EVERY destination (with no tier filter applied yet).
 *   2. Classify each envelope's tier.
 *   3. Re-filter each envelope's BCC list, dropping addresses whose
 *      tier doesn't match the envelope's tier.
 *   4. Re-build fan-out telemetry against the tier-filtered output.
 *
 * Pure / deterministic.
 */
export function buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(
  batch: FollowupDigestCronBatcherResult,
  options: FollowupDigestHtmlMailerBccTierPolicyOptions = {},
): FollowupDigestHtmlMailerBccTierPolicyResult {
  const destinations = options.bccDestinations ?? [];
  const classify = options.classifyTier ?? defaultClassifyFollowupDigestTier;

  // Step 1: build the base BCC envelopes (broadcast all destinations).
  // We pass through the SAME destinations (the basic BCC module
  // accepts the tier-aware destinations because eligibleTiers is an
  // unknown extra property in TS structural typing — but only the
  // basic fields are used downstream).
  const baseOptions: FollowupDigestHtmlMailerBccOptions = { ...options };
  baseOptions.bccDestinations = destinations.map((d) => {
    const out: FollowupDigestHtmlMailerBccDestination = { address: d.address };
    if (d.forCaregiverIds !== undefined) out.forCaregiverIds = d.forCaregiverIds;
    if (d.excludeCaregiverIds !== undefined) out.excludeCaregiverIds = d.excludeCaregiverIds;
    return out;
  });
  const base = buildFollowupDigestHtmlMailerEnvelopesWithBcc(batch, baseOptions);

  // Step 2 + 3: classify + tier-filter per envelope.
  const fanOutByAddress = new Map<string, number>();
  const usedAddresses = new Set<string>();
  const countsByTier: Record<FollowupDigestHtmlMailerBccTier, number> = {
    routine: 0,
    actionable: 0,
    critical: 0,
  };
  const bccEnvelopeCountByTier: Record<FollowupDigestHtmlMailerBccTier, number> = {
    routine: 0,
    actionable: 0,
    critical: 0,
  };

  const envelopes: FollowupDigestHtmlMailerBccTieredEnvelope[] = base.envelopes.map(
    (env) => {
      const tier = classify(env);
      countsByTier[tier] += 1;
      // For each address in env.bcc, look up its destination(s) and
      // keep only those whose tier matches. We allow an address to
      // appear in multiple destinations; if ANY matching destination
      // is eligible for this tier, we keep the address.
      const tierFiltered: string[] = [];
      const seen = new Set<string>();
      for (const addr of env.bcc) {
        if (seen.has(addr)) continue;
        const destsForThisAddr = destinations.filter((d) => d.address === addr);
        // Re-apply per-caregiver scope (matching the basic module).
        const eligibleHere = destsForThisAddr.find((d) => {
          if (d.excludeCaregiverIds?.includes(env.caregiverId)) return false;
          if (d.forCaregiverIds && !d.forCaregiverIds.includes(env.caregiverId)) return false;
          return destinationMatchesTier(d, tier);
        });
        if (eligibleHere !== undefined) {
          tierFiltered.push(addr);
          seen.add(addr);
          fanOutByAddress.set(addr, (fanOutByAddress.get(addr) ?? 0) + 1);
          usedAddresses.add(addr);
        }
      }
      if (tierFiltered.length > 0) {
        bccEnvelopeCountByTier[tier] += 1;
      }
      const tiered: FollowupDigestHtmlMailerBccTieredEnvelope = {
        ...env,
        bcc: tierFiltered,
        tier,
      };
      return tiered;
    },
  );

  const byCaregiverId = new Map<string, FollowupDigestHtmlMailerBccTieredEnvelope>();
  for (const env of envelopes) byCaregiverId.set(env.caregiverId, env);

  // Unused destinations: declared addresses that never matched any envelope.
  const declaredAddresses = new Set<string>();
  for (const d of destinations) declaredAddresses.add(d.address);
  const unusedDestinations = [...declaredAddresses]
    .filter((a) => !usedAddresses.has(a))
    .sort();

  return {
    envelopes,
    byCaregiverId,
    silent: base.silent,
    coverage: {
      envelopeCount: envelopes.length,
      countsByTier,
      bccEnvelopeCountByTier,
      fanOutByAddress,
      unusedDestinations,
    },
  };
}

/**
 * Convenience: filter the tier-policy result to envelopes of a
 * specific tier. For mailer pipelines that route envelopes by
 * severity to different queues (critical -> page on-call,
 * actionable -> standard queue, routine -> low-priority queue).
 */
export function filterEnvelopesByTier(
  result: FollowupDigestHtmlMailerBccTierPolicyResult,
  tier: FollowupDigestHtmlMailerBccTier,
): FollowupDigestHtmlMailerBccTieredEnvelope[] {
  return result.envelopes.filter((e) => e.tier === tier);
}

/**
 * Convenience: one-line cron-log summary for the tier policy.
 *
 *   "BCC tier policy: 6 envelopes (3 routine, 2 actionable, 1
 *    critical); 4/6 had at least one BCC; 1 unused destination."
 */
export function summarizeBccTierPolicy(
  result: FollowupDigestHtmlMailerBccTierPolicyResult,
): string {
  const c = result.coverage;
  const r = c.countsByTier.routine;
  const a = c.countsByTier.actionable;
  const k = c.countsByTier.critical;
  const totalBcc =
    c.bccEnvelopeCountByTier.routine +
    c.bccEnvelopeCountByTier.actionable +
    c.bccEnvelopeCountByTier.critical;
  const unused = c.unusedDestinations.length;
  const unusedPart = unused === 0
    ? 'no unused destinations'
    : `${unused} unused ${unused === 1 ? 'destination' : 'destinations'}`;
  return (
    `BCC tier policy: ${c.envelopeCount} ${c.envelopeCount === 1 ? 'envelope' : 'envelopes'} ` +
    `(${r} routine, ${a} actionable, ${k} critical); ` +
    `${totalBcc}/${c.envelopeCount} had at least one BCC; ${unusedPart}.`
  );
}

/**
 * Convenience: builds a typical three-tier policy quickly: PCP gets
 * actionable + critical; family-escalation gets critical only;
 * household-admin gets all three.
 */
export function buildPcpAdminEscalationTierDestinations(
  pcpAddress: string,
  householdAdminAddress: string,
  escalationAddress: string,
): FollowupDigestHtmlMailerBccTierDestination[] {
  return [
    { address: householdAdminAddress, eligibleTiers: ['routine', 'actionable', 'critical'] },
    { address: pcpAddress, eligibleTiers: ['actionable', 'critical'] },
    { address: escalationAddress, eligibleTiers: ['critical'] },
  ];
}
