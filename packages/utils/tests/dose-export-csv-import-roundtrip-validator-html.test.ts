import { describe, it, expect } from 'vitest';
import {
  renderDoseRoundtripValidateHtml,
  renderDoseRoundtripDiffsOnly,
} from '../src/dose-export-csv-import-roundtrip-validator-html';
import type {
  DoseRoundtripDiff,
  DoseRoundtripValidateResult,
} from '../src/dose-export-csv-import-roundtrip-validator';

function diff(
  doseId: string,
  risk: DoseRoundtripDiff['risk'],
  changes: DoseRoundtripDiff['changes'],
): DoseRoundtripDiff {
  return { doseId, risk, changes };
}

function result(overrides: Partial<DoseRoundtripValidateResult> = {}): DoseRoundtripValidateResult {
  return {
    parsedDoses: [],
    parseSkipped: [],
    diffs: [],
    addedIds: [],
    removedIds: [],
    unchangedCount: 0,
    ...overrides,
  };
}

describe('renderDoseRoundtripValidateHtml — basic shape', () => {
  it('renders header and clean-state message when no diffs', () => {
    const out = renderDoseRoundtripValidateHtml(result({ unchangedCount: 42 }));
    expect(out.html).toContain('Dose round-trip review');
    expect(out.html).toContain('42 unchanged');
    expect(out.html).toContain('All rows round-tripped cleanly.');
    expect(out.shownDiffCount).toBe(0);
    expect(out.hiddenDiffCount).toBe(0);
  });

  it('renders patient name in the header when provided', () => {
    const out = renderDoseRoundtripValidateHtml(result({ unchangedCount: 1 }), {
      patientName: 'Jane Doe',
    });
    expect(out.html).toContain('Jane Doe — dose round-trip review');
  });

  it('renders generic title when patient name missing', () => {
    const out = renderDoseRoundtripValidateHtml(result({ unchangedCount: 1 }));
    expect(out.html).toContain('Dose round-trip review');
    expect(out.html).not.toContain('— dose round-trip review');
  });

  it('shows summary stats in subtitle', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        unchangedCount: 10,
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: 'a', after: 'b' }])],
        addedIds: ['x1', 'x2'],
        removedIds: ['y1'],
        parseSkipped: [{ row: 3, reason: 'bad-row' }],
      }),
    );
    expect(out.html).toContain('10 unchanged');
    expect(out.html).toContain('1 diff');
    expect(out.html).toContain('2 added');
    expect(out.html).toContain('1 removed');
    expect(out.html).toContain('1 parser skip');
  });

  it('shows plural parser skips count when > 1', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        unchangedCount: 0,
        parseSkipped: [
          { row: 1, reason: 'r1' },
          { row: 2, reason: 'r2' },
        ],
      }),
    );
    expect(out.html).toContain('2 parser skips');
  });

  it('shows singular diff count when exactly 1', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
    );
    expect(out.html).toContain('1 diff ');
    expect(out.html).not.toContain('1 diffs ');
  });
});

describe('renderDoseRoundtripValidateHtml — risk tier chips', () => {
  it('renders structural chip in red', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'structural', [{ field: 'scheduleId', before: 'a', after: 'b' }])],
      }),
    );
    expect(out.html).toContain('STRUCTURAL');
    expect(out.html).toContain('#fee2e2');
    expect(out.html).toContain('#991b1b');
  });

  it('renders mixed chip in orange', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [
          diff('d1', 'mixed', [
            { field: 'status', before: 'taken', after: 'missed' },
            { field: 'note', before: null, after: 'late' },
          ]),
        ],
      }),
    );
    expect(out.html).toContain('MIXED');
    expect(out.html).toContain('#ffedd5');
    expect(out.html).toContain('#9a3412');
  });

  it('renders status-edit chip in yellow', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'status-edit', [{ field: 'status', before: 'missed', after: 'taken' }])],
      }),
    );
    expect(out.html).toContain('STATUS EDIT');
    expect(out.html).toContain('#fef3c7');
    expect(out.html).toContain('#854d0e');
  });

  it('renders note-only chip in blue', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'felt good' }])],
      }),
    );
    expect(out.html).toContain('NOTE ONLY');
    expect(out.html).toContain('#dbeafe');
    expect(out.html).toContain('#1e3a8a');
  });
});

