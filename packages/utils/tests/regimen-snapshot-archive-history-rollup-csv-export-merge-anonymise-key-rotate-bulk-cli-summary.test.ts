import { describe, it, expect } from 'vitest';
import {
  summarizeAnonymiseKeyRotationBulkForCli,
  detectAnonymiseKeyRotateBulkCliWarning,
  joinAnonymiseKeyRotateBulkCliSummary,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary';
import type { RegimenHistoryAnonymiseKeyRotateBulkResult } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';
import type {
  RegimenHistoryAnonymiseKeyRotateEntry,
  RegimenHistoryAnonymiseKeyRotateResult,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

// Test helpers --------------------------------------------------------

function entry(
  id: string,
  options: { oldId?: string; newId?: string; oldName?: string; newName?: string } = {},
): RegimenHistoryAnonymiseKeyRotateEntry {
  return {
    originalPatientId: id,
    originalPatientName: `Name ${id}`,
    oldPseudonymousId: options.oldId ?? `pid-old-${id}`,
    oldPseudonymousName: options.oldName ?? `Patient old-${id}`,
    newPseudonymousId: options.newId ?? `pid-new-${id}`,
    newPseudonymousName: options.newName ?? `Patient new-${id}`,
  };
}

function transition(
  fromIdx: number,
  toIdx: number,
  fromLabel: string,
  toLabel: string,
  mappings: RegimenHistoryAnonymiseKeyRotateEntry[],
  flags: { collisionDetected?: boolean; noOpRotation?: boolean } = {},
): {
  fromEpoch: number;
  toEpoch: number;
  fromEpochLabel: string;
  toEpochLabel: string;
  result: RegimenHistoryAnonymiseKeyRotateResult;
} {
  return {
    fromEpoch: fromIdx,
    toEpoch: toIdx,
    fromEpochLabel: fromLabel,
    toEpochLabel: toLabel,
    result: {
      mappings,
      collisionDetected: flags.collisionDetected ?? false,
      noOpRotation: flags.noOpRotation ?? false,
    },
  };
}

function bulkResult(
  transitions: Array<ReturnType<typeof transition>>,
  epochLabels: string[],
): RegimenHistoryAnonymiseKeyRotateBulkResult {
  const epochCount = epochLabels.length;
  const transitionCount = epochCount - 1;
  const noOpTransitionCount = transitions.filter((t) => t.result.noOpRotation).length;
  const collisionDetectedAtAnyEpoch = transitions.some(
    (t) => t.result.collisionDetected,
  );
  return {
    transitions,
    patientChains: [],
    terminals: [],
    epochCount,
    transitionCount,
    noOpTransitionCount,
    collisionDetectedAtAnyEpoch,
    epochLabels,
  };
}

// Happy path tests ----------------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCli — happy path', () => {
  it('emits one transition line per transition + a batch line', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'secret-2022', 'secret-2023', [
          entry('p1'),
          entry('p2'),
        ]),
        transition(1, 2, 'secret-2023', 'secret-2024', [
          entry('p1', { oldId: 'pid-new-p1', newId: 'pid-2024-p1' }),
          entry('p2', { oldId: 'pid-new-p2', newId: 'pid-2024-p2' }),
        ]),
      ],
      ['secret-2022', 'secret-2023', 'secret-2024'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.transitionLines.length).toBe(2);
    expect(s.transitionLines[0]).toBe(
      '[key-rotate epoch=secret-2022->secret-2023] patients=2 reshuffled=2 collisions=0 verdict=ship-safe',
    );
    expect(s.transitionLines[1]).toBe(
      '[key-rotate epoch=secret-2023->secret-2024] patients=2 reshuffled=2 collisions=0 verdict=ship-safe',
    );
    expect(s.batchLine).toBe(
      '[key-rotate-bulk] epochs=3 transitions=2 patients=2 noop_transitions=0 collisions_total=0 verdict=ship-safe',
    );
  });

  it('reports the structured per-transition summaries', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1'), entry('p2'), entry('p3')]),
        transition(1, 2, 'e1', 'e2', [
          entry('p1', { oldId: 'pid-new-p1', newId: 'pid-e2-p1' }),
          entry('p2', { oldId: 'pid-new-p2', newId: 'pid-e2-p2' }),
          entry('p3', { oldId: 'pid-new-p3', newId: 'pid-e2-p3' }),
        ]),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.summaries.length).toBe(2);
    expect(s.summaries[0]!.fromEpoch).toBe(0);
    expect(s.summaries[0]!.toEpoch).toBe(1);
    expect(s.summaries[0]!.fromEpochLabel).toBe('e0');
    expect(s.summaries[0]!.toEpochLabel).toBe('e1');
    expect(s.summaries[0]!.cli.patients).toBe(3);
    expect(s.summaries[0]!.cli.verdict).toBe('ship-safe');
    expect(s.summaries[1]!.fromEpoch).toBe(1);
    expect(s.summaries[1]!.toEpoch).toBe(2);
  });

  it('mirrors epochCount + transitionCount onto the summary', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1')]),
        transition(1, 2, 'e1', 'e2', [entry('p1')]),
        transition(2, 3, 'e2', 'e3', [entry('p1')]),
      ],
      ['e0', 'e1', 'e2', 'e3'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.epochCount).toBe(4);
    expect(s.transitionCount).toBe(3);
    expect(s.patients).toBe(1);
  });
});

