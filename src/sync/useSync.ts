import { useCallback, useEffect, useRef, useState } from 'react';
import { WkClient } from '../api/client';
import { idbSyncStore, type SyncState } from '../store/db';
import type { Settings } from '../store/settings';
import { isSyncDue, runSync, type SyncSummary } from './sync';

export interface UseSync {
  state: SyncState | null;
  syncing: boolean;
  progress: string | null;
  summary: SyncSummary | null;
  error: string | null;
  sync: () => Promise<void>;
  reload: () => Promise<void>;
}

/** Loads the cached sync state and runs sync on demand, or automatically when `ready` and stale. */
export function useSync(token: string | null, settings: Settings, ready: boolean): UseSync {
  const [state, setState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const autoChecked = useRef(false);

  const reload = useCallback(async () => setState(await idbSyncStore.load()), []);

  const sync = useCallback(async () => {
    if (!token || running.current) return;
    running.current = true;
    setSyncing(true);
    setError(null);
    try {
      const client = new WkClient({ token });
      const s = await runSync(client, idbSyncStore, { tag: settings.tag, searchMeaningNotes: settings.searchMeaningNotes }, setProgress);
      setSummary(s);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setSyncing(false);
      setProgress(null);
    }
  }, [token, settings.tag, settings.searchMeaningNotes, reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-sync once per app load when the last sync is over an hour old.
  useEffect(() => {
    if (!ready || !state || autoChecked.current) return;
    autoChecked.current = true;
    if (isSyncDue(state.lastSyncedAt, new Date())) void sync();
  }, [ready, state, sync]);

  return { state, syncing, progress, summary, error, sync, reload };
}
