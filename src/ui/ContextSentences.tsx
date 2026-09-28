import type { Subject } from '../api/endpoints';

/** WK's context sentences for vocabulary: Japanese first, English below. Renders nothing for kanji. */
export function ContextSentences({ subject, className = 'card' }: { subject: Subject; className?: string }) {
  const sentences = subject.context_sentences ?? [];
  if (!sentences.length) return null;
  return (
    <section className={className}>
      <h2 className="section-title">Context</h2>
      <ul className="context-list">
        {sentences.map((s, i) => (
          <li key={i}>
            <p className="context-ja" lang="ja">
              {s.ja}
            </p>
            <p className="context-en">{s.en}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
