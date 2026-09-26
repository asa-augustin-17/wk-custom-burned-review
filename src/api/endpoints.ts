import type { WkClient, WkResource } from './client';

export interface WkUser {
  username: string;
  level: number;
  profile_url: string;
  subscription: { active: boolean; max_level_granted: number };
}

export type SubjectType = 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary';

export interface StudyMaterial {
  subject_id: number;
  subject_type: SubjectType;
  reading_note: string | null;
  meaning_note: string | null;
  meaning_synonyms: string[];
  hidden: boolean;
}

export interface Assignment {
  subject_id: number;
  subject_type: SubjectType;
  burned_at: string | null;
  resurrected_at: string | null;
  started_at: string | null;
  srs_stage: number;
  hidden: boolean;
}

export interface SubjectMeaning {
  meaning: string;
  primary: boolean;
  accepted_answer: boolean;
}

export interface AuxiliaryMeaning {
  meaning: string;
  type: 'whitelist' | 'blacklist';
}

export interface SubjectReading {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
  type?: 'onyomi' | 'kunyomi' | 'nanori';
}

export interface CharacterImage {
  url: string;
  content_type: string;
  metadata: Record<string, unknown>;
}

export interface Subject {
  characters: string | null;
  character_images?: CharacterImage[];
  meanings: SubjectMeaning[];
  auxiliary_meanings: AuxiliaryMeaning[];
  readings?: SubjectReading[];
  meaning_mnemonic: string;
  reading_mnemonic?: string;
  document_url: string;
  level: number;
  slug: string;
  /** Vocabulary and kana vocabulary only, e.g. ["noun", "する verb"]. */
  parts_of_speech?: string[];
  hidden_at: string | null;
}

export const getUser = async (client: WkClient) =>
  (await client.request<{ data: WkUser }>('/user')).data;

export const getStudyMaterials = (
  client: WkClient,
  updatedAfter: string | null,
  onPage?: (page: number, fetched: number, total: number) => void,
): Promise<WkResource<StudyMaterial>[]> => {
  const qs = updatedAfter ? `?updated_after=${encodeURIComponent(updatedAfter)}` : '';
  return client.getAll<StudyMaterial>(`/study_materials${qs}`, onPage);
};

export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * All assignments for the given subjects. Not filtered with burned=true: WK keeps burned_at
 * after a resurrection, so that filter also returns resurrected items. Use isBurned() instead.
 */
export const getAssignments = async (
  client: WkClient,
  subjectIds: number[],
  onChunk?: (done: number, total: number) => void,
): Promise<WkResource<Assignment>[]> => {
  const chunks = chunk(subjectIds);
  const out: WkResource<Assignment>[] = [];
  for (const [i, ids] of chunks.entries()) {
    out.push(...(await client.getAll<Assignment>(`/assignments?subject_ids=${ids.join(',')}`)));
    onChunk?.(i + 1, chunks.length);
  }
  return out;
};

export const getSubjects = async (
  client: WkClient,
  ids: number[],
  onChunk?: (done: number, total: number) => void,
): Promise<WkResource<Subject>[]> => {
  const chunks = chunk(ids);
  const out: WkResource<Subject>[] = [];
  for (const [i, part] of chunks.entries()) {
    out.push(...(await client.getAll<Subject>(`/subjects?ids=${part.join(',')}`)));
    onChunk?.(i + 1, chunks.length);
  }
  return out;
};

export const updateReadingNote = (client: WkClient, studyMaterialId: number, readingNote: string) =>
  client.request<WkResource<StudyMaterial>>(`/study_materials/${studyMaterialId}`, {
    method: 'PUT',
    body: { study_material: { reading_note: readingNote } },
  });

export const BURNED_SRS_STAGE = 9;

/** Currently burned: at the Burned SRS stage. burned_at alone is unreliable (kept after resurrection). */
export const isBurned = (a: Assignment): boolean => a.srs_stage === BURNED_SRS_STAGE;
