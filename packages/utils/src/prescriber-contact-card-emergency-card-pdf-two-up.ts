/**
 * Prescriber contact card emergency card PDF — two-up layout.
 *
 * `prescriber-contact-card-emergency-card-pdf` produces ONE card
 * per page, in portrait orientation. For a clinic that prints a
 * patient's prescriber roster into a binder, that's one tree per
 * eight prescribers. The landscape two-up variant pairs cards
 * side-by-side on a single sheet, cutting paper use in half. The
 * physical use case is the cardiology / oncology binder cover:
 * patient walks in with a 4-card mini-deck on two sheets instead of
 * a 4-page packet.
 *
 * Page geometry:
 *
 *   - Page is the SAME paper as the single-up variant (US Letter /
 *     A4) but rotated to LANDSCAPE.
 *   - A vertical centerline divides the page into LEFT and RIGHT
 *     halves with a small gutter for the scissor cut.
 *   - Each half is dimensionally compatible with the single-up card,
 *     just narrower: hero phone, QR, prescriber name, daytime
 *     fallback, warnings, footer.
 *
 * We DELIBERATELY do NOT call the single-up builder twice and stitch
 * the results — its block coordinates are page-relative, not
 * half-page-relative, and naively offsetting them would put the
 * hero phone at the wrong y and the QR at the wrong x. Instead, we
 * re-do the block math for a half-page content area but keep the
 * font sizes and ordering identical to the single-up version so the
 * two layouts feel like the same design at different scales.
 *
 * When an odd number of cards is passed, the LAST page renders only
 * the LEFT slot (right slot is null) so the binder doesn't end on a
 * blank half-card.
 *
 * Pure / deterministic. No I/O.
 */

import { renderVcard, type PrescriberContactCard } from './prescriber-contact-card';
import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfBlock,
  EmergencyCardPdfPageSize,
  EmergencyCardPdfQr,
} from './prescriber-contact-card-emergency-card-pdf';

/** Landscape geometry: same paper, rotated. */
const LANDSCAPE_PAGE_SIZES: Record<EmergencyCardPdfPageSize, { width: number; height: number }> = {
  // Width and height swapped from the portrait single-up variant.
  letter: { width: 792, height: 612 }, // landscape Letter
  a4: { width: 842, height: 595 },     // landscape A4
};

export interface EmergencyCardPdfTwoUpPage {
  width: number;
  height: number;
  margin: number;
  /** Horizontal gap between the two cards (gutter for scissor cut). */
  gutter: number;
}

export interface EmergencyCardPdfTwoUpSlot {
  /** Source emergency card. Null when the slot is empty (odd count). */
  emergencyCard: PrescriberEmergencyCard | null;
  /** Blocks for this half-page slot. */
  blocks: EmergencyCardPdfBlock[];
  /** QR placement for this half-page slot. Null when slot is empty. */
  qr: EmergencyCardPdfQr | null;
  /** Slot warnings. */
  warnings: string[];
  /** Top-left x of the half-page content area. */
  slotX: number;
  /** Half-page content width. */
  slotW: number;
}

export interface EmergencyCardPdfTwoUpPageResult {
  page: EmergencyCardPdfTwoUpPage;
  left: EmergencyCardPdfTwoUpSlot;
  right: EmergencyCardPdfTwoUpSlot;
  /** True when the right slot is empty (last page of an odd run). */
  rightSlotEmpty: boolean;
  /** Pre-rendered cut-line marker location for the printer's eye. */
  centerLineX: number;
}

export interface EmergencyCardPdfTwoUpOptions {
  pageSize?: EmergencyCardPdfPageSize;
  /** Suggested QR size in points. Default 180 (smaller than single-up to fit a half page). */
  qrSize?: number;
  /** Footer text. Default "Printed YYYY-MM-DD by Med-Tracker". */
  footer?: string;
  /** Reference date for the default footer. Default new Date(). */
  printedAt?: Date;
  /** Document title rendered at the top of each card. */
  documentTitle?: string;
  /** Gutter width in points between left and right slots. Default 18 (~0.25"). */
  gutter?: number;
}

