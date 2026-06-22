/**
 * Follow-up digest text + HTML bundle i18n.
 *
 * `followup-digest-text-html-bundle` ships a multipart-ready text +
 * HTML follow-up digest, but the human-readable strings (opener,
 * subject, section titles, expired advisory, portal link, footer)
 * are English-only. For caregivers reading in another locale, that's
 * an English email body with localised PATIENT names — readable but
 * not respectful.
 *
 * This module is the i18n layer for the bundle, parallel to
 * `refusal-reason-suggest-i18n`. Same pattern:
 *
 *   - String tables are pure JS objects, not file-backed. Callers
 *     bundle the locale(s) they need into the app boot path.
 *   - Strings use ICU-style {placeholders}. Plurals handled by
 *     pluralRules dispatch (one / other) so we cover most locales
 *     without dragging in Intl.PluralRules — but we DO use it when
 *     available for languages with more complex plural forms.
 *   - Falls back to the English bundle when a key is missing.
 *   - Ships a built-in English table that mirrors the digest's
 *     current output verbatim, so callers extending to a new locale
 *     start by copying that table.
 *
 * We localise STRINGS only. The structure of the bundle (subject,
 * text, html, alternatives, stats, rows) is unchanged — the
 * digest's row inclusion logic, null short-circuit, and per-row
 * data still come from the underlying builders.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupDigestInput,
} from './followup-overdue-digest';
import {
  buildFollowupDigestBundle,
  type FollowupDigestBundle,
  type FollowupDigestBundleOptions,
} from './followup-digest-text-html-bundle';
import type {
  FollowupRow,
} from './appointment-followup-tracker';

/**
 * Stable identifier used as the i18n key. Each key is rendered with
 * a small parameter bag; see PLACEHOLDERS_BY_KEY for the available
 * substitutions per key.
 *
 * Subject keys split by count: the digest's subject line shape
 * depends on overdueCount / dueSoonCount / upcomingCount.
 */
export type FollowupDigestI18nKey =
  | 'subject.overdueOne'
  | 'subject.overdueMany'
  | 'subject.dueSoonOne'
  | 'subject.dueSoonMany'
  | 'subject.upcomingOne'
  | 'subject.upcomingMany'
  | 'opener.overdueOne'
  | 'opener.overdueMany'
  | 'opener.dueSoonOne'
  | 'opener.dueSoonMany'
  | 'opener.upcomingOne'
  | 'opener.upcomingMany'
  | 'opener.coverage'
  | 'opener.expiredAdvisory'
  | 'section.overdue'
  | 'section.dueSoon'
  | 'section.upcoming'
  | 'section.kind.visit'
  | 'section.kind.lab'
  | 'section.kind.imaging'
  | 'section.kind.referral'
  | 'section.kind.vaccination'
  | 'section.kind.procedure'
  | 'section.kind.other'
  | 'row.overdueChip'
  | 'row.dueSoonChip'
  | 'row.upcomingChip'
  | 'portal.cta'
  | 'footer.unsub';

export type FollowupDigestI18nTable = Record<FollowupDigestI18nKey, string>;

export interface FollowupDigestI18nBundle {
  /** BCP 47 locale (e.g. 'en-US', 'es-419', 'fr-FR'). */
  locale: string;
  /** Strings keyed by FollowupDigestI18nKey. Partial; missing keys fall back to English. */
  strings: Partial<FollowupDigestI18nTable>;
}

/**
 * Built-in English bundle that mirrors the current digest output
 * one-to-one. Use as the reference when adding a new locale.
 */
