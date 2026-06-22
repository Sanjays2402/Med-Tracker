/**
 * Prescriber contact card emergency card — PDF layout payload.
 *
 * `prescriber-contact-card-emergency-card` produces a structured
 * PrescriberEmergencyCard and renders it as ASCII / HTML. For the
 * ED-triage workflow we also need a SINGLE-PAGE printable PDF: a
 * patient walks into the ED with a manila folder that contains one
 * vCard-encoded QR code per emergency contact, large enough for the
 * intake nurse to scan with a phone in poor light.
 *
 * This module is the layout-payload generator. We deliberately do
 * NOT pull in a PDF rendering dependency — the patient app already
 * has @react-pdf/renderer on the client and pdfkit on the server,
 * and shipping ANOTHER one would bloat the bundle. Instead we
 * produce a structured payload:
 *
 *   {
 *     page: { width, height, margins },
 *     hero: { phone, label, fontSize },
 *     vcard: { contents, qrSize },
 *     blocks: [ { x, y, w, h, kind, text } ],
 *     watermark, footer
 *   }
 *
 * Layout math is pure / deterministic. The caller's PDF library
 * walks `blocks` and lays them out using its native primitives;
 * the QR contents come from prescriber-contact-card's vCard
 * renderer so a scanner imports the prescriber straight into
 * Apple Contacts / Google Contacts without typing.
 *
 * Defaults match a standard US Letter (8.5" x 11") printed at
 * 72 DPI; an A4 preset is exported for international clinics.
 *
 * Pure / deterministic. No I/O.
 */

import { renderVcard, type PrescriberContactCard } from './prescriber-contact-card';
import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';

export type EmergencyCardPdfPageSize = 'letter' | 'a4';

export interface EmergencyCardPdfPage {
  /** Width in points (72 per inch). */
  width: number;
  /** Height in points. */
  height: number;
  /** Margins in points, all sides equal. */
  margin: number;
}

const PAGE_SIZES: Record<EmergencyCardPdfPageSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 }, // 8.5" x 11" at 72 dpi
  a4: { width: 595, height: 842 }, // 210mm x 297mm at ~72 dpi
};

export interface EmergencyCardPdfBlock {
  /** Visual classification (the PDF library maps to its own style sheet). */
  kind:
    | 'document-title'
    | 'hero-label'
    | 'hero-phone'
    | 'specialty'
    | 'prescriber-name'
    | 'fallback-line'
    | 'qr-caption'
    | 'warning'
    | 'footer';
  /** Top-left x in points (origin at page top-left, y grows downward). */
  x: number;
  /** Top-left y in points. */
  y: number;
  /** Block width in points. */
  w: number;
  /** Block height in points. */
  h: number;
  /** Font size in points. */
  fontSize: number;
  /** Text content (already truncated; the PDF library should NOT re-wrap unless h allows it). */
  text: string;
  /** Horizontal alignment. */
  align: 'left' | 'center' | 'right';
  /** Foreground colour as 6-char hex without '#'. */
  color: string;
  /** True when the block should be rendered bold. */
  bold: boolean;
}

export interface EmergencyCardPdfQr {
  /** vCard contents to encode (RFC 6350 vCard 4.0 from prescriber-contact-card.renderVcard). */
  contents: string;
  /** Suggested QR pixel side length when rendered at the layout box. */
  size: number;
  /** Top-left x of the QR box. */
  x: number;
  /** Top-left y of the QR box. */
  y: number;
  /** ECC level recommendation (M is the safest default for vCards). */
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
}

export interface EmergencyCardPdfPayload {
  page: EmergencyCardPdfPage;
  blocks: EmergencyCardPdfBlock[];
  qr: EmergencyCardPdfQr;
  /** Warnings copied from the source emergency card; non-empty when ED-relevant data is missing. */
  warnings: string[];
}

