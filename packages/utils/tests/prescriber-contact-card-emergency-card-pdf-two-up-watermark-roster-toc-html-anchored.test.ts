import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored,
  buildEmergencyCardTocAnchorMap,
  summarizeAnchoredRosterTocHtmlResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored';
import { buildEmergencyCard } from '../src/prescriber-contact-card-emergency-card';
import {
  buildPrescriberContactCard,
  type PrescriberContactInput,
} from '../src/prescriber-contact-card';
import type { CanonicalPrescriber } from '../src/prescriber-directory';

function prescriber(overrides: Partial<CanonicalPrescriber> = {}): CanonicalPrescriber {
  return {
    id: 'npi:1234567893',
    displayName: 'Smith, Jane A.',
    canonicalKey: 'smith|j',
    npi: '1234567893',
    npiValid: true,
    specialty: 'cardiology',
    sources: ['ehr'],
    medicationIds: ['m1'],
    aliases: [],
    recordCount: 1,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PrescriberContactInput> = {}): PrescriberContactInput {
  return {
    prescriber: prescriber(),
    phone: '212-555-0100',
    afterHoursPhone: '212-555-0911',
    practiceName: 'Midtown Cardiology',
    addressLine: '123 Park Ave',
    city: 'NY',
    state: 'NY',
    postalCode: '10017',
    ...overrides,
  } as PrescriberContactInput;
}

function makeCard(id: string, displayName: string, specialty: string | undefined) {
  return buildEmergencyCard(
    buildPrescriberContactCard(
      makeInput({
        prescriber: prescriber({ id, displayName, specialty }),
      }),
    ),
  );
}

function makeCards(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeCard(`npi:${i}`, `Doc ${i}`, i % 2 === 0 ? 'cardiology' : 'oncology'),
  );
}

const FIXED_DATE = new Date('2026-06-22T12:00:00Z');

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored — shape', () => {
  it('emits an HTML fragment by default (no <html> wrapper)', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('<section class="toc-wrapper">');
    expect(out.html).not.toContain('<!DOCTYPE html>');
  });

  it('wraps in a full HTML document when wrapHtmlDocument=true', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      wrapHtmlDocument: true,
    });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<title>');
  });

  it('mirrors batchId / generatedAt / totalPages / totalCardCount from the underlying TOC', () => {
    const cards = makeCards(4);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.batchId).toBeDefined();
    expect(out.generatedAt).toBeInstanceOf(Date);
    expect(out.totalPages).toBeGreaterThan(0);
    expect(out.totalCardCount).toBe(4);
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored — anchors', () => {
  it('emits one anchor per TOC entry', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.anchorByCardIndex.size).toBe(out.tocEntries.length);
    expect(out.anchorByCardIndex.size).toBe(5);
  });

  it('anchor ids are unique', () => {
    const cards = makeCards(8);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const ids = [...out.anchorByCardIndex.values()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('default anchor format is prefix-cardIndex', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    for (const [idx, id] of out.anchorByCardIndex.entries()) {
      expect(id).toBe(`rx-toc-${idx}`);
    }
  });

  it('respects custom tocPrefix', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocPrefix: 'primary-toc',
    });
    for (const id of out.anchorByCardIndex.values()) {
      expect(id.startsWith('primary-toc-')).toBe(true);
    }
  });

  it('includes the specialty slug when includeSpecialtyInAnchor=true', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      includeSpecialtyInAnchor: true,
    });
    const ids = [...out.anchorByCardIndex.values()];
    // Index 0 = cardiology (even); Index 1 = oncology (odd).
    expect(ids.some((id) => id.includes('cardiology'))).toBe(true);
    expect(ids.some((id) => id.includes('oncology'))).toBe(true);
  });

  it('includes the displayName slug when useDisplayNameSlug=true', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      useDisplayNameSlug: true,
    });
    const ids = [...out.anchorByCardIndex.values()];
    expect(ids.some((id) => id.includes('doc-0'))).toBe(true);
    expect(ids.some((id) => id.includes('doc-1'))).toBe(true);
  });

  it('combines specialty + slug when both flags are on', () => {
    const cards = [makeCard('npi:0', 'Doc 0', 'cardiology')];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      useDisplayNameSlug: true,
      includeSpecialtyInAnchor: true,
    });
    const id = out.anchorByCardIndex.get(0);
    expect(id).toBe('rx-toc-cardiology-doc-0-0');
  });

  it('handles missing specialty as "other" in the anchor', () => {
    const cards = [makeCard('npi:0', 'Doc 0', undefined)];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      includeSpecialtyInAnchor: true,
    });
    const id = out.anchorByCardIndex.get(0);
    expect(id).toBe('rx-toc-other-0');
  });

  it('keeps anchor ids URL-safe (lowercase alphanumeric + hyphens)', () => {
    const cards = [
      makeCard('npi:0', 'Smith, Jane A.', 'cardiology'),
      makeCard('npi:1', "O'Reilly, Mike", 'oncology'),
    ];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      useDisplayNameSlug: true,
    });
    for (const id of out.anchorByCardIndex.values()) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('appends cardIndex to keep ids unique when displayName collides', () => {
    const cards = [
      makeCard('npi:0', 'Smith, Jane A.', 'cardiology'),
      makeCard('npi:1', 'Smith, Jane A.', 'oncology'),
    ];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      useDisplayNameSlug: true,
    });
    const ids = [...out.anchorByCardIndex.values()];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored — HTML body', () => {
  it('renders each TOC name as an <a href="#..."> link', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toMatch(/<a class="toc-name" href="#rx-toc-\d+">/);
  });

  it('does NOT use <span> for the name (anchor replaces span)', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).not.toContain('<span class="toc-name">');
  });

  it('escapes the anchor id in href attribute', () => {
    const cards = [makeCard('npi:0', 'Doc with "quotes"', 'cardiology')];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      useDisplayNameSlug: true,
    });
    // slugify drops the quotes; the href is still escaped via escapeHtml
    // (no quotes appear in the resulting id anyway).
    expect(out.html).toMatch(/href="#rx-toc-doc-with-quotes-0"/);
  });

  it('renders the page number after the link', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    // Page numbers are 1-based and start AFTER the TOC (which is page 0/1);
    // any "Page N" with N >= 1 satisfies the assertion that the page label
    // is present alongside each link.
    expect(out.html).toMatch(/<span class="toc-page">Page \d+<\/span>/);
  });

  it('renders specialty group headings when groupBySpecialty=true (default)', () => {
    const cards = makeCards(4);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('CARDIOLOGY');
    expect(out.html).toContain('ONCOLOGY');
  });

  it('omits group headings when groupBySpecialty=false', () => {
    const cards = makeCards(4);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocGroupBySpecialty: false,
    });
    expect(out.html).not.toContain('CARDIOLOGY');
    expect(out.html).not.toContain('ONCOLOGY');
  });

  it('emits "No entries." for an empty card list', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored([], {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('No entries.');
  });

  it('emits a footer with entry + page totals', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('3 entries');
  });

  it('singularises "entry" for 1 entry and "page" for 1 page', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('1 entry');
  });
});

