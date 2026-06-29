import { describe, it, expect } from 'vitest';
import {
  STATIC_FAVICON_HREF,
  hasFaviconBadge,
  faviconHref,
  faviconBadgeColor,
} from '../lib/favicon-badge';

describe('favicon-badge constants', () => {
  it('points the fallback at the static /public favicon', () => {
    expect(STATIC_FAVICON_HREF).toBe('/favicon.svg');
  });
});

describe('hasFaviconBadge', () => {
  it('is true only when there is unread and not reduced-data', () => {
    expect(hasFaviconBadge(1)).toBe(true);
    expect(hasFaviconBadge(42)).toBe(true);
  });
  it('is false when nothing is unread', () => {
    expect(hasFaviconBadge(0)).toBe(false);
    expect(hasFaviconBadge(-3)).toBe(false);
  });
  it('is false for non-finite counts', () => {
    expect(hasFaviconBadge(Number.NaN)).toBe(false);
    expect(hasFaviconBadge(Infinity)).toBe(false);
  });
  it('is false under reduced-data even with unread', () => {
    expect(hasFaviconBadge(5, { reducedData: true })).toBe(false);
  });
});

describe('faviconHref', () => {
  it('returns the static path when nothing is unread', () => {
    expect(faviconHref(0)).toBe(STATIC_FAVICON_HREF);
  });

  it('returns the static path under reduced-data (no data URI generated)', () => {
    expect(faviconHref(9, { reducedData: true })).toBe(STATIC_FAVICON_HREF);
  });

  it('returns an inline SVG data URI when there is unread', () => {
    const href = faviconHref(3);
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('stamps the coral badge dot into the SVG when unread', () => {
    const decoded = decodeURIComponent(faviconHref(1));
    // base art present
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('#2aa06b'); // sage square
    // badge present
    expect(decoded).toContain('#c95f3e'); // coral dot
    expect(decoded).toContain('<circle');
  });

  it('omits the badge circle from the static (no-unread) fallback', () => {
    // The static path is a bare string, not an SVG with a coral circle.
    expect(faviconHref(0)).not.toContain('#c95f3e');
  });

  it('does not render the unread number into the icon (presence, not a counter)', () => {
    const decoded = decodeURIComponent(faviconHref(7));
    expect(decoded).not.toContain('<text');
    expect(decoded).not.toContain('>7<');
  });

  it('is deterministic for a given count', () => {
    expect(faviconHref(4)).toBe(faviconHref(4));
  });

  it('produces a valid, parseable data URI (round-trips through decode)', () => {
    const decoded = decodeURIComponent(faviconHref(2).replace('data:image/svg+xml,', ''));
    expect(decoded).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });
});

describe('faviconBadgeColor', () => {
  it('defaults to the coral alert hue', () => {
    expect(faviconBadgeColor()).toBe('#c95f3e');
    expect(faviconBadgeColor('alert')).toBe('#c95f3e');
  });
  it('uses the amber hue for a plain reminder', () => {
    expect(faviconBadgeColor('reminder')).toBe('#b78534');
  });
});

describe('faviconHref tone', () => {
  it('stamps the coral dot by default (no tone given)', () => {
    expect(decodeURIComponent(faviconHref(3))).toContain('#c95f3e');
  });
  it('stamps the coral dot for an alert tone', () => {
    expect(decodeURIComponent(faviconHref(3, { tone: 'alert' }))).toContain('#c95f3e');
  });
  it('stamps the amber dot for a reminder tone', () => {
    const decoded = decodeURIComponent(faviconHref(3, { tone: 'reminder' }));
    expect(decoded).toContain('#b78534');
    expect(decoded).not.toContain('#c95f3e');
  });
  it('keeps the static fallback regardless of tone when nothing is unread', () => {
    expect(faviconHref(0, { tone: 'reminder' })).toBe(STATIC_FAVICON_HREF);
  });
});
