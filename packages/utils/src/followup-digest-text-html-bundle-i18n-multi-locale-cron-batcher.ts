/**
 * Follow-up digest text + HTML bundle i18n multi-locale — cron batcher.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale` builds one
 * patient's digest in N locales. The weekly cron job that ships
 * digests for an entire caregiver panel has a wider need:
 *
 *   - the cron walks M PATIENTS;
 *   - each patient has K caregivers attached;
 *   - each caregiver has a preferred locale;
 *   - each caregiver should receive ONE consolidated mailer payload
 *     containing the digests for ALL patients they watch — not K
 *     separate emails per caregiver (inbox spam) and not 1 email
 *     per patient (loses the household roll-up).
 *
 * This module is the cron-friendly batcher: feed it the M-patient,
 * K-caregiver matrix and it returns a per-caregiver bundle of
 * (patient, locale-rendered digest) pairs. Silent weeks short-
 * circuit at the patient level (null digest -> patient is dropped
 * from a caregiver's list); a caregiver whose every patient was
 * silent yields a SILENT bundle the mailer can suppress.
 *
 * Composes:
 *   - buildMultiLocaleFollowupDigest for the per-patient i18n math
 *   - per-caregiver locale resolution + dedup
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupDigestInput,
} from './followup-overdue-digest';
import type {
  FollowupDigestBundle,
  FollowupDigestBundleOptions,
} from './followup-digest-text-html-bundle';
import type {
  FollowupDigestI18nBundle,
} from './followup-digest-text-html-bundle-i18n';
import { buildMultiLocaleFollowupDigest } from './followup-digest-text-html-bundle-i18n-multi-locale';

/** A single patient slice fed to the cron batcher. */
export interface FollowupDigestCronBatcherPatient {
  /** Stable patient id used for grouping / telemetry. */
  patientId: string;
  /** Digest input for this patient (week range, report, portal URL). */
  input: FollowupDigestInput;
  /** Per-patient option override (cap on overdue / due-soon / upcoming, etc). */
  options?: FollowupDigestBundleOptions;
}

/** A single caregiver who watches one or more patients. */
export interface FollowupDigestCronBatcherCaregiver {
  /** Stable caregiver id (unique key for output map). */
  caregiverId: string;
  /** Display name surfaced in the per-bundle entry for the mailer. */
  caregiverName: string;
  /** Preferred locale id. Falls back to en-US if no matching bundle is registered. */
  locale: string;
  /** Patients this caregiver watches. Empty array yields a silent bundle. */
  patientIds: string[];
  /** Caregiver email or destination (opaque to the batcher — passed through). */
  destination?: string;
}

export interface FollowupDigestCronBatcherOptions {
  /** Locale bundles registered for this cron run. Indexed by locale id inside. */
  localeBundles: FollowupDigestI18nBundle[];
  /**
   * When a caregiver's locale is not in localeBundles, what do we do?
   * - 'fallback-en' (default): render in en-US baseline.
   * - 'skip': drop the caregiver from the output.
   * - 'error': throw — for strict configurations.
   */
  unknownLocalePolicy?: 'fallback-en' | 'skip' | 'error';
}

export interface FollowupDigestCronBatcherEntryPatient {
  /** Patient id this digest row is for. */
  patientId: string;
  /** Rendered bundle in the caregiver's locale. */
  bundle: FollowupDigestBundle;
}

export interface FollowupDigestCronBatcherEntry {
  caregiverId: string;
  caregiverName: string;
  destination?: string;
  /** Locale actually used (post-fallback resolution). */
  locale: string;
  /**
   * Per-patient rendered digests for this caregiver. Patients with
   * silent weeks are dropped — only patients with actionable items
   * land here.
   */
  patients: FollowupDigestCronBatcherEntryPatient[];
}

export interface FollowupDigestCronBatcherCoverage {
  /** Total caregivers passed to the batcher. */
  caregiverCount: number;
  /** Caregivers with at least one non-silent patient (deliverable bundles). */
  deliverableCount: number;
  /** Caregivers with no actionable patients (silent week — suppress). */
  silentCaregiverIds: string[];
  /** Caregivers skipped because of unknown-locale + 'skip' policy. */
  skippedCaregiverIds: string[];
  /** Locale id -> count of caregivers using that locale (post-resolution). */
  localeUsage: Map<string, number>;
}

export interface FollowupDigestCronBatcherResult {
  /** Per-caregiver entry list, input order. */
  entries: FollowupDigestCronBatcherEntry[];
  /** Map keyed on caregiverId for direct lookup. */
  byCaregiverId: Map<string, FollowupDigestCronBatcherEntry>;
  /** Telemetry rollup. */
  coverage: FollowupDigestCronBatcherCoverage;
}

const EN_BASELINE_BUNDLE: FollowupDigestI18nBundle = {
  locale: 'en-US',
  strings: {},
};

/**
 * Build a single cron-run worth of caregiver mailer bundles.
 *
 * Steps:
 *   1. Build per-patient multi-locale digests ONCE per patient (the
 *      underlying digest construction is the expensive part — we
 *      pay for it M times, not M*K).
 *   2. For each caregiver, gather the locale-rendered digest for each
 *      of their watched patients. Drop silent weeks.
 *   3. Emit one entry per caregiver (or skip them per the unknown-locale
 *      policy).
 *
 * Returns a deterministic, byte-stable result given byte-stable inputs.
 */
