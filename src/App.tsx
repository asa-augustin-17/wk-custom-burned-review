import { useCallback, useEffect, useRef, useState } from 'react';
import type { WkUser } from './api/endpoints';
import { WkApiError, WkClient } from './api/client';
import { getUser } from './api/endpoints';
import { applyOutcome, isGraduated, selectSession, statsFor, type StatsMap } from './logic/scheduler';
import { clearSyncCache, getCacheOwner, loadStats, saveStats, setCacheOwner } from './store/db';
import { applyTheme, loadSettings, loadToken, saveSettings, type Settings as SettingsT, type Theme } from './store/settings';
import { useSync } from './sync/useSync';
import { Settings } from './ui/Settings';
import { Guide } from './ui/Guide';
import { Dashboard } from './ui/Dashboard';
import { ItemDetail } from './ui/ItemDetail';
import { DEFAULT_LIST_PREFS, type ListPrefs } from './ui/ItemList';
import { Quiz, type SessionResult } from './ui/Quiz';
import { SessionEnd } from './ui/SessionEnd';

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<Theme, string> = { system: 'match system', light: 'light', dark: 'dark' };
const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };

type View =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'guide' }
  | { name: 'item'; id: number }
  | { name: 'quiz'; ids: number[] }
  | { name: 'end'; result: SessionResult; graduatedIds: number[] };

