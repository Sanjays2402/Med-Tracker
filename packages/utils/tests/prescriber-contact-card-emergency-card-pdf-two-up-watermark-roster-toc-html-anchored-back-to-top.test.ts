import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop,
  buildEmergencyCardTocBackToTopLinks,
  summarizeAnchoredRosterTocBackToTopResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top';
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

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop — shape', () => {
  it('returns the anchored TOC HTML', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(3),
    );
    expect(out.html.length).toBeGreaterThan(0);
    expect(out.html).toContain('<section class="toc-wrapper">');
  });

  it('reports the same anchorByCardIndex as the underlying anchored TOC', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(3),
    );
    expect(out.anchorByCardIndex.size).toBe(3);
  });

  it('reports the same totalPages + totalCardCount as the underlying TOC', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(5),
    );
    expect(out.totalCardCount).toBe(5);
    expect(out.totalPages).toBeGreaterThan(0);
  });

  it('emits a back-link for every TOC entry', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(4),
    );
    expect(out.backLinkByCardIndex.size).toBe(out.anchorByCardIndex.size);
    expect(out.backLinkByCardIndex.size).toBe(4);
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop — tocTopAnchorId', () => {
  it('defaults tocTopAnchorId to ${tocPrefix}-top', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    expect(out.tocTopAnchorId).toBe('rx-toc-top');
  });

  it('honours custom tocPrefix in tocTopAnchorId default', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { tocPrefix: 'primary-toc' },
    );
    expect(out.tocTopAnchorId).toBe('primary-toc-top');
  });

  it('honours explicit tocTopAnchorId override', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { tocTopAnchorId: 'page-toc' },
    );
    expect(out.tocTopAnchorId).toBe('page-toc');
  });

  it('injects the tocTopAnchor element into the HTML', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    expect(out.html).toContain('<a id="rx-toc-top"');
    expect(out.html).toContain('class="toc-top-anchor"');
  });

  it('tocTopAnchor lives inside the toc-wrapper section', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    const wrapperIdx = out.html.indexOf('<section class="toc-wrapper">');
    const anchorIdx = out.html.indexOf('id="rx-toc-top"');
    expect(anchorIdx).toBeGreaterThan(wrapperIdx);
  });

  it('tocTopAnchor element is keyboard-skippable (tabindex=-1)', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    expect(out.html).toContain('tabindex="-1"');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop — back-link HTML', () => {
  it('back-link href targets tocTopAnchorId', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('href="#rx-toc-top"');
  });

  it('back-link uses custom tocTopAnchorId in href', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { tocTopAnchorId: 'page-toc-top' },
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('href="#page-toc-top"');
  });

  it('back-link default label is "Back to TOC"', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('>Back to TOC<');
  });

  it('honours custom backLinkLabel', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { backLinkLabel: 'Volver al índice' },
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('>Volver al índice<');
  });

  it('back-link uses default class name', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('class="rx-card-back-to-toc"');
  });

  it('honours custom backLinkClassName', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { backLinkClassName: 'card-top-link' },
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('class="card-top-link"');
  });

  it('back-link has aria-label that references the prescriber name', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('aria-label="Return to table of contents from Doc 0 card"');
  });

  it('honours custom buildBackLinkAriaLabel', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { buildBackLinkAriaLabel: (e) => `Back from ${e.displayName}` },
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('aria-label="Back from Doc 0"');
  });

  it('back-link label is HTML-escaped', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { backLinkLabel: '<script>alert(1)</script>' },
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('&lt;script&gt;');
    expect(link0).not.toContain('<script>alert(1)</script>');
  });

  it('aria-label is HTML-escaped against XSS', () => {
    const cards = [
      makeCard('npi:0', 'Smith <bad>', 'cardiology'),
    ];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      cards,
    );
    const link0 = out.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('&lt;bad&gt;');
    expect(link0).not.toContain('<bad>');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop — empty + edge cases', () => {
  it('produces empty back-link map for zero cards', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      [],
    );
    expect(out.backLinkByCardIndex.size).toBe(0);
    expect(out.anchorByCardIndex.size).toBe(0);
  });

  it('still injects the tocTopAnchor for zero cards', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      [],
    );
    expect(out.html).toContain('id="rx-toc-top"');
  });

  it('back-link map iteration order matches tocEntries order', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(4),
    );
    const keys = [...out.backLinkByCardIndex.keys()];
    const expected = out.tocEntries.map((e) => e.cardIndex);
    expect(keys).toEqual(expected);
  });

  it('every back-link points at the same tocTopAnchor', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(4),
      { tocTopAnchorId: 'master-top' },
    );
    for (const link of out.backLinkByCardIndex.values()) {
      expect(link).toContain('href="#master-top"');
    }
  });
});

describe('buildEmergencyCardTocBackToTopLinks', () => {
  it('produces the same back-link HTML as the full render', () => {
    const cards = makeCards(3);
    const full = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      cards,
    );
    const standalone = buildEmergencyCardTocBackToTopLinks(full.tocEntries);
    for (const cardIndex of full.backLinkByCardIndex.keys()) {
      expect(standalone.backLinkByCardIndex.get(cardIndex)).toBe(
        full.backLinkByCardIndex.get(cardIndex),
      );
    }
    expect(standalone.tocTopAnchorId).toBe(full.tocTopAnchorId);
  });

  it('honours all the options independently', () => {
    const cards = makeCards(2);
    const full = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      cards,
    );
    const standalone = buildEmergencyCardTocBackToTopLinks(full.tocEntries, {
      tocTopAnchorId: 'custom-top',
      backLinkLabel: 'Up',
      backLinkClassName: 'up-button',
    });
    const link0 = standalone.backLinkByCardIndex.get(0)!;
    expect(link0).toContain('href="#custom-top"');
    expect(link0).toContain('>Up<');
    expect(link0).toContain('class="up-button"');
  });

  it('returns empty map for empty tocEntries', () => {
    const out = buildEmergencyCardTocBackToTopLinks([]);
    expect(out.backLinkByCardIndex.size).toBe(0);
    expect(out.tocTopAnchorId).toBe('rx-toc-top');
  });
});

describe('summarizeAnchoredRosterTocBackToTopResult', () => {
  it('summarises anchor + back-link counts + target id', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(5),
    );
    const line = summarizeAnchoredRosterTocBackToTopResult(out);
    expect(line).toContain('5 anchors');
    expect(line).toContain('5 back-links');
    expect(line).toContain("'rx-toc-top'");
  });

  it('singular grammar for one card', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(1),
    );
    const line = summarizeAnchoredRosterTocBackToTopResult(out);
    expect(line).toContain('1 anchor,');
    expect(line).toContain('1 back-link ');
  });

  it('references the configured tocTopAnchorId', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      makeCards(2),
      { tocTopAnchorId: 'master-top' },
    );
    const line = summarizeAnchoredRosterTocBackToTopResult(out);
    expect(line).toContain("'master-top'");
  });

  it('reports zero anchors for empty input', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
      [],
    );
    const line = summarizeAnchoredRosterTocBackToTopResult(out);
    expect(line).toContain('0 anchors');
    expect(line).toContain('0 back-links');
  });
});

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop — determinism', () => {
  it('two identical inputs produce identical HTML + back-link maps', () => {
    const cards = makeCards(3);
    const a = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(cards);
    const b = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(cards);
    expect(a.html).toBe(b.html);
    for (const k of a.backLinkByCardIndex.keys()) {
      expect(a.backLinkByCardIndex.get(k)).toBe(b.backLinkByCardIndex.get(k));
    }
  });
});