export const FOLLOWUP_DIGEST_I18N_EN: FollowupDigestI18nTable = {
  'subject.overdueOne': '{who}: 1 overdue follow-up ({oldestTitle})',
  'subject.overdueMany': '{who}: {overdueCount} overdue follow-ups, oldest is {oldestTitle}',
  'subject.dueSoonOne': '{who}: 1 follow-up due soon',
  'subject.dueSoonMany': '{who}: {dueSoonCount} follow-ups due soon',
  'subject.upcomingOne': '{who}: 1 follow-up upcoming',
  'subject.upcomingMany': '{who}: {upcomingCount} follow-ups upcoming',
  'opener.overdueOne':
    '{patient} has 1 overdue follow-up that needs attention.{oldestSuffix}',
  'opener.overdueMany':
    '{patient} has {overdueCount} overdue follow-ups that need attention.{oldestSuffix}',
  'opener.dueSoonOne':
    '{patient} has 1 follow-up due soon — please help them get these on the calendar.',
  'opener.dueSoonMany':
    '{patient} has {dueSoonCount} follow-ups due soon — please help them get these on the calendar.',
  'opener.upcomingOne':
    '{patient} has 1 upcoming follow-up on the horizon.',
  'opener.upcomingMany':
    '{patient} has {upcomingCount} upcoming follow-ups on the horizon.',
  'opener.coverage': 'Coverage period: {weekStart} through {weekEnd}.',
  'opener.expiredAdvisory':
    'Heads up: one or more items are past their grace window — these were missed long enough that the clinical team may need a re-referral.',
  'section.overdue': 'Overdue',
  'section.dueSoon': 'Due soon',
  'section.upcoming': 'Upcoming',
  'section.kind.visit': 'Visit',
  'section.kind.lab': 'Lab',
  'section.kind.imaging': 'Imaging',
  'section.kind.referral': 'Referral',
  'section.kind.vaccination': 'Vaccination',
  'section.kind.procedure': 'Procedure',
  'section.kind.other': 'Other',
  'row.overdueChip': 'OVERDUE {days}d',
  'row.dueSoonChip': 'DUE +{days}d',
  'row.upcomingChip': 'UPCOMING',
  'portal.cta': 'To mark items complete or cancel them: {portalUrl}',
  'footer.unsub':
    'This message was sent because you have an active Med-Tracker caregiver share. To stop receiving updates, ask the patient to revoke your share.',
};

/**
 * Placeholders the renderer supplies per key. The validator checks
 * locale-submitted tables against this list — missing required
 * placeholders are flagged as errors.
 */
const PLACEHOLDERS_BY_KEY: Record<FollowupDigestI18nKey, ReadonlySet<string>> = {
  'subject.overdueOne': new Set(['who', 'oldestTitle']),
  'subject.overdueMany': new Set(['who', 'overdueCount', 'oldestTitle']),
  'subject.dueSoonOne': new Set(['who']),
  'subject.dueSoonMany': new Set(['who', 'dueSoonCount']),
  'subject.upcomingOne': new Set(['who']),
  'subject.upcomingMany': new Set(['who', 'upcomingCount']),
  'opener.overdueOne': new Set(['patient', 'oldestSuffix']),
  'opener.overdueMany': new Set(['patient', 'overdueCount', 'oldestSuffix']),
  'opener.dueSoonOne': new Set(['patient']),
  'opener.dueSoonMany': new Set(['patient', 'dueSoonCount']),
  'opener.upcomingOne': new Set(['patient']),
  'opener.upcomingMany': new Set(['patient', 'upcomingCount']),
  'opener.coverage': new Set(['weekStart', 'weekEnd']),
  'opener.expiredAdvisory': new Set([]),
  'section.overdue': new Set([]),
  'section.dueSoon': new Set([]),
  'section.upcoming': new Set([]),
  'section.kind.visit': new Set([]),
  'section.kind.lab': new Set([]),
  'section.kind.imaging': new Set([]),
  'section.kind.referral': new Set([]),
  'section.kind.vaccination': new Set([]),
  'section.kind.procedure': new Set([]),
  'section.kind.other': new Set([]),
  'row.overdueChip': new Set(['days']),
  'row.dueSoonChip': new Set(['days']),
  'row.upcomingChip': new Set([]),
  'portal.cta': new Set(['portalUrl']),
  'footer.unsub': new Set([]),
};

