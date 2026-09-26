import { useEffect } from 'react';
import { TYPE_LABEL } from '../logic/subject';
import { isGraduated, statsFor, type StatsMap } from '../logic/scheduler';
import type { CachedStudyMaterial, CachedSubject } from '../store/db';
import { SubjectGlyph } from './SubjectGlyph';
import { SubjectInfo } from './SubjectInfo';
import { UntagButton } from './UntagButton';

interface Props {
  subject: CachedSubject;
  studyMaterial: CachedStudyMaterial | undefined;
  stats: StatsMap;
  graduationThreshold: number;
  /** Whether the item is currently in the review set (tagged and burned). */
  inReviewSet: boolean;
  tag: string;
  token: string;
  onUntagged: () => void;
  onBack: () => void;
}

export function ItemDetail({
  subject,
  studyMaterial,
  stats,
  graduationThreshold,
  inReviewSet,
  tag,
  token,
  onUntagged,
  onBack,
}: Props) {
  const d = subject.data;
  const st = statsFor(stats, subject.id);

  useEffect(() => {
    // Esc goes back, unless it's closing the untag dialog.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="detail">
      <button className="back" onClick={onBack}>
        ← Back to list
      </button>

      <section className={`hero ${subject.type}`}>
        <SubjectGlyph subject={subject} className="hero-glyph" />
        <div className="hero-meta">
          {TYPE_LABEL[subject.type]} · Level {d.level}
        </div>
      </section>

      <SubjectInfo subject={subject} studyMaterial={studyMaterial} />

      <section className="card">
        <h3>Your review stats</h3>
        <p>
          Streak <strong>{st.streak}</strong> / {graduationThreshold}
          {isGraduated(st, graduationThreshold) && ' · 🎓 graduation candidate'}
        </p>
        <p className="muted small">
          Reviewed {st.timesReviewed}× · {st.timesCorrect} correct · {st.timesIncorrect} incorrect · last{' '}
          {st.lastReviewedAt ? new Date(st.lastReviewedAt).toLocaleString() : 'never'}
        </p>
        {!inReviewSet && <p className="muted small">Not in your review set (the tag was removed, or the item isn’t burned).</p>}
        {inReviewSet && isGraduated(st, graduationThreshold) && studyMaterial && (
          <UntagButton studyMaterial={studyMaterial} tag={tag} token={token} onUntagged={onUntagged} />
        )}
        <p>
          <a href={d.document_url} target="_blank" rel="noreferrer">
            Open on WaniKani ↗
          </a>
        </p>
      </section>
    </div>
  );
}
