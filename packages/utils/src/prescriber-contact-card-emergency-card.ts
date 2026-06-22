/**
 * Prescriber contact card emergency variant.
 *
 * `prescriber-contact-card` produces a wallet-printable contact card
 * with the standard hierarchy: name, specialty, practice, phone,
 * after-hours phone, fax, address. That layout is the right default
 * for refill calls and routine portal questions. It is the WRONG
 * layout for an emergency-room handoff:
 *
 *   - The ED clerk needs the ON-CALL number first, at the LARGEST
 *     font, NOT buried below the daytime line.
 *   - Specialty matters more than the practice address (the patient
 *     is already at the ED; nobody is mailing the prescriber
 *     anything).
 *   - NPI is irrelevant in an emergency; fax is irrelevant; the
 *     scheduling URL is irrelevant.
 *
 * This module is the emergency-card variant: same input + canonical
 * prescriber, restructured layout that promotes after-hours / on-call
 * to the top of the card with a visible "EMERGENCY" header. Other
 * contact methods are kept as fallbacks below.
 *
 * Output is a structured object PLUS a printable text block. We
 * deliberately do NOT depend on a UI layer for the heading — the
 * text block uses ASCII to emphasise the on-call line so it remains
 * the top line even when rendered as plain text on a black-and-white
 * pharmacy printer at the ED.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  PrescriberContactCard,
  PrescriberPhoneNumber,
} from './prescriber-contact-card';

export interface PrescriberEmergencyCard {
  /** Source contact card this emergency variant was built from. */
  source: PrescriberContactCard;
  /** Prescriber's display name. */
  displayName: string;
  /** Specialty (title-cased). May be undefined when unknown. */
  specialty?: string;
  /** The on-call phone if present, else the daytime phone, else null. */
  onCall: PrescriberPhoneNumber | null;
  /** Where the on-call number came from. */
  onCallSource: 'after-hours' | 'daytime' | 'none';
  /** Daytime phone, kept as a fallback line. */
  daytime?: PrescriberPhoneNumber;
  /** ED-only warnings (specialty unknown, no on-call number, etc). */
  warnings: string[];
}

const ED_PRINT_WIDTH = 32;
const ED_MAX_LINES = 8;

function truncate(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + '\u2026';
}

