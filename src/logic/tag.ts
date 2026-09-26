// Tag matching (and, from milestone 6, untagging). Pure functions.

export interface NoteFields {
  reading_note: string | null;
  meaning_note: string | null;
  hidden: boolean;
}

export const normalize = (s: string): string => s.normalize('NFKC');

/** True when the note(s) contain the tag after NFKC normalization. Hidden study materials never match. */
export function hasTag(sm: NoteFields, tag: string, includeMeaningNote: boolean): boolean {
  if (sm.hidden) return false;
  const needle = normalize(tag.trim());
  if (!needle) return false;
  if (sm.reading_note && normalize(sm.reading_note).includes(needle)) return true;
  return includeMeaningNote && !!sm.meaning_note && normalize(sm.meaning_note).includes(needle);
}

/**
 * Removes every occurrence of the tag from a note, then tidies up what's left: collapses runs of
 * spaces the removal created, drops lines that held only the tag, collapses runs of blank lines to
 * one, and trims. Lines without the tag are left untouched.
 */
export function removeTag(note: string, tag: string): string {
  const t = tag.trim();
  if (!t) return note;
  const nt = normalize(t);
  const lines: string[] = [];
  for (const line of note.split(/\r?\n/)) {
    let stripped = line.split(t).join('');
    // The tag may be stored in a compatibility form (e.g. full-width) that only matches after NFKC;
    // normalize only the lines where that is the case.
    if (normalize(stripped).includes(nt)) stripped = normalize(stripped).split(nt).join('');
    if (stripped === line) {
      lines.push(line);
      continue;
    }
    const tidy = stripped.replace(/[ \t\u3000]{2,}/g, ' ').trim();
    if (tidy) lines.push(tidy);
  }
  return lines
    .join('\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
    .trim();
}
