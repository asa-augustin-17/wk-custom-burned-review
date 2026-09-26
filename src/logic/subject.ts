// Small pure helpers for reading subject data.
import type { Subject, SubjectType } from '../api/endpoints';

export const TYPE_LABEL: Record<SubjectType, string> = {
  radical: 'Radical',
  kanji: 'Kanji',
  vocabulary: 'Vocabulary',
  kana_vocabulary: 'Kana vocab',
};

export const primaryMeaning = (s: Subject): string =>
  s.meanings.find((m) => m.primary)?.meaning ?? s.meanings[0]?.meaning ?? '';

export const primaryReading = (s: Subject): string | null =>
  s.readings?.find((r) => r.primary)?.reading ?? s.readings?.[0]?.reading ?? null;

export const hasReadings = (s: Subject): boolean => (s.readings?.length ?? 0) > 0;