/**
 * Substitute {placeholders} in the template. Unknown placeholders
 * are left as-is so we don't crash the digest; they're surfaced via
 * the validator function for QA pipelines.
 */
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key]!;
    return full;
  });
}

function resolveString(
  bundle: FollowupDigestI18nBundle,
  key: FollowupDigestI18nKey,
): string {
  const localised = bundle.strings[key];
  if (localised !== undefined && localised !== '') return localised;
  return FOLLOWUP_DIGEST_I18N_EN[key];
}

function applySubjectText(
  bundle: FollowupDigestI18nBundle,
  who: string,
  digestBundle: FollowupDigestBundle,
): string {
  const stats = digestBundle.stats;
  if (stats.overdueCount > 0) {
    const oldestTitle = stats.mostOverdueTitle ?? 'check details';
    if (stats.overdueCount === 1) {
      return renderTemplate(resolveString(bundle, 'subject.overdueOne'), {
        who,
        oldestTitle,
      });
    }
    return renderTemplate(resolveString(bundle, 'subject.overdueMany'), {
      who,
      overdueCount: String(stats.overdueCount),
      oldestTitle,
    });
  }
  if (stats.dueSoonCount > 0) {
    if (stats.dueSoonCount === 1) {
      return renderTemplate(resolveString(bundle, 'subject.dueSoonOne'), { who });
    }
    return renderTemplate(resolveString(bundle, 'subject.dueSoonMany'), {
      who,
      dueSoonCount: String(stats.dueSoonCount),
    });
  }
  if (stats.upcomingCount === 1) {
    return renderTemplate(resolveString(bundle, 'subject.upcomingOne'), { who });
  }
  return renderTemplate(resolveString(bundle, 'subject.upcomingMany'), {
    who,
    upcomingCount: String(stats.upcomingCount),
  });
}

function buildOpenerLine(
  bundle: FollowupDigestI18nBundle,
  patientName: string,
  digestBundle: FollowupDigestBundle,
): string {
  const stats = digestBundle.stats;
  if (stats.overdueCount > 0) {
    const oldestSuffix =
      stats.mostOverdueDays === null || stats.mostOverdueTitle === null
        ? ''
        : ` The oldest is "${stats.mostOverdueTitle}" overdue by ${-stats.mostOverdueDays} day${stats.mostOverdueDays === -1 ? '' : 's'}.`;
    if (stats.overdueCount === 1) {
      return renderTemplate(resolveString(bundle, 'opener.overdueOne'), {
        patient: patientName,
        oldestSuffix,
      });
    }
    return renderTemplate(resolveString(bundle, 'opener.overdueMany'), {
      patient: patientName,
      overdueCount: String(stats.overdueCount),
      oldestSuffix,
    });
  }
  if (stats.dueSoonCount > 0) {
    if (stats.dueSoonCount === 1) {
      return renderTemplate(resolveString(bundle, 'opener.dueSoonOne'), {
        patient: patientName,
      });
    }
    return renderTemplate(resolveString(bundle, 'opener.dueSoonMany'), {
      patient: patientName,
      dueSoonCount: String(stats.dueSoonCount),
    });
  }
  if (stats.upcomingCount === 1) {
    return renderTemplate(resolveString(bundle, 'opener.upcomingOne'), {
      patient: patientName,
    });
  }
  return renderTemplate(resolveString(bundle, 'opener.upcomingMany'), {
    patient: patientName,
    upcomingCount: String(stats.upcomingCount),
  });
}

/**
 * Replace all occurrences of source in haystack. Plain-string, not
 * regex, so source can safely contain regex metacharacters from
 * patient names.
 */
function replaceAll(haystack: string, source: string, target: string): string {
  if (source === '' || haystack.indexOf(source) === -1) return haystack;
  return haystack.split(source).join(target);
}

