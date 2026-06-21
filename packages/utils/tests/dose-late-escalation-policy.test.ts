import { describe, it, expect } from 'vitest';
import {
  buildEscalationPolicy,
  buildPolicyFromTemplate,
  validateEscalationPolicy,
  simulateEscalationTimeline,
  describeTimeline,
  type BuildPolicyInput,
  type EscalationContact,
} from '../src/dose-late-escalation-policy';

const ALICE: EscalationContact = { id: 'r-alice', name: 'Alice', channel: 'push' };
const BOB: EscalationContact = { id: 'r-bob', name: 'Bob', channel: 'sms' };
const CARL: EscalationContact = { id: 'r-carl', name: 'Carl', channel: 'voice' };

function valid(): BuildPolicyInput {
  return {
    id: 'p-1',
    label: 'Test Policy',
    tiers: [
      { id: 'self', label: 'Patient', delayMinutes: 0, recipients: [ALICE] },
      { id: 'caregiver', label: 'Caregiver', delayMinutes: 30, recipients: [BOB] },
      { id: 'family', label: 'Family', delayMinutes: 120, recipients: [CARL] },
    ],
  };
}

describe('validateEscalationPolicy', () => {
  it('passes a clean policy', () => {
    const r = validateEscalationPolicy(valid());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('catches negative delay', () => {
    const i = valid();
    i.tiers[0]!.delayMinutes = -5;
    const r = validateEscalationPolicy(i);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'negative-delay')).toBe(true);
  });

  it('catches duplicate tier id', () => {
    const i = valid();
    i.tiers[1]!.id = 'self';
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'duplicate-tier-id')).toBe(true);
  });

  it('catches duplicate delay across tiers', () => {
    const i = valid();
    i.tiers[1]!.delayMinutes = 0;
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'duplicate-delay')).toBe(true);
  });

  it('catches expireMinutes <= delayMinutes', () => {
    const i = valid();
    i.tiers[1]!.expireMinutes = 10;
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'expire-before-delay')).toBe(true);
  });

  it('catches tier with no recipients', () => {
    const i = valid();
    i.tiers[1]!.recipients = [];
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'no-recipients')).toBe(true);
  });

  it('catches empty tier id', () => {
    const i = valid();
    i.tiers[1]!.id = '';
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'empty-tier-id')).toBe(true);
  });

  it('catches duplicate recipient inside one tier', () => {
    const i = valid();
    i.tiers[1]!.recipients = [BOB, BOB];
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'duplicate-recipient-in-tier')).toBe(true);
  });

  it('catches out-of-order tiers (later then earlier)', () => {
    const i = valid();
    // Already validated correct order; swap to break.
    i.tiers = [
      { id: 'late', label: 'Late', delayMinutes: 60, recipients: [ALICE] },
      { id: 'early', label: 'Early', delayMinutes: 10, recipients: [BOB] },
    ];
    const r = validateEscalationPolicy(i);
    expect(r.errors.some((e) => e.code === 'tier-out-of-order')).toBe(true);
  });
});

