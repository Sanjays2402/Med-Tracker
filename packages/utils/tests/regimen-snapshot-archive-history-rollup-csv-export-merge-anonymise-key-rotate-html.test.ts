import { describe, it, expect } from 'vitest';
import {
  renderRegimenHistoryAnonymiseKeyRotateHtml,
  renderRegimenHistoryAnonymiseKeyRotateHtmlChangesOnly,
  summarizeKeyRotateHtmlResult,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-html';
import type {
  RegimenHistoryAnonymiseKeyRotateEntry,
  RegimenHistoryAnonymiseKeyRotateResult,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

function entry(
  i: number,
  noOp = false,
): RegimenHistoryAnonymiseKeyRotateEntry {
  return {
    originalPatientId: `patient-${i}`,
    originalPatientName: `Person ${i}`,
    oldPseudonymousId: `pid-old-${i}`,
    oldPseudonymousName: `Patient ${String.fromCharCode(65 + i)}`,
    newPseudonymousId: noOp ? `pid-old-${i}` : `pid-new-${i}`,
    newPseudonymousName: noOp
      ? `Patient ${String.fromCharCode(65 + i)}`
      : `Patient ${String.fromCharCode(78 + i)}`,
  };
}

function result(
  entries: RegimenHistoryAnonymiseKeyRotateEntry[],
  overrides: Partial<RegimenHistoryAnonymiseKeyRotateResult> = {},
): RegimenHistoryAnonymiseKeyRotateResult {
  return {
    mappings: entries,
    collisionDetected: false,
    noOpRotation: entries.length > 0 && entries.every(
      (e) =>
        e.oldPseudonymousId === e.newPseudonymousId &&
        e.oldPseudonymousName === e.newPseudonymousName,
    ),
    ...overrides,
  };
}

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — fragment shape', () => {
  it('defaults to a fragment (no <html> document)', () => {
    const r = result([entry(0), entry(1)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(false);
    expect(out.html).toContain('<style>');
    expect(out.html).toContain('<section class="krhtml">');
    expect(out.html).toContain('</section>');
  });

  it('wraps in a full HTML document when wrapHtmlDocument=true', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      wrapHtmlDocument: true,
    });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<html lang="en">');
    expect(out.html).toContain('<title>Anonymisation key rotation</title>');
  });

  it('uses documentTitle override for both <title> and heading', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      wrapHtmlDocument: true,
      documentTitle: 'Q3 audit',
    });
    expect(out.html).toContain('<title>Q3 audit</title>');
    expect(out.html).toContain('Q3 audit</h1>');
  });

  it('renders empty state when mappings are empty', () => {
    const r = result([]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('No mapping rows.');
    expect(out.rowCount).toBe(0);
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — PHI gating', () => {
  it('omits original patient id + name columns by default', () => {
    const r = result([entry(0), entry(1)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).not.toContain('patient-0');
    expect(out.html).not.toContain('Person 0');
    expect(out.html).not.toContain('Patient id</th>');
    expect(out.containsOriginalIds).toBe(false);
  });

  it('includes original patient columns when includeOriginalIds=true', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      includeOriginalIds: true,
    });
    expect(out.html).toContain('Patient id</th>');
    expect(out.html).toContain('Patient name</th>');
    expect(out.html).toContain('patient-0');
    expect(out.html).toContain('Person 0');
    expect(out.containsOriginalIds).toBe(true);
  });

  it('throws when sortBy=patient-id but includeOriginalIds=false', () => {
    const r = result([entry(0)]);
    expect(() =>
      renderRegimenHistoryAnonymiseKeyRotateHtml(r, { sortBy: 'patient-id' }),
    ).toThrow(/sortBy='patient-id' requires includeOriginalIds=true/);
  });

  it('allows sortBy=patient-id when includeOriginalIds=true', () => {
    const r = result([entry(0), entry(1)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      sortBy: 'patient-id',
      includeOriginalIds: true,
    });
    expect(out.rowCount).toBe(2);
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — no-op rows', () => {
  it('keeps no-op rows by default with an "unchanged" chip', () => {
    const r = result([entry(0), entry(1, true), entry(2)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.rowCount).toBe(3);
    expect(out.html).toContain('unchanged</span>');
    expect(out.html).toContain('changed</span>');
    expect(out.noOpRowsDropped).toBe(false);
  });

  it('drops no-op rows when includeNoOpRows=false', () => {
    const r = result([entry(0), entry(1, true), entry(2)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      includeNoOpRows: false,
    });
    expect(out.rowCount).toBe(2);
    expect(out.html).not.toContain('unchanged</span>');
    expect(out.noOpRowsDropped).toBe(true);
  });

  it('reports zero rows hidden when no rows are no-op', () => {
    const r = result([entry(0), entry(1)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      includeNoOpRows: false,
    });
    expect(out.noOpRowsDropped).toBe(false);
  });

  it('marks the row with a noop css class for striped background', () => {
    const r = result([entry(0, true)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('krhtml-tr krhtml-tr--noop');
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — banner', () => {
  it('shows the COLLISION DETECTED chip when collisions occurred', () => {
    const r = result([entry(0)], { collisionDetected: true });
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('COLLISION DETECTED');
    expect(out.html).not.toContain('NO COLLISIONS');
  });

  it('shows the NO COLLISIONS chip when no collisions occurred', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('NO COLLISIONS');
    expect(out.html).not.toContain('COLLISION DETECTED');
  });

  it('shows the NO-OP ROTATION chip when noOpRotation=true', () => {
    const r = result([entry(0, true), entry(1, true)], { noOpRotation: true });
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('NO-OP ROTATION');
  });

  it('does not show NO-OP ROTATION chip when noOpRotation=false', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).not.toContain('NO-OP ROTATION');
  });

  it('shows the count of patients mapped', () => {
    const r = result([entry(0), entry(1), entry(2)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('3 patients mapped');
  });

  it('uses singular for one patient', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('1 patient mapped');
  });

  it('includes caption when provided', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      caption: 'Q3 2026 rotation',
    });
    expect(out.html).toContain('Q3 2026 rotation');
  });

  it('omits caption block when not provided', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    // CSS class definition is always present in the <style> block;
    // assert the actual <div class="krhtml-caption">...</div> element
    // is NOT rendered into the banner.
    expect(out.html).not.toContain('<div class="krhtml-caption">');
  });

  it('renders the caption inside the banner div', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      caption: 'a caption',
    });
    expect(out.html).toContain('<div class="krhtml-caption">a caption</div>');
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — sorting', () => {
  it('default sort is by old-pseudonym (lexical)', () => {
    const a = entry(0);
    a.oldPseudonymousId = 'pid-old-z';
    const b = entry(1);
    b.oldPseudonymousId = 'pid-old-a';
    const r = result([a, b]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    const aPos = out.html.indexOf('pid-old-a');
    const zPos = out.html.indexOf('pid-old-z');
    expect(aPos).toBeGreaterThan(-1);
    expect(zPos).toBeGreaterThan(-1);
    expect(aPos).toBeLessThan(zPos);
  });

  it('sortBy=new-pseudonym sorts by new pseudonym lex', () => {
    const a = entry(0);
    a.newPseudonymousId = 'pid-new-z';
    const b = entry(1);
    b.newPseudonymousId = 'pid-new-a';
    const r = result([a, b]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      sortBy: 'new-pseudonym',
    });
    const aPos = out.html.indexOf('pid-new-a');
    const zPos = out.html.indexOf('pid-new-z');
    expect(aPos).toBeLessThan(zPos);
  });

  it('sortBy=input preserves the input order', () => {
    const a = entry(0);
    a.oldPseudonymousId = 'pid-old-z';
    const b = entry(1);
    b.oldPseudonymousId = 'pid-old-a';
    const r = result([a, b]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      sortBy: 'input',
    });
    const aPos = out.html.indexOf('pid-old-z');
    const bPos = out.html.indexOf('pid-old-a');
    expect(aPos).toBeLessThan(bPos);
  });

  it('sortBy=patient-id sorts by original patient id (PHI)', () => {
    const a = entry(0);
    a.originalPatientId = 'pz';
    const b = entry(1);
    b.originalPatientId = 'pa';
    const r = result([a, b]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      sortBy: 'patient-id',
      includeOriginalIds: true,
    });
    const aPos = out.html.indexOf('pa');
    const zPos = out.html.indexOf('pz');
    expect(aPos).toBeLessThan(zPos);
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — html escaping', () => {
  it('escapes < and > in pseudonym names', () => {
    const e = entry(0);
    e.newPseudonymousName = 'Patient <script>';
    const r = result([e]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes patient name when includeOriginalIds=true', () => {
    const e = entry(0);
    e.originalPatientName = 'X & Y';
    const r = result([e]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      includeOriginalIds: true,
    });
    expect(out.html).toContain('X &amp; Y');
  });

  it('escapes documentTitle', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      documentTitle: '<bad>',
    });
    expect(out.html).not.toContain('<bad>');
    expect(out.html).toContain('&lt;bad&gt;');
  });

  it('escapes caption', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      caption: '<x>',
    });
    expect(out.html).toContain('&lt;x&gt;');
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtml — footer', () => {
  it('shows total rows in the footer', () => {
    const r = result([entry(0), entry(1)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).toContain('Showing 2 of 2 mapping rows');
  });

  it('mentions hidden no-op rows in the footer', () => {
    const r = result([entry(0), entry(1, true)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      includeNoOpRows: false,
    });
    expect(out.html).toContain('Showing 1 of 2 mapping rows');
    expect(out.html).toContain('1 no-op row hidden');
  });

  it('formats generatedAt Date into the footer', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      generatedAt: new Date(2026, 5, 22, 14, 30),
    });
    expect(out.html).toContain('Generated 2026-06-22 14:30');
  });

  it('passes through string generatedAt unchanged (after escaping)', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r, {
      generatedAt: '2026-06-22T12:00:00Z',
    });
    expect(out.html).toContain('Generated 2026-06-22T12:00:00Z');
  });

  it('omits generatedAt when not provided', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(out.html).not.toContain('Generated');
  });
});

