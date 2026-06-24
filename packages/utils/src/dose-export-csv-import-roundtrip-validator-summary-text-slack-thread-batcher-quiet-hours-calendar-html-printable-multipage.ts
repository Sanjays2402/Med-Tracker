/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours CALENDAR HTML printable, MULTIPAGE
 * variant.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable`
 * renders the calendar as a single binder-printable page sized to
 * US Letter / A4. A growing problem for the multi-region on-call
 * panel: clinic chains operate the same channel across multiple
 * timezones (San Francisco PT, New York ET, London BST). A single
 * page only captures ONE timezone's view; the on-call admin in NYC
 * doesn't know whether the SF on-call's Saturday-quiet rule fires
 * at 22:00 NYC or 22:00 SF without redrawing the calendar.
 *
 * This module is the multi-region printable. Given N regions (each
 * with their own timezone-rooted calendar options), it emits ONE
 * calendar per region, separated by a form-feed (`\f`, i.e. ASCII
 * 0x0C, the printer-cassette page break) so a single print job
 * splits cleanly across N pages:
 *
 *   page 1: SF — Pacific Time
 *   page 2: NYC — Eastern Time
 *   page 3: London — British Time
 *   ...
 *
 * Each page is a fully-wrapped HTML document (head, body, @page
 * CSS for the paper preset). The form-feed separator goes BETWEEN
 * the documents — the printer driver sees the same N-page job
 * naturally split.
 *
 * Per-page options inherit from a shared base (paper, footerText,
 * fontFamily, etc) so an admin sets up one configuration once and
 * the per-region overrides only specify the deltas (defaultWindow,
 * overrides, documentTitle).
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderQuietHoursCalendarHtmlPrintable (per-page render)
 *   - DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable';
import { renderQuietHoursCalendarHtmlPrintable } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable';

/** Form-feed character — the printer-cassette page-break code. */
export const QUIET_HOURS_CALENDAR_PRINTABLE_MULTIPAGE_FORM_FEED = '\f';

/**
 * A single region's per-page options. Inherits the base options and
 * overrides only the per-region deltas.
 */
export interface QuietHoursCalendarPrintableMultipageRegion {
  /**
   * Region key (stable identifier; surfaced in the result so callers
   * can iterate without re-deriving from documentTitle).
   */
  regionId: string;
  /**
   * Per-region options override. Merged onto the shared base options.
   * Typical fields: defaultWindow (timezone + start/end hours),
   * overrides (per-day rules), documentTitle, caption.
   */
  options?: Partial<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions>;
}

export interface QuietHoursCalendarPrintableMultipageOptions {
  /**
   * Per-region entries. Order is preserved in the output (pages
   * emitted in the same order).
   */
  regions: QuietHoursCalendarPrintableMultipageRegion[];
  /**
   * Shared base options merged into every region's options. Per-
   * region options override on a key-by-key basis.
   */
  baseOptions?: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions;
  /**
   * Override the page-separator string. Default is the form-feed
   * character (`\f`). Set '' to suppress separators (single
   * document with concatenated bodies — usually NOT what you want;
   * exposed for unit-test introspection).
   */
  pageSeparator?: string;
  /**
   * Wrap each per-region render as a complete HTML document. Default
   * true (the multipage form-feed only makes sense across standalone
   * docs). Set false when the host page wants to inject N fragments
   * into its own outer document; in that case the pageSeparator is
   * still emitted between fragments but the outer <html> + <body>
   * scaffold is the host's responsibility.
   */
  wrapEachPageAsDocument?: boolean;
}

export interface QuietHoursCalendarPrintableMultipagePage {
  /** Stable region identifier from input. */
  regionId: string;
  /** Index (0-based) of this page in the multipage output. */
  pageIndex: number;
  /** Underlying per-region render result. */
  render: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult;
}

export interface QuietHoursCalendarPrintableMultipageResult {
  /**
   * Full concatenated payload: each per-region HTML document joined
   * by the page-separator string.
   */
  text: string;
  /** Number of regions / pages emitted. */
  pageCount: number;
  /** Per-region page entries (in input order). */
  pages: QuietHoursCalendarPrintableMultipagePage[];
  /** Resolved page-separator string. */
  pageSeparator: string;
  /**
   * Resolved paper preset (taken from baseOptions ?? first region ??
   * 'us-letter'). When per-region paper presets differ, this reflects
   * the most common one (first per-region paper if base is missing).
   */
  paper: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper;
}

/**
 * Merge two options objects. Per-region keys override base keys on
 * a per-field basis (no deep merge — defaultWindow / overrides /
 * palette / printedAt fully replace; that's the typical desired
 * shape, since a New York region wants a DIFFERENT defaultWindow
 * from the San Francisco region rather than a fragment of one).
 */
function mergeOptions(
  base: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions,
  override: Partial<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions>,
): DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions {
  return { ...base, ...override };
}

/**
 * Render N per-region printable calendars and join them with the
 * form-feed page-separator so a single print job produces N pages.
 *
 * Composes renderQuietHoursCalendarHtmlPrintable per region. Per-
 * region options override base options. Order is preserved.
 *
 * Pure / deterministic.
 */
export function renderQuietHoursCalendarHtmlPrintableMultipage(
  options: QuietHoursCalendarPrintableMultipageOptions,
): QuietHoursCalendarPrintableMultipageResult {
  const baseOptions = options.baseOptions ?? {};
  const wrapEachPage = options.wrapEachPageAsDocument ?? true;
  const pageSeparator =
    options.pageSeparator ?? QUIET_HOURS_CALENDAR_PRINTABLE_MULTIPAGE_FORM_FEED;

  const pages: QuietHoursCalendarPrintableMultipagePage[] = options.regions.map(
    (region, idx) => {
      const merged = mergeOptions(baseOptions, region.options ?? {});
      const render = renderQuietHoursCalendarHtmlPrintable({
        ...merged,
        wrapHtmlDocument: wrapEachPage,
      });
      return { regionId: region.regionId, pageIndex: idx, render };
    },
  );

  const text = pages.map((p) => p.render.html).join(pageSeparator);
  const paper =
    baseOptions.paper ??
    pages[0]?.render.paper ??
    'us-letter';

  return {
    text,
    pageCount: pages.length,
    pages,
    pageSeparator,
    paper,
  };
}

/**
 * Convenience: a one-line cron-log summary of the multipage render.
 *
 *   "Quiet-hours calendar multipage (us-letter): 3 pages
 *    (sf, nyc, london)."
 *   "Quiet-hours calendar multipage (a4): 0 pages."
 */
export function summarizeQuietHoursCalendarHtmlPrintableMultipage(
  result: QuietHoursCalendarPrintableMultipageResult,
): string {
  if (result.pageCount === 0) {
    return `Quiet-hours calendar multipage (${result.paper}): 0 pages.`;
  }
  const ids = result.pages.map((p) => p.regionId).join(', ');
  return (
    `Quiet-hours calendar multipage (${result.paper}): ${result.pageCount} ` +
    `${result.pageCount === 1 ? 'page' : 'pages'} (${ids}).`
  );
}

/**
 * Convenience: split the concatenated text back into per-page HTML
 * documents. Mirrors what a printer driver does on the form-feed
 * character. Useful for hosts that want to ship the pages as
 * separate downloads.
 *
 * Pure / deterministic.
 */
export function splitQuietHoursCalendarHtmlPrintableMultipage(
  result: QuietHoursCalendarPrintableMultipageResult,
): string[] {
  if (result.pageSeparator === '') {
    return [result.text];
  }
  return result.text.split(result.pageSeparator);
}

/**
 * Convenience: detect regions whose render flagged an empty
 * calendar (zero non-default cells). For a multipage report this
 * surfaces "which regions have NO custom rules" so the admin can
 * decide whether to even ship the page.
 *
 * Pure / deterministic.
 */
export function detectQuietHoursCalendarHtmlPrintableMultipageEmptyRegions(
  result: QuietHoursCalendarPrintableMultipageResult,
): QuietHoursCalendarPrintableMultipagePage[] {
  return result.pages.filter((p) => {
    const r = p.render.ruleCounts;
    return (
      r['override:window'] === 0 &&
      r['override:all-day'] === 0 &&
      r['override:none'] === 0
    );
  });
}
