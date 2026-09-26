// Token and settings live in localStorage (spec §7).

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  tag: string;
  searchMeaningNotes: boolean;
  sessionSize: number;
  graduationThreshold: number;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  tag: '復習',
  searchMeaningNotes: false,
  sessionSize: 20,
  graduationThreshold: 5,
  theme: 'system',
};

const TOKEN_KEY = 'wkb.token';
const SETTINGS_KEY = 'wkb.settings';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const loadToken = (): string | null => safeGet(TOKEN_KEY);
export const saveToken = (token: string | null): void => safeSet(TOKEN_KEY, token);

export function clampSessionSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.sessionSize;
  return Math.min(100, Math.max(5, Math.round(n)));
}

export function loadSettings(): Settings {
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Rebuild from known keys so removed settings don't linger.
    return {
      searchMeaningNotes: !!parsed.searchMeaningNotes,
      theme: parsed.theme,
      tag: parsed.tag.trim() || DEFAULT_SETTINGS.tag,
      sessionSize: clampSessionSize(parsed.sessionSize),
      graduationThreshold: Math.max(1, Math.round(parsed.graduationThreshold) || DEFAULT_SETTINGS.graduationThreshold),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const saveSettings = (s: Settings): void => safeSet(SETTINGS_KEY, JSON.stringify(s));

export function clearLocalStorage(): void {
  safeSet(TOKEN_KEY, null);
  safeSet(SETTINGS_KEY, null);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
