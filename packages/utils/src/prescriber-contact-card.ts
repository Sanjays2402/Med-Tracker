/**
 * Prescriber contact card.
 *
 * `prescriber-directory.ts` produces deduplicated CanonicalPrescriber
 * records — the "who prescribes what" rollup. But when a patient or
 * caregiver actually needs to CALL the prescriber (refill blocked at
 * pharmacy, side-effect question, lab follow-up), they need a wallet-
 * pocket reference card: name, specialty, phone, fax, NPI, address,
 * and the medications this prescriber actually writes for the patient.
 *
 * This module takes a CanonicalPrescriber + optional contact fields
 * and produces:
 *
 *   - a structured `PrescriberContactCard` (mobile UI; phone/fax are
 *     normalised to digit-only forms suitable for `tel:` / `fax:`
 *     URIs), and
 *   - a wallet-printable plain-text block sized to 3.5x2" business-
 *     card dimensions (8 lines max, 32 chars wide), and
 *   - a vCard-style text export (RFC 6350 subset) so the UI can offer
 *     "save to contacts" on iOS / Android without an HTTP call.
 *
 * Pure / deterministic. No I/O.
 */

import type { CanonicalPrescriber } from './prescriber-directory';

export interface PrescriberContactInput {
  /** Canonical prescriber row from prescriber-directory output. */
  prescriber: CanonicalPrescriber;
  /** Office phone in any format; normalised to digits for `tel:`. */
  phone?: string;
  /** Office fax in any format. */
  fax?: string;
  /** Office or after-hours pager. */
  pager?: string;
  /** Email address. Validated as a simple `local@domain` string. */
  email?: string;
  /** Office street address (one line). */
  addressLine?: string;
  /** Office city. */
  city?: string;
  /** Office state (2-letter US, or free-form for non-US). */
  state?: string;
  /** Office postal/zip code. */
  postalCode?: string;
  /** Best-known clinic / hospital name. */
  practiceName?: string;
  /** Best-known scheduling URL (often a portal). */
  schedulingUrl?: string;
  /** Optional after-hours / on-call number. */
  afterHoursPhone?: string;
}

export interface PrescriberPhoneNumber {
  /** Original free-form input. */
  raw: string;
  /** Digits only, suitable for `tel:` / `fax:` URIs. */
  digits: string;
  /**
   * E.164-style number with leading `+`. 10-digit US numbers are
   * promoted to +1NNNNNNNNNN; 11-digit numbers starting with 1 are
   * kept as +1NNNNNNNNNN; other lengths are emitted as `+<digits>`
   * without further assumption.
   */
  e164: string;
  /** Best-guess pretty form: (xxx) xxx-xxxx for 10-digit US, raw otherwise. */
  pretty: string;
  /** True when digits is a plausible NANP 10-digit number. */
  valid: boolean;
}

export interface PrescriberContactCard {
  /** Reference back to the canonical prescriber. */
  prescriberId: string;
  /** "Last, First M." display name. */
  displayName: string;
  /** Specialty (title-cased for display). Undefined when unknown. */
  specialty?: string;
  /** Practice / clinic name. */
  practiceName?: string;
  /** NPI as-stored when known and valid. */
  npi?: string;
  /** True when NPI passed Luhn-mod-10 in prescriber-directory. */
  npiValid: boolean;
  phone?: PrescriberPhoneNumber;
  fax?: PrescriberPhoneNumber;
  pager?: PrescriberPhoneNumber;
  afterHoursPhone?: PrescriberPhoneNumber;
  email?: string;
  /** Single-line address suitable for one print line. */
  address?: string;
  schedulingUrl?: string;
  /** Medications this prescriber writes for the patient. */
  medicationIds: string[];
  /**
   * Warnings the UI should surface ("phone invalid", "no contact
   * methods on file"). Empty when card is complete and usable.
   */
  warnings: string[];
}

export interface BuildContactCardOptions {
  /**
   * If the card has no phone AND no email AND no address, add the
   * "no-contact-method" warning. Default true. Disable for legal-record
   * exports where you want the card even when contact is unknown.
   */
  warnOnMissingContact?: boolean;
}

const US_PHONE_LEN = 10;
const US_PHONE_PLUS1_LEN = 11;
const PRINT_WIDTH = 32;
const PRINT_MAX_LINES = 8;

