// Scheduling (spec §6). Pure.
import type { PromptKind } from './answers';

export interface ItemStats {
  subjectId: number;
  timesReviewed: number;
  timesCorrect: number;
  timesIncorrect: number;
  /** Consecutive correct sessions on distinct days. */
  streak: number;
  lastReviewedAt: string | null;
  /** YYYY-MM-DD (local); prevents same-day streak inflation. */
  lastStreakDay: string | null;
}

export type StatsMap = Record<number, ItemStats>;

export const emptyStats = (subjectId: number): ItemStats => ({
  subjectId,
  timesReviewed: 0,
  timesCorrect: 0,
  timesIncorrect: 0,
  streak: 0,
  lastReviewedAt: null,
  lastStreakDay: null,
});

export const statsFor = (stats: StatsMap, id: number): ItemStats => stats[id] ?? emptyStats(id);

export const isGraduated = (s: ItemStats | undefined, threshold: number): boolean => !!s && s.streak >= threshold;

/** Never reviewed first, then lowest streak, then oldest lastReviewedAt. Ties keep input order. */
export function orderForSession(ids: number[], stats: StatsMap): number[] {
  const key = (id: number) => {
    const s = statsFor(stats, id);
    return {
      never: s.timesReviewed === 0 ? 0 : 1,
      streak: s.streak,
      last: s.lastReviewedAt ? Date.parse(s.lastReviewedAt) : -Infinity,
    };
  };
  return ids
    .map((id, i) => ({ id, i, k: key(id) }))
    .sort((a, b) => a.k.never - b.k.never || a.k.streak - b.k.streak || a.k.last - b.k.last || a.i - b.i)
    .map((x) => x.id);
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Takes the top `size` items by priority and shuffles them. */
export function selectSession(ids: number[], stats: StatsMap, size: number, rng: () => number = Math.random): number[] {
  return shuffle(orderForSession(ids, stats).slice(0, size), rng);
}

// ---------- stats update ----------

/** Local calendar day, YYYY-MM-DD. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Applies one session outcome. Pass: streak +1 unless already counted today. Fail: streak resets.
 */
export function applyOutcome(prev: ItemStats, passed: boolean, now: Date): ItemStats {
  const today = localDay(now);
  const next: ItemStats = {
    ...prev,
    timesReviewed: prev.timesReviewed + 1,
    timesCorrect: prev.timesCorrect + (passed ? 1 : 0),
    timesIncorrect: prev.timesIncorrect + (passed ? 0 : 1),
    lastReviewedAt: now.toISOString(),
  };
  if (!passed) return { ...next, streak: 0 };
  if (prev.lastStreakDay === today) return next;
  return { ...next, streak: prev.streak + 1, lastStreakDay: today };
}

// ---------- in-session queue ----------

export interface Prompt {
  subjectId: number;
  kind: PromptKind;
}

export interface SessionItem {
  subjectId: number;
  /** False for kana vocabulary, which is quizzed on meaning only. */
  hasReading: boolean;
}

const adjacentSame = (q: Prompt[], i: number) => i > 0 && i < q.length && q[i]!.subjectId === q[i - 1]!.subjectId;

/**
 * Swaps prompts so an item's two prompts are never next to each other, where possible
 * (i.e. at least 2 positions apart). Deterministic given the input.
 */
export function spreadPairs(queue: Prompt[]): Prompt[] {
  const q = [...queue];
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 1; i < q.length; i++) {
      if (!adjacentSame(q, i)) continue;
      for (let j = 0; j < q.length; j++) {
        if (j === i || j === i - 1 || q[j]!.subjectId === q[i]!.subjectId) continue;
        [q[i], q[j]] = [q[j]!, q[i]!];
        const bad = [i, i + 1, j, j + 1].some((k) => adjacentSame(q, k));
        if (!bad) {
          changed = true;
          break;
        }
        [q[i], q[j]] = [q[j]!, q[i]!];
      }
    }
    if (!changed) break;
  }
  return q;
}

export function buildPrompts(items: SessionItem[], rng: () => number = Math.random): Prompt[] {
  const prompts: Prompt[] = items.flatMap((it) =>
    it.hasReading
      ? [
          { subjectId: it.subjectId, kind: 'reading' as const },
          { subjectId: it.subjectId, kind: 'meaning' as const },
        ]
      : [{ subjectId: it.subjectId, kind: 'meaning' as const }],
  );
  return spreadPairs(shuffle(prompts, rng));
}

export interface SessionState {
  /** Remaining prompts; queue[0] is the current one. */
  queue: Prompt[];
  /** Prompts per item still needing a correct answer. */
  pending: Record<number, number>;
  missed: Record<number, boolean>;
  /** Items in completion order, with pass/fail. */
  finished: { subjectId: number; passed: boolean }[];
  answersCorrect: number;
  answersIncorrect: number;
}

export function startSession(items: SessionItem[], rng: () => number = Math.random): SessionState {
  const queue = buildPrompts(items, rng);
  const pending: Record<number, number> = {};
  for (const p of queue) pending[p.subjectId] = (pending[p.subjectId] ?? 0) + 1;
  return { queue, pending, missed: {}, finished: [], answersCorrect: 0, answersIncorrect: 0 };
}

export interface AnswerOutcome {
  state: SessionState;
  /** Set when this answer completed the item. */
  completed?: { subjectId: number; passed: boolean };
}

/**
 * Grades the current prompt. A miss marks the item failed for this session and reinserts the
 * prompt 3–5 positions later (or at the end if fewer remain).
 */
export function answerCurrent(state: SessionState, correct: boolean, rng: () => number = Math.random): AnswerOutcome {
  const [current, ...rest] = state.queue;
  if (!current) return { state };
  const id = current.subjectId;

  if (!correct) {
    const offset = 3 + Math.floor(rng() * 3); // 3, 4 or 5
    const queue = [...rest];
    const at = offset - 1; // positions after the current slot
    if (at >= queue.length) queue.push(current);
    else queue.splice(at, 0, current);
    return {
      state: { ...state, queue, missed: { ...state.missed, [id]: true }, answersIncorrect: state.answersIncorrect + 1 },
    };
  }

  const left = (state.pending[id] ?? 1) - 1;
  const next: SessionState = {
    ...state,
    queue: rest,
    pending: { ...state.pending, [id]: left },
    answersCorrect: state.answersCorrect + 1,
  };
  if (left > 0) return { state: next };
  const completed = { subjectId: id, passed: !state.missed[id] };
  return { state: { ...next, finished: [...next.finished, completed] }, completed };
}

export const isSessionDone = (s: SessionState) => s.queue.length === 0;
