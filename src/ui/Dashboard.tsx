import type { SubjectType } from '../api/endpoints';
import { isGraduated, type StatsMap } from '../logic/scheduler';
import type { Settings } from '../store/settings';
import type { UseSync } from '../sync/useSync';
import { ItemList, type ListPrefs } from './ItemList';
import { SyncPanel } from './SyncPanel';

interface Props {
  sync: UseSync;
  stats: StatsMap;
  settings: Settings;
  listPrefs: ListPrefs;
  onListPrefsChange: (p: ListPrefs) => void;
  onOpen: (id: number) => void;
  onStart: () => void;
}

export function Dashboard({ sync, stats, settings, listPrefs, onListPrefsChange, onOpen, onStart }: Props) {
  const state = sync.state;
  const ids = state?.targetIds ?? [];
  const byType: Record<SubjectType, number> = { radical: 0, kanji: 0, vocabulary: 0, kana_vocabulary: 0 };
  for (const id of ids) {
    const t = state?.subjects[id]?.type;
    if (t) byType[t]++;
  }
  const graduated = ids.filter((id) => isGraduated(stats[id], settings.graduationThreshold)).length;
  const nextSession = Math.min(settings.sessionSize, ids.length);
  const typeFilters = [
    { type: 'kanji', label: 'kanji', count: byType.kanji },
    { type: 'vocabulary', label: 'vocabulary', count: byType.vocabulary + byType.kana_vocabulary },
  ] as const;

  // Empty states.
  if (!state?.lastSyncedAt) {
    return (
      <>
        <SyncPanel sync={sync} />
        <section className="card empty-state">
          <h2>Getting your WaniKani data…</h2>
          <p className="muted">
            The first sync downloads your notes and burned items. It takes a few seconds; progress is shown above.
          </p>
        </section>
      </>
    );
  }
  if (ids.length === 0) {
    const tnb = state.taggedNotBurnedIds.length;
    return (
      <>
        <SyncPanel sync={sync} />
        <section className="card empty-state">
          <h2>No items to review</h2>
          <p>
            {tnb > 0
              ? `You have ${tnb} item${tnb === 1 ? '' : 's'} tagged ${settings.tag}, but none are burned right now (see the list above).`
              : `None of your burned items have ${settings.tag} in their reading note.`}
          </p>
          <p className="muted">
            Add <strong lang="ja">{settings.tag}</strong> to the reading note of a burned kanji or vocabulary item on
            WaniKani, then press <strong>Sync now</strong>.
          </p>
        </section>
      </>
    );
  }
  const allGraduated = graduated === ids.length;

  return (
    <>
      <SyncPanel sync={sync} />
      <section className="card">
        {allGraduated && (
          <p className="all-graduated">
            🎉 Every item has reached the graduation threshold. Remove the {settings.tag} tag from items you’re confident
            about (on each item’s page), or keep reviewing.
          </p>
        )}
        <div className="row spread">
          <h2>Review</h2>
          <button className="primary" disabled={ids.length === 0} onClick={onStart}>
            Start review
          </button>
        </div>
        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{ids.length}</span>
            <span className="stat-label">target items</span>
          </div>
          <div className="stat">
            <span className="stat-value">{nextSession}</span>
            <span className="stat-label">in next session</span>
          </div>
          <div className="stat">
            <span className="stat-value">{graduated}</span>
            <span className="stat-label">graduation candidates</span>
          </div>
        </div>
        <div className="type-counts" role="group" aria-label="Filter items by type">
          {typeFilters.map(({ type, label, count }) => {
            const active = listPrefs.type === type;
            return (
              <button
                key={type}
                className={`type-filter${active ? ' active' : ''}`}
                aria-pressed={active}
                title={active ? 'Show all types' : `Show only ${label}`}
                onClick={() => onListPrefsChange({ ...listPrefs, type: active ? 'all' : type })}
              >
                <span className={`chip ${type}`}>{count}</span> {label}
              </button>
            );
          })}
        </div>
      </section>

      {state && ids.length > 0 && (
        <ItemList
          ids={ids}
          subjects={state.subjects}
          stats={stats}
          graduationThreshold={settings.graduationThreshold}
          prefs={listPrefs}
          onPrefsChange={onListPrefsChange}
          onOpen={onOpen}
        />
      )}

    </>
  );
}
