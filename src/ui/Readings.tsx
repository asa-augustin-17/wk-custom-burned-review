import type { SubjectReading } from '../api/endpoints';
import type { CachedSubject } from '../store/db';

const GROUPS = [
  { type: 'onyomi', label: "On'yomi" },
  { type: 'kunyomi', label: "Kun'yomi" },
  { type: 'nanori', label: 'Nanori' },
] as const;

function ReadingList({ readings }: { readings: SubjectReading[] }) {
  return (
    <span lang="ja">
      {readings.map((r, i) => (
        <span key={r.reading + i} className={r.accepted_answer ? '' : 'muted'}>
          {i > 0 && '、'}
          {r.primary ? <strong>{r.reading}</strong> : r.reading}
        </span>
      ))}
    </span>
  );
}

/**
 * Kanji readings grouped by type like WK's kanji pages (On'yomi / Kun'yomi, plus Nanori when
 * present); groups WK doesn't accept as answers are dimmed. Vocab readings are a single list.
 */
export function Readings({ subject }: { subject: CachedSubject }) {
  const readings = subject.data.readings ?? [];
  if (subject.type !== 'kanji') return <p className="readings-flat"><ReadingList readings={readings} /></p>;

  return (
    <div className="reading-groups">
      {GROUPS.map(({ type, label }) => {
        const group = readings.filter((r) => r.type === type);
        if (type === 'nanori' && group.length === 0) return null;
        const accepted = group.some((r) => r.accepted_answer);
        return (
          <div key={type} className={`reading-group${accepted ? '' : ' dim'}`}>
            <div className="reading-group-label">{label}</div>
            <div className="reading-group-values">{group.length ? <ReadingList readings={group} /> : 'None'}</div>
          </div>
        );
      })}
    </div>
  );
}
