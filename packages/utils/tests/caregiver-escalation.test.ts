import { describe, it, expect } from 'vitest';
import type { Dose } from '@med/types';
import {
  alertsToDispatch,
  nextAlert,
  pendingAlertsForBatch,
  pendingAlertsForDose,
  type EscalationPolicy,
} from '../src/caregiver-escalation';

function dose(over: Partial<Dose> & { dueAt: string; status: Dose['status'] }): Dose {
  return {
    id: over.id ?? 'd1',
    medicationId: over.medicationId ?? 'm1',
    scheduleId: over.scheduleId ?? 's1',
    dueAt: over.dueAt,
    takenAt: over.takenAt ?? null,
    status: over.status,
  } as Dose;
}

const policy: EscalationPolicy = {
  id: 'p1',
  label: 'standard',
  tiers: [
    { id: 't0', label: 'patient', delayMinutes: 0, recipients: [{ id: 'pat', name: 'Pat', channel: 'push' }] },
    { id: 't1', label: 'spouse', delayMinutes: 15, recipients: [{ id: 'spouse', name: 'Spouse', channel: 'sms' }] },
    {
      id: 't2',
      label: 'daughter',
      delayMinutes: 60,
      recipients: [{ id: 'daughter', name: 'Daughter', channel: 'voice' }],
      expireMinutes: 240,
    },
  ],
};

const DUE = '2026-06-01T08:00:00.000Z';

describe('pendingAlertsForDose', () => {
  it('fires only the patient tier at dueAt', () => {
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'scheduled' }), policy, new Date(DUE));
    expect(out.map((a) => a.tierId)).toEqual(['t0']);
  });

  it('escalates to spouse after 15 minutes', () => {
    const at = new Date(new Date(DUE).getTime() + 20 * 60_000);
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'scheduled' }), policy, at);
    expect(out.map((a) => a.tierId)).toEqual(['t0', 't1']);
  });

  it('reaches the daughter tier at 60 minutes', () => {
    const at = new Date(new Date(DUE).getTime() + 70 * 60_000);
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'scheduled' }), policy, at);
    expect(out.map((a) => a.tierId)).toContain('t2');
  });

  it('expires the daughter tier after 4 hours', () => {
    const at = new Date(new Date(DUE).getTime() + 5 * 60 * 60_000);
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'scheduled' }), policy, at);
    expect(out.map((a) => a.tierId)).not.toContain('t2');
  });

  it('stops escalation when the dose is taken', () => {
    const at = new Date(new Date(DUE).getTime() + 90 * 60_000);
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'taken' }), policy, at);
    expect(out).toEqual([]);
  });

  it('does not stop when status is late but resolveOn excludes late', () => {
    const at = new Date(new Date(DUE).getTime() + 30 * 60_000);
    const out = pendingAlertsForDose(dose({ dueAt: DUE, status: 'late' }), policy, at);
    expect(out.length).toBeGreaterThan(0);
  });

  it('treats late as resolved when configured to', () => {
    const at = new Date(new Date(DUE).getTime() + 30 * 60_000);
    const out = pendingAlertsForDose(
      dose({ dueAt: DUE, status: 'late' }),
      { ...policy, resolveOn: ['taken', 'skipped', 'late'] },
      at,
    );
    expect(out).toEqual([]);
  });
});

describe('alertsToDispatch', () => {
  it('suppresses tiers already dispatched', () => {
    const at = new Date(new Date(DUE).getTime() + 70 * 60_000);
    const expected = pendingAlertsForDose(dose({ dueAt: DUE, status: 'scheduled' }), policy, at);
    const dispatched = alertsToDispatch(expected, [{ doseId: 'd1', tierId: 't0', recipientId: 'pat' }]);
    expect(dispatched.find((a) => a.tierId === 't0')).toBeUndefined();
    expect(dispatched.find((a) => a.tierId === 't1')).toBeDefined();
  });
});

describe('nextAlert', () => {
  it('returns the soonest upcoming tier', () => {
    const at = new Date(new Date(DUE).getTime() + 5 * 60_000);
    const n = nextAlert(dose({ dueAt: DUE, status: 'scheduled' }), policy, at)!;
    expect(n.tier.id).toBe('t1');
  });
  it('returns null after the last tier has fired', () => {
    const at = new Date(new Date(DUE).getTime() + 120 * 60_000);
    expect(nextAlert(dose({ dueAt: DUE, status: 'scheduled' }), policy, at)).toBeNull();
  });
  it('returns null for resolved doses', () => {
    expect(nextAlert(dose({ dueAt: DUE, status: 'taken' }), policy, new Date(DUE))).toBeNull();
  });
});

describe('pendingAlertsForBatch', () => {
  it('aggregates across doses', () => {
    const at = new Date(new Date(DUE).getTime() + 20 * 60_000);
    const out = pendingAlertsForBatch(
      [
        dose({ id: 'a', dueAt: DUE, status: 'scheduled' }),
        dose({ id: 'b', dueAt: DUE, status: 'taken' }),
      ],
      policy,
      at,
    );
    expect(out.every((a) => a.doseId === 'a')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