describe('renderDoseRoundtripValidateHtml — risk section priority', () => {
  it('renders sections in priority order: structural -> mixed -> status-edit -> note-only', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [
          diff('n1', 'note-only', [{ field: 'note', before: 'a', after: 'b' }]),
          diff('s1', 'structural', [{ field: 'scheduleId', before: 'a', after: 'b' }]),
          diff('e1', 'status-edit', [{ field: 'status', before: 'taken', after: 'missed' }]),
          diff('m1', 'mixed', [
            { field: 'status', before: 'taken', after: 'missed' },
            { field: 'note', before: 'a', after: 'b' },
          ]),
        ],
      }),
    );
    const idxStructural = out.html.indexOf('STRUCTURAL');
    const idxMixed = out.html.indexOf('MIXED');
    const idxStatus = out.html.indexOf('STATUS EDIT');
    const idxNote = out.html.indexOf('NOTE ONLY');
    expect(idxStructural).toBeGreaterThan(-1);
    expect(idxMixed).toBeGreaterThan(idxStructural);
    expect(idxStatus).toBeGreaterThan(idxMixed);
    expect(idxNote).toBeGreaterThan(idxStatus);
  });

  it('omits sections with zero diffs', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
    );
    expect(out.html).toContain('NOTE ONLY');
    expect(out.html).not.toContain('STRUCTURAL (');
    expect(out.html).not.toContain('STATUS EDIT (');
    expect(out.html).not.toContain('MIXED (');
  });

  it('shows section count parenthesised', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [
          diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }]),
          diff('d2', 'note-only', [{ field: 'note', before: null, after: 'y' }]),
          diff('d3', 'note-only', [{ field: 'note', before: null, after: 'z' }]),
        ],
      }),
    );
    expect(out.html).toContain('NOTE ONLY (3)');
  });
});

describe('renderDoseRoundtripValidateHtml — risk filter', () => {
  function manyDiffs(): DoseRoundtripValidateResult {
    return result({
      diffs: [
        diff('s1', 'structural', [{ field: 'scheduleId', before: 'a', after: 'b' }]),
        diff('m1', 'mixed', [
          { field: 'status', before: 'taken', after: 'missed' },
          { field: 'note', before: 'a', after: 'b' },
        ]),
        diff('e1', 'status-edit', [{ field: 'status', before: 'taken', after: 'missed' }]),
        diff('n1', 'note-only', [{ field: 'note', before: null, after: 'x' }]),
      ],
    });
  }

  it('shows all tiers when riskFilter=all (default)', () => {
    const out = renderDoseRoundtripValidateHtml(manyDiffs());
    expect(out.html).toContain('STRUCTURAL');
    expect(out.html).toContain('MIXED');
    expect(out.html).toContain('STATUS EDIT');
    expect(out.html).toContain('NOTE ONLY');
    expect(out.shownDiffCount).toBe(4);
    expect(out.hiddenDiffCount).toBe(0);
  });

  it('shows only structural when riskFilter=structural', () => {
    const out = renderDoseRoundtripValidateHtml(manyDiffs(), { riskFilter: 'structural' });
    expect(out.html).toContain('STRUCTURAL');
    expect(out.html).not.toContain('MIXED (');
    expect(out.html).not.toContain('STATUS EDIT (');
    expect(out.html).not.toContain('NOTE ONLY (');
    expect(out.shownDiffCount).toBe(1);
    expect(out.hiddenDiffCount).toBe(3);
  });

  it('shows only note-only when riskFilter=note-only', () => {
    const out = renderDoseRoundtripValidateHtml(manyDiffs(), { riskFilter: 'note-only' });
    expect(out.html).toContain('NOTE ONLY');
    expect(out.html).not.toContain('STRUCTURAL (');
    expect(out.shownDiffCount).toBe(1);
    expect(out.hiddenDiffCount).toBe(3);
  });

  it('shows empty-tier message when filter has no matches', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
      { riskFilter: 'structural' },
    );
    expect(out.html).toContain('No diffs in the selected risk tier.');
    expect(out.shownDiffCount).toBe(0);
    expect(out.hiddenDiffCount).toBe(1);
  });
});

