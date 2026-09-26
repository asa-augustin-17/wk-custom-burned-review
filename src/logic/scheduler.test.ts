import { describe, expect, it } from 'vitest';
import {
  answerCurrent,
  applyOutcome,
  buildPrompts,
  emptyStats,
  isGraduated,
  isSessionDone,
  orderForSession,
  selectSession,
  shuffle,
  spreadPairs,
  startSession,
  type StatsMap,
} from './scheduler';

const reviewed = (id: number, streak: number, lastReviewedAt: string) => ({
  ...emptyStats(id),
  timesReviewed: 1,
  streak,
  lastReviewedAt,
});

describe('orderForSession', () => {
  const stats: StatsMap = {
    1: reviewed(1, 2, '2025-01-05T00:00:00Z'),
    2: reviewed(2, 0, '2025-01-06T00:00:00Z'),
    3: reviewed(3, 0, '2025-01-02T00:00:00Z'),
    5: reviewed(5, 2, '2025-01-01T00:00:00Z'),
  };

  it('puts never-reviewed first, then lowest streak, then oldest review', () => {
    expect(orderForSession([1, 2, 3, 4, 5, 6], stats)).toEqual([4, 6, 3, 2, 5, 1]);
  });

  it('treats a stats entry with zero reviews as never reviewed', () => {
    expect(orderForSession([1, 7], { ...stats, 7: emptyStats(7) })).toEqual([7, 1]);
  });
});

describe('selectSession', () => {
  it('takes the top N by priority, in shuffled order', () => {
    const stats: StatsMap = { 1: reviewed(1, 3, '2025-01-01T00:00:00Z'), 2: reviewed(2, 3, '2025-01-01T00:00:00Z') };
    const picked = selectSession([1, 2, 3, 4, 5], stats, 3, () => 0);
    expect([...picked].sort()).toEqual([3, 4, 5]);
  });

  it('returns everything when the set is smaller than the session', () => {
    expect(selectSession([1, 2], {}, 20).length).toBe(2);
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0.5);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isGraduated', () => {
  it('compares streak to the threshold', () => {
    expect(isGraduated(undefined, 5)).toBe(false);
    expect(isGraduated({ ...emptyStats(1), streak: 4 }, 5)).toBe(false);
    expect(isGraduated({ ...emptyStats(1), streak: 5 }, 5)).toBe(true);
  });
});

describe('applyOutcome (injectable clock)', () => {
  // Local-time constructors so localDay() is timezone-independent.
  const day1 = new Date(2025, 0, 10, 9, 0);
  const day1Later = new Date(2025, 0, 10, 23, 30);
  const day2 = new Date(2025, 0, 11, 0, 15);
  const day5 = new Date(2025, 0, 14, 12, 0);

  it('increments the streak once per calendar day', () => {
    let s = applyOutcome(emptyStats(1), true, day1);
    expect(s).toMatchObject({ streak: 1, lastStreakDay: '2025-01-10', timesReviewed: 1, timesCorrect: 1 });
    s = applyOutcome(s, true, day1Later);
    expect(s).toMatchObject({ streak: 1, timesReviewed: 2, timesCorrect: 2, lastReviewedAt: day1Later.toISOString() });
    s = applyOutcome(s, true, day2);
    expect(s).toMatchObject({ streak: 2, lastStreakDay: '2025-01-11' });
    s = applyOutcome(s, true, day5);
    expect(s.streak).toBe(3);
  });

  it('resets the streak on a fail', () => {
    let s = applyOutcome(emptyStats(1), true, day1);
    s = applyOutcome(s, true, day2);
    s = applyOutcome(s, false, day5);
    expect(s).toMatchObject({ streak: 0, timesIncorrect: 1, timesCorrect: 2, timesReviewed: 3 });
  });

  it('lets an item rebuild its streak the same day after a fail only once per day', () => {
    let s = applyOutcome(emptyStats(1), true, day1); // streak 1, lastStreakDay day1
    s = applyOutcome(s, false, day2); // streak 0
    s = applyOutcome(s, true, day2); // streak 1
    s = applyOutcome(s, true, day2); // still 1
    expect(s.streak).toBe(1);
  });

  it('reaches graduation after N passes on distinct days', () => {
    let s = emptyStats(1);
    for (let d = 1; d <= 5; d++) s = applyOutcome(s, true, new Date(2025, 1, d, 20));
    expect(isGraduated(s, 5)).toBe(true);
  });
});

describe('buildPrompts / spreadPairs', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ subjectId: i + 1, hasReading: i !== 3 }));

  it('creates reading+meaning prompts, meaning only without readings', () => {
    const q = buildPrompts(items, () => 0.3);
    expect(q.length).toBe(19);
    expect(q.filter((p) => p.subjectId === 4)).toEqual([{ subjectId: 4, kind: 'meaning' }]);
  });

  it('never puts an item\'s two prompts next to each other when avoidable', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const q = buildPrompts(items, rng);
      for (let i = 1; i < q.length; i++) expect(q[i]!.subjectId).not.toBe(q[i - 1]!.subjectId);
    }
  });

  it('fixes adjacent pairs in a given queue', () => {
    const q = spreadPairs([
      { subjectId: 1, kind: 'reading' },
      { subjectId: 1, kind: 'meaning' },
      { subjectId: 2, kind: 'reading' },
      { subjectId: 2, kind: 'meaning' },
      { subjectId: 3, kind: 'meaning' },
    ]);
    for (let i = 1; i < q.length; i++) expect(q[i]!.subjectId).not.toBe(q[i - 1]!.subjectId);
  });

  it('leaves a single item alone (nothing to spread)', () => {
    expect(buildPrompts([{ subjectId: 1, hasReading: true }]).length).toBe(2);
  });
});

