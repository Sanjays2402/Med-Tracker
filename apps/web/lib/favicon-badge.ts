/**
 * favicon-badge — pure SVG-data-URI favicon builder with an unread badge dot.
 *
 * The /notifications page already reflects the unread total in the browser tab
 * TITLE ("(3) Notifications"). This pairs that with a small coral dot on the
 * favicon when unread > 0, so a backgrounded tab signals "something's waiting"
 * at a glance even when the title is truncated to just the app name.
 *
 * The icon is built as an inline SVG data URI — no <canvas>, no network, no
 * native deps — so it is deterministic and works server-or-client. It mirrors
 * the static /favicon.svg art (sage rounded square + white pill) and stamps a
 * coral circle in the top-right corner when there is unread.
 *
 * "Reduced data" gate: callers on a metered/save-data connection can pass
 * reducedData=true to fall back to the plain static /favicon.svg path and skip
 * generating a data URI at all (the hint in the roadmap: "pure gate, no canvas
 * if reduced data"). No React; the page swaps the <link rel="icon"> href.
 */

/** The static favicon path shipped in /public — the no-badge / fallback icon. */
export const STATIC_FAVICON_HREF = '/favicon.svg';

/** Art colours, matching public/favicon.svg + the sage/coral design tokens. */
const BG = '#2aa06b'; // sage rounded square (matches the static favicon)
const PILL = '#ffffff'; // white pill glyph
const BADGE = '#c95f3e'; // coral unread dot (matches --danger light)
const BADGE_RING = '#faf7f2'; // page background, as a separating ring around the dot

export interface FaviconBadgeOptions {
  /**
   * When true, skip the generated data URI and return the static favicon path.
   * For metered / save-data connections (navigator.connection.saveData) where a
   * per-render data URI swap isn't worth it. Default false.
   */
  reducedData?: boolean;
}

/** The base art (no badge): a sage rounded square with a white pill. */
function baseArt(): string {
  return (
    `<rect width="64" height="64" rx="14" fill="${BG}"/>` +
    `<path d="M22 18h20a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z" fill="${PILL}"/>`
  );
}

/** The coral unread dot in the top-right corner, with a thin separating ring. */
function badgeArt(): string {
  return (
    `<circle cx="48" cy="16" r="13" fill="${BADGE_RING}"/>` +
    `<circle cx="48" cy="16" r="10" fill="${BADGE}"/>`
  );
}

/**
 * Whether the favicon should carry an unread badge dot: unread > 0 AND not in
 * reduced-data mode. Pure; exposed so the page can decide without rebuilding the
 * whole URI when it only needs the boolean.
 */
export function hasFaviconBadge(unread: number, opts: FaviconBadgeOptions = {}): boolean {
  return !opts.reducedData && Number.isFinite(unread) && unread > 0;
}

/**
 * The favicon href for the current unread count. Returns the static
 * /favicon.svg path when there's nothing unread (or under reducedData), and an
 * inline `data:image/svg+xml` URI with the coral badge stamped on when unread >
 * 0. The badge is a presence indicator, not a counter — it does not render the
 * number (favicons are too small to read a digit reliably), matching how most
 * apps badge their tab icon. Pure; deterministic for a given (unread, opts).
 */
export function faviconHref(unread: number, opts: FaviconBadgeOptions = {}): string {
  if (!hasFaviconBadge(unread, opts)) return STATIC_FAVICON_HREF;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    baseArt() +
    badgeArt() +
    `</svg>`;
  // encodeURIComponent keeps the data URI valid for any future colour/markup
  // tweak (handles #, <, >, quotes) without depending on btoa (not isomorphic).
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
