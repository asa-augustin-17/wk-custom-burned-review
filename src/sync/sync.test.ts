import { describe, expect, it } from 'vitest';
import { WkClient } from '../api/client';
import type { SyncState, SyncStore } from '../store/db';
import { isSyncDue, runSync } from './sync';

const col = (data: unknown[]) => ({ object: 'collection', pages: { next_url: null }, total_count: data.length, data });
const sm = (id: number, subject_id: number, reading_note: string | null, hidden = false, subject_type = 'kanji') => ({
  id,
  object: 'study_material',
  data: { subject_id, subject_type, reading_note, meaning_note: null, meaning_synonyms: [], hidden },
});
const assignment = (subject_id: number, srs_stage: number, hidden = false, resurrected_at: string | null = null) => ({
  id: subject_id + 1000,
  object: 'assignment',
  data: { subject_id, subject_type: 'kanji', burned_at: '2024-01-01T00:00:00Z', resurrected_at, srs_stage, hidden },
});
const subject = (id: number) => ({
  id,
  object: 'kanji',
  data: { characters: `k${id}`, meanings: [], auxiliary_meanings: [], readings: [], meaning_mnemonic: '', document_url: '', level: 1 },
});

function memoryStore(): SyncStore & { state: SyncState | null } {
  return {
    state: null,
    async load() {
      return this.state ?? { studyMaterials: {}, subjects: {}, targetIds: [], taggedNotBurnedIds: [], assignments: {}, lastSyncedAt: null };
    },
    async save(s) {
      this.state = structuredClone(s);
    },
  };
}

function fakeApi(routes: {
  studyMaterials: (url: URL) => unknown[];
  burnedIds: number[];
  hiddenAssignmentIds?: number[];
  resurrectedIds?: number[];
}) {
  const urls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url.pathname + url.search);
    let body: unknown;
    if (url.pathname.endsWith('/study_materials')) body = col(routes.studyMaterials(url));
    else if (url.pathname.endsWith('/assignments')) {
      const ids = url.searchParams.get('subject_ids')!.split(',').map(Number);
      expect(url.searchParams.has('burned')).toBe(false);
      body = col(
        ids.map((i) =>
          routes.resurrectedIds?.includes(i)
            ? assignment(i, 2, false, '2025-01-01T00:00:00Z') // WK keeps burned_at after resurrection
            : assignment(i, routes.burnedIds.includes(i) ? 9 : 7, routes.hiddenAssignmentIds?.includes(i)),
        ),
      );
    } else if (url.pathname.endsWith('/subjects')) {
      body = col(url.searchParams.get('ids')!.split(',').map((i) => subject(Number(i))));
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fetchImpl, urls };
}

const clientFor = (fetchImpl: typeof fetch) => new WkClient({ token: 't', fetchImpl, minIntervalMs: 0, sleep: async () => {} });
const opts = { tag: '復習', searchMeaningNotes: false };

describe('runSync', () => {
  it('computes target and tagged-but-not-burned sets', async () => {
    const api = fakeApi({
      studyMaterials: () => [sm(1, 10, '復習'), sm(2, 20, '復習 too'), sm(3, 30, 'nothing'), sm(4, 40, '復習', true), sm(5, 50, '復習')],
      burnedIds: [10, 30, 40, 50],
      hiddenAssignmentIds: [50],
    });
    const store = memoryStore();
    const s = await runSync(clientFor(api.fetchImpl), store, opts, undefined, () => new Date('2025-01-01T00:00:00Z'));
    expect(s.fullSync).toBe(true);
    expect(s.taggedCount).toBe(3); // 10, 20, 50 (40 is a hidden study material)
    expect(store.state!.targetIds).toEqual([10]);
    expect(store.state!.taggedNotBurnedIds).toEqual([20, 50]);
    expect(Object.keys(store.state!.subjects).map(Number)).toEqual([10, 20, 50]);
    expect(store.state!.lastSyncedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(api.urls[0]).toBe('/v2/study_materials');
  });

  it('second sync is incremental, merges changes, and skips cached subjects', async () => {
    let second = false;
    const api = fakeApi({
      studyMaterials: (url) =>
        second
          ? (expect(url.searchParams.get('updated_after')).toBe('2025-01-01T00:00:00.000Z'), [sm(2, 20, 'tag removed'), sm(6, 60, '復習')])
          : [sm(1, 10, '復習'), sm(2, 20, '復習')],
      burnedIds: [10, 20, 60],
    });
    const store = memoryStore();
    const client = clientFor(api.fetchImpl);
    await runSync(client, store, opts, undefined, () => new Date('2025-01-01T00:00:00Z'));
    second = true;
    api.urls.length = 0;
    const s = await runSync(client, store, opts, undefined, () => new Date('2025-01-01T02:00:00Z'));
    expect(s.fullSync).toBe(false);
    expect(store.state!.targetIds).toEqual([10, 60]);
    expect(s.subjectsFetched).toBe(1);
    expect(api.urls.find((u) => u.startsWith('/v2/subjects'))).toBe('/v2/subjects?ids=60');
  });

  it('refetches subjects older than 30 days', async () => {
    const api = fakeApi({ studyMaterials: () => [sm(1, 10, '復習')], burnedIds: [10] });
    const store = memoryStore();
    const client = clientFor(api.fetchImpl);
    await runSync(client, store, opts, undefined, () => new Date('2025-01-01T00:00:00Z'));
    const s = await runSync(client, store, opts, undefined, () => new Date('2025-02-15T00:00:00Z'));
    expect(s.subjectsFetched).toBe(1);
  });

  it('ignores radicals even when tagged', async () => {
    const api = fakeApi({ studyMaterials: () => [sm(1, 10, '復習'), sm(2, 5, '復習', false, 'radical')], burnedIds: [5, 10] });
    const store = memoryStore();
    const s = await runSync(clientFor(api.fetchImpl), store, opts);
    expect(s.taggedCount).toBe(1);
    expect(store.state!.targetIds).toEqual([10]);
    expect(store.state!.taggedNotBurnedIds).toEqual([]);
  });

  it('treats resurrected items as not burned even though burned_at is still set', async () => {
    const api = fakeApi({ studyMaterials: () => [sm(1, 10, '復習'), sm(2, 20, '復習')], burnedIds: [10], resurrectedIds: [20] });
    const store = memoryStore();
    await runSync(clientFor(api.fetchImpl), store, opts);
    expect(store.state!.targetIds).toEqual([10]);
    expect(store.state!.taggedNotBurnedIds).toEqual([20]);
    expect(store.state!.assignments[20]).toMatchObject({ srs_stage: 2, resurrected_at: '2025-01-01T00:00:00Z' });
  });
});

describe('isSyncDue', () => {
  it('is due with no prior sync or after an hour', () => {
    const now = new Date('2025-01-01T12:00:00Z');
    expect(isSyncDue(null, now)).toBe(true);
    expect(isSyncDue('2025-01-01T11:30:00Z', now)).toBe(false);
    expect(isSyncDue('2025-01-01T10:59:00Z', now)).toBe(true);
  });
});