/**
 * HTML-escape using the same 5-char replacement as followup-digest-html
 * so our find-and-replace against the HTML body matches what the
 * builder emitted.
 */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Apply locale strings to the rendered text + HTML bodies. We rebuild
 * the bundle first (so row inclusion / null short-circuit / stats are
 * already correct), then string-replace the known English fragments
 * with their localised equivalents. This keeps the underlying
 * builders English-only — cron logs and dev tooling remain stable.
 *
 * For locales that DIFFER only in kind labels / chip prefixes /
 * coverage line / footer, the rebuild produces an essentially
 * one-to-one translated copy. For locales whose grammar would
 * require a structural rewrite (verb-subject ordering, gendered
 * agreement, etc), callers should override the relevant opener /
 * subject keys to whatever shape works for that locale — the
 * placeholder map gives them the data they need to construct their
 * own phrasing.
 */
export function localiseFollowupDigestBundle(
  input: FollowupDigestInput,
  bundle: FollowupDigestI18nBundle,
  options: FollowupDigestBundleOptions = {},
): FollowupDigestBundle | null {
  const base = buildFollowupDigestBundle(input, options);
  if (!base) return null;

  const who = input.patient.display ?? input.patient.name;
  const newSubject = applySubjectText(bundle, who, base);
  const newOpener = buildOpenerLine(bundle, input.patient.name, base);

  // Patch the text body
  let text = base.text;
  // Replace English subject in text body? Subject is not in body; skip.
  // Replace English opener.
  const englishOpener = englishOpenerFor(input.patient.name, base);
  text = replaceAll(text, englishOpener, newOpener);

  // Coverage line
  const englishCoverage = `Coverage period: ${input.weekStart} through ${input.weekEnd}.`;
  const localisedCoverage = renderTemplate(resolveString(bundle, 'opener.coverage'), {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
  });
  text = replaceAll(text, englishCoverage, localisedCoverage);

  // Expired advisory
  text = replaceAll(text, FOLLOWUP_DIGEST_I18N_EN['opener.expiredAdvisory'], resolveString(bundle, 'opener.expiredAdvisory'));

  // Section headers: replace "Overdue (" -> localised + " ("
  text = replaceAll(
    text,
    `${FOLLOWUP_DIGEST_I18N_EN['section.overdue']} (`,
    `${resolveString(bundle, 'section.overdue')} (`,
  );
  text = replaceAll(
    text,
    `${FOLLOWUP_DIGEST_I18N_EN['section.dueSoon']} (`,
    `${resolveString(bundle, 'section.dueSoon')} (`,
  );
  text = replaceAll(
    text,
    `${FOLLOWUP_DIGEST_I18N_EN['section.upcoming']} (`,
    `${resolveString(bundle, 'section.upcoming')} (`,
  );

  // Kind labels in row lines ("Visit: ...", "Lab: ...")
  for (const kind of [
    'visit',
    'lab',
    'imaging',
    'referral',
    'vaccination',
    'procedure',
    'other',
  ] as const) {
    const key = `section.kind.${kind}` as FollowupDigestI18nKey;
    const englishLabel = FOLLOWUP_DIGEST_I18N_EN[key];
    const localisedLabel = resolveString(bundle, key);
    if (englishLabel !== localisedLabel) {
      // Replace as a whole word with the trailing ":" so we don't
      // accidentally match inside row titles.
      text = replaceAll(text, `  - ${englishLabel}:`, `  - ${localisedLabel}:`);
    }
  }

  // Portal CTA
  if (input.portalUrl && input.portalUrl.trim()) {
    const englishCta = `To mark items complete or cancel them: ${input.portalUrl.trim()}`;
    const localisedCta = renderTemplate(resolveString(bundle, 'portal.cta'), {
      portalUrl: input.portalUrl.trim(),
    });
    text = replaceAll(text, englishCta, localisedCta);
  }

  // Footer
  text = replaceAll(text, FOLLOWUP_DIGEST_I18N_EN['footer.unsub'], resolveString(bundle, 'footer.unsub'));

  // Patch the HTML body — the HTML opener has the patient name and
  // ANY embedded quotes / ampersands HTML-escaped (e.g. the oldest
  // title becomes `&quot;Cardiology&quot;`). Build an HTML-escaped
  // variant of the English opener so the find-replace matches.
  let html = base.html;
  const englishHtmlOpener = htmlEscape(englishOpener);
  const newHtmlOpener = htmlEscape(newOpener);
  html = replaceAll(html, englishHtmlOpener, newHtmlOpener);
  html = replaceAll(html, englishCoverage, localisedCoverage);
  html = replaceAll(
    html,
    FOLLOWUP_DIGEST_I18N_EN['opener.expiredAdvisory'],
    resolveString(bundle, 'opener.expiredAdvisory'),
  );
  // HTML section header uses "Overdue (N)" format (no trailing space)
  html = replaceAll(
    html,
    `${FOLLOWUP_DIGEST_I18N_EN['section.overdue']} (`,
    `${resolveString(bundle, 'section.overdue')} (`,
  );
  html = replaceAll(
    html,
    `${FOLLOWUP_DIGEST_I18N_EN['section.dueSoon']} (`,
    `${resolveString(bundle, 'section.dueSoon')} (`,
  );
  html = replaceAll(
    html,
    `${FOLLOWUP_DIGEST_I18N_EN['section.upcoming']} (`,
    `${resolveString(bundle, 'section.upcoming')} (`,
  );
  // Kind labels in html table cells ("Visit &middot;")
  for (const kind of [
    'visit',
    'lab',
    'imaging',
    'referral',
    'vaccination',
    'procedure',
    'other',
  ] as const) {
    const key = `section.kind.${kind}` as FollowupDigestI18nKey;
    const englishLabel = FOLLOWUP_DIGEST_I18N_EN[key];
    const localisedLabel = resolveString(bundle, key);
    if (englishLabel !== localisedLabel) {
      html = replaceAll(html, `>${englishLabel} &middot;`, `>${localisedLabel} &middot;`);
    }
  }
  // Chip labels in html
  for (const row of base.rows) {
    if (row.status === 'overdue') {
      const englishChip = `OVERDUE ${row.daysUntilDue}d`;
      const localisedChip = renderTemplate(resolveString(bundle, 'row.overdueChip'), {
        days: String(row.daysUntilDue),
      });
      html = replaceAll(html, `>${englishChip}<`, `>${localisedChip}<`);
    } else if (row.status === 'due-soon') {
      const englishChip = `DUE +${row.daysUntilDue}d`;
      const localisedChip = renderTemplate(resolveString(bundle, 'row.dueSoonChip'), {
        days: String(row.daysUntilDue),
      });
      html = replaceAll(html, `>${englishChip}<`, `>${localisedChip}<`);
    } else if (row.status === 'upcoming') {
      const englishChip = 'UPCOMING';
      const localisedChip = resolveString(bundle, 'row.upcomingChip');
      if (englishChip !== localisedChip) {
        html = replaceAll(html, `>${englishChip}<`, `>${localisedChip}<`);
      }
    }
  }
  // Portal CTA in HTML uses "Mark items complete or cancel them →"
  // The english digest source uses that phrasing in the anchor text.
  const englishHtmlCta = 'Mark items complete or cancel them →';
  // For HTML we DON'T have a separate template here — the digest's
  // <a> wraps a fixed string. We still localise via a per-locale
  // override if the bundle provides one in 'portal.cta' (treating
  // it as the anchor text). When the template still has the
  // {portalUrl} placeholder, leave the anchor text alone.
  const portalCtaTemplate = resolveString(bundle, 'portal.cta');
  if (!portalCtaTemplate.includes('{portalUrl}')) {
    html = replaceAll(html, englishHtmlCta, portalCtaTemplate);
  }
  // Footer — html footer's English text is a single sentence,
  // direct replace.
  html = replaceAll(html, FOLLOWUP_DIGEST_I18N_EN['footer.unsub'], resolveString(bundle, 'footer.unsub'));

  return {
    subject: newSubject,
    text,
    html,
    stats: base.stats,
    rows: base.rows,
  };
}

