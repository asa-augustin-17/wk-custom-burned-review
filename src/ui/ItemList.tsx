import { useMemo } from 'react';
import type { SubjectType } from '../api/endpoints';
import { primaryMeaning, primaryReading } from '../logic/subject';
import { isGraduated, statsFor, type StatsMap } from '../logic/scheduler';
import { bucketFor, bucketLabel, type StreakBucket } from '../logic/progress';
import type { SubjectMap } from '../store/db';
import { SubjectGlyph } from './SubjectGlyph';

export type TypeFilter = 'all' | 'kanji' | 'vocabulary';
export type SortKey = 'item' | 'meaning' | 'reading' | 'level' | 'streak' | 'lastReviewed';

export interface ListPrefs {
  type: TypeFilter;
  sort: SortKey;
  desc: boolean;
  query: string;
  /** Streak bucket chosen on the dashboard's progress chart, or null for all. */
  streak: StreakBucket | null;
}

export const DEFAULT_LIST_PREFS: ListPrefs = { type: 'all', sort: 'level', desc: false, query: '', streak: null };

const matchesType = (filter: TypeFilter, t: SubjectType) =>
  filter === 'all' || filter === t || (filter === 'vocabulary' && t === 'kana_vocabulary');

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'item', label: 'Item' },
  { key: 'meaning', label: 'Meaning' },
  { key: 'reading', label: 'Reading' },
  { key: 'level', label: 'Lvl', className: 'num col-optional' },
  { key: 'streak', label: 'Streak', className: 'num' },
  { key: 'lastReviewed', label: 'Last reviewed', className: 'col-optional' },
];

interface Props {
  ids: number[];
  subjects: SubjectMap;
  stats: StatsMap;
  graduationThreshold: number;
  prefs: ListPrefs;
  onPrefsChange: (p: ListPrefs) => void;
  onOpen: (id: number) => void;
}

export function ItemList({ ids, subjects, stats, graduationThreshold, prefs, onPrefsChange, onOpen }: Props) {
  const rows = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    const list = ids
      .map((id) => subjects[id])
      .filter((s) => !!s)
      .filter((s) => matchesType(prefs.type, s.type))
      .filter((s) => prefs.streak === null || bucketFor(stats, s.id, graduationThreshold) === prefs.streak)
      .map((s) => ({ s, meaning: primaryMeaning(s.data), reading: primaryReading(s.data), st: statsFor(stats, s.id) }))
      .filter(
        (r) =>
          !q ||
          r.meaning.toLowerCase().includes(q) ||
          (r.s.data.characters ?? '').includes(q) ||
          (r.reading ?? '').includes(q) ||
          r.s.data.meanings.some((m) => m.meaning.toLowerCase().includes(q)),
      );
    const cmp: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      item: (a, b) => (a.s.data.characters ?? '').localeCompare(b.s.data.characters ?? '', 'ja'),
      meaning: (a, b) => a.meaning.localeCompare(b.meaning),
      reading: (a, b) => (a.reading ?? '').localeCompare(b.reading ?? '', 'ja'),
      level: (a, b) => a.s.data.level - b.s.data.level,
      streak: (a, b) => a.st.streak - b.st.streak,
      lastReviewed: (a, b) => (a.st.lastReviewedAt ?? '').localeCompare(b.st.lastReviewedAt ?? ''),
    };
    const dir = prefs.desc ? -1 : 1;
    return list.sort((a, b) => dir * cmp[prefs.sort](a, b) || a.s.id - b.s.id);
  }, [ids, subjects, stats, prefs, graduationThreshold]);

  const set = (patch: Partial<ListPrefs>) => onPrefsChange({ ...prefs, ...patch });

  return (
    <section className="card">
      <div className="row spread">
        <h2>Items</h2>
        <span className="row list-meta">
          {prefs.streak !== null && (
            <button className="filter-chip" onClick={() => set({ streak: null })} title="Clear streak filter">
              {bucketLabel(prefs.streak)} ✕
            </button>
          )}
          <span className="muted small">
            {rows.length} of {ids.length}
          </span>
        </span>
      </div>
      <div className="row list-controls">
        <input
          type="search"
          placeholder="Search meaning, reading, characters"
          value={prefs.query}
          onChange={(e) => set({ query: e.target.value })}
          aria-label="Search items"
        />
        <select value={prefs.type} onChange={(e) => set({ type: e.target.value as TypeFilter })} aria-label="Filter by type">
          <option value="all">All types</option>
          <option value="kanji">Kanji</option>
          <option value="vocabulary">Vocabulary</option>
        </select>
        <select value={prefs.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} aria-label="Sort by">
          <option value="item">Item</option>
          <option value="meaning">Meaning</option>
          <option value="reading">Reading</option>
          <option value="level">Level</option>
          <option value="streak">Streak</option>
          <option value="lastReviewed">Last reviewed</option>
        </select>
        <button onClick={() => set({ desc: !prefs.desc })} aria-label="Toggle sort direction" title="Toggle sort direction">
          {prefs.desc ? '↓ Desc' : '↑ Asc'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No items match.</p>
      ) : (
        <div className="table-wrap">
          <table className="items">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = prefs.sort === c.key;
                  return (
                    <th
                      key={c.key}
                      className={c.className}
                      aria-sort={active ? (prefs.desc ? 'descending' : 'ascending') : 'none'}
                    >
                      <button
                        className={`th-sort${active ? ' active' : ''}`}
                        onClick={() => set(active ? { desc: !prefs.desc } : { sort: c.key, desc: false })}
                        title={`Sort by ${c.label.toLowerCase()}`}
                      >
                        {c.label}
                        <span className="sort-arrow" aria-hidden="true">
                          {active ? (prefs.desc ? '▼' : '▲') : ''}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, meaning, reading, st }) => (
                <tr
                  key={s.id}
                  tabIndex={0}
                  onClick={() => onOpen(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(s.id)}
                >
                  <td>
                    <span className={`chip ${s.type}`}>
                      <SubjectGlyph subject={s} />
                    </span>
                  </td>
                  <td>{meaning}</td>
                  <td lang="ja">{reading ?? <span className="muted">—</span>}</td>
                  <td className="num col-optional">{s.data.level}</td>
                  <td className="num">
                    {st.streak}
                    {isGraduated(st, graduationThreshold) && <span title="Graduation candidate"> 🎓</span>}
                  </td>
                  <td className="muted small col-optional">
                    {st.lastReviewedAt ? new Date(st.lastReviewedAt).toLocaleDateString() : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
