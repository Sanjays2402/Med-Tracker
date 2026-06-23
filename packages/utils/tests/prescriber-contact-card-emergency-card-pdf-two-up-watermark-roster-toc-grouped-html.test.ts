import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml,
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtmlFragment,
  tallyGroupedTocOpenState,
  summarizeGroupedTocHtmlResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-grouped-html';
import { buildEmergencyCard } from '../src/prescriber-contact-card-emergency-card';
import {
  buildPrescriberContactCard,
  type PrescriberContactInput,
} from '../src/prescriber-contact-card';
import type { CanonicalPrescriber } from '../src/prescriber-directory';

function prescriber(
  overrides: Partial<CanonicalPrescriber> = {},
): CanonicalPrescriber {
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

function makeInput(
  overrides: Partial<PrescriberContactInput> = {},
): PrescriberContactInput {
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

function makeCardsForSpecialties(specialties: string[]) {
  return specialties.map((s, i) => makeCard(`npi:${i}`, `Doc ${i}`, s));
}

const FIXED_DATE = new Date('2026-06-22T12:00:00Z');

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml — document shape', () => {
  it('wraps in a full HTML document by default', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'oncology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<html lang="en">');
  });

  it('omits document wrapping when wrapHtmlDocument=false', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, wrapHtmlDocument: false },
    );
    expect(out.html.startsWith('<!DOCTYPE')).toBe(false);
    expect(out.html).toContain('<style>');
    expect(out.html).toContain('<section class="toc-wrapper">');
  });

  it('fragment helper returns wrapHtmlDocument=false output', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtmlFragment(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html.startsWith('<!DOCTYPE')).toBe(false);
  });
});

describe('grouped TOC — <details>/<summary> structure', () => {
  it('emits one <details> per specialty group', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'cardiology',
      'neurology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    const detailsCount = (out.html.match(/<details class="toc-group"/g) ?? []).length;
    expect(detailsCount).toBe(3); // cardiology + oncology + neurology
  });

  it('every <details> has a <summary>', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    const summaryCount = (out.html.match(/<summary class="toc-group-summary"/g) ?? []).length;
    expect(summaryCount).toBe(2);
  });

  it('emits a per-group entry count in the summary', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'cardiology',
      'cardiology',
      'oncology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('3 entries');
    expect(out.html).toContain('1 entry');
  });

  it('singularises the 1-entry count', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('1 entry');
    expect(out.html).not.toContain('1 entries');
  });

  it('emits a toc-row per entry inside each group body', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'cardiology',
      'oncology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    const rowCount = (out.html.match(/<div class="toc-row">/g) ?? []).length;
    expect(rowCount).toBe(3);
  });
});

describe('grouped TOC — default open state', () => {
  it('opens every group by default', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'neurology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    for (const g of out.groups) expect(g.openByDefault).toBe(true);
    const openCount = (out.html.match(/<details class="toc-group" open>/g) ?? []).length;
    expect(openCount).toBe(3);
  });

  it('closes every group when defaultGroupState=collapsed', () => {
    const cards = makeCardsForSpecialties(['cardiology', 'oncology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, defaultGroupState: 'collapsed' },
    );
    for (const g of out.groups) expect(g.openByDefault).toBe(false);
    expect(out.html).not.toContain('<details class="toc-group" open>');
  });

  it('per-specialty collapsedSpecialties overrides defaultGroupState=open', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'neurology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        collapsedSpecialties: ['oncology'],
      },
    );
    const cardio = out.groups.find((g) => g.label === 'CARDIOLOGY');
    const onco = out.groups.find((g) => g.label === 'ONCOLOGY');
    const neuro = out.groups.find((g) => g.label === 'NEUROLOGY');
    expect(cardio?.openByDefault).toBe(true);
    expect(onco?.openByDefault).toBe(false);
    expect(neuro?.openByDefault).toBe(true);
  });

  it('per-specialty openSpecialties wins over collapsedSpecialties', () => {
    const cards = makeCardsForSpecialties(['cardiology', 'oncology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        defaultGroupState: 'collapsed',
        openSpecialties: ['cardiology'],
        collapsedSpecialties: ['cardiology'], // openSpecialties wins
      },
    );
    const cardio = out.groups.find((g) => g.label === 'CARDIOLOGY');
    expect(cardio?.openByDefault).toBe(true);
  });

  it('openSpecialties forces a group open even under default collapsed', () => {
    const cards = makeCardsForSpecialties(['cardiology', 'oncology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        defaultGroupState: 'collapsed',
        openSpecialties: ['cardiology'],
      },
    );
    const cardio = out.groups.find((g) => g.label === 'CARDIOLOGY');
    const onco = out.groups.find((g) => g.label === 'ONCOLOGY');
    expect(cardio?.openByDefault).toBe(true);
    expect(onco?.openByDefault).toBe(false);
  });

  it('matches specialty names case-insensitively', () => {
    const cards = makeCardsForSpecialties(['cardiology', 'oncology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        collapsedSpecialties: ['CardioLOGY'],
      },
    );
    const cardio = out.groups.find((g) => g.label === 'CARDIOLOGY');
    expect(cardio?.openByDefault).toBe(false);
  });
});

