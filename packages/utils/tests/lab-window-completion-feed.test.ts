import { describe, it, expect } from 'vitest';
import {
  buildLabCompletionFeed,
  mergeCompletions,
} from '../src/lab-window-completion-feed';
import type { FollowupRequirement, FollowupCompletion } from '../src/appointment-followup-tracker';
import type { LabResult } from '../src/lab-window-tracker';
import { buildFollowupReport } from '../src/appointment-followup-tracker';

function fu(o: Partial<FollowupRequirement> & { title: string; dueAt: string }): FollowupRequirement {
  return {
    kind: 'lab',
    ...o,
  };
}

function lab(o: Partial<LabResult> & { labCode: string; drawnAt: string }): LabResult {
  return {
    medicationId: o.medicationId ?? 'm1',
    labCode: o.labCode,
    drawnAt: o.drawnAt,
  };
}

describe('buildLabCompletionFeed — basic matching', () => {
  it('completes a follow-up when the lab code appears in the title', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, matches } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
    expect(completions[0]?.completedAt).toBe('2026-06-14');
    expect(matches[0]?.reason).toBe('code-in-title');
  });

  it('completes when medicationId matches even without code in title', () => {
    const followups = [
      fu({
        title: 'Routine bloodwork',
        dueAt: '2026-06-15',
        recommendedAt: '2026-05-01',
        medicationId: 'warfarin',
      }),
    ];
    const results = [lab({ medicationId: 'warfarin', labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, matches } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
    expect(matches[0]?.reason).toBe('medication-id');
  });

  it('reports reason="both" when title AND medicationId both match', () => {
    const followups = [
      fu({
        title: 'INR check',
        dueAt: '2026-06-15',
        recommendedAt: '2026-05-01',
        medicationId: 'warfarin',
      }),
    ];
    const results = [lab({ medicationId: 'warfarin', labCode: 'INR', drawnAt: '2026-06-14' })];
    const { matches } = buildLabCompletionFeed(followups, results);
    expect(matches[0]?.reason).toBe('both');
  });

  it('skips non-lab follow-ups entirely', () => {
    const followups: FollowupRequirement[] = [
      { kind: 'visit', title: 'INR cardiology', dueAt: '2026-06-15', recommendedAt: '2026-05-01' },
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
    expect(skipped).toHaveLength(0); // non-lab kinds don't even get a skipped entry
  });
});

describe('buildLabCompletionFeed — window logic', () => {
  it('rejects a draw outside the lead window (too early)', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    // Default leadDays=14 so draws BEFORE 2026-06-01 are rejected.
    const results = [lab({ labCode: 'INR', drawnAt: '2026-05-15' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
    expect(skipped[0]?.reason).toBe('no-result-in-window');
  });

  it('rejects a draw past the grace window (too late)', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    // Default graceDays=60 -> draws AFTER 2026-08-14 are rejected.
    const results = [lab({ labCode: 'INR', drawnAt: '2026-09-15' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
    expect(skipped[0]?.reason).toBe('no-result-in-window');
  });

  it('accepts a draw exactly on the due date', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-15' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('respects custom leadDays + graceDays', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-05-20' })];
    // leadDays=30 lets the May 20 draw count.
    const { completions } = buildLabCompletionFeed(followups, results, { leadDays: 30 });
    expect(completions).toHaveLength(1);
  });
});

describe('buildLabCompletionFeed — recommendedAt logic', () => {
  it('rejects a draw BEFORE the recommendation date', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-06-10' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-05' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
  });

  it('accepts a draw on or after the recommendation date', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-06-10' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-10' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('skips a follow-up without recommendedAt when matchWhenNoRecommendedAt=false', () => {
    const followups = [fu({ title: 'INR check', dueAt: '2026-06-15' })];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results, {
      matchWhenNoRecommendedAt: false,
    });
    expect(completions).toHaveLength(0);
    expect(skipped[0]?.reason).toBe('no-result-in-window');
  });

  it('completes when no recommendedAt and matchWhenNoRecommendedAt=true (default)', () => {
    const followups = [fu({ title: 'INR check', dueAt: '2026-06-15' })];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });
});

describe('buildLabCompletionFeed — earliest-wins', () => {
  it('picks the EARLIEST in-window result when multiple match', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [
      lab({ labCode: 'INR', drawnAt: '2026-06-30' }),
      lab({ labCode: 'INR', drawnAt: '2026-06-10' }),
      lab({ labCode: 'INR', drawnAt: '2026-06-20' }),
    ];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions[0]?.completedAt).toBe('2026-06-10');
  });

  it('still picks earliest even when later draws are closer to dueAt', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [
      lab({ labCode: 'INR', drawnAt: '2026-06-15' }), // exact
      lab({ labCode: 'INR', drawnAt: '2026-06-02' }), // earlier
    ];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions[0]?.completedAt).toBe('2026-06-02');
  });
});

