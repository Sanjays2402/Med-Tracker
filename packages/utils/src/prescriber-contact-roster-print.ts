/**
 * Prescriber contact roster print layout.
 *
 * `prescriber-contact-card.ts` produces a single wallet-card text
 * block per prescriber. That's the right shape for "save to
 * contacts" / "print this one card" workflows.
 *
 * But the patient with a complex regimen often has 4-8 prescribers
 * (PCP, cardiologist, endocrinologist, hospital teams). Printing 8
 * separate wallet cards costs 8 pages — and falls apart at the
 * front desk when the receptionist needs "all your providers" at a
 * glance. The right artifact is a SINGLE-PAGE roster that lays out
 * every card on one sheet of letter-sized paper.
 *
 * This module is that layout. Given a list of PrescriberContactCard
 * objects, it produces a paginated text grid:
 *
 *   - Default page: US Letter (US 8.5x11") rendered at 80 cols x 60
 *     rows in a 10-cpi monospace font (Courier 12pt @ 8 cards/page
 *     in a 2-column x 4-row grid; A4 / wallet-sized variants are
 *     parameterised).
 *   - Each card is bordered, max 8 lines, max 35 columns wide so
 *     two cards sit comfortably side-by-side with column gutter.
 *   - Cards are grouped by specialty for one-page overview; the
 *     order within a group is alphabetical.
 *   - Multiple pages when card count exceeds per-page slot count;
 *     each page gets a header line ("Prescriber roster — page X of Y").
 *
 * Pure / deterministic. No I/O. Composes only PrescriberContactCard
 * outputs — does not reach into the directory or build cards itself
 * (callers should compose buildContactCardsForDirectory + this).
 */

import type { PrescriberContactCard } from './prescriber-contact-card';

export interface ContactRosterOptions {
  /**
   * Page width in columns. Default 80 (US Letter @ 10cpi). Set to
   * 84 for A4 with narrow margins.
   */
  pageWidth?: number;
  /**
   * Page height in rows. Default 60 (US Letter @ 6lpi minus 6 line
   * margin top/bottom). A4 default 64.
   */
  pageHeight?: number;
  /**
   * Per-card width. Default 35 (fits 2 columns x 35 cols + 10-col
   * gutter into 80). Cards are ALWAYS bordered.
   */
  cardWidth?: number;
  /**
   * Per-card height (inner lines + border). Default 10.
   */
  cardHeight?: number;
  /**
   * Number of horizontal gap columns between cards. Default 2.
   */
  columnGap?: number;
  /**
   * Number of blank rows between cards vertically. Default 1.
   */
  rowGap?: number;
  /**
   * Group cards by specialty? Default true. False renders strict
   * alphabetical across the whole roster.
   */
  groupBySpecialty?: boolean;
  /**
   * Patient name to include in the page header. Optional.
   */
  patientName?: string;
  /**
   * Document title for the page header. Default "Prescriber roster".
   */
  title?: string;
}

export interface RosterPage {
  /** 1-based page number. */
  page: number;
  totalPages: number;
  /** Page text (header + body). */
  text: string;
  /** Cards rendered on this page in order. */
  cards: PrescriberContactCard[];
}

export interface ContactRoster {
  pages: RosterPage[];
  totalCards: number;
  /** Page width used. */
  pageWidth: number;
  /** Card width used. */
  cardWidth: number;
}

function truncate(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + '\u2026';
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return truncate(s, width);
  return s + ' '.repeat(width - s.length);
}

