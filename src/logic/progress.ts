// Progress-to-graduation buckets for the dashboard. Pure.
import { statsFor, type StatsMap } from './scheduler';

/** 'new' = never reviewed, a number = current streak below the threshold, 'grad' = graduated. */
export type StreakBucket = 'new' | 'grad' | number;

export function bucketFor(stats: StatsMap, id: number, threshold: number): StreakBucket {
  const s = statsFor(stats, id);
  if (s.timesReviewed === 0) return 'new';
  if (s.streak >= threshold) return 'grad';
  return s.streak;
}

/** All buckets in display order for a threshold: new, 0 … threshold-1, grad. */
export function bucketOrder(threshold: number): StreakBucket[] {
  return ['new', ...Array.from({ length: Math.max(1, threshold) }, (_, i) => i), 'grad'];
}

export interface ProgressCounts {
  total: number;
  counts: Map<StreakBucket, number>;
}

export function progressCounts(ids: number[], stats: StatsMap, threshold: number): ProgressCounts {
  const counts = new Map<StreakBucket, number>(bucketOrder(threshold).map((b) => [b, 0]));
  for (const id of ids) {
    const b = bucketFor(stats, id, threshold);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return { total: ids.length, counts };
}

export function bucketLabel(b: StreakBucket): string {
  if (b === 'new') return 'Not reviewed';
  if (b === 'grad') return 'Graduated';
  return `Streak ${b}`;
}
