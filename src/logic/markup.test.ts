import { describe, expect, it } from 'vitest';
import { parseMarkup } from './markup';

describe('parseMarkup', () => {
  it('returns nothing for empty input', () => {
    expect(parseMarkup(null)).toEqual([]);
    expect(parseMarkup('')).toEqual([]);
  });

  it('splits known tags into styled segments', () => {
    expect(parseMarkup('The <radical>ground</radical> and <kanji>big</kanji> make <reading>だい</reading>.')).toEqual([
      { text: 'The ' },
      { text: 'ground', tag: 'radical' },
      { text: ' and ' },
      { text: 'big', tag: 'kanji' },
      { text: ' make ' },
      { text: 'だい', tag: 'reading' },
      { text: '.' },
    ]);
  });

  it('strips unknown tags but keeps their text', () => {
    expect(parseMarkup('a <span class="x">b</span> <script>c</script>')).toEqual([{ text: 'a b c' }]);
  });

  it('uses the innermost known tag when nested', () => {
    expect(parseMarkup('<meaning>big <ja>大</ja> one</meaning>')).toEqual([
      { text: 'big ', tag: 'meaning' },
      { text: '大', tag: 'ja' },
      { text: ' one', tag: 'meaning' },
    ]);
  });

  it('tolerates unbalanced tags', () => {
    expect(parseMarkup('x</kanji><vocabulary>y')).toEqual([{ text: 'x' }, { text: 'y', tag: 'vocabulary' }]);
  });

  it('decodes HTML entities', () => {
    expect(parseMarkup('Tom &amp; Jerry &#39;hi&#x27; &lt;3')).toEqual([{ text: "Tom & Jerry 'hi' <3" }]);
  });
});