describe('renderRegimenHistoryAnonymiseKeyRotateHtmlChangesOnly', () => {
  it('drops no-op rows AND original ids', () => {
    const r = result([entry(0), entry(1, true)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtmlChangesOnly(r);
    expect(out.rowCount).toBe(1);
    expect(out.containsOriginalIds).toBe(false);
    expect(out.html).not.toContain('Person 0');
  });

  it('forwards documentTitle override', () => {
    const r = result([entry(0)]);
    const out = renderRegimenHistoryAnonymiseKeyRotateHtmlChangesOnly(r, {
      documentTitle: 'Changes',
      wrapHtmlDocument: true,
    });
    expect(out.html).toContain('<title>Changes</title>');
  });
});

describe('summarizeKeyRotateHtmlResult', () => {
  it('reports row count and non-PHI variant', () => {
    const summary = summarizeKeyRotateHtmlResult({
      html: '',
      rowCount: 14,
      noOpRowsDropped: false,
      containsOriginalIds: false,
    });
    expect(summary).toBe('Key rotation HTML: 14 rows; non-PHI variant.');
  });

  it('mentions hidden no-op rows', () => {
    const summary = summarizeKeyRotateHtmlResult({
      html: '',
      rowCount: 12,
      noOpRowsDropped: true,
      containsOriginalIds: false,
    });
    expect(summary).toContain('(no-op rows hidden)');
  });

  it('flags PHI variant', () => {
    const summary = summarizeKeyRotateHtmlResult({
      html: '',
      rowCount: 1,
      noOpRowsDropped: false,
      containsOriginalIds: true,
    });
    expect(summary).toContain('PHI variant');
    expect(summary).toContain('1 row');
  });
});

describe('determinism', () => {
  it('same input produces byte-identical output', () => {
    const r = result([entry(0), entry(1), entry(2)]);
    const a = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    const b = renderRegimenHistoryAnonymiseKeyRotateHtml(r);
    expect(a.html).toBe(b.html);
    expect(a.rowCount).toBe(b.rowCount);
  });
});
