import { TYPE_LABEL } from '../logic/subject';
import type { AssignmentStatus } from '../store/db';
import type { UseSync } from '../sync/useSync';

function statusLabel(a: AssignmentStatus | undefined): string {
  if (!a) return 'Not started';
  if (a.hidden) return 'Hidden';
  return a.resurrected_at ? `Resurrected ${new Date(a.resurrected_at).toLocaleDateString()}` : 'Not yet burned';
}

function formatTime(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString();
}

export function SyncPanel({ sync }: { sync: UseSync }) {
  const { state, syncing, progress, summary, error } = sync;
  const tagged = state ? state.targetIds.length + state.taggedNotBurnedIds.length : 0;

  return (
    <section className="card">
      <div className="row spread">
        <h2>Sync</h2>
        <button className="primary" onClick={() => void sync.sync()} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {syncing && progress && <p className="progress" aria-live="polite">{progress}</p>}
      {error && <p className="error" role="alert">Sync failed: {error}</p>}

      <p className="muted small">Last synced: {formatTime(state?.lastSyncedAt ?? null)}</p>

      {summary && (
        <p className="muted small">
          {summary.fullSync ? 'Full sync' : 'Incremental sync'}: {summary.requests} API request{summary.requests === 1 ? '' : 's'},{' '}
          {summary.studyMaterialsFetched} study material{summary.studyMaterialsFetched === 1 ? '' : 's'} fetched,{' '}
          {summary.subjectsFetched} subject{summary.subjectsFetched === 1 ? '' : 's'} fetched.
        </p>
      )}

      {state?.lastSyncedAt && (
        <>
          <div className="stats-row">
            <div className="stat">
              <span className="stat-value">{tagged}</span>
              <span className="stat-label">tagged</span>
            </div>
            <div className="stat">
              <span className="stat-value">{state.targetIds.length}</span>
              <span className="stat-label">tagged &amp; burned</span>
            </div>
            <div className="stat">
              <span className="stat-value">{state.taggedNotBurnedIds.length}</span>
              <span className="stat-label">tagged, not burned</span>
            </div>
          </div>

          {state.taggedNotBurnedIds.length > 0 && (
            <details>
              <summary>Tagged but not burned ({state.taggedNotBurnedIds.length})</summary>
              <ul className="plain-list">
                {state.taggedNotBurnedIds.map((id) => {
                  const s = state.subjects[id];
                  return (
                    <li key={id}>
                      {s ? (
                        <>
                          <span className={`chip ${s.type}`}>{s.data.characters ?? s.data.slug}</span>{' '}
                          <span className="muted small">{TYPE_LABEL[s.type]}</span>{' '}
                          {s.data.meanings.find((m) => m.primary)?.meaning}{' '}
                          <span className="status-pill">{statusLabel(state.assignments[id])}</span>{' '}
                          <a href={s.data.document_url} target="_blank" rel="noreferrer">
                            WK page
                          </a>
                        </>
                      ) : (
                        <span className="muted">Subject {id}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
