// Stats export / import (spec §7). Pure.
import type { ItemStats, StatsMap } from './scheduler';

export const STATS_EXPORT_FORMAT = 'wanikani-burned-stats';
export const STATS_EXPORT_VERSION = 1;

export interface StatsExport {
  format: typeof STATS_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  stats: StatsMap;
}

export function buildExport(stats: StatsMap, now: Date): StatsExport {
  return { format: STATS_EXPORT_FORMAT, version: STATS_EXPORT_VERSION, exportedAt: now.toISOString(), stats };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function validItem(v: unknown): v is ItemStats {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    isNum(s.subjectId) &&
    isNum(s.timesReviewed) &&
    isNum(s.timesCorrect) &&
    isNum(s.timesIncorrect) &&
    isNum(s.streak) &&
    isStrOrNull(s.lastReviewedAt) &&
    isStrOrNull(s.lastStreakDay)
  );
}

export type ParseResult = { ok: true; stats: StatsMap; skipped: number } | { ok: false; error: string };

/** Parses an exported file. Invalid entries are skipped (and counted), not fatal. */
export function parseExport(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  const d = data as Partial<StatsExport> | null;
  if (!d || d.format !== STATS_EXPORT_FORMAT || typeof d.stats !== 'object' || d.stats === null) {
    return { ok: false, error: 'That file isn’t a stats export from this app.' };
  }
  if (typeof d.version !== 'number' || d.version > STATS_EXPORT_VERSION) {
    return { ok: false, error: 'That export was made by a newer version of this app.' };
  }
  const stats: StatsMap = {};
  let skipped = 0;
  for (const [key, value] of Object.entries(d.stats)) {
    if (validItem(value) && String(value.subjectId) === key) stats[value.subjectId] = { ...value };
    else skipped++;
  }
  return { ok: true, stats, skipped };
}

const reviewedAt = (s: ItemStats) => (s.lastReviewedAt ? Date.parse(s.lastReviewedAt) : -Infinity);

/**
 * Merges imported stats into existing ones. Per item, keeps whichever record is more recent
 * (by lastReviewedAt, then by timesReviewed), so importing an old backup never erases newer history.
 */
export function mergeStats(existing: StatsMap, incoming: StatsMap): { stats: StatsMap; added: number; updated: number } {
  const stats: StatsMap = { ...existing };
  let added = 0;
  let updated = 0;
  for (const inc of Object.values(incoming)) {
    const cur = stats[inc.subjectId];
    if (!cur) {
      stats[inc.subjectId] = inc;
      added++;
    } else if (reviewedAt(inc) > reviewedAt(cur) || (reviewedAt(inc) === reviewedAt(cur) && inc.timesReviewed > cur.timesReviewed)) {
      stats[inc.subjectId] = inc;
      updated++;
    }
  }
  return { stats, added, updated };
}