function normalizePhone(raw: string | undefined): PrescriberPhoneNumber | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/[^\d]/g, '');
  let valid = false;
  let pretty = trimmed;
  let e164 = `+${digits}`;
  if (digits.length === US_PHONE_LEN) {
    pretty = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    e164 = `+1${digits}`;
    valid = true;
  } else if (digits.length === US_PHONE_PLUS1_LEN && digits.startsWith('1')) {
    pretty = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    e164 = `+${digits}`;
    valid = true;
  } else if (digits.length >= 7 && digits.length <= 15) {
    // E.164-like international, no specific pretty rule beyond the raw.
    pretty = trimmed;
    e164 = `+${digits}`;
    valid = digits.length >= 7;
  }
  return { raw: trimmed, digits, e164, pretty, valid };
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

function normalizeEmail(raw: string | undefined): { email?: string; warning?: string } {
  if (raw === undefined) return {};
  const t = raw.trim();
  if (!t) return {};
  if (!EMAIL_RE.test(t)) return { warning: 'email format looks invalid' };
  return { email: t.toLowerCase() };
}

function formatAddress(input: PrescriberContactInput): string | undefined {
  const parts: string[] = [];
  if (input.addressLine && input.addressLine.trim()) parts.push(input.addressLine.trim());
  const cityState: string[] = [];
  if (input.city && input.city.trim()) cityState.push(input.city.trim());
  if (input.state && input.state.trim()) cityState.push(input.state.trim());
  const cityStateStr = cityState.join(', ');
  let postal = '';
  if (input.postalCode && input.postalCode.trim()) postal = input.postalCode.trim();
  if (cityStateStr && postal) parts.push(`${cityStateStr} ${postal}`);
  else if (cityStateStr) parts.push(cityStateStr);
  else if (postal) parts.push(postal);
  if (parts.length === 0) return undefined;
  return parts.join(', ');
}