describe('grouped TOC — empty + edge cases', () => {
  it('emits the No entries paragraph for empty input', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      [],
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('<p class="toc-empty">No entries.</p>');
    expect(out.totalEntryCount).toBe(0);
    expect(out.groups).toHaveLength(0);
  });

  it('handles a card with no specialty by grouping under the fallback', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      undefined as unknown as string, // no specialty
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, tocSpecialtyFallback: 'Unsorted' },
    );
    const labels = out.groups.map((g) => g.label);
    expect(labels).toContain('UNSORTED');
  });

  it('flattens into one group when tocGroupBySpecialty=false', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'cardiology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, tocGroupBySpecialty: false },
    );
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]?.label).toBe('');
    expect(out.groups[0]?.entries.length).toBe(3);
  });
});

describe('grouped TOC — print stylesheet', () => {
  it('emits a forced-open @media print stylesheet by default', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('@media print');
    expect(out.html).toContain('details.toc-group:not([open])');
  });

  it('emits a plain @media print stylesheet when forceOpenInPrint=false', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, forceOpenInPrint: false },
    );
    expect(out.html).toContain('@media print');
    expect(out.html).not.toContain('details.toc-group:not([open])');
  });
});

describe('grouped TOC — footer + meta', () => {
  it('renders TOC entry + document page totals in the footer', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'cardiology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('3 entries');
    expect(out.html).toContain('Document');
  });

  it('includes the batchId in the meta strip', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, batchId: 'batch-XYZ' },
    );
    expect(out.html).toContain('batch-XYZ');
    expect(out.html).toContain('2026-06-22');
    expect(out.batchId).toBe('batch-XYZ');
  });

  it('respects a custom document title', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        documentTitle: 'My Custom TOC',
      },
    );
    expect(out.html).toContain('<title>My Custom TOC</title>');
  });
});

describe('grouped TOC — HTML safety', () => {
  it('escapes special characters in displayName', () => {
    const cards = [
      makeCard('npi:0', 'Dr. <Smith> & "Co"', 'cardiology'),
    ];
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    expect(out.html).toContain('&lt;Smith&gt;');
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&quot;Co&quot;');
    expect(out.html).not.toContain('<Smith>');
  });
});

describe('tallyGroupedTocOpenState', () => {
  it('counts open vs collapsed groups', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'neurology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        collapsedSpecialties: ['oncology'],
      },
    );
    const tally = tallyGroupedTocOpenState(out);
    expect(tally.totalGroups).toBe(3);
    expect(tally.openGroups).toBe(2);
    expect(tally.collapsedGroups).toBe(1);
  });

  it('reports zero/zero/zero for empty input', () => {
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      [],
      { generatedAt: FIXED_DATE },
    );
    const tally = tallyGroupedTocOpenState(out);
    expect(tally).toEqual({ openGroups: 0, collapsedGroups: 0, totalGroups: 0 });
  });
});

describe('summarizeGroupedTocHtmlResult', () => {
  it('reports entries + groups + open/collapsed counts', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'oncology',
    ]);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      {
        generatedAt: FIXED_DATE,
        collapsedSpecialties: ['oncology'],
      },
    );
    const s = summarizeGroupedTocHtmlResult(out);
    expect(s).toContain('3 entries');
    expect(s).toContain('2 groups');
    expect(s).toContain('1 open');
    expect(s).toContain('1 collapsed');
  });

  it('singularises the entry + group counts on small inputs', () => {
    const cards = makeCardsForSpecialties(['cardiology']);
    const out = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE },
    );
    const s = summarizeGroupedTocHtmlResult(out);
    expect(s).toContain('1 entry');
    expect(s).toContain('1 group');
    expect(s).not.toContain('1 entries');
  });
});

describe('grouped TOC — determinism', () => {
  it('is byte-identical for identical inputs', () => {
    const cards = makeCardsForSpecialties([
      'cardiology',
      'oncology',
      'oncology',
    ]);
    const a = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, batchId: 'b1' },
    );
    const b = renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
      cards,
      { generatedAt: FIXED_DATE, batchId: 'b1' },
    );
    expect(a.html).toBe(b.html);
  });
});
