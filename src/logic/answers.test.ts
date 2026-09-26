import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  checkMeaning,
  checkReading,
  levenshtein,
  normalizeMeaning,
  typoTolerance,
  type AnswerSubject,
} from './answers';

const m = (meaning: string, primary = false, accepted_answer = true) => ({ meaning, primary, accepted_answer });
const r = (reading: string, type?: 'onyomi' | 'kunyomi', accepted_answer = true, primary = false) => ({
  reading,
  type,
  accepted_answer,
  primary,
});

// Kanji 妹: on'yomi accepted, kun'yomi not.
const imouto: AnswerSubject = {
  meanings: [m('Younger Sister', true), m('Little Sister')],
  auxiliary_meanings: [
    { meaning: 'Sis', type: 'whitelist' },
    { meaning: 'Sister', type: 'blacklist' },
    { meaning: 'Older Sister', type: 'blacklist' },
  ],
  readings: [r('まい', 'onyomi', true, true), r('いもうと', 'kunyomi', false)],
};

// Vocab 平安
const heian: AnswerSubject = {
  meanings: [m('Peace', true), m('Tranquility'), m('Heian Period'), m('Obsolete Thing', false, false)],
  auxiliary_meanings: [{ meaning: 'Piece', type: 'blacklist' }],
  readings: [r('へいあん', undefined, true, true)],
};

// Kana vocab: no readings.
const kanaVocab: AnswerSubject = { meanings: [m('Onomatopoeia', true)], auxiliary_meanings: [] };

// Vocab 大 with a 3-letter meaning and an 8+ letter one.
const dai: AnswerSubject = {
  meanings: [m('Big', true), m('Enormousness')],
  auxiliary_meanings: [],
  readings: [r('だい', undefined, true, true)],
};

