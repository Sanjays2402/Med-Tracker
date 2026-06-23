import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml,
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlFragment,
  summarizeRosterTocHtmlResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html';
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

function makeCard(
  id: string,
  displayName: string,
  specialty: string | undefined,
) {
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

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — document shape', () => {
  it('wraps in a full HTML document by default', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<html lang="en">');
    expect(out.html).toContain('<head>');
    expect(out.html).toContain('<body>');
    expect(out.html).toContain('</html>');
  });

  it('omits document wrapping when wrapHtmlDocument=false', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      wrapHtmlDocument: false,
    });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(false);
    expect(out.html).not.toContain('<html');
    expect(out.html).toContain('<style>');
    expect(out.html).toContain('<section');
  });

  it('emits a <title> using documentTitle override', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      documentTitle: 'My Roster TOC',
    });
    expect(out.html).toContain('<title>My Roster TOC</title>');
  });

  it('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlFragment forces wrapHtmlDocument=false', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlFragment(cards);
    expect(out.html).not.toContain('<!DOCTYPE html>');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — @page CSS', () => {
  it('defaults to Letter landscape @page size', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards);
    expect(out.pageSizeApplied).toBe('letter landscape');
    expect(out.html).toContain('@page { size: letter landscape;');
  });

  it('honours htmlPageSize="A4 landscape"', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      htmlPageSize: 'A4 landscape',
    });
    expect(out.pageSizeApplied).toBe('a4 landscape');
  });

  it('honours htmlPageSize="Letter portrait"', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      htmlPageSize: 'Letter portrait',
    });
    expect(out.pageSizeApplied).toBe('letter portrait');
  });

  it('honours htmlPageSize="A4 portrait"', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      htmlPageSize: 'A4 portrait',
    });
    expect(out.pageSizeApplied).toBe('a4 portrait');
  });

  it('accepts custom page dimensions', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      htmlPageSize: 'custom',
      customPageWidthIn: 10,
      customPageHeightIn: 7.5,
    });
    expect(out.pageSizeApplied).toBe('10in 7.5in');
  });

  it('throws on missing custom dimensions', () => {
    const cards = makeCards(2);
    expect(() =>
      renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
        htmlPageSize: 'custom',
      }),
    ).toThrow();
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — entries', () => {
  it('renders every card as a TOC row with page number', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    for (const card of cards) {
      expect(out.html).toContain(card.displayName);
    }
    expect(out.html).toContain('Page');
  });

  it('groups by specialty by default with uppercased section labels', () => {
    const cards = makeCards(4); // 2 cardiology + 2 oncology
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('CARDIOLOGY');
    expect(out.html).toContain('ONCOLOGY');
  });

  it('mirrors tocEntries on the result', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocEntries).toHaveLength(3);
    expect(out.tocEntries[0]?.pageNumber).toBeGreaterThanOrEqual(2);
  });

  it('renders an empty body when no cards are supplied', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml([], {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocEntries).toHaveLength(0);
    expect(out.html).toContain('No entries.');
  });

  it('honours tocGroupBySpecialty=false (no specialty labels)', () => {
    const cards = makeCards(4);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocGroupBySpecialty: false,
    });
    expect(out.html).not.toContain('CARDIOLOGY');
    expect(out.html).not.toContain('ONCOLOGY');
  });

  it('uses tocSpecialtyFallback for entries without a specialty', () => {
    const cards = [makeCard('npi:1', 'Doc 1', undefined)];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      tocSpecialtyFallback: 'General',
    });
    expect(out.html).toContain('GENERAL');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — watermark overlay', () => {
  it('renders a watermark overlay when the underlying TOC has a watermark', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('class="toc-watermark"');
  });

  it('omits the watermark overlay when includeWatermarkOverlay=false', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
      includeWatermarkOverlay: false,
    });
    expect(out.html).not.toContain('class="toc-watermark"');
  });

  it('omits the watermark overlay when no watermark was configured', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      generatedAt: FIXED_DATE,
    });
    expect(out.html).not.toContain('class="toc-watermark"');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — meta strip', () => {
  it('emits a batchId + generatedAt meta line', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('Batch ');
    expect(out.html).toContain('Generated 2026-06-22');
  });

  it('mirrors batchId, generatedAt, totalPages, totalCardCount on the result', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.batchId.length).toBeGreaterThan(0);
    expect(out.generatedAt).toEqual(FIXED_DATE);
    expect(out.totalCardCount).toBe(5);
    expect(out.totalPages).toBeGreaterThan(0);
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — footer', () => {
  it('emits a footer with entry count + document total pages', () => {
    const cards = makeCards(5);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('TOC');
    expect(out.html).toContain('5 entries');
    expect(out.html).toContain('Document');
  });

  it('uses singular "entry" for a one-entry TOC', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('1 entry');
    expect(out.html).not.toContain('1 entries');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — HTML escaping', () => {
  it('escapes special characters in patient names', () => {
    const evilCards = [
      makeCard('npi:1', 'Doc <script>alert(1)</script>', 'cardiology'),
    ];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(evilCards, {
      generatedAt: FIXED_DATE,
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml — print-friendly font', () => {
  it('uses a sans-serif font family by default (NOT monospace)', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      generatedAt: FIXED_DATE,
    });
    expect(out.html).toContain('system-ui');
    expect(out.html).not.toContain('monospace');
  });

  it('honours custom fontFamily', () => {
    const cards = makeCards(2);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      generatedAt: FIXED_DATE,
      fontFamily: 'Georgia, serif',
    });
    expect(out.html).toContain('font-family: Georgia, serif');
  });
});

describe('summarizeRosterTocHtmlResult', () => {
  it('emits an entry count + page size + document pages line', () => {
    const cards = makeCards(3);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      generatedAt: FIXED_DATE,
    });
    const line = summarizeRosterTocHtmlResult(out);
    expect(line).toContain('3 entries');
    expect(line).toContain('letter landscape');
    expect(line).toContain('total document');
  });

  it('uses singular for one-entry / one-page', () => {
    const cards = makeCards(1);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(cards, {
      generatedAt: FIXED_DATE,
    });
    const line = summarizeRosterTocHtmlResult(out);
    expect(line).toContain('1 entry');
  });
});
