import type { CachedSubject } from '../store/db';

export function SubjectGlyph({ subject, className = '' }: { subject: CachedSubject; className?: string }) {
  return (
    <span className={`glyph ${className}`} lang="ja">
      {subject.data.characters ?? subject.data.slug}
    </span>
  );
}
