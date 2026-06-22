/**
 * Follow-up digest text + HTML bundle.
 *
 * `followup-overdue-digest` builds the text body of a follow-up
 * digest. `followup-digest-html` builds the HTML body of the same
 * digest. Both share the same null-short-circuit semantics (silent
 * weeks return null) and the same subject line. SMTP layers shipping
 * a multipart/alternative MIME message need BOTH bodies — and they
 * need them BUILT FROM THE SAME DIGEST so the text and HTML stay in
 * lockstep (same row inclusion, same opener, same expired advisory).
 *
 * Two ways the naive composition would go wrong:
 *
 *   1. Call buildFollowupDigest + buildFollowupDigestHtml separately
 *      and the row limits drift — the text body shows 10 overdue
 *      rows while the HTML shows the full set because the HTML's
 *      reporter re-walks the full report.
 *
 *   2. Each is null-short-circuited independently — the text body is
 *      null, the HTML body has rows because the HTML caller passed
 *      includeUpcoming=true without remembering to pass it to the
 *      text caller too.
 *
 * This module is the thin composition: ONE input + ONE options bag
 * produces both bodies, identical subject, identical row set, and a
 * single null short-circuit covering both.
 *
 * Returned `FollowupDigestBundle` shape is ready to hand to a
 * multipart/alternative MIME builder:
 *   {
 *     subject: "...",
 *     text: "Hello,...",
 *     html: "<div ...>...</div>",
 *     stats: { ... },
 *     rowCount: 5,
 *   }
 *
 * Pure / deterministic. No I/O.
 */

import type { FollowupRow } from './appointment-followup-tracker';
import {
  buildFollowupDigest,
  hasFollowupDigest,
  type FollowupDigestInput,
  type FollowupDigestOptions,
  type FollowupDigestStats,
} from './followup-overdue-digest';
import {
  buildFollowupDigestHtml,
  type FollowupDigestHtmlOptions,
} from './followup-digest-html';

export interface FollowupDigestBundleOptions
  extends FollowupDigestOptions,
    Omit<
      FollowupDigestHtmlOptions,
      'overdueLimit' | 'dueSoonLimit' | 'includeUpcoming' | 'upcomingLimit'
    > {
  /**
   * Override the section limits applied to BOTH the text and HTML
   * bodies. Defaults match buildFollowupDigest (10/10/5). Set both
   * the text and HTML to the same caps so the two outputs cannot
   * drift.
   */
  overdueLimit?: number;
  dueSoonLimit?: number;
  upcomingLimit?: number;
}

export interface FollowupDigestBundle {
  /** Subject line shared by both bodies. */
  subject: string;
  /** Plain-text body (followup-overdue-digest output). */
  text: string;
  /** HTML body fragment (followup-digest-html output). */
  html: string;
  /** Shared digest stats. */
  stats: FollowupDigestStats;
  /** Rows included in both bodies (same ordered set). */
  rows: FollowupRow[];
}

/**
 * Build a multipart-ready text + HTML follow-up digest bundle. Both
 * bodies are derived from a single buildFollowupDigest call so the
 * row inclusion / opener phrasing / expired advisory are identical.
 *
 * Returns null when no actionable items exist (silent week) — the
 * caller skips the SMTP call entirely.
 */
export function buildFollowupDigestBundle(
  input: FollowupDigestInput,
  options: FollowupDigestBundleOptions = {},
): FollowupDigestBundle | null {
  const sharedDigestOptions: FollowupDigestOptions = {};
  if (options.overdueLimit !== undefined) sharedDigestOptions.overdueLimit = options.overdueLimit;
  if (options.dueSoonLimit !== undefined) sharedDigestOptions.dueSoonLimit = options.dueSoonLimit;
  if (options.includeUpcoming !== undefined) {
    sharedDigestOptions.includeUpcoming = options.includeUpcoming;
  }
  if (options.upcomingLimit !== undefined) sharedDigestOptions.upcomingLimit = options.upcomingLimit;

  const digest = buildFollowupDigest(input, sharedDigestOptions);
  if (!digest) return null;

  // For the HTML body, call buildFollowupDigestHtml with the SAME
  // shared options + html-only options. It re-walks the full report
  // and applies the section limits to the unbounded row set, matching
  // the section-count semantics of the text digest. This keeps row
  // inclusion identical between the two bodies.
  const htmlOptions: FollowupDigestHtmlOptions = {
    ...sharedDigestOptions,
  };
  if (options.brandColor !== undefined) htmlOptions.brandColor = options.brandColor;
  if (options.fontFamily !== undefined) htmlOptions.fontFamily = options.fontFamily;
  if (options.includeUnsubscribeFooter !== undefined) {
    htmlOptions.includeUnsubscribeFooter = options.includeUnsubscribeFooter;
  }

  const htmlPart = buildFollowupDigestHtml(input, htmlOptions);
  // The text digest was non-null; the HTML predicate uses the same
  // logic so this must be non-null too — guard for type safety.
  if (!htmlPart) {
    // This is unreachable under matching options. Returning null
    // here would mask a future divergence; throw so we catch it
    // immediately in tests.
    throw new Error('text digest non-null but html digest null — option drift');
  }

  return {
    subject: digest.subject,
    text: digest.text,
    html: htmlPart.html,
    stats: digest.stats,
    rows: digest.rows,
  };
}

/**
 * Cheap predicate that mirrors hasFollowupDigest: true when a bundle
 * WOULD be produced for this report under the same options. Use this
 * before composing if you want to skip the SMTP call entirely.
 */
export function hasFollowupDigestBundle(
  input: Pick<FollowupDigestInput, 'report'>,
  options: { includeUpcoming?: boolean } = {},
): boolean {
  return hasFollowupDigest(input.report, options);
}

/**
 * Build a multipart/alternative-shaped envelope ready to ship via
 * nodemailer / SES / mailgun-style "send raw message" APIs:
 *
 *   {
 *     subject,
 *     text,
 *     html,
 *     alternatives: [{ contentType: 'text/plain', body: text },
 *                    { contentType: 'text/html',  body: html }]
 *   }
 *
 * Most providers can accept the plain `text` + `html` fields; the
 * `alternatives` array is the explicit MIME shape for the few that
 * require it.
 */
export interface FollowupDigestMimeEnvelope {
  subject: string;
  text: string;
  html: string;
  alternatives: { contentType: 'text/plain' | 'text/html'; body: string }[];
  stats: FollowupDigestStats;
}

export function toFollowupDigestMimeEnvelope(
  bundle: FollowupDigestBundle,
): FollowupDigestMimeEnvelope {
  return {
    subject: bundle.subject,
    text: bundle.text,
    html: bundle.html,
    alternatives: [
      { contentType: 'text/plain', body: bundle.text },
      { contentType: 'text/html', body: bundle.html },
    ],
    stats: bundle.stats,
  };
}
