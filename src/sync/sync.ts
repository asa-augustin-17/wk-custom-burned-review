// Sync flow (spec §5.2).
import type { WkClient } from '../api/client';
import { getAssignments, getStudyMaterials, getSubjects, isBurned, type SubjectType } from '../api/endpoints';
import type { AssignmentStatus, CachedSubject, StudyMaterialMap, SyncState, SyncStore } from '../store/db';
import { hasTag } from '../logic/tag';

export const SUBJECT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTO_SYNC_AFTER_MS = 60 * 60 * 1000;

export interface SyncOptions {
  tag: string;
  searchMeaningNotes: boolean;
}

export interface SyncSummary {
  fullSync: boolean;
  studyMaterialsFetched: number;
  taggedCount: number;
  targetCount: number;
  taggedNotBurnedIds: number[];
  subjectsFetched: number;
  requests: number;
  finishedAt: string;
}

export type ProgressFn = (message: string) => void;

/** Subject IDs tagged in the cached study materials, in ascending order. Radicals are out of scope. */
export function taggedSubjectIds(materials: StudyMaterialMap, opts: SyncOptions): number[] {
  return Object.values(materials)
    .filter((sm) => sm.subject_type !== 'radical' && hasTag(sm, opts.tag, opts.searchMeaningNotes))
    .map((sm) => sm.subject_id)
    .sort((a, b) => a - b);
}

export function isSyncDue(lastSyncedAt: string | null, now: Date): boolean {
  return !lastSyncedAt || now.getTime() - new Date(lastSyncedAt).getTime() > AUTO_SYNC_AFTER_MS;
}

export async function runSync(
  client: WkClient,
  store: SyncStore,
  opts: SyncOptions,
  onProgress: ProgressFn = () => {},
  now: () => Date = () => new Date(),
): Promise<SyncSummary> {
  const startedAt = now().toISOString();
  const requestsBefore = client.requestCount;
  const prev = await store.load();
  const fullSync = !prev.lastSyncedAt;

  // 1. Study materials (full first time, incremental afterwards).
  onProgress(fullSync ? 'Fetching all study materials…' : 'Fetching updated study materials…');
  const sms = await getStudyMaterials(client, prev.lastSyncedAt, (page, fetched, total) =>
    onProgress(`Fetching study materials… page ${page} (${fetched}/${total})`),
  );
  const studyMaterials: StudyMaterialMap = { ...prev.studyMaterials };
  for (const r of sms) studyMaterials[r.data.subject_id] = { ...r.data, id: r.id };

  // 2. Tagged set.
  const tagged = taggedSubjectIds(studyMaterials, opts);

  // 3. Assignments for the tagged set. Burned = currently at the Burned SRS stage and not hidden.
  //    (Not the burned=true filter: WK keeps burned_at after a resurrection.)
  const assignments: Record<number, AssignmentStatus> = {};
  const burned = new Set<number>();
  if (tagged.length) {
    const fetched = await getAssignments(client, tagged, (done, total) =>
      onProgress(`Fetching assignments… batch ${done}/${total}`),
    );
    for (const { data: a } of fetched) {
      const { srs_stage, burned_at, resurrected_at, hidden } = a;
      assignments[a.subject_id] = { srs_stage, burned_at, resurrected_at, hidden };
      if (!hidden && isBurned(a)) burned.add(a.subject_id);
    }
  }
  const targetIds = tagged.filter((id) => burned.has(id));
  const taggedNotBurnedIds = tagged.filter((id) => !burned.has(id));

  // 4. Subjects: missing or older than 30 days. Fetched for every tagged item so the
  //    tagged-but-not-burned list can show characters too.
  const subjects = { ...prev.subjects };
  const cutoff = now().getTime() - SUBJECT_MAX_AGE_MS;
  const stale = tagged.filter((id) => {
    const s = subjects[id];
    return !s || new Date(s.fetchedAt).getTime() < cutoff;
  });
  if (stale.length) {
    const fetched = await getSubjects(client, stale, (done, total) => onProgress(`Fetching subjects… batch ${done}/${total}`));
    const fetchedAt = now().toISOString();
    for (const r of fetched) {
      const cached: CachedSubject = { id: r.id, type: r.object as SubjectType, fetchedAt, data: r.data };
      subjects[r.id] = cached;
    }
  }

  // 5. Persist, with lastSyncedAt = when this sync started.
  const next: SyncState = { studyMaterials, subjects, targetIds, taggedNotBurnedIds, assignments, lastSyncedAt: startedAt };
  await store.save(next);
  onProgress('Sync complete.');

  return {
    fullSync,
    studyMaterialsFetched: sms.length,
    taggedCount: tagged.length,
    targetCount: targetIds.length,
    taggedNotBurnedIds,
    subjectsFetched: stale.length,
    requests: client.requestCount - requestsBefore,
    finishedAt: now().toISOString(),
  };
}
