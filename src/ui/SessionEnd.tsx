import { useEffect } from 'react';
import { primaryMeaning } from '../logic/subject';
import type { StudyMaterialMap, SubjectMap } from '../store/db';
import type { SessionResult } from './Quiz';
import { UntagButton } from './UntagButton';

interface Props {
  result: SessionResult;
  graduatedIds: number[];
  subjects: SubjectMap;
  studyMaterials: StudyMaterialMap;
  tag: string;
  token: string;
  onUntagged: () => void;
  onDone: () => void;
  onOpen: (id: number) => void;
}

function ItemChips({ ids, subjects, onOpen }: { ids: number[]; subjects: SubjectMap; onOpen: (id: number) => void }) {
  return (
    <ul className="plain-list">
      {ids.map((id) => {
        const s = subjects[id];
        if (!s) return null;
        return (
          <li key={id}>
            <button className="item-link" onClick={() => onOpen(id)}>
              <span className={`chip ${s.type}`} lang="ja">
                {s.data.characters ?? s.data.slug}
              </span>{' '}
              {primaryMeaning(s.data)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SessionEnd({ result, graduatedIds, subjects, studyMaterials, tag, token, onUntagged, onDone, onOpen }: Props) {
  const answered = result.answersCorrect + result.answersIncorrect;
  const accuracy = answered ? Math.round((result.answersCorrect / answered) * 100) : 0;
  const passed = result.finished.filter((f) => f.passed).length;
  const missedIds = result.finished.filter((f) => !f.passed).map((f) => f.subjectId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !document.querySelector('dialog[open]')) onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  return (
    <div className="session-end">
      <section className="card">
        <h2>Session complete</h2>
        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{accuracy}%</span>
            <span className="stat-label">answers correct</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {passed} / {result.finished.length}
            </span>
            <span className="stat-label">items passed</span>
          </div>
          <div className="stat">
            <span className="stat-value">{graduatedIds.length}</span>
            <span className="stat-label">newly graduated</span>
          </div>
        </div>
        {result.unfinishedIds.length > 0 && (
          <p className="muted small">{result.unfinishedIds.length} item(s) weren’t finished and weren’t counted.</p>
        )}
        <button className="primary" onClick={onDone} autoFocus>
          Back to dashboard
        </button>{' '}
        <span className="muted small">
          or press <kbd>Enter</kbd>
        </span>
      </section>

      {graduatedIds.length > 0 && (
        <section className="card">
          <h2>🎓 Reached the graduation threshold</h2>
          <ul className="plain-list">
            {graduatedIds.map((id) => {
              const s = subjects[id];
              const sm = studyMaterials[id];
              if (!s) return null;
              return (
                <li key={id} className="graduated-row">
                  <button className="item-link" onClick={() => onOpen(id)}>
                    <span className={`chip ${s.type}`} lang="ja">
                      {s.data.characters ?? s.data.slug}
                    </span>{' '}
                    {primaryMeaning(s.data)}
                  </button>
                  {sm && <UntagButton studyMaterial={sm} tag={tag} token={token} onUntagged={onUntagged} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {missedIds.length > 0 && (
        <section className="card">
          <h2>Missed</h2>
          <ItemChips ids={missedIds} subjects={subjects} onOpen={onOpen} />
        </section>
      )}
    </div>
  );
}