describe('buildLabCompletionFeed — title matching', () => {
  it('matches lab code as case-insensitive substring with word boundary', () => {
    const followups = [
      fu({ title: 'inr followup labs', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('does NOT match lab code as substring of unrelated word', () => {
    // "INR" must not match "INRange" (no word boundary on either side).
    const followups = [
      fu({ title: 'INRange tracking', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
  });

  it('matches at start of title (boundary on left side)', () => {
    const followups = [
      fu({ title: 'INR repeat needed', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('matches at end of title (boundary on right side)', () => {
    const followups = [
      fu({ title: 'Repeat labs INR', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('handles punctuation as a word boundary', () => {
    const followups = [
      fu({ title: 'Lab follow-up, INR-T target', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });
});

describe('buildLabCompletionFeed — already-completed skip', () => {
  it('skips follow-ups whose id is in alreadyCompletedIds', () => {
    const followups = [
      fu({
        id: 'fu-1',
        title: 'INR check',
        dueAt: '2026-06-15',
        recommendedAt: '2026-05-01',
      }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results, {
      alreadyCompletedIds: ['fu-1'],
    });
    expect(completions).toHaveLength(0);
    expect(skipped[0]?.reason).toBe('already-completed');
  });

  it('uses derived id (when no explicit id) for the skip check', () => {
    const followups = [fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' })];
    const derivedId = 'fu_lab_2026-06-15_inr-check';
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results, {
      alreadyCompletedIds: [derivedId],
    });
    expect(completions).toHaveLength(0);
  });
});

describe('buildLabCompletionFeed — error handling', () => {
  it('skips follow-ups with malformed dueAt', () => {
    const followups = [fu({ title: 'INR check', dueAt: 'not-a-date', recommendedAt: '2026-05-01' })];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions, skipped } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(0);
    expect(skipped[0]?.reason).toBe('invalid-dueAt');
  });

  it('skips lab results with unparseable drawnAt silently', () => {
    const followups = [fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' })];
    const results: LabResult[] = [
      lab({ labCode: 'INR', drawnAt: 'bogus' }),
      lab({ labCode: 'INR', drawnAt: '2026-06-14' }),
    ];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions).toHaveLength(1);
  });

  it('reports no-matching-results when no lab code or medication-id matches at all', () => {
    const followups = [fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' })];
    const results = [lab({ labCode: 'A1C', drawnAt: '2026-06-14' })];
    const { skipped } = buildLabCompletionFeed(followups, results);
    expect(skipped[0]?.reason).toBe('no-matching-results');
  });

  it('handles empty inputs', () => {
    const r = buildLabCompletionFeed([], []);
    expect(r.completions).toEqual([]);
    expect(r.matches).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});

describe('buildLabCompletionFeed — custom note', () => {
  it('uses caller-supplied noteTemplate', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results, {
      noteTemplate: 'Auto from EHR feed v2',
    });
    expect(completions[0]?.note).toBe('Auto from EHR feed v2');
  });

  it('uses default note when not supplied', () => {
    const followups = [
      fu({ title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' }),
    ];
    const results = [lab({ labCode: 'INR', drawnAt: '2026-06-14' })];
    const { completions } = buildLabCompletionFeed(followups, results);
    expect(completions[0]?.note).toBe('Auto-completed from lab result');
  });
});

describe('mergeCompletions', () => {
  it('manual completion wins over auto on id collision', () => {
    const manual: FollowupCompletion[] = [
      { id: 'fu-1', completedAt: '2026-06-10', note: 'manual entry' },
    ];
    const auto: FollowupCompletion[] = [
      { id: 'fu-1', completedAt: '2026-06-14', note: 'auto' },
    ];
    const merged = mergeCompletions(manual, auto);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.note).toBe('manual entry');
  });

  it('keeps both when ids do not collide', () => {
    const manual: FollowupCompletion[] = [{ id: 'a', completedAt: '2026-06-10' }];
    const auto: FollowupCompletion[] = [{ id: 'b', completedAt: '2026-06-14' }];
    const merged = mergeCompletions(manual, auto);
    expect(merged).toHaveLength(2);
  });

  it('returns a stable id-sorted result', () => {
    const manual: FollowupCompletion[] = [{ id: 'c', completedAt: '2026-06-10' }];
    const auto: FollowupCompletion[] = [
      { id: 'a', completedAt: '2026-06-12' },
      { id: 'b', completedAt: '2026-06-14' },
    ];
    const merged = mergeCompletions(manual, auto);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty inputs', () => {
    expect(mergeCompletions([], [])).toEqual([]);
  });
});

describe('end-to-end: feed flows back through buildFollowupReport', () => {
  it('auto-completed lab follow-ups show status=completed in the next report', () => {
    const NOW = new Date(2026, 5, 21); // 2026-06-21
    const followups: FollowupRequirement[] = [
      { kind: 'lab', title: 'INR check', dueAt: '2026-06-15', recommendedAt: '2026-05-01' },
      { kind: 'lab', title: 'A1C', dueAt: '2026-06-20', recommendedAt: '2026-05-01' },
    ];
    const results: LabResult[] = [
      lab({ labCode: 'INR', drawnAt: '2026-06-14' }),
      // No A1C result — should stay un-completed
    ];
    const { completions } = buildLabCompletionFeed(followups, results);
    const report = buildFollowupReport({
      followups,
      completions,
      now: NOW,
    });
    const inr = report.rows.find((r) => r.title === 'INR check')!;
    const a1c = report.rows.find((r) => r.title === 'A1C')!;
    expect(inr.status).toBe('completed');
    expect(a1c.status).not.toBe('completed');
  });
});
