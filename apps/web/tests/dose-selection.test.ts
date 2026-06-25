import { describe, it, expect } from 'vitest';
import {
  selectablePendingIds,
  toggleSelection,
  rangeSelect,
  selectAllPending,
  pruneSelection,
  summarizeSelection,
  type SelectableDose,
} from '../lib/dose-selection';

const doses: SelectableDose[] = [
  { id: 'a', status: 'pending' },
  { id: 'b', status: 'taken' },
  { id: 'c', status: 'pending' },
  { id: 'd', status: 'pending' },
  { id: 'e', status: 'skipped' },
  { id: 'f', status: 'pending' },
];

describe('selectablePendingIds', () => {
  it('returns only pending ids, preserving order', () => {
    expect(selectablePendingIds(doses)).toEqual(['a', 'c', 'd', 'f']);
  });
  it('returns empty for no pending', () => {
    expect(selectablePendingIds([{ id: 'x', status: 'taken' }])).toEqual([]);
  });
});

describe('toggleSelection', () => {
  it('adds an absent id', () => {
    expect([...toggleSelection(new Set(), 'a')]).toEqual(['a']);
  });
  it('removes a present id', () => {
    expect([...toggleSelection(new Set(['a', 'c']), 'a')]).toEqual(['c']);
  });
  it('does not mutate the input set', () => {
    const input = new Set(['a']);
    toggleSelection(input, 'c');
    expect([...input]).toEqual(['a']);
  });
  it('ignores an empty id but still returns a new set', () => {
    const input = new Set(['a']);
    const out = toggleSelection(input, '');
    expect(out).not.toBe(input);
    expect([...out]).toEqual(['a']);
  });
});

describe('rangeSelect', () => {
  const order = selectablePendingIds(doses); // ['a','c','d','f']
  it('selects an inclusive forward range', () => {
    expect([...rangeSelect(order, 'a', 'd', new Set())].sort()).toEqual(['a', 'c', 'd']);
  });
  it('selects the same range regardless of direction', () => {
    const fwd = [...rangeSelect(order, 'a', 'f', new Set())].sort();
    const back = [...rangeSelect(order, 'f', 'a', new Set())].sort();
    expect(fwd).toEqual(back);
    expect(fwd).toEqual(['a', 'c', 'd', 'f']);
  });
  it('unions onto an existing selection', () => {
    expect([...rangeSelect(order, 'c', 'd', new Set(['f']))].sort()).toEqual(['c', 'd', 'f']);
  });
  it('handles a single-element range (anchor === target)', () => {
    expect([...rangeSelect(order, 'c', 'c', new Set())]).toEqual(['c']);
  });
  it('adds only the valid endpoint when one is not selectable', () => {
    expect([...rangeSelect(order, 'a', 'b', new Set())]).toEqual(['a']);
  });
  it('does not mutate the input set', () => {
    const input = new Set(['f']);
    rangeSelect(order, 'a', 'c', input);
    expect([...input]).toEqual(['f']);
  });
});

describe('selectAllPending', () => {
  it('selects every pending dose', () => {
    expect([...selectAllPending(doses)].sort()).toEqual(['a', 'c', 'd', 'f']);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer pending', () => {
    // 'b' was taken, 'z' does not exist -> both pruned
    expect([...pruneSelection(new Set(['a', 'b', 'z', 'f']), doses)].sort()).toEqual(['a', 'f']);
  });
});

describe('summarizeSelection', () => {
  it('counts only selectable selected ids', () => {
    const s = summarizeSelection(new Set(['a', 'b', 'c']), doses);
    expect(s.count).toBe(2); // 'b' is taken, not counted
    expect(s.selectableCount).toBe(4);
    expect(s.allSelected).toBe(false);
    expect(s.isEmpty).toBe(false);
  });
  it('flags allSelected when every pending dose is selected', () => {
    const s = summarizeSelection(new Set(['a', 'c', 'd', 'f']), doses);
    expect(s.allSelected).toBe(true);
  });
  it('reports empty for an empty selection', () => {
    const s = summarizeSelection(new Set(), doses);
    expect(s.isEmpty).toBe(true);
    expect(s.allSelected).toBe(false);
  });
});
