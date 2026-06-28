import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_UNREAD_STORAGE_KEY,
  DEFAULT_NOTIFICATION_UNREAD,
  normalizeUnreadOnly,
  parseUnreadOnly,
  serializeUnreadOnly,
} from '../lib/notification-unread-pref';

describe('constants', () => {
  it('defaults to off (show read + unread)', () => {
    expect(DEFAULT_NOTIFICATION_UNREAD).toBe(false);
  });
  it('has a stable storage key distinct from the other prefs', () => {
    expect(NOTIFICATION_UNREAD_STORAGE_KEY).toBe('medtracker.notifications.unreadOnly');
  });
});

describe('normalizeUnreadOnly', () => {
  it('passes through real booleans', () => {
    expect(normalizeUnreadOnly(true)).toBe(true);
    expect(normalizeUnreadOnly(false)).toBe(false);
  });
  it('coerces the string tokens "true" / "false"', () => {
    expect(normalizeUnreadOnly('true')).toBe(true);
    expect(normalizeUnreadOnly('false')).toBe(false);
  });
  it('falls back to the default for junk', () => {
    expect(normalizeUnreadOnly('yes')).toBe(false);
    expect(normalizeUnreadOnly(1)).toBe(false);
    expect(normalizeUnreadOnly(null)).toBe(false);
    expect(normalizeUnreadOnly(undefined)).toBe(false);
    expect(normalizeUnreadOnly({})).toBe(false);
  });
});

describe('parseUnreadOnly', () => {
  it('parses a JSON-quoted boolean', () => {
    expect(parseUnreadOnly('true')).toBe(true);
    expect(parseUnreadOnly('false')).toBe(false);
  });
  it('returns the default for null / empty / junk', () => {
    expect(parseUnreadOnly(null)).toBe(false);
    expect(parseUnreadOnly(undefined)).toBe(false);
    expect(parseUnreadOnly('')).toBe(false);
    expect(parseUnreadOnly('{not valid')).toBe(false);
  });
  it('treats a stored 0/1 number string as the default (only booleans count)', () => {
    expect(parseUnreadOnly('1')).toBe(false);
    expect(parseUnreadOnly('0')).toBe(false);
  });
});

describe('serializeUnreadOnly', () => {
  it('round-trips through parse', () => {
    expect(parseUnreadOnly(serializeUnreadOnly(true))).toBe(true);
    expect(parseUnreadOnly(serializeUnreadOnly(false))).toBe(false);
  });
  it('produces canonical JSON', () => {
    expect(serializeUnreadOnly(true)).toBe('true');
    expect(serializeUnreadOnly(false)).toBe('false');
  });
});