describe('session flow', () => {
  const two = [
    { subjectId: 1, hasReading: true },
    { subjectId: 2, hasReading: false },
  ];

  it('passes an item answered correctly on every prompt', () => {
    let s = startSession(two, () => 0);
    const completed: { subjectId: number; passed: boolean }[] = [];
    while (!isSessionDone(s)) {
      const out = answerCurrent(s, true);
      if (out.completed) completed.push(out.completed);
      s = out.state;
    }
    expect(completed.sort((a, b) => a.subjectId - b.subjectId)).toEqual([
      { subjectId: 1, passed: true },
      { subjectId: 2, passed: true },
    ]);
    expect(s.answersCorrect).toBe(3);
  });

  it('reinserts a missed prompt 3–5 positions later', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ subjectId: i + 1, hasReading: false }));
    for (const [r, expectedIndex] of [[0, 2], [0.5, 3], [0.99, 4]] as const) {
      const s = startSession(items, () => 0.4);
      const missed = s.queue[0]!;
      const out = answerCurrent(s, false, () => r);
      // Index in the remaining queue; +1 = positions after where it was.
      expect(out.state.queue.indexOf(missed)).toBe(expectedIndex);
      expect(out.state.queue.length).toBe(6);
    }
  });

  it('reinserts at the end when fewer prompts remain', () => {
    const s = startSession([{ subjectId: 1, hasReading: false }, { subjectId: 2, hasReading: false }], () => 0);
    const missed = s.queue[0]!;
    const out = answerCurrent(s, false, () => 0.99);
    expect(out.state.queue[out.state.queue.length - 1]).toBe(missed);
  });

  it('fails an item that had any miss, even once completed', () => {
    let s = startSession([{ subjectId: 1, hasReading: false }], () => 0);
    s = answerCurrent(s, false).state;
    const out = answerCurrent(s, true);
    expect(out.completed).toEqual({ subjectId: 1, passed: false });
    expect(isSessionDone(out.state)).toBe(true);
    expect(out.state).toMatchObject({ answersCorrect: 1, answersIncorrect: 1 });
  });

  it('only completes an item after both prompts are correct', () => {
    let s = startSession([{ subjectId: 1, hasReading: true }], () => 0);
    const first = answerCurrent(s, true);
    expect(first.completed).toBeUndefined();
    s = first.state;
    expect(answerCurrent(s, true).completed).toEqual({ subjectId: 1, passed: true });
  });
});