const DEFAULT_TITLE = 'EMERGENCY MEDICAL CONTACT';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncate(s: string, width: number, fontSize: number): string {
  const charsPerPoint = 1 / (fontSize * 0.55);
  const budget = Math.max(8, Math.floor(width * charsPerPoint));
  if (s.length <= budget) return s;
  if (budget <= 1) return s.slice(0, budget);
  return s.slice(0, budget - 1) + '\u2026';
}

interface SlotGeometry {
  slotX: number;
  slotW: number;
  pageH: number;
  margin: number;
}

function buildEmptySlot(geom: SlotGeometry): EmergencyCardPdfTwoUpSlot {
  return {
    emergencyCard: null,
    blocks: [],
    qr: null,
    warnings: [],
    slotX: geom.slotX,
    slotW: geom.slotW,
  };
}

function buildSlot(
  emergencyCard: PrescriberEmergencyCard,
  geom: SlotGeometry,
  qrSize: number,
  documentTitle: string,
  footerText: string,
): EmergencyCardPdfTwoUpSlot {
  const blocks: EmergencyCardPdfBlock[] = [];
  const { slotX, slotW, pageH, margin } = geom;
  let y = margin;

  // 1. Document title (top)
  blocks.push({
    kind: 'document-title',
    x: slotX,
    y,
    w: slotW,
    h: 22,
    fontSize: 12,
    text: truncate(documentTitle, slotW, 12),
    align: 'center',
    color: 'b91c1c',
    bold: true,
  });
  y += 26;

  // 2. Hero label + phone (always centre-aligned, max size)
  const heroLabelText =
    emergencyCard.onCall === null
      ? 'NO PHONE ON FILE'
      : emergencyCard.onCallSource === 'after-hours'
        ? 'CALL ON-CALL — 24/7'
        : 'CALL DAYTIME — FALLBACK';
  blocks.push({
    kind: 'hero-label',
    x: slotX,
    y,
    w: slotW,
    h: 14,
    fontSize: 10,
    text: heroLabelText,
    align: 'center',
    color: 'b91c1c',
    bold: true,
  });
  y += 18;

  const heroPhoneText = emergencyCard.onCall?.pretty ?? 'Ask patient';
  // Half-page narrower than single-up; cap a bit smaller.
  const heroFontSize = emergencyCard.onCall === null ? 22 : 36;
  blocks.push({
    kind: 'hero-phone',
    x: slotX,
    y,
    w: slotW,
    h: heroFontSize + 6,
    fontSize: heroFontSize,
    text: truncate(heroPhoneText, slotW, heroFontSize),
    align: 'center',
    color: '111827',
    bold: true,
  });
  y += heroFontSize + 12;

  // 3. Prescriber name + specialty
  blocks.push({
    kind: 'prescriber-name',
    x: slotX,
    y,
    w: slotW,
    h: 20,
    fontSize: 16,
    text: truncate(emergencyCard.displayName, slotW, 16),
    align: 'center',
    color: '111827',
    bold: true,
  });
  y += 24;

  if (emergencyCard.specialty) {
    blocks.push({
      kind: 'specialty',
      x: slotX,
      y,
      w: slotW,
      h: 16,
      fontSize: 12,
      text: truncate(emergencyCard.specialty, slotW, 12),
      align: 'center',
      color: '374151',
      bold: false,
    });
    y += 20;
  }

  if (emergencyCard.daytime) {
    blocks.push({
      kind: 'fallback-line',
      x: slotX,
      y,
      w: slotW,
      h: 14,
      fontSize: 11,
      text: truncate(`Daytime: ${emergencyCard.daytime.pretty}`, slotW, 11),
      align: 'center',
      color: '374151',
      bold: false,
    });
    y += 18;
  }

  // 4. QR code (centred in slot)
  const qrY = y + 12;
  const qrX = slotX + (slotW - qrSize) / 2;
  const vcardContents = renderVcard(emergencyCard.source as PrescriberContactCard);
  const qr: EmergencyCardPdfQr = {
    contents: vcardContents,
    size: qrSize,
    x: qrX,
    y: qrY,
    errorCorrection: 'M',
  };
  const qrCaptionY = qrY + qrSize + 6;
  blocks.push({
    kind: 'qr-caption',
    x: slotX,
    y: qrCaptionY,
    w: slotW,
    h: 12,
    fontSize: 9,
    text: 'Scan to import contact',
    align: 'center',
    color: '6b7280',
    bold: false,
  });
  y = qrCaptionY + 16;

  // 5. Warnings
  if (emergencyCard.warnings.length > 0) {
    const warningsText = `Warnings: ${emergencyCard.warnings.join(' | ')}`;
    blocks.push({
      kind: 'warning',
      x: slotX,
      y,
      w: slotW,
      h: 16,
      fontSize: 9,
      text: truncate(warningsText, slotW, 9),
      align: 'left',
      color: '92400e',
      bold: false,
    });
    y += 18;
  }

  // 6. Footer pinned to bottom of slot
  if (footerText) {
    blocks.push({
      kind: 'footer',
      x: slotX,
      y: pageH - margin - 10,
      w: slotW,
      h: 10,
      fontSize: 8,
      text: truncate(footerText, slotW, 8),
      align: 'center',
      color: '9ca3af',
      bold: false,
    });
  }

  return {
    emergencyCard,
    blocks,
    qr,
    warnings: emergencyCard.warnings.slice(),
    slotX,
    slotW,
  };
}

