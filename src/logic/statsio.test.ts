import { describe, expect, it } from 'vitest';
import { emptyStats, type ItemStats } from './scheduler';
import { buildExport, mergeStats, parseExport } from './statsio';

const st = (id: number, lastReviewedAt: string | null, timesReviewed = 1, streak = 1): ItemStats => ({
  ...emptyStats(id),
  timesReviewed,
  timesCorrect: timesReviewed,
  streak,
  lastReviewedAt,
  lastStreakDay: lastReviewedAt?.slice(0, 10) ?? null,
});

describe('export / parse round trip', () => {
  it('round-trips stats', () => {
    const stats = { 1: st(1, '2025-01-01T00:00:00Z'), 2: st(2, null, 0, 0) };
    const text = JSON.stringify(buildExport(stats, new Date('2025-02-01T00:00:00Z')));
    expect(parseExport(text)).toEqual({ ok: true, stats, skipped: 0 });
  });
});

describe('parseExport', () => {
  it('rejects non-JSON', () => {
    expect(parseExport('not json')).toMatchObject({ ok: false });
  });

  it('rejects other JSON files', () => {
    expect(parseExport('{"hello": 1}')).toMatchObject({ ok: false, error: expect.stringContaining('isn’t a stats export') });
  });

  it('rejects exports from a newer version', () => {
    expect(parseExport(JSON.stringify({ format: 'wanikani-burned-stats', version: 99, stats: {} }))).toMatchObject({ ok: false });
  });

  it('skips malformed entries', () => {
    const text = JSON.stringify({
      format: 'wanikani-burned-stats',
      version: 1,
      stats: { 1: st(1, null), 2: { subjectId: 2, streak: 'lots' }, 3: st(4, null) },
    });
    const res = parseExport(text);
    expect(res).toMatchObject({ ok: true, skipped: 2 });
    expect(res.ok && Object.keys(res.stats)).toEqual(['1']);
  });
});

describe('mergeStats', () => {
  it('adds new items and keeps the more recent record per item', () => {
    const existing = { 1: st(1, '2025-03-01T00:00:00Z', 5, 3), 2: st(2, '2025-01-01T00:00:00Z') };
    const incoming = { 1: st(1, '2025-02-01T00:00:00Z', 4, 2), 2: st(2, '2025-02-01T00:00:00Z', 2, 2), 3: st(3, null, 0, 0) };
    const { stats, added, updated } = mergeStats(existing, incoming);
    expect(stats[1]!.streak).toBe(3); // existing is newer
    expect(stats[2]!.streak).toBe(2); // incoming is newer
    expect(stats[3]).toBeDefined();
    expect({ added, updated }).toEqual({ added: 1, updated: 1 });
  });

  it('breaks ties on timesReviewed', () => {
    const t = '2025-01-01T00:00:00Z';
    expect(mergeStats({ 1: st(1, t, 1) }, { 1: st(1, t, 3) }).stats[1]!.timesReviewed).toBe(3);
    expect(mergeStats({ 1: st(1, t, 3) }, { 1: st(1, t, 1) }).stats[1]!.timesReviewed).toBe(3);
  });
});