function specialtyDisplay(canonicalSpecialty?: string): string | undefined {
  if (!canonicalSpecialty) return undefined;
  // Canonical specialty in directory is lowercased; title-case for display.
  return canonicalSpecialty
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Build a prescriber contact card from a canonical prescriber and
 * the contact metadata for that office. Validates and normalises
 * each field; surfaces warnings for inputs that look malformed but
 * does NOT throw.
 */
export function buildPrescriberContactCard(
  input: PrescriberContactInput,
  options: BuildContactCardOptions = {},
): PrescriberContactCard {
  const warnOnMissingContact = options.warnOnMissingContact ?? true;
  const warnings: string[] = [];

  const phone = normalizePhone(input.phone);
  if (input.phone && phone && !phone.valid) warnings.push('phone number is not 10 digits');

  const fax = normalizePhone(input.fax);
  if (input.fax && fax && !fax.valid) warnings.push('fax number is not 10 digits');

  const pager = normalizePhone(input.pager);
  if (input.pager && pager && !pager.valid) warnings.push('pager number is not 10 digits');

  const afterHoursPhone = normalizePhone(input.afterHoursPhone);
  if (input.afterHoursPhone && afterHoursPhone && !afterHoursPhone.valid) {
    warnings.push('after-hours phone is not 10 digits');
  }

  const emailNorm = normalizeEmail(input.email);
  if (emailNorm.warning) warnings.push(emailNorm.warning);

  const address = formatAddress(input);

  if (input.prescriber.npi && !input.prescriber.npiValid) {
    warnings.push('NPI failed Luhn validation');
  }

  const hasContact = Boolean(phone || fax || emailNorm.email || address || afterHoursPhone);
  if (warnOnMissingContact && !hasContact) {
    warnings.push('no contact method on file');
  }

  const card: PrescriberContactCard = {
    prescriberId: input.prescriber.id,
    displayName: input.prescriber.displayName,
    npiValid: input.prescriber.npiValid,
    medicationIds: input.prescriber.medicationIds.slice(),
    warnings,
  };

  const sp = specialtyDisplay(input.prescriber.specialty);
  if (sp !== undefined) card.specialty = sp;
  if (input.practiceName && input.practiceName.trim()) card.practiceName = input.practiceName.trim();
  if (input.prescriber.npi) card.npi = input.prescriber.npi;
  if (phone) card.phone = phone;
  if (fax) card.fax = fax;
  if (pager) card.pager = pager;
  if (afterHoursPhone) card.afterHoursPhone = afterHoursPhone;
  if (emailNorm.email) card.email = emailNorm.email;
  if (address) card.address = address;
  if (input.schedulingUrl && input.schedulingUrl.trim()) {
    card.schedulingUrl = input.schedulingUrl.trim();
  }
  return card;
}

function truncateLine(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + '…';
}

/**
 * Render a wallet-card text layout (3.5x2" business-card sizing
 * @ ~32 cols, 8 lines max). The block is intended to be printed
 * with a fixed-pitch font; longer lines are truncated with an
 * ellipsis. Returned as a `\n`-joined string with no trailing
 * newline.
 */
export function renderWalletCard(card: PrescriberContactCard): string {
  const lines: string[] = [];
  lines.push(truncateLine(card.displayName, PRINT_WIDTH));
  if (card.specialty) lines.push(truncateLine(card.specialty, PRINT_WIDTH));
  if (card.practiceName) lines.push(truncateLine(card.practiceName, PRINT_WIDTH));
  if (card.phone) lines.push(truncateLine(`Tel ${card.phone.pretty}`, PRINT_WIDTH));
  if (card.afterHoursPhone) {
    lines.push(truncateLine(`AH  ${card.afterHoursPhone.pretty}`, PRINT_WIDTH));
  }
  if (card.fax) lines.push(truncateLine(`Fax ${card.fax.pretty}`, PRINT_WIDTH));
  if (card.address) lines.push(truncateLine(card.address, PRINT_WIDTH));
  if (card.npi) lines.push(truncateLine(`NPI ${card.npi}`, PRINT_WIDTH));
  return lines.slice(0, PRINT_MAX_LINES).join('\n');
}

function escapeVcard(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldVcardLine(line: string): string {
  // RFC 6350: lines longer than 75 octets SHOULD be folded; we fold
  // at 75 chars (close enough for ASCII) by inserting CRLF + space.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  // First chunk is 75 chars; continuation chunks are 74 (1 leading space).
  chunks.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

/**
 * Render an RFC 6350 (vCard 4.0) compatible block. Subset only —
 * we emit the fields any modern address book reads (FN, N, ORG,
 * TITLE, TEL, EMAIL, ADR, URL, NOTE). Lines longer than 75 chars
 * are folded per spec. Output uses `\r\n` line endings as required.
 */
export function renderVcard(card: PrescriberContactCard): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:4.0');
  lines.push(`FN:${escapeVcard(card.displayName)}`);
  // N is structured (Family;Given;Additional;Prefix;Suffix). Our display
  // name is "Last, First M." — extract the parts back without parsing
  // honorifics again by splitting on the comma.
  const commaIdx = card.displayName.indexOf(',');
  let family = '';
  let given = '';
  if (commaIdx > 0) {
    family = card.displayName.slice(0, commaIdx).trim();
    given = card.displayName.slice(commaIdx + 1).trim();
  } else {
    family = card.displayName;
  }
  lines.push(`N:${escapeVcard(family)};${escapeVcard(given)};;;`);
  if (card.practiceName) lines.push(`ORG:${escapeVcard(card.practiceName)}`);
  if (card.specialty) lines.push(`TITLE:${escapeVcard(card.specialty)}`);
  if (card.phone) lines.push(`TEL;TYPE=work,voice;VALUE=uri:tel:${card.phone.e164}`);
  if (card.afterHoursPhone) {
    lines.push(`TEL;TYPE=work,voice;VALUE=uri:tel:${card.afterHoursPhone.e164}`);
  }
  if (card.fax) lines.push(`TEL;TYPE=work,fax;VALUE=uri:tel:${card.fax.e164}`);
  if (card.pager) lines.push(`TEL;TYPE=pager;VALUE=uri:tel:${card.pager.e164}`);
  if (card.email) lines.push(`EMAIL;TYPE=work:${escapeVcard(card.email)}`);
  if (card.address) lines.push(`ADR;TYPE=work:;;${escapeVcard(card.address)};;;;`);
  if (card.schedulingUrl) lines.push(`URL:${escapeVcard(card.schedulingUrl)}`);
  if (card.npi) lines.push(`NOTE:NPI ${card.npi}${card.npiValid ? '' : ' (unverified)'}`);
  lines.push('END:VCARD');
  return lines.map(foldVcardLine).join('\r\n');
}

/**
 * Build cards for every prescriber in a directory, given a sparse
 * lookup map (prescriber id -> contact metadata). Prescribers without
 * an entry in the lookup get cards built from directory-only data
 * (and will likely accrue a "no contact method on file" warning).
 */
export function buildContactCardsForDirectory(
  prescribers: CanonicalPrescriber[],
  contacts: Record<string, Omit<PrescriberContactInput, 'prescriber'>>,
  options?: BuildContactCardOptions,
): PrescriberContactCard[] {
  return prescribers.map((p) =>
    buildPrescriberContactCard({ prescriber: p, ...(contacts[p.id] ?? {}) }, options),
  );
}
