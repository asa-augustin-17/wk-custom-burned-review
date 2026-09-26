import { useEffect, useRef, useState } from 'react';
import { WkApiError, WkClient } from '../api/client';
import { getUser, type WkUser } from '../api/endpoints';
import { buildExport, mergeStats, parseExport } from '../logic/statsio';
import type { StatsMap } from '../logic/scheduler';
import { clearDb, saveStats } from '../store/db';
import {
  clampSessionSize,
  clearLocalStorage,
  DEFAULT_SETTINGS,
  saveToken,
  type Settings as SettingsT,
  type Theme,
} from '../store/settings';

interface Props {
  token: string | null;
  settings: SettingsT;
  onSettingsChange: (s: SettingsT) => void;
  onTokenValidated: (token: string, user: WkUser) => void;
  onCleared: () => void;
  stats: StatsMap;
  onStatsImported: (stats: StatsMap) => void;
}

/**
 * Number input that keeps whatever is typed (including an empty box) and only validates on blur
 * or Enter, so typing a new number never fights a forced minimum.
 */
function NumberField({
  id,
  value,
  min,
  max,
  clamp,
  onCommit,
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  /** Maps any typed number to a valid one. */
  clamp: (n: number) => number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    const next = draft.trim() === '' || !Number.isFinite(n) ? value : clamp(n);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; username: string }
  | { kind: 'error'; message: string };

export function Settings({ token, settings, onSettingsChange, onTokenValidated, onCleared, stats, onStatsImported }: Props) {
  const [draftToken, setDraftToken] = useState(token ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmClear, setConfirmClear] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function exportStats() {
    const now = new Date();
    const blob = new Blob([JSON.stringify(buildExport(stats, now), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wanikani-burned-stats-${now.toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importStats(file: File) {
    const parsed = parseExport(await file.text());
    if (!parsed.ok) {
      setImportMsg({ ok: false, text: parsed.error });
      return;
    }
    const { stats: merged, added, updated } = mergeStats(stats, parsed.stats);
    await saveStats(merged);
    onStatsImported(merged);
    const skipped = parsed.skipped ? ` ${parsed.skipped} invalid entr${parsed.skipped === 1 ? 'y' : 'ies'} skipped.` : '';
    setImportMsg({ ok: true, text: `Imported: ${added} new, ${updated} updated, ${Object.keys(parsed.stats).length - added - updated} unchanged.${skipped}` });
  }

  const update = <K extends keyof SettingsT>(key: K, value: SettingsT[K]) =>
    onSettingsChange({ ...settings, [key]: value });

  async function validate() {
    const t = draftToken.trim();
    if (!t) {
      setStatus({ kind: 'error', message: 'Enter a token first.' });
      return;
    }
    setStatus({ kind: 'checking' });
    try {
      const user = await getUser(new WkClient({ token: t, maxRetries: 0 }));
      saveToken(t);
      setStatus({ kind: 'ok', username: user.username });
      onTokenValidated(t, user);
    } catch (e) {
      const message =
        e instanceof WkApiError && e.status === 401
          ? 'That token was rejected by WaniKani (401). Check that you copied the whole token and that it has not been revoked.'
          : e instanceof Error
            ? e.message
            : 'Validation failed.';
      setStatus({ kind: 'error', message });
    }
  }

  async function clearAll() {
    clearLocalStorage();
    await clearDb();
    setConfirmClear(false);
    setDraftToken('');
    setStatus({ kind: 'idle' });
    onCleared();
  }

  return (
    <div className="settings">
      {!token && (
        <section className="card empty-state">
          <h2>Welcome</h2>
          <p>
            This app finds your <strong>burned</strong> WaniKani items whose reading note contains{' '}
            <strong lang="ja">{settings.tag}</strong> and quizzes you on them. To start, paste a WaniKani API token below
            and press Validate.
          </p>
        </section>
      )}
      <section className="card">
        <h2>API token</h2>
        <p className="muted">
          Create a personal access token on your{' '}
          <a href="https://www.wanikani.com/settings/personal_access_tokens" target="_blank" rel="noreferrer">
            WaniKani API tokens page
          </a>
          . To use the “Remove tag” feature later, enable the <em>study_materials:update</em> permission.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void validate();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={draftToken}
            onChange={(e) => {
              setDraftToken(e.target.value);
              setStatus({ kind: 'idle' });
            }}
            aria-label="WaniKani API token"
          />
          <button type="submit" className="primary" disabled={status.kind === 'checking'}>
            {status.kind === 'checking' ? 'Validating…' : 'Validate'}
          </button>
        </form>
        {status.kind === 'ok' && <p className="ok">✓ Token valid. Signed in as <strong>{status.username}</strong>.</p>}
        {status.kind === 'error' && <p className="error" role="alert">{status.message}</p>}
        <p className="muted small">The token is stored only in this browser’s localStorage.</p>
      </section>

      <section className="card">
        <h2>Review settings</h2>
        <div className="field">
          <label htmlFor="tag">Reading tag string</label>
          <input
            id="tag"
            value={settings.tag}
            onChange={(e) => update('tag', e.target.value)}
            onBlur={() => !settings.tag.trim() && update('tag', DEFAULT_SETTINGS.tag)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.searchMeaningNotes}
            onChange={(e) => update('searchMeaningNotes', e.target.checked)}
          />
          Also search meaning notes
        </label>
        <div className="field">
          <label htmlFor="size">Session size (5–100)</label>
          <NumberField
            id="size"
            min={5}
            max={100}
            value={settings.sessionSize}
            clamp={clampSessionSize}
            onCommit={(n) => update('sessionSize', n)}
          />
        </div>
        <div className="field">
          <label htmlFor="grad">Graduation threshold (correct sessions on distinct days)</label>
          <NumberField
            id="grad"
            min={1}
            value={settings.graduationThreshold}
            clamp={(n) => Math.max(1, Math.round(n))}
            onCommit={(n) => update('graduationThreshold', n)}
          />
        </div>
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select id="theme" value={settings.theme} onChange={(e) => update('theme', e.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section className="card">
        <h2>Review history</h2>
        <p className="muted small">
          Your streaks and review counts live only in this browser. Export them to a file so they survive clearing browser
          data, and import that file to restore them. Importing merges: for each item, the more recent record wins.
        </p>
        <div className="row">
          <button onClick={exportStats} disabled={Object.keys(stats).length === 0}>
            Export stats ({Object.keys(stats).length} items)
          </button>
          <button onClick={() => fileRef.current?.click()}>Import stats…</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importStats(f);
            }}
          />
        </div>
        {importMsg && (
          <p className={importMsg.ok ? 'ok' : 'error'} role="status">
            {importMsg.text}
          </p>
        )}
      </section>

      <section className="card danger-zone">
        <h2>Local data</h2>
        {!confirmClear ? (
          <button className="danger" onClick={() => setConfirmClear(true)}>
            Clear all local data
          </button>
        ) : (
          <div className="row">
            <span>This deletes your token, settings, cached WaniKani data, and review stats. Continue?</span>
            <button className="danger" onClick={() => void clearAll()}>
              Yes, clear everything
            </button>
            <button onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        )}
      </section>
    </div>
  );
}