describe('buildEscalationPolicy', () => {
  it('produces a policy that matches the input', () => {
    const p = buildEscalationPolicy(valid());
    expect(p.id).toBe('p-1');
    expect(p.tiers).toHaveLength(3);
    expect(p.tiers.map((t) => t.id)).toEqual(['self', 'caregiver', 'family']);
  });

  it('sorts tiers ascending by delayMinutes even when input is sorted already', () => {
    const p = buildEscalationPolicy(valid());
    const delays = p.tiers.map((t) => t.delayMinutes);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('throws on invalid input with a helpful message', () => {
    const i = valid();
    i.tiers[0]!.recipients = [];
    expect(() => buildEscalationPolicy(i)).toThrow(/invalid escalation policy/);
  });

  it('copies recipient arrays to avoid input mutation', () => {
    const i = valid();
    const recipients = i.tiers[0]!.recipients;
    const p = buildEscalationPolicy(i);
    recipients.push({ id: 'leak', name: 'leak', channel: 'email' });
    expect(p.tiers[0]?.recipients).toHaveLength(1);
  });

  it('passes through resolveOn when provided', () => {
    const i: BuildPolicyInput = { ...valid(), resolveOn: ['taken', 'skipped', 'late'] };
    const p = buildEscalationPolicy(i);
    expect(p.resolveOn).toEqual(['taken', 'skipped', 'late']);
  });
});

describe('buildPolicyFromTemplate', () => {
  it('builds the default template with caller-supplied recipients', () => {
    const p = buildPolicyFromTemplate('p-default', 'Default', 'default', {
      'self-reminder': [ALICE],
      'self-late': [ALICE],
      'primary-caregiver': [BOB],
      'family': [CARL],
    });
    expect(p.tiers).toHaveLength(4);
    expect(p.tiers.map((t) => t.id)).toEqual(['self-reminder', 'self-late', 'primary-caregiver', 'family']);
  });

  it('drops template tiers without recipients', () => {
    const p = buildPolicyFromTemplate('p-default', 'Default', 'default', {
      'self-reminder': [ALICE],
      // intentionally omitting other tiers
    });
    expect(p.tiers).toHaveLength(1);
  });

  it('uses the critical-rescue template with shorter cadence', () => {
    const p = buildPolicyFromTemplate('p-rescue', 'Rescue', 'critical-rescue', {
      'self-reminder': [ALICE],
      'caregiver-immediate': [BOB],
      'family-call': [CARL],
      'emergency-services': [{ id: '911', name: '911 dispatch', channel: 'voice' }],
    });
    expect(p.tiers).toHaveLength(4);
    // critical-rescue has 0, 5, 15, 30
    expect(p.tiers[1]?.delayMinutes).toBe(5);
    expect(p.tiers[3]?.delayMinutes).toBe(30);
  });

  it('low-touch template carries expireMinutes on the final tier', () => {
    const p = buildPolicyFromTemplate('p-low', 'Low touch', 'low-touch', {
      'self-reminder': [ALICE],
      'self-final': [ALICE],
    });
    expect(p.tiers[1]?.expireMinutes).toBe(120);
  });

  it('throws when no template tier has a matching recipient set', () => {
    expect(() =>
      buildPolicyFromTemplate('p-x', 'X', 'default', {}),
    ).toThrow(/template default produced no tiers/);
  });
});

describe('simulateEscalationTimeline', () => {
  const policy = buildEscalationPolicy(valid());

  it('includes every tier when dose stays unresolved', () => {
    const t = simulateEscalationTimeline(policy, { dueAt: '2026-06-20T08:00:00.000Z' });
    expect(t.tiers).toHaveLength(3);
    expect(t.topTierFired).toBe('Family');
    expect(t.uniqueRecipients).toBe(3);
  });

  it('drops tiers that would fire AFTER resolvedAt', () => {
    const t = simulateEscalationTimeline(policy, {
      dueAt: '2026-06-20T08:00:00.000Z',
      resolvedAt: '2026-06-20T08:40:00.000Z', // 40 min in — only tiers at 0 and 30 fire
    });
    expect(t.tiers.map((x) => x.tierId)).toEqual(['self', 'caregiver']);
    expect(t.topTierFired).toBe('Caregiver');
  });

  it('drops all tiers when resolvedAt is before the first delay', () => {
    const t = simulateEscalationTimeline(policy, {
      dueAt: '2026-06-20T08:00:00.000Z',
      resolvedAt: '2026-06-20T07:59:00.000Z',
    });
    expect(t.tiers).toEqual([]);
    expect(t.topTierFired).toBeNull();
  });

  it('throws on invalid dueAt', () => {
    expect(() => simulateEscalationTimeline(policy, { dueAt: 'not-iso' })).toThrow();
  });

  it('throws on invalid resolvedAt', () => {
    expect(() =>
      simulateEscalationTimeline(policy, {
        dueAt: '2026-06-20T08:00:00.000Z',
        resolvedAt: 'not-iso',
      }),
    ).toThrow();
  });

  it('deduplicates recipients shared across tiers when counting uniqueRecipients', () => {
    const p = buildEscalationPolicy({
      id: 'p-shared',
      label: 'Shared',
      tiers: [
        { id: 'a', label: 'A', delayMinutes: 10, recipients: [ALICE, BOB] },
        { id: 'b', label: 'B', delayMinutes: 60, recipients: [BOB] },
      ],
    });
    const t = simulateEscalationTimeline(p, { dueAt: '2026-06-20T08:00:00.000Z' });
    expect(t.uniqueRecipients).toBe(2);
  });
});

describe('describeTimeline', () => {
  const policy = buildEscalationPolicy(valid());

  it('renders +Nm / +Nh / +NhNm time stamps', () => {
    const t = simulateEscalationTimeline(policy, { dueAt: '2026-06-20T08:00:00.000Z' });
    const lines = describeTimeline(t);
    expect(lines[0]).toBe('+0m -> Patient (Alice via push)');
    expect(lines[1]).toBe('+30m -> Caregiver (Bob via sms)');
    expect(lines[2]).toBe('+2h -> Family (Carl via voice)');
  });

  it('formats mixed h+m correctly', () => {
    const p = buildEscalationPolicy({
      id: 'p-mix',
      label: 'Mix',
      tiers: [{ id: 't', label: 'T', delayMinutes: 75, recipients: [ALICE] }],
    });
    const t = simulateEscalationTimeline(p, { dueAt: '2026-06-20T08:00:00.000Z' });
    const lines = describeTimeline(t);
    expect(lines[0]).toBe('+1h15m -> T (Alice via push)');
  });

  it('joins multiple recipients on the same tier', () => {
    const p = buildEscalationPolicy({
      id: 'p-multi',
      label: 'Multi',
      tiers: [{ id: 't', label: 'T', delayMinutes: 5, recipients: [ALICE, BOB, CARL] }],
    });
    const t = simulateEscalationTimeline(p, { dueAt: '2026-06-20T08:00:00.000Z' });
    const lines = describeTimeline(t);
    expect(lines[0]).toBe('+5m -> T (Alice via push, Bob via sms, Carl via voice)');
  });
});