// Verdict precedence tests --------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCli — verdict precedence', () => {
  it('widen-hash wins when ANY transition collides', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1'), entry('p2')]),
        transition(
          1,
          2,
          'e1',
          'e2',
          [entry('p1'), entry('p2')],
          { collisionDetected: true },
        ),
        transition(2, 3, 'e2', 'e3', [entry('p1'), entry('p2')]),
      ],
      ['e0', 'e1', 'e2', 'e3'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.verdict).toBe('widen-hash');
    expect(s.batchLine).toContain('verdict=widen-hash');
  });

  it('no-op wins when every transition is a no-op', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
        transition(
          1,
          2,
          'e1',
          'e2',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.verdict).toBe('no-op');
    expect(s.batchLine).toContain('noop_transitions=2');
    expect(s.batchLine).toContain('verdict=no-op');
  });

  it('ship-safe wins when at least one transition reshuffled (no collisions)', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
        transition(1, 2, 'e1', 'e2', [entry('p1')]),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.verdict).toBe('ship-safe');
  });

  it('empty-cohort wins when zero patients in cohort', () => {
    const r = bulkResult(
      [transition(0, 1, 'e0', 'e1', [])],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.verdict).toBe('empty-cohort');
    expect(s.batchLine).toContain('patients=0');
    expect(s.batchLine).toContain('verdict=empty-cohort');
  });

  it('empty-cohort wins when zero transitions (single-secret chain)', () => {
    const r = bulkResult([], ['secret-2024']);
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.verdict).toBe('empty-cohort');
    expect(s.transitionLines.length).toBe(0);
    expect(s.batchLine).toContain('epochs=1');
    expect(s.batchLine).toContain('transitions=0');
  });
});

// Counter tests -------------------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCli — counters', () => {
  it('sums collisions across multiple colliding transitions', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            // p1 + p2 hash to the same OLD pseudonym -> 1 collision
            entry('p1', { oldId: 'pid-COLLIDE-OLD' }),
            entry('p2', { oldId: 'pid-COLLIDE-OLD' }),
          ],
          { collisionDetected: true },
        ),
        transition(
          1,
          2,
          'e1',
          'e2',
          [
            // p1 + p2 hash to the same NEW pseudonym -> 1 collision
            entry('p1', { newId: 'pid-COLLIDE-NEW' }),
            entry('p2', { newId: 'pid-COLLIDE-NEW' }),
          ],
          { collisionDetected: true },
        ),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.collisionsTotal).toBe(2);
    expect(s.batchLine).toContain('collisions_total=2');
  });

  it('counts no-op transitions independently of the verdict', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1')]),
        transition(
          1,
          2,
          'e1',
          'e2',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
        transition(
          2,
          3,
          'e2',
          'e3',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
      ],
      ['e0', 'e1', 'e2', 'e3'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.noOpTransitionCount).toBe(2);
    expect(s.verdict).toBe('ship-safe');
  });
});

// Option-driven tests -------------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCli — options', () => {
  it('respects custom transitionTag + batchTag', () => {
    const r = bulkResult(
      [transition(0, 1, 'e0', 'e1', [entry('p1')])],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r, {
      transitionTag: '[cohort=cardiology]',
      batchTag: '[cohort=cardiology-batch]',
    });
    expect(s.transitionLines[0]).toBe(
      '[cohort=cardiology epoch=e0->e1] patients=1 reshuffled=1 collisions=0 verdict=ship-safe',
    );
    expect(s.batchLine).toBe(
      '[cohort=cardiology-batch] epochs=2 transitions=1 patients=1 noop_transitions=0 collisions_total=0 verdict=ship-safe',
    );
  });

  it('suppressNoOpTransitions hides no-op lines but keeps structured summaries', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1')]),
        transition(
          1,
          2,
          'e1',
          'e2',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
        transition(2, 3, 'e2', 'e3', [
          entry('p1', { oldId: 'pid-AAAA', newId: 'pid-BBBB' }),
        ]),
      ],
      ['e0', 'e1', 'e2', 'e3'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r, {
      suppressNoOpTransitions: true,
    });
    expect(s.transitionLines.length).toBe(2);
    expect(s.transitionLines[0]).toContain('epoch=e0->e1');
    expect(s.transitionLines[1]).toContain('epoch=e2->e3');
    expect(s.summaries.length).toBe(3); // structured data unaffected
  });

  it('keeps custom tag with no closing bracket compatible', () => {
    const r = bulkResult(
      [transition(0, 1, 'e0', 'e1', [entry('p1')])],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r, {
      transitionTag: '[key-rotate',
    });
    // Even though the user passed an unclosed bracket, the labelled
    // tag closes it cleanly with the epoch suffix.
    expect(s.transitionLines[0]).toContain('[key-rotate epoch=e0->e1]');
  });
});

