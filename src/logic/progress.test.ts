import { describe, expect, it } from 'vitest';
import { bucketFor, bucketOrder, progressCounts } from './progress';
import { emptyStats, type StatsMap } from './scheduler';

const reviewed = (id: number, streak: number) => ({ ...emptyStats(id), timesReviewed: 1, streak });

describe('bucketFor', () => {
  const stats: StatsMap = { 1: reviewed(1, 0), 2: reviewed(2, 3), 3: reviewed(3, 5), 4: reviewed(4, 9), 5: emptyStats(5) };

  it('separates never reviewed from a streak of 0', () => {
    expect(bucketFor(stats, 99, 5)).toBe('new');
    expect(bucketFor(stats, 5, 5)).toBe('new');
    expect(bucketFor(stats, 1, 5)).toBe(0);
  });

  it('graduates at or above the threshold', () => {
    expect(bucketFor(stats, 2, 5)).toBe(3);
    expect(bucketFor(stats, 3, 5)).toBe('grad');
    expect(bucketFor(stats, 4, 5)).toBe('grad');
    expect(bucketFor(stats, 4, 11)).toBe(9);
  });
});

describe('bucketOrder', () => {
  it('lists new, each streak below the threshold, then graduated', () => {
    expect(bucketOrder(5)).toEqual(['new', 0, 1, 2, 3, 4, 'grad']);
    expect(bucketOrder(1)).toEqual(['new', 0, 'grad']);
  });
});

describe('progressCounts', () => {
  it('counts every id into exactly one bucket, including empty buckets', () => {
    const stats: StatsMap = { 1: reviewed(1, 1), 2: reviewed(2, 1), 3: reviewed(3, 6) };
    const { total, counts } = progressCounts([1, 2, 3, 4], stats, 5);
    expect(total).toBe(4);
    expect([...counts.entries()]).toEqual([
      ['new', 1],
      [0, 0],
      [1, 2],
      [2, 0],
      [3, 0],
      [4, 0],
      ['grad', 1],
    ]);
  });
});
