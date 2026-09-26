// Parses WaniKani mnemonic markup into styled segments. Pure.
// Known tags become styled spans; unknown tags are stripped (their text is kept).

export const KNOWN_TAGS = ['radical', 'kanji', 'vocabulary', 'reading', 'meaning', 'ja', 'b', 'strong', 'i', 'em'] as const;
export type KnownTag = (typeof KNOWN_TAGS)[number];

export interface Segment {
  text: string;
  /** Innermost known tag wrapping this text, if any. */
  tag?: KnownTag;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const isKnown = (t: string): t is KnownTag => (KNOWN_TAGS as readonly string[]).includes(t);

export function parseMarkup(input: string | null | undefined): Segment[] {
  if (!input) return [];
  const out: Segment[] = [];
  const stack: KnownTag[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;
  let last = 0;

  const push = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    const tag = stack[stack.length - 1];
    const prev = out[out.length - 1];
    if (prev && prev.tag === tag) prev.text += text;
    else out.push(tag ? { text, tag } : { text });
  };

  for (let m = re.exec(input); m; m = re.exec(input)) {
    push(input.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === '/';
    const name = m[2]!.toLowerCase();
    if (!isKnown(name)) continue;
    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      stack.push(name);
    }
  }
  push(input.slice(last));
  return out;
}
