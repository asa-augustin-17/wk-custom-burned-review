import { bucketLabel, bucketOrder, progressCounts, type StreakBucket } from '../logic/progress';
import type { StatsMap } from '../logic/scheduler';

interface Props {
  /** Target ids, already narrowed by the dashboard's type filter. */
  ids: number[];
  stats: StatsMap;
  threshold: number;
  /** e.g. "kanji" when a type filter is active. */
  scopeLabel: string | null;
  activeBucket: StreakBucket | null;
  onBucketClick: (b: StreakBucket) => void;
}

/** Gray for never reviewed, red for a miss, then green that gets stronger toward graduation. */
function bucketColor(b: StreakBucket, threshold: number): string {
  if (b === 'new') return 'color-mix(in srgb, var(--muted) 45%, var(--surface))';
  if (b === 'grad') return 'var(--ok)';
  if (b === 0) return 'var(--error)';
  const pct = threshold <= 1 ? 60 : Math.round(25 + (50 * (b - 1)) / Math.max(1, threshold - 2));
  return `color-mix(in srgb, var(--ok) ${pct}%, var(--surface))`;
}

function bucketSub(b: StreakBucket, threshold: number): string {
  if (b === 'new') return 'yet';
  if (b === 'grad') return `${threshold}+`;
  if (b === 0) return 'missed last';
  return `${threshold - b} to go`;
}

export function ProgressPanel({ ids, stats, threshold, scopeLabel, activeBucket, onBucketClick }: Props) {
  const { total, counts } = progressCounts(ids, stats, threshold);
  const order = bucketOrder(threshold);
  const max = Math.max(1, ...counts.values());
  const count = (b: StreakBucket) => counts.get(b) ?? 0;
  const reviewed = total - count('new');
  const grad = count('grad');
  const oneAway = threshold > 1 ? count(threshold - 1) : 0;

  return (
    <div className="progress-panel">
      <div className="row spread progress-head">
        <span className="progress-title">
          Progress to graduation{scopeLabel && <span className="muted"> · {scopeLabel}</span>}
        </span>
        <span className="muted small">
          Threshold: {threshold} pass{threshold === 1 ? '' : 'es'} on separate days
        </span>
      </div>

      <div className="progress-stack" role="img" aria-label={order.map((b) => `${bucketLabel(b)}: ${count(b)}`).join(', ')}>
        {order.map((b) =>
          count(b) ? (
            <div
              key={String(b)}
              title={`${bucketLabel(b)}: ${count(b)}`}
              style={{ width: `${(count(b) / Math.max(1, total)) * 100}%`, background: bucketColor(b, threshold) }}
            />
          ) : null,
        )}
      </div>
      <p className="muted small progress-summary">
        {reviewed} of {total} reviewed · {grad} graduated ({total ? Math.round((grad / total) * 100) : 0}%)
        {threshold > 1 && ` · ${oneAway} one pass away`}
      </p>

      <div className="progress-cols" role="group" aria-label="Filter items by streak">
        {order.map((b) => {
          const active = activeBucket === b;
          return (
            <button
              key={String(b)}
              className={`progress-col${active ? ' active' : ''}`}
              aria-pressed={active}
              title={active ? 'Show all streaks' : `Show only: ${bucketLabel(b).toLowerCase()}`}
              onClick={() => onBucketClick(b)}
            >
              <span className="progress-num">{count(b)}</span>
              <span className="progress-barwrap">
                <span
                  className="progress-bar"
                  style={{ height: `${Math.round((count(b) / max) * 100)}%`, background: bucketColor(b, threshold) }}
                />
              </span>
              <span className="progress-label">
                {bucketLabel(b)}
                <br />
                <span className="muted">{bucketSub(b, threshold)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted small progress-hint">Click a column to filter the Items list to that streak.</p>
    </div>
  );
}