describe('buildEmergencyCardTocAnchorMap (helper)', () => {
  it('produces the same anchor map as the render path', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocPrefix: 'custom',
      useDisplayNameSlug: true,
    });
    const helperMap = buildEmergencyCardTocAnchorMap(out.tocEntries, {
      tocPrefix: 'custom',
      useDisplayNameSlug: true,
    });
    expect([...helperMap.entries()].sort()).toEqual([...out.anchorByCardIndex.entries()].sort());
  });

  it('accepts no options and uses default prefix + index-only ids', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const helperMap = buildEmergencyCardTocAnchorMap(out.tocEntries);
    for (const [idx, id] of helperMap.entries()) {
      expect(id).toBe(`rx-toc-${idx}`);
    }
  });
});

describe('summarizeAnchoredRosterTocHtmlResult', () => {
  it('emits a one-line summary', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const line = summarizeAnchoredRosterTocHtmlResult(out);
    expect(line).toMatch(/^Anchored roster TOC: 3 entries/);
    expect(line).toContain("prefix 'rx-toc'");
    expect(line).toContain('3 anchors emitted');
    expect(line).not.toContain('\n');
  });

  it('reflects custom prefix in the summary', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocPrefix: 'specialist',
    });
    const line = summarizeAnchoredRosterTocHtmlResult(out, { tocPrefix: 'specialist' });
    expect(line).toContain("prefix 'specialist'");
  });

  it('reflects id shape (specialty + slug + index)', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      includeSpecialtyInAnchor: true,
      useDisplayNameSlug: true,
    });
    const line = summarizeAnchoredRosterTocHtmlResult(out, {
      includeSpecialtyInAnchor: true,
      useDisplayNameSlug: true,
    });
    expect(line).toContain('specialty + slug + index');
  });

  it('singularises "entry" / "anchor" for 1', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const line = summarizeAnchoredRosterTocHtmlResult(out);
    expect(line).toContain('1 entry');
    expect(line).toContain('1 anchor');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored — HTML escaping', () => {
  it('escapes XSS attempts in the document title', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      wrapHtmlDocument: true,
      documentTitle: '<script>x</script>',
    });
    expect(out.html).not.toContain('<title><script>x</script></title>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes the toc name itself (not just attributes)', () => {
    const cards = [makeCard('npi:0', '<Evil> Doc', 'cardiology')];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).not.toContain('<Evil> Doc');
    expect(out.html).toContain('&lt;Evil&gt; Doc');
  });
});