export function buildFollowupDigestCronBatch(
  patients: FollowupDigestCronBatcherPatient[],
  caregivers: FollowupDigestCronBatcherCaregiver[],
  options: FollowupDigestCronBatcherOptions,
): FollowupDigestCronBatcherResult {
  const unknownLocalePolicy = options.unknownLocalePolicy ?? 'fallback-en';

  // Collect the set of locales any caregiver actually requests, so
  // we don't pay i18n cost for locales nobody asked for.
  const requestedLocales = new Set<string>();
  for (const cg of caregivers) requestedLocales.add(cg.locale);
  // Always include en-US so the baseline-fallback path is cheap.
  requestedLocales.add('en-US');

  const knownLocales = new Set(options.localeBundles.map((b) => b.locale));
  const bundlesForBuilder: FollowupDigestI18nBundle[] = [];
  for (const locale of requestedLocales) {
    const found = options.localeBundles.find((b) => b.locale === locale);
    if (found) {
      bundlesForBuilder.push(found);
    } else if (locale === 'en-US') {
      bundlesForBuilder.push(EN_BASELINE_BUNDLE);
    }
    // Unknown non-en-US locales: don't include — the caregiver's
    // fallback / skip / error handling kicks in below.
  }

  // Per-patient digest cache. Null entry means silent week.
  const perPatientDigest = new Map<
    string,
    Map<string, FollowupDigestBundle> | null
  >();
  for (const p of patients) {
    const ml = buildMultiLocaleFollowupDigest(p.input, bundlesForBuilder, p.options ?? {});
    if (ml === null) {
      perPatientDigest.set(p.patientId, null);
    } else {
      perPatientDigest.set(p.patientId, ml.byLocale);
    }
  }

  const entries: FollowupDigestCronBatcherEntry[] = [];
  const byCaregiverId = new Map<string, FollowupDigestCronBatcherEntry>();
  const silentCaregiverIds: string[] = [];
  const skippedCaregiverIds: string[] = [];
  const localeUsage = new Map<string, number>();

  for (const cg of caregivers) {
    let effectiveLocale = cg.locale;
    if (!knownLocales.has(cg.locale)) {
      if (unknownLocalePolicy === 'skip') {
        skippedCaregiverIds.push(cg.caregiverId);
        continue;
      }
      if (unknownLocalePolicy === 'error') {
        throw new Error(
          `Caregiver ${cg.caregiverId} requested locale ${cg.locale} which is not registered.`,
        );
      }
      // 'fallback-en'
      effectiveLocale = 'en-US';
    }

    const cgPatients: FollowupDigestCronBatcherEntryPatient[] = [];
    for (const patientId of cg.patientIds) {
      const byLocale = perPatientDigest.get(patientId);
      if (!byLocale) continue; // silent week, or unknown patient id
      // Prefer the requested locale; fall back to en-US if the
      // multi-locale builder didn't render it (defensive — under
      // unknown-locale policy=fallback-en the bundlesForBuilder
      // already collapsed to en).
      const bundle = byLocale.get(effectiveLocale) ?? byLocale.get('en-US');
      if (!bundle) continue;
      cgPatients.push({ patientId, bundle });
    }

    if (cgPatients.length === 0) {
      silentCaregiverIds.push(cg.caregiverId);
      continue;
    }

    const entry: FollowupDigestCronBatcherEntry = {
      caregiverId: cg.caregiverId,
      caregiverName: cg.caregiverName,
      destination: cg.destination,
      locale: effectiveLocale,
      patients: cgPatients,
    };
    entries.push(entry);
    byCaregiverId.set(cg.caregiverId, entry);
    localeUsage.set(effectiveLocale, (localeUsage.get(effectiveLocale) ?? 0) + 1);
  }

  return {
    entries,
    byCaregiverId,
    coverage: {
      caregiverCount: caregivers.length,
      deliverableCount: entries.length,
      silentCaregiverIds,
      skippedCaregiverIds,
      localeUsage,
    },
  };
}

/**
 * Convenience: build a one-line summary of the cron batch run for
 * the cron log.
 *
 *   "Cron followup digest: 4/7 deliverable, 2 silent, 1 skipped
 *    (locales used: en-US x 2, es-419 x 2)."
 */
export function summarizeFollowupDigestCronBatch(
  result: FollowupDigestCronBatcherResult,
): string {
  const c = result.coverage;
  const localeEntries = [...c.localeUsage.entries()].sort((a, b) => b[1] - a[1]);
  const localesPart =
    localeEntries.length === 0
      ? 'no locales'
      : localeEntries.map(([loc, n]) => `${loc} x ${n}`).join(', ');
  return (
    `Cron followup digest: ${c.deliverableCount}/${c.caregiverCount} deliverable, ` +
    `${c.silentCaregiverIds.length} silent, ${c.skippedCaregiverIds.length} skipped ` +
    `(locales used: ${localesPart}).`
  );
}

/**
 * Convenience: filter the result to only caregivers for a given
 * locale id. Useful for the locale-by-locale fanout some mailer
 * pipelines prefer (so each locale group ships through its own
 * SMTP relay / template engine).
 */
export function filterCronBatchByLocale(
  result: FollowupDigestCronBatcherResult,
  locale: string,
): FollowupDigestCronBatcherEntry[] {
  return result.entries.filter((e) => e.locale === locale);
}
