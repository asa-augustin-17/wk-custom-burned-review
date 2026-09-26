import { describe, expect, it } from 'vitest';
import { hasTag, removeTag } from './tag';

const sm = (reading_note: string | null, meaning_note: string | null = null, hidden = false) => ({
  reading_note,
  meaning_note,
  hidden,
});

describe('hasTag', () => {
  it('matches the tag anywhere in the reading note', () => {
    expect(hasTag(sm('復習'), '復習', false)).toBe(true);
    expect(hasTag(sm('remember ふく not ぷく 復習 !'), '復習', false)).toBe(true);
  });

  it('does not match when absent or note is null', () => {
    expect(hasTag(sm('復'), '復習', false)).toBe(false);
    expect(hasTag(sm(null), '復習', false)).toBe(false);
  });

  it('only searches meaning notes when enabled', () => {
    expect(hasTag(sm(null, 'tag 復習'), '復習', false)).toBe(false);
    expect(hasTag(sm(null, 'tag 復習'), '復習', true)).toBe(true);
  });

  it('skips hidden study materials', () => {
    expect(hasTag(sm('復習', null, true), '復習', false)).toBe(false);
  });

  it('normalizes with NFKC (full-width / half-width forms)', () => {
    expect(hasTag(sm('note ＃ＲＥＶＩＥＷ'), '#REVIEW', false)).toBe(true);
    expect(hasTag(sm('ﾌｸｼｭｳ'), 'フクシュウ', false)).toBe(true);
    // CJK compatibility ideograph normalizes to the unified one
    expect(hasTag(sm('類'), '類', false)).toBe(true);
  });

  it('never matches an empty tag', () => {
    expect(hasTag(sm('anything'), '  ', false)).toBe(false);
  });
});

describe('removeTag', () => {
  it('removes a note that is only the tag', () => {
    expect(removeTag('復習', '復習')).toBe('');
    expect(removeTag('  復習 \n', '復習')).toBe('');
  });

  it('removes the tag inline and collapses the leftover double space', () => {
    expect(removeTag('ふく not ぷく 復習 remember', '復習')).toBe('ふく not ぷく remember');
    expect(removeTag('復習 at start', '復習')).toBe('at start');
    expect(removeTag('at end 復習', '復習')).toBe('at end');
  });

  it('removes every occurrence', () => {
    expect(removeTag('復習 a 復習 b 復習', '復習')).toBe('a b');
    expect(removeTag('a復習復習b', '復習')).toBe('ab');
  });

  it('drops lines that held only the tag', () => {
    expect(removeTag('line one\n復習\nline two', '復習')).toBe('line one\nline two');
    expect(removeTag('復習\n\nreal note', '復習')).toBe('real note');
  });

  it('collapses runs of blank lines but keeps a single paragraph break', () => {
    expect(removeTag('para one\n\n復習\n\npara two', '復習')).toBe('para one\n\npara two');
  });

  it('leaves untagged lines exactly as they were', () => {
    expect(removeTag('keep  two  spaces\n復習', '復習')).toBe('keep  two  spaces');
    expect(removeTag('no tag here', '復習')).toBe('no tag here');
  });

  it('removes compatibility-form tags', () => {
    expect(removeTag('note ＃ＲＥＶＩＥＷ here', '#REVIEW')).toBe('note here');
  });

  it('handles CRLF line endings', () => {
    expect(removeTag('a\r\n復習\r\nb', '復習')).toBe('a\nb');
  });

  it('result no longer matches the tag', () => {
    const out = removeTag('x 復習 y\n復習', '復習');
    expect(hasTag({ reading_note: out, meaning_note: null, hidden: false }, '復習', false)).toBe(false);
  });
});
