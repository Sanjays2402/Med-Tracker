import { describe, it, expect } from 'vitest';
import {
  batchRoundtripResultsForSlackThreadWithQuietHoursCalendar,
  buildWeekendsAllDayWeekdaysOvernightCalendar,
  resolveQuietHoursRuleForDay,
  summarizeQuietHoursCalendarDecision,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar';
import type { DoseRoundtripThreadBatcherRun } from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';
import type {
  DoseRoundtripValidateResult,
  DoseRoundtripDiff,
} from '../src/dose-export-csv-import-roundtrip-validator';

function makeDiff(id: string, risk: DoseRoundtripDiff['risk']): DoseRoundtripDiff {
  if (risk === 'note-only') {
    return { doseId: id, changes: [{ field: 'note', before: null, after: 'edited' }], risk };
  }
  if (risk === 'status-edit') {
    return { doseId: id, changes: [{ field: 'status', before: 'pending', after: 'taken' }], risk };
  }
  return {
    doseId: id,
    changes: [{ field: 'scheduleId', before: 'sched-1', after: 'sched-2' }],
    risk,
  };
}

function makeResult(overrides: Partial<DoseRoundtripValidateResult> = {}): DoseRoundtripValidateResult {
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

function makeRun(
  runId: string,
  runLabel: string,
  result: DoseRoundtripValidateResult,
): DoseRoundtripThreadBatcherRun {
  return { runId, runLabel, result };
}

const CLEAN_RUN = makeRun('r-clean', 'clean', makeResult({ unchangedCount: 100 }));
const ACTIONABLE_RUN = makeRun(
  'r-act',
  'actionable',
  makeResult({ unchangedCount: 100, diffs: [makeDiff('d1', 'structural')] }),
);

// Wall-clock anchors in PT (UTC-7 in June):
// Mon 2026-06-22 14:00 PT = 21:00 UTC
const PT_MON_1400 = new Date('2026-06-22T21:00:00Z');
// Mon 2026-06-22 02:00 PT = 09:00 UTC
const PT_MON_0200 = new Date('2026-06-22T09:00:00Z');
// Sat 2026-06-20 14:00 PT = 21:00 UTC
const PT_SAT_1400 = new Date('2026-06-20T21:00:00Z');
// Sun 2026-06-21 14:00 PT = 21:00 UTC
const PT_SUN_1400 = new Date('2026-06-21T21:00:00Z');
// Wed 2026-06-24 09:30 PT = 16:30 UTC
const PT_WED_0930 = new Date('2026-06-24T16:30:00Z');

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — day resolution', () => {
  it('matches Monday in PT for a runAt landing Monday PT', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_MON_1400 },
    );
    expect(out.matchedDayOfWeek).toBe('mon');
  });

  it('matches Saturday in PT for a runAt landing Saturday PT', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_SAT_1400 },
    );
    expect(out.matchedDayOfWeek).toBe('sat');
  });

  it('matches Sunday in PT for a runAt landing Sunday PT', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_SUN_1400 },
    );
    expect(out.matchedDayOfWeek).toBe('sun');
  });

  it('matches Wednesday in PT for a runAt landing Wednesday PT', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_WED_0930 },
    );
    expect(out.matchedDayOfWeek).toBe('wed');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — default fallback', () => {
  it('falls back to default window when no override matches the day', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_MON_1400 },
    );
    expect(out.matchedRule).toBe('default');
    expect(out.decision.kind).toBe('post-now'); // 14:00 PT is outside 22:00-07:00 default
  });

  it('defers when within default quiet hours (02:00 PT)', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_MON_0200 },
    );
    expect(out.matchedRule).toBe('default');
    expect(out.decision.kind).toBe('defer-until');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — quiet-all-day overrides', () => {
  it('suppresses (defers if policy is defer-parent) on a quiet-all-day Saturday', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: {
          sat: { kind: 'quiet-all-day' },
        },
      },
    );
    expect(out.matchedRule).toBe('override:all-day');
    expect(out.decision.kind).toBe('defer-until');
  });

  it('suppresses completely on a quiet-all-day Saturday when policy is suppress-completely', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: {
          sat: { kind: 'quiet-all-day' },
        },
        policy: 'suppress-completely',
      },
    );
    expect(out.matchedRule).toBe('override:all-day');
    expect(out.decision.kind).toBe('suppress-completely');
  });

  it('still defers a quiet-all-day Sunday at midday', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SUN_1400,
        overrides: { sun: { kind: 'quiet-all-day' } },
      },
    );
    expect(out.matchedRule).toBe('override:all-day');
    expect(out.decision.kind).toBe('defer-until');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — no-quiet-hours overrides', () => {
  it('posts immediately on a no-quiet-hours Monday even at 02:00 PT', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_MON_0200,
        overrides: { mon: { kind: 'no-quiet-hours' } },
      },
    );
    expect(out.matchedRule).toBe('override:none');
    expect(out.decision.kind).toBe('post-now');
  });

  it('decision reason is skip-flag when no-quiet-hours fires', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_MON_0200,
        overrides: { mon: { kind: 'no-quiet-hours' } },
      },
    );
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('skip-flag');
    }
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — per-day window overrides', () => {
  it('applies a per-day custom window', () => {
    // Wed 09:30 PT lands inside a 08:30-10:00 PT all-hands window override.
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_WED_0930,
        overrides: {
          wed: {
            kind: 'window',
            window: { startHour: 8, endHour: 10, timezone: 'America/Los_Angeles' },
          },
        },
      },
    );
    expect(out.matchedRule).toBe('override:window');
    expect(out.decision.kind).toBe('defer-until');
  });

  it('posts immediately outside a per-day custom window', () => {
    // Wed 09:30 PT lands OUTSIDE a 18:00-19:00 PT board-meeting window.
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_WED_0930,
        overrides: {
          wed: {
            kind: 'window',
            window: { startHour: 18, endHour: 19, timezone: 'America/Los_Angeles' },
          },
        },
      },
    );
    expect(out.matchedRule).toBe('override:window');
    expect(out.decision.kind).toBe('post-now');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — policy plumbed through', () => {
  it('actionable runs post immediately on a quiet-all-day Sat with defer-unless-actionable', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [ACTIONABLE_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: { sat: { kind: 'quiet-all-day' } },
        policy: 'defer-unless-actionable',
      },
    );
    expect(out.matchedRule).toBe('override:all-day');
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('actionable-override');
    }
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHoursCalendar — bundle plumbed through', () => {
  it('returns the underlying thread-batcher bundle (parent + replies)', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN, ACTIONABLE_RUN],
      { runAt: PT_MON_1400 },
    );
    expect(out.bundle.parent.blocks.length).toBeGreaterThan(0);
    expect(out.bundle.replies.length).toBeGreaterThan(0);
  });
});