/**
 * Build a single landscape page containing up to two emergency cards
 * side-by-side. Pass `right=null` for the odd-count terminal page.
 *
 * The caller's PDF library walks `left.blocks + right.blocks` and
 * renders the two QR codes using `left.qr.contents` / `right.qr.contents`.
 */
export function buildEmergencyCardPdfTwoUpPage(
  left: PrescriberEmergencyCard,
  right: PrescriberEmergencyCard | null,
  options: EmergencyCardPdfTwoUpOptions = {},
): EmergencyCardPdfTwoUpPageResult {
  const pageSize = options.pageSize ?? 'letter';
  const { width: pageW, height: pageH } = LANDSCAPE_PAGE_SIZES[pageSize];
  const margin = 36; // 0.5"
  const gutter = Math.max(0, options.gutter ?? 18);
  const halfWidth = (pageW - 2 * margin - gutter) / 2;
  const leftX = margin;
  const rightX = margin + halfWidth + gutter;
  const centerLineX = margin + halfWidth + gutter / 2;
  const qrSize = Math.max(72, options.qrSize ?? 180);
  const documentTitle = options.documentTitle ?? DEFAULT_TITLE;
  const footerText = options.footer ?? `Printed ${isoDate(options.printedAt ?? new Date())} by Med-Tracker`;

  const page: EmergencyCardPdfTwoUpPage = { width: pageW, height: pageH, margin, gutter };
  const leftGeom: SlotGeometry = { slotX: leftX, slotW: halfWidth, pageH, margin };
  const rightGeom: SlotGeometry = { slotX: rightX, slotW: halfWidth, pageH, margin };

  const leftSlot = buildSlot(left, leftGeom, qrSize, documentTitle, footerText);
  const rightSlot =
    right === null ? buildEmptySlot(rightGeom) : buildSlot(right, rightGeom, qrSize, documentTitle, footerText);

  return {
    page,
    left: leftSlot,
    right: rightSlot,
    rightSlotEmpty: right === null,
    centerLineX,
  };
}

/**
 * Build a multi-page two-up roster. Cards pair off in input order
 * (1+2, 3+4, ...); an odd count produces a final page with the
 * right slot empty.
 */
export function buildEmergencyCardPdfTwoUpPages(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpOptions = {},
): EmergencyCardPdfTwoUpPageResult[] {
  const pages: EmergencyCardPdfTwoUpPageResult[] = [];
  for (let i = 0; i < emergencyCards.length; i += 2) {
    const left = emergencyCards[i]!;
    const right = emergencyCards[i + 1] ?? null;
    pages.push(buildEmergencyCardPdfTwoUpPage(left, right, options));
  }
  return pages;
}

/**
 * Compute the page count a two-up roster would produce. Always
 * `ceil(n / 2)`.
 */
export function emergencyCardPdfTwoUpPageCount(
  emergencyCards: PrescriberEmergencyCard[],
): number {
  return Math.ceil(emergencyCards.length / 2);
}
