import { describe, it, expect } from 'vitest';
import {
  pushRecent,
  parseRecents,
  serializeRecents,
  reconcileRecents,
  RECENTS_MAX,
  RECENTS_KEY,
  type RecentEntry,
} from '../lib/command-recents';

function entry(id: string, at: number, extra: Partial<RecentEntry> = {}): RecentEntry {
  return { id, title: id.toUpperCase(), at, ...extra };
}

describe('pushRecent', () => {
  it('adds to the front, newest first', () => {
    const a = pushRecent([], entry('a', 1));
    const b = pushRecent(a, entry('b', 2));
    expect(b.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('de-dupes by id, moving the existing entry to the front', () => {
    const list = [entry('a', 1), entry('b', 2), entry('c', 3)];
    const out = pushRecent(list, entry('b', 9));
    expect(out.map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(out.find((e) => e.id === 'b')!.at).toBe(9); // refreshed timestamp
  });

  it('caps at the max length', () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 10; i++) list = pushRecent(list, entry(`id${i}`, i));
    expect(list).toHaveLength(RECENTS_MAX);
    // most recent is id9
    expect(list[0]!.id).toBe('id9');
  });

  it('honours a custom max', () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 5; i++) list = pushRecent(list, entry(`id${i}`, i), 2);
    expect(list).toHaveLength(2);
  });

  it('ignores an entry with an empty id', () => {
    const list = [entry('a', 1)];
    expect(pushRecent(list, entry('', 2))).toEqual(list);
  });

  it('does not mutate the input', () => {
    const list = [entry('a', 1)];
    const copy = [...list];
    pushRecent(list, entry('b', 2));
    expect(list).toEqual(copy);
  });
});

describe('parseRecents', () => {
  it('returns [] for null/empty/garbage', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
    expect(parseRecents('not json')).toEqual([]);
    expect(parseRecents('{"not":"an array"}')).toEqual([]);
  });

  it('round-trips a serialized list', () => {
    const list = [entry('a', 3, { href: '/a' }), entry('b', 2, { subtitle: 'two' })];
    const parsed = parseRecents(serializeRecents(list));
    expect(parsed.map((e) => e.id)).toEqual(['a', 'b']);
    expect(parsed[0]!.href).toBe('/a');
    expect(parsed[1]!.subtitle).toBe('two');
  });

  it('drops entries missing id or title', () => {
    const raw = JSON.stringify([
      { id: 'ok', title: 'OK', at: 5 },
      { id: '', title: 'no id', at: 4 },
      { id: 'no-title', at: 3 },
      { title: 'no id field', at: 2 },
    ]);
    expect(parseRecents(raw).map((e) => e.id)).toEqual(['ok']);
  });

  it('defaults a missing/invalid at to 0', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'A' }]);
    expect(parseRecents(raw)[0]!.at).toBe(0);
  });

  it('sorts newest first and caps at the max', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `id${i}`, title: `T${i}`, at: i }));
    const parsed = parseRecents(JSON.stringify(many));
    expect(parsed).toHaveLength(RECENTS_MAX);
    expect(parsed[0]!.id).toBe('id8'); // highest at
  });

  it('exposes a stable storage key', () => {
    expect(RECENTS_KEY).toBe('medtracker.cmdk.recents');
  });
});

describe('reconcileRecents', () => {
  it('drops entries that no longer resolve to a live item', () => {
    const list = [entry('keep', 2), entry('gone', 1)];
    const live = new Map([['keep', { title: 'Keep', href: '/keep' }]]);
    const out = reconcileRecents(list, live);
    expect(out.map((e) => e.id)).toEqual(['keep']);
  });

  it('refreshes title/subtitle/href from the live item', () => {
    const list = [entry('m-1', 5, { title: 'Old Name', href: '/medications/1' })];
    const live = new Map([['m-1', { title: 'New Name', subtitle: '20 mg', href: '/medications/1' }]]);
    const out = reconcileRecents(list, live);
    expect(out[0]!.title).toBe('New Name');
    expect(out[0]!.subtitle).toBe('20 mg');
    expect(out[0]!.at).toBe(5); // recency preserved
  });

  it('preserves recency order', () => {
    const list = [entry('b', 3), entry('a', 2), entry('c', 1)];
    const live = new Map([
      ['a', { title: 'A' }],
      ['b', { title: 'B' }],
      ['c', { title: 'C' }],
    ]);
    expect(reconcileRecents(list, live).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns [] when nothing resolves', () => {
    const out = reconcileRecents([entry('x', 1)], new Map());
    expect(out).toEqual([]);
  });
});
