/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * — HTML mailer envelope wrapper.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher`
 * produces a per-caregiver bundle of (patientId, FollowupDigestBundle)
 * pairs. A caregiver who watches several patients gets ONE entry
 * with N digest rows inside. The next step is mailer dispatch: the
 * SMTP layer needs each entry shaped as an envelope it can hand
 * straight to a transport (Nodemailer, AWS SES, Sendgrid):
 *
 *   {
 *     to: <caregiver destination>,
 *     subject: "<subject line>",
 *     text: "<plain-text body, all patients concatenated>",
 *     html: "<html body, all patients concatenated>",
 *   }
 *
 * This module is the wrapper layer. It composes the per-caregiver
 * cron-batcher entry into a multipart-ready mailer envelope:
 *
 *   - subject: configurable template, defaults to
 *     "Med-Tracker follow-up digest for <caregiver-name>" with the
 *     date label spliced in. Locale-aware via the per-locale subject
 *     templates.
 *   - text: plain-text body, derived by concatenating each patient's
 *     digest text with a per-patient header line. Reader-friendly
 *     ASCII separators between patients ("--- <patient label> ---").
 *   - html: HTML body, derived by concatenating each patient's
 *     digest HTML inside per-patient <section> blocks. A small
 *     wrapper <style> stays inline-only (no <head>) so the body
 *     can be slotted into any HTML email template the SMTP layer
 *     wants to wrap it in.
 *
 * Why a separate module instead of inlining the wrapping in the
 * cron batcher itself? The cron batcher's contract is "match
 * caregivers to per-patient digests"; the mailer envelope's
 * contract is "shape an entry into an SMTP-ready payload". Other
 * channels (in-app inbox, SMS, push notification) want different
 * shapes from the same cron-batcher output. Keeping the SMTP shape
 * in its own module preserves that fanout.
 *
 * Silent / suppressed caregivers from the cron batcher are
 * preserved in the result so the mailer layer can decide whether
 * to ship a "no actionable items this week" heartbeat (opt-in) or
 * skip them entirely (default).
 *
 * Pure / deterministic. No I/O. No network. Same input -> byte-
 * identical envelopes.
 */

import type {
  FollowupDigestCronBatcherEntry,
  FollowupDigestCronBatcherResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';

/** Per-locale subject template. {caregiverName} and {dateLabel} are interpolated. */
export interface FollowupDigestHtmlMailerSubjectTemplate {
  locale: string;
  template: string;
}

export interface FollowupDigestHtmlMailerOptions {
  /**
   * Optional date label spliced into the default subject template
   * (e.g. "the week of 2026-06-22"). Empty / undefined skips the
   * date interpolation gracefully.
   */
  dateLabel?: string;
  /**
   * Per-locale subject templates. Unknown locales fall back to the
   * default English template. Templates are simple {token}
   * substitution — no markdown, no escaping.
   */
  subjectTemplates?: FollowupDigestHtmlMailerSubjectTemplate[];
  /**
   * Default English subject template if no per-locale override.
   * Default: "Med-Tracker follow-up digest for {caregiverName} ({dateLabel})".
   * When dateLabel is empty, "( )" is stripped from the rendered subject.
   */
  defaultSubjectTemplate?: string;
  /**
   * Per-patient text separator. Default a horizontal rule line.
   */
  textPatientSeparator?: string;
  /**
   * Include per-patient label headings inside the bodies. Default true.
   * When true, each patient block in the body starts with
   * "Patient: <patientLabel>" (text) / <h2>Patient: <patientLabel></h2> (html).
   * Set false for households where every patient name is on the subject
   * line / sidebar and re-printing them inside the body adds noise.
   */
  includePatientHeadings?: boolean;
  /**
   * Patient-id -> display label map. Falls back to patientId when not present.
   */
  patientLabels?: Map<string, string>;
}

export interface FollowupDigestHtmlMailerEnvelope {
  caregiverId: string;
  caregiverName: string;
  /** Mailer "to" header (mirrors entry.destination when set). */
  to: string | undefined;
  /** Locale used to render this envelope (post-fallback). */
  locale: string;
  /** Rendered subject. */
  subject: string;
  /** Plain-text body for the multipart/alternative text/plain part. */
  text: string;
  /** HTML body fragment for the multipart/alternative text/html part. */
  html: string;
  /** Patients included in the body, in input order. */
  patientIds: string[];
}

export interface FollowupDigestHtmlMailerSilentCaregiver {
  caregiverId: string;
  reason: 'silent-week' | 'unknown-locale-skipped';
}

export interface FollowupDigestHtmlMailerResult {
  /** One envelope per deliverable caregiver, input order. */
  envelopes: FollowupDigestHtmlMailerEnvelope[];
  /** Quick map for direct lookup by caregiverId. */
  byCaregiverId: Map<string, FollowupDigestHtmlMailerEnvelope>;
  /**
   * Caregivers explicitly NOT mailed (silent-week or unknown-locale
   * skipped per the cron batcher). The mailer layer can either skip
   * or opt-in to a heartbeat depending on per-caregiver settings.
   */
  silent: FollowupDigestHtmlMailerSilentCaregiver[];
}

const DEFAULT_SUBJECT_TEMPLATE =
  'Med-Tracker follow-up digest for {caregiverName} ({dateLabel})';
const DEFAULT_TEXT_SEPARATOR = '\n\n----------------------------------------\n\n';

function selectSubjectTemplate(
  locale: string,
  options: FollowupDigestHtmlMailerOptions,
): string {
  if (options.subjectTemplates) {
    const found = options.subjectTemplates.find((t) => t.locale === locale);
    if (found) return found.template;
  }
  return options.defaultSubjectTemplate ?? DEFAULT_SUBJECT_TEMPLATE;
}

function renderSubject(
  template: string,
  caregiverName: string,
  dateLabel: string,
): string {
  let rendered = template
    .replace(/\{caregiverName\}/g, caregiverName)
    .replace(/\{dateLabel\}/g, dateLabel);
  // If dateLabel is empty, collapse the surrounding "( )" or " - " to avoid
  // an awkward trailing artefact. Look for these common patterns.
  if (dateLabel.length === 0) {
    rendered = rendered
      // "(  )" or "()" leftover from "({dateLabel})"
      .replace(/\s*\(\s*\)\s*$/u, '')
      // " - " leftover from " - {dateLabel}"
      .replace(/\s*-\s*$/u, '')
      // " for the week of " leftover (English) — keep simple, no global ja-JP / es-419
      .trim();
  }
  return rendered.trim();
}

function labelForPatient(
  patientId: string,
  options: FollowupDigestHtmlMailerOptions,
): string {
  return options.patientLabels?.get(patientId) ?? patientId;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTextBody(
  entry: FollowupDigestCronBatcherEntry,
  options: FollowupDigestHtmlMailerOptions,
): string {
  const separator = options.textPatientSeparator ?? DEFAULT_TEXT_SEPARATOR;
  const includeHeadings = options.includePatientHeadings ?? true;
  const parts: string[] = [];
  for (const p of entry.patients) {
    const label = labelForPatient(p.patientId, options);
    const body = includeHeadings
      ? `Patient: ${label}\n${'-'.repeat(`Patient: ${label}`.length)}\n${p.bundle.text}`
      : p.bundle.text;
    parts.push(body);
  }
  return parts.join(separator);
}

function renderHtmlBody(
  entry: FollowupDigestCronBatcherEntry,
  options: FollowupDigestHtmlMailerOptions,
): string {
  const includeHeadings = options.includePatientHeadings ?? true;
  const sections: string[] = [];
  for (const p of entry.patients) {
    const label = escapeHtml(labelForPatient(p.patientId, options));
    const heading = includeHeadings
      ? `<h2 style="font-family:system-ui,sans-serif;font-size:16px;color:#111;margin:0 0 8px 0;">Patient: ${label}</h2>`
      : '';
    sections.push(
      `<section style="margin:0 0 24px 0;padding:0 0 16px 0;border-bottom:1px solid #e5e7eb;">${heading}${p.bundle.html}</section>`,
    );
  }
  // The last section's bottom border is visual noise; trim it by
  // wrapping in a container that resets the final child border.
  return (
    `<div style="font-family:system-ui,sans-serif;color:#111;">` +
    sections.join('') +
    `<style>section:last-child { border-bottom: none !important; padding-bottom: 0 !important; margin-bottom: 0 !important; }</style>` +
    `</div>`
  );
}

function envelopeFromEntry(
  entry: FollowupDigestCronBatcherEntry,
  options: FollowupDigestHtmlMailerOptions,
): FollowupDigestHtmlMailerEnvelope {
  const template = selectSubjectTemplate(entry.locale, options);
  const subject = renderSubject(template, entry.caregiverName, options.dateLabel ?? '');
  const text = renderTextBody(entry, options);
  const html = renderHtmlBody(entry, options);
  return {
    caregiverId: entry.caregiverId,
    caregiverName: entry.caregiverName,
    to: entry.destination,
    locale: entry.locale,
    subject,
    text,
    html,
    patientIds: entry.patients.map((p) => p.patientId),
  };
}

/**
 * Wrap each caregiver entry in the cron batch into an SMTP-ready
 * envelope (subject + text + html bodies). Silent / suppressed
 * caregivers are reported separately so the mailer can decide
 * whether to ship a heartbeat or skip.
 *
 * Pure / deterministic.
 */
export function buildFollowupDigestHtmlMailerEnvelopes(
  batch: FollowupDigestCronBatcherResult,
  options: FollowupDigestHtmlMailerOptions = {},
): FollowupDigestHtmlMailerResult {
  const envelopes: FollowupDigestHtmlMailerEnvelope[] = [];
  const byCaregiverId = new Map<string, FollowupDigestHtmlMailerEnvelope>();
  for (const entry of batch.entries) {
    const env = envelopeFromEntry(entry, options);
    envelopes.push(env);
    byCaregiverId.set(env.caregiverId, env);
  }
  const silent: FollowupDigestHtmlMailerSilentCaregiver[] = [];
  for (const id of batch.coverage.silentCaregiverIds) {
    silent.push({ caregiverId: id, reason: 'silent-week' });
  }
  for (const id of batch.coverage.skippedCaregiverIds) {
    silent.push({ caregiverId: id, reason: 'unknown-locale-skipped' });
  }
  return { envelopes, byCaregiverId, silent };
}

/**
 * Convenience: wrap a single caregiver entry into a single envelope
 * (without going through the batch). Useful for the unit-test path
 * and for downstream pipelines that hand the batcher result to
 * multiple wrappers and want to pull out one caregiver at a time.
 */
export function buildFollowupDigestHtmlMailerEnvelopeForEntry(
  entry: FollowupDigestCronBatcherEntry,
  options: FollowupDigestHtmlMailerOptions = {},
): FollowupDigestHtmlMailerEnvelope {
  return envelopeFromEntry(entry, options);
}

/**
 * Convenience: filter the mailer result to envelopes whose `to`
 * field is set (the destination column is required for SMTP
 * dispatch). Envelopes without a destination are dropped — the
 * mailer layer would error on them anyway.
 */
export function filterEnvelopesWithDestination(
  result: FollowupDigestHtmlMailerResult,
): FollowupDigestHtmlMailerEnvelope[] {
  return result.envelopes.filter((e) => typeof e.to === 'string' && e.to.length > 0);
}

/**
 * Convenience: build a one-line cron log summary for the mailer fan-out.
 *
 *   "Mailer fan-out: 4 envelopes ready, 2 silent (1 silent-week,
 *    1 unknown-locale-skipped)."
 */
export function summarizeFollowupDigestHtmlMailer(
  result: FollowupDigestHtmlMailerResult,
): string {
  const envelopes = result.envelopes.length;
  const silentCount = result.silent.length;
  if (silentCount === 0) {
    return `Mailer fan-out: ${envelopes} envelopes ready, 0 silent.`;
  }
  const silentBreakdown = new Map<string, number>();
  for (const s of result.silent) {
    silentBreakdown.set(s.reason, (silentBreakdown.get(s.reason) ?? 0) + 1);
  }
  const breakdownParts: string[] = [];
  for (const [reason, count] of silentBreakdown.entries()) {
    breakdownParts.push(`${count} ${reason}`);
  }
  return (
    `Mailer fan-out: ${envelopes} envelopes ready, ` +
    `${silentCount} silent (${breakdownParts.join(', ')}).`
  );
}