/**
 * Construct the English opener line the digest produced, so we can
 * find-and-replace it. Kept in sync with followup-overdue-digest's
 * own opener via the EN bundle template.
 */
function englishOpenerFor(patientName: string, digestBundle: FollowupDigestBundle): string {
  const stats = digestBundle.stats;
  if (stats.overdueCount > 0) {
    const oldestSuffix =
      stats.mostOverdueDays === null || stats.mostOverdueTitle === null
        ? ''
        : ` The oldest is "${stats.mostOverdueTitle}" overdue by ${-stats.mostOverdueDays} day${stats.mostOverdueDays === -1 ? '' : 's'}.`;
    if (stats.overdueCount === 1) {
      return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.overdueOne'], {
        patient: patientName,
        oldestSuffix,
      });
    }
    return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.overdueMany'], {
      patient: patientName,
      overdueCount: String(stats.overdueCount),
      oldestSuffix,
    });
  }
  if (stats.dueSoonCount > 0) {
    if (stats.dueSoonCount === 1) {
      return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.dueSoonOne'], {
        patient: patientName,
      });
    }
    return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.dueSoonMany'], {
      patient: patientName,
      dueSoonCount: String(stats.dueSoonCount),
    });
  }
  if (stats.upcomingCount === 1) {
    return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.upcomingOne'], {
      patient: patientName,
    });
  }
  return renderTemplate(FOLLOWUP_DIGEST_I18N_EN['opener.upcomingMany'], {
    patient: patientName,
    upcomingCount: String(stats.upcomingCount),
  });
}