/** Drops cached WK data if it belongs to a different account than this token. */
async function claimCache(username: string): Promise<boolean> {
  const owner = await getCacheOwner();
  if (owner === username) return false;
  if (owner) await clearSyncCache();
  await setCacheOwner(username);
  return !!owner;
}

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [settings, setSettings] = useState<SettingsT>(() => loadSettings());
  const [user, setUser] = useState<WkUser | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [view, setView] = useState<View>(() => (loadToken() ? { name: 'home' } : { name: 'settings' }));
  const [stats, setStats] = useState<StatsMap>({});
  const [listPrefs, setListPrefs] = useState<ListPrefs>(DEFAULT_LIST_PREFS);
  const homeScroll = useRef(0);
  const sync = useSync(token, settings, cacheReady);

  const statsRef = useRef(stats);
  const graduatedThisSession = useRef<number[]>([]);

  useEffect(() => {
    void loadStats().then((s) => {
      statsRef.current = s;
      setStats(s);
    });
  }, []);

  const startReview = useCallback(() => {
    const ids = sync.state?.targetIds ?? [];
    if (!ids.length) return;
    graduatedThisSession.current = [];
    setView({ name: 'quiz', ids: selectSession(ids, statsRef.current, settings.sessionSize) });
    window.scrollTo(0, 0);
  }, [sync.state, settings.sessionSize]);

  /** Records a completed item immediately, so closing the tab mid-session keeps finished items. */
  const onItemDone = useCallback(
    (id: number, passed: boolean) => {
      const prev = statsFor(statsRef.current, id);
      const next = applyOutcome(prev, passed, new Date());
      const threshold = settings.graduationThreshold;
      if (!isGraduated(prev, threshold) && isGraduated(next, threshold)) graduatedThisSession.current.push(id);
      const map = { ...statsRef.current, [id]: next };
      statsRef.current = map;
      setStats(map);
      void saveStats(map);
    },
    [settings.graduationThreshold],
  );

  const leaveQuizOk = () =>
    view.name !== 'quiz' || window.confirm('Leave this session? Items you haven’t finished won’t be counted.');

  const openItem = useCallback((id: number) => {
    homeScroll.current = window.scrollY;
    setView({ name: 'item', id });
    window.scrollTo(0, 0);
  }, []);

  const goHome = useCallback(() => {
    setView({ name: 'home' });
    requestAnimationFrame(() => window.scrollTo(0, homeScroll.current));
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  // Re-validate a stored token on load so the header shows the username.
  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    getUser(new WkClient({ token, maxRetries: 1 }))
      .then((u) => !cancelled && setUser(u))
      .catch((e: unknown) => {
        if (cancelled) return;
        setUserError(e instanceof WkApiError && e.status === 401 ? 'Stored token was rejected. Update it in Settings.' : String((e as Error).message));
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void claimCache(user.username).then(async (cleared) => {
      if (cancelled) return;
      if (cleared) await sync.reload();
      setCacheReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user, sync.reload]);

  const updateSettings = (s: SettingsT) => {
    setSettings(s);
    saveSettings(s);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="tag-mark" lang="ja">復習</span> WaniKani Burned Items Review
        </h1>
        <nav>
          {user && <span className="username">{user.username}</span>}
          <button
            className="theme-toggle"
            onClick={() => updateSettings({ ...settings, theme: NEXT_THEME[settings.theme] })}
            title={`Theme: ${THEME_LABEL[settings.theme]} (click to change)`}
            aria-label={`Theme: ${THEME_LABEL[settings.theme]}. Switch to ${THEME_LABEL[NEXT_THEME[settings.theme]]}`}
          >
            {THEME_ICON[settings.theme]}
          </button>
          <button
            className={view.name !== 'settings' && view.name !== 'guide' ? 'active' : ''}
            onClick={() => leaveQuizOk() && goHome()}
            disabled={!token}
          >
            Home
          </button>
          <button className={view.name === 'guide' ? 'active' : ''} onClick={() => leaveQuizOk() && setView({ name: 'guide' })}>
            Guide
          </button>
          <button className={view.name === 'settings' ? 'active' : ''} onClick={() => leaveQuizOk() && setView({ name: 'settings' })}>
            Settings
          </button>
        </nav>
      </header>

      <main>
        {view.name === 'guide' ? (
          <Guide tag={settings.tag} threshold={settings.graduationThreshold} />
        ) : view.name === 'settings' || !token ? (
          <Settings
            onOpenGuide={() => setView({ name: 'guide' })}
            token={token}
            stats={stats}
            onStatsImported={(s) => {
              statsRef.current = s;
              setStats(s);
            }}
            settings={settings}
            onSettingsChange={updateSettings}
            onTokenValidated={(t, u) => {
              setToken(t);
              setUser(u);
              setUserError(null);
            }}
            onCleared={() => {
              setToken(null);
              setUser(null);
              setCacheReady(false);
              setSettings(loadSettings());
              setStats({});
              statsRef.current = {};
              void sync.reload();
            }}
          />
        ) : userError ? (
          <section className="card">
            <p className="error">{userError}</p>
          </section>
        ) : view.name === 'quiz' && sync.state ? (
          <Quiz
            sessionIds={view.ids}
            subjects={sync.state.subjects}
            studyMaterials={sync.state.studyMaterials}
            onItemDone={onItemDone}
            onFinish={(result) => setView({ name: 'end', result, graduatedIds: [...graduatedThisSession.current] })}
          />
        ) : view.name === 'end' && sync.state ? (
          <SessionEnd
            result={view.result}
            graduatedIds={view.graduatedIds}
            subjects={sync.state.subjects}
            studyMaterials={sync.state.studyMaterials}
            tag={settings.tag}
            token={token}
            onUntagged={() => void sync.reload()}
            onDone={goHome}
            onOpen={openItem}
          />
        ) : view.name === 'item' && sync.state?.subjects[view.id] ? (
          <ItemDetail
            subject={sync.state.subjects[view.id]!}
            studyMaterial={sync.state.studyMaterials[view.id]}
            stats={stats}
            graduationThreshold={settings.graduationThreshold}
            inReviewSet={sync.state.targetIds.includes(view.id)}
            tag={settings.tag}
            token={token}
            onUntagged={() => void sync.reload()}
            onBack={goHome}
          />
        ) : (
          <Dashboard
            sync={sync}
            stats={stats}
            settings={settings}
            listPrefs={listPrefs}
            onListPrefsChange={setListPrefs}
            onOpen={openItem}
            onStart={startReview}
          />
        )}
      </main>
    </div>
  );
}