export interface EmergencyCardPdfOptions {
  /** US Letter or A4 page size. Default 'letter'. */
  pageSize?: EmergencyCardPdfPageSize;
  /**
   * Document title rendered at the top of the page. Default
   * 'EMERGENCY MEDICAL CONTACT — KEEP WITH PATIENT'. Some clinics
   * substitute a custom title (e.g. binder-specific instruction).
   */
  documentTitle?: string;
  /**
   * Suggested QR size in points. Default 240 (≈ 3.3" at 72 dpi).
   * Big enough for phone cameras to lock under poor lighting.
   */
  qrSize?: number;
  /**
   * Footer text. Default a "printed YYYY-MM-DD by Med-Tracker" line.
   * Pass empty string to suppress.
   */
  footer?: string;
  /** Reference date for the default footer's "printed" timestamp. Default new Date(). */
  printedAt?: Date;
}

const DEFAULT_TITLE = 'EMERGENCY MEDICAL CONTACT — KEEP WITH PATIENT';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncate(s: string, width: number, fontSize: number): string {
  // Rough character-budget estimator. The PDF library will re-flow
  // if its own metrics differ; this just keeps the on-page layout
  // from overflowing in the common case.
  const charsPerPoint = 1 / (fontSize * 0.55);
  const budget = Math.max(8, Math.floor(width * charsPerPoint));
  if (s.length <= budget) return s;
  if (budget <= 1) return s.slice(0, budget);
  return s.slice(0, budget - 1) + '\u2026';
}

/**
 * Build a single-page PDF layout payload for an emergency card. The
 * hero (on-call phone number) dominates the upper third; a QR code
 * with the prescriber's vCard dominates the lower two-thirds; smaller
 * blocks (specialty, name, daytime fallback, warnings, footer) wrap
 * around them.
 *
 * The caller's PDF library walks `blocks` + renders the QR using
 * `qr.contents` to draw the page.
 */