function centerLine(s: string, width: number): string {
  if (s.length >= width) return truncate(s, width);
  const pad = width - s.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

/**
 * Build an emergency-card view of a prescriber. The input card is
 * the standard PrescriberContactCard from buildPrescriberContactCard;
 * this layer restructures the order, picks the on-call number, and
 * surfaces an ED-specific warning set.
 *
 * Rules:
 *   - On-call line = afterHoursPhone if present, else phone, else
 *     null (and a "no emergency phone on file" warning).
 *   - Specialty must be present for an ED card; missing specialty
 *     adds a warning so the ED desk can flag it for the patient.
 *   - The emergency card does NOT show fax / pager / NPI / address /
 *     scheduling URL — they are out of scope for an ED handoff.
 */
export function buildEmergencyCard(card: PrescriberContactCard): PrescriberEmergencyCard {
  const warnings: string[] = [];

  let onCall: PrescriberPhoneNumber | null = null;
  let onCallSource: PrescriberEmergencyCard['onCallSource'] = 'none';
  if (card.afterHoursPhone) {
    onCall = card.afterHoursPhone;
    onCallSource = 'after-hours';
  } else if (card.phone) {
    onCall = card.phone;
    onCallSource = 'daytime';
    warnings.push(
      'No dedicated after-hours number on file; daytime number used as fallback.',
    );
  } else {
    warnings.push('No emergency phone number on file.');
  }

  if (!card.specialty) {
    warnings.push('Specialty unknown — confirm with the patient.');
  }

  const out: PrescriberEmergencyCard = {
    source: card,
    displayName: card.displayName,
    onCall,
    onCallSource,
    warnings,
  };
  if (card.specialty) out.specialty = card.specialty;
  if (card.phone && onCallSource !== 'daytime') out.daytime = card.phone;
  return out;
}

/**
 * Render the emergency card as an ASCII-bordered plain-text block
 * sized for a 3.5x2" business card. The on-call line is centred and
 * surrounded by `===` separators so it visually dominates the card.
 *
 * Layout (8 lines max @ 32 cols):
 *   1. centered "EMERGENCY CONTACT"
 *   2. ===============================
 *   3. centered on-call pretty number (largest visual weight)
 *   4. centered on-call label ("On-call" / "Daytime" / etc)
 *   5. ===============================
 *   6. prescriber display name (left)
 *   7. specialty (left) - optional
 *   8. "Tel <daytime>" - optional fallback
 *
 * When the on-call number is null, the emphasis row shows "NO PHONE
 * ON FILE" — the ED clerk knows immediately to ask the patient.
 */
export function renderEmergencyCardText(card: PrescriberEmergencyCard): string {
  const lines: string[] = [];
  lines.push(centerLine('EMERGENCY CONTACT', ED_PRINT_WIDTH));
  lines.push('='.repeat(ED_PRINT_WIDTH));

  if (card.onCall) {
    lines.push(centerLine(card.onCall.pretty, ED_PRINT_WIDTH));
    const label = card.onCallSource === 'after-hours' ? 'On-call' : 'Daytime line (fallback)';
    lines.push(centerLine(label, ED_PRINT_WIDTH));
  } else {
    lines.push(centerLine('NO PHONE ON FILE', ED_PRINT_WIDTH));
    lines.push(centerLine('Ask patient for contact', ED_PRINT_WIDTH));
  }
  lines.push('='.repeat(ED_PRINT_WIDTH));

  lines.push(truncate(card.displayName, ED_PRINT_WIDTH));
  if (card.specialty) lines.push(truncate(card.specialty, ED_PRINT_WIDTH));
  if (card.daytime) lines.push(truncate(`Tel ${card.daytime.pretty}`, ED_PRINT_WIDTH));

  return lines.slice(0, ED_MAX_LINES).join('\n');
}

/**
 * Render the emergency card as a minimal HTML fragment with the
 * on-call number as the visual hero (large, bold). Inline styles
 * because pharmacy / portal email rendering strips <style>.
 */
export function renderEmergencyCardHtml(card: PrescriberEmergencyCard): string {
  const escapeHtml = (s: string): string =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const onCallBlock = card.onCall
    ? `<div style="font-size:13px;color:#b91c1c;font-weight:600;letter-spacing:0.08em;">` +
      `${card.onCallSource === 'after-hours' ? 'ON-CALL' : 'DAYTIME (FALLBACK)'}` +
      `</div>` +
      `<div style="font-size:32px;font-weight:700;color:#111827;margin:6px 0 4px 0;">` +
      `<a href="tel:${escapeHtml(card.onCall.e164)}" style="color:#111827;text-decoration:none;">` +
      `${escapeHtml(card.onCall.pretty)}` +
      `</a></div>`
    : `<div style="font-size:13px;color:#b91c1c;font-weight:600;letter-spacing:0.08em;">NO PHONE ON FILE</div>` +
      `<div style="font-size:16px;color:#374151;margin:6px 0;">Ask patient for contact info.</div>`;
  const specialtyLine = card.specialty
    ? `<div style="font-size:13px;color:#374151;">${escapeHtml(card.specialty)}</div>`
    : '';
  const daytimeLine = card.daytime
    ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Daytime ${escapeHtml(card.daytime.pretty)}</div>`
    : '';
  const warningsBlock =
    card.warnings.length > 0
      ? `<div style="font-size:11px;color:#92400e;background:#fef3c7;padding:4px 8px;margin-top:8px;border-radius:4px;">` +
        card.warnings.map((w) => `<div>${escapeHtml(w)}</div>`).join('') +
        `</div>`
      : '';
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:12px;border:2px solid #b91c1c;border-radius:6px;max-width:360px;">` +
    `<div style="font-size:11px;color:#b91c1c;font-weight:700;letter-spacing:0.12em;">EMERGENCY CONTACT</div>` +
    onCallBlock +
    `<div style="font-size:16px;font-weight:600;color:#111827;margin-top:8px;">${escapeHtml(card.displayName)}</div>` +
    specialtyLine +
    daytimeLine +
    warningsBlock +
    `</div>`
  );
}

/**
 * Convenience: build emergency cards for a list of contact cards in
 * one call. Cards are returned in the same order as the input.
 */
export function buildEmergencyCards(
  cards: PrescriberContactCard[],
): PrescriberEmergencyCard[] {
  return cards.map(buildEmergencyCard);
}

/**
 * Convenience: filter to cards that have NO emergency phone on file.
 * The ED handoff workflow uses this to surface a "missing data"
 * action list at intake.
 */
export function findCardsWithoutEmergencyPhone(
  cards: PrescriberEmergencyCard[],
): PrescriberEmergencyCard[] {
  return cards.filter((c) => c.onCall === null);
}