describe('renderDoseRoundtripValidateHtml — rows per risk limit', () => {
  it('caps rows per risk tier and shows overflow row', () => {
    const diffs: DoseRoundtripDiff[] = [];
    for (let i = 0; i < 30; i++) {
      diffs.push(
        diff(`d${i}`, 'note-only', [{ field: 'note', before: null, after: `note${i}` }]),
      );
    }
    const out = renderDoseRoundtripValidateHtml(result({ diffs }), { rowsPerRiskLimit: 10 });
    expect(out.shownDiffCount).toBe(10);
    expect(out.hiddenDiffCount).toBe(20);
    expect(out.html).toContain('…and 20 more note only diffs not shown');
  });

  it('uses singular form when 1 row hidden', () => {
    const diffs: DoseRoundtripDiff[] = [];
    for (let i = 0; i < 6; i++) {
      diffs.push(
        diff(`d${i}`, 'note-only', [{ field: 'note', before: null, after: `note${i}` }]),
      );
    }
    const out = renderDoseRoundtripValidateHtml(result({ diffs }), { rowsPerRiskLimit: 5 });
    expect(out.html).toContain('…and 1 more note only diff not shown');
  });

  it('default rowsPerRiskLimit is 25', () => {
    const diffs: DoseRoundtripDiff[] = [];
    for (let i = 0; i < 25; i++) {
      diffs.push(
        diff(`d${i}`, 'note-only', [{ field: 'note', before: null, after: `note${i}` }]),
      );
    }
    const out = renderDoseRoundtripValidateHtml(result({ diffs }));
    expect(out.shownDiffCount).toBe(25);
    expect(out.hiddenDiffCount).toBe(0);
  });
});

describe('renderDoseRoundtripValidateHtml — change cells', () => {
  it('renders before in red-strikethrough and after in green', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'status-edit', [{ field: 'status', before: 'taken', after: 'missed' }])],
      }),
    );
    expect(out.html).toContain('text-decoration:line-through');
    expect(out.html).toContain('background:#fee2e2');
    expect(out.html).toContain('background:#dcfce7');
    expect(out.html).toContain('taken');
    expect(out.html).toContain('missed');
  });

  it('renders null before as ∅ placeholder', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'late' }])],
      }),
    );
    expect(out.html).toContain('∅');
  });

  it('renders empty string as (empty) placeholder', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: '', after: 'a' }])],
      }),
    );
    expect(out.html).toContain('(empty)');
  });

  it('uppercases the field name label', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'structural', [{ field: 'scheduleId', before: 'a', after: 'b' }])],
      }),
    );
    expect(out.html).toContain('text-transform:uppercase');
    expect(out.html).toContain('scheduleId');
  });
});

describe('renderDoseRoundtripValidateHtml — interactive controls', () => {
  it('renders accept / reject checkboxes by default', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
    );
    expect(out.html).toContain('Accept');
    expect(out.html).toContain('Reject');
    expect(out.html).toContain('type="checkbox"');
    expect(out.html).toContain('value="d1"');
  });

  it('omits checkboxes when interactive=false', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
      { interactive: false },
    );
    expect(out.html).not.toContain('type="checkbox"');
    expect(out.html).not.toContain('Accept');
  });
});

