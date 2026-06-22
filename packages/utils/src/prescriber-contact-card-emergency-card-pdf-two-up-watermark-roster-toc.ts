/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, table-of-contents page.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster`
 * builds an N-page batch with per-page traceability strips. A 20+
 * card binder pull deserves a TOC PAGE preceding the roster so a
 * clinician scanning the binder can flip directly to a specific
 * prescriber:
 *
 *   - one row per prescriber (display name + specialty + page
 *     number);
 *   - sorted by specialty group then alphabetically by display
 *     name (so cardiology cards cluster together);
 *   - the SAME watermark + the SAME header strip as the roster
 *     pages so the TOC page is visually consistent with the rest
 *     of the binder;
 *   - generated FROM the same emergencyCards array the roster was
 *     built from, so the TOC can never drift from the cards (no
 *     hand-maintained index).
 *
 * The TOC page is a SEPARATE block stream (a "page 0" preceding
 * page 1..N of the roster). Callers that want the combined
 * document concat-stream the TOC blocks + the roster pages. Callers
 * that want to print just the TOC (e.g. as a binder-cover quick
 * reference) keep only the TOC page.
 *
 * The TOC page emits ONLY existing EmergencyCardPdfBlock kinds
 * ('document-title' for the header, 'specialty' for the section
 * group titles, 'fallback-line' for each card row, 'footer' for
 * the page footer). PDF renderers that don't know about TOC
 * semantics still render every block as a normal page.
 *
 * The roster header strip + watermark applied to the TOC page
 * mirror page 1 of the roster (same generatedAt-locked watermark
 * verified date, same batchId in the strip).
 *
 * Pure / deterministic. No I/O.
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type { EmergencyCardPdfBlock, EmergencyCardPdfPage } from './prescriber-contact-card-emergency-card-pdf';
import type {
  EmergencyCardPdfTwoUpWatermark,
  EmergencyCardPdfTwoUpWatermarkPreset,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark';
import {
  buildEmergencyCardPdfTwoUpWatermarkedRoster,
  type EmergencyCardPdfTwoUpRosterHeaderStrip,
  type EmergencyCardPdfTwoUpRosterOptions,
  type EmergencyCardPdfTwoUpRosterPageResult,
  type EmergencyCardPdfTwoUpRosterResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster';

export interface EmergencyCardPdfTwoUpRosterTocEntry {
  /** Prescriber display name. */
  displayName: string;
  /** Specialty, if known. Lowercase per the canonical record. */
  specialty?: string;
  /** Roster page number (1-based) the prescriber appears on. */
  pageNumber: number;
  /** Index into the source emergencyCards array. */
  cardIndex: number;
}

export interface EmergencyCardPdfTwoUpRosterTocPage {
  /** Page geometry (same as the roster pages). */
  page: EmergencyCardPdfPage;
  /** Page blocks (TOC body). */
  blocks: EmergencyCardPdfBlock[];
  /** Single watermark spanning the page (matches the roster pages). */
  watermark: EmergencyCardPdfTwoUpWatermark | null;
  /** Preset used for the watermark. */
  watermarkPreset: EmergencyCardPdfTwoUpWatermarkPreset | null;
  /** Header strip mirroring the roster's per-page traceability. */
  rosterHeaderStrip: EmergencyCardPdfTwoUpRosterHeaderStrip | null;
}

export interface EmergencyCardPdfTwoUpRosterWithTocOptions
  extends EmergencyCardPdfTwoUpRosterOptions {
  /**
   * Override the TOC page title. Default
   * "Emergency contact roster — table of contents".
   */
  tocTitle?: string;
  /**
   * Sort within each specialty group. Default 'displayName' (asc).
   * 'cardOrder' preserves the input array order within a group.
   */
  tocSortWithinGroup?: 'displayName' | 'cardOrder';
  /**
   * Group entries by specialty. Default true. When false, all
   * entries appear under a single (unlabelled) section in
   * displayName order regardless of specialty.
   */
  tocGroupBySpecialty?: boolean;
  /**
   * Label rendered for entries that have no specialty. Default
   * "Other".
   */
  tocSpecialtyFallback?: string;
}

export interface EmergencyCardPdfTwoUpRosterWithTocResult {
  /** The TOC page (page 0). */
  tocPage: EmergencyCardPdfTwoUpRosterTocPage;
  /**
   * TOC entries in render order (matches the order they appear in
   * the TOC page; useful for QA / archive). One entry per card.
   */
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[];
  /** The roster pages (page 1..N). */
  rosterPages: EmergencyCardPdfTwoUpRosterPageResult[];
  /** Roster meta (mirrors the roster builder's result). */
  batchId: string;
  generatedAt: Date;
  /** Total page count for the COMBINED document (1 TOC + N roster). */
  totalPages: number;
  /** Total card count across the roster. */
  totalCardCount: number;
}

const DEFAULT_TOC_TITLE = 'Emergency contact roster — table of contents';
const DEFAULT_SPECIALTY_FALLBACK = 'Other';

function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s
    .split(/[\s-]+/)
    .map((w) => (w.length === 0 ? '' : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}

function buildTocEntries(
  emergencyCards: PrescriberEmergencyCard[],
  rosterPageForCard: (cardIndex: number) => number,
  options: EmergencyCardPdfTwoUpRosterWithTocOptions,
): EmergencyCardPdfTwoUpRosterTocEntry[] {
  const fallback = options.tocSpecialtyFallback ?? DEFAULT_SPECIALTY_FALLBACK;
  const groupBySpecialty = options.tocGroupBySpecialty ?? true;
  const sortWithinGroup = options.tocSortWithinGroup ?? 'displayName';

  const entries: EmergencyCardPdfTwoUpRosterTocEntry[] = emergencyCards.map((c, i) => {
    const entry: EmergencyCardPdfTwoUpRosterTocEntry = {
      displayName: c.displayName,
      pageNumber: rosterPageForCard(i),
      cardIndex: i,
    };
    if (c.specialty) entry.specialty = c.specialty;
    return entry;
  });

  if (!groupBySpecialty) {
    // Single ungrouped section, ordered by displayName (or by cardIndex
    // if the caller asked for cardOrder).
    if (sortWithinGroup === 'displayName') {
      entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return entries;
  }

  // Group by specialty (fallback label for missing), sort groups
  // alphabetically, then within each group either by displayName or
  // cardIndex.
  const groups = new Map<string, EmergencyCardPdfTwoUpRosterTocEntry[]>();
  for (const e of entries) {
    const key = e.specialty ?? fallback;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const ordered: EmergencyCardPdfTwoUpRosterTocEntry[] = [];
  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    if (sortWithinGroup === 'displayName') {
      group.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else {
      group.sort((a, b) => a.cardIndex - b.cardIndex);
    }
    ordered.push(...group);
  }
  return ordered;
}

function buildTocBlocks(
  page: EmergencyCardPdfPage,
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  options: EmergencyCardPdfTwoUpRosterWithTocOptions,
  totalPages: number,
): EmergencyCardPdfBlock[] {
  const blocks: EmergencyCardPdfBlock[] = [];
  const margin = page.margin;
  let y = margin + 32; // leave room above for the header strip
  const w = page.width - 2 * margin;

  // 1. Document title (centered, large)
  const title = options.tocTitle ?? DEFAULT_TOC_TITLE;
  blocks.push({
    kind: 'document-title',
    x: margin,
    y,
    w,
    h: 22,
    fontSize: 14,
    text: title,
    align: 'center',
    color: '111827',
    bold: true,
  });
  y += 32;

  // 2. Entries, grouped by specialty (a fallback line per entry).
  const groupBySpecialty = options.tocGroupBySpecialty ?? true;
  const fallback = options.tocSpecialtyFallback ?? DEFAULT_SPECIALTY_FALLBACK;
  let lastGroupLabel: string | null = null;

  for (const e of entries) {
    const groupLabel = groupBySpecialty
      ? titleCase(e.specialty ?? fallback)
      : '';
    if (groupBySpecialty && groupLabel !== lastGroupLabel) {
      // Section header for new specialty group.
      blocks.push({
        kind: 'specialty',
        x: margin,
        y,
        w,
        h: 14,
        fontSize: 10,
        text: groupLabel.toUpperCase(),
        align: 'left',
        color: '6b7280',
        bold: true,
      });
      y += 18;
      lastGroupLabel = groupLabel;
    }

    // Entry line: display name (left) + page number (right).
    // We emit two fallback-line blocks so the renderer aligns them
    // naturally (left + right) on the same row.
    const rowH = 12;
    blocks.push({
      kind: 'fallback-line',
      x: margin,
      y,
      w: w - 60,
      h: rowH,
      fontSize: 10,
      text: e.displayName,
      align: 'left',
      color: '111827',
      bold: false,
    });
    blocks.push({
      kind: 'fallback-line',
      x: margin + w - 60,
      y,
      w: 60,
      h: rowH,
      fontSize: 10,
      text: `Page ${e.pageNumber}`,
      align: 'right',
      color: '6b7280',
      bold: false,
    });
    y += rowH + 4;
  }

  // 3. Footer with combined-page total.
  blocks.push({
    kind: 'footer',
    x: margin,
    y: page.height - margin - 10,
    w,
    h: 10,
    fontSize: 8,
    text: `TOC · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · Document ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`,
    align: 'center',
    color: '6b7280',
    bold: false,
  });

  return blocks;
}

/**
 * Build a complete document: 1 TOC page + N roster pages.
 *
 * The TOC page lists every prescriber by display name + specialty +
 * page number, grouped by specialty (default). The roster pages are
 * the standard watermark roster output. Both share the same
 * batchId, generatedAt, and watermark so the combined document is
 * visually coherent.
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterWithTocOptions = {},
): EmergencyCardPdfTwoUpRosterWithTocResult {
  // First, build the roster to determine batch metadata + page count.
  // We pass an explicit generatedAt to ensure the TOC page below
  // shares it. Likewise for batchId.
  const generatedAt = options.generatedAt ?? new Date();
  const rosterResult: EmergencyCardPdfTwoUpRosterResult =
    buildEmergencyCardPdfTwoUpWatermarkedRoster(emergencyCards, {
      ...options,
      generatedAt,
    });

  const tocPageNumber = 1; // TOC is page 1
  const rosterTotalPages = rosterResult.totalPages;
  const combinedTotalPages = rosterTotalPages + 1;

  // Compute roster page numbers IN THE COMBINED DOCUMENT (offset by 1
  // for the TOC). cardIndex i lives on roster page floor(i/2)+1, then
  // +1 for TOC offset.
  const rosterPageForCard = (cardIndex: number): number => {
    // 2 cards per page; combined page number = TOC + roster page.
    return tocPageNumber + Math.floor(cardIndex / 2) + 1;
  };

  const tocEntries = buildTocEntries(emergencyCards, rosterPageForCard, options);

  // For the TOC page geometry + watermark + header strip we reuse
  // the roster's page-1 metadata. If the roster is empty (no cards),
  // we synthesise a minimal letter-size page so the TOC still
  // renders ("empty roster" TOC is a real use case for QA).
  const baseTocPage: EmergencyCardPdfPage =
    rosterResult.pages[0]?.page ??
    {
      // landscape letter: 792 wide x 612 tall (two-up sheet)
      width: 792,
      height: 612,
      margin: 24,
    };

  const baseWatermark: EmergencyCardPdfTwoUpWatermark | null =
    rosterResult.pages[0]?.watermark ?? null;
  const baseWatermarkPreset: EmergencyCardPdfTwoUpWatermarkPreset | null =
    rosterResult.pages[0]?.watermarkPreset ?? options.watermark ?? null;

  // Compute a TOC-page header strip if the underlying roster had
  // strips. The strip text uses pageNumber=1, totalPages=combined,
  // batchId from the roster, generatedAt from the roster.
  let tocHeaderStrip: EmergencyCardPdfTwoUpRosterHeaderStrip | null = null;
  const firstStrip = rosterResult.pages[0]?.rosterHeaderStrip ?? null;
  if (firstStrip) {
    tocHeaderStrip = {
      ...firstStrip,
      pageNumber: 1,
      totalPages: combinedTotalPages,
      text: firstStrip.text
        .replace(/Page \d+ of \d+/, `Page 1 of ${combinedTotalPages}`)
        .replace(/Batch [^\u00b7]+\u00b7/, `Batch ${rosterResult.batchId}  \u00b7  `)
        .trim(),
    };
  } else if (rosterResult.totalPages === 0) {
    // Empty roster: synthesise a strip so the TOC page is still
    // traceable to the batch (and shows totalPages = 1).
    tocHeaderStrip = {
      x: baseTocPage.margin,
      y: 6,
      w: baseTocPage.width - 2 * baseTocPage.margin,
      h: 14,
      text: `Page 1 of ${combinedTotalPages}  \u00b7  Batch ${rosterResult.batchId}  \u00b7  Generated ${isoDate(generatedAt)}`,
      fontSize: 9,
      color: '4b5563',
      pageNumber: 1,
      totalPages: combinedTotalPages,
      batchId: rosterResult.batchId,
    };
  }

  // Roster pages: bump their per-page header strip totalPages +
  // pageNumber by +1 (TOC offset).
  const rosterPages: EmergencyCardPdfTwoUpRosterPageResult[] = rosterResult.pages.map(
    (p, idx) => {
      if (!p.rosterHeaderStrip) return p;
      const adjustedPageNumber = idx + 2; // TOC is page 1
      const newStrip: EmergencyCardPdfTwoUpRosterHeaderStrip = {
        ...p.rosterHeaderStrip,
        pageNumber: adjustedPageNumber,
        totalPages: combinedTotalPages,
        text: p.rosterHeaderStrip.text
          .replace(
            /Page \d+ of \d+/,
            `Page ${adjustedPageNumber} of ${combinedTotalPages}`,
          ),
      };
      return { ...p, rosterHeaderStrip: newStrip };
    },
  );

  const tocBlocks = buildTocBlocks(baseTocPage, tocEntries, options, combinedTotalPages);

  return {
    tocPage: {
      page: baseTocPage,
      blocks: tocBlocks,
      watermark: baseWatermark,
      watermarkPreset: baseWatermarkPreset,
      rosterHeaderStrip: tocHeaderStrip,
    },
    tocEntries,
    rosterPages,
    batchId: rosterResult.batchId,
    generatedAt: rosterResult.generatedAt,
    totalPages: combinedTotalPages,
    totalCardCount: rosterResult.totalCardCount,
  };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convenience: flatten the document into a single ordered list of
 * pages (TOC first, then roster pages). For renderers that take a
 * uniform page stream.
 */
export function flattenRosterWithTocPages(
  result: EmergencyCardPdfTwoUpRosterWithTocResult,
): Array<
  | { kind: 'toc'; page: EmergencyCardPdfTwoUpRosterTocPage }
  | { kind: 'roster'; page: EmergencyCardPdfTwoUpRosterPageResult }
> {
  const out: Array<
    | { kind: 'toc'; page: EmergencyCardPdfTwoUpRosterTocPage }
    | { kind: 'roster'; page: EmergencyCardPdfTwoUpRosterPageResult }
  > = [{ kind: 'toc', page: result.tocPage }];
  for (const p of result.rosterPages) {
    out.push({ kind: 'roster', page: p });
  }
  return out;
}

/**
 * Convenience: one-line summary for the cron log.
 *
 *   "Roster TOC: 14 entries across 7 roster pages (8 total document pages)."
 */
export function summarizeRosterWithTocResult(
  result: EmergencyCardPdfTwoUpRosterWithTocResult,
): string {
  const e = result.tocEntries.length;
  const rosterPages = result.rosterPages.length;
  return (
    `Roster TOC: ${e} ${e === 1 ? 'entry' : 'entries'} across ${rosterPages} ` +
    `roster ${rosterPages === 1 ? 'page' : 'pages'} ` +
    `(${result.totalPages} total document ${result.totalPages === 1 ? 'page' : 'pages'}).`
  );
}