function renderRosterCard(
  card: PrescriberContactCard,
  width: number,
  height: number,
): string[] {
  // Compose 1 line per: name, specialty, practice, phone, fax, address.
  // Always border. Truncate / pad to fit width x height.
  const innerWidth = width - 2;
  const innerHeight = height - 2;
  const lines: string[] = [];
  lines.push(truncate(card.displayName, innerWidth));
  if (card.specialty) lines.push(truncate(card.specialty, innerWidth));
  if (card.practiceName) lines.push(truncate(card.practiceName, innerWidth));
  if (card.phone) lines.push(truncate(`Tel ${card.phone.pretty}`, innerWidth));
  if (card.afterHoursPhone) lines.push(truncate(`AH  ${card.afterHoursPhone.pretty}`, innerWidth));
  if (card.fax) lines.push(truncate(`Fax ${card.fax.pretty}`, innerWidth));
  if (card.address) lines.push(truncate(card.address, innerWidth));
  if (card.npi) lines.push(truncate(`NPI ${card.npi}`, innerWidth));
  // Pad with blank lines so card always renders to its full footprint.
  while (lines.length < innerHeight) lines.push('');
  // Hard cap when too many lines (preserve top N).
  const capped = lines.slice(0, innerHeight);
  const top = '+' + '-'.repeat(innerWidth) + '+';
  const bottom = top;
  const middle = capped.map((l) => '|' + padRight(l, innerWidth) + '|');
  return [top, ...middle, bottom];
}

function specialtyGroupKey(card: PrescriberContactCard): string {
  // Empty specialty buckets to "(unspecified)" so the group still
  // renders together rather than sprinkling unmatched cards.
  return card.specialty?.trim() || '(unspecified)';
}

function chunkCardsForPage<T>(cards: T[], perPage: number): T[][] {
  if (perPage <= 0) return [[...cards]];
  const out: T[][] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    out.push(cards.slice(i, i + perPage));
  }
  // No cards at all: still return a single empty page so we can
  // render "no prescribers on file" header.
  if (out.length === 0) out.push([]);
  return out;
}

function renderRow(
  rowCards: PrescriberContactCard[],
  cardWidth: number,
  cardHeight: number,
  columnGap: number,
): string[] {
  // Render each card as its own array of lines, then zip column-wise.
  const rendered = rowCards.map((c) => renderRosterCard(c, cardWidth, cardHeight));
  const lines: string[] = [];
  for (let row = 0; row < cardHeight; row++) {
    const parts: string[] = [];
    for (let col = 0; col < rendered.length; col++) {
      parts.push(rendered[col]![row]!);
      if (col < rendered.length - 1) parts.push(' '.repeat(columnGap));
    }
    lines.push(parts.join(''));
  }
  return lines;
}

function gridForPage(
  pageCards: PrescriberContactCard[],
  cardsPerRow: number,
  cardWidth: number,
  cardHeight: number,
  columnGap: number,
  rowGap: number,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < pageCards.length; i += cardsPerRow) {
    const row = pageCards.slice(i, i + cardsPerRow);
    const rowLines = renderRow(row, cardWidth, cardHeight, columnGap);
    if (lines.length > 0 && rowGap > 0) {
      for (let g = 0; g < rowGap; g++) lines.push('');
    }
    for (const l of rowLines) lines.push(l);
  }
  return lines;
}

/**
 * Build a 1-page-or-more roster of prescriber contact cards.
 *
 * Default layout: 80-col x 60-row pages, 35-col x 10-row cards, 2
 * columns x 5 rows per page = 10 cards per page. The page rolls
 * automatically when the roster exceeds the slot count.
 *
 * Grouping: when groupBySpecialty=true (default), cards are sorted
 * by specialty group, then alphabetically within each group. Groups
 * do NOT span pages — when a group's tail won't fit on the current
 * page, the page is padded out and the next group starts at the top
 * of the next page. (This keeps each page coherent at the front
 * desk.) The exception: a single group that exceeds one page DOES
 * span pages — splitting in that case is the only option.
 */
