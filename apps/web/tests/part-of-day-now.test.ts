import { describe, it, expect } from 'vitest';
import {
  currentPartOfDay,
  currentPartOfDayFromDate,
  isCurrentPartOfDay,
  nowCapLabel,
} from '../lib/part-of-day-now';

describe('currentPartOfDay', () => {
  it('maps each hour to its section (matching part-of-day thresholds)', () => {
    expect(currentPartOfDay(0)).toBe('Morning');
    expect(currentPartOfDay(11)).toBe('Morning');
    expect(currentPartOfDay(12)).toBe('Afternoon');
    expect(currentPartOfDay(16)).toBe('Afternoon');
    expect(currentPartOfDay(17)).toBe('Evening');
    expect(currentPartOfDay(20)).toBe('Evening');
    expect(currentPartOfDay(21)).toBe('Night');
    expect(currentPartOfDay(23)).toBe('Night');
  });
});

describe('currentPartOfDayFromDate', () => {
  it('reads the local hour off the Date', () => {
    const d = new Date();
    d.setHours(14, 30, 0, 0);
    expect(currentPartOfDayFromDate(d)).toBe('Afternoon');
    d.setHours(22, 0, 0, 0);
    expect(currentPartOfDayFromDate(d)).toBe('Night');
  });
  it('defaults to the real now without throwing', () => {
    expect(['Morning', 'Afternoon', 'Evening', 'Night']).toContain(currentPartOfDayFromDate());
  });
});

describe('isCurrentPartOfDay', () => {
  it('is true only for the section the hour falls in', () => {
    expect(isCurrentPartOfDay('Morning', 9)).toBe(true);
    expect(isCurrentPartOfDay('Afternoon', 9)).toBe(false);
    expect(isCurrentPartOfDay('Night', 22)).toBe(true);
    expect(isCurrentPartOfDay('Evening', 22)).toBe(false);
  });
  it('handles the boundary hours', () => {
    expect(isCurrentPartOfDay('Afternoon', 12)).toBe(true);
    expect(isCurrentPartOfDay('Morning', 12)).toBe(false);
    expect(isCurrentPartOfDay('Evening', 17)).toBe(true);
  });
});

describe('nowCapLabel', () => {
  it('phrases each section naturally', () => {
    expect(nowCapLabel('Morning')).toBe('this morning');
    expect(nowCapLabel('Afternoon')).toBe('this afternoon');
    expect(nowCapLabel('Evening')).toBe('this evening');
    expect(nowCapLabel('Night')).toBe('tonight');
  });
});