// detectAnonymiseKeyRotateBulkCliWarning tests ------------------------

describe('detectAnonymiseKeyRotateBulkCliWarning', () => {
  it('reports the widen-hash warning when collisions occur', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            entry('p1', { oldId: 'pid-COLLIDE-OLD' }),
            entry('p2', { oldId: 'pid-COLLIDE-OLD' }),
          ],
          { collisionDetected: true },
        ),
      ],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const w = detectAnonymiseKeyRotateBulkCliWarning(s);
    expect(w).not.toBeNull();
    expect(w).toContain('widen hashHexLength');
    expect(w).toContain('1 colliding pseudonym');
    expect(w).toContain('1 transition');
  });

  it('reports the all-no-op warning when every transition is no-op', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
      ],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const w = detectAnonymiseKeyRotateBulkCliWarning(s);
    expect(w).toBe(
      'all transitions are no-op: verify the secret chain was actually rotated',
    );
  });

  it('reports the empty-cohort warning when no patients in cohort', () => {
    const r = bulkResult([transition(0, 1, 'e0', 'e1', [])], ['e0', 'e1']);
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const w = detectAnonymiseKeyRotateBulkCliWarning(s);
    expect(w).toBe(
      'empty cohort: upstream cohort query returned zero patients',
    );
  });

  it('reports the single-secret warning when zero transitions', () => {
    const r = bulkResult([], ['secret-only']);
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const w = detectAnonymiseKeyRotateBulkCliWarning(s);
    expect(w).toBe(
      'single-secret chain: only one secret supplied (no rotations to apply)',
    );
  });

  it('returns null for a clean ship-safe batch', () => {
    const r = bulkResult(
      [transition(0, 1, 'e0', 'e1', [entry('p1')])],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(detectAnonymiseKeyRotateBulkCliWarning(s)).toBeNull();
  });
});

// joinAnonymiseKeyRotateBulkCliSummary tests --------------------------

describe('joinAnonymiseKeyRotateBulkCliSummary', () => {
  it('joins all transition lines + batch line with newlines, batch line last', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1')]),
        transition(1, 2, 'e1', 'e2', [
          entry('p1', { oldId: 'pid-new-p1', newId: 'pid-e2-p1' }),
        ]),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const joined = joinAnonymiseKeyRotateBulkCliSummary(s);
    const lines = joined.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('epoch=e0->e1');
    expect(lines[1]).toContain('epoch=e1->e2');
    expect(lines[2]).toBe(s.batchLine);
    expect(lines[2]).toContain('[key-rotate-bulk]');
  });

  it('emits only the batch line when no transitions exist', () => {
    const r = bulkResult([], ['secret-only']);
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    const joined = joinAnonymiseKeyRotateBulkCliSummary(s);
    expect(joined).toBe(s.batchLine);
  });

  it('emits only the batch line when all transitions suppressed', () => {
    const r = bulkResult(
      [
        transition(
          0,
          1,
          'e0',
          'e1',
          [
            entry('p1', {
              oldId: 'pid-AAAA',
              newId: 'pid-AAAA',
              oldName: 'X',
              newName: 'X',
            }),
          ],
          { noOpRotation: true },
        ),
      ],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r, {
      suppressNoOpTransitions: true,
    });
    const joined = joinAnonymiseKeyRotateBulkCliSummary(s);
    expect(joined).toBe(s.batchLine);
  });
});

// Line-shape stability tests ------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCli — line shape stability', () => {
  it('transition line is fixed shape: tag patients=N reshuffled=N collisions=N verdict=V', () => {
    const r = bulkResult(
      [transition(0, 1, 'e0', 'e1', [entry('p1'), entry('p2')])],
      ['e0', 'e1'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.transitionLines[0]).toMatch(
      /^\[[^\]]+\] patients=\d+ reshuffled=\d+ collisions=\d+ verdict=(no-op|widen-hash|ship-safe|empty-cohort)$/,
    );
  });

  it('batch line is fixed shape: tag epochs=N transitions=N patients=N noop=N collisions=N verdict=V', () => {
    const r = bulkResult(
      [
        transition(0, 1, 'e0', 'e1', [entry('p1')]),
        transition(1, 2, 'e1', 'e2', [
          entry('p1', { oldId: 'pid-new-p1', newId: 'pid-e2-p1' }),
        ]),
      ],
      ['e0', 'e1', 'e2'],
    );
    const s = summarizeAnonymiseKeyRotationBulkForCli(r);
    expect(s.batchLine).toMatch(
      /^\[[^\]]+\] epochs=\d+ transitions=\d+ patients=\d+ noop_transitions=\d+ collisions_total=\d+ verdict=(no-op|widen-hash|ship-safe|empty-cohort)$/,
    );
  });
});