export function buildContactRoster(
  cards: PrescriberContactCard[],
  options: ContactRosterOptions = {},
): ContactRoster {
  const pageWidth = Math.max(40, options.pageWidth ?? 80);
  const pageHeight = Math.max(10, options.pageHeight ?? 60);
  const cardWidth = Math.max(20, options.cardWidth ?? 35);
  const cardHeight = Math.max(6, options.cardHeight ?? 10);
  const columnGap = Math.max(0, options.columnGap ?? 2);
  const rowGap = Math.max(0, options.rowGap ?? 1);
  const groupBySpecialty = options.groupBySpecialty ?? true;
  const title = options.title ?? 'Prescriber roster';
  const headerLines = 2; // 1 title + 1 blank

  // Cards per page calculation.
  const cardsPerRow = Math.max(1, Math.floor((pageWidth + columnGap) / (cardWidth + columnGap)));
  const usableHeight = pageHeight - headerLines;
  const rowsPerPage = Math.max(1, Math.floor((usableHeight + rowGap) / (cardHeight + rowGap)));
  const cardsPerPage = cardsPerRow * rowsPerPage;

  // Sort the cards.
  let ordered: PrescriberContactCard[] = [...cards];
  if (groupBySpecialty) {
    ordered.sort((a, b) => {
      const ga = specialtyGroupKey(a);
      const gb = specialtyGroupKey(b);
      if (ga !== gb) return ga.localeCompare(gb);
      return a.displayName.localeCompare(b.displayName);
    });
  } else {
    ordered.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Build page partitions. When grouped, try to keep group on one
  // page; if a group exceeds cardsPerPage, allow split.
  const pages: PrescriberContactCard[][] = [];
  if (!groupBySpecialty) {
    for (const chunk of chunkCardsForPage(ordered, cardsPerPage)) pages.push(chunk);
  } else {
    // Group by specialty, then pack groups into pages greedily.
    type Group = { key: string; cards: PrescriberContactCard[] };
    const groups: Group[] = [];
    for (const card of ordered) {
      const key = specialtyGroupKey(card);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.cards.push(card);
      } else {
        groups.push({ key, cards: [card] });
      }
    }
    let current: PrescriberContactCard[] = [];
    for (const g of groups) {
      // If the group is bigger than cardsPerPage, flush current and
      // chunk the group across pages.
      if (g.cards.length > cardsPerPage) {
        if (current.length > 0) {
          pages.push(current);
          current = [];
        }
        for (const chunk of chunkCardsForPage(g.cards, cardsPerPage)) pages.push(chunk);
        continue;
      }
      // If the group doesn't fit in the remaining slots, flush.
      if (current.length + g.cards.length > cardsPerPage) {
        pages.push(current);
        current = [];
      }
      current.push(...g.cards);
    }
    if (current.length > 0) pages.push(current);
    if (pages.length === 0) pages.push([]);
  }

  // Render each page.
  const totalPages = pages.length;
  const rosterPages: RosterPage[] = pages.map((pageCards, idx) => {
    const headerParts: string[] = [];
    let pageTitle = title;
    if (options.patientName) pageTitle = `${title} for ${options.patientName}`;
    pageTitle = `${pageTitle} (page ${idx + 1} of ${totalPages})`;
    headerParts.push(truncate(pageTitle, pageWidth));
    headerParts.push('');
    if (pageCards.length === 0) {
      headerParts.push('No prescribers on file.');
    } else {
      const gridLines = gridForPage(pageCards, cardsPerRow, cardWidth, cardHeight, columnGap, rowGap);
      // Cap to page height (defensive — should already be inside budget).
      const room = pageHeight - headerParts.length;
      for (const l of gridLines.slice(0, room)) headerParts.push(l);
    }
    return {
      page: idx + 1,
      totalPages,
      text: headerParts.join('\n'),
      cards: pageCards,
    };
  });

  return {
    pages: rosterPages,
    totalCards: cards.length,
    pageWidth,
    cardWidth,
  };
}

/**
 * Convenience: join every page's text into a single string with a
 * form-feed (\x0c) between pages, matching the POSIX/printer "page
 * break" convention. Useful for piping to lpr or printer-friendly
 * downloads.
 */
export function serializeRoster(roster: ContactRoster): string {
  return roster.pages.map((p) => p.text).join('\n\u000c\n');
}