export function buildEmergencyCardPdfPayload(
  emergencyCard: PrescriberEmergencyCard,
  options: EmergencyCardPdfOptions = {},
): EmergencyCardPdfPayload {
  const pageSize = options.pageSize ?? 'letter';
  const { width: pageW, height: pageH } = PAGE_SIZES[pageSize];
  const margin = 36; // 0.5" margin all sides
  const page: EmergencyCardPdfPage = { width: pageW, height: pageH, margin };
  const contentX = margin;
  const contentW = pageW - 2 * margin;

  const documentTitle = options.documentTitle ?? DEFAULT_TITLE;
  const qrSize = Math.max(72, options.qrSize ?? 240);
  const footerText = options.footer ?? `Printed ${isoDate(options.printedAt ?? new Date())} by Med-Tracker`;

  const blocks: EmergencyCardPdfBlock[] = [];

  // 1. Document title (top)
  let y = margin;
  blocks.push({
    kind: 'document-title',
    x: contentX,
    y,
    w: contentW,
    h: 26,
    fontSize: 14,
    text: truncate(documentTitle, contentW, 14),
    align: 'center',
    color: 'b91c1c',
    bold: true,
  });
  y += 32;

  // 2. Hero block: on-call label + phone in huge font
  const heroLabelText =
    emergencyCard.onCall === null
      ? 'NO PHONE ON FILE'
      : emergencyCard.onCallSource === 'after-hours'
        ? 'CALL ON-CALL — 24/7'
        : 'CALL DAYTIME — FALLBACK';
  blocks.push({
    kind: 'hero-label',
    x: contentX,
    y,
    w: contentW,
    h: 18,
    fontSize: 12,
    text: heroLabelText,
    align: 'center',
    color: 'b91c1c',
    bold: true,
  });
  y += 22;

  const heroPhoneText = emergencyCard.onCall?.pretty ?? 'Ask patient';
  // Aggressively large for ED legibility; cap so it never overflows
  // the content width even for international pretty forms.
  const heroFontSize = emergencyCard.onCall === null ? 28 : 48;
  blocks.push({
    kind: 'hero-phone',
    x: contentX,
    y,
    w: contentW,
    h: heroFontSize + 8,
    fontSize: heroFontSize,
    text: truncate(heroPhoneText, contentW, heroFontSize),
    align: 'center',
    color: '111827',
    bold: true,
  });
  y += heroFontSize + 16;

  // 3. Prescriber name + specialty + daytime fallback
  blocks.push({
    kind: 'prescriber-name',
    x: contentX,
    y,
    w: contentW,
    h: 22,
    fontSize: 18,
    text: truncate(emergencyCard.displayName, contentW, 18),
    align: 'center',
    color: '111827',
    bold: true,
  });
  y += 26;

  if (emergencyCard.specialty) {
    blocks.push({
      kind: 'specialty',
      x: contentX,
      y,
      w: contentW,
      h: 18,
      fontSize: 14,
      text: truncate(emergencyCard.specialty, contentW, 14),
      align: 'center',
      color: '374151',
      bold: false,
    });
    y += 22;
  }

  if (emergencyCard.daytime) {
    blocks.push({
      kind: 'fallback-line',
      x: contentX,
      y,
      w: contentW,
      h: 16,
      fontSize: 12,
      text: truncate(`Daytime fallback: ${emergencyCard.daytime.pretty}`, contentW, 12),
      align: 'center',
      color: '374151',
      bold: false,
    });
    y += 20;
  }

  // 4. QR code centred horizontally
  const qrY = y + 16;
  const qrX = (pageW - qrSize) / 2;
  const vcardContents = renderVcard(emergencyCard.source as PrescriberContactCard);
  const qr: EmergencyCardPdfQr = {
    contents: vcardContents,
    size: qrSize,
    x: qrX,
    y: qrY,
    errorCorrection: 'M',
  };

  // QR caption below the code
  const qrCaptionY = qrY + qrSize + 8;
  blocks.push({
    kind: 'qr-caption',
    x: contentX,
    y: qrCaptionY,
    w: contentW,
    h: 14,
    fontSize: 11,
    text: 'Scan to import into phone contacts',
    align: 'center',
    color: '6b7280',
    bold: false,
  });
  y = qrCaptionY + 18;

  // 5. Warnings block (when present)
  if (emergencyCard.warnings.length > 0) {
    const warningsText = `Warnings: ${emergencyCard.warnings.join(' | ')}`;
    blocks.push({
      kind: 'warning',
      x: contentX,
      y,
      w: contentW,
      h: 20,
      fontSize: 10,
      text: truncate(warningsText, contentW, 10),
      align: 'left',
      color: '92400e',
      bold: false,
    });
    y += 22;
  }

  // 6. Footer (bottom of page)
  if (footerText) {
    blocks.push({
      kind: 'footer',
      x: contentX,
      y: pageH - margin - 12,
      w: contentW,
      h: 12,
      fontSize: 9,
      text: truncate(footerText, contentW, 9),
      align: 'center',
      color: '9ca3af',
      bold: false,
    });
  }

  return {
    page,
    blocks,
    qr,
    warnings: emergencyCard.warnings.slice(),
  };
}

/**
 * Convenience: build payloads for an ED-binder full roster (one
 * card per prescriber, one page each). Cards return in the same
 * order as the input.
 */
export function buildEmergencyCardPdfPayloads(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfOptions = {},
): EmergencyCardPdfPayload[] {
  return emergencyCards.map((c) => buildEmergencyCardPdfPayload(c, options));
}

/**
 * Convenience: total page count an ED-binder roster would produce
 * at the given options. Currently one page per card; reserves
 * room for a future "two cards per A4" landscape layout option.
 */
export function emergencyCardPdfPageCount(emergencyCards: PrescriberEmergencyCard[]): number {
  return emergencyCards.length;
}
