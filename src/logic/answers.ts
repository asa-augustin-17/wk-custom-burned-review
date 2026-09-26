// Answer checking (spec §5.5). Pure.
import { isKana, toHiragana, toRomaji } from 'wanakana';
import type { AuxiliaryMeaning, SubjectMeaning, SubjectReading } from '../api/endpoints';

export type PromptKind = 'reading' | 'meaning';

export interface AnswerSubject {
  meanings: SubjectMeaning[];
  auxiliary_meanings: AuxiliaryMeaning[];
  readings?: SubjectReading[];
}

export type ShakeReason = 'empty' | 'other-reading' | 'want-meaning' | 'want-reading' | 'not-kana' | 'not-english';

export type CheckResult =
  | { kind: 'correct'; closeEnough: boolean; matched: string }
  | { kind: 'incorrect' }
  /** Not graded: shake the input and show `message`, like WK does. */
  | { kind: 'shake'; reason: ShakeReason; message: string };

const YOMI_NAME = { onyomi: "on'yomi", kunyomi: "kun'yomi", nanori: 'nanori' } as const;

// ---------- normalization ----------

/** Lowercase, NFKC, hyphens/slashes to spaces, strip other punctuation, collapse whitespace, trim. */
export function normalizeMeaning(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[-‐‑–—/_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Converts romaji or katakana to hiragana and removes whitespace. */
export function normalizeReading(s: string): string {
  return toHiragana(s.normalize('NFKC').replace(/\s+/g, ''));
}

// ---------- typo tolerance ----------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[y.length]!;
}

/** Allowed edit distance for an accepted answer: 0 for ≤3 chars, 1 for 4–7, 2 for 8+. */
export function typoTolerance(answer: string): number {
  const n = [...answer].length;
  if (n <= 3) return 0;
  if (n <= 7) return 1;
  return 2;
}

// ---------- answer sets ----------

export function acceptedMeanings(subject: AnswerSubject, synonyms: string[] = []): string[] {
  return [
    ...subject.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning),
    ...subject.auxiliary_meanings.filter((m) => m.type === 'whitelist').map((m) => m.meaning),
    ...synonyms,
  ];
}

const blacklist = (subject: AnswerSubject) =>
  subject.auxiliary_meanings.filter((m) => m.type === 'blacklist').map((m) => normalizeMeaning(m.meaning));

export const acceptedReadings = (subject: AnswerSubject): SubjectReading[] =>
  (subject.readings ?? []).filter((r) => r.accepted_answer);

// ---------- checks ----------

/** Pure meaning match, ignoring cross-type hints. */
function matchMeaning(input: string, subject: AnswerSubject, synonyms: string[]): CheckResult {
  const guess = normalizeMeaning(input);
  if (!guess) return { kind: 'incorrect' };
  const accepted = acceptedMeanings(subject, synonyms).map((m) => ({ raw: m, norm: normalizeMeaning(m) }));
  const exact = accepted.find((a) => a.norm === guess);
  if (exact) return { kind: 'correct', closeEnough: false, matched: exact.raw };

  const black = blacklist(subject);
  if (black.includes(guess)) return { kind: 'incorrect' };

  let best: { raw: string; dist: number } | null = null;
  for (const a of accepted) {
    const dist = levenshtein(guess, a.norm);
    if (dist <= typoTolerance(a.norm) && (!best || dist < best.dist)) best = { raw: a.raw, dist };
  }
  if (!best) return { kind: 'incorrect' };
  // Don't let typo tolerance land on a meaning WK explicitly rejects.
  if (black.some((b) => levenshtein(guess, b) <= best.dist)) return { kind: 'incorrect' };
  return { kind: 'correct', closeEnough: true, matched: best.raw };
}

export function checkMeaning(input: string, subject: AnswerSubject, synonyms: string[] = []): CheckResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'shake', reason: 'empty', message: '' };

  const result = matchMeaning(trimmed, subject, synonyms);
  if (result.kind === 'correct') return result;

  // Reading given on a meaning prompt (typed as kana, or as romaji that spells a reading).
  const asKana = normalizeReading(trimmed);
  const readings = (subject.readings ?? []).map((r) => normalizeReading(r.reading));
  if (isKana(asKana) && readings.includes(asKana)) {
    return { kind: 'shake', reason: 'want-meaning', message: 'That’s the reading. We want the meaning.' };
  }
  if (/[぀-ヿ㐀-鿿]/.test(trimmed)) {
    return { kind: 'shake', reason: 'not-english', message: 'Answer the meaning in English.' };
  }
  return result;
}

export function checkReading(input: string, subject: AnswerSubject, synonyms: string[] = []): CheckResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'shake', reason: 'empty', message: '' };
  const guess = normalizeReading(trimmed);

  const accepted = acceptedReadings(subject);
  const hit = accepted.find((r) => normalizeReading(r.reading) === guess);
  if (hit) return { kind: 'correct', closeEnough: false, matched: hit.reading };

  const other = (subject.readings ?? []).find((r) => !r.accepted_answer && normalizeReading(r.reading) === guess);
  if (other) {
    const wantedTypes = [...new Set(accepted.map((r) => r.type).filter((t) => !!t))];
    const wanted = wantedTypes.length === 1 ? ` the ${YOMI_NAME[wantedTypes[0]!]}` : ' a different reading';
    return {
      kind: 'shake',
      reason: 'other-reading',
      message: `WaniKani wants${wanted}${wantedTypes.length === 1 ? ' reading' : ''}.`,
    };
  }

  // Meaning given on a reading prompt. With IME binding "big" arrives as "びg", so also try romaji.
  const romaji = toRomaji(trimmed);
  for (const candidate of [trimmed, romaji]) {
    const m = matchMeaning(candidate, subject, synonyms);
    if (m.kind === 'correct' && !m.closeEnough) {
      return { kind: 'shake', reason: 'want-reading', message: 'That’s the meaning. We want the reading.' };
    }
  }

  if (!isKana(guess)) return { kind: 'shake', reason: 'not-kana', message: 'Answer the reading in kana.' };
  return { kind: 'incorrect' };
}

export function checkAnswer(
  prompt: PromptKind,
  input: string,
  subject: AnswerSubject,
  synonyms: string[] = [],
): CheckResult {
  return prompt === 'reading' ? checkReading(input, subject, synonyms) : checkMeaning(input, subject, synonyms);
}
