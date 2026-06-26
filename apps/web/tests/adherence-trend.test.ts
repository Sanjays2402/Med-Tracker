import { describe, it, expect } from 'vitest';
import {
  adherencePercent,
  classifyAdherenceTrend,
  trendFromCounts,
} from '../lib/adherence-trend';

describe('adherencePercent', () => {
  it('rounds to a whole percent', () => {
    expect(adherencePercent(5, 6)).toBe(83);
    expect(adherencePercent(156, 168)).toBe(93);
  });
  it('is 0 when nothing was scheduled', () => {
    expect(adherencePercent(0, 0)).toBe(0);
    expect(adherencePercent(3, 0)).toBe(0);
  });
  it('clamps to 0..100', () => {
    expect(adherencePercent(10, 5)).toBe(100);
    expect(adherencePercent(-1, 5)).toBe(0);
  });
});

describe('classifyAdherenceTrend', () => {
  it('reads a clear rise as up with an ok tone', () => {
    const t = classifyAdherenceTrend(92, 85);
    expect(t.direction).toBe('up');
    expect(t.deltaPp).toBe(7);
    expect(t.magnitude).toBe(7);
    expect(t.tone).toBe('ok');
    expect(t.label).toBe('+7pp');
  });
  it('reads a clear fall as down with a danger tone', () => {
    const t = classifyAdherenceTrend(80, 90);
    expect(t.direction).toBe('down');
    expect(t.deltaPp).toBe(-10);
    expect(t.tone).toBe('danger');
    expect(t.label).toBe('-10pp');
  });
  it('treats a delta inside the dead-band as flat', () => {
    const t = classifyAdherenceTrend(91, 90);
    expect(t.direction).toBe('flat');
    expect(t.tone).toBe('neutral');
    expect(t.label).toBe('no change');
  });
  it('treats exactly equal as flat', () => {
    expect(classifyAdherenceTrend(88, 88).direction).toBe('flat');
  });
  it('honours a custom flat threshold', () => {
    // 3pp delta is flat under a 5pp dead-band, up under the default.
    expect(classifyAdherenceTrend(90, 87, { flatThresholdPp: 5 }).direction).toBe('flat');
    expect(classifyAdherenceTrend(90, 87).direction).toBe('up');
  });
  it('rounds float inputs to whole pp', () => {
    const t = classifyAdherenceTrend(92.4, 85.6);
    expect(t.deltaPp).toBe(6); // 92 - 86
  });
});

describe('trendFromCounts', () => {
  it('classifies from raw counts', () => {
    // current 5/6 = 83%, prior 3/6 = 50% -> +33pp up.
    const t = trendFromCounts(5, 6, 3, 6);
    expect(t).not.toBeNull();
    expect(t!.direction).toBe('up');
    expect(t!.deltaPp).toBe(33);
  });
  it('returns null when the prior window had no scheduled doses', () => {
    expect(trendFromCounts(5, 6, 0, 0)).toBeNull();
    expect(trendFromCounts(5, 6, 4, -2)).toBeNull();
  });
  it('still classifies when the current window is empty (prior has a baseline)', () => {
    const t = trendFromCounts(0, 0, 6, 6);
    expect(t).not.toBeNull();
    expect(t!.direction).toBe('down');
    expect(t!.deltaPp).toBe(-100);
  });
});