describe('helpers', () => {
  it('normalizes meanings', () => {
    expect(normalizeMeaning('  Younger   Sister!! ')).toBe('younger sister');
    expect(normalizeMeaning("To Go (Honorific)")).toBe('to go honorific');
    expect(normalizeMeaning('Light-Year')).toBe('light year');
    expect(normalizeMeaning('ＰＥＡＣＥ')).toBe('peace');
  });

  it('computes Levenshtein distance', () => {
    expect(levenshtein('peace', 'peace')).toBe(0);
    expect(levenshtein('peace', 'peice')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('sets typo tolerance by answer length', () => {
    expect(typoTolerance('big')).toBe(0);
    expect(typoTolerance('word')).toBe(1);
    expect(typoTolerance('peaceful')).toBe(2);
    expect(typoTolerance('seven77')).toBe(1);
  });
});

describe('checkReading', () => {
  it('accepts hiragana', () => {
    expect(checkReading('まい', imouto)).toMatchObject({ kind: 'correct', closeEnough: false });
  });

  it('accepts katakana and romaji input', () => {
    expect(checkReading('マイ', imouto).kind).toBe('correct');
    expect(checkReading('ヘイアン', heian).kind).toBe('correct');
    expect(checkReading('heian', heian).kind).toBe('correct');
    expect(checkReading('hei an ', heian).kind).toBe('correct');
  });

  it('handles a trailing n left by IME binding', () => {
    expect(checkReading('へいあn', heian).kind).toBe('correct');
  });

  it('shakes on a non-accepted reading and names the wanted type', () => {
    const res = checkReading('いもうと', imouto);
    expect(res).toMatchObject({ kind: 'shake', reason: 'other-reading' });
    expect(res.kind === 'shake' && res.message).toBe("WaniKani wants the on'yomi reading.");
  });

  it('marks other kana as incorrect', () => {
    expect(checkReading('へいわ', heian)).toEqual({ kind: 'incorrect' });
  });

  it('shakes when the meaning is typed on a reading prompt', () => {
    expect(checkReading('peace', heian)).toMatchObject({ kind: 'shake', reason: 'want-reading' });
    // What wanakana.bind produces while typing "big"
    expect(checkReading('びg', dai)).toMatchObject({ kind: 'shake', reason: 'want-reading' });
  });

  it('shakes on input that is not kana', () => {
    expect(checkReading('xyz!', heian)).toMatchObject({ kind: 'shake', reason: 'not-kana' });
  });

  it('shakes on empty input', () => {
    expect(checkReading('   ', heian)).toMatchObject({ kind: 'shake', reason: 'empty' });
  });
});

describe('checkMeaning', () => {
  it('accepts primary and alternative meanings, ignoring case, spacing and punctuation', () => {
    expect(checkMeaning('younger sister', imouto)).toMatchObject({ kind: 'correct', matched: 'Younger Sister' });
    expect(checkMeaning('  LITTLE   sister. ', imouto)).toMatchObject({ kind: 'correct', matched: 'Little Sister' });
  });

  it('accepts whitelisted auxiliary meanings', () => {
    expect(checkMeaning('sis', imouto).kind).toBe('correct');
  });

  it('rejects non-accepted meanings', () => {
    expect(checkMeaning('obsolete thing', heian).kind).toBe('incorrect');
  });

  it('accepts user synonyms', () => {
    expect(checkMeaning('calm', heian).kind).toBe('incorrect');
    expect(checkMeaning('calm', heian, ['Calm'])).toMatchObject({ kind: 'correct', matched: 'Calm' });
  });

  it('always rejects blacklisted meanings, even within typo distance', () => {
    expect(checkMeaning('sister', imouto)).toEqual({ kind: 'incorrect' });
    expect(checkMeaning('older sister', imouto)).toEqual({ kind: 'incorrect' });
    // "piece" is 1 edit from "peace" but blacklisted
    expect(checkMeaning('piece', heian)).toEqual({ kind: 'incorrect' });
  });

  it('does not accept a near-miss that is as close to a blacklisted meaning', () => {
    // "pieace": distance 1 from "peace" and 1 from "piece"
    expect(checkMeaning('pieace', heian)).toEqual({ kind: 'incorrect' });
  });

  describe('typo tolerance', () => {
    it('allows none for answers of 3 or fewer characters', () => {
      expect(checkMeaning('bog', dai).kind).toBe('incorrect');
    });

    it('allows 1 edit for 4–7 characters', () => {
      expect(checkMeaning('peice', heian)).toMatchObject({ kind: 'correct', closeEnough: true, matched: 'Peace' });
      expect(checkMeaning('pice', heian).kind).toBe('incorrect'); // 2 edits
    });

    it('allows 2 edits for 8+ characters', () => {
      expect(checkMeaning('tranquilty', heian)).toMatchObject({ kind: 'correct', closeEnough: true }); // 1 edit
      expect(checkMeaning('trankuility', heian)).toMatchObject({ kind: 'correct', closeEnough: true }); // 2 edits
      expect(checkMeaning('trenkuilitty', heian).kind).toBe('incorrect'); // 3 edits
    });

    it('measures against the accepted answer length', () => {
      expect(checkMeaning('enormusnes', dai)).toMatchObject({ kind: 'correct', closeEnough: true }); // 2 edits
    });
  });

  it('shakes when the reading is typed on a meaning prompt', () => {
    expect(checkMeaning('へいあん', heian)).toMatchObject({ kind: 'shake', reason: 'want-meaning' });
    expect(checkMeaning('heian', heian)).toMatchObject({ kind: 'shake', reason: 'want-meaning' });
    expect(checkMeaning('マイ', imouto)).toMatchObject({ kind: 'shake', reason: 'want-meaning' });
  });

  it('prefers a real meaning over a reading hint when romaji is also a meaning', () => {
    // "Heian Period" is a meaning; "heian" alone is the reading.
    expect(checkMeaning('heian period', heian).kind).toBe('correct');
  });

  it('shakes on other Japanese text', () => {
    expect(checkMeaning('いもうと', heian)).toMatchObject({ kind: 'shake', reason: 'not-english' });
  });

  it('works for kana vocab without readings', () => {
    expect(checkMeaning('onomatopoeia', kanaVocab).kind).toBe('correct');
    expect(checkMeaning('onomatopia', kanaVocab).kind).toBe('correct');
  });
});

describe('checkAnswer', () => {
  it('dispatches by prompt kind', () => {
    expect(checkAnswer('reading', 'だい', dai).kind).toBe('correct');
    expect(checkAnswer('meaning', 'big', dai).kind).toBe('correct');
  });
});