describe('renderDoseRoundtripValidateHtml — adjacent lists', () => {
  it('renders added / removed / parser-skipped lists by default', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
        addedIds: ['new-1', 'new-2'],
        removedIds: ['gone-1'],
        parseSkipped: [{ row: 3, reason: 'invalid-status:foo' }],
      }),
    );
    expect(out.html).toContain('Added rows');
    expect(out.html).toContain('Removed rows');
    expect(out.html).toContain('Parser skipped');
    expect(out.html).toContain('new-1');
    expect(out.html).toContain('new-2');
    expect(out.html).toContain('gone-1');
    expect(out.html).toContain('row 3:');
    expect(out.html).toContain('invalid-status:foo');
  });

  it('omits adjacent lists when includeAdjacentLists=false', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        addedIds: ['new-1'],
        removedIds: ['gone-1'],
        parseSkipped: [{ row: 1, reason: 'bad' }],
      }),
      { includeAdjacentLists: false },
    );
    expect(out.html).not.toContain('Added rows');
    expect(out.html).not.toContain('Removed rows');
    expect(out.html).not.toContain('Parser skipped');
  });

  it('omits an adjacent list when its array is empty', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        addedIds: ['new-1'],
        removedIds: [],
        parseSkipped: [],
      }),
    );
    expect(out.html).toContain('Added rows');
    expect(out.html).not.toContain('Removed rows');
    expect(out.html).not.toContain('Parser skipped');
  });

  it('caps adjacent lists at 25 with overflow message', () => {
    const adds: string[] = [];
    for (let i = 0; i < 30; i++) adds.push(`new-${i}`);
    const out = renderDoseRoundtripValidateHtml(result({ addedIds: adds }));
    expect(out.html).toContain('Added rows');
    expect(out.html).toContain('…and 5 more');
  });
});

describe('renderDoseRoundtripValidateHtml — HTML escaping', () => {
  it('escapes diff doseId with HTML special chars', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [
          diff('<script>alert("xss")</script>', 'note-only', [
            { field: 'note', before: null, after: 'x' },
          ]),
        ],
      }),
    );
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes change values with HTML special chars', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [
          diff('d1', 'note-only', [{ field: 'note', before: null, after: '<b>bold</b>' }]),
        ],
      }),
    );
    expect(out.html).not.toContain('<b>bold</b>');
    expect(out.html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes parser-skipped reason text', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        parseSkipped: [{ row: 1, reason: 'invalid-status:<malicious>' }],
      }),
    );
    expect(out.html).toContain('&lt;malicious&gt;');
  });

  it('escapes patient name', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({}),
      { patientName: "O'Brien & Co. <test>" },
    );
    expect(out.html).not.toContain('<test>');
    expect(out.html).toContain('&lt;test&gt;');
  });

  it('escapes added / removed ids', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        addedIds: ['<x>'],
        removedIds: ['<y>'],
      }),
    );
    expect(out.html).not.toContain('<x>');
    expect(out.html).not.toContain('<y>');
    expect(out.html).toContain('&lt;x&gt;');
    expect(out.html).toContain('&lt;y&gt;');
  });
});

describe('renderDoseRoundtripValidateHtml — font family', () => {
  it('uses default font-family stack', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
    );
    expect(out.html).toContain('system-ui');
  });

  it('respects custom fontFamily', () => {
    const out = renderDoseRoundtripValidateHtml(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
      { fontFamily: 'Comic Sans' },
    );
    expect(out.html).toContain('Comic Sans');
  });
});

describe('renderDoseRoundtripDiffsOnly', () => {
  it('omits adjacent lists even when present in result', () => {
    const out = renderDoseRoundtripDiffsOnly(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
        addedIds: ['new-1'],
        removedIds: ['gone-1'],
        parseSkipped: [{ row: 1, reason: 'r' }],
      }),
    );
    expect(out.html).not.toContain('Added rows');
    expect(out.html).not.toContain('Removed rows');
    expect(out.html).not.toContain('Parser skipped');
    expect(out.html).toContain('NOTE ONLY');
  });

  it('still includes header', () => {
    const out = renderDoseRoundtripDiffsOnly(
      result({
        diffs: [diff('d1', 'note-only', [{ field: 'note', before: null, after: 'x' }])],
      }),
      { patientName: 'Jane' },
    );
    expect(out.html).toContain('Jane — dose round-trip review');
  });
});