describe('resolveQuietHoursRuleForDay', () => {
  it('returns default rule when day is not in overrides', () => {
    const r = resolveQuietHoursRuleForDay('mon', {});
    expect(r.rule).toBe('default');
    expect(r.window?.startHour).toBe(22);
  });

  it('returns override:window when a window override is present', () => {
    const r = resolveQuietHoursRuleForDay('wed', {
      overrides: {
        wed: { kind: 'window', window: { startHour: 8, endHour: 10 } },
      },
    });
    expect(r.rule).toBe('override:window');
    expect(r.window?.startHour).toBe(8);
  });

  it('returns override:all-day with a 0-24 window when quiet-all-day', () => {
    const r = resolveQuietHoursRuleForDay('sat', {
      overrides: { sat: { kind: 'quiet-all-day' } },
    });
    expect(r.rule).toBe('override:all-day');
    expect(r.window?.startHour).toBe(0);
    expect(r.window?.endHour).toBe(24);
  });

  it('returns override:none with a null window when no-quiet-hours', () => {
    const r = resolveQuietHoursRuleForDay('mon', {
      overrides: { mon: { kind: 'no-quiet-hours' } },
    });
    expect(r.rule).toBe('override:none');
    expect(r.window).toBeNull();
  });

  it('honours an explicit defaultWindow over the module default', () => {
    const r = resolveQuietHoursRuleForDay('fri', {
      defaultWindow: { startHour: 17, endHour: 9, timezone: 'America/New_York' },
    });
    expect(r.rule).toBe('default');
    expect(r.window?.startHour).toBe(17);
    expect(r.window?.timezone).toBe('America/New_York');
  });
});

describe('summarizeQuietHoursCalendarDecision', () => {
  it('describes a default-rule post-now decision', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      { runAt: PT_MON_1400 },
    );
    const line = summarizeQuietHoursCalendarDecision(out);
    expect(line).toContain('mon');
    expect(line).toContain('default');
    expect(line).toContain('posted immediately');
  });

  it('describes a quiet-all-day defer-until decision', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: { sat: { kind: 'quiet-all-day' } },
      },
    );
    const line = summarizeQuietHoursCalendarDecision(out);
    expect(line).toContain('sat');
    expect(line).toContain('override:all-day');
    expect(line).toContain('deferred until');
  });

  it('describes a no-quiet-hours skip decision', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_MON_0200,
        overrides: { mon: { kind: 'no-quiet-hours' } },
      },
    );
    const line = summarizeQuietHoursCalendarDecision(out);
    expect(line).toContain('mon');
    expect(line).toContain('override:none');
    expect(line).toContain('quiet-hours check skipped');
  });

  it('describes a suppress-completely decision', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: { sat: { kind: 'quiet-all-day' } },
        policy: 'suppress-completely',
      },
    );
    const line = summarizeQuietHoursCalendarDecision(out);
    expect(line).toContain('suppressed');
  });
});

describe('buildWeekendsAllDayWeekdaysOvernightCalendar', () => {
  it('produces a calendar with sat + sun quiet-all-day', () => {
    const cal = buildWeekendsAllDayWeekdaysOvernightCalendar();
    expect(cal.overrides.sat?.kind).toBe('quiet-all-day');
    expect(cal.overrides.sun?.kind).toBe('quiet-all-day');
  });

  it('produces a default window of 22:00-07:00', () => {
    const cal = buildWeekendsAllDayWeekdaysOvernightCalendar();
    expect(cal.defaultWindow.startHour).toBe(22);
    expect(cal.defaultWindow.endHour).toBe(7);
  });

  it('honours a custom timezone', () => {
    const cal = buildWeekendsAllDayWeekdaysOvernightCalendar('defer-parent', 'America/New_York');
    expect(cal.defaultWindow.timezone).toBe('America/New_York');
  });

  it('honours a custom policy', () => {
    const cal = buildWeekendsAllDayWeekdaysOvernightCalendar('suppress-completely');
    expect(cal.policy).toBe('suppress-completely');
  });

  it('plugs into the calendar batcher cleanly', () => {
    const cal = buildWeekendsAllDayWeekdaysOvernightCalendar();
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
      [CLEAN_RUN],
      {
        runAt: PT_SAT_1400,
        overrides: cal.overrides,
        defaultWindow: cal.defaultWindow,
        policy: cal.policy,
      },
    );
    expect(out.matchedRule).toBe('override:all-day');
  });
});