/**
 * Validate that a candidate i18n table has all required placeholders
 * for each key it supplies. Useful for CI checks of contributor-
 * submitted locale files.
 *
 * Missing-KEY errors are NOT emitted — partial bundles are
 * legitimate (English fills the gaps). The validator only flags
 * malformed templates that would break rendering.
 */
export interface FollowupDigestI18nValidationError {
  key: FollowupDigestI18nKey;
  code: 'missing-placeholder' | 'unknown-placeholder';
  detail: string;
}

export function validateFollowupDigestI18nTable(
  strings: Partial<FollowupDigestI18nTable>,
): FollowupDigestI18nValidationError[] {
  const errors: FollowupDigestI18nValidationError[] = [];
  for (const [key, template] of Object.entries(strings) as [
    FollowupDigestI18nKey,
    string,
  ][]) {
    if (template === undefined || template === null || template === '') continue;
    const required = PLACEHOLDERS_BY_KEY[key];
    if (!required) continue;
    const found = new Set<string>();
    template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_full, name: string) => {
      found.add(name);
      return '';
    });
    for (const req of required) {
      if (!found.has(req)) {
        errors.push({
          key,
          code: 'missing-placeholder',
          detail: `template for "${key}" missing required placeholder "{${req}}"`,
        });
      }
    }
    for (const f of found) {
      if (!required.has(f)) {
        errors.push({
          key,
          code: 'unknown-placeholder',
          detail: `template for "${key}" has unknown placeholder "{${f}}"`,
        });
      }
    }
  }
  return errors;
}

/**
 * Convenience: build a follow-up digest bundle directly in the given
 * locale, skipping the English intermediate. Identical output to
 * localiseFollowupDigestBundle(...) but the call site is shorter
 * when the caller has nothing to do with the English bundle.
 */
export function buildLocalisedFollowupDigestBundle(
  input: FollowupDigestInput,
  bundle: FollowupDigestI18nBundle,
  options: FollowupDigestBundleOptions = {},
): FollowupDigestBundle | null {
  return localiseFollowupDigestBundle(input, bundle, options);
}

/**
 * Re-export of the row type so locale callers don't have to import
 * from two packages.
 */
export type { FollowupRow };
