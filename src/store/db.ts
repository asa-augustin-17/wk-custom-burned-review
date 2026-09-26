// IndexedDB persistence via idb-keyval (spec §7).
import { clear, del, get, getMany, set, setMany } from 'idb-keyval';
import type { StudyMaterial, Subject, SubjectType } from '../api/endpoints';
import type { StatsMap } from '../logic/scheduler';

export const SCHEMA_VERSION = 1;

export interface CachedStudyMaterial extends StudyMaterial {
  /** Study material resource id (needed for PUT). */
  id: number;
}

export interface CachedSubject {
  id: number;
  type: SubjectType;
  fetchedAt: string;
  data: Subject;
}

/** Assignment status for a tagged subject (absent = no assignment, i.e. never started). */
export interface AssignmentStatus {
  srs_stage: number;
  burned_at: string | null;
  resurrected_at: string | null;
  hidden: boolean;
}

export type StudyMaterialMap = Record<number, CachedStudyMaterial>;
export type SubjectMap = Record<number, CachedSubject>;

/** Everything sync reads and writes. */
export interface SyncState {
  studyMaterials: StudyMaterialMap;
  subjects: SubjectMap;
  targetIds: number[];
  taggedNotBurnedIds: number[];
  assignments: Record<number, AssignmentStatus>;
  lastSyncedAt: string | null;
}

/** Storage used by sync; injectable so sync can be tested without IndexedDB. */
export interface SyncStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}

const SYNC_KEYS = ['studyMaterials', 'subjects', 'targetIds', 'taggedNotBurnedIds', 'assignments', 'lastSyncedAt'] as const;

export const idbSyncStore: SyncStore = {
  async load() {
    const [studyMaterials, subjects, targetIds, taggedNotBurnedIds, assignments, lastSyncedAt] = await getMany(SYNC_KEYS as unknown as string[]);
    return {
      studyMaterials: (studyMaterials as StudyMaterialMap | undefined) ?? {},
      subjects: (subjects as SubjectMap | undefined) ?? {},
      targetIds: (targetIds as number[] | undefined) ?? [],
      taggedNotBurnedIds: (taggedNotBurnedIds as number[] | undefined) ?? [],
      assignments: (assignments as Record<number, AssignmentStatus> | undefined) ?? {},
      lastSyncedAt: (lastSyncedAt as string | null | undefined) ?? null,
    };
  },
  async save(s) {
    await setMany([
      ['studyMaterials', s.studyMaterials],
      ['subjects', s.subjects],
      ['targetIds', s.targetIds],
      ['taggedNotBurnedIds', s.taggedNotBurnedIds],
      ['assignments', s.assignments],
      ['lastSyncedAt', s.lastSyncedAt],
    ]);
  },
};

/** After a successful untag: store the updated study material and drop the item from the tagged sets. */
export async function applyUntag(updated: CachedStudyMaterial, store: SyncStore = idbSyncStore): Promise<void> {
  const state = await store.load();
  const id = updated.subject_id;
  await store.save({
    ...state,
    studyMaterials: { ...state.studyMaterials, [id]: updated },
    targetIds: state.targetIds.filter((x) => x !== id),
    taggedNotBurnedIds: state.taggedNotBurnedIds.filter((x) => x !== id),
  });
}

export const getLastSyncedAt = async () => (await get<string | null>('lastSyncedAt')) ?? null;

/** Username the cache belongs to; the cache is dropped if a different account's token is used. */
export const getCacheOwner = () => get<string>('cacheOwner');
export const setCacheOwner = (username: string) => set('cacheOwner', username);

export async function clearSyncCache(): Promise<void> {
  await Promise.all(SYNC_KEYS.map((k) => del(k)));
}

export const loadStats = async (): Promise<StatsMap> => (await get<StatsMap>('stats')) ?? {};
export const saveStats = (stats: StatsMap): Promise<void> => set('stats', stats);

type Migration = () => Promise<void>;
/** migrations[n] upgrades from version n to n+1. */
const migrations: Record<number, Migration> = {};

export async function migrate(): Promise<void> {
  let version = (await get<number>('version')) ?? 0;
  if (version === 0) {
    await set('version', SCHEMA_VERSION);
    return;
  }
  while (version < SCHEMA_VERSION) {
    await migrations[version]?.();
    version++;
    await set('version', version);
  }
}

export const clearDb = (): Promise<void> => clear();
